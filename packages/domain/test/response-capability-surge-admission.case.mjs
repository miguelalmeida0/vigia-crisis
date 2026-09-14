import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResponseCapabilityProjection } from '../src/response-capability/index.mjs';
import { at } from './response-capability-fixtures.mjs';

test('medical and fire surge projections fail closed until admitted scenario ranges are supplied', () => {
  const withheld = buildResponseCapabilityProjection({ incident: { id: 'incident:one', coordinate: [-8.5, 41.2] }, generatedAt: at });
  for (const projection of [withheld.medicalSurge, withheld.fireResponseSurge]) {
    assert.equal(projection.state, 'WITHHELD_INSUFFICIENT_GOVERNED_INPUT');
    assert.ok(projection.reason);
    assert.ok(projection.unlockCondition);
    assert.ok(projection.requiredInputs.length);
    assert.equal(projection.executionClaimed, false);
  }

  const range = (min, max) => ({ min, max });
  const fireRangeSet = Object.fromEntries(['engines', 'tankers', 'crews', 'commandUnits', 'medicalSupport', 'waterSupport', 'airSupport'].map((kind, index) => [kind, range(index + 1, index + 2)]));
  const zeroRangeSet = Object.fromEntries(Object.keys(fireRangeSet).map((kind) => [kind, range(0, 0)]));
  const medicalSurgeInput = {
    admitted: true,
    admissionReference: 'admission:medical-surge:one',
    updatedAt: '2026-09-04T14:58:00Z',
    validUntil: '2026-09-04T15:30:00Z',
    source: { name: 'Admitted exercise model', reference: 'exercise:medical-surge:one' },
    scenarios: ['LOW', 'MODERATE', 'HIGH'].map((level, index) => ({
      level, range: [index + 1, index + 4], assumptions: ['Explicit exercise population and smoke inputs supplied.'],
      confidence: 'LIMITED_EXERCISE_MODEL', invalidatedBy: ['A newer admitted evacuation or hospital-capacity observation.']
    }))
  };
  const fireResponseSurgeInput = {
    admitted: true,
    admissionReference: 'admission:fire-surge:one',
    updatedAt: '2026-09-04T14:58:00Z',
    validUntil: '2026-09-04T15:30:00Z',
    source: { name: 'Admitted exercise model', reference: 'exercise:fire-surge:one' },
    requirements: fireRangeSet,
    available: zeroRangeSet,
    enRoute: zeroRangeSet,
    committed: zeroRangeSet,
    assumptions: ['Explicit exercise fire-demand ranges supplied.'],
    confidence: 'LIMITED_EXERCISE_MODEL',
    invalidatedBy: ['A newer admitted resource-status observation.']
  };
  const projected = buildResponseCapabilityProjection({
    incident: { id: 'incident:one', coordinate: [-8.5, 41.2] }, generatedAt: at,
    decisionContext: { medicalSurgeInput, fireResponseSurgeInput }
  });
  assert.equal(projected.medicalSurge.state, 'ADMITTED_SCENARIO_RANGES');
  assert.deepEqual(projected.medicalSurge.scenarios.map((item) => item.level), ['LOW', 'MODERATE', 'HIGH']);
  assert.equal(projected.medicalSurge.exactCasualtyPrediction, false);
  assert.equal(projected.fireResponseSurge.state, 'ADMITTED_SCENARIO_RANGES');
  assert.equal(projected.fireResponseSurge.resources.length, 7);
  assert.deepEqual(projected.fireResponseSurge.resources[0].gap, fireRangeSet.engines);
  assert.equal(projected.fireResponseSurge.dispatchClaimed, false);

  const unadmitted = buildResponseCapabilityProjection({
    incident: { id: 'incident:one', coordinate: [-8.5, 41.2] }, generatedAt: at,
    decisionContext: {
      medicalSurgeInput: { ...medicalSurgeInput, admissionReference: null },
      fireResponseSurgeInput: { ...fireResponseSurgeInput, admissionReference: null }
    }
  });
  assert.equal(unadmitted.medicalSurge.state, 'WITHHELD_INSUFFICIENT_GOVERNED_INPUT');
  assert.equal(unadmitted.fireResponseSurge.state, 'WITHHELD_INSUFFICIENT_GOVERNED_INPUT');

  const expired = buildResponseCapabilityProjection({
    incident: { id: 'incident:one', coordinate: [-8.5, 41.2] }, generatedAt: at,
    decisionContext: {
      medicalSurgeInput: { ...medicalSurgeInput, validUntil: at },
      fireResponseSurgeInput: { ...fireResponseSurgeInput, validUntil: at }
    }
  });
  assert.equal(expired.medicalSurge.state, 'WITHHELD_INSUFFICIENT_GOVERNED_INPUT');
  assert.equal(expired.fireResponseSurge.state, 'WITHHELD_INSUFFICIENT_GOVERNED_INPUT');
});
