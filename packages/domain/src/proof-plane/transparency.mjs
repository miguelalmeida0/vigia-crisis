import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { immutable, isoTime, semanticHash, stableStringify } from '../intelligence/shared.mjs';

const DOMAIN = 'VIGIA::TRANSPARENCY_RECEIPT::v1';
const material = (core) => Buffer.from(`${DOMAIN}\n${stableStringify(core)}`, 'utf8');

export function createTransparencyReceipt(input = {}, signer = {}) {
  const core = { schemaVersion: 'vigia.transparency-receipt.v1', sequence: Number(input.sequence), previousReceiptHash: input.previousReceiptHash ?? null,
    eventType: String(input.eventType ?? 'TRUST_DECISION').toUpperCase(), subjectId: String(input.subjectId ?? 'unknown'),
    decisionId: input.decisionId ?? null, decisionHash: semanticHash('transparency-decision', input.decision ?? {}),
    proofFingerprints: [...new Set((input.proofFingerprints ?? []).map(String))].sort(), recordedAt: isoTime(input.recordedAt, 'transparency_time_required'),
    signerKeyId: String(signer.keyId ?? '') };
  if (!Number.isSafeInteger(core.sequence) || core.sequence < 1 || !core.signerKeyId || !signer.privateKey) throw new Error('transparency_signer_required');
  const receiptHash = semanticHash('transparency-receipt', core), signature = sign(null, material({ ...core, receiptHash }), createPrivateKey(signer.privateKey)).toString('base64url');
  return immutable({ ...core, receiptHash, signature, proofType: 'ED25519' });
}

export function verifyTransparencyChain(receipts = [], { publicKeys = {} } = {}) {
  let previous = null, expectedSequence = 1;
  for (const receipt of receipts) {
    const { receiptHash, signature, proofType, ...core } = receipt;
    if (proofType !== 'ED25519' || core.sequence !== expectedSequence || core.previousReceiptHash !== previous || semanticHash('transparency-receipt', core) !== receiptHash) return { valid: false, state: 'TAMPERED', failedSequence: expectedSequence };
    const publicKey = publicKeys[core.signerKeyId];
    let valid = false; try { valid = Boolean(publicKey) && verify(null, material({ ...core, receiptHash }), createPublicKey(publicKey), Buffer.from(signature, 'base64url')); } catch { valid = false; }
    if (!valid) return { valid: false, state: 'INVALID_SIGNATURE', failedSequence: expectedSequence };
    previous = receiptHash; expectedSequence += 1;
  }
  return { valid: true, state: 'VERIFIED', count: receipts.length, headHash: previous };
}
