import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { resolveLocalDatabaseUrl } from '../../../scripts/local_database_secret.mjs';
import { SituationStore } from '../src/modules/intelligence/situation-store.mjs';
import { buildSituation } from '../../../packages/domain/src/intelligence/situation-model.mjs';

// Proves the route-artifact dedup redesign directly against a real local
// PostGIS instance (never Neon/production) in an isolated schema. This is
// the store-level layer that changed; buildSituation() is the real domain
// function that produces snapshot payloads, so a snapshot built here is
// exactly what SituationService.rebuild() would persist.
const incident = { id: 'incident:route-artifact-proof', coordinate: [-8, 39] };
const facility = { id: 'facility:hospital-a', canonicalName: 'Hospital A', coordinate: [-8.05, 39.05] };
const geometryA = { type: 'LineString', coordinates: [[-8, 39], [-8.02, 39.02], [-8.05, 39.05]] };
const geometryB = { type: 'LineString', coordinates: [[-8, 39], [-8.03, 39.01], [-8.05, 39.05]] };

function route(at, { geometry = geometryA, ttlMinutes = 5 } = {}) {
  return {
    id: 'route:facility:hospital-a', facilityId: facility.id, direction: 'TO_FACILITY', source: 'OSRM',
    distanceKm: 7.2, travelTimeMinutes: 11, roads: [{ ref: 'N2', name: 'Estrada Nacional 2' }], geometry,
    calculatedAt: at, validUntil: new Date(Date.parse(at) + ttlMinutes * 60000).toISOString()
  };
}

function snapshotAt(at, { routes = [route(at)] } = {}) {
  return buildSituation({ incident, facilities: [facility], routes }, { at, universe: 'CONTROLLED_TEST' });
}

test('route-artifact dedup against real PostGIS (isolated schema, never Neon)', { skip: process.env.VIGIA_SITUATION_POSTGRES_PROOF !== '1' ? 'Set VIGIA_SITUATION_POSTGRES_PROOF=1 for isolated local database proof' : false }, async (t) => {
  const connectionString = await resolveLocalDatabaseUrl(), admin = new pg.Pool({ connectionString, max: 2 }), schema = 'situation_proof_' + randomUUID().replaceAll('-', '');
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString, max: 4, options: `-c search_path=${schema},public` });
  t.after(async () => { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); });
  await pool.query(await readFile('apps/api/src/modules/storage/migrations/024-incident-situation.sql', 'utf8'));
  await pool.query(await readFile('apps/api/src/modules/storage/migrations/026-situation-route-artifact.sql', 'utf8'));
  const store = new SituationStore({ pool });

  await t.test('1. 50 repeated refreshes with unchanged route geometry do NOT produce 50 geometry copies', async () => {
    let at = '2026-09-12T10:00:00.000Z';
    const first = snapshotAt(at);
    assert.equal((await store.append(first)).state, 'APPENDED');
    for (let i = 0; i < 50; i += 1) {
      at = new Date(Date.parse(at) + 60000).toISOString();
      const next = snapshotAt(at, { routes: [route(at)] });
      const result = await store.append(next);
      assert.equal(result.state, 'UNCHANGED', `refresh ${i} should be recognized as unchanged (calculatedAt/validUntil churn only)`);
    }
    const counts = await pool.query('SELECT (SELECT count(*)::int FROM situation_route_artifact) artifacts, (SELECT count(*)::int FROM incident_situation_snapshot) snapshots');
    assert.equal(counts.rows[0].artifacts, 1, 'exactly one route artifact for the one distinct geometry ever seen');
    assert.equal(counts.rows[0].snapshots, 1, 'exactly one historical row for 51 identical-geometry refreshes');
  });

  await t.test('2. timestamp-only route changes do not duplicate geometry (content hash stable across a wider TTL spread too)', async () => {
    const at = '2026-09-12T12:00:00.000Z';
    const a = snapshotAt(at, { routes: [route(at, { ttlMinutes: 5 })] });
    const b = snapshotAt(at, { routes: [route(at, { ttlMinutes: 45 })] });
    assert.equal(a.contentHash, b.contentHash, 'validUntil alone must not change the stable content hash');
  });

  await t.test('3. a genuinely changed route produces a new artifact and a new snapshot row', async () => {
    const at = '2026-09-12T13:00:00.000Z';
    const changed = snapshotAt(at, { routes: [route(at, { geometry: geometryB })] });
    const result = await store.append(changed);
    assert.equal(result.state, 'APPENDED');
    const counts = await pool.query('SELECT (SELECT count(*)::int FROM situation_route_artifact) artifacts, (SELECT count(*)::int FROM incident_situation_snapshot) snapshots');
    assert.equal(counts.rows[0].artifacts, 2, 'a second, distinct geometry produces a second artifact');
    assert.equal(counts.rows[0].snapshots, 2, 'a genuine change produces a second historical row');
  });

  await t.test('4. current-state reconstruction (store.latest) rehydrates full geometry transparently', async () => {
    const latest = await store.latest(incident.id, '2026-09-12T13:00:01.000Z');
    assert.ok(latest, 'a snapshot is retained');
    assert.deepEqual(latest.routes[0].geometry, geometryB, 'the latest route geometry is fully rehydrated, not a bare hash reference');
    assert.equal(latest.routes[0].routeArtifactHash, undefined, 'the reference marker itself is not leaked to API consumers');
    assert.deepEqual(latest.routes[0].roads, [{ ref: 'N2', name: 'Estrada Nacional 2' }]);
  });

  await t.test('5. history over an interval remains correct and rehydrated', async () => {
    const rows = await store.interval(incident.id, '2026-09-12T09:59:00.000Z', '2026-09-12T13:00:01.000Z');
    assert.equal(rows.length, 2, 'the 50 unchanged refreshes collapsed into the two genuinely distinct captures');
    assert.deepEqual(rows[0].routes[0].geometry, geometryA);
    assert.deepEqual(rows[1].routes[0].geometry, geometryB);
  });

  await t.test('payload size guard rejects an oversized snapshot instead of silently writing it', async () => {
    const at = '2026-09-12T14:00:00.000Z';
    const bloated = snapshotAt(at, { routes: [route(at)] });
    // A distinct payload (facility count alone changes the content hash via
    // buildSituation()'s own recompute below), deliberately oversized to
    // prove the guard fires on genuine size, not on the dedup path.
    bloated.facilities = Array.from({ length: 5000 }, (_, i) => ({ ...facility, id: `facility:bloat-${i}`, canonicalName: 'x'.repeat(200) }));
    await assert.rejects(() => store.append(bloated), /situation_snapshot_payload_too_large/);
  });

  await t.test('diagnostics: metrics() reports route-artifact and payload-size stats cheaply', async () => {
    const metrics = await store.metrics();
    assert.equal(metrics.route_artifacts, 2);
    assert.ok(metrics.avg_recent_snapshot_bytes < 250_000);
  });
});
