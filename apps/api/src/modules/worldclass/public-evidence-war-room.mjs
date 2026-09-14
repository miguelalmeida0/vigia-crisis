import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { semanticHash } from '../../../../../packages/domain/src/intelligence/shared.mjs';
import { AcquisitionStore } from '../acquisition/acquisition-store.mjs';
import { RawDataVault } from '../reality-network/raw-data-vault.mjs';
import { ProviderStateStore } from '../reality-network/provider-state-store.mjs';
import { trustedFetch } from '../reality-network/trusted-endpoint.mjs';
import { readJson, writeJsonAtomic } from '../../shared/json-file.mjs';

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const runtimeRoot = (root) => path.join(root, 'data/runtime/evidence-war-room');
const validationRoot = (root) => path.join(root, 'data/validation/evidence-war-room');
export const evidenceFile = (root, name) => path.join(validationRoot(root), name);
const archiveYears = Object.freeze([2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]);
const currentShapeFiles = Object.freeze(['perimeters.cpg', 'perimeters.dbf', 'perimeters.prj', 'perimeters.shp', 'perimeters.shx', 'progression.cpg', 'progression.dbf', 'progression.prj', 'progression.shp', 'progression.shx']);

export const PUBLIC_EVIDENCE_SOURCES = Object.freeze([
  {
    providerId: 'cwfis-nrcan', authority: 'Natural Resources Canada — Canadian Forest Service', sourceFamily: 'OFFICIAL_WILDFIRE_AND_PHYSICAL_DERIVED',
    access: 'AUTHORITATIVE_PUBLIC', rightsClassification: 'OPEN_GOVERNMENT_LICENCE_CANADA', licenceId: 'OGL-CANADA-CWFIS',
    licenceUrl: 'https://cwfis.cfs.nrcan.gc.ca/downloads/licence.txt', attribution: 'Canadian Forest Service, Canadian Wildland Fire Information System, Natural Resources Canada',
    hosts: ['cwfis.cfs.nrcan.gc.ca'], chronology: 'Directory timestamps, dated hotspot products, reported-fire fields, and progression attributes are retained without treating archive publication as issue time.',
    independence: 'CWFIS Fire M3 hotspot/perimeter products can derive from satellite/agency inputs and are not automatically an independent witness to those inputs.'
  },
  {
    providerId: 'alberta-wildfire', authority: 'Government of Alberta — Alberta Wildfire', sourceFamily: 'OFFICIAL_PROVINCIAL_WILDFIRE',
    access: 'AUTHORITATIVE_PUBLIC', rightsClassification: 'OPEN_GOVERNMENT_LICENCE_ALBERTA', licenceId: 'OGL-ALBERTA',
    licenceUrl: 'https://www.alberta.ca/wildfire-maps-and-data', attribution: 'Government of Alberta', hosts: ['www.alberta.ca', 'geospatial.alberta.ca'],
    chronology: 'Assessment/status timestamps are issue-time candidates; historical perimeter capture dates are later labels and never back-projected into the cutoff.'
  },
  {
    providerId: 'bc-wildfire-service', authority: 'Government of British Columbia — BC Wildfire Service', sourceFamily: 'OFFICIAL_PROVINCIAL_WILDFIRE',
    access: 'AUTHORITATIVE_PUBLIC', rightsClassification: 'OPEN_GOVERNMENT_LICENCE_BC', licenceId: 'OGL-BC',
    licenceUrl: 'https://open.canada.ca/data/en/dataset/cdfc2d7b-c046-4bf0-90ac-4897232619e1', attribution: 'Government of British Columbia', hosts: ['open.canada.ca', 'services6.arcgis.com'],
    chronology: 'Current feature TRACK_DATE/LOAD_DATE and service edit timestamps are retained prospectively; the current layer is not represented as a historical archive.'
  },
  { providerId: 'noaa-goes-public', authority: 'NOAA/NESDIS GOES-R', sourceFamily: 'PHYSICAL_GEOSTATIONARY', access: 'AUTHORITATIVE_PUBLIC',
    rightsClassification: 'US_FEDERAL_PUBLIC_DATA', licenceId: 'NOAA-PUBLIC-DATA', licenceUrl: 'https://www.noaa.gov/information-technology/open-data-dissemination', attribution: 'NOAA/NESDIS GOES-R Program',
    hosts: ['www.noaa.gov', 'noaa-goes18.s3.amazonaws.com', 'noaa-goes19.s3.amazonaws.com'], chronology: 'Native scan start/end, object creation, VIGIA request and receipt clocks are retained for paired ABI FDC and ACM products.'
  }, { providerId: 'nrcan-fbp-fuel', authority: 'Natural Resources Canada — Canadian Forest Service', sourceFamily: 'SCIENTIFIC_FUEL_CONTEXT', access: 'AUTHORITATIVE_PUBLIC',
    rightsClassification: 'OPEN_GOVERNMENT_LICENCE_CANADA', licenceId: 'OGL-CANADA-NRCAN-FBP', licenceUrl: 'https://open.canada.ca/data/en/dataset/4e66dd2f-5cd0-42fd-b82c-a430044b31de', attribution: 'Natural Resources Canada, Canadian Forest Service',
    hosts: ['open.canada.ca', 'cwfis.cfs.nrcan.gc.ca'], chronology: 'The 2024 30 m product year is explicit; historical use is retrospective context and never represented as issue-time availability.'
  }, { providerId: 'nrcan-canelevation', authority: 'Natural Resources Canada — CanElevation', sourceFamily: 'SCIENTIFIC_TERRAIN_CONTEXT', access: 'AUTHORITATIVE_PUBLIC',
    rightsClassification: 'OPEN_GOVERNMENT_LICENCE_CANADA', licenceId: 'OGL-CANADA-CANELEVATION', licenceUrl: 'https://open.canada.ca/data/en/dataset/0fe65119-e96e-4a57-8bfe-9d9245fba06b', attribution: 'Natural Resources Canada, CanElevation Series',
    hosts: ['open.canada.ca', 'datacube.services.geo.ca'], chronology: 'Dataset/version and VIGIA receipt clocks are retained; terrain is treated as physical context rather than a forecast observation.'
  }, { providerId: 'eccc-msc-nwp', authority: 'Environment and Climate Change Canada — Meteorological Service of Canada', sourceFamily: 'SCIENTIFIC_WEATHER_FORECAST', access: 'AUTHORITATIVE_PUBLIC',
    rightsClassification: 'OPEN_GOVERNMENT_LICENCE_CANADA', licenceId: 'OGL-CANADA-ECCC-NWP', licenceUrl: 'https://eccc-msc.github.io/open-data/readme_en/', attribution: 'Environment and Climate Change Canada',
    hosts: ['eccc-msc.github.io', 'api.weather.gc.ca', 'dd.weather.gc.ca'], chronology: 'Reference/issue time, valid time, lead, retrieval and raw-object clocks are retained; a run after the cutoff is never admitted.'
  },
  {
    providerId: 'noaa-nws-cap', authority: 'NOAA National Weather Service', sourceFamily: 'OFFICIAL_GOVERNMENT_CAP', access: 'AUTHORITATIVE_PUBLIC',
    rightsClassification: 'US_FEDERAL_PUBLIC_DATA', licenceId: 'NWS-PUBLIC-DATA', licenceUrl: 'https://www.weather.gov/documentation/services-web-api', attribution: 'NOAA/National Weather Service',
    hosts: ['api.weather.gov'], chronology: 'CAP sent/effective/onset/expires and VIGIA receipt time retained; the public API exposes approximately seven days of alert history.'
  },
  {
    providerId: 'eccc-msc-cap', authority: 'Environment and Climate Change Canada — Meteorological Service of Canada', sourceFamily: 'OFFICIAL_GOVERNMENT_CAP',
    access: 'AUTHORITATIVE_PUBLIC', rightsClassification: 'OPEN_GOVERNMENT_LICENCE_CANADA', licenceId: 'OGL-CANADA-ECCC',
    licenceUrl: 'https://eccc-msc.github.io/open-data/msc-data/alerts/readme_alerts-datamart_en/', attribution: 'Environment and Climate Change Canada',
    hosts: ['dd.weather.gc.ca'], chronology: 'CAP sent/effective/onset/expires, filename publication time, directory chronology, and VIGIA receipt time retained; historical Datamart directories are bounded by provider retention.'
  }
].map((source) => ({ ...source, licenceFingerprint: `sha256:${sha256(JSON.stringify({ licenceId: source.licenceId, licenceUrl: source.licenceUrl, rightsClassification: source.rightsClassification, attribution: source.attribution }))}` })));

