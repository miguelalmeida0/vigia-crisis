import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMO_INCIDENT_ID,
  REQUIRED_DEMO_IMPORT_RECORDS,
  validateDemoSeedComplete,
  validateDemoReplayPair
} from '../demo/seed-contract.mjs';

const complete = (overrides = {}) => ({
  step: 'seed_complete',
  incidentId: DEMO_INCIDENT_ID,
  canonicalEventId: 'canonical-event-demo-001',
  importStatus: 'VALID',
  universe: 'SHADOW',
  exercise: true,
  acceptedRecords: REQUIRED_DEMO_IMPORT_RECORDS,
  idempotentReplay: false,
  ...overrides
});

test('accepts the exact governed 13-record SHADOW exercise contract', () => {
  const result = validateDemoSeedComplete(complete());
  assert.equal(result.acceptedRecords, 13);
  assert.equal(result.universe, 'SHADOW');
  assert.equal(result.exercise, true);
});

test('fails closed on scenario identity, status, count, universe, exercise or canonical-event drift', () => {
  for (const overrides of [
    { incidentId: 'incident:wrong' },
    { importStatus: 'INVALID' },
    { acceptedRecords: 12 },
    { universe: 'PRODUCTION' },
    { exercise: false },
    { canonicalEventId: '' }
  ]) assert.throws(() => validateDemoSeedComplete(complete(overrides)));
});

test('requires an explicit replay-state boolean and can require idempotent replay', () => {
  assert.throws(() => validateDemoSeedComplete(complete({ idempotentReplay: undefined })));
  assert.throws(() => validateDemoSeedComplete(complete(), { requireIdempotentReplay: true }), /replay_not_idempotent/);
  assert.equal(validateDemoSeedComplete(complete({ idempotentReplay: true }), { requireIdempotentReplay: true }).idempotentReplay, true);
});

test('replay pair must preserve canonical event identity and be idempotent', () => {
  const first = complete();
  const second = complete({ idempotentReplay: true });
  assert.equal(validateDemoReplayPair(first, second).canonicalEventId, first.canonicalEventId);
  assert.throws(() => validateDemoReplayPair(first, complete({ canonicalEventId: 'canonical-event-demo-999', idempotentReplay: true })), /canonical_event_changed/);
});
