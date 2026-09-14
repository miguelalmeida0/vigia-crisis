import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorizeFoundryWorker, DataFoundryStore, decodeHrrrIncidentSlice, foundryWorkerGrants, windVector } from '../src/modules/data-foundry/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'), at = '2026-08-24T00:00:00.000Z';
test('foundry event store persists a verifiable tamper-evident chain', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vigia-foundry-')), store = new DataFoundryStore({ filePath: path.join(directory, 'state.json'), clock: () => new Date(at) }); await store.recordEvent('DATA_GAP_OPENED', { id: 'one' }); await store.recordEvent('DATA_GAP_CLOSED', { id: 'one' }); const state = await store.read(); assert.equal(DataFoundryStore.verifyEventChain(state), true); state.events[0].payload.id = 'tampered'; assert.equal(DataFoundryStore.verifyEventChain(state), false);
});

test('machine principal cannot escalate across incident or action scope', () => {
  const grants = foundryWorkerGrants({ incidentIds: ['incident-a'], validFrom: '2026-01-01T00:00:00Z', validUntil: '2027-01-01T00:00:00Z' }); assert.equal(authorizeFoundryWorker(grants, { capability: 'MATERIALIZE_SILVER', incidentId: 'incident-a', resourceId: 'raw', at }).allowed, true); assert.equal(authorizeFoundryWorker(grants, { capability: 'MATERIALIZE_SILVER', incidentId: 'incident-b', resourceId: 'raw', at }).allowed, false); assert.equal(authorizeFoundryWorker(grants, { capability: 'DELETE_RAW_VAULT', incidentId: 'incident-a', resourceId: 'raw', at }).allowed, false);
});

test('wind vector conversion uses meteorological from-direction', () => {
  const east = windVector(1, 0), north = windVector(0, 1); assert.equal(east.speedMps, 1); assert.equal(east.directionFromDegrees, 270); assert.equal(north.directionFromDegrees, 180);
});

async function decoderFixture(size = 32) { const directory = await mkdtemp(path.join(os.tmpdir(), 'vigia-hrrr-')), bronze = path.join(directory, 'bronze'), received = path.join(bronze, 'received'); await mkdir(received, { recursive: true }); const body = Buffer.alloc(size, 0); body.write('GRIB'); const file = path.join(received, 'bad.raw'); await writeFile(file, body); const sha = createHash('sha256').update(body).digest('hex'), raw = { id: 'raw', originalUriOrObjectKey: 'received/bad.raw', checksumSha256: sha, byteLength: body.length }, fields = ['temperature_2m', 'relative_humidity_2m', 'wind_u_10m', 'wind_v_10m'].map((variable, index) => ({ variable, rawProductId: 'raw', units: index < 2 ? (index ? '%' : 'K') : 'm s-1', gribMessage: index + 1 })); return { directory, bronze, raw, fields, file }; }

test('bounded decoder rejects malformed GRIB without custom parsing', async () => {
  const fixture = await decoderFixture(); await assert.rejects(decodeHrrrIncidentSlice({ projectRoot: root, pythonPath: path.join(root, '.venv/bin/python'), bronzeDirectory: fixture.bronze, weatherRun: { runId: 'run', issueTime: at, availableToVigiaAt: at, fields: fixture.fields, indexRawProductId: 'index' }, rawProducts: [fixture.raw], incidentId: 'i', bbox: [-110, 39, -109, 40] }), /hrrr_decoder_failed/);
});

test('bounded decoder rejects path traversal before parser execution', async () => {
  const fixture = await decoderFixture(), outside = path.join(fixture.directory, 'outside.raw'); await writeFile(outside, Buffer.alloc(32)); const product = { ...fixture.raw, originalUriOrObjectKey: '../outside.raw', checksumSha256: createHash('sha256').update(Buffer.alloc(32)).digest('hex') }; await assert.rejects(decodeHrrrIncidentSlice({ projectRoot: root, pythonPath: path.join(root, '.venv/bin/python'), bronzeDirectory: fixture.bronze, weatherRun: { fields: fixture.fields }, rawProducts: [product], incidentId: 'i', bbox: [-110, 39, -109, 40] }), /outside_bronze/);
});

test('bounded decoder rejects an oversized GRIB before parser execution', async () => {
  const fixture = await decoderFixture(12 * 1024 * 1024 + 1); await assert.rejects(decodeHrrrIncidentSlice({ projectRoot: root, pythonPath: path.join(root, '.venv/bin/python'), bronzeDirectory: fixture.bronze, weatherRun: { fields: fixture.fields }, rawProducts: [fixture.raw], incidentId: 'i', bbox: [-110, 39, -109, 40] }), /raw_size_invalid/);
});

test('retained real HRRR messages decode deterministically with units, clocks, projection and finite values', async (context) => {
  const stateFile = path.join(root, 'data/runtime/forecast-corpus/acquisition-state.json'), silverFile = path.join(root, 'data/runtime/forecast-corpus/silver/06216fa59dafa2c5d0ef2fea.json'); let state, silver; try { state = JSON.parse(await readFile(stateFile)); silver = JSON.parse(await readFile(silverFile)); } catch { context.skip('retained HRRR acquisition is not present'); return; }
  const incident = silver.incidents.find((item) => item.id === '2025-AZGCP-000597'), run = incident?.weatherRuns?.[0]; if (!run) { context.skip('retained HRRR run is not present'); return; } const result = await decodeHrrrIncidentSlice({ projectRoot: root, bronzeDirectory: path.join(root, 'data/runtime/forecast-corpus/bronze'), weatherRun: run, rawProducts: Object.values(state.products), incidentId: incident.id, bbox: [-112.23, 36.11, -111.98, 36.36], gridSide: 32 });
  assert.equal(result.valuesDecoded, true); assert.equal(result.missingValues, 0); assert.deepEqual(result.fields.map((item) => item.variable), ['temperature_2m', 'relative_humidity_2m', 'wind_u_10m', 'wind_v_10m', 'precipitation']); assert.ok(result.fields.every((item) => item.forecastStepSeconds === 3600 && item.grid.crs && item.slice.values.every((value) => value == null || Number.isFinite(value)))); assert.equal(result.fields.find((item) => item.variable === 'temperature_2m').normalizedUnits, 'degC'); assert.equal(result.fields.find((item) => item.variable === 'precipitation').normalizedUnits, 'mm');
  const again = await decodeHrrrIncidentSlice({ projectRoot: root, bronzeDirectory: path.join(root, 'data/runtime/forecast-corpus/bronze'), weatherRun: run, rawProducts: Object.values(state.products), incidentId: incident.id, bbox: [-112.23, 36.11, -111.98, 36.36], gridSide: 32 }); assert.equal(result.fingerprint, again.fingerprint);
  await assert.rejects(decodeHrrrIncidentSlice({ projectRoot: root, bronzeDirectory: path.join(root, 'data/runtime/forecast-corpus/bronze'), weatherRun: run, rawProducts: Object.values(state.products), incidentId: incident.id, bbox: [0, 0, 1, 1], gridSide: 32 }), /HRRR_OUT_OF_COVERAGE/);
});
