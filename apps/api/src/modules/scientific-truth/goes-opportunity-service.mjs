import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import path from 'node:path';
import { access } from 'node:fs/promises';
import { readJson, writeJsonAtomic } from '../../shared/json-file.mjs';
import { acquireRaw, createPublicEvidenceVault } from '../worldclass/public-evidence-war-room.mjs';
import { trustedFetch } from '../reality-network/trusted-endpoint.mjs';
import { closurePaths, fingerprint, GOES_NEGATIVE_DOCTRINE, km, pointOf, readArtifact, redactCredentialState, writeArtifact } from './contracts.mjs';
import { assessGoesNegativeCandidate } from './adversarial-policy.mjs';

const execute = promisify(execFile), parser = fileURLToPath(new URL('./parse_goes_opportunity.py', import.meta.url));
const platform = Object.freeze({ id: 'G18', bucket: 'noaa-goes18.s3.amazonaws.com', satellite: 'GOES-18', sector: 'F', longitude: -137, maturity: 'OPERATIONAL' });
const day = (date) => String(Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86_400_000)).padStart(3, '0');
const scanToken = (key) => key.match(/_s(\d{13,14})_/)?.[1] ?? null;
const parseKeys = (xml) => { if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('goes_listing_unsafe_xml'); return [...xml.matchAll(/<Key>([^<]+\.nc)<\/Key>/g)].map((match) => match[1].replaceAll('&amp;', '&')); };
const scanTime = (token) => { const value = token?.slice(0, 13); if (!/^\d{13}$/.test(value ?? '')) return null; const year = Number(value.slice(0, 4)), doy = Number(value.slice(4, 7)), hour = Number(value.slice(7, 9)), minute = Number(value.slice(9, 11)), second = Number(value.slice(11, 13)); return new Date(Date.UTC(year, 0, doy, hour, minute, second)).toISOString(); };

async function listProduct(product, at, fetchImpl) {
  const prefix = `ABI-L2-${product}/${at.getUTCFullYear()}/${day(at)}/${String(at.getUTCHours()).padStart(2, '0')}/`, url = `https://${platform.bucket}/?list-type=2&max-keys=100&prefix=${encodeURIComponent(prefix)}`;
  const response = await trustedFetch({ url, allowedHosts: [platform.bucket], maxBytes: 1024 * 1024, accept: 'application/xml,text/xml', fetchImpl, timeoutMs: 20_000 });
  if (!response.ok) throw new Error(`goes_listing_http_${response.status}`);
  return parseKeys(response.body.toString('utf8'));
}

async function discoverPairs({ clock, fetchImpl, scans }) {
  const found = new Map();
  for (let offset = 0; offset < 4 && found.size < scans; offset += 1) {
    const at = new Date(clock().getTime() - offset * 3_600_000), [fdc, acm] = await Promise.all([listProduct('FDCF', at, fetchImpl), listProduct('ACMF', at, fetchImpl)]), acmByScan = new Map(acm.map((key) => [scanToken(key), key]));
    for (const fdcKey of fdc) { const token = scanToken(fdcKey), acmKey = acmByScan.get(token); if (token && acmKey) found.set(token, { token, scanStart: scanTime(token), fdcKey, acmKey }); }
  }
  return [...found.values()].sort((a, b) => a.token.localeCompare(b.token)).slice(-scans);
}

async function candidates(projectRoot, maximum) {
  const corpus = await readJson(path.join(projectRoot, 'data/validation/evidence-war-room/canada-incident-corpus.json'), { incidents: [] }), rows = corpus.incidents.filter((item) => pointOf(item.geometry) && item.region === 'CA-AB').sort((a, b) => a.id.localeCompare(b.id));
  const spaced = [];
  for (const incident of rows) { const coordinate = pointOf(incident.geometry); if (coordinate[0] < -125 || coordinate[0] > -105 || coordinate[1] < 48 || coordinate[1] > 61 || spaced.some((item) => km(item.coordinate, coordinate) < 8)) continue; spaced.push({ id: `goes-negative-candidate:${incident.id}`, incidentReference: incident.id, coordinate, geometry: { type: 'Point', coordinates: coordinate }, radiusKm: GOES_NEGATIVE_DOCTRINE.geometryRadiusKm }); if (spaced.length >= maximum) break; }
  if (spaced.length < 25) throw new Error('goes_candidate_geometry_floor_not_met');
  return spaced;
}

