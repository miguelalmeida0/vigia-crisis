import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { resolveLocalDatabaseUrl } from '../../../scripts/local_database_secret.mjs';
import { SituationStore } from '../src/modules/intelligence/situation-store.mjs';
import { buildSituation } from '../../../packages/domain/src/intelligence/situation-model.mjs';

// Deterministic local approximation of the live-demo workload that measured
// ~335MB of historical snapshot storage on Neon: 12 incidents, ~33 captures
// each (~400 total), each capture carrying a realistic facility/road-report/
// route mix. 90% of captures are TTL-only route refreshes (the live pattern
// this whole redesign targets); the remaining 10% are genuine operational
// changes (a new road restriction, or a route's geometry actually moving).
// Reports the OLD design's size (every capture writes a full, undeduplicated
// payload — reconstructed here from the same inputs, not guessed) against
// the NEW design's actual persisted size (real inserts into real local
// PostGIS, isolated schema, never Neon).
const INCIDENT_COUNT = 12;
const CAPTURES_PER_INCIDENT = 33; // ~396 total, matching the measured ~395
const FACILITY_COUNT = 16;
const ROUTE_COUNT = 6;
const ROAD_REPORT_COUNT = 40;

function facilitiesFor(incidentIndex) {
  return Array.from({ length: FACILITY_COUNT }, (_, i) => ({
    id: `facility:${incidentIndex}:${i}`, canonicalName: `Facility ${incidentIndex}-${i}`, canonicalType: i % 3 === 0 ? 'hospital' : i % 3 === 1 ? 'fire_station' : 'shelter',
    coordinate: [-8 - i * 0.01, 39 + incidentIndex * 0.05 + i * 0.01],
    contact: { phone: '+351 200 000 000' }, address: { street: `Rua ${i}`, municipality: 'Município de Teste' }
  }));
}

// A real road report's own validity window (validFrom/validUntil/observedAt)
// is set once, by whoever reported the restriction, and stays fixed across
// refresh cycles for that same restriction — only knownAt/ingestedAt (when
// *this* process last re-fetched/re-admitted it) move forward on every tick,
// and situationHash() already strips exactly those two for
// OFFICIAL_IP_PUBLISHED_OCCURRENCE reports. Rolling validUntil forward with
// `at` every tick (as an earlier draft of this fixture did) would have been
// an unrealistic test double, not a real report shape.
const ROAD_REPORT_EPOCH = '2026-08-01T00:00:00.000Z';
function roadReportsFor(incidentIndex, at, { extra = false } = {}) {
  const base = Array.from({ length: ROAD_REPORT_COUNT }, (_, i) => ({
    id: `report:${incidentIndex}:${i}`, admitted: true, admissionRule: 'OFFICIAL_IP_PUBLISHED_OCCURRENCE', kind: 'ROAD_RESTRICTION',
    state: 'NORMAL', roadRef: `N${100 + i}`, direction: 'BOTH', knownAt: at, ingestedAt: at, validFrom: ROAD_REPORT_EPOCH,
    validUntil: new Date(Date.parse(ROAD_REPORT_EPOCH) + 90 * 86400000).toISOString(), source: 'IP', observedAt: ROAD_REPORT_EPOCH
  }));
  if (extra) base.push({ id: `report:${incidentIndex}:closure`, admitted: true, admissionRule: 'FIELD_ADMITTED', kind: 'ROAD_RESTRICTION', state: 'CLOSED', roadRef: 'N101', direction: 'BOTH', knownAt: at, validFrom: at, validUntil: new Date(Date.parse(at) + 3600000).toISOString(), source: 'FIELD', observedAt: at });
  return base;
}

function routesFor(incidentIndex, at, { movedRouteIndex = -1 } = {}) {
  return Array.from({ length: ROUTE_COUNT }, (_, i) => {
    const shifted = i === movedRouteIndex;
    return {
      id: `route:${incidentIndex}:${i}`, facilityId: `facility:${incidentIndex}:${i}`, direction: 'TO_FACILITY', source: 'OSRM',
      distanceKm: 5 + i, travelTimeMinutes: 8 + i * 2,
      roads: [{ ref: `N${200 + i}`, name: `Estrada Nacional ${200 + i}` }],
      geometry: { type: 'LineString', coordinates: Array.from({ length: 40 }, (_, p) => [-8 - i * 0.01 - (shifted ? 0.001 : 0) - p * 0.0007, 39 + incidentIndex * 0.05 + p * 0.0005]) },
      calculatedAt: at, validUntil: new Date(Date.parse(at) + 300000).toISOString()
    };
  });
}

