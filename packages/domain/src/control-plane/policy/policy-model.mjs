import { immutable, isoTime, requiredText, semanticHash } from '../../intelligence/shared.mjs';

export const POLICY_KINDS = Object.freeze({
  MISSING_INDEPENDENT_CORROBORATION: 'MISSING_INDEPENDENT_CORROBORATION',
  SOURCE_STALE: 'SOURCE_STALE',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  BLOCKING_CONTRADICTION: 'BLOCKING_CONTRADICTION',
  SATISFIED_WORK_CLOSURE: 'SATISFIED_WORK_CLOSURE',
  CONSEQUENTIAL_WARNING_GUARD: 'CONSEQUENTIAL_WARNING_GUARD'
});

const KINDS = new Set(Object.values(POLICY_KINDS));

export function createPolicyVersion(input = {}) {
  const kind = String(input.kind ?? '').toUpperCase();
  if (!KINDS.has(kind)) throw new Error('invalid_control_policy_kind');
  const core = {
    schemaVersion: 'vigia.control-policy.v1',
    id: requiredText(input.id, 'control_policy_id_required'),
    version: requiredText(input.version, 'control_policy_version_required'),
    kind,
    description: requiredText(input.description, 'control_policy_description_required'),
    scope: structuredClone(input.scope ?? { hazardTypes: ['wildfire'] }),
    effectiveFrom: isoTime(input.effectiveFrom, 'control_policy_effective_from_required'),
    effectiveUntil: input.effectiveUntil ? isoTime(input.effectiveUntil, 'invalid_control_policy_effective_until') : null,
    priority: Number.isInteger(input.priority) ? input.priority : 100,
    parameters: structuredClone(input.parameters ?? {}),
    actionTemplate: structuredClone(input.actionTemplate ?? null),
    constraints: structuredClone(input.constraints ?? {}), budgets: structuredClone(input.budgets ?? null),
    doctrineReference: input.doctrineReference ? String(input.doctrineReference) : null, metadata: structuredClone(input.metadata ?? {}),
    supersedes: input.supersedes ? structuredClone(input.supersedes) : null
  };
  if (core.effectiveUntil && core.effectiveUntil <= core.effectiveFrom) throw new Error('invalid_control_policy_effective_window');
  return immutable({ ...core, fingerprint: semanticHash('control-policy', core) });
}

export function policyReference(policy) {
  if (!policy?.fingerprint) throw new Error('versioned_control_policy_required');
  return immutable({ id: policy.id, version: policy.version, fingerprint: policy.fingerprint });
}

export function effectivePolicies(policies = [], at) {
  assertPolicySetIntegrity(policies);
  const evaluatedAt = isoTime(at, 'policy_evaluation_time_required');
  const byId = new Map();
  for (const policy of policies) {
    if (policy.effectiveFrom > evaluatedAt || policy.effectiveUntil && policy.effectiveUntil <= evaluatedAt) continue;
    const prior = byId.get(policy.id);
    if (!prior || policy.effectiveFrom > prior.effectiveFrom || policy.effectiveFrom === prior.effectiveFrom && policy.version.localeCompare(prior.version) > 0) byId.set(policy.id, policy);
  }
  return [...byId.values()].sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
}

export function assertPolicySetIntegrity(policies = []) {
  const identities = new Map();
  for (const policy of policies) {
    if (!policy?.fingerprint) throw new Error('fingerprinted_control_policy_required');
    const key = `${policy.id}@${policy.version}`, prior = identities.get(key);
    if (prior && prior !== policy.fingerprint) throw new Error(`control_policy_identity_conflict:${key}`);
    identities.set(key, policy.fingerprint);
  }
  return true;
}
