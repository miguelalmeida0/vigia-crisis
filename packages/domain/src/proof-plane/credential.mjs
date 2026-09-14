import { immutable, isoTime, requiredText, semanticHash } from '../intelligence/shared.mjs';

export function createCredentialClaim(input = {}) {
  const core = { schemaVersion: 'vigia.credential-claim.v1', credentialId: requiredText(input.credentialId, 'credential_id_required'),
    subjectPrincipalId: requiredText(input.subjectPrincipalId, 'credential_subject_required'), organizationId: requiredText(input.organizationId, 'credential_organization_required'),
    roleIds: [...new Set((input.roleIds ?? []).map(String))].sort(), grants: structuredClone(input.grants ?? []),
    issuedAt: isoTime(input.issuedAt, 'credential_issued_at_required'), validFrom: isoTime(input.validFrom ?? input.issuedAt, 'credential_valid_from_required'),
    validUntil: isoTime(input.validUntil, 'credential_valid_until_required'), assuranceLevel: String(input.assuranceLevel ?? 'BASIC').toUpperCase(),
    credentialType: String(input.credentialType ?? 'VIGIA_LOCAL').toUpperCase(), externalReferences: structuredClone(input.externalReferences ?? {}) };
  if (core.validUntil <= core.validFrom) throw new Error('invalid_credential_window');
  return immutable({ ...core, fingerprint: semanticHash('credential-claim', core) });
}

export function evaluateCredentialClaim(claim, { principalId, organizationId, at } = {}) {
  const evaluatedAt = isoTime(at, 'credential_evaluation_time_required'), reasons = [];
  if (claim?.schemaVersion !== 'vigia.credential-claim.v1') reasons.push('CREDENTIAL_CLAIM_MALFORMED');
  if (claim?.subjectPrincipalId !== principalId) reasons.push('CREDENTIAL_SUBJECT_MISMATCH');
  if (organizationId && claim?.organizationId !== organizationId) reasons.push('CREDENTIAL_ORGANIZATION_MISMATCH');
  if (claim?.validFrom > evaluatedAt) reasons.push('CREDENTIAL_NOT_YET_VALID');
  if (claim?.validUntil <= evaluatedAt) reasons.push('CREDENTIAL_EXPIRED');
  return immutable({ valid: reasons.length === 0, state: reasons.length ? 'DENIED' : 'VALID', reasons, credentialId: claim?.credentialId ?? null });
}