const sourceByProvider = new Map(PUBLIC_EVIDENCE_SOURCES.map((source) => [source.providerId, source]));

export function iso(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function providerDate(value, fallback = null) {
  if (Number.isFinite(Number(value)) && Number(value) > 1_000_000_000) return iso(Number(value), fallback);
  const text = String(value ?? '').trim();
  if (!text) return fallback;
  return iso(text.replace(/^(\d{4})\/(\d{2})\/(\d{2})/, '$1-$2-$3').replace(' ', 'T') + (/Z$|[+-]\d\d:?\d\d$/.test(text) ? '' : 'Z'), iso(text, fallback));
}

export function normalizedFireId(value) { return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
export function source(providerId) { const value = sourceByProvider.get(providerId); if (!value) throw new Error(`public_evidence_source_unknown:${providerId}`); return value; }
export function relative(root, file) { return path.relative(root, file); }
function sum(values) { return values.reduce((total, value) => total + Number(value || 0), 0); }

export async function createPublicEvidenceVault({ projectRoot = process.cwd(), clock = () => new Date() } = {}) {
  const root = runtimeRoot(projectRoot), acquisitionStore = new AcquisitionStore({ filePath: path.join(root, 'acquisition-state.json'), archiveDir: path.join(root, 'bronze'), clock, maxArchiveBytes: 4 * 1024 * 1024 * 1024, maxProviderArchiveBytes: 2 * 1024 * 1024 * 1024, maxProductBytes: 384 * 1024 * 1024, maxProducts: 50_000 }), stateStore = new ProviderStateStore({ filePath: path.join(root, 'provider-state.json') }), rawVault = new RawDataVault({ acquisitionStore, stateStore });
  await rawVault.initialize();
  return { rawVault, acquisitionStore, stateStore };
}

export async function acquireRaw({ vault, providerId, sourceId, url, parserVersion, sourceTimestamp = null, requestWindow = null, accept = '*/*', maximumBytes = 32 * 1024 * 1024, fetchImpl = globalThis.fetch, clock = () => new Date(), attempts = 2 } = {}) {
  const definition = source(providerId), runId = randomUUID(), attemptedAt = clock().toISOString();
  await vault.stateStore.configure(providerId, { configuration: definition.access, status: 'READY' });
  await vault.stateStore.attempt(providerId, attemptedAt);
  let response, lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      response = await trustedFetch({ url, allowedHosts: definition.hosts, maxBytes: maximumBytes, timeoutMs: maximumBytes > 64 * 1024 * 1024 ? 180_000 : 30_000, accept, headers: { 'user-agent': 'VIGIA-Public-Evidence-War-Room/1.0 (authoritative-public-research)' }, fetchImpl });
      if (!response.ok) throw new Error(`public_evidence_http_${response.status}`);
      break;
    } catch (error) { lastError = error; }
  }
  if (!response?.ok) { await vault.stateStore.failure(providerId, lastError, { status: 'UNAVAILABLE' }); throw lastError; }
  const publishedAt = sourceTimestamp ?? iso(response.headers?.['last-modified']), providerProductId = `${sourceId}:${publishedAt ?? 'publication-unknown'}:${sha256(response.body)}`;
  const preserved = await vault.rawVault.preserve({ providerId, sourceId, providerProductId, body: response.body, requestIdentity: response.requestIdentity, response: { ...response, sourceTimestamp: publishedAt }, licenceId: definition.licenceId, parserVersion, requestWindow, fetchRunId: runId, retrievedAt: response.retrievedAt });
  await vault.stateStore.success(providerId, { at: clock().toISOString(), productTime: publishedAt, objectKey: preserved.product.originalUriOrObjectKey, contentHash: preserved.product.checksumSha256, bytes: preserved.product.byteLength, accepted: 1, duplicate: Number(preserved.duplicate), latencyMs: response.latencyMs });
  return { ...preserved, response, publishedAt };
}

