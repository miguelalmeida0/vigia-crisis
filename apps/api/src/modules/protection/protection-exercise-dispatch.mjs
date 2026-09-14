import {
  EXERCISE_ACTIONS,
  EXERCISE_TRANSPORT,
  findExerciseReceipt,
  hasLiveIdempotency,
  protectionExerciseReceipt,
  protectionExerciseRequest,
  protectionExerciseTarget,
  protectionExpired,
  protectionFail,
  protectionList,
  protectionRequestHash,
  protectionText,
  protectionValues,
  protectionWorkflowIndex,
  replayExerciseResult
} from './protection-workflow-contract.mjs';

function assertExerciseDispatchReplay(found, { hash, workflowId, incidentId, actorId }) {
  if (found.receipt.requestHash !== hash || found.receipt.workflowId !== workflowId || found.receipt.incidentId !== incidentId || found.receipt.actorId !== actorId) {
    protectionFail('protection_exercise_idempotency_conflict', 409);
  }
}

export async function dispatchExerciseCap({ repository, clock, actor, actorId, incidentId, workflowId, workflow, input, capDraft }) {
  const action = String(input.exerciseAction ?? 'SEND').toUpperCase();
  const contract = EXERCISE_ACTIONS[action];
  if (!contract) protectionFail('invalid_exercise_cap_action');
  if (input.status != null && input.status !== 'Exercise') protectionFail('non_production_exercise_cap_status_must_be_Exercise', 409);
  if (input.scope != null && input.scope !== 'Restricted') protectionFail('non_production_exercise_cap_scope_must_be_Restricted', 409);
  const target = protectionExerciseTarget(input.exerciseTarget);
  const idempotencyKey = protectionText(input.idempotencyKey, 'dispatch_idempotency_key_required');
  const material = protectionExerciseRequest(action, input, target);
  const hash = protectionRequestHash(material);
  const initialState = repository.snapshot();
  if (hasLiveIdempotency(initialState, idempotencyKey)) protectionFail('protection_exercise_idempotency_conflict', 409);
  const found = findExerciseReceipt(initialState, idempotencyKey);
  if (found) {
    assertExerciseDispatchReplay(found, { hash, workflowId, incidentId, actorId });
    return replayExerciseResult(found);
  }
  if (!['supervisor', 'administrator'].includes(actor?.role)) protectionFail('protection_approval_authority_required', 403);
  if (workflow.approval?.state !== 'APPROVED' || workflow.authority?.state !== 'CONFIRMED' || !workflow.approval?.receiptId) protectionFail('exercise_cap_requires_receipt_bound_authority_approval', 409);
  if (protectionExpired(workflow, clock())) protectionFail('protection_authority_or_workflow_expired', 409);
  const deliveries = protectionList(workflow.exerciseDeliveries);
  const latest = deliveries.at(-1);
  if (action === 'SEND' && !['DISPATCH_ELIGIBLE', 'EXTERNAL_SEND_DISABLED'].includes(workflow.state)) protectionFail('exercise_cap_send_not_dispatch_eligible', 409);
  if (action !== 'SEND' && (!latest || !['EXERCISE_SENT', 'ACKNOWLEDGED', 'UPDATED'].includes(workflow.state))) protectionFail('exercise_cap_lifecycle_action_requires_prior_delivery', 409);
  if (action !== 'SEND') {
    const references = protectionValues(input.references);
    if (!references.some((reference) => [latest.receiptId, latest.capIdentifier].includes(reference))) protectionFail('exercise_cap_lifecycle_reference_not_bound_to_latest_delivery', 409);
    if (latest.target?.type !== target.type || latest.target?.id !== target.id) protectionFail('exercise_cap_lifecycle_target_not_bound_to_latest_delivery', 409);
  }
  if (action === 'SUPERSEDE') protectionText(input.replacementReference, 'exercise_supersession_replacement_reference_required');
  if (action === 'CANCEL') protectionText(input.reason, 'cancellation_reason_required');
  const draft = capDraft({
    ...input,
    identifier: input.identifier ?? `VIGIA-${workflowId}-${action}-${hash.slice(-12)}`,
    msgType: contract.messageType,
    status: 'Exercise',
    scope: 'Restricted'
  });
  const now = clock().toISOString();
  let output;
  await repository.mutate((state) => {
    if (hasLiveIdempotency(state, idempotencyKey)) protectionFail('protection_exercise_idempotency_conflict', 409);
    const replay = findExerciseReceipt(state, idempotencyKey);
    if (replay) {
      assertExerciseDispatchReplay(replay, { hash, workflowId, incidentId, actorId });
      output = replayExerciseResult(replay);
      return state;
    }
    const index = protectionWorkflowIndex(state, incidentId, workflowId);
    if (index < 0) protectionFail('protection_workflow_not_found', 404);
    const current = protectionList(state.protectionWorkflows)[index];
    if (current.universe !== 'EXERCISE') protectionFail('exercise_delivery_requires_exercise_universe', 409);
    if (current.state !== workflow.state || protectionList(current.exerciseDeliveries).length !== deliveries.length) protectionFail('protection_exercise_workflow_changed_during_dispatch', 409);
    const receipt = protectionExerciseReceipt(clock, { workflow: current, event: contract.event, action: `EXERCISE_${action}`, actorId, idempotencyKey, hash, target, cap: draft.cap, references: protectionValues(input.references) });
    const delivery = {
      schemaVersion: 'vigia.protection-exercise-delivery.v1', receiptId: receipt.receiptId,
      transportId: EXERCISE_TRANSPORT.transportId, deliveryMode: EXERCISE_TRANSPORT.deliveryMode,
      universe: 'EXERCISE', productionTruth: false, externalTransportInvoked: false, target,
      messageType: contract.messageType, capIdentifier: draft.cap.identifier, recordedAt: receipt.recordedAt,
      idempotencyKey, requestHash: hash
    };
    const next = {
      ...current, state: contract.nextState, productionTruth: false, updatedAt: now,
      dispatch: { ...current.dispatch, state: contract.nextState, externalSendEnabled: false, idempotencyKey: null, receipt: null, exerciseReceiptId: receipt.receiptId, recordedAt: now },
      exerciseDeliveries: [...protectionList(current.exerciseDeliveries), delivery],
      exerciseReceipts: [...protectionList(current.exerciseReceipts), receipt],
      history: [...protectionList(current.history), { state: contract.event, at: now, actorId, receiptId: receipt.receiptId }]
    };
    if (action === 'UPDATE') next.supersession = { state: 'UPDATED', at: now, references: protectionValues(input.references) };
    if (action === 'SUPERSEDE') next.supersession = { state: 'SUPERSEDED', at: now, references: protectionValues(input.references), replacementReference: protectionText(input.replacementReference, 'exercise_supersession_replacement_reference_required') };
    if (action === 'CANCEL') next.supersession = { state: 'CANCELLED', at: now, reason: protectionText(input.reason, 'cancellation_reason_required') };
    const workflows = [...protectionList(state.protectionWorkflows)];
    workflows[index] = next;
    output = { workflow: next, delivery, receipt };
    return { ...state, protectionWorkflows: workflows, audit: [...protectionList(state.audit), receipt] };
  });
  return output;
}
