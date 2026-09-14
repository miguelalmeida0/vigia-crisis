import { createPublicKey } from 'node:crypto';
import { immutable, isoTime, requiredText, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';

export function createTrustRoot(input = {}) {
  const publicKey = requiredText(input.publicKey, 'trust_root_public_key_required');
  try { createPublicKey(publicKey); } catch { throw new Error('invalid_trust_root_public_key'); }
  const core = { schemaVersion: 'vigia.trust-root.v1', issuerId: requiredText(input.issuerId, 'trust_root_issuer_required'),
    organizationId: input.organizationId ? String(input.organizationId) : null, keyId: requiredText(input.keyId, 'trust_root_key_id_required'),
    publicKey, proofType: String(input.proofType ?? 'ED25519').toUpperCase(), usages: uniqueSorted(input.usages),
    validFrom: isoTime(input.validFrom, 'trust_root_valid_from_required'), validUntil: input.validUntil ? isoTime(input.validUntil, 'invalid_trust_root_valid_until') : null,
    rotatedFromKeyId: input.rotatedFromKeyId ? String(input.rotatedFromKeyId) : null, status: String(input.status ?? 'ACTIVE').toUpperCase(),
    metadata: structuredClone(input.metadata ?? {}) };
  if (core.proofType !== 'ED25519') throw new Error('unsupported_trust_root_proof_type');
  if (core.validUntil && core.validUntil <= core.validFrom) throw new Error('invalid_trust_root_window');
  return immutable({ ...core, fingerprint: semanticHash('trust-root', core) });
}

export function createTrustRootRegistry(entries = []) {
  const roots = entries.map(createTrustRoot).sort((left, right) => left.keyId.localeCompare(right.keyId));
  const keys = new Set();
  for (const root of roots) { const key = `${root.issuerId}:${root.keyId}`; if (keys.has(key)) throw new Error(`duplicate_trust_root:${key}`); keys.add(key); }
  const registry = { schemaVersion: 'vigia.trust-root-registry.v1', roots,
    fingerprint: semanticHash('trust-root-registry', roots.map((root) => root.fingerprint)) };
  return immutable(registry);
}

export function resolveTrustRoot(registry, { issuerId, keyId, at, usage = null } = {}) {
  const evaluatedAt = isoTime(at, 'trust_root_resolution_time_required');
  const candidates = (registry?.roots ?? []).filter((root) => root.issuerId === issuerId && root.keyId === keyId);
  if (!candidates.length) return { state: 'UNKNOWN_ISSUER', root: null, reasons: ['TRUST_ROOT_NOT_FOUND'] };
  const root = candidates[0], reasons = [];
  if (root.status !== 'ACTIVE') reasons.push('TRUST_ROOT_INACTIVE');
  if (root.validFrom > evaluatedAt) reasons.push('TRUST_ROOT_NOT_YET_VALID');
  if (root.validUntil && root.validUntil <= evaluatedAt) reasons.push('TRUST_ROOT_EXPIRED');
  if (usage && !root.usages.includes('*') && !root.usages.includes(usage)) reasons.push('TRUST_ROOT_USAGE_INVALID');
  return { state: reasons.length ? 'INVALID_PROOF' : 'VALID', root, reasons: uniqueSorted(reasons) };
}
