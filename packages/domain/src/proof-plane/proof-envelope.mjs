import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { immutable, isoTime, requiredText, semanticHash, stableStringify, uniqueSorted } from '../intelligence/shared.mjs';
import { resolveTrustRoot } from './trust-root-registry.mjs';
import { revocationStatus } from './revocation-registry.mjs';

export const SIGNATURE_DOMAIN = 'VIGIA::SIGNED_STATEMENT::v1';
const material = (statement) => Buffer.from(`${SIGNATURE_DOMAIN}\n${stableStringify(statement)}`, 'utf8');

export function createSignedStatement(input = {}) {
  const issuedAt = isoTime(input.issuedAt, 'statement_issued_at_required');
  const core = { schemaVersion: 'vigia.signed-statement.v1', statementType: requiredText(input.statementType, 'statement_type_required').toUpperCase(),
    issuerId: requiredText(input.issuerId ?? input.principalId, 'statement_issuer_required'), principalId: requiredText(input.principalId, 'statement_principal_required'),
    organizationId: input.organizationId ? String(input.organizationId) : null, subjectId: input.subjectId ? String(input.subjectId) : null,
    payload: structuredClone(input.payload ?? {}), scope: structuredClone(input.scope ?? {}), credentialRefs: uniqueSorted(input.credentialRefs),
    deviceId: input.deviceId ? String(input.deviceId) : null, sessionId: input.sessionId ? String(input.sessionId) : null,
    issuedAt, notBefore: isoTime(input.notBefore ?? issuedAt, 'statement_not_before_required'),
    expiresAt: isoTime(input.expiresAt, 'statement_expiry_required'), nonce: requiredText(input.nonce, 'statement_nonce_required'),
    sequence: Number(input.sequence), keyId: requiredText(input.keyId, 'statement_key_id_required') };
  if (!Number.isSafeInteger(core.sequence) || core.sequence < 0) throw new Error('invalid_statement_sequence');
  if (core.expiresAt <= core.notBefore) throw new Error('invalid_statement_window');
  return immutable({ ...core, statementHash: semanticHash('signed-statement', core) });
}

export function signProofEnvelope(statement, privateKey) {
  if (!statement?.statementHash || semanticHash('signed-statement', Object.fromEntries(Object.entries(statement).filter(([key]) => key !== 'statementHash'))) !== statement.statementHash) throw new Error('invalid_statement_hash');
  let key; try { key = createPrivateKey(privateKey); } catch { throw new Error('invalid_signing_private_key'); }
  const signature = sign(null, material(statement), key).toString('base64url');
  const core = { schemaVersion: 'vigia.proof-envelope.v1', proofType: 'ED25519', keyId: statement.keyId, issuerId: statement.issuerId,
    statement, statementHash: statement.statementHash, signature };
  return immutable({ ...core, fingerprint: semanticHash('proof-envelope', core) });
}

function malformed(reason) { return immutable({ status: 'MALFORMED', cryptographicallyVerified: false, trustZone: null, reasons: [reason], envelopeFingerprint: null, statementHash: null, principalId: null }); }

export function validateProofEnvelopeStructure(envelope) {
  if (envelope?.schemaVersion !== 'vigia.proof-envelope.v1' || envelope.proofType !== 'ED25519' || !envelope.statement || !envelope.signature) return { valid: false, reason: 'PROOF_ENVELOPE_MALFORMED' };
  const statement = envelope.statement, bare = Object.fromEntries(Object.entries(statement).filter(([key]) => key !== 'statementHash'));
  if (semanticHash('signed-statement', bare) !== statement.statementHash || envelope.statementHash !== statement.statementHash) return { valid: false, reason: 'STATEMENT_HASH_MISMATCH' };
  const core = { schemaVersion: envelope.schemaVersion, proofType: envelope.proofType, keyId: envelope.keyId, issuerId: envelope.issuerId,
    statement, statementHash: envelope.statementHash, signature: envelope.signature };
  if (envelope.fingerprint !== semanticHash('proof-envelope', core) || envelope.issuerId !== statement.issuerId || envelope.keyId !== statement.keyId) return { valid: false, reason: 'PROOF_ENVELOPE_BINDING_MISMATCH' };
  return { valid: true, reason: null };
}

