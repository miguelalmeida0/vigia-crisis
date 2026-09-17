import test from 'node:test';
import assert from 'node:assert/strict';
import { assessDependencyReadiness } from '../demo/gateway-io.mjs';

const required = [
  'demo_identities',
  'authenticated_operator_boundary',
  'operator_state_persistence',
  'event_state_persistence',
  'postgres_physical_truth',
  'postgres_live_operations',
  'audit_chain',
  'scientific_runtime',
  'geo_proof_persistence'
];
const waived = ['production_synthetic_observations', 'unknown_to_work_invariant', 'physical_source_families'];
const readiness = ({ failed = waived, extra = [] } = {}) => ({
  schemaVersion: 'vigia.public-operational-readiness.v1',
  ready: false,
  status: 'not_ready',
  checks: [
    ...required.map(id => ({ id, ok: !failed.includes(id), state: 'fixture', blocking: true })),
    ...waived.map(id => ({ id, ok: !failed.includes(id), state: 'fixture', blocking: true })),
    ...extra
  ]
});

test('bounded demo accepts only the explicit production-only failures', () => {
  const result = assessDependencyReadiness(503, readiness(), { profile: 'bounded_demo' });
  assert.equal(result.ok, true);
  assert.equal(result.productionReady, false);
  assert.equal(result.boundedReadPlaneReady, true);
  assert.deepEqual(new Set(result.waivedChecks), new Set(waived));
});

test('normal operational readiness remains strict', () => {
  assert.deepEqual(
    assessDependencyReadiness(503, readiness(), { profile: 'operational' }),
    { ok: false, error: 'api_dependencies_not_ready' }
  );
});

test('bounded demo fails closed on every required technical dependency', () => {
  for (const id of required) {
    const result = assessDependencyReadiness(503, readiness({ failed: [...waived, id] }), { profile: 'bounded_demo' });
    assert.equal(result.ok, false, id);
    assert.equal(result.error, 'api_demo_required_dependency_not_ready', id);
    assert.ok(result.failedChecks.includes(id), id);
  }
});

test('bounded demo fails closed on an unknown future blocking check', () => {
  const result = assessDependencyReadiness(503, readiness({ extra: [{ id: 'future_critical_dependency', ok: false, state: 'failed', blocking: true }] }), { profile: 'bounded_demo' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'api_demo_unexpected_blocking_failure');
  assert.deepEqual(result.failedChecks, ['future_critical_dependency']);
});

test('bounded demo refuses malformed readiness contracts', () => {
  assert.equal(assessDependencyReadiness(503, { ready: false }, { profile: 'bounded_demo' }).error, 'api_demo_readiness_contract_invalid');
});
