import { immutable, requiredText, semanticHash } from '../intelligence/shared.mjs';

export function createQualityGate(input = {}) {
  const core = { id: requiredText(input.id, 'quality_gate_id_required'), version: requiredText(input.version, 'quality_gate_version_required'), dimension: requiredText(input.dimension, 'quality_gate_dimension_required'), critical: input.critical !== false, description: String(input.description ?? '') };
  return immutable({ ...core, fingerprint: semanticHash('quality-gate', core) });
}

export function evaluateQualityGates(gates = [], observations = {}) {
  const results = gates.map((gate) => { const observed = observations[gate.dimension], passed = observed === true || observed?.passed === true; return { gateId: gate.id, version: gate.version, dimension: gate.dimension, critical: gate.critical, passed, reasons: passed ? [] : [...new Set(observed?.reasons ?? [`${gate.dimension.toUpperCase()}_FAILED`])].sort() }; });
  const criticalFailures = results.filter((item) => item.critical && !item.passed), nonCriticalFailures = results.filter((item) => !item.critical && !item.passed);
  const state = criticalFailures.length ? 'FAILED' : nonCriticalFailures.length ? 'PASSED_WITH_WARNINGS' : 'PASSED';
  const core = { schemaVersion: 'vigia.quality-result.v1', state, weakestCriticalGate: criticalFailures[0]?.gateId ?? null, results };
  return immutable({ ...core, passed: !criticalFailures.length, fingerprint: semanticHash('quality-result', core) });
}
