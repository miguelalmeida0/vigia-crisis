#!/usr/bin/env node
import { stat } from 'node:fs/promises';
import { loadConfig } from '../apps/api/src/config/env.mjs';
import { AcquisitionStore } from '../apps/api/src/modules/acquisition/acquisition-store.mjs';

const PROVIDERS = ['firms', 'sentinel3', 'mtg', 'sentinel2', 'weather', 'reports'];
const requested = String(process.argv.slice(2).find((arg) => !arg.startsWith('--')) ?? 'all').toLowerCase();
const jsonMode = process.argv.includes('--json');
const strict = process.argv.includes('--strict');
if (requested !== 'all' && !PROVIDERS.includes(requested)) {
  console.error(`Unknown source "${requested}". Choose ${PROVIDERS.join(', ')}, or all.`);
  process.exit(2);
}

const config = loadConfig();
const explicitBaseUrl = process.env.VIGIA_BASE_URL ? String(process.env.VIGIA_BASE_URL).replace(/\/$/, '') : null;
const baseCandidates = explicitBaseUrl ? [explicitBaseUrl] : [...new Set([`http://${config.host}:${config.port}`, 'http://127.0.0.1:4177'])];
const timeoutMs = Math.max(1_000, Math.min(15_000, Number(process.env.VIGIA_DOCTOR_TIMEOUT_MS ?? 15_000)));
const selected = requested === 'all' ? PROVIDERS : [requested];

function safeError(error) {
  let value = String(error?.message ?? error ?? 'unknown_error');
  for (const secret of [config.firmsMapKey, process.env.VIGIA_CDSE_ACCESS_TOKEN, process.env.VIGIA_CDSE_PASSWORD]) {
    if (secret) value = value.replaceAll(secret, '<redacted>');
  }
  return value.slice(0, 480);
}

async function jsonRequest(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timer); }
}

async function probe(label, operation) {
  try { await operation(); return { state: 'REACHABLE', detail: label }; }
  catch (error) { return { state: 'UNREACHABLE', detail: safeError(error) }; }
}

function runtimeSource(runtime, id) {
  return runtime?.sources?.[id] ?? null;
}

function latestProduct(products, prefixes) {
  return products.filter((item) => prefixes.some((prefix) => String(item.sourceId).startsWith(prefix)))
    .sort((a, b) => Date.parse(b.receivedAt ?? 0) - Date.parse(a.receivedAt ?? 0))[0] ?? null;
}

function latestTimestamp(...values) {
  return values.flat().filter((value) => Number.isFinite(Date.parse(value)))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
}

function latestProductTimestamp(products, prefixes) {
  return latestTimestamp(products.filter((item) => prefixes.some((prefix) => String(item.sourceId).startsWith(prefix))).map((item) => item.sourceTimestamp));
}

function checkpoint(checkpoints, prefixes) {
  return checkpoints.filter((item) => prefixes.some((prefix) => String(item.sourceId).startsWith(prefix)))
    .sort((a, b) => Date.parse(b.lastAttemptAt ?? 0) - Date.parse(a.lastAttemptAt ?? 0))[0] ?? null;
}

function archive(product) {
  if (!product) return { state: 'EMPTY', productId: null, checksum: null, processingState: null };
  return { state: 'PRESENT', productId: product.id, checksum: product.checksumSha256?.slice(0, 16) ?? null, processingState: product.processingState, receivedAt: product.receivedAt };
}

function sourceIncident(source, cp) {
  const failures = Number(source?.consecutiveFailures ?? cp?.consecutiveFailures ?? 0);
  return failures >= 3 ? { state: 'OPEN', consecutiveFailures: failures, lastError: safeError(source?.error ?? cp?.lastError) } : null;
}

