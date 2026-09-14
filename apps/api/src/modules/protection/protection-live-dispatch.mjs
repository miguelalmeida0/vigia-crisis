import {
  hasExerciseIdempotency,
  hasLiveIdempotency,
  protectionFail,
  protectionList,
  protectionReceipt,
  protectionText,
  protectionValues,
  protectionWorkflowIndex
} from './protection-workflow-contract.mjs';

export async function dispatchLiveCap({ repository, clock, alertTransport, actorId, incidentId, workflowId, workflow, input, draft, before }) {
  if (!alertTransport.enabled) protectionFail('external_public_alert_transport_disabled', 503);
  const idempotencyKey = protectionText(input.idempotencyKey, 'dispatch_idempotency_key_required');
  if (hasLiveIdempotency(before, idempotencyKey) || hasExerciseIdempotency(before, idempotencyKey)) protectionFail('duplicate_protection_dispatch', 409);
  const kind = draft.cap.msgType;
  if (kind === 'Alert' && workflow.state !== 'DISPATCH_ELIGIBLE') protectionFail('cap_alert_not_dispatch_eligible', 409);
  if (kind === 'Update' && !['DISPATCHED', 'ACKNOWLEDGED', 'UPDATED'].includes(workflow.state)) protectionFail('cap_update_requires_prior_dispatch', 409);
  if (kind === 'Cancel' && !['DISPATCHED', 'ACKNOWLEDGED', 'UPDATED'].includes(workflow.state)) protectionFail('cap_cancel_requires_prior_dispatch', 409);
  const transportDelivery = await alertTransport.send({ cap: draft.cap, idempotencyKey });
  const receiptId = protectionText(transportDelivery?.receiptId, 'delivery_receipt_required');
  const now = clock().toISOString();
  let output;
  await repository.mutate((state) => {
    if (hasLiveIdempotency(state, idempotencyKey) || hasExerciseIdempotency(state, idempotencyKey)) protectionFail('duplicate_protection_dispatch', 409);
    const index = protectionWorkflowIndex(state, incidentId, workflowId);
    if (index < 0) protectionFail('protection_workflow_not_found', 404);
    const current = structuredClone(protectionList(state.protectionWorkflows)[index]);
    const nextState = kind === 'Cancel' ? 'CANCELLED' : kind === 'Update' ? 'UPDATED' : 'DISPATCHED';
    const next = {
      ...current, state: nextState, updatedAt: now,
      dispatch: { ...current.dispatch, state: nextState === 'DISPATCHED' ? 'DISPATCHED' : current.dispatch.state, externalSendEnabled: true, idempotencyKey, receipt: receiptId, sentAt: now },
      dispatchDeliveries: [...protectionList(current.dispatchDeliveries), { messageType: kind, idempotencyKey, receiptId, sentAt: now, transportId: alertTransport.id }],
      history: [...protectionList(current.history), { state: `CAP_${kind.toUpperCase()}_DISPATCHED`, at: now, actorId }]
    };
    if (kind === 'Update') next.supersession = { state: 'UPDATED', at: now, references: protectionValues(input.references) };
    if (kind === 'Cancel') next.supersession = { state: 'CANCELLED', at: now, reason: protectionText(input.reason, 'cancellation_reason_required') };
    const receipt = protectionReceipt(clock, next, `CAP_${kind.toUpperCase()}_DISPATCHED`);
    const workflows = [...protectionList(state.protectionWorkflows)];
    workflows[index] = next;
    output = {
      workflow: next, receipt,
      delivery: { receiptId, transportId: alertTransport.id, deliveryMode: 'EXTERNAL_TRANSPORT', universe: 'LIVE_PRODUCTION', productionTruth: true, externalTransportInvoked: true, messageType: kind, capIdentifier: draft.cap.identifier }
    };
    return { ...state, protectionWorkflows: workflows, audit: [...protectionList(state.audit), receipt] };
  });
  return output;
}
