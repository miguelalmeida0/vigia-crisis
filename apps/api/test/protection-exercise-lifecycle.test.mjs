import test from 'node:test';
import assert from 'node:assert/strict';
import { ProtectionWorkflowService } from '../src/modules/protection/protection-workflow-service.mjs';
import { ACTOR, CAP, ProbeTransport, START, TARGET, prepare, repository, workflowInput } from './protection-exercise-fixtures.mjs';

test('EXERCISE_SEND is authority-bound, receipt-backed, exact-once, and never invokes external transport', async () => {
  const store = repository({ protectionWorkflows: [], audit: [] });
  const transport = new ProbeTransport({ enabled: true });
  const service = new ProtectionWorkflowService({ repository: store, alertTransport: transport, clock: () => new Date(START) });
  const incidentId = 'incident:exercise-send';
  const workflowId = 'protect:exercise-send';
  const approval = await prepare(service, incidentId, workflowId);

  const draft = service.capDraft(ACTOR, incidentId, workflowId, CAP);
  assert.equal(draft.cap.status, 'Exercise');
  assert.equal(draft.cap.scope, 'Restricted');
  assert.equal(draft.transport.state, 'DISPATCH_DISABLED');
  assert.equal(draft.transport.deliveryMode, 'ISOLATED_EXERCISE_REPOSITORY');
  assert.equal(draft.transport.externalTransport, false);
  assert.equal(draft.authority.approvalReceiptId, approval.receipt.receiptId);

  const payload = { ...CAP, exerciseAction: 'SEND', exerciseTarget: TARGET, idempotencyKey: 'exercise:send:one' };
  const sent = await service.dispatchCap(ACTOR, incidentId, workflowId, payload);
  assert.equal(sent.workflow.state, 'EXERCISE_SENT');
  assert.equal(sent.workflow.universe, 'EXERCISE');
  assert.equal(sent.workflow.productionTruth, false);
  assert.equal(sent.workflow.dispatch.externalSendEnabled, false);
  assert.equal(sent.receipt.schemaVersion, 'vigia.protection-exercise-receipt.v1');
  assert.equal(sent.receipt.event, 'CAP_EXERCISE_SENT');
  assert.equal(sent.receipt.action, 'EXERCISE_SEND');
  assert.equal(sent.receipt.authorityBinding.approvalReceiptId, approval.receipt.receiptId);
  assert.equal(sent.receipt.universe, 'EXERCISE');
  assert.equal(sent.receipt.productionTruth, false);
  assert.equal(sent.receipt.externalTransportInvoked, false);
  assert.equal(sent.delivery.receiptId, sent.receipt.receiptId);
  assert.equal(sent.delivery.deliveryMode, 'ISOLATED_EXERCISE_REPOSITORY');
  assert.equal(sent.delivery.transportId, 'vigia-isolated-exercise-ledger');
  assert.equal(sent.delivery.externalTransportInvoked, false);
  assert.deepEqual(sent.delivery.target, TARGET);
  assert.equal(transport.sent.length, 0);

  const afterFirst = store.snapshot();
  const replay = await service.dispatchCap(ACTOR, incidentId, workflowId, payload);
  assert.equal(replay.receipt.receiptId, sent.receipt.receiptId);
  assert.equal(replay.receipt.idempotentReplay, true);
  assert.equal(store.snapshot().audit.length, afterFirst.audit.length);
  assert.equal(store.snapshot().protectionWorkflows[0].exerciseDeliveries.length, 1);
  assert.equal(transport.sent.length, 0);
  await assert.rejects(
    () => service.dispatchCap(ACTOR, incidentId, workflowId, { ...payload, headline: 'Conflicting replay' }),
    /idempotency_conflict/
  );
  await assert.rejects(
    () => service.dispatchCap({ ...ACTOR, id: 'supervisor:other' }, incidentId, workflowId, payload),
    /idempotency_conflict/
  );
});

