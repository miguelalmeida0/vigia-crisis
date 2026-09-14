import { buildOptimizerCandidates } from '../../../../../packages/domain/src/response-capability/response-optimizer-candidates.mjs';

export const DEFAULT_ROUTING_CANDIDATE_LIMITS = Object.freeze({
  HOSPITAL: Number.MAX_SAFE_INTEGER,
  FIRE_STATION: Number.MAX_SAFE_INTEGER,
  EMS_BASE: 8,
  CIVIL_PROTECTION: 8,
  POLICE: 8,
  PUBLIC_INSTITUTION: 8,
  SHELTER: 8,
  WATER_POINT: 8,
  AIR_SUPPORT_BASE: 8
});

export const OPERATOR_RESPONSE_COHORT_LIMITS = Object.freeze(Object.fromEntries(
  Object.keys(DEFAULT_ROUTING_CANDIDATE_LIMITS).map((kind) => [kind, 6])
));

const TERMINAL_PROVIDER_STATES = new Set(['ROUTED', 'UNREACHABLE']);

export function routingCoverage(facilitiesByKind, routingAdapter, generatedAt) {
  const eligible = Object.values(facilitiesByKind).flat();
  const states = eligible.map((facility) => facility.reachability?.state ?? 'UNKNOWN');
  const counts = Object.fromEntries([...new Set(states)].sort().map((state) => [state, states.filter((value) => value === state).length]));
  const unreachable = eligible.filter((facility) => facility.reachability?.state === 'UNREACHABLE');
  const invalidUnreachable = unreachable.flatMap((facility) => {
    const missing = [
      typeof facility.reachability.reason === 'string' && facility.reachability.reason.trim() ? null : 'reason',
      facility.reachability.source && typeof facility.reachability.source === 'object' ? null : 'source',
      Number.isFinite(Date.parse(facility.reachability.checkedAt ?? '')) ? null : 'checkedAt'
    ].filter(Boolean);
    return missing.length ? [{ facilityId: facility.id, missing }] : [];
  });
  const complete = Boolean(routingAdapter?.routeMany) && eligible.length > 0
    && states.every((state) => TERMINAL_PROVIDER_STATES.has(state)) && invalidUnreachable.length === 0;
  return {
    state: complete ? 'AVAILABLE' : eligible.length && routingAdapter?.routeMany ? 'DEGRADED' : 'UNAVAILABLE',
    source: routingAdapter?.endpoint ?? null,
    checkedAt: generatedAt,
    eligibleCandidateCount: eligible.length,
    resolvedCandidateCount: states.filter((state) => TERMINAL_PROVIDER_STATES.has(state)).length,
    stateCounts: counts,
    unreachableValidation: {
      count: unreachable.length,
      validCount: unreachable.length - invalidUnreachable.length,
      invalid: invalidUnreachable
    },
    completionRule: 'AVAILABLE requires every returned routing-eligible facility to be ROUTED or explicitly declared UNREACHABLE by the configured provider.',
    limitation: 'Routing estimates do not prove current passability, emergency-vehicle suitability, dispatch, or arrival.'
  };
}

export function annotateCandidateRanks(byKind, sourceCoverage, decisionContext) {
  const { optimizerCandidates } = buildOptimizerCandidates(byKind, decisionContext);
  const optimizerById = new Map(optimizerCandidates.map((candidate) => [candidate.facilityId, candidate]));
  return Object.fromEntries(Object.entries(byKind).map(([kind, facilities]) => {
    const routed = [...facilities].sort((left, right) =>
      (left.reachability?.travelTimeMinutes ?? Number.POSITIVE_INFINITY) - (right.reachability?.travelTimeMinutes ?? Number.POSITIVE_INFINITY)
      || left.distanceKm - right.distanceKm || left.id.localeCompare(right.id));
    const decision = [...facilities].sort((left, right) => {
      const leftCandidate = optimizerById.get(left.id), rightCandidate = optimizerById.get(right.id);
      return Number(Boolean(rightCandidate?.eligibleForDispatchRecommendation)) - Number(Boolean(leftCandidate?.eligibleForDispatchRecommendation))
        || (leftCandidate?.coveragePenalty ?? 0) - (rightCandidate?.coveragePenalty ?? 0)
        || (left.reachability?.travelTimeMinutes ?? Number.POSITIVE_INFINITY) - (right.reachability?.travelTimeMinutes ?? Number.POSITIVE_INFINITY)
        || left.id.localeCompare(right.id);
    });
    return [kind, facilities.map((facility, index) => {
      const candidate = optimizerById.get(facility.id);
      const eligible = candidate?.eligibleForDispatchRecommendation === true;
      const exclusions = candidate?.exclusionReasons ?? [];
      const retrievalRank = facility.retrieval?.straightLineRank ?? index + 1;
      return {
        ...facility,
        retrievalRank,
        candidateCohort: {
        ...facility.retrieval,
        straightLineRank: retrievalRank,
        rankBasis: facility.retrieval?.straightLineRank ? 'GOVERNED_DISTANCE_DENOMINATOR' : 'REPOSITORY_RETURN_ORDER',
        governedSourceRecordCount: sourceCoverage[kind]?.sourceRecordCount ?? 0,
        returnedCandidateCount: facilities.length,
        routedRank: routed.findIndex((item) => item.id === facility.id) + 1,
        decisionRank: decision.findIndex((item) => item.id === facility.id) + 1,
        eligibility: eligible ? 'ELIGIBLE_FOR_PLANNING_RECOMMENDATION' : 'INELIGIBLE_FOR_PLANNING_RECOMMENDATION',
        exclusions,
        eligibleForPlanningRecommendation: eligible,
        exclusionReasons: exclusions
        }
      };
    })];
  }));
}

export function selectOperatorCandidateCohort(rankedByKind, limits = OPERATOR_RESPONSE_COHORT_LIMITS) {
  return Object.fromEntries(Object.entries(rankedByKind).map(([kind, facilities]) => {
    const limit = Math.max(1, Math.floor(Number(limits[kind] ?? 6)));
    const selected = [...facilities]
      .sort((left, right) => left.candidateCohort.decisionRank - right.candidateCohort.decisionRank
        || left.candidateCohort.routedRank - right.candidateCohort.routedRank
        || left.id.localeCompare(right.id))
      .slice(0, limit)
      .map((facility, index) => ({
        ...facility,
        candidateCohort: {
          ...facility.candidateCohort,
          denominatorRankedCount: facilities.length,
          operatorCohortRank: index + 1,
          operatorCohortLimit: limit
        }
      }));
    return [kind, selected];
  }));
}