function activation(configured, state, setup) {
  if (!configured) return setup;
  if (state === 'current') return 'No operator action. Acquisition is authenticated/configured and current.';
  if (state === 'stale') return 'No credential change. Acquisition succeeded, but the newest upstream observation is outside its freshness window; wait for the next provider product.';
  return 'Configuration is present. Keep the source unavailable for current decisions, retry acquisition and inspect the error before changing credentials.';
}

async function fileState(directory) {
  if (!directory) return { configured: false, detail: 'No product directory configured.' };
  try { const info = await stat(directory); return { configured: info.isDirectory(), detail: info.isDirectory() ? directory : 'Configured path is not a directory.' }; }
  catch (error) { return { configured: false, detail: safeError(error) }; }
}

async function buildReports(runtime, acquisition) {
  const products = acquisition.products();
  const checkpoints = acquisition.status().checkpoints;
  const firmsProduct = latestProduct(products, ['firms:']);
  const firmsCheckpoint = checkpoint(checkpoints, ['firms:']);
  const reportProduct = latestProduct(products, ['ptdata:fires', 'fires']);
  const reportCheckpoint = checkpoint(checkpoints, ['ptdata:fires', 'fires']);
  const weatherProduct = latestProduct(products, ['ptdata:weather', 'weather']);
  const weatherCheckpoint = checkpoint(checkpoints, ['ptdata:weather', 'weather']);
  const s3Dir = await fileState(config.sentinel3FrpDir);
  const mtgDir = await fileState(config.mtgFrpDir);
  const cdseCredential = Boolean(config.cdseAccessToken || (config.cdseUsername && config.cdsePassword)),firmsConfigured=Boolean(config.firmsMapKey),s3Configured=Boolean(s3Dir.configured||config.sentinel3FrpJsonUrl||cdseCredential),mtgConfigured=Boolean(mtgDir.configured||config.mtgFrpJsonUrl);
  const firmsReachability = config.firmsMapKey
    ? await probe('NASA FIRMS map-key status endpoint', async () => {
      const status = await jsonRequest(`https://firms.modaps.eosdis.nasa.gov/mapserver/mapkey_status/?MAP_KEY=${encodeURIComponent(config.firmsMapKey)}`);
      if (!Number.isFinite(Number(status.transaction_limit))) throw new Error('map_key_status_schema_invalid');
    }) : { state: 'NOT_PROBED', detail: 'Credential required before provider probe.' };
  const s3Reachability = await probe('Copernicus Data Space Sentinel-3 FRP STAC collection', () => jsonRequest('https://stac.dataspace.copernicus.eu/v1/collections/sentinel-3-sl-2-frp-nrt'));
  const mtgReachability = await probe('EUMETSAT MTG FRP product catalogue', () => jsonRequest('https://api.eumetsat.int/data/browse/1.0.0/collections/EO:EUM:DAT:1156'));
  const s2Reachability = await probe('Earth Search Sentinel-2 L2A catalogue', () => jsonRequest('https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a'));
  const source = (id) => runtimeSource(runtime, id);
  return {
    firms: {
      source: 'NASA FIRMS · VIIRS NRT', configuration: firmsConfigured ? 'CONFIGURED' : 'NOT_CONFIGURED', auth: firmsConfigured ? 'PRESENT_REDACTED' : 'NASA_FIRMS_MAP_KEY_REQUIRED',
      providerReachability: firmsReachability, runtime: source('firms')?.state ?? 'RUNTIME_UNAVAILABLE', lastAcquisition: source('firms')?.lastSuccessAt ?? firmsCheckpoint?.lastSuccessfulPollAt ?? null,
      checkpoint: firmsCheckpoint ?? { state: 'NO_CHECKPOINT' }, rawArchive: archive(firmsProduct), latestObservation: latestTimestamp(source('firms')?.latestSourceObservation, source('firms')?.upstreamAt, firmsCheckpoint?.lastSourceObservationAt, latestProductTimestamp(products, ['firms:'])),
      parser: 'nasa-firms-area-csv-v1 · READY', error: safeError(source('firms')?.error ?? firmsCheckpoint?.lastError ?? (config.firmsMapKey ? '' : 'NASA_FIRMS_MAP_KEY is absent.')), sourceIncident: sourceIncident(source('firms'), firmsCheckpoint),
      activation: activation(firmsConfigured,source('firms')?.state,'Set NASA_FIRMS_MAP_KEY in the same shell that starts VIGIA; the next poll archives, hashes, normalizes, associates and persists automatically.')
    },
    sentinel3: {
      source: 'Copernicus Sentinel-3 SLSTR L2 FRP NRT', configuration: s3Configured ? 'CONFIGURED' : 'NOT_CONFIGURED', auth: cdseCredential ? 'PRESENT_REDACTED' : 'CDSE_CREDENTIAL_REQUIRED_FOR_DOWNLOAD',
      providerReachability: s3Reachability, runtime: source('sentinel3Pixels')?.state ?? 'RUNTIME_UNAVAILABLE', lastAcquisition: source('sentinel3Pixels')?.lastSuccessAt ?? source('sentinel3Pixels')?.fetchedAt ?? null,
      checkpoint: checkpoint(checkpoints, ['sentinel3:']) ?? { state: 'NO_CHECKPOINT' }, rawArchive: archive(latestProduct(products, ['sentinel3:'])), latestObservation: source('sentinel3Pixels')?.upstreamAt ?? null,
      parser: 'SL_2_FRP NetCDF parser · READY', error: safeError(source('sentinel3Pixels')?.error ?? (cdseCredential ? '' : 'Catalogue is public; product download requires Copernicus Data Space credentials.')), sourceIncident: sourceIncident(source('sentinel3Pixels')),
      activation: activation(s3Configured,source('sentinel3Pixels')?.state,'Set VIGIA_CDSE_USERNAME and VIGIA_CDSE_PASSWORD, or provide VIGIA_SENTINEL3_FRP_DIR / VIGIA_SENTINEL3_FRP_JSON_URL.')
    },
    mtg: {
      source: 'EUMETSAT / LSA SAF MTFRPPIXEL', configuration: mtgConfigured ? 'CONFIGURED' : 'NOT_CONFIGURED', auth: mtgConfigured ? 'UPSTREAM_CONFIGURED' : 'EUMETCAST_OR_LSA_SAF_ACCESS_REQUIRED',
      providerReachability: mtgReachability, runtime: source('mtgPixels')?.state ?? 'RUNTIME_UNAVAILABLE', lastAcquisition: source('mtgPixels')?.lastSuccessAt ?? source('mtgPixels')?.fetchedAt ?? null,
      checkpoint: checkpoint(checkpoints, ['mtg:']) ?? { state: 'NO_CHECKPOINT' }, rawArchive: archive(latestProduct(products, ['mtg:'])), latestObservation: source('mtgPixels')?.upstreamAt ?? null,
      parser: 'LSA-509 MTFRPPIXEL NetCDF parser · READY', error: safeError(source('mtgPixels')?.error ?? 'MTG raster context does not count as structured FRP point evidence.'), sourceIncident: sourceIncident(source('mtgPixels')),
      activation: activation(mtgConfigured,source('mtgPixels')?.state,'Feed registered EUMETCast/LSA SAF MTFRPPIXEL NetCDF files through VIGIA_MTG_FRP_DIR, or configure VIGIA_MTG_FRP_JSON_URL.')
    },
    sentinel2: {
      source: 'Sentinel-2 L2A native pixels', configuration: 'CONFIGURED_PUBLIC_STAC', auth: 'NOT_REQUIRED_FOR_CURRENT_EARTH_SEARCH_PATH', providerReachability: s2Reachability,
      runtime: 'ON_DEMAND', lastAcquisition: null, checkpoint: { state: 'ON_DEMAND_NO_GLOBAL_CURSOR' }, rawArchive: { state: 'SCENE_URL_AND_BINDING_PROOF', productId: null, checksum: null }, latestObservation: null,
      parser: 'native COG multispectral geospatial screen · READY', error: '', sourceIncident: null, activation: 'Active whenever a Prevent candidate is opened or a detector campaign is run.'
    },
    weather: runtimeOnly('IPMA observations via ptdata', source('weather'), weatherCheckpoint, weatherProduct),
    reports: runtimeOnly('ICNF SGIF fire reports via ptdata', source('fires'), reportCheckpoint, reportProduct)
  };
}