export async function doctorScientificTruth({ projectRoot = process.cwd(), fetchImpl = globalThis.fetch, clock = () => new Date() } = {}) {
  const checks = { python: false, parser: false, candidates: false, goesPublicListing: false };
  try { await access(path.join(projectRoot, '.venv/bin/python')); checks.python = true; } catch {}
  try { await access(parser); checks.parser = true; } catch {}
  try { checks.candidates = (await candidates(projectRoot, 30)).length >= 25; } catch {}
  try { checks.goesPublicListing = (await discoverPairs({ clock, fetchImpl, scans: 1 })).length === 1; } catch {}
  const earthdata = redactCredentialState(), passed = Object.values(checks).every(Boolean), core = { schemaVersion: 'vigia.scientific-truth-doctor.v1', generatedAt: clock().toISOString(), checks, publicGoesLane: passed ? 'READY' : 'BLOCKED', viirsCloudMaskLane: earthdata.configured ? 'CREDENTIAL_PRESENT_NOT_ACTIVATED_BY_DEFAULT' : 'CREDENTIAL_REQUIRED', earthdata, boundedDefaults: { goesScans: 3, candidates: 160, contextIncidents: 25 }, rightsEnforced: true, secretValuesRecorded: false, passed };
  return writeArtifact(path.join(closurePaths(projectRoot).validation, 'science-doctor.json'), 'scientific-truth-doctor', core);
}

export async function acquireGoesOpportunities({ projectRoot = process.cwd(), fetchImpl = globalThis.fetch, clock = () => new Date(), scans = 3, maximumCandidates = 160 } = {}) {
  scans = Math.max(3, Math.min(6, Number(scans) || 3)); maximumCandidates = Math.max(25, Math.min(300, Number(maximumCandidates) || 160));
  const pairs = await discoverPairs({ clock, fetchImpl, scans }); if (pairs.length < scans) throw new Error(`goes_paired_scan_floor_not_met:${pairs.length}:${scans}`);
  const points = await candidates(projectRoot, maximumCandidates), paths = closurePaths(projectRoot), candidateFile = path.join(paths.runtime, 'goes-candidates.json'); await writeJsonAtomic(candidateFile, points);
  const vault = await createPublicEvidenceVault({ projectRoot, clock }), parsedScans = [];
  for (const pair of pairs) {
    const acquire = async (kind, key) => acquireRaw({ vault, providerId: 'noaa-goes-public', sourceId: `goes:${platform.id}:ABI-L2-${kind}`, url: `https://${platform.bucket}/${key}`, parserVersion: 'vigia.goes-paired-opportunity-parser.v1', sourceTimestamp: pair.scanStart, requestWindow: { platform: platform.id, sector: platform.sector, scanToken: pair.token, candidateCount: points.length }, accept: 'application/x-netcdf,application/octet-stream', maximumBytes: 64 * 1024 * 1024, fetchImpl, clock, attempts: 3 });
    const [fdc, acm] = await Promise.all([acquire('FDCF', pair.fdcKey), acquire('ACMF', pair.acmKey)]), fdcPath = vault.acquisitionStore.productArchivePath(fdc.product.id), acmPath = vault.acquisitionStore.productArchivePath(acm.product.id);
    const { stdout } = await execute(path.join(projectRoot, '.venv/bin/python'), [parser, fdcPath, acmPath, candidateFile, '--max-candidates', String(points.length), '--max-view-zenith', String(GOES_NEGATIVE_DOCTRINE.maximumLocalZenithDegrees)], { timeout: 120_000, maxBuffer: 16 * 1024 * 1024, env: { PATH: process.env.PATH, PYTHONNOUSERSITE: '1' } }), parsed = JSON.parse(stdout);
    if (parsed.schemaVersion !== 'vigia.goes-paired-opportunity-parser.v1') throw new Error('goes_opportunity_parser_output_invalid');
    parsedScans.push({ scanToken: pair.token, scanStart: parsed.scanStart, scanEnd: parsed.scanEnd, satellite: platform.satellite, sector: platform.sector, sourceMaturity: platform.maturity, rawProducts: { fdc: { id: fdc.product.id, sha256: `sha256:${fdc.product.checksumSha256}`, receivedAt: fdc.product.receivedAt, objectKey: pair.fdcKey }, acm: { id: acm.product.id, sha256: `sha256:${acm.product.checksumSha256}`, receivedAt: acm.product.receivedAt, objectKey: pair.acmKey } }, records: parsed.records });
  }
  const permitted = new Set(GOES_NEGATIVE_DOCTRINE.permittedCloudStates), opportunities = points.map((candidate) => {
    const observations = parsedScans.map((scan) => ({ ...scan.records.find((item) => item.candidateId === candidate.id), scanToken: scan.scanToken, scanStart: scan.scanStart, scanEnd: scan.scanEnd, rawProducts: scan.rawProducts })), valid = observations.length === scans && observations.every((item) => permitted.has(item.state)), qualifyingFire = observations.some((item) => item.qualifyingFire), state = valid ? (observations.some((item) => item.state === 'VALID_PROBABLY_CLEAR_OBSERVATION') ? 'VALID_PROBABLY_CLEAR_OBSERVATION' : 'VALID_CLEAR_OBSERVATION') : observations.find((item) => !permitted.has(item.state))?.state ?? 'UNKNOWN';
    return { ...candidate, state, reason: valid ? `All ${scans} consecutive paired scans satisfy cloud, FDC quality, coverage, and useful-view doctrine.` : 'At least one required paired scan does not establish a valid observation opportunity.', qualifyingFire, observations, providerHealth: 'LIVE', productAvailability: 'AVAILABLE', knowledgeTimeValid: observations.every((item) => item.rawProducts.fdc.receivedAt && item.rawProducts.acm.receivedAt) };
  });
  const counts = Object.fromEntries([...new Set(opportunities.map((item) => item.state))].sort().map((state) => [state, opportunities.filter((item) => item.state === state).length])), core = { schemaVersion: 'vigia.goes-observation-opportunity-product.v1', generatedAt: clock().toISOString(), doctrine: GOES_NEGATIVE_DOCTRINE, satellite: platform, pairedScans: parsedScans.map(({ records, ...scan }) => ({ ...scan, sampledCandidates: records.length })), candidates: opportunities.length, validClearOrProbablyClear: opportunities.filter((item) => permitted.has(item.state)).length, qualifyingFireCandidates: opportunities.filter((item) => item.qualifyingFire).length, counts, opportunities, rights: { permitScientificRetention: true, licenceId: 'NOAA-PUBLIC-DATA', classification: 'US_FEDERAL_PUBLIC_DATA' }, resumption: { candidateFile: path.relative(projectRoot, candidateFile), rawObjectsContentAddressed: true } };
  return writeArtifact(paths.goes, 'goes-observation-opportunities', core);
}

