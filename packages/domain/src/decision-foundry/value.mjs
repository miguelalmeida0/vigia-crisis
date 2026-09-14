import { immutable, isoTime, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';

const CONSEQUENCE_RANK = Object.freeze({ COSMETIC: 0, CONTEXT: 1, SCIENTIFIC: 2, OPERATIONAL: 3, CRITICAL: 4, LIFE_SAFETY: 5 });

export const DECISION_PRIORITY_DOCTRINE = Object.freeze({
  id: 'VIGIA_DECISION_PRIORITY', version: '2.0.0', ordering: 'LEXICOGRAPHIC',
  dimensions: Object.freeze([
    ['consequenceClass', 'DESC', 'ordinal doctrine class'],
    ['decisionDeadline', 'ASC', 'UTC instant; missing is infinity'],
    ['criticalDecisionsUnlocked', 'DESC', 'count'],
    ['materialHypothesesSeparated', 'DESC', 'count'],
    ['evidenceContractsSatisfied', 'DESC', 'count'],
    ['independentFamiliesGained', 'DESC', 'count'],
    ['forecastHorizonsUnlocked', 'DESC', 'count'],
    ['scientificGatesUnlocked', 'DESC', 'count'],
    ['sourceEligible', 'DESC', 'availability, health, coverage, rights, and independence gate'],
    ['rightsReadiness', 'DESC', 'boolean'],
    ['sourceQuality', 'DESC', 'ordinal HIGH/ADEQUATE/LOW/UNKNOWN'],
    ['expectedLatency', 'ASC', 'milliseconds'],
    ['expectedCost', 'ASC', 'declared cost units'],
    ['expectedBytes', 'ASC', 'bytes'],
    ['retryRisk', 'ASC', 'attempt count'],
    ['candidateIdentity', 'ASC', 'stable identifier; final tie only'],
  ]),
});

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const nonNegative = (value, fallback = 0) => Math.max(0, finite(value, fallback));
const qualityRank = (value) => ({ HIGH: 3, ADEQUATE: 2, LOW: 1, UNKNOWN: 0 }[value] ?? 0);
const consequenceClass = (candidate, critical, decisions, scientific) => {
  const declared = String(candidate.consequenceClass ?? '').toUpperCase();
  if (declared in CONSEQUENCE_RANK) return declared;
  if (critical > 0) return 'CRITICAL';
  if (decisions > 0) return 'OPERATIONAL';
  if (scientific > 0) return 'SCIENTIFIC';
  return 'CONTEXT';
};

function vector(candidate, at, components) {
  const deadline = Number.isFinite(Date.parse(candidate.decisionDeadline)) ? new Date(candidate.decisionDeadline).toISOString() : null;
  const consequence = consequenceClass(candidate, components.criticalDecisions, components.decisionsAffected, components.scientificGates);
  return {
    doctrineId: DECISION_PRIORITY_DOCTRINE.id, doctrineVersion: DECISION_PRIORITY_DOCTRINE.version,
    consequenceClass: consequence, consequenceRank: CONSEQUENCE_RANK[consequence], decisionDeadline: deadline,
    deadlineEpochMs: deadline ? Date.parse(deadline) : Number.MAX_SAFE_INTEGER, evaluatedAt: at,
    criticalDecisionsUnlocked: components.criticalDecisions, materialHypothesesSeparated: components.hypothesesSeparated,
    evidenceContractsSatisfied: components.evidenceContracts, independentFamiliesGained: components.independentFamilyGained,
    forecastHorizonsUnlocked: components.horizonsUnlocked, scientificGatesUnlocked: components.scientificGates,
    sourceEligible: components.sourceEligible, rightsReadiness: components.rightsReady, sourceQuality: components.qualityRank,
    expectedLatencyMs: components.expectedLatencyMs, expectedCostUnits: components.estimatedCostUnits,
    expectedBytes: components.expectedBytes, retryRisk: components.retryAttempts, candidateIdentity: String(candidate.id),
  };
}

const descending = (left, right, key) => right[key] - left[key];
const ascending = (left, right, key) => left[key] - right[key];

export function compareDecisionPriority(left, right) {
  const a = left.priorityVector ?? left, b = right.priorityVector ?? right;
  return descending(a, b, 'consequenceRank') || ascending(a, b, 'deadlineEpochMs')
    || descending(a, b, 'criticalDecisionsUnlocked') || descending(a, b, 'materialHypothesesSeparated')
    || descending(a, b, 'evidenceContractsSatisfied') || descending(a, b, 'independentFamiliesGained')
    || descending(a, b, 'forecastHorizonsUnlocked') || descending(a, b, 'scientificGatesUnlocked')
    || descending(a, b, 'sourceEligible') || descending(a, b, 'rightsReadiness')
    || descending(a, b, 'sourceQuality') || ascending(a, b, 'expectedLatencyMs')
    || ascending(a, b, 'expectedCostUnits') || ascending(a, b, 'expectedBytes')
    || ascending(a, b, 'retryRisk') || a.candidateIdentity.localeCompare(b.candidateIdentity);
}

export function explainPriorityComparison(winner, other) {
  const a = winner.priorityVector, b = other.priorityVector;
  for (const [name] of DECISION_PRIORITY_DOCTRINE.dimensions) {
    if (name === 'candidateIdentity') break;
    const key = ({ consequenceClass: 'consequenceRank', decisionDeadline: 'deadlineEpochMs', expectedLatency: 'expectedLatencyMs', expectedCost: 'expectedCostUnits' })[name] ?? name;
    if (a[key] !== b[key]) return immutable({ decisiveDimension: name, winnerValue: a[key], otherValue: b[key] });
  }
  return immutable({ decisiveDimension: 'candidateIdentity', winnerValue: a.candidateIdentity, otherValue: b.candidateIdentity });
}

export function evaluateCandidateAcquisitionValue(candidate = {}, { knowledgeTime } = {}) {
  const at = isoTime(knowledgeTime, 'decision_value_time_required'), blockers = uniqueSorted(candidate.blockingConditions);
  const decisions = uniqueSorted(candidate.decisionsAffected), contracts = uniqueSorted(candidate.contractsPotentiallySatisfied);
  const hypotheses = uniqueSorted(candidate.hypothesesSeparated), horizons = uniqueSorted(candidate.horizonsUnlocked).map(Number).filter(Number.isFinite);
  const sourceAvailable = candidate.sourceAvailability === 'AVAILABLE', sourceHealthy = ['HEALTHY', 'LIVE', 'READY'].includes(candidate.sourceHealth);
  const coverageReady = candidate.coverage === true, rightsReady = candidate.rights === 'READY', causalDuplicate = candidate.causalDuplicationRisk === 'HIGH';
  const components = {
    criticalDecisions: nonNegative(candidate.criticalDecisionsPotentiallyUnblocked, decisions.length), decisionsAffected: decisions.length,
    evidenceContracts: contracts.length, hypothesesSeparated: hypotheses.length, forecastExamplesUnlocked: nonNegative(candidate.forecastExamplesUnlocked),
    horizonsUnlocked: horizons.length, scientificGates: nonNegative(candidate.scientificGatesUnlocked, candidate.negativeGateContribution),
    independentFamilyGained: candidate.independentFamilyGained === true && !causalDuplicate ? 1 : 0,
    sourceAvailable: sourceAvailable ? 1 : 0, sourceHealthy: sourceHealthy ? 1 : 0, coverageReady: coverageReady ? 1 : 0,
    rightsReady: rightsReady ? 1 : 0, sourceEligible: sourceAvailable && sourceHealthy && coverageReady && rightsReady && !causalDuplicate ? 1 : 0,
    qualityRank: qualityRank(candidate.qualityExpectation ?? 'UNKNOWN'), retryAttempts: nonNegative(candidate.retryAttempts),
    expectedBytes: nonNegative(candidate.expectedBytes), expectedLatencyMs: nonNegative(candidate.expectedLatencyMs),
    estimatedCostUnits: nonNegative(candidate.estimatedCostUnits), causalDuplicationRisk: causalDuplicate ? 1 : 0,
  };
  const priorityVector = vector(candidate, at, components);
  const core = {
    schemaVersion: 'vigia.candidate-acquisition-priority.v2', candidateId: candidate.id, incidentId: candidate.incidentId,
    provider: candidate.provider, requirement: candidate.requirement, gapId: candidate.gapId ?? null,
    requirementsClosed: uniqueSorted(candidate.requirementsClosed), decisionsAffected: decisions,
    criticalDecisionsPotentiallyUnblocked: components.criticalDecisions, hypothesesSeparated: hypotheses,
    contractsPotentiallySatisfied: contracts, forecastExamplesUnlocked: components.forecastExamplesUnlocked,
    horizonsUnlocked: horizons, independentFamilyGained: Boolean(components.independentFamilyGained),
    latency: { expectedMs: components.expectedLatencyMs, unit: 'milliseconds' },
    cost: { expectedBytes: components.expectedBytes, estimatedCostUnits: components.estimatedCostUnits },
    rights: candidate.rights ?? 'UNKNOWN', quality: candidate.qualityExpectation ?? 'UNKNOWN',
    risk: { causalDuplication: candidate.causalDuplicationRisk ?? 'UNKNOWN', retryAttempts: components.retryAttempts },
    blockingConditions: blockers, components, priorityVector, orderingDoctrine: DECISION_PRIORITY_DOCTRINE,
    deterministicTieBreak: String(candidate.id),
    explanation: `${priorityVector.consequenceClass} consequence; ${components.criticalDecisions} critical decisions; ${components.hypothesesSeparated} material hypotheses; ${components.evidenceContracts} contracts; ${components.sourceEligible ? 'eligible' : 'not eligible'}; ${components.expectedLatencyMs} ms; ${components.estimatedCostUnits} cost units.`,
  };
  return immutable({ ...core, fingerprint: semanticHash('candidate-acquisition-priority', core) });
}

export function rankCandidateAcquisitions(candidates = [], context = {}) {
  return immutable(candidates.map((candidate) => evaluateCandidateAcquisitionValue(candidate, context)).sort(compareDecisionPriority));
}

export function sourceMarginalValue({ sourceId, sourceFamily, contributions = [], ablation = {} } = {}) {
  const eligible = contributions.filter((item) => item.rootMeasurementId && item.sourceFamily === sourceFamily);
  const unique = eligible.filter((item) => item.independent !== false && item.republished !== true);
  const repeatedRoots = contributions.length - new Set(contributions.map((item) => item.rootMeasurementId).filter(Boolean)).size;
  const declaredDuplicates = eligible.filter((item) => item.independent === false || item.republished === true).length;
  const core = { schemaVersion: 'vigia.source-marginal-value.v1', sourceId, sourceFamily,
    uniqueRootMeasurements: new Set(unique.map((item) => item.rootMeasurementId)).size,
    causalDuplicates: Math.max(0, repeatedRoots + declaredDuplicates), decisionsLostWithoutSource: uniqueSorted(ablation.decisionsLost),
    hypothesesChangedWithoutSource: uniqueSorted(ablation.hypothesesChanged), examplesLostWithoutSource: finite(ablation.examplesLost),
    independentFamilyLost: ablation.independentFamilyLost === true, qualification: unique.length ? 'MEASURED_FROM_LINEAGE' : 'NO_UNIQUE_MEASURED_VALUE' };
  return immutable({ ...core, fingerprint: semanticHash('source-marginal-value', core) });
}
