import test from 'node:test';
import assert from 'node:assert/strict';
import { responseSnapshot } from '../src/modules/response/response-context.mjs';

test('response context preserves official response separately from physical evidence', () => {
  const snapshot = responseSnapshot({
    id: 'event-1',
    observations: [{
      id: 'report-1', type: 'report', at: '2026-08-11T10:00:00Z', status: 'active',
      resources: { available: true, operatives: 34, ground: 9, aerial: 2 },
      provenance: { provider: 'ptdata', synthetic: false }
    }]
  });
  assert.equal(snapshot.state, 'available');
  assert.equal(snapshot.personnel, 34);
  assert.equal(snapshot.groundVehicles, 9);
  assert.equal(snapshot.aircraft, 2);
  assert.equal(snapshot.provenance.synthetic, false);
});

test('response context does not convert missing resource fields into zero resources', () => {
  const snapshot = responseSnapshot({
    id: 'event-2',
    observations: [{ id: 'report-2', type: 'report', at: '2026-08-11T10:00:00Z', status: 'active', resources: { available: false, operatives: 0, ground: 0, aerial: 0 } }]
  });
  assert.equal(snapshot.state, 'status_only');
  assert.equal(snapshot.personnel, null);
  assert.equal(snapshot.groundVehicles, null);
  assert.equal(snapshot.aircraft, null);
});