function snapshotFor(incidentIndex, at, { movedRouteIndex = -1, extraReport = false } = {}) {
  const incident = { id: `incident:size-proof-${incidentIndex}`, coordinate: [-8, 39 + incidentIndex * 0.05] };
  return buildSituation({
    incident, facilities: facilitiesFor(incidentIndex), routes: routesFor(incidentIndex, at, { movedRouteIndex }), roadReports: roadReportsFor(incidentIndex, at, { extra: extraReport })
  }, { at, universe: 'CONTROLLED_TEST' });
}

test('situation snapshot storage: measured size reduction against the ~400-capture live-demo workload', { skip: process.env.VIGIA_SITUATION_POSTGRES_PROOF !== '1' ? 'Set VIGIA_SITUATION_POSTGRES_PROOF=1 for isolated local database proof' : false }, async (t) => {
  const connectionString = await resolveLocalDatabaseUrl(), admin = new pg.Pool({ connectionString, max: 2 }), schema = 'situation_size_proof_' + randomUUID().replaceAll('-', '');
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString, max: 4, options: `-c search_path=${schema},public` });
  t.after(async () => { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); });
  await pool.query(await readFile('apps/api/src/modules/storage/migrations/024-incident-situation.sql', 'utf8'));
  await pool.query(await readFile('apps/api/src/modules/storage/migrations/026-situation-route-artifact.sql', 'utf8'));
  const store = new SituationStore({ pool });

  let oldDesignBytes = 0, captures = 0, appended = 0, unchanged = 0;
  for (let incidentIndex = 0; incidentIndex < INCIDENT_COUNT; incidentIndex += 1) {
    let at = new Date(Date.parse('2026-08-01T00:00:00.000Z') + incidentIndex * 3600000).toISOString();
    for (let tick = 0; tick < CAPTURES_PER_INCIDENT; tick += 1) {
      at = new Date(Date.parse(at) + 300000).toISOString(); // real 5-minute route-TTL cadence
      // ~10% of ticks are genuine operational changes; the rest are pure
      // freshness churn (calculatedAt/validUntil only) — the measured live
      // pattern this redesign targets.
      const genuine = tick % 10 === 0;
      const snapshot = snapshotFor(incidentIndex, at, { movedRouteIndex: genuine && tick % 20 === 0 ? tick % ROUTE_COUNT : -1, extraReport: genuine });
      // The OLD design wrote a full, undeduplicated payload on every tick
      // (situationHash included route calculatedAt/validUntil, so it always
      // "changed"). Reconstruct that exact payload from the same snapshot —
      // not a separate/guessed shape — to measure it honestly.
      oldDesignBytes += Buffer.byteLength(JSON.stringify(snapshot));
      captures += 1;
      const result = await store.append(snapshot);
      if (result.state === 'APPENDED') appended += 1; else unchanged += 1;
    }
  }

  const persisted = await pool.query(`SELECT
      (SELECT coalesce(sum(pg_column_size(payload)),0)::bigint FROM incident_situation_snapshot) snapshot_bytes,
      (SELECT coalesce(sum(pg_column_size(geometry)+pg_column_size(roads)),0)::bigint FROM situation_route_artifact) artifact_bytes,
      (SELECT count(*)::int FROM incident_situation_snapshot) snapshot_rows,
      (SELECT count(*)::int FROM situation_route_artifact) artifact_rows`);
  const row = persisted.rows[0];
  const newDesignBytes = Number(row.snapshot_bytes) + Number(row.artifact_bytes);
  const reduction = 1 - newDesignBytes / oldDesignBytes;

  console.log(JSON.stringify({
    component: 'situation_snapshot_size_acceptance',
    captures, appended, unchanged,
    oldDesignBytes, oldDesignMB: Math.round(oldDesignBytes / 1e6 * 100) / 100,
    newDesignBytes, newDesignMB: Math.round(newDesignBytes / 1e6 * 100) / 100,
    snapshotRows: row.snapshot_rows, artifactRows: row.artifact_rows,
    reductionPercent: Math.round(reduction * 10000) / 100
  }));

  assert.equal(captures, INCIDENT_COUNT * CAPTURES_PER_INCIDENT);
  assert.ok(row.snapshot_rows < captures, 'unchanged ticks must not each produce a row');
  assert.ok(reduction >= 0.90, `expected at least 90% reduction, measured ${(reduction * 100).toFixed(2)}%`);
});