export function verifyProofEnvelope(envelope, { trustRoots, revocations, at, expectedStatementHash = null, expectedScope = null, usage = null } = {}) {
  if (envelope?.schemaVersion !== 'vigia.proof-envelope.v1' || envelope.proofType !== 'ED25519' || !envelope.statement || !envelope.signature) return malformed('PROOF_ENVELOPE_MALFORMED');
  const statement = envelope.statement, evaluatedAt = isoTime(at, 'proof_evaluation_time_required'), structure = validateProofEnvelopeStructure(envelope);
  if (!structure.valid) return malformed(structure.reason);
  if (expectedStatementHash && statement.payload?.requestFingerprint !== expectedStatementHash) return immutable({ ...malformed('STATEMENT_BINDING_MISMATCH'), status: 'INVALID_PROOF', statementHash: statement.statementHash });
  const rootResult = resolveTrustRoot(trustRoots, { issuerId: statement.issuerId, keyId: envelope.keyId, at: statement.issuedAt, usage });
  if (rootResult.state !== 'VALID') return immutable({ status: rootResult.state, cryptographicallyVerified: false, trustZone: null, reasons: rootResult.reasons,
    envelopeFingerprint: envelope.fingerprint, statementHash: statement.statementHash, principalId: statement.principalId });
  let verified = false; try { verified = verify(null, material(statement), createPublicKey(rootResult.root.publicKey), Buffer.from(envelope.signature, 'base64url')); } catch { verified = false; }
  if (!verified) return immutable({ status: 'INVALID_PROOF', cryptographicallyVerified: false, trustZone: null, reasons: ['SIGNATURE_INVALID'], envelopeFingerprint: envelope.fingerprint, statementHash: statement.statementHash, principalId: statement.principalId });
  if (statement.notBefore > evaluatedAt) return immutable({ status: 'NOT_YET_VALID', cryptographicallyVerified: true, trustZone: 'CRYPTOGRAPHICALLY_VERIFIED', reasons: ['STATEMENT_NOT_YET_VALID'], envelopeFingerprint: envelope.fingerprint, statementHash: statement.statementHash, principalId: statement.principalId });
  if (statement.expiresAt <= evaluatedAt) return immutable({ status: 'EXPIRED', cryptographicallyVerified: true, trustZone: 'CRYPTOGRAPHICALLY_VERIFIED', reasons: ['STATEMENT_EXPIRED'], envelopeFingerprint: envelope.fingerprint, statementHash: statement.statementHash, principalId: statement.principalId });
  if (expectedScope && semanticHash('scope', statement.scope) !== semanticHash('scope', expectedScope)) return immutable({ status: 'INVALID_SCOPE', cryptographicallyVerified: true, trustZone: 'CRYPTOGRAPHICALLY_VERIFIED', reasons: ['SIGNED_SCOPE_MISMATCH'], envelopeFingerprint: envelope.fingerprint, statementHash: statement.statementHash, principalId: statement.principalId });
  const revoked = revocationStatus(revocations, { targets: [{ type: 'KEY', id: envelope.keyId }, { type: 'PRINCIPAL', id: statement.principalId }, { type: 'STATEMENT', id: statement.statementHash }], statementAt: statement.issuedAt, evaluatedAt });
  if (revoked.revoked) return immutable({ status: 'REVOKED', cryptographicallyVerified: true, trustZone: 'CRYPTOGRAPHICALLY_VERIFIED', reasons: revoked.reasons, revocationIds: revoked.revocationIds, envelopeFingerprint: envelope.fingerprint, statementHash: statement.statementHash, principalId: statement.principalId });
  return immutable({ status: 'VALID', cryptographicallyVerified: true, trustZone: 'CRYPTOGRAPHICALLY_VERIFIED', reasons: [], envelopeFingerprint: envelope.fingerprint,
    statementHash: statement.statementHash, principalId: statement.principalId, organizationId: statement.organizationId, keyId: envelope.keyId, verifiedAt: evaluatedAt });
}

export function exportPublicKey(privateKey) { return createPublicKey(createPrivateKey(privateKey)).export({ type: 'spki', format: 'pem' }).toString(); }
