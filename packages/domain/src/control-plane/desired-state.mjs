import { immutable, isoTime, requiredText, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';
import { policyReference } from './policy/policy-model.mjs';

export function createDesiredState(input = {}) {
  const identity = {
    schemaVersion: 'vigia.desired-state.v1',
    subjectType: requiredText(input.subjectType, 'desired_state_subject_type_required'),
    subjectId: requiredText(input.subjectId, 'desired_state_subject_id_required'),
    state: requiredText(input.state, 'desired_state_value_required').toUpperCase(),
    policy: policyReference(input.policy),
    reasons: uniqueSorted(input.reasons),
    parameters: structuredClone(input.parameters ?? {}),
    supersedesDesiredStateIds: uniqueSorted(input.supersedesDesiredStateIds)
  };
  const id = semanticHash('desired-state', identity), core = { ...identity, id, effectiveAt: isoTime(input.effectiveAt, 'desired_state_time_required') };
  return immutable({ ...core, fingerprint: semanticHash('desired-state-record', core) });
}

export function desiredStateEqual(left, right) {
  return Boolean(left && right && left.subjectType === right.subjectType && left.subjectId === right.subjectId
    && left.state === right.state && semanticHash('desired-state-parameters', left.parameters) === semanticHash('desired-state-parameters', right.parameters));
}
