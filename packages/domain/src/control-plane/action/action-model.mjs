import { immutable, isoTime, requiredText, semanticHash, uniqueSorted } from '../../intelligence/shared.mjs';
import { policyReference } from '../policy/policy-model.mjs';

export const ACTION_SAFETY_CLASSES = Object.freeze({ REVERSIBLE: 'REVERSIBLE', BOUNDED_OPERATIONAL: 'BOUNDED_OPERATIONAL', CONSEQUENTIAL: 'CONSEQUENTIAL' });
export const ACTION_STATUSES = Object.freeze(['PLANNED', 'STARTED', 'SUCCEEDED', 'FAILED', 'BLOCKED', 'AUTHORITY_REQUIRED', 'AUTHORIZED_BUT_EXECUTION_DISABLED', 'BUDGET_EXCEEDED', 'CIRCUIT_OPEN', 'CANCELLED', 'SUPERSEDED', 'SHADOW', 'DRY_RUN']);
const CLASSES = new Set(Object.values(ACTION_SAFETY_CLASSES)), STATUSES = new Set(ACTION_STATUSES);

export function createControlAction(input = {}) {
  const safetyClass = String(input.safetyClass ?? '').toUpperCase(), status = String(input.status ?? 'PLANNED').toUpperCase();
  if (!CLASSES.has(safetyClass)) throw new Error('invalid_action_safety_class');
  if (!STATUSES.has(status)) throw new Error('invalid_control_action_status');
  const identity = {
    incidentId: requiredText(input.incidentId, 'control_action_incident_required'),
    subjectType: requiredText(input.subjectType, 'control_action_subject_type_required'),
    subjectId: requiredText(input.subjectId, 'control_action_subject_id_required'),
    type: requiredText(input.type, 'control_action_type_required').toUpperCase(),
    desiredStateId: requiredText(input.desiredStateId, 'control_action_desired_state_required'),
    policy: policyReference(input.policy), target: structuredClone(input.target ?? null)
  };
  const id = semanticHash('control-action', identity), plannedAt = isoTime(input.plannedAt, 'control_action_time_required');
  return immutable({ schemaVersion: 'vigia.control-action.v1', ...identity, id, idempotencyKey: id, safetyClass,
    requiredCapabilities: uniqueSorted(input.requiredCapabilities), status, plannedAt, updatedAt: plannedAt, attempt: 0,
    parameters: structuredClone(input.parameters ?? {}), postcondition: structuredClone(input.postcondition ?? null), result: null, reasons: uniqueSorted(input.reasons) });
}

export function transitionControlAction(action, status, context = {}) {
  const next = String(status ?? '').toUpperCase();
  if (!action?.id || !STATUSES.has(next)) throw new Error('invalid_control_action_transition');
  const at = isoTime(context.at, 'control_action_transition_time_required');
  return immutable({ ...action, status: next, updatedAt: at, attempt: context.incrementAttempt ? action.attempt + 1 : action.attempt,
    result: context.result === undefined ? action.result : structuredClone(context.result), reasons: context.reasons ? uniqueSorted(context.reasons) : action.reasons });
}

export function terminalAction(action) {
  return ['SUCCEEDED', 'BLOCKED', 'AUTHORITY_REQUIRED', 'AUTHORIZED_BUT_EXECUTION_DISABLED', 'BUDGET_EXCEEDED', 'CIRCUIT_OPEN', 'CANCELLED', 'SUPERSEDED', 'SHADOW', 'DRY_RUN'].includes(action?.status);
}
