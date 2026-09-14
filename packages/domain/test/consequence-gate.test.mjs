import test from 'node:test';
import assert from 'node:assert/strict';
import { consequenceGate } from '../src/consequence-gate.mjs';

test('consequence capability follows truth stage', () => {
  assert.equal(consequenceGate({ truthStage: 'reported', freshness: { state: 'current' } }).allowed, false);
  assert.equal(consequenceGate({ truthStage: 'corroborated', freshness: { state: 'current' } }).level, 'provisional');
  assert.equal(consequenceGate({ truthStage: 'verified', freshness: { state: 'current' } }, { externalProviderConfigured: true }).level, 'operational');
});
