import { immutable, semanticHash } from '../intelligence/shared.mjs';
import { verifyTransparencyChain } from './transparency.mjs';

export function createProofPlaneReplay({ trustRoots, revocations, trustPolicy, decisions = [], quarantines = [], receipts = [], asOf } = {}) {
  const core = { schemaVersion: 'vigia.proof-plane-replay.v1', asOf: new Date(asOf).toISOString(), trustRootFingerprint: trustRoots?.fingerprint ?? null,
    revocationFingerprint: revocations?.fingerprint ?? null, trustPolicyFingerprint: trustPolicy?.fingerprint ?? null,
    decisionIds: decisions.map((item) => item.decisionId).sort(), quarantineIds: quarantines.map((item) => item.id).sort(),
    receiptHashes: receipts.map((item) => item.receiptHash) };
  return immutable({ ...core, replayHash: semanticHash('proof-plane-replay', core), decisions: structuredClone(decisions), quarantines: structuredClone(quarantines), receipts: structuredClone(receipts) });
}

export function verifyProofPlaneReplay(replay, { trustRoots, revocations, trustPolicy, publicKeys } = {}) {
  if (!replay) return { valid: false, reasons: ['REPLAY_REQUIRED'] };
  const rebuilt = createProofPlaneReplay({ trustRoots, revocations, trustPolicy, decisions: replay.decisions, quarantines: replay.quarantines, receipts: replay.receipts, asOf: replay.asOf });
  const chain = verifyTransparencyChain(replay.receipts, { publicKeys });
  const reasons = [];
  if (rebuilt.replayHash !== replay.replayHash) reasons.push('REPLAY_HASH_MISMATCH');
  if (!chain.valid) reasons.push(`RECEIPT_CHAIN_${chain.state}`);
  return { valid: reasons.length === 0, reasons, chain, replayHash: rebuilt.replayHash };
}
