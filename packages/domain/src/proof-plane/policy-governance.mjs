import { immutable, isoTime, semanticHash } from '../intelligence/shared.mjs';
import { evaluateCapability } from './capability.mjs';

export function authorizeTrustPolicyTransition({ currentPolicy, proposedPolicy, grants = [], principalId, organizationId, at } = {}) {
  const evaluatedAt = isoTime(at, 'policy_transition_time_required');
  if (!currentPolicy?.fingerprint || !proposedPolicy?.fingerprint) throw new Error('trust_policy_transition_binding_required');
  const capability = evaluateCapability(grants, { capability: 'trust-policy:modify', organizationId, resourceType: 'trust-policy',
    resourceId: currentPolicy.id, actionClass: 'POLICY_MODIFICATION' }, evaluatedAt);
  const core = { schemaVersion: 'vigia.trust-policy-transition.v1', principalId, organizationId, from: { id: currentPolicy.id, version: currentPolicy.version,
    fingerprint: currentPolicy.fingerprint }, to: { id: proposedPolicy.id, version: proposedPolicy.version, fingerprint: proposedPolicy.fingerprint },
    capability, evaluatedAt, state: capability.allowed ? 'AUTHORIZED' : 'DENIED' };
  return immutable({ ...core, transitionId: semanticHash('trust-policy-transition', core) });
}
