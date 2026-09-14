import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createForecastCorpusRuntime, fetchWfigsArchive, runCorpusDoctor } from '../src/modules/forecast-corpus/index.mjs';
import { createCorpusAcquisitionManifest } from '../../../packages/domain/src/forecast-corpus/index.mjs';

const rootBase = path.join(process.cwd(), '.tmp');
const polygon = (shift) => ({ type: 'Polygon', coordinates: [[[-112, 36], [-111.99 + shift, 36], [-111.99 + shift, 36.01], [-112, 36.01], [-112, 36]]] });
function feature(revision) {
  const observed = Date.parse(`2025-07-0${revision + 4}T10:00:00Z`), published = observed + 60_000;
  return { type: 'Feature', id: revision, properties: { OBJECTID: revision, attr_UniqueFireIdentifier: '2025-AZGCP-000597', attr_IncidentTypeCategory: 'WF', attr_POOState: 'US-AZ', attr_FireDiscoveryDateTime: Date.parse('2025-07-05T09:00:00Z'), attr_ModifiedOnDateTime_dt: published, poly_IncidentName: 'Dragon Bravo', poly_PolygonDateTime: observed, poly_CreateDate: published, poly_GISAcres: revision * 10, BurnPeriod: revision }, geometry: polygon(revision / 10_000) };
}
const body = JSON.stringify({ type: 'FeatureCollection', properties: { exceededTransferLimit: false }, features: [feature(1), feature(2), feature(3)] });
function manifest(storageTarget) {
  return createCorpusAcquisitionManifest({ from: '2025-07-05T00:00:00Z', to: '2025-07-10T00:00:00Z', regions: [{ id: 'western-us', jurisdiction: 'US', bbox: [-125, 31, -102, 49], estimatedAreaKm2: 1_900_000 }], seasons: ['2025'], providers: ['nifc-wfigs-daily'], products: ['captured-perimeter-revisions'], incidentSelectionRules: { incidentIds: ['2025-AZGCP-000597'] }, budgets: { maxIncidents: 1, maxDays: 10, maxRegionAreaKm2: 2_000_000, maxProviderObjects: 10, maxBytes: 2_000_000, maxConcurrency: 1, maxRuntimeSeconds: 30, maxRetries: 1, maxLocalStorageBytes: 20_000_000 }, storageTarget, licences: ['NIFC-OPEN-DATA'], expectedOutputs: ['bronze', 'silver'], codeVersion: 'test-v1' });
}
const response = (status, payload, contentType = 'application/json') => new Response(payload, { status, headers: { 'content-type': contentType } });

test('archive run persists Bronze before cursor, resumes idempotently, and redacts no secrets', async () => {
  await mkdir(rootBase, { recursive: true }); const directory = await mkdtemp(path.join(rootBase, 'forecast-corpus-api-')); let wfigsFetches = 0;
  const fetchImpl = async (url) => { const value = String(url); if (value.includes('WFIGS_Daily_Perimeters_Public')) { wfigsFetches += 1; return response(200, body, 'application/geo+json'); } return response(503, 'unavailable', 'text/plain'); };
  try {
    const value = manifest(path.join(directory, 'data/runtime/forecast-corpus')), runtime = await createForecastCorpusRuntime({ projectRoot: directory, fetchImpl, config: {} }), first = await runtime.start(value);
    assert.equal(first.state, 'COMPLETED'); assert.equal(first.cursor.stage, 'COMPLETE'); assert.ok(first.completedStages.includes('SILVER'));
    const silver = JSON.parse(await readFile(first.outputs.silverFile, 'utf8')); assert.equal(silver.incidents[0].perimeterStates.length, 3); assert.equal(silver.rawProductIds.length, 1);
    await runtime.runStore.update(first.runId, (state) => ({ ...state, state: 'FAILED' }));
    const restarted = await createForecastCorpusRuntime({ projectRoot: directory, fetchImpl, config: {} }), resumed = await restarted.resume(first.runId);
    assert.equal(resumed.state, 'COMPLETED'); assert.equal(resumed.metrics.uniqueStoredBytes, first.metrics.uniqueStoredBytes); assert.equal(wfigsFetches, 2);
    const acquisition = JSON.parse(await readFile(path.join(directory, 'data/runtime/forecast-corpus/acquisition-state.json'), 'utf8'));
    assert.equal(Object.keys(acquisition.products).length, 1); assert.equal(Object.values(acquisition.products)[0].processingState, 'ingested');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('archive query rejects incident-identifier injection before network access', async () => {
  let fetched = false, value = manifest('/tmp/corpus');
  value = { ...value, incidentSelectionRules: { incidentIds: ["2025-X' OR 1=1 --"] } };
  await assert.rejects(() => fetchWfigsArchive({ manifest: value, rawVault: {}, fetchImpl: async () => { fetched = true; } }), /incident_id_invalid/);
  assert.equal(fetched, false);
});

test('archive provider rejects malformed GeoJSON without canonical output', async () => {
  const value = manifest('/tmp/corpus');
  await assert.rejects(() => fetchWfigsArchive({ manifest: value, rawVault: {}, fetchImpl: async () => response(200, '{"features":[]}', 'application/json') }), /schema_invalid/);
});

test('corpus doctor derives licence status from the rights registry', async () => {
  const doctor = await runCorpusDoctor({ fetchImpl: async () => response(200, '{}') });
  const bySource = Object.fromEntries(doctor.sources.map((item) => [item.source, item]));
  assert.equal(bySource['noaa-hrrr-archive'].licenceStatus, 'REGISTERED');
  assert.equal(bySource['nasa-firms-archive'].licenceStatus, 'REVIEW_REQUIRED');
  assert.equal(bySource['cems-rapid-mapping'].licenceStatus, 'NOT_REGISTERED');
});
