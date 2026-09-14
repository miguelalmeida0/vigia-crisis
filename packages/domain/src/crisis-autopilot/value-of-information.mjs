import {
  compareDecisionPriority,
  DECISION_PRIORITY_DOCTRINE,
  explainPriorityComparison,
  rankCandidateAcquisitions,
} from '../decision-foundry/index.mjs';
import { immutable } from '../intelligence/shared.mjs';
import { collectionWorkLifecycle, isActiveWork, isClosedWork, objectId, requiredProjectionClock, stateOf, workLastCheck, workNextCheck, workOwner, workSource } from './contracts.mjs';

function rankedRows({ decisionPacket, rankedCandidates, candidateAcquisitions, asOf }) {
  const supplied = rankedCandidates ?? decisionPacket?.rankedAcquisitions;
  if (Array.isArray(supplied) && supplied.every((item) => item?.priorityVector)) return [...supplied].sort(compareDecisionPriority);
  return [...rankCandidateAcquisitions(candidateAcquisitions ?? [], { knowledgeTime: asOf })];
}

function workFor(row, work, asOf) {
  const matching = work.filter((item) => [item.candidateId, item.requestedMethodId, item.sourceOpportunityId, item.acquisitionId].filter(Boolean).map(String).includes(String(row.candidateId)));
  return matching.find((item) => isActiveWork(item, { asOf })) ?? matching[0] ?? null;
}

function executable(row) {
  return row?.components?.sourceEligible === 1 || row?.priorityVector?.sourceEligible === 1;
}

function impact(row) {
  return {
    qualification: 'STRUCTURAL_EXPECTATION_NOT_OUTCOME_PROBABILITY',
    decisionsPotentiallyUnblocked: [...(row.decisionsAffected ?? [])],
    criticalDecisionCount: Number(row.criticalDecisionsPotentiallyUnblocked ?? row.priorityVector?.criticalDecisionsUnlocked ?? 0),
    hypothesesPotentiallySeparated: [...(row.hypothesesSeparated ?? [])],
    evidenceContractsPotentiallySatisfied: [...(row.contractsPotentiallySatisfied ?? [])],
    independentSourceFamilyPotentiallyGained: row.independentFamilyGained === true,
    forecastHorizonsPotentiallyUnlocked: [...(row.horizonsUnlocked ?? [])],
    scientificGatesPotentiallyUnlocked: Number(row.priorityVector?.scientificGatesUnlocked ?? 0),
  };
}

function expectedWait(row, activeWork) {
  const expectedMs = Number(row.latency?.expectedMs ?? row.priorityVector?.expectedLatencyMs);
  const nextCheckAt = activeWork ? workNextCheck(activeWork) : null;
  if (Number.isFinite(expectedMs) && expectedMs > 0) return { state: 'DECLARED_ESTIMATE', expectedMs, nextCheckAt, qualification: 'Provider/candidate estimate; not an observed completion time.' };
  if (nextCheckAt) return { state: 'SCHEDULE_BOUND', expectedMs: null, nextCheckAt, qualification: 'A governed next-check time exists; completion latency is unknown.' };
  return { state: 'UNKNOWN', expectedMs: null, nextCheckAt: null, qualification: 'No attributable latency estimate or schedule is present.' };
}

function action(row, work, rank, declared = {}, asOf) {
  const active = Boolean(work && isActiveWork(work, { asOf }));
  const completed = Boolean(work && isClosedWork(work));
  const lifecycle = work ? collectionWorkLifecycle(work, { asOf }) : null;
  return {
    actionId: objectId(work) ?? `collection-candidate:${row.candidateId}`,
    candidateId: String(row.candidateId),
    rank,
    state: completed ? 'COMPLETED' : active ? 'ACTIVE' : work ? 'BLOCKED' : executable(row) ? 'READY_TO_SCHEDULE' : 'BLOCKED',
    question: row.requirement ?? null,
    source: {
      provider: row.provider ?? declared.provider ?? workSource(work ?? {}) ?? null,
      family: declared.sourceFamily ?? declared.eligibleSource ?? row.sourceFamily ?? row.eligibleSource ?? null,
      independence: row.independentFamilyGained === true ? 'NEW_INDEPENDENT_SOURCE_FAMILY' : row.risk?.causalDuplication === 'HIGH' ? 'CAUSAL_DUPLICATION_RISK' : 'NO_NEW_FAMILY_ASSERTED',
      rights: row.rights ?? 'UNKNOWN',
      qualityExpectation: row.quality ?? 'UNKNOWN',
      eligibility: executable(row) ? 'ELIGIBLE' : 'NOT_ELIGIBLE',
    },
    rankingInputs: {
      freshness: declared.freshness ?? declared.freshnessRequirement ?? 'NOT_DECLARED',
      reliability: declared.reliability ?? declared.reliabilityExpectation ?? row.quality ?? 'UNKNOWN',
      geospatialRelevance: declared.geospatialRelevance ?? (row.components?.coverageReady ? 'COVERAGE_CONFIRMED' : 'NOT_CONFIRMED'),
      authorityValue: declared.authorityValue ?? 'NOT_DECLARED',
      expectedUncertaintyReduction: declared.expectedUncertaintyReduction ?? { state: 'STRUCTURAL_ONLY', hypothesesPotentiallySeparated: (row.hypothesesSeparated ?? []).length },
    },
    owner: workOwner(work ?? {}),
    why: row.explanation,
    expectedDecisionImpact: impact(row),
    expectedWait: expectedWait(row, work),
    blockingConditions: [...(row.blockingConditions ?? [])],
    activeWork: active ? { id: objectId(work), state: stateOf(work), lastCheckedAt: workLastCheck(work), nextCheckAt: workNextCheck(work), lifecycle } : null,
    backingWork: work ? { id: objectId(work), state: stateOf(work), owner: workOwner(work), source: workSource(work), lastCheckedAt: workLastCheck(work), nextCheckAt: workNextCheck(work), lifecycle } : null,
    decisionValueFingerprint: row.fingerprint ?? null,
  };
}