export function links(html, matcher) {
  return [...String(html).matchAll(/href=["']([^"'#?]+)["']/gi)].map((match) => match[1]).filter((value) => matcher.test(value));
}

async function acquireArcGisLayer({ vault, providerId, serviceUrl, layerId, sourceId, returnGeometry, pageSize = 1000, maximumPages = 50, fetchImpl, clock } = {}) {
  const metadata = await acquireRaw({ vault, providerId, sourceId: `${sourceId}:metadata`, url: `${serviceUrl}/${layerId}?f=pjson`, parserVersion: 'vigia.arcgis-layer-metadata.v1', accept: 'application/json', fetchImpl, clock });
  const pages = [], features = [];
  for (let page = 0; page < maximumPages; page += 1) {
    const url = new URL(`${serviceUrl}/${layerId}/query`);
    for (const [key, value] of Object.entries({ where: '1=1', outFields: '*', returnGeometry: String(Boolean(returnGeometry)), outSR: '4326', resultOffset: String(page * pageSize), resultRecordCount: String(pageSize), orderByFields: 'OBJECTID', f: 'geojson' })) url.searchParams.set(key, value);
    const raw = await acquireRaw({ vault, providerId, sourceId: `${sourceId}:page:${page + 1}`, url, parserVersion: 'vigia.arcgis-geojson.v1', accept: 'application/geo+json, application/json', maximumBytes: returnGeometry ? 128 * 1024 * 1024 : 16 * 1024 * 1024, fetchImpl, clock, requestWindow: { page: page + 1, pageSize } });
    const body = JSON.parse(raw.response.body.toString('utf8'));
    if (!Array.isArray(body.features)) throw new Error(`arcgis_feature_collection_invalid:${sourceId}:${page + 1}`);
    for (const feature of body.features) features.push({ ...feature, acquisition: { rawProductId: raw.product.id, retrievedAt: raw.retrieval.retrievedAt, sourceId: raw.product.sourceId } });
    pages.push({ rawProductId: raw.product.id, records: body.features.length, bytes: raw.product.byteLength, duplicate: raw.duplicate });
    if (!body.properties?.exceededTransferLimit && body.features.length < pageSize) break;
    if (!body.features.length) break;
  }
  return { metadataProductId: metadata.product.id, pages, features };
}