function runtimeOnly(label, source, cp, product) {
  return { source: label, configuration: 'CONFIGURED_PUBLIC_SOURCE', auth: 'NOT_REQUIRED', providerReachability: { state: source ? 'RUNTIME_OBSERVED' : 'RUNTIME_UNAVAILABLE', detail: source?.provider ?? label }, runtime: source?.state ?? 'RUNTIME_UNAVAILABLE', lastAcquisition: source?.lastSuccessAt ?? cp?.lastSuccessfulPollAt ?? null, checkpoint: cp ?? { state: 'NO_CHECKPOINT' }, rawArchive: archive(product), latestObservation: source?.upstreamAt ?? cp?.lastSourceObservationAt ?? null, parser: source?.parserState ?? 'NORMALIZER_READY', error: safeError(source?.error ?? cp?.lastError ?? ''), sourceIncident: sourceIncident(source, cp), activation: 'No operator credential required.' };
}

function line(label, value) { return `  ${label.padEnd(23)} ${value ?? 'NONE'}`; }
function printHuman(name, report) {
  console.log(`\n${name.toUpperCase()} · ${report.source}`);
  console.log(line('CONFIGURATION', report.configuration));
  console.log(line('AUTH', report.auth));
  console.log(line('PROVIDER REACHABILITY', `${report.providerReachability.state} · ${report.providerReachability.detail}`));
  console.log(line('RUNTIME', report.runtime));
  console.log(line('LAST ACQUISITION', report.lastAcquisition));
  console.log(line('CHECKPOINT', report.checkpoint.lastSuccessfulPollAt ?? report.checkpoint.state ?? 'PRESENT'));
  console.log(line('RAW ARCHIVE', `${report.rawArchive.state}${report.rawArchive.checksum ? ` · SHA ${report.rawArchive.checksum}` : ''}`));
  console.log(line('LATEST OBSERVATION', report.latestObservation));
  console.log(line('PARSER', report.parser));
  console.log(line('SOURCE INCIDENT', report.sourceIncident ? `OPEN · ${report.sourceIncident.consecutiveFailures} failures` : 'NONE'));
  console.log(line('ERROR', report.error || 'NONE'));
  console.log(line('ACTIVATION', report.activation));
}

const acquisition = new AcquisitionStore({ filePath: config.acquisitionStateFile, archiveDir: config.rawArchiveDir });
await acquisition.initialize();
let runtime = null, baseUrl = baseCandidates[0];
for (const candidate of baseCandidates) {
  try { runtime = await jsonRequest(`${candidate}/api/v10/events`); baseUrl = candidate; break; }
  catch { /* Probe the next known local runtime without changing provider results. */ }
}
const reports = await buildReports(runtime, acquisition);
const output = Object.fromEntries(selected.map((name) => [name, reports[name]]));
if (jsonMode) console.log(JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl, runtimeReachable: Boolean(runtime), sources: output }, null, 2));
else {
  console.log(`VIGIA SOURCE DOCTOR · ${new Date().toISOString()}`);
  console.log(`Runtime ${runtime ? 'reachable' : 'unreachable'} · secrets are never printed`);
  for (const name of selected) printHuman(name, output[name]);
}
if (strict && selected.some((name) => !['CONFIGURED', 'CONFIGURED_PUBLIC_STAC', 'CONFIGURED_PUBLIC_SOURCE'].includes(output[name].configuration))) process.exitCode = 1;
