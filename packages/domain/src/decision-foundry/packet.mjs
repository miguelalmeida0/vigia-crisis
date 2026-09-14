import { immutable, isoTime, requiredText, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';

export function createCrisisDecisionPacket(input = {}) {
  const core = { schemaVersion: 'vigia.crisis-decision-packet.v1', compilerVersion: requiredText(input.compilerVersion ?? '1.0.0', 'decision_compiler_version_required'), incident: structuredClone(input.incident), knowledgeTime: isoTime(input.knowledgeTime, 'decision_packet_knowledge_time_required'), currentSituation: structuredClone(input.currentSituation ?? {}), hypotheses: structuredClone(input.hypotheses), discriminators: structuredClone(input.discriminators ?? []), decisions: structuredClone(input.decisions), unknowns: structuredClone(input.unknowns ?? []), evidenceNeedIds: uniqueSorted(input.evidenceNeedIds), openDataGaps: structuredClone(input.openDataGaps ?? []), forecastReadiness: structuredClone(input.forecastReadiness ?? null), rankedAcquisitions: structuredClone(input.rankedAcquisitions ?? []), acquisitionPlan: structuredClone(input.acquisitionPlan ?? null), currentPolicies: structuredClone(input.currentPolicies ?? []), currentActions: structuredClone(input.currentActions ?? []), blockedActions: structuredClone(input.blockedActions ?? []), authorityRequirements: structuredClone(input.authorityRequirements ?? []), decisionDeltas: structuredClone(input.decisionDeltas ?? []), counterfactuals: structuredClone(input.counterfactuals ?? []), sourceMarginalValue: structuredClone(input.sourceMarginalValue ?? []), lineage: structuredClone(input.lineage ?? null), rights: structuredClone(input.rights ?? null), quality: structuredClone(input.quality ?? null), proofReferences: uniqueSorted(input.proofReferences), causingDataProductIds: uniqueSorted(input.causingDataProductIds), governedWork: structuredClone(input.governedWork ?? []), observability: structuredClone(input.observability ?? {}) };
  const replayFingerprint = semanticHash('crisis-decision-packet', core);
  return immutable({ ...core, replayFingerprint, integrityState: 'HASH_BOUND_AWAITING_OR_ATTACHED_PROOF' });
}

export function createDecisionReplayRecord({ compilerInput, packet, compilerVersion = '1.0.0', proofFingerprint = null } = {}) {
  const core = { schemaVersion: 'vigia.decision-foundry-replay.v1', compilerVersion, compilerInput: structuredClone(compilerInput), inputFingerprint: semanticHash('decision-compiler-input', compilerInput), packetFingerprint: packet.replayFingerprint, proofFingerprint, hypothesisFingerprint: packet.hypotheses?.fingerprint ?? null, decisionGraphFingerprint: packet.decisions?.fingerprint ?? null, acquisitionPlanFingerprint: packet.acquisitionPlan?.fingerprint ?? null };
  return immutable({ ...core, replayFingerprint: semanticHash('decision-foundry-replay', core) });
}

export function verifyDecisionReplay(record, rebuiltPacket, { proofFingerprint = null } = {}) {
  const reasons = [];
  if (semanticHash('decision-compiler-input', record.compilerInput) !== record.inputFingerprint) reasons.push('COMPILER_INPUT_SUBSTITUTED');
  if (rebuiltPacket.replayFingerprint !== record.packetFingerprint) reasons.push('DECISION_PACKET_MISMATCH');
  if (rebuiltPacket.hypotheses?.fingerprint !== record.hypothesisFingerprint) reasons.push('HYPOTHESIS_REPLAY_MISMATCH');
  if (rebuiltPacket.decisions?.fingerprint !== record.decisionGraphFingerprint) reasons.push('DECISION_GRAPH_REPLAY_MISMATCH');
  if (rebuiltPacket.acquisitionPlan?.fingerprint !== record.acquisitionPlanFingerprint) reasons.push('ACQUISITION_RANKING_REPLAY_MISMATCH');
  if (record.proofFingerprint && proofFingerprint !== record.proofFingerprint) reasons.push('PROOF_SUBSTITUTION');
  return immutable({ valid: reasons.length === 0, identical: reasons.length === 0, reasons, recordedPacketFingerprint: record.packetFingerprint, rebuiltPacketFingerprint: rebuiltPacket.replayFingerprint });
}