function normalizeAlberta(locationFeatures, perimeterFeatures) {
  const perimeters = new Map();
  for (const feature of perimeterFeatures) {
    const properties = feature.properties ?? {}, key = normalizedFireId(`${properties.YEAR ?? ''}:${properties.FIRE_NUMBE ?? properties.FIRENUMBER}`);
    if (!key) continue;
    const captureDate = String(properties.CAPTURE_DATE ?? '').slice(0, 10), captureTime = String(properties.TIME ?? '').padStart(4, '0'), capturedAt = /^\d{4}-\d{2}-\d{2}$/.test(captureDate) ? iso(`${captureDate}T${captureTime.slice(0, 2)}:${captureTime.slice(2, 4)}:00Z`) : null;
    const row = { officialPerimeterId: `AB:${properties.OBJECTID}`, fireIdentity: properties.FIRENUMBER ?? properties.FIRE_NUMBE, areaHectares: Number(properties.HECTARES_UTM) || null, capturedAt, captureTimeQualification: capturedAt ? 'PROVIDER_LOCAL_TIME_RETAINED_AS_UNZONED_UTC_FOR_ORDERING_ONLY' : 'DATE_UNAVAILABLE', sourceMethod: properties.SOURCE ?? null, fireClass: properties.FIRE_CLASS ?? null, burnClass: properties.BURN_CLASS ?? null, geometry: feature.geometry ?? null, rawProductId: feature.acquisition?.rawProductId ?? null };
    const prior = perimeters.get(key); if (!prior || Date.parse(row.capturedAt ?? 0) >= Date.parse(prior.capturedAt ?? 0)) perimeters.set(key, row);
  }
  const incidents = [], seen = new Set();
  for (const feature of locationFeatures) {
    const properties = feature.properties ?? {}, key = normalizedFireId(`${properties.FIRE_YEAR ?? ''}:${properties.FIRE_NUMBER ?? properties.LABEL}`);
    if (!key || seen.has(key)) continue; seen.add(key);
    const officialObservedAt = providerDate(properties.ASSESSMENT_ASSISTANCE_DATE, providerDate(properties.FIRE_STATUS_DATE)), finalPerimeter = perimeters.get(key) ?? null;
    const bindings = {
      officialIncidentIdentity: true, officialFinalPerimeter: Boolean(finalPerimeter), physicalHotspotHistory: false, weatherHistory: false, fuel: false, terrain: false,
      issueTimeOrProgression: Boolean(officialObservedAt), sourceHealth: true, laterTruth: Boolean(finalPerimeter?.capturedAt)
    };
    const missing = Object.entries(bindings).filter(([, value]) => !value).map(([name]) => name);
    incidents.push({ schemaVersion: 'vigia.canadian-incident-discovery.v1', id: `CA-AB-${key}`, region: 'CA-AB', officialIdentity: { fireNumber: properties.FIRE_NUMBER ?? properties.LABEL, label: properties.LABEL ?? null, objectId: properties.OBJECTID, authority: 'Government of Alberta — Alberta Wildfire' }, officialObservedAt, chronologyQualification: officialObservedAt ? 'ASSESSMENT_OR_STATUS_TIME_FROM_OFFICIAL_RECORD' : 'NO_ISSUE_TIME', geometry: feature.geometry, fireType: properties.FIRE_TYPE ?? null, status: properties.FIRE_STATUS ?? null, statusAt: providerDate(properties.FIRE_STATUS_DATE), areaEstimateHectares: Number(properties.AREA_ESTIMATE) || null, sizeClass: properties.SIZE_CLASS ?? null, generalCause: properties.GENERAL_CAUSE ?? null, responseArea: properties.RESP_AREA ?? null, finalPerimeter, bindings, forecastEligible: missing.length === 0, forecastIneligibilityReasons: missing.map((name) => `MISSING_${name.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`), lineage: { locationRawProductId: feature.acquisition?.rawProductId ?? null, perimeterRawProductId: finalPerimeter?.rawProductId ?? null, licenceId: 'OGL-ALBERTA' } });
  }
  return incidents.sort((left, right) => left.id.localeCompare(right.id));
}

