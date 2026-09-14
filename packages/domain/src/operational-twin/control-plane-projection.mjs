import { immutable } from '../intelligence/shared.mjs';

export function isControlPlaneEvent(event) {
  return event?.hazardType === 'control-plane' || event?.eventType?.startsWith('control.');
}

export function projectControlPlaneEvents(events = []) {
  const decisions = new Map(), desiredStates = new Map(), actions = new Map(), actionHistory = [], acquisitionRequests = new Map(), workItems = new Map(), receipts = new Map(), cycles = [];
  for (const event of events.filter(isControlPlaneEvent)) {
    const payload = event.payload ?? {}, type = payload.controlType;
    if (type === 'POLICY_DECISION' && payload.decision?.decisionId) decisions.set(payload.decision.decisionId, payload.decision);
    else if (type === 'DESIRED_STATE' && payload.desiredState?.id) desiredStates.set(payload.desiredState.id, payload.desiredState);
    else if (type === 'ACTION' && payload.action?.id) { actions.set(payload.action.id, payload.action); actionHistory.push(payload.action); }
    else if (type === 'ACQUISITION_REQUEST' && payload.request?.id) acquisitionRequests.set(payload.request.id, payload.request);
    else if (type === 'WORK_ITEM' && payload.workItem?.id) workItems.set(payload.workItem.id, payload.workItem);
    else if (type === 'RECEIPT' && payload.receipt?.id) receipts.set(payload.receipt.id, payload.receipt);
    else if (type === 'RECONCILIATION_CYCLE' && payload.cycle?.id) cycles.push(payload.cycle);
  }
  const ordered = (map) => [...map.values()].sort((left, right) => String(left.id ?? left.decisionId).localeCompare(String(right.id ?? right.decisionId)));
  return immutable({
    schemaVersion: 'vigia.control-plane-projection.v1', decisions: ordered(decisions), desiredStates: ordered(desiredStates),
    actions: ordered(actions), actionHistory, acquisitionRequests: ordered(acquisitionRequests), workItems: ordered(workItems), receipts: ordered(receipts),
    cycles: cycles.sort((left, right) => left.id.localeCompare(right.id)), eventCount: events.filter(isControlPlaneEvent).length
  });
}
