import {
  PROTECTION_TRANSITIONS,
  findExerciseReceipt,
  hasLiveIdempotency,
  protectionExerciseReceipt,
  protectionExpired,
  protectionFail,
  protectionList,
  protectionReceipt,
  protectionRequestHash,
  protectionText,
  protectionValues,
  protectionWorkflowIndex,
  replayExerciseResult
} from './protection-workflow-contract.mjs';

function transitionMaterial(target, incidentId, workflowId, input) {
  return { action: `EXERCISE_${target}`, incidentId, workflowId, source: input.source ?? null, receiptId: input.receiptId ?? null };
}

function assertExerciseReplay(found, { hash, incidentId, workflowId, actorId }) {
  if (found.receipt.requestHash !== hash || found.receipt.incidentId !== incidentId || found.receipt.workflowId !== workflowId || found.receipt.actorId !== actorId) {
    protectionFail('protection_exercise_idempotency_conflict', 409);
  }
}

export async function transitionProtectionWorkflow({ repository, clock, actor, actorId, incidentId, workflowId, input }) {
  const target = String(input.state ?? '');
  const nowDate = clock();
  const now = nowDate.toISOString();
  const idempotencyKey = input.idempotencyKey == null ? null : protectionText(input.idempotencyKey, 'exercise_transition_idempotency_key_required');
  const material = transitionMaterial(target, incidentId, workflowId, input);
  const materialHash = protectionRequestHash(material);
  let output;
  let receipt;
  if (idempotencyKey) {
    const initialState = repository.snapshot();
    if (hasLiveIdempotency(initialState, idempotencyKey)) protectionFail('protection_exercise_idempotency_conflict', 409);
    const found = findExerciseReceipt(initialState, idempotencyKey);
    if (found) {
      assertExerciseReplay(found, { hash: materialHash, incidentId, workflowId, actorId });
      return replayExerciseResult(found);
    }
  }
  await repository.mutate((state) => {
    if (idempotencyKey) {
      if (hasLiveIdempotency(state, idempotencyKey)) protectionFail('protection_exercise_idempotency_conflict', 409);
      const replay = findExerciseReceipt(state, idempotencyKey);
      if (replay) {
        assertExerciseReplay(replay, { hash: materialHash, incidentId, workflowId, actorId });
        output = replay.workflow;
        receipt = { ...replay.receipt, idempotentReplay: true };
        return state;
      }
    }
    const index = protectionWorkflowIndex(state, incidentId, workflowId);
    if (index < 0) protectionFail('protection_workflow_not_found', 404);
    const current = protectionList(state.protectionWorkflows)[index];
    const exerciseLifecycle = current.universe === 'EXERCISE' && ['ACKNOWLEDGED', 'EXPIRED'].includes(target);
    if (current.universe === 'EXERCISE' && ['UPDATED', 'CANCELLED'].includes(target) && protectionList(current.exerciseDeliveries).length) protectionFail('exercise_cap_lifecycle_requires_cap_dispatch', 409);
    if (!PROTECTION_TRANSITIONS[current.state]?.includes(target)) protectionFail('invalid_protection_transition', 409, { from: current.state, to: target });
    if (Date.parse(current.expiresAt) <= nowDate.getTime() && target !== 'EXPIRED') protectionFail('protection_authority_or_workflow_expired', 409);
    if (['APPROVED', 'DISPATCH_ELIGIBLE', 'DISPATCHED'].includes(target) && !['supervisor', 'administrator'].includes(actor?.role)) protectionFail('protection_approval_authority_required', 403);
    if (target === 'DISPATCHED' && current.universe !== 'LIVE_PRODUCTION') protectionFail('non_production_protection_dispatch_forbidden', 409);
    if (target === 'DISPATCHED' && !current.dispatch.externalSendEnabled) protectionFail('external_protection_send_disabled', 409);
    if (target === 'DISPATCHED') protectionFail('cap_dispatch_requires_transport_route', 409);
    if (exerciseLifecycle && !idempotencyKey) protectionFail('exercise_transition_idempotency_key_required');
    if (target === 'EXPIRED' && !protectionExpired(current, nowDate)) protectionFail('protection_workflow_not_expired', 409);
    let deliveryReference = null;
    if (current.universe === 'EXERCISE' && target === 'ACKNOWLEDGED') {
      protectionText(input.source, 'acknowledgement_source_required');
      deliveryReference = protectionText(input.receiptId, 'acknowledgement_receipt_required');
      const latest = protectionList(current.exerciseDeliveries).at(-1);
      if (!latest || ![latest.receiptId, latest.capIdentifier].includes(deliveryReference)) protectionFail('exercise_acknowledgement_receipt_not_bound_to_latest_delivery', 409);
    }
    const next = {
      ...current,
      state: target,
      updatedAt: now,
      history: [...protectionList(current.history), { state: target, at: now, actorId, note: input.note ? String(input.note) : null }]
    };
    if (target === 'REVIEW') next.approval = { ...next.approval, state: 'IN_REVIEW' };
    if (target === 'APPROVED') {
      next.approval = { state: 'APPROVED', approvedBy: actorId, approvedAt: now, receiptId: null };
      next.authority = { ...next.authority, state: 'CONFIRMED' };
    }
    if (target === 'REJECTED') next.approval = { state: 'REJECTED', approvedBy: actorId, approvedAt: now, receiptId: null, reason: protectionText(input.reason, 'rejection_reason_required') };
    if (target === 'DISPATCH_ELIGIBLE') next.dispatch = { ...next.dispatch, state: 'ELIGIBLE' };
    if (target === 'EXTERNAL_SEND_DISABLED') next.dispatch = { ...next.dispatch, state: 'EXTERNAL_SEND_DISABLED', externalSendEnabled: false };
    if (target === 'CANCELLED') next.supersession = { state: 'CANCELLED', at: now, reason: protectionText(input.reason, 'cancellation_reason_required') };
    if (target === 'EXPIRED') next.expiration = { at: now };
    if (target === 'ACKNOWLEDGED') next.acknowledgement = {
      state: 'ACKNOWLEDGED', at: now,
      source: protectionText(input.source, 'acknowledgement_source_required'),
      receiptId: current.universe === 'EXERCISE' ? deliveryReference : protectionText(input.receiptId, 'acknowledgement_receipt_required')
    };
    if (target === 'UPDATED') next.supersession = { state: 'UPDATED', at: now, references: protectionValues(input.references) };
    if (exerciseLifecycle) {
      receipt = protectionExerciseReceipt(clock, {
        workflow: current,
        event: target === 'ACKNOWLEDGED' ? 'CAP_EXERCISE_ACKNOWLEDGED' : 'CAP_EXERCISE_EXPIRED',
        action: `EXERCISE_${target === 'ACKNOWLEDGED' ? 'ACKNOWLEDGE' : 'EXPIRE'}`,
        actorId, idempotencyKey, hash: materialHash,
        target: protectionList(current.exerciseDeliveries).at(-1)?.target ?? null,
        cap: null, references: deliveryReference ? [deliveryReference] : []
      });
      next.exerciseReceipts = [...protectionList(current.exerciseReceipts), receipt];
    } else receipt = protectionReceipt(clock, next, `WORKFLOW_${target}`);
    if (target === 'APPROVED') next.approval.receiptId = receipt.receiptId;
    const workflows = [...protectionList(state.protectionWorkflows)];
    workflows[index] = next;
    output = next;
    return { ...state, protectionWorkflows: workflows, audit: [...protectionList(state.audit), receipt] };
  });
  return { workflow: output, receipt };
}
