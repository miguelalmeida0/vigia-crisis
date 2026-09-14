import { semanticHash } from '../intelligence/shared.mjs';
import { bindResponseRecommendation } from './recommendation-review.mjs';
import { recommendationReviewState, recommendationValidity } from './recommendation-validity.mjs';

export function resourceOptimizerProjection(candidates, facilities, gaps, generatedAt, decisionContext = {}) {
  const byId = new Map(facilities.map((facility) => [facility.id, facility]));
  const eligible = candidates
    .filter((candidate) => candidate.eligibleForDispatchRecommendation)
    .sort((left, right) => (left.coveragePenalty ?? 0) - (right.coveragePenalty ?? 0)
      || (left.travelTimeMinutes ?? Number.POSITIVE_INFINITY) - (right.travelTimeMinutes ?? Number.POSITIVE_INFINITY)
      || (right.effectiveAvailableQuantity ?? -1) - (left.effectiveAvailableQuantity ?? -1)
      || left.facilityId.localeCompare(right.facilityId));
  const recommendedStaging = eligible.map((candidate, index) => {
    const facility = byId.get(candidate.facilityId);
    const validity = recommendationValidity(facility);
    return bindResponseRecommendation({
      recommendationId: semanticHash('resource-staging-recommendation', { facilityId: candidate.facilityId, kind: candidate.kind }).slice(0, 57),
      rank: index + 1,
      facilityId: candidate.facilityId,
      facilityName: facility?.name ?? null,
      resourceType: candidate.kind === 'FIRE_STATION' ? 'WILDFIRE_RESPONSE' : candidate.kind === 'HOSPITAL' ? 'MEDICAL_RECEIVING' : candidate.kind,
      state: recommendationReviewState(validity, generatedAt),
      etaMinutes: candidate.travelTimeMinutes,
      routeDistanceKm: candidate.routeDistanceKm,
      capacityState: candidate.capacityState,
      requiredQuantity: candidate.requiredQuantity,
      effectiveAvailableQuantity: candidate.effectiveAvailableQuantity,
      competingDemandQuantity: candidate.competingDemandQuantity,
      stagingSafety: candidate.stagingSafety,
      coveragePenalty: candidate.coveragePenalty,
      tradeOffs: candidates.filter((alternative) => alternative.facilityId !== candidate.facilityId).slice(0, 4).map((alternative) => ({
        facilityId: alternative.facilityId,
        travelTimeMinutes: alternative.travelTimeMinutes,
        eligible: alternative.eligibleForDispatchRecommendation,
        exclusionReasons: alternative.exclusionReasons
      })),
      ...validity,
      requiresHumanApproval: true,
      dispatchClaimed: false,
      assignmentClaimed: false
    });
  });
  const validUntil = recommendedStaging.map((item) => item.validUntil).filter(Boolean).sort()[0] ?? null;
  const reviewable = recommendedStaging.filter((item) => item.state === 'PROPOSED_FOR_COMMAND_REVIEW');
  return {
    schemaVersion: 'vigia.resource-swarm-optimizer.v1',
    state: reviewable.length ? 'ADVISORY_CANDIDATES_READY' : recommendedStaging.length
      ? 'WITHHELD_STALE_OR_UNTIMED_SUPPORT'
      : 'WITHHELD_INSUFFICIENT_GOVERNED_INPUT',
    generatedAt,
    validUntil,
    recommendedStaging,
    recommendedAssignment: null,
    remainingUncoveredDemand: gaps.map((gap) => ({ gapId: gap.id, code: gap.code, impact: gap.impact, informationRequirementIds: gap.informationRequirementIds })),
    inputCandidateCount: candidates.length,
    eligibleCandidateCount: eligible.length,
    requiresHumanApproval: true,
    dispatchClaimed: false,
    executionClaimed: false,
    optimizationDoctrine: {
      ordering: ['STAGING_SAFETY', 'COVERAGE_PRESERVATION', 'ROUTED_TRAVEL_TIME', 'ATTRIBUTABLE_EFFECTIVE_CAPACITY'],
      demandSource: decisionContext.resourceDemand?.source ?? null,
      commitmentSource: decisionContext.currentCommitments?.source ?? null,
      noUnknownAsZero: true
    },
    reason: reviewable.length ? null : recommendedStaging.length
      ? 'Eligible candidates exist, but their governing route or capacity support is stale or lacks a finite validity deadline.'
      : 'No candidate has road-network reachability, attributable current incident-relevant capacity, safe staging, and enough known effective capacity for any admitted demand.',
    truthBoundary: 'This optimizer ranks governed planning candidates against admitted demand, current commitments, staging safety, and coverage trade-offs. Unknown quantities never become zero. It does not dispatch, assign, reserve, acknowledge, or prove arrival.'
  };
}