test('exercise acknowledgement, update, supersede, cancel, and expiry are durable and bound to the latest delivery', async () => {
  let now = START;
  const store = repository({ protectionWorkflows: [], audit: [] });
  const transport = new ProbeTransport({ enabled: true });
  const service = new ProtectionWorkflowService({ repository: store, alertTransport: transport, clock: () => new Date(now) });

  await prepare(service, 'incident:exercise-lifecycle', 'protect:lifecycle');
  const sent = await service.dispatchCap(ACTOR, 'incident:exercise-lifecycle', 'protect:lifecycle', {
    ...CAP, exerciseAction: 'SEND', exerciseTarget: TARGET, idempotencyKey: 'exercise:lifecycle:send'
  });
  const acknowledgementPayload = {
    state: 'ACKNOWLEDGED',
    source: 'exercise-controller:eoc-1',
    receiptId: sent.delivery.receiptId,
    idempotencyKey: 'exercise:lifecycle:ack'
  };
  const acknowledged = await service.transition(ACTOR, 'incident:exercise-lifecycle', 'protect:lifecycle', acknowledgementPayload);
  assert.equal(acknowledged.workflow.state, 'ACKNOWLEDGED');
  assert.equal(acknowledged.receipt.event, 'CAP_EXERCISE_ACKNOWLEDGED');
  assert.equal(acknowledged.receipt.action, 'EXERCISE_ACKNOWLEDGE');
  const ackReplay = await service.transition(ACTOR, 'incident:exercise-lifecycle', 'protect:lifecycle', acknowledgementPayload);
  assert.equal(ackReplay.receipt.receiptId, acknowledged.receipt.receiptId);
  assert.equal(ackReplay.receipt.idempotentReplay, true);

  const updated = await service.dispatchCap(ACTOR, 'incident:exercise-lifecycle', 'protect:lifecycle', {
    ...CAP,
    headline: 'Updated exercise wildfire protection notice',
    exerciseAction: 'UPDATE',
    exerciseTarget: TARGET,
    references: [sent.delivery.receiptId],
    idempotencyKey: 'exercise:lifecycle:update'
  });
  assert.equal(updated.workflow.state, 'UPDATED');
  assert.equal(updated.receipt.event, 'CAP_EXERCISE_UPDATED');
  assert.notEqual(updated.delivery.capIdentifier, sent.delivery.capIdentifier);
  await assert.rejects(
    () => service.dispatchCap(ACTOR, 'incident:exercise-lifecycle', 'protect:lifecycle', {
      ...CAP, exerciseAction: 'SUPERSEDE',
      exerciseTarget: { type: 'EXERCISE_CONTROL', id: 'exercise-control:other' },
      references: [updated.delivery.receiptId], replacementReference: 'protect:replacement', idempotencyKey: 'exercise:lifecycle:bad-target'
    }),
    /target_not_bound_to_latest_delivery/
  );
  await assert.rejects(
    () => service.dispatchCap(ACTOR, 'incident:exercise-lifecycle', 'protect:lifecycle', {
      ...CAP, exerciseAction: 'SUPERSEDE', exerciseTarget: TARGET,
      references: [sent.delivery.receiptId], replacementReference: 'protect:replacement', idempotencyKey: 'exercise:lifecycle:bad-reference'
    }),
    /not_bound_to_latest_delivery/
  );
  const superseded = await service.dispatchCap(ACTOR, 'incident:exercise-lifecycle', 'protect:lifecycle', {
    ...CAP,
    exerciseAction: 'SUPERSEDE',
    exerciseTarget: TARGET,
    references: [updated.delivery.receiptId],
    replacementReference: 'protect:replacement',
    idempotencyKey: 'exercise:lifecycle:supersede'
  });
  assert.equal(superseded.workflow.state, 'SUPERSEDED');
  assert.equal(superseded.receipt.event, 'CAP_EXERCISE_SUPERSEDED');
  assert.equal(superseded.workflow.supersession.replacementReference, 'protect:replacement');

  await prepare(service, 'incident:exercise-cancel', 'protect:cancel');
  const cancelSent = await service.dispatchCap(ACTOR, 'incident:exercise-cancel', 'protect:cancel', {
    ...CAP, exerciseAction: 'SEND', exerciseTarget: TARGET, idempotencyKey: 'exercise:cancel:send'
  });
  const cancelled = await service.dispatchCap(ACTOR, 'incident:exercise-cancel', 'protect:cancel', {
    ...CAP,
    exerciseAction: 'CANCEL',
    exerciseTarget: TARGET,
    references: [cancelSent.delivery.capIdentifier],
    reason: 'Exercise controller terminated the scenario.',
    idempotencyKey: 'exercise:cancel:final'
  });
  assert.equal(cancelled.workflow.state, 'CANCELLED');
  assert.equal(cancelled.receipt.event, 'CAP_EXERCISE_CANCELLED');

  await prepare(service, 'incident:exercise-expire', 'protect:expire');
  now = '2026-09-04T14:00:01.000Z';
  const expired = await service.transition(ACTOR, 'incident:exercise-expire', 'protect:expire', {
    state: 'EXPIRED', idempotencyKey: 'exercise:expire:one'
  });
  assert.equal(expired.workflow.state, 'EXPIRED');
  assert.equal(expired.receipt.event, 'CAP_EXERCISE_EXPIRED');
  const expiryReplay = await service.transition(ACTOR, 'incident:exercise-expire', 'protect:expire', {
    state: 'EXPIRED', idempotencyKey: 'exercise:expire:one'
  });
  assert.equal(expiryReplay.receipt.receiptId, expired.receipt.receiptId);
  assert.equal(expiryReplay.receipt.idempotentReplay, true);
  assert.equal(transport.sent.length, 0);
});

