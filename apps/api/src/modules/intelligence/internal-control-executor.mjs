import {
  createAcquisitionRequest, createControlWorkItem, transitionAcquisitionRequest, transitionControlWorkItem
} from '../../../../../packages/domain/src/control-plane/index.mjs';

function retryAt(policy, action, at) {
  const base = Number(policy.parameters?.baseBackoffMs ?? 30_000), maximum = Number(policy.parameters?.maximumBackoffMs ?? 900_000);
  return new Date(Date.parse(at) + Math.min(maximum, base * 2 ** Math.max(0, action.attempt - 1))).toISOString();
}

export class InternalControlExecutor {
  id = 'vigia-internal-control-executor';
  async execute({ action, policy, twin, at }) {
    if (action.type === 'CREATE_ACQUISITION_REQUEST') {
      const request = createAcquisitionRequest({ incidentId: action.incidentId, need: action.parameters.need, sourceId: action.target.sourceId, policy, at, actionId: action.id });
      return { records: [{ controlType: 'ACQUISITION_REQUEST', record: request }], result: { requestId: request.id } };
    }
    if (action.type === 'RECOMPUTE_SOURCE_SELECTION' || action.type === 'BACKOFF_PROVIDER') {
      const request = twin.controlPlane.acquisitionRequests.find((item) => item.id === action.target.requestId) ?? action.parameters.request;
      const status = action.type === 'BACKOFF_PROVIDER' ? 'BACKOFF' : 'SUPERSEDED';
      const updated = transitionAcquisitionRequest(request, status, { at, actionId: action.id, retryAt: status === 'BACKOFF' ? retryAt(policy, action, at) : null });
      return { records: [{ controlType: 'ACQUISITION_REQUEST', record: updated }], result: { requestId: updated.id, status } };
    }
    if (action.type === 'OPEN_CONTRADICTION_WORK') {
      const workItem = createControlWorkItem({ incidentId: action.incidentId, kind: 'CONTRADICTION_RESOLUTION', policy, actionId: action.id, at });
      return { records: [{ controlType: 'WORK_ITEM', record: workItem }], result: { workItemId: workItem.id } };
    }
    if (action.type === 'CLOSE_RESOLVED_WORK') {
      const requests = action.parameters.requestIds.map((id) => twin.controlPlane.acquisitionRequests.find((item) => item.id === id)).filter(Boolean)
        .map((request) => ({ controlType: 'ACQUISITION_REQUEST', record: transitionAcquisitionRequest(request, 'SUPERSEDED', { at, actionId: action.id }) }));
      const workItems = (action.parameters.workItemIds ?? []).map((id) => twin.controlPlane.workItems.find((item) => item.id === id)).filter(Boolean)
        .map((workItem) => ({ controlType: 'WORK_ITEM', record: transitionControlWorkItem(workItem, 'CLOSED', { at, actionId: action.id }) }));
      return { records: [...requests, ...workItems], result: { supersededRequestIds: requests.map((item) => item.record.id).sort(), closedWorkItemIds: workItems.map((item) => item.record.id).sort() } };
    }
    throw Object.assign(new Error(`internal_control_action_unsupported:${action.type}`), { code: 'INTERNAL_ACTION_UNSUPPORTED' });
  }
}
