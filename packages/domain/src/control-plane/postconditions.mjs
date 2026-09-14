import { immutable } from '../intelligence/shared.mjs';

export function evaluateActionPostcondition(twin, condition, incidentId) {
  if (!condition) return immutable({ satisfied: true, state: 'NO_POSTCONDITION', evidence: [] });
  const requests = twin.controlPlane.acquisitionRequests, workItems = twin.controlPlane.workItems;
  let satisfied = false, evidence = [];
  if (condition.kind === 'ACQUISITION_REQUEST_STATUS') {
    evidence = requests.filter((item) => item.incidentId === incidentId && item.needId === condition.needId && item.status === condition.status);
    satisfied = evidence.length > 0;
  } else if (condition.kind === 'ACQUISITION_REQUEST_NOT_ACTIVE') {
    evidence = requests.filter((item) => item.id === condition.requestId); satisfied = evidence.length > 0 && evidence.every((item) => item.status !== 'ACTIVE');
  } else if (condition.kind === 'NO_ACTIVE_ACQUISITION_REQUESTS') {
    evidence = requests.filter((item) => item.incidentId === incidentId && ['ACTIVE', 'BACKOFF'].includes(item.status)); satisfied = evidence.length === 0;
  } else if (condition.kind === 'ACQUISITION_REQUESTS_NOT_ACTIVE') {
    const ids = new Set(condition.requestIds ?? []); evidence = requests.filter((item) => ids.has(item.id));
    satisfied = evidence.length === ids.size && evidence.every((item) => !['ACTIVE', 'BACKOFF'].includes(item.status));
  } else if (condition.kind === 'WORK_ITEM_STATUS') {
    evidence = workItems.filter((item) => item.incidentId === incidentId && item.kind === condition.workKind && item.status === condition.status); satisfied = evidence.length > 0;
  } else if (condition.kind === 'RESOLVED_WORK_CLOSED') {
    const requestIds = new Set(condition.requestIds ?? []), workItemIds = new Set(condition.workItemIds ?? []);
    const requestEvidence = requests.filter((item) => requestIds.has(item.id)), workEvidence = workItems.filter((item) => workItemIds.has(item.id));
    evidence = [...requestEvidence, ...workEvidence]; satisfied = requestEvidence.length === requestIds.size && workEvidence.length === workItemIds.size
      && requestEvidence.every((item) => !['ACTIVE', 'BACKOFF'].includes(item.status)) && workEvidence.every((item) => item.status !== 'ACTIVE');
  }
  return immutable({ satisfied, state: satisfied ? 'SATISFIED' : 'UNSATISFIED', evidence: evidence.map((item) => item.id).sort() });
}
