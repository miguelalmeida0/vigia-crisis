import { immutable, isoTime, requiredText, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';

export function createRevocation(input = {}) {
  const core = { schemaVersion: 'vigia.revocation.v1', targetType: requiredText(input.targetType, 'revocation_target_type_required').toUpperCase(),
    targetId: requiredText(input.targetId, 'revocation_target_id_required'), effectiveAt: isoTime(input.effectiveAt, 'revocation_effective_time_required'),
    recordedAt: isoTime(input.recordedAt ?? input.effectiveAt, 'revocation_recorded_time_required'),
    compromisedSince: input.compromisedSince ? isoTime(input.compromisedSince, 'invalid_compromised_since') : null,
    issuerId: requiredText(input.issuerId, 'revocation_issuer_required'), reason: requiredText(input.reason, 'revocation_reason_required') };
  if (core.compromisedSince && core.compromisedSince > core.effectiveAt) throw new Error('compromise_after_revocation');
  return immutable({ ...core, id: semanticHash('revocation', core) });
}

export function createRevocationRegistry(records = []) {
  const revocations = records.map(createRevocation).sort((left, right) => left.recordedAt.localeCompare(right.recordedAt) || left.id.localeCompare(right.id));
  return immutable({ schemaVersion: 'vigia.revocation-registry.v1', revocations,
    fingerprint: semanticHash('revocation-registry', revocations.map((record) => record.id)) });
}

export function revocationStatus(registry, { targets = [], statementAt, evaluatedAt } = {}) {
  const issuedAt = isoTime(statementAt, 'revocation_statement_time_required'), at = isoTime(evaluatedAt, 'revocation_evaluation_time_required');
  const targetKeys = new Set(targets.map((item) => `${String(item.type).toUpperCase()}:${item.id}`));
  const matches = (registry?.revocations ?? []).filter((record) => targetKeys.has(`${record.targetType}:${record.targetId}`) && record.recordedAt <= at);
  const applicable = matches.filter((record) => record.compromisedSince ? issuedAt >= record.compromisedSince : record.effectiveAt <= at);
  return immutable({ revoked: applicable.length > 0, state: applicable.length ? 'REVOKED' : 'VALID',
    reasons: uniqueSorted(applicable.map((record) => `${record.targetType}_REVOKED:${record.reason}`)), revocationIds: applicable.map((record) => record.id).sort() });
}