export function projectValueOfInformation({ decisionPacket = null, rankedCandidates = null, candidateAcquisitions = [], collectionWork = [], asOf } = {}) {
  asOf = requiredProjectionClock(asOf);
  const ranked = rankedRows({ decisionPacket, rankedCandidates, candidateAcquisitions, asOf });
  const declaredById = new Map([...(candidateAcquisitions ?? []), ...(rankedCandidates ?? [])].map((item) => [String(item.id ?? item.candidateId), item]));
  const projected = ranked.map((row, index) => action(row, workFor(row, collectionWork, asOf), index + 1, declaredById.get(String(row.candidateId)) ?? row, asOf));
  const pending = projected.filter((item) => item.state !== 'COMPLETED');
  const best = pending.find((item) => ['ACTIVE', 'READY_TO_SCHEDULE'].includes(item.state)) ?? null;
  const bestIndex = best ? pending.indexOf(best) : -1;
  const blockedAhead = bestIndex < 0 ? pending.filter((item) => item.state === 'BLOCKED') : pending.slice(0, bestIndex).filter((item) => item.state === 'BLOCKED');
  const alternatives = pending.filter((item) => item !== best && ['ACTIVE', 'READY_TO_SCHEDULE'].includes(item.state)).slice(0, 4).map((item) => {
    const bestRow = ranked.find((row) => String(row.candidateId) === best?.candidateId);
    const row = ranked.find((candidate) => String(candidate.candidateId) === item.candidateId);
    return { ...item, whyAlternative: bestRow && row ? explainPriorityComparison(bestRow, row) : null };
  });
  const core = {
    schemaVersion: 'vigia.value-of-information-projection.v1',
    generatedAt: asOf,
    state: best ? best.state : pending.length ? 'NO_EXECUTABLE_COLLECTION_ACTION' : 'NO_UNRESOLVED_COLLECTION_CANDIDATE',
    reason: best ? null : pending.length
      ? 'Every unresolved collection candidate is blocked by an explicit eligibility, source, rights, coverage, or lifecycle condition.'
      : 'No unresolved governed collection candidate is present at the projection clock.',
    unlockCondition: best ? null : pending.length
      ? 'Resolve a blocking condition or admit an eligible attributable collection path with a governed owner and lifecycle.'
      : 'Admit an unresolved information requirement and at least one attributable collection candidate.',
    owner: 'VIGIA_SOURCE_RESOLUTION_SCHEDULER',
    source: 'CANONICAL_DECISION_FOUNDRY_AND_COLLECTION_LIFECYCLE',
    bestNextCollectionAction: best,
    highestValueBlockedCandidate: pending.find((item) => item.state === 'BLOCKED') ?? null,
    blockedCandidateOutranksExecutable: blockedAhead.length > 0,
    alternatives,
    candidateCount: projected.length,
    executableCandidateCount: pending.filter((item) => ['ACTIVE', 'READY_TO_SCHEDULE'].includes(item.state)).length,
    rankingDoctrine: DECISION_PRIORITY_DOCTRINE,
    automaticTaskCreated: false,
    qualification: 'Lexicographic, evidence-bound collection priority. Decision impact is structural and expected latency is declared or unknown; neither is a probability or a claim that collection will succeed.',
  };
  return immutable(core);
}
