import { immutable, isoTime, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';
import { createCrisisDecisionPacket } from './packet.mjs';
import { evaluateDecisionDependencies } from './decisions.mjs';
import { compileDecisionDoctrine } from './doctrine.mjs';
import { assertWildfireHypothesisCoverage, createWildfireHypothesisDefinitions, deriveDiscriminators, evaluateHypotheses } from './hypotheses.mjs';
import { planIntelligenceAcquisitions } from './planner.mjs';
import { rankCandidateAcquisitions, sourceMarginalValue } from './value.mjs';

export const DEFAULT_DECISION_FOUNDRY_BUDGETS = Object.freeze({ maxAcquisitionsPerIncident: 2, maxBytesPerIncident: 64 * 1024 * 1024, maxRequestsPerProvider: 2, maxProviderRetries: 3, maxConcurrentTasks: 2, maxEstimatedCostUnits: 10, maxControllerCycles: 3, maxBlockedProviderAttempts: 3 });

export function createWildfireDecisionDefinitions() {
  return compileDecisionDoctrine().definitions;
}

function unknowns(hypotheses, gaps, decisions) {
  const rows = [
    ...hypotheses.results.flatMap((item) => item.unresolvedDiscriminators.map((requirement) => ({ id: semanticHash('material-unknown', { hypothesisId: item.hypothesisId, requirement }), type: 'HYPOTHESIS_DISCRIMINATOR', requirement, hypothesisIds: [item.hypothesisId], decisionIds: [] }))),
    ...gaps.map((gap) => ({ id: semanticHash('material-unknown', { gapId: gap.id }), type: 'DATA_GAP', requirement: gap.requirement, gapId: gap.id, hypothesisIds: [], decisionIds: decisions.results.filter((decision) => decision.blockers.some((blocker) => blocker.reference === gap.requirement || blocker.reference === gap.id)).map((decision) => decision.decisionId) })),
  ];
  return [...new Map(rows.map((row) => [row.id, row])).values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function compileCrisisDecisionState(input = {}) {
  const knowledgeTime = isoTime(input.knowledgeTime, 'decision_compiler_knowledge_time_required'), hypothesisDefinitions = input.hypothesisDefinitions ?? createWildfireHypothesisDefinitions(); assertWildfireHypothesisCoverage(hypothesisDefinitions);
  const hypotheses = evaluateHypotheses({ incidentId: input.incident?.id, hypotheses: hypothesisDefinitions, evidenceFacts: input.evidenceFacts ?? [], knowledgeTime }), discriminators = deriveDiscriminators(hypotheses, hypothesisDefinitions), decisionDefinitions = input.decisionDefinitions ?? createWildfireDecisionDefinitions();
  const decisions = evaluateDecisionDependencies({ definitions: decisionDefinitions, facts: input.facts ?? [], hypotheses: hypotheses.results, dataProducts: input.dataProducts ?? [], authority: input.authorityContext ?? {}, trust: input.trustContext ?? {}, rights: input.decisionRights ?? {}, sourceHealth: input.decisionSourceHealth ?? {}, policy: input.policyContext ?? {}, lifecycle: input.decisionLifecycle ?? {} });
  const rankedAcquisitions = rankCandidateAcquisitions(input.candidateAcquisitions ?? [], { knowledgeTime }), acquisitionPlan = planIntelligenceAcquisitions({ rankedCandidates: rankedAcquisitions, budgets: input.budgets ?? DEFAULT_DECISION_FOUNDRY_BUDGETS, existingTaskCandidateIds: input.existingTaskCandidateIds, completedCandidateIds: input.completedCandidateIds, maximumSelections: input.maximumSelections ?? 1 });
  const marginal = (input.sourceContributions ?? []).map((source) => sourceMarginalValue(source)).sort((a, b) => String(a.sourceId).localeCompare(String(b.sourceId))), gaps = [...(input.openDataGaps ?? [])].sort((a, b) => a.id.localeCompare(b.id)), materialUnknowns = unknowns(hypotheses, gaps, decisions);
  const readyActions = decisions.results.filter((item) => item.state === 'READY').flatMap((item) => item.actionsUnlocked), blockedActions = decisions.results.filter((item) => item.state !== 'READY').flatMap((item) => item.blockedActions);
  const packet = createCrisisDecisionPacket({ compilerVersion: input.compilerVersion ?? '1.0.0', incident: input.incident, knowledgeTime, currentSituation: input.currentSituation ?? { operationalTwinFingerprint: input.operationalTwin?.projectionHash ?? null, evidenceState: input.operationalTwinIncident?.evaluation?.state ?? 'UNAVAILABLE' }, hypotheses, discriminators, decisions, unknowns: materialUnknowns, evidenceNeedIds: input.evidenceNeedIds, openDataGaps: gaps, forecastReadiness: input.forecastReadiness, rankedAcquisitions, acquisitionPlan, currentPolicies: input.currentPolicies, currentActions: uniqueSorted(readyActions), blockedActions: uniqueSorted(blockedActions), authorityRequirements: decisions.results.map((item) => item.authorityRequirement).filter(Boolean), decisionDeltas: input.decisionDeltas, counterfactuals: input.counterfactuals, sourceMarginalValue: marginal, lineage: input.lineage, rights: input.rights, quality: input.quality, proofReferences: input.proofReferences, causingDataProductIds: input.causingDataProductIds, governedWork: input.governedWork, observability: { hypothesesEvaluated: hypotheses.results.length, hypothesesExcluded: hypotheses.results.filter((item) => item.state === 'EXCLUDED').length, decisionDependenciesEvaluated: decisions.results.length, decisionsBlockedByCategory: Object.fromEntries([...new Set(decisions.results.filter((item) => item.state.startsWith('BLOCKED_BY_')).map((item) => item.state))].sort().map((state) => [state, decisions.results.filter((item) => item.state === state).length])), candidateAcquisitionsEvaluated: rankedAcquisitions.length, candidateAcquisitionsSelected: acquisitionPlan.selectedCandidateIds.length, decisionValueUnlocks: rankedAcquisitions.reduce((sum, item) => sum + item.forecastExamplesUnlocked, 0), dataGapsOpen: gaps.length } });
  return packet;
}
