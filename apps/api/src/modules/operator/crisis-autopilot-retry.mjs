import { semanticHash } from '../../../../../packages/domain/src/intelligence/shared.mjs';
import { assertCoordinatorCapacity, errorReason, retryAt } from './crisis-autopilot-persistence.mjs';

const REFRESH_LEASE_MS = 30_000;

export async function retryAutopilotNotification(coordinator, receiptId, { force = false } = {}) {
  const at = coordinator.clock().toISOString(), nowMs = Date.parse(at);
  let claimed = false, receipt = null;
  await coordinator.repository.mutate((state) => {
    const receipts = [...(state.crisisAutopilotReceipts ?? [])], index = receipts.findIndex((item) => item.receiptId === receiptId);
    if (index < 0) throw new Error('crisis_autopilot_receipt_lost');
    const current = receipts[index], notification = current.notification ?? {};
    if (current.canonicalProjection?.state !== 'REFRESHED' || notification.state === 'DELIVERED') { receipt = current; return state; }
    const retryMs = Date.parse(notification.nextRetryAt ?? at), attemptMs = Date.parse(notification.lastAttemptAt ?? '');
    const leased = notification.state === 'DELIVERING' && Number.isFinite(attemptMs) && nowMs - attemptMs < REFRESH_LEASE_MS;
    if (!force && (leased || Number.isFinite(retryMs) && retryMs > nowMs)) { receipt = current; return state; }
    receipts[index] = { ...current, state: 'APPLIED_NOTIFICATION_IN_PROGRESS', notification: { ...notification, state: 'DELIVERING', attemptCount: Number(notification.attemptCount ?? 0) + 1, lastAttemptAt: at, nextRetryAt: null, reason: null } };
    receipt = receipts[index]; claimed = true;
    return { ...state, crisisAutopilotReceipts: receipts };
  });
  if (!claimed) return receipt;
  let failureReason = null;
  const payload = { incidentId: receipt.incidentId, receiptId, projectionHash: receipt.canonicalProjection.projectionHash };
  try {
    await coordinator.projectionInvalidator?.(payload);
    await coordinator.onChanged({ type: 'crisis_autopilot.coordinated', ...payload });
  } catch (error) { failureReason = errorReason(error); }
  const completedAt = coordinator.clock().toISOString();
  await coordinator.repository.mutate((state) => {
    const receipts = [...(state.crisisAutopilotReceipts ?? [])], index = receipts.findIndex((item) => item.receiptId === receiptId);
    if (index < 0) throw new Error('crisis_autopilot_receipt_lost');
    const current = receipts[index], attemptCount = Number(current.notification?.attemptCount ?? 1);
    receipts[index] = {
      ...current, state: failureReason ? 'APPLIED_NOTIFICATION_PENDING' : 'APPLIED',
      notification: { ...current.notification, state: failureReason ? 'DELIVERY_PENDING' : 'DELIVERED', deliveredAt: failureReason ? null : completedAt, reason: failureReason, nextRetryAt: failureReason ? retryAt(completedAt, attemptCount, coordinator.retryBaseMs, coordinator.retryMaxMs) : null },
    };
    receipt = receipts[index]; return { ...state, crisisAutopilotReceipts: receipts };
  });
  return receipt;
}