test('exercise delivery enforces exact incident, universe, authority, and target while LIVE remains fail-closed', async () => {
  const exerciseStore = repository({ protectionWorkflows: [], audit: [] });
  const enabledTransport = new ProbeTransport({ enabled: true });
  const exerciseService = new ProtectionWorkflowService({ repository: exerciseStore, alertTransport: enabledTransport, clock: () => new Date(START) });
  await exerciseService.create(ACTOR, 'incident:unapproved', workflowInput('protect:unapproved'));
  await exerciseService.transition(ACTOR, 'incident:unapproved', 'protect:unapproved', { state: 'REVIEW' });
  await assert.rejects(
    () => exerciseService.dispatchCap(ACTOR, 'incident:unapproved', 'protect:unapproved', {
      ...CAP, exerciseAction: 'SEND', exerciseTarget: TARGET, idempotencyKey: 'exercise:unapproved'
    }),
    /receipt_bound_authority_approval/
  );
  await prepare(exerciseService, 'incident:bound', 'protect:bound');
  await assert.rejects(
    () => exerciseService.dispatchCap(ACTOR, 'incident:other', 'protect:bound', {
      ...CAP, exerciseAction: 'SEND', exerciseTarget: TARGET, idempotencyKey: 'exercise:wrong-incident'
    }),
    /not_found/
  );
  await assert.rejects(
    () => exerciseService.dispatchCap(ACTOR, 'incident:bound', 'protect:bound', {
      ...CAP, exerciseAction: 'SEND', idempotencyKey: 'exercise:no-target'
    }),
    /non_production.*isolated_exercise_target/
  );
  await assert.rejects(
    () => exerciseService.dispatchCap(ACTOR, 'incident:bound', 'protect:bound', {
      ...CAP, status: 'Actual', exerciseAction: 'SEND', exerciseTarget: TARGET, idempotencyKey: 'exercise:actual-status'
    }),
    /status_must_be_Exercise/
  );
  assert.equal(enabledTransport.sent.length, 0);

  const liveStore = repository({ protectionWorkflows: [], audit: [] });
  const disabledTransport = new ProbeTransport({ enabled: false });
  const liveService = new ProtectionWorkflowService({ repository: liveStore, alertTransport: disabledTransport, clock: () => new Date(START) });
  await prepare(liveService, 'incident:live', 'protect:live', 'LIVE_PRODUCTION');
  const auditBefore = liveStore.snapshot().audit.length;
  await assert.rejects(
    () => liveService.transition(ACTOR, 'incident:live', 'protect:live', {
      state: 'DISPATCHED', idempotencyKey: 'live:forged', deliveryReceipt: 'caller:forged'
    }),
    /external_protection_send_disabled/
  );
  await assert.rejects(
    () => liveService.dispatchCap(ACTOR, 'incident:live', 'protect:live', {
      ...CAP, status: 'Actual', idempotencyKey: 'live:disabled'
    }),
    /external_public_alert_transport_disabled/
  );
  await assert.rejects(
    () => liveService.dispatchCap(ACTOR, 'incident:live', 'protect:live', {
      ...CAP, status: 'Actual', exerciseAction: 'SEND', exerciseTarget: TARGET, idempotencyKey: 'live:exercise-escape'
    }),
    /exercise_delivery_requires_exercise_universe/
  );
  assert.equal(disabledTransport.sent.length, 0);
  assert.equal(liveStore.snapshot().audit.length, auditBefore);
  assert.equal(liveStore.snapshot().protectionWorkflows[0].state, 'DISPATCH_ELIGIBLE');
});
