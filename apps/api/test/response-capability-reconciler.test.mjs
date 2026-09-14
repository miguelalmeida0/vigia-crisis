import test from 'node:test';
import assert from 'node:assert/strict';
import { ResponseCapabilityReconciler } from '../src/modules/response-capability/response-capability-reconciler.mjs';

const baseAt = '2026-09-05T08:00:00.000Z';

function incident(id, overrides = {}) {
  return {
    incident: { id, coordinate: [-8.5, 41.2], status: 'OPEN', ...(overrides.incident ?? {}) },
    evaluation: { requirementsSatisfied: true },
    evidenceGraph: { observations: [{ id: `observation:${id}`, observedAt: baseAt }] },
    ...overrides
  };
}

test('background reconciliation is bounded, active/geolocated only, rotating, and revision-idempotent', async () => {
  let now = new Date(baseAt);
  const calls = [];
  const service = {
    async projectIncident(item) {
      calls.push(item.incident.id);
      return { projectionId: `projection:${item.incident.id}` };
    }
  };
  const reconciler = new ResponseCapabilityReconciler({
    responseCapabilityService: service, clock: () => now,
    maxIncidentsPerCycle: 2, minimumRepeatMs: 5 * 60_000
  });
  const twin = {
    incidents: [
      incident('incident:a'), incident('incident:b'), incident('incident:c'),
      incident('incident:stale', { evidenceGraph: { observations: [{ observedAt: '2026-09-01T00:00:00Z' }] } }),
      incident('incident:unverified', { evaluation: { requirementsSatisfied: false } }),
      incident('incident:ungeolocated', { incident: { id: 'incident:ungeolocated', status: 'OPEN' } })
    ]
  };
  const first = await reconciler.reconcile({ twin });
  assert.equal(first.governedIncidentCount, 3);
  assert.equal(first.selectedIncidentCount, 2);
  assert.deepEqual(calls, ['incident:a', 'incident:b']);
  const second = await reconciler.reconcile({ twin });
  assert.equal(second.selectedIncidentCount, 1);
  assert.deepEqual(calls, ['incident:a', 'incident:b', 'incident:c']);
  const third = await reconciler.reconcile({ twin });
  assert.equal(third.selectedIncidentCount, 0);
  assert.equal(calls.length, 3);
  now = new Date('2026-09-05T08:06:00Z');
  const afterBackoff = await reconciler.reconcile({ twin });
  assert.equal(afterBackoff.selectedIncidentCount, 2);
  assert.equal(calls.length, 5);
  assert.match(afterBackoff.truthBoundary, /does not dispatch, assign, authorize/);
});

test('concurrent background triggers coalesce into one response-capability projection', async () => {
  let release;
  let calls = 0;
  const wait = new Promise((resolve) => { release = resolve; });
  const reconciler = new ResponseCapabilityReconciler({
    responseCapabilityService: { async projectIncident() { calls += 1; await wait; return { projectionId: 'projection:a' }; } },
    clock: () => new Date(baseAt), maxIncidentsPerCycle: 1
  });
  const twin = { incidents: [incident('incident:a')] };
  const left = reconciler.reconcile({ twin });
  const right = reconciler.reconcile({ twin });
  release();
  const [a, b] = await Promise.all([left, right]);
  assert.equal(calls, 1);
  assert.deepEqual(a, b);
});