export async function writeSourceManifest(projectRoot, vault, acquiredAt) {
  const products = vault.acquisitionStore.products(), retrievalByProduct = new Map(vault.stateStore.status().retrievals.map((retrieval) => [retrieval.rawProductId, retrieval])), providers = PUBLIC_EVIDENCE_SOURCES.map((definition) => {
    const rows = products.filter((product) => product.provider === definition.providerId);
    return { ...definition, rawObjects: rows.length, bytes: sum(rows.map((row) => row.byteLength)), earliestRetrievedAt: rows.map((row) => row.retrievedAt).sort()[0] ?? null, latestRetrievedAt: rows.map((row) => row.retrievedAt).sort().at(-1) ?? null, objectHashes: rows.map((row) => `sha256:${row.checksumSha256}`).sort() };
  });
  const core = { schemaVersion: 'vigia.public-evidence-source-manifest.v1', generatedAt: acquiredAt, providers, rawObjects: products.length, bytes: sum(products.map((row) => row.byteLength)), bronzeLayer: 'CONTENT_ADDRESSED_APPEND_ONLY', objects: products.map((product) => ({ id: product.id, provider: product.provider, sourceId: product.sourceId, url: product.originalUri, retrievedAt: product.retrievedAt, providerPublicationTime: product.sourceTimestamp, httpStatus: product.httpStatus, httpMetadata: retrievalByProduct.get(product.id)?.responseHeaders ?? {}, contentType: product.contentType, byteLength: product.byteLength, sha256: `sha256:${product.checksumSha256}`, licenceId: product.licenceMetadata?.licenceId ?? null, licenceFingerprint: source(product.provider).licenceFingerprint, rightsClassification: source(product.provider).rightsClassification, rawObjectReference: product.originalUriOrObjectKey })).sort((a, b) => a.id.localeCompare(b.id)) };
  const manifest = { ...core, fingerprint: semanticHash('public-evidence-source-manifest', core) };
  await writeJsonAtomic(evidenceFile(projectRoot, 'public-source-manifest.json'), manifest);
  return manifest;
}

