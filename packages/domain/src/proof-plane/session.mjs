import { immutable, isoTime, requiredText, semanticHash } from '../intelligence/shared.mjs';

export function createSessionClaim(input = {}) {
  const core = { schemaVersion: 'vigia.session-claim.v1', sessionId: requiredText(input.sessionId, 'session_id_required'),
    principalId: requiredText(input.principalId, 'session_principal_required'), organizationId: input.organizationId ? String(input.organizationId) : null,
    credentialId: requiredText(input.credentialId, 'session_credential_required'), deviceId: requiredText(input.deviceId, 'session_device_required'),
    authenticationMethods: [...new Set((input.authenticationMethods ?? []).map(String))].sort(), issuedAt: isoTime(input.issuedAt, 'session_issued_at_required'),
    expiresAt: isoTime(input.expiresAt, 'session_expiry_required'), channelBinding: requiredText(input.channelBinding, 'session_channel_binding_required') };
  if (core.expiresAt <= core.issuedAt) throw new Error('invalid_session_window');
  return immutable({ ...core, bindingHash: semanticHash('session-binding', core) });
}

export function evaluateSessionBinding({ verification, statement, actionStatement, at } = {}) {
  const reasons = [], claim = statement?.payload ?? {}, evaluatedAt = isoTime(at, 'session_evaluation_time_required');
  if (verification?.status !== 'VALID' || statement?.statementType !== 'SESSION') reasons.push('VALID_SESSION_PROOF_REQUIRED');
  if (claim.expiresAt <= evaluatedAt) reasons.push('SESSION_EXPIRED');
  if (actionStatement?.sessionId !== claim.sessionId) reasons.push('ACTION_SESSION_MISMATCH');
  if (actionStatement?.principalId !== claim.principalId) reasons.push('SESSION_PRINCIPAL_MISMATCH');
  if (actionStatement?.deviceId !== claim.deviceId) reasons.push('SESSION_DEVICE_MISMATCH');
  if (!(actionStatement?.credentialRefs ?? []).includes(claim.credentialId)) reasons.push('SESSION_CREDENTIAL_MISMATCH');
  return immutable({ valid: reasons.length === 0, state: reasons.length ? 'DENIED' : 'VALID', reasons, sessionId: claim.sessionId ?? null });
}