export async function retryAutopilotReceipt(coordinator, receiptId, { force = false, projectionRefresher = null } = {}) {
  const at = coordinator.clock().toISOString(), nowMs = Date.parse(at);
  let claimed = false, receipt = null;
  await coordinator.repository.mutate((state) => {
    const receipts = [...(state.crisisAutopilotReceipts ?? [])], index = receipts.findIndex((item) => item.receiptId === receiptId);
    if (index < 0) throw new Error('crisis_autopilot_receipt_lost');
    const current = receipts[index], projection = current.canonicalProjection ?? {};
    if (projection.state === 'REFRESHED') { receipt = current; return state; }
    const retryMs = Date.parse(projection.nextRetryAt ?? at), attemptMs = Date.parse(projection.lastAttemptAt ?? '');
    const leased = projection.state === 'REFRESHING' && Number.isFinite(attemptMs) && nowMs - attemptMs < REFRESH_LEASE_MS;
    if (!force && (leased || Number.isFinite(retryMs) && retryMs > nowMs)) { receipt = current; return state; }
    const attemptCount = Number(projection.attemptCount ?? 0) + 1;
    receipts[index] = { ...current, state: 'PERSISTED_REFRESH_IN_PROGRESS', canonicalProjection: { ...projection, state: 'REFRESHING', attemptCount, lastAttemptAt: at, nextRetryAt: null, reason: null } };
    receipt = receipts[index]; claimed = true;
    const recomputeActions = (state.crisisAutopilotRecomputeActions ?? []).map((item) => item.triggerReceiptId !== receiptId ? item : { ...item, state: 'REFRESHING', lastCheckedAt: at, nextCheckAt: null });
    return { ...state, crisisAutopilotReceipts: receipts, crisisAutopilotRecomputeActions: recomputeActions };
  });
  if (!claimed) return receipt?.canonicalProjection?.state === 'REFRESHED' && receipt?.notification?.state !== 'DELIVERED'
    ? retryAutopilotNotification(coordinator, receiptId, { force }) : receipt;
  let projectionResult, failureReason = null;
  try {
    const refresher = projectionRefresher ?? coordinator.projectionRefresher;
    projectionResult = typeof refresher === 'function' ? await refresher({ incidentId: receipt.incidentId, eventId: receipt.eventId, revision: receipt.revision, triggerType: receipt.triggerType, receiptId }) : null;
    if (!String(projectionResult?.projectionHash ?? '').trim()) failureReason = 'canonical_projection_refresher_did_not_return_projection_hash';
  } catch (error) { failureReason = errorReason(error); }
  const completedAt = coordinator.clock().toISOString();
  await coordinator.repository.mutate((state) => {
    const receipts = [...(state.crisisAutopilotReceipts ?? [])], index = receipts.findIndex((item) => item.receiptId === receiptId);
    if (index < 0) throw new Error('crisis_autopilot_receipt_lost');
    const current = receipts[index], attemptCount = Number(current.canonicalProjection?.attemptCount ?? 1), projectionHash = failureReason ? null : projectionResult.projectionHash;
    receipts[index] = { ...current, state: projectionHash ? 'APPLIED_NOTIFICATION_PENDING' : 'PERSISTED_REFRESH_PENDING', canonicalProjection: { ...current.canonicalProjection, state: projectionHash ? 'REFRESHED' : 'REFRESH_PENDING', projectionHash, refreshedAt: projectionHash ? completedAt : null, reason: failureReason, nextRetryAt: projectionHash ? null : retryAt(completedAt, attemptCount, coordinator.retryBaseMs, coordinator.retryMaxMs) } };
    const recomputeActions = (state.crisisAutopilotRecomputeActions ?? []).map((item) => item.triggerReceiptId !== receiptId ? item : { ...item, state: projectionHash ? 'COMPLETED' : 'REFRESH_REQUESTED', lastCheckedAt: completedAt, nextCheckAt: projectionHash ? null : receipts[index].canonicalProjection.nextRetryAt, completedAt: projectionHash ? completedAt : null, projectionHash });
    receipt = receipts[index]; return { ...state, crisisAutopilotReceipts: receipts, crisisAutopilotRecomputeActions: recomputeActions };
  });
  return receipt.canonicalProjection.state === 'REFRESHED' ? retryAutopilotNotification(coordinator, receiptId, { force: true }) : receipt;
}