export async function acquireCanadianEvidence({ projectRoot = process.cwd(), fetchImpl = globalThis.fetch, clock = () => new Date(), historicalYears = 10, includeLargeHotspotArchives = true } = {}) {
  const startedAt = clock().toISOString(), vault = await createPublicEvidenceVault({ projectRoot, clock }), failures = [], protect = async (label, operation) => { try { return await operation(); } catch (error) { failures.push({ source: label, error: String(error.message ?? error) }); return null; } };
  const cwfisLicence = await protect('cwfis:licence', () => acquireRaw({ vault, providerId: 'cwfis-nrcan', sourceId: 'cwfis:licence', url: source('cwfis-nrcan').licenceUrl, parserVersion: 'vigia.rights-document.v1', accept: 'text/plain', maximumBytes: 1024 * 1024, fetchImpl, clock }));
  await protect('alberta:source-page', () => acquireRaw({ vault, providerId: 'alberta-wildfire', sourceId: 'alberta:wildfire-maps-and-data', url: source('alberta-wildfire').licenceUrl, parserVersion: 'vigia.rights-and-source-page.v1', accept: 'text/html', maximumBytes: 4 * 1024 * 1024, fetchImpl, clock }));
  await protect('bc:catalogue', () => acquireRaw({ vault, providerId: 'bc-wildfire-service', sourceId: 'bcws:open-canada-catalogue', url: source('bc-wildfire-service').licenceUrl, parserVersion: 'vigia.rights-and-source-page.v1', accept: 'text/html', maximumBytes: 4 * 1024 * 1024, fetchImpl, clock }));

  const hotspotIndex = await protect('cwfis:hotspot-index', () => acquireRaw({ vault, providerId: 'cwfis-nrcan', sourceId: 'cwfis:hotspot-index', url: 'https://cwfis.cfs.nrcan.gc.ca/downloads/hotspots/', parserVersion: 'vigia.apache-directory-index.v1', accept: 'text/html', maximumBytes: 4 * 1024 * 1024, fetchImpl, clock }));
  await protect('cwfis:activefires', () => acquireRaw({ vault, providerId: 'cwfis-nrcan', sourceId: 'cwfis:activefires', url: 'https://cwfis.cfs.nrcan.gc.ca/downloads/reportedfires/activefires.csv', parserVersion: 'vigia.cwfis-activefires-csv.v1', accept: 'text/csv', maximumBytes: 8 * 1024 * 1024, fetchImpl, clock }));
  for (const name of currentShapeFiles) await protect(`cwfis:${name}`, () => acquireRaw({ vault, providerId: 'cwfis-nrcan', sourceId: `cwfis:current:${name}`, url: `https://cwfis.cfs.nrcan.gc.ca/downloads/hotspots/${name}`, parserVersion: 'vigia.cwfis-shapefile-component.v1', maximumBytes: 64 * 1024 * 1024, fetchImpl, clock }));
  if (hotspotIndex) {
    const daily = links(hotspotIndex.response.body.toString('utf8'), /^\d{8}\.csv$/).sort().slice(-7);
    for (const name of daily) await protect(`cwfis:daily:${name}`, () => acquireRaw({ vault, providerId: 'cwfis-nrcan', sourceId: `cwfis:daily-hotspots:${name.slice(0, 8)}`, url: `https://cwfis.cfs.nrcan.gc.ca/downloads/hotspots/${name}`, parserVersion: 'vigia.cwfis-daily-hotspot-csv.v1', accept: 'text/csv', maximumBytes: 32 * 1024 * 1024, sourceTimestamp: iso(`${name.slice(0, 4)}-${name.slice(4, 6)}-${name.slice(6, 8)}T23:59:59Z`), fetchImpl, clock }));
  }
  for (const year of archiveYears) await protect(`cwfis:perimeters:${year}`, () => acquireRaw({ vault, providerId: 'cwfis-nrcan', sourceId: `cwfis:perimeter-archive:${year}`, url: `https://cwfis.cfs.nrcan.gc.ca/downloads/hotspots/archive/${year}_perimeters.zip`, parserVersion: 'vigia.cwfis-perimeter-archive.v1', maximumBytes: 64 * 1024 * 1024, sourceTimestamp: iso(`${year}-12-31T23:59:59Z`), fetchImpl, clock }));
  if (includeLargeHotspotArchives) for (const year of [2024, 2025]) await protect(`cwfis:hotspots:${year}`, () => acquireRaw({ vault, providerId: 'cwfis-nrcan', sourceId: `cwfis:hotspot-archive:${year}`, url: `https://cwfis.cfs.nrcan.gc.ca/downloads/hotspots/archive/${year}_hotspots.zip`, parserVersion: 'vigia.cwfis-hotspot-archive.v1', maximumBytes: 300 * 1024 * 1024, sourceTimestamp: iso(`${year}-12-31T23:59:59Z`), fetchImpl, clock, attempts: 3 }));

  const historicalService = 'https://geospatial.alberta.ca/mimas/rest/services/wildfire/historical_wildfires_data/FeatureServer', currentAlbertaService = 'https://geospatial.alberta.ca/mimas/rest/services/wildfire/alberta_fire_status/FeatureServer', bcService = 'https://services6.arcgis.com/ubm4tcTYICKBpist/arcgis/rest/services/BCWS_FirePerimeters_PublicView/FeatureServer';
  const locationFeatures = [], perimeterFeatures = [], years = Math.max(1, Math.min(10, Number(historicalYears) || 10));
  for (let offset = 1; offset <= years; offset += 1) {
    const locations = await protect(`alberta:locations:${offset}`, () => acquireArcGisLayer({ vault, providerId: 'alberta-wildfire', serviceUrl: historicalService, layerId: offset, sourceId: `alberta:historical-location:${offset}y`, returnGeometry: true, pageSize: 1000, fetchImpl, clock }));
    if (locations) locationFeatures.push(...locations.features);
    const perimeters = await protect(`alberta:perimeters:${offset}`, () => acquireArcGisLayer({ vault, providerId: 'alberta-wildfire', serviceUrl: historicalService, layerId: offset + 10, sourceId: `alberta:historical-perimeter:${offset}y`, returnGeometry: false, pageSize: 1000, fetchImpl, clock }));
    if (perimeters) perimeterFeatures.push(...perimeters.features);
  }
  const albertaCurrent = await protect('alberta:current-perimeters', () => acquireArcGisLayer({ vault, providerId: 'alberta-wildfire', serviceUrl: currentAlbertaService, layerId: 1, sourceId: 'alberta:current-perimeters', returnGeometry: true, pageSize: 50, maximumPages: 4, fetchImpl, clock }));
  const bcCurrent = await protect('bcws:current-perimeters', () => acquireArcGisLayer({ vault, providerId: 'bc-wildfire-service', serviceUrl: bcService, layerId: 0, sourceId: 'bcws:current-perimeters', returnGeometry: true, pageSize: 50, maximumPages: 4, fetchImpl, clock }));

  const incidents = normalizeAlberta(locationFeatures, perimeterFeatures), failureCounts = {};
  for (const incident of incidents) for (const reason of incident.forecastIneligibilityReasons) failureCounts[reason] = (failureCounts[reason] ?? 0) + 1;
  const acquiredProducts = vault.acquisitionStore.products(), perimeterArchivesComplete = archiveYears.every((year) => acquiredProducts.some((product) => product.sourceId === `cwfis:perimeter-archive:${year}`)), hotspotArchivesComplete = [2024, 2025].every((year) => acquiredProducts.some((product) => product.sourceId === `cwfis:hotspot-archive:${year}`));
  const corpusCore = { schemaVersion: 'vigia.canadian-evidence-corpus.v1', generatedAt: clock().toISOString(), authority: 'Government of Alberta — Alberta Wildfire', region: 'CA-AB', yearsRequested: years, discoveredIncidents: incidents.length, incidentsWithOfficialFinalPerimeter: incidents.filter((row) => row.bindings.officialFinalPerimeter).length, incidentsWithIssueTimeCandidate: incidents.filter((row) => row.bindings.issueTimeOrProgression).length, forecastEligibleIncidents: incidents.filter((row) => row.forecastEligible).length, failureCounts, physicalArchiveQualification: { perimeterArchivesComplete, hotspotArchivesComplete, rawCwfisArchivesAcquired: perimeterArchivesComplete && hotspotArchivesComplete, requestedLargeArchivesThisRun: includeLargeHotspotArchives, spatialBindingCompleted: false, independentWitnessQualification: 'NOT_ASSUMED' }, incidents };
  const corpus = { ...corpusCore, fingerprint: semanticHash('canadian-evidence-corpus', corpusCore) };
  await writeJsonAtomic(evidenceFile(projectRoot, 'canada-incident-corpus.json'), corpus);

  const progressionProduct = vault.acquisitionStore.products().find((product) => product.sourceId === 'cwfis:current:progression.dbf'), currentProducts = [...(albertaCurrent?.features ?? []).slice(0, 25).map((feature) => ({ providerId: 'alberta-wildfire', incidentId: `CA-AB-${normalizedFireId(feature.properties?.FireNumber ?? feature.properties?.FIRE_NUMBER ?? feature.properties?.OBJECTID)}`, productId: 'CURRENT_PERIMETER', providerPublishedAt: providerDate(feature.properties?.GISFeatureLastUpdated ?? feature.properties?.FIRE_STATUS_DATE), feature })), ...(bcCurrent?.features ?? []).slice(0, 25).map((feature) => ({ providerId: 'bc-wildfire-service', incidentId: `CA-BC-${normalizedFireId(feature.properties?.FIRE_NUMBER ?? feature.properties?.GlobalID ?? feature.properties?.OBJECTID)}`, productId: 'CURRENT_PERIMETER', providerPublishedAt: providerDate(feature.properties?.TRACK_DATE ?? feature.properties?.LOAD_DATE), feature })), ...(progressionProduct ? [{ providerId: 'cwfis-nrcan', incidentId: 'CA-CWFIS-CURRENT-PROGRESSION', productId: 'CURRENT_PROGRESSION_PRODUCT', providerPublishedAt: progressionProduct.sourceTimestamp, feature: { type: 'Feature', geometry: null, properties: { rawContentHash: progressionProduct.checksumSha256, byteLength: progressionProduct.byteLength }, acquisition: { rawProductId: progressionProduct.id, retrievedAt: progressionProduct.retrievedAt, sourceId: progressionProduct.sourceId } } }] : [])];
  const prospective = await appendProspectiveSnapshots({ projectRoot, currentProducts, clock });
  const sourceManifest = await writeSourceManifest(projectRoot, vault, clock().toISOString());
  const catalogueCore = { schemaVersion: 'vigia.canadian-evidence-catalogue.v1', startedAt, completedAt: clock().toISOString(), licenceEvidence: { cwfisLicenceRawProductId: cwfisLicence?.product.id ?? null, cwfisLicenceSha256: cwfisLicence ? `sha256:${cwfisLicence.product.checksumSha256}` : null }, sourceManifestFingerprint: sourceManifest.fingerprint, bronze: vault.rawVault.status(), rawObjects: sourceManifest.providers.filter((row) => ['cwfis-nrcan', 'alberta-wildfire', 'bc-wildfire-service'].includes(row.providerId)).reduce((total, row) => total + row.rawObjects, 0), bytes: sourceManifest.providers.filter((row) => ['cwfis-nrcan', 'alberta-wildfire', 'bc-wildfire-service'].includes(row.providerId)).reduce((total, row) => total + row.bytes, 0), historicalFeatures: { officialLocations: locationFeatures.length, officialPerimeters: perimeterFeatures.length }, currentFeatures: { albertaPerimeters: albertaCurrent?.features.length ?? 0, bcPerimeters: bcCurrent?.features.length ?? 0 }, incidents: { discovered: incidents.length, withOfficialFinalPerimeter: corpus.incidentsWithOfficialFinalPerimeter, forecastEligible: corpus.forecastEligibleIncidents }, prospective: { snapshots: prospective.snapshots.length, incidents: prospective.incidents, campaignFingerprint: prospective.fingerprint }, failures, target: { discoveredIncidents: 500, passed: incidents.length >= 500 }, noSyntheticEvidence: true };
  const catalogue = { ...catalogueCore, fingerprint: semanticHash('canadian-evidence-catalogue', catalogueCore) };
  await writeJsonAtomic(evidenceFile(projectRoot, 'canadian-evidence-catalogue.json'), catalogue);
  return { catalogue, corpus, sourceManifest, prospective };
}