export async function certifyGoesNegatives({ projectRoot = process.cwd(), clock = () => new Date(), target = 100 } = {}) {
  const goes = await readArtifact(closurePaths(projectRoot).goes); if (!goes) throw new Error('goes_opportunity_artifact_required'); target = Math.max(25, Math.min(200, Number(target) || 100));
  const permitted = new Set(GOES_NEGATIVE_DOCTRINE.permittedCloudStates), packets = goes.opportunities.map((row) => {
    const assessment = assessGoesNegativeCandidate(row, GOES_NEGATIVE_DOCTRINE), certified = assessment.certified, core = { schemaVersion: 'vigia.goes-negative-packet.v1', id: `negative:${row.id}`, geometry: row.geometry, radiusKm: row.radiusKm, timeWindow: { from: row.observations[0]?.scanStart ?? null, to: row.observations.at(-1)?.scanEnd ?? null }, label: certified ? 'NO_QUALIFYING_GOES_FIRE_DETECTION' : 'UNKNOWN', doctrineVersion: GOES_NEGATIVE_DOCTRINE.version, opportunityState: row.state, consecutiveValidScans: row.observations.filter((item) => permitted.has(item.state)).length, goesFireResult: row.qualifyingFire ? 'QUALIFYING_FIRE_PRESENT' : 'NO_QUALIFYING_FIRE_PIXEL', officialSourceChecks: { state: 'NOT_REQUIRED_FOR_SENSOR_SPECIFIC_LABEL', strongCrossSourceLabelGranted: false }, otherPhysicalSourceChecks: { state: 'NOT_REQUIRED_FOR_SENSOR_SPECIFIC_LABEL' }, prescribedAndPersistentChecks: { state: 'NOT_REQUIRED_FOR_SENSOR_SPECIFIC_LABEL' }, rights: goes.rights, knowledgeTimeClocks: row.observations.map((item) => ({ scanStart: item.scanStart, scanEnd: item.scanEnd, fdcReceivedAt: item.rawProducts.fdc.receivedAt, acmReceivedAt: item.rawProducts.acm.receivedAt })), rawObjectLineage: row.observations.flatMap((item) => [item.rawProducts.fdc, item.rawProducts.acm]), certified, rejectionReasons: assessment.rejectionReasons };
    return { ...core, fingerprint: fingerprint('goes-negative-packet', core) };
  });
  const selected = packets.filter((item) => item.certified).slice(0, target), rejected = packets.filter((item) => !item.certified), rejectionReasons = Object.fromEntries([...new Set(rejected.flatMap((item) => item.rejectionReasons))].sort().map((reason) => [reason, rejected.filter((item) => item.rejectionReasons.includes(reason)).length])), core = { schemaVersion: 'vigia.goes-negative-packet-product.v1', generatedAt: clock().toISOString(), doctrine: GOES_NEGATIVE_DOCTRINE, candidates: packets.length, certified: selected.length, unknown: rejected.length, rejected: rejected.length, rejectionReasons, packets: [...selected, ...rejected], releaseFloor: { target: 25, passed: selected.length >= 25 }, worldClassTarget: { target: 100, passed: selected.length >= 100 }, unknownPromotedToNegative: 0 };
  return writeArtifact(closurePaths(projectRoot).negatives, 'goes-negative-packets', core);
}
