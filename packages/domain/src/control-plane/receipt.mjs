import { immutable, isoTime, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';

export function createActionReceipt({ action, decision, desiredState, outcome, emittedEventIds = [], postcondition, at, executor, authority = null } = {}) {
  if (!action?.id || !decision?.decisionId || !desiredState?.id) throw new Error('receipt_binding_required');
  const binding = {
    actionId: action.id, actionFingerprint: semanticHash('receipt-action-binding', action), decisionId: decision.decisionId,
    desiredStateId: desiredState.id, policyFingerprint: decision.policy.fingerprint, idempotencyKey: action.idempotencyKey
  };
  const core = { schemaVersion: 'vigia.action-receipt.v1', binding, outcome: String(outcome ?? action.status),
    executor: String(executor ?? 'vigia-internal-control-executor'), authority: authority ? { principalId: authority.principalId, organizationId: authority.organizationId ?? null,
      authorityRef: authority.authorityRef, grantedCapabilities: uniqueSorted(authority.grantedCapabilities), proofFingerprints: uniqueSorted(authority.proofFingerprints) } : null,
    postcondition: structuredClone(postcondition ?? null),
    emittedEventIds: uniqueSorted(emittedEventIds), completedAt: isoTime(at, 'receipt_time_required') };
  const receiptHash = semanticHash('action-receipt-binding', core);
  return immutable({ ...core, id: semanticHash('action-receipt', { actionId: action.id, receiptHash }), receiptHash });
}

export function verifyActionReceipt(receipt, { action, decision, desiredState } = {}) {
  if (!receipt?.receiptHash || !action || !decision || !desiredState) return false;
  const expectedBinding = { actionId: action.id, actionFingerprint: semanticHash('receipt-action-binding', action), decisionId: decision.decisionId,
    desiredStateId: desiredState.id, policyFingerprint: decision.policy.fingerprint, idempotencyKey: action.idempotencyKey };
  const core = { schemaVersion: receipt.schemaVersion, binding: expectedBinding, outcome: receipt.outcome, executor: receipt.executor, authority: receipt.authority,
    postcondition: receipt.postcondition, emittedEventIds: receipt.emittedEventIds, completedAt: receipt.completedAt };
  return semanticHash('action-receipt-binding', core) === receipt.receiptHash;
}
