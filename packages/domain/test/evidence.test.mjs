import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyEvidence, canTransitionIncident } from '../src/evidence-policy.mjs';

test('independent spatial evidence is required for corroboration', () => {
  const reported = classifyEvidence([{ source: 'occurrence-report', independenceGroup: 'report', state: 'current', supports: true, spatiallyCorrelated: true }]);
  assert.equal(reported.stage, 'reported');
  const corroborated = classifyEvidence([
    { source: 'occurrence-report', independenceGroup: 'report', state: 'current', supports: true, spatiallyCorrelated: true },
    { source: 'thermal-detection', independenceGroup: 'thermal', state: 'current', supports: true, spatiallyCorrelated: true }
  ]);
  assert.equal(corroborated.stage, 'corroborated');
});

test('incident transitions reject unsafe jumps', () => {
  assert.equal(canTransitionIncident('reported', 'corroborated'), true);
  assert.equal(canTransitionIncident('reported', 'active'), false);
});
