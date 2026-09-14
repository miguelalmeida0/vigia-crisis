import { immutable, requiredText, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';

const TYPES = Object.freeze(['SATISFY_DATA_GAP', 'ADD_INDEPENDENT_FAMILY', 'DELAY_SOURCE', 'REVOKE_SOURCE', 'REMOVE_SOURCE', 'SUBSTITUTE_WEATHER_RUN']);
export function evaluateContractCounterfactual({ decisionPacket, assumption } = {}) {
  if (!decisionPacket?.replayFingerprint) throw new Error('counterfactual_decision_packet_required');
  const type = requiredText(assumption?.type, 'counterfactual_type_required'); if (!TYPES.includes(type)) throw new Error('counterfactual_type_invalid');
  const gap = type === 'SATISFY_DATA_GAP' ? decisionPacket.openDataGaps.find((item) => item.id === assumption.gapId) : null;
  if (type === 'SATISFY_DATA_GAP' && !gap) throw new Error('counterfactual_gap_not_found');
  const value = decisionPacket.rankedAcquisitions?.find((item) => item.gapId === assumption.gapId || item.candidateId === assumption.candidateId), affected = uniqueSorted(value?.decisionsAffected), currentDecisions = new Map((decisionPacket.decisions?.results ?? []).map((item) => [item.decisionId, item]));
  const requirementsClosed = new Set([assumption.gapId, gap?.requirement, ...(value?.requirementsClosed ?? [])].filter(Boolean));
  const decisionChanges = affected.map((id) => ({ decisionId: id, from: currentDecisions.get(id)?.state ?? null, to: currentDecisions.get(id)?.blockers?.every((item) => requirementsClosed.has(item.reference)) ? 'READY' : currentDecisions.get(id)?.state ?? 'REQUIRES_RECOMPILATION' }));
  const core = { schemaVersion: 'vigia.contract-counterfactual.v1', classification: 'CONTRACT_COUNTERFACTUAL', packetFingerprint: decisionPacket.replayFingerprint, assumption: structuredClone(assumption), effects: { dataGapsClosed: gap ? [gap.id] : [], hypothesesPotentiallySeparated: uniqueSorted(value?.hypothesesSeparated), decisionsPotentiallyChanged: decisionChanges, forecastExamplesPotentiallyUnlocked: Number(value?.forecastExamplesUnlocked ?? 0), horizonsPotentiallyUnlocked: uniqueSorted(value?.horizonsUnlocked).map(Number), independentFamilyPotentiallyGained: value?.independentFamilyGained === true }, evidenceAdmissions: [], operationalTruthMutation: false, admittedToEvidenceGraph: false, warning: 'Contract-level simulation only. No provider result or physical fact was created.' };
  return immutable({ ...core, fingerprint: semanticHash('contract-counterfactual', core) });
}

export function verifyCounterfactualSeparation(counterfactual, evidenceGraph = { nodes: [] }) {
  const identifiers = new Set((evidenceGraph.nodes ?? []).map((item) => item.id)), leaked = [...identifiers].filter((id) => id === counterfactual.fingerprint || String(id).startsWith('contract-counterfactual:'));
  return immutable({ valid: counterfactual.classification === 'CONTRACT_COUNTERFACTUAL' && counterfactual.operationalTruthMutation === false && counterfactual.admittedToEvidenceGraph === false && counterfactual.evidenceAdmissions.length === 0 && leaked.length === 0, leakedEvidenceIds: leaked });
}