export async function appendProspectiveSnapshots({ projectRoot, currentProducts, clock }) {
  const file = path.join(runtimeRoot(projectRoot), 'prospective-campaign.json'), prior = await readJson(file, { schemaVersion: 'vigia.public-evidence-prospective-campaign.v1', startedAt: clock().toISOString(), snapshots: [] }), snapshots = [...(prior.snapshots ?? [])], capturedAt = clock().toISOString();
  for (const row of currentProducts) {
    const properties = row.feature.properties ?? {}, stateHash = semanticHash('prospective-provider-feature-state', { providerId: row.providerId, incidentId: row.incidentId, productId: row.productId, geometry: row.feature.geometry, properties }), rawProductId = row.feature.acquisition?.rawProductId, rawHash = String(rawProductId ?? '').split(':').at(-1) || null, previous = snapshots.filter((item) => item.providerId === row.providerId && item.incidentId === row.incidentId && item.productId === row.productId).at(-1), observation = previous?.stateHash === stateHash ? 'UNCHANGED_SCHEDULED_OBSERVATION' : previous ? 'CHANGED_PROVIDER_STATE' : 'INITIAL_PROVIDER_STATE';
    snapshots.push({ schemaVersion: 'vigia.public-evidence-prospective-snapshot.v1', sequence: snapshots.length + 1, incidentId: row.incidentId, providerId: row.providerId, productId: row.productId, providerPublishedAt: row.providerPublishedAt, vigiaReceivedAt: row.feature.acquisition?.retrievedAt ?? capturedAt, rawProductId, rawObjectHash: rawHash ? `sha256:${rawHash}` : null, stateHash, observation, sourceHealth: 'LIVE', rights: { state: 'READY', licenceId: source(row.providerId).licenceId }, lineage: { authority: source(row.providerId).authority, sourceId: row.feature.acquisition?.sourceId ?? null }, externalConsequentialActions: 0 });
  }
  const core = { ...prior, lastCapturedAt: capturedAt, snapshots, incidents: new Set(snapshots.map((item) => item.incidentId)).size, providerSourceClasses: new Set(snapshots.map((item) => source(item.providerId).sourceFamily)).size, immutableSnapshots: snapshots.length, unchangedSnapshots: snapshots.filter((item) => item.observation === 'UNCHANGED_SCHEDULED_OBSERVATION').length, changedSnapshots: snapshots.filter((item) => item.observation === 'CHANGED_PROVIDER_STATE').length, priorSnapshotsRewritten: 0, campaignState: 'RUNNING_BOUNDED_ON_DEMAND', nextCommand: 'npm run evidence:prospective:capture' };
  const campaign = { ...core, fingerprint: semanticHash('public-evidence-prospective-campaign', core) };
  await writeJsonAtomic(file, campaign); await writeJsonAtomic(evidenceFile(projectRoot, 'prospective-campaign.json'), campaign); return campaign;
}