export async function recordAutopilotCoordinationFailure(coordinator, trigger, error, proposedActions = []) {
  const at = coordinator.clock().toISOString(), failureId = semanticHash('crisis-autopilot-coordination-failure', trigger);
  let result;
  await coordinator.repository.mutate((state) => {
    const failures = [...(state.crisisAutopilotCoordinationFailures ?? [])], index = failures.findIndex((item) => item.failureId === failureId), prior = failures[index], attemptCount = Number(prior?.attemptCount ?? 0) + 1;
    const value = { schemaVersion: 'vigia.crisis-autopilot-coordination-failure.v1', failureId, incidentId: trigger.incidentId, trigger: structuredClone(trigger), proposedActions: structuredClone(proposedActions), state: 'RETRY_SCHEDULED', owner: 'VIGIA_CRISIS_AUTOPILOT_COORDINATOR', source: trigger.sourceReference ?? 'CANONICAL_OPERATIONAL_EVENT_JOURNAL', attemptCount, lastAttemptAt: at, nextCheckAt: retryAt(at, attemptCount, coordinator.retryBaseMs, coordinator.retryMaxMs), reason: errorReason(error), unlockCondition: 'Canonical event resolution and durable coordination complete successfully.', completionCriteria: 'A durable coordinator receipt is linked to this exact event revision.', createdAt: prior?.createdAt ?? at, updatedAt: at, truthBoundary: 'This is a retry lifecycle for an already persisted canonical event. It is not evidence, authority, execution, or an outcome.' };
    if (index < 0) { assertCoordinatorCapacity(failures, 'crisisAutopilotCoordinationFailures'); failures.unshift(value); } else failures[index] = value;
    result = value; return { ...state, crisisAutopilotCoordinationFailures: failures };
  });
  return result;
}

export async function clearAutopilotCoordinationFailure(coordinator, trigger) {
  const failureId = semanticHash('crisis-autopilot-coordination-failure', trigger);
  if (!((coordinator.repository.snapshotFields?.(['crisisAutopilotCoordinationFailures']) ?? coordinator.repository.snapshot()).crisisAutopilotCoordinationFailures ?? []).some((item) => item.failureId === failureId)) return false;
  await coordinator.repository.mutate((state) => ({ ...state, crisisAutopilotCoordinationFailures: (state.crisisAutopilotCoordinationFailures ?? []).filter((item) => item.failureId !== failureId) }));
  return true;
}

export async function retryAutopilotPending(coordinator, { force = false, limit = 100 } = {}) {
  const snapshot = coordinator.repository.snapshot(), atMs = Date.parse(coordinator.clock().toISOString()), results = [];
  let sharedProjectionRefresh = null;
  const refreshProjectionOnce = (payload) => {
    if (!sharedProjectionRefresh) {
      sharedProjectionRefresh = Promise.resolve().then(() => typeof coordinator.projectionRefresher === 'function'
        ? coordinator.projectionRefresher(payload)
        : null);
    }
    return sharedProjectionRefresh;
  };
  for (const receipt of (snapshot.crisisAutopilotReceipts ?? []).slice(0, Math.max(1, limit))) {
    if (!receipt.safeMutationCount) continue;
    const projectionDue = receipt.canonicalProjection?.state !== 'REFRESHED' && Date.parse(receipt.canonicalProjection?.nextRetryAt ?? 0) <= atMs;
    const notificationDue = receipt.canonicalProjection?.state === 'REFRESHED' && receipt.notification?.state !== 'DELIVERED' && Date.parse(receipt.notification?.nextRetryAt ?? 0) <= atMs;
    if (force || projectionDue) results.push(await retryAutopilotReceipt(coordinator, receipt.receiptId, { force, projectionRefresher: refreshProjectionOnce }));
    else if (notificationDue) results.push(await retryAutopilotNotification(coordinator, receipt.receiptId, { force }));
  }
  for (const failure of (snapshot.crisisAutopilotCoordinationFailures ?? []).slice(0, Math.max(1, limit))) {
    if (!force && Date.parse(failure.nextCheckAt ?? 0) > atMs) continue;
    try {
      const receipt = await coordinator.consume(failure.trigger, { proposedActions: failure.proposedActions });
      await clearAutopilotCoordinationFailure(coordinator, failure.trigger); results.push(receipt);
    } catch (error) { results.push(await recordAutopilotCoordinationFailure(coordinator, failure.trigger, error, failure.proposedActions)); }
  }
  return { schemaVersion: 'vigia.crisis-autopilot-retry-cycle.v1', considered: (snapshot.crisisAutopilotReceipts ?? []).length + (snapshot.crisisAutopilotCoordinationFailures ?? []).length, attempted: results.length, results };
}
