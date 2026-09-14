import { immutable, isoTime, semanticHash } from '../intelligence/shared.mjs';
import { policyReference } from './policy/policy-model.mjs';

export function createControlWorkItem({ incidentId, kind, policy, actionId, at, status = 'ACTIVE', subjectIds = [] } = {}) {
  if (!incidentId || !kind || !actionId || !['ACTIVE', 'CLOSED', 'SUPERSEDED'].includes(status)) throw new Error('invalid_control_work_item');
  const identity = { incidentId: String(incidentId), kind: String(kind), policy: policyReference(policy), subjectIds: [...new Set(subjectIds.map(String))].sort() };
  return immutable({ schemaVersion: 'vigia.control-work-item.v1', ...identity, id: semanticHash('control-work-item', identity),
    actionId, status, updatedAt: isoTime(at, 'control_work_item_time_required') });
}

export function transitionControlWorkItem(workItem, status, { actionId, at } = {}) {
  if (!workItem?.id || !['ACTIVE', 'CLOSED', 'SUPERSEDED'].includes(status)) throw new Error('invalid_control_work_item_transition');
  return immutable({ ...workItem, actionId: actionId ?? workItem.actionId, status, updatedAt: isoTime(at, 'control_work_item_time_required') });
}
