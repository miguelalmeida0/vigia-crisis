import { semanticHash } from '../intelligence/shared.mjs';
import { optionalInstant, stablePlanningId } from './contracts.mjs';
import {
  finite, idOf, isCurrentPlanningContext, projectionEnvelope, rows, text, unique,
} from './projection-helpers.mjs';

const DEFAULT_RESOURCE_TYPE_BY_KIND = Object.freeze({
  HOSPITAL: 'BEDS', FIRE_STATION: 'WILDFIRE_CREWS', EMS_BASE: 'UNITS', CIVIL_PROTECTION: 'TEAMS',
  POLICE: 'UNITS', SHELTER: 'SPACES', WATER_POINT: 'TANKER_FILL_POINTS', AIR_SUPPORT_BASE: 'AIRCRAFT',
});

function optimizerRequirement(requirement) {
  const allowedKinds = unique(requirement.requiredFacilityKinds ?? [requirement.requiredKind ?? requirement.kind]);
  const resourceType = String(requirement.requiredResourceType ?? requirement.resourceType ?? DEFAULT_RESOURCE_TYPE_BY_KIND[allowedKinds[0]] ?? '').toUpperCase() || null;
  const suppliedQuantity = finite(requirement.requiredQuantity ?? requirement.quantity);
  const binary = String(requirement.demandMode ?? '').toUpperCase() === 'BINARY_CAPABILITY';
  const requiredQuantity = suppliedQuantity !== null && suppliedQuantity > 0 ? suppliedQuantity : binary ? 1 : null;
  return { allowedKinds, resourceType, requiredQuantity, binary };
}

function optimizerCandidateEvaluation(requirement, candidate, normalized, asOf) {
  const excluded = new Set((requirement.excludedFacilityIds ?? []).map(String));
  const availableQuantity = finite(candidate.availableQuantities?.[normalized.resourceType]
    ?? (candidate.quantityResourceType === normalized.resourceType ? candidate.effectiveAvailableQuantity ?? candidate.availableQuantity : null)
    ?? (normalized.binary && candidate.availableCapacityConfirmed === true ? 1 : null));
  const committedQuantity = finite(candidate.committedQuantities?.[normalized.resourceType] ?? candidate.competingDemandQuantity);
  const effectiveQuantity = availableQuantity === null ? null : Math.max(0, availableQuantity - (committedQuantity ?? 0));
  const travelTimeMinutes = finite(candidate.travelTimeMinutes);
  const maximumTravelTime = finite(requirement.maxTravelTimeMinutes ?? requirement.coverageDeadlineMinutes);
  const minimumCrewSize = finite(requirement.minimumCrewSize);
  const crewSize = finite(candidate.crewStatus?.crewSize ?? candidate.crewSize);
  const candidateCapabilities = new Set(rows(candidate.capabilities).map(String));
  const requiredCapabilities = unique(requirement.requiredCapabilities ?? []);
  const blockingConstraints = rows(candidate.constraints).filter((constraint) => /BLOCKED|UNSAFE|PROHIBITED|CLOSED|UNAVAILABLE|REQUIRES_REVIEW|UNKNOWN/.test(String(constraint?.state ?? constraint).toUpperCase()));
  const explicitStaging = requirement.stagingLocation && typeof requirement.stagingLocation === 'object' ? structuredClone(requirement.stagingLocation) : null;
  const staging = explicitStaging ?? (candidate.stagingCandidate?.state === 'GOVERNED_CANDIDATE' ? structuredClone(candidate.stagingCandidate) : null);
  const reasons = [
    normalized.allowedKinds.length && !normalized.allowedKinds.includes(candidate.kind) ? 'FACILITY_KIND_NOT_REQUESTED' : null,
    excluded.has(String(candidate.facilityId)) ? 'FACILITY_EXPLICITLY_EXCLUDED' : null,
    candidate.eligibleForDispatchRecommendation !== true ? 'BASE_ELIGIBILITY_NOT_SATISFIED' : null,
    candidate.capacityReportConfirmed !== true || candidate.capacityKnown !== true ? 'ATTRIBUTABLE_CURRENT_CAPACITY_REQUIRED' : null,
    !isCurrentPlanningContext({ updatedAt: candidate.capacityObservedAt }, asOf) ? 'CURRENT_CAPACITY_OBSERVATION_TIME_REQUIRED' : null,
    candidate.availableCapacityConfirmed !== true ? 'CURRENT_AVAILABILITY_NOT_CONFIRMED' : null,
    candidate.capabilityQualified !== true ? 'INCIDENT_RELEVANT_CAPABILITY_REQUIRED' : null,
    candidate.routeState !== 'ROUTED' || travelTimeMinutes === null || travelTimeMinutes < 0 ? 'NON_NEGATIVE_ROAD_ROUTE_REQUIRED' : null,
    !isCurrentPlanningContext({ updatedAt: candidate.routeCheckedAt }, asOf) ? 'CURRENT_ROUTE_CHECK_TIME_REQUIRED' : null,
    maximumTravelTime !== null && travelTimeMinutes !== null && travelTimeMinutes > maximumTravelTime ? 'COVERAGE_TIME_CONSTRAINT_EXCEEDED' : null,
    !normalized.resourceType ? 'RESOURCE_TYPE_REQUIRED' : null,
    normalized.requiredQuantity === null ? 'REQUIRED_QUANTITY_REQUIRED' : null,
    availableQuantity === null ? 'RESOURCE_SPECIFIC_AVAILABLE_QUANTITY_UNKNOWN' : null,
    effectiveQuantity !== null && effectiveQuantity <= 0 ? 'NO_EFFECTIVE_UNCOMMITTED_QUANTITY' : null,
    minimumCrewSize !== null && (crewSize === null || crewSize < minimumCrewSize) ? 'CREW_SIZE_CONSTRAINT_NOT_SATISFIED' : null,
    requiredCapabilities.some((capability) => !candidateCapabilities.has(capability)) ? 'REQUIRED_CAPABILITY_NOT_SATISFIED' : null,
    requirement.stagingRequired === true && !staging ? 'GOVERNED_STAGING_LOCATION_REQUIRED' : null,
    blockingConstraints.length ? 'CANDIDATE_SAFETY_OR_ACCESS_CONSTRAINT_BLOCKS_USE' : null,
  ].filter(Boolean);
  return {
    candidate,
    eligible: reasons.length === 0,
    reasons,
    resourceType: normalized.resourceType,
    requiredQuantity: normalized.requiredQuantity,
    availableQuantity,
    committedQuantity,
    effectiveQuantity,
    travelTimeMinutes,
    maximumTravelTime,
    crewStatus: structuredClone(candidate.crewStatus ?? { state: 'NOT_REPORTED', crewSize: null }),
    staging,
    coverage: structuredClone(candidate.coverage ?? { state: travelTimeMinutes === null ? 'UNKNOWN' : 'ROUTED_TIME_ONLY', travelTimeMinutes }),
    constraints: structuredClone(rows(candidate.constraints)),
    capacityObservedAt: optionalInstant(candidate.capacityObservedAt),
    routeCheckedAt: optionalInstant(candidate.routeCheckedAt),
  };
}

export function projectResourceOptimizer(responseCapability, taskRequirements, asOf) {
  const inputs = responseCapability?.optimizerInputs;
  if (!inputs) return projectionEnvelope('vigia.resource-swarm-optimizer.v1', 'WITHHELD_NO_GOVERNED_INPUTS', null, 'Response-capability optimizer inputs are unavailable.');
  const candidates = rows(inputs.candidates);
  const recommendations = [];
  const uncovered = [];
  for (const requirement of rows(taskRequirements)) {
    const requirementId = idOf(requirement, stablePlanningId('resource-requirement', requirement));
    const owner = text(requirement.owner ?? requirement.ownerId);
    const deadline = optionalInstant(requirement.deadline ?? requirement.dueAt);
    const deadlineCurrent = Boolean(deadline && Date.parse(deadline) > Date.parse(asOf));
    const normalized = optimizerRequirement(requirement);
    const evaluated = candidates.map((candidate) => optimizerCandidateEvaluation(requirement, candidate, normalized, asOf));
    const eligible = evaluated.filter((item) => item.eligible)
      .sort((left, right) => Number(left.candidate.coveragePenalty ?? 0) - Number(right.candidate.coveragePenalty ?? 0)
        || left.travelTimeMinutes - right.travelTimeMinutes
        || String(left.candidate.facilityId).localeCompare(String(right.candidate.facilityId)));
    if (!owner || !deadlineCurrent || normalized.requiredQuantity === null || !eligible.length) {
      uncovered.push({
        requirementId,
        state: !owner ? 'OWNER_REQUIRED' : !deadline ? 'DEADLINE_REQUIRED' : !deadlineCurrent ? 'DEADLINE_EXPIRED' : normalized.requiredQuantity === null ? 'REQUIRED_QUANTITY_REQUIRED' : 'NO_ELIGIBLE_ATTRIBUTABLE_CAPACITY',
        owner,
        deadline,
        resourceType: normalized.resourceType,
        requiredQuantity: normalized.requiredQuantity,
        gapQuantity: normalized.requiredQuantity,
        candidateEvaluations: evaluated.map((item) => ({ facilityId: item.candidate.facilityId, eligible: item.eligible, exclusionReasons: item.reasons, availableQuantity: item.availableQuantity, committedQuantity: item.committedQuantity, effectiveQuantity: item.effectiveQuantity })),
        why: !eligible.length ? 'No candidate satisfies resource-specific quantity, attributable current availability, commitments, crew, staging, coverage, routing, and safety constraints.' : 'A governed lifecycle owner, future deadline, resource type, and positive quantity are required.',
      });
      continue;
    }
    let remaining = normalized.requiredQuantity;
    for (const selected of eligible) {
      if (remaining <= 0) break;
      const recommendedQuantity = Math.min(remaining, selected.effectiveQuantity);
      const alternatives = eligible.filter((item) => item !== selected).slice(0, 4).map((item) => ({ facilityId: item.candidate.facilityId, travelTimeMinutes: item.travelTimeMinutes, effectiveQuantity: item.effectiveQuantity, tradeOff: 'Eligible governed alternative; compare coverage preservation, staging, and routed arrival.' }));
      const value = {
        requirementId,
        facilityId: selected.candidate.facilityId,
        kind: selected.candidate.kind,
        resourceType: normalized.resourceType,
        requiredQuantity: normalized.requiredQuantity,
        recommendedQuantity,
        availableQuantity: selected.availableQuantity,
        committedQuantity: selected.committedQuantity,
        effectiveAvailableQuantity: selected.effectiveQuantity,
        remainingQuantityAfterRecommendation: Math.max(0, remaining - recommendedQuantity),
        proposedAction: text(requirement.proposedAction) ?? 'REVIEW_FOR_ASSIGNMENT',
        proposedStaging: selected.staging,
        stagingState: selected.staging ? 'GOVERNED_CANDIDATE' : 'NOT_SELECTED',
        crewStatus: selected.crewStatus,
        coverage: selected.coverage,
        candidateConstraints: selected.constraints,
        capacityObservedAt: selected.capacityObservedAt,
        routeCheckedAt: selected.routeCheckedAt,
        eta: { state: 'ROUTED_ESTIMATE', travelTimeMinutes: selected.travelTimeMinutes, routeDistanceKm: finite(selected.candidate.routeDistanceKm), source: text(responseCapability.roadContext?.source?.provider ?? responseCapability.roadContext?.source?.sourceId ?? responseCapability.roadContext?.source) },
        basis: {
          roadRouteAvailable: true,
          attributableCurrentCapacity: selected.candidate.capacityReportConfirmed === true && selected.candidate.capacityKnown === true && selected.candidate.availableCapacityConfirmed === true,
          incidentRelevantCapability: selected.candidate.capabilityQualified === true,
          resourceSpecificQuantityKnown: selected.availableQuantity !== null,
          commitmentsApplied: selected.committedQuantity !== null,
          sourceProjection: responseCapability.schemaVersion ?? null,
        },
        alternatives,
        tradeOffs: unique([...(requirement.tradeOffs ?? []), ...rows(inputs.constraints).map((constraint) => constraint.explanation)]),
        owner,
        deadline,
        authorityState: 'HUMAN_APPROVAL_REQUIRED',
        recommendationState: 'PROPOSED',
        assignmentState: 'NOT_CREATED',
        dispatchState: 'NOT_DISPATCHED',
        acknowledgementState: 'NOT_REQUESTED',
        execution: false,
      };
      recommendations.push({ recommendationId: stablePlanningId('resource-optimizer-recommendation', value), ...value });
      remaining -= recommendedQuantity;
    }
    if (remaining > 0) uncovered.push({ requirementId, state: 'PARTIAL_CAPACITY_GAP', owner, deadline, resourceType: normalized.resourceType, requiredQuantity: normalized.requiredQuantity, recommendedQuantity: normalized.requiredQuantity - remaining, gapQuantity: remaining, why: 'Eligible attributable capacity does not satisfy the complete requested quantity.' });
  }
  const value = {
    generatedAt: asOf,
    inputs: {
      schemaVersion: inputs.schemaVersion ?? null,
      candidateCount: candidates.length,
      constraints: structuredClone(rows(inputs.constraints)),
      unknowns: structuredClone(rows(inputs.unknowns)),
    },
    recommendations,
    recommendedStaging: recommendations.map((item) => ({ recommendationId: item.recommendationId, facilityId: item.facilityId, state: item.stagingState, staging: item.proposedStaging })),
    recommendedAssignment: recommendations,
    etaMinutes: recommendations[0]?.eta?.travelTimeMinutes ?? null,
    tradeoffs: recommendations.flatMap((item) => item.tradeOffs),
    remainingUncoveredDemand: uncovered,
    candidatesConsidered: candidates.length,
    candidatesEligible: new Set(recommendations.map((item) => item.facilityId)).size,
    dispatchesExecuted: 0,
    dispatchClaimed: false,
    requiresHumanApproval: true,
    truthBoundary: 'Recommendations allocate only resource-specific known quantities after attributable availability, recorded commitments, crew, staging, coverage, routing, and safety constraints are evaluated. Unknown quantities never become zero. A recommendation is not dispatch, assignment, acknowledgement, arrival, or execution.',
  };
  return projectionEnvelope('vigia.resource-swarm-optimizer.v1', recommendations.length ? (uncovered.length ? 'PARTIAL_RECOMMENDATION' : 'RECOMMENDATIONS_READY_FOR_APPROVAL') : 'NO_ELIGIBLE_RECOMMENDATION', recommendations.length ? { ...value, proposalHash: semanticHash('resource-optimizer-proposal', value) } : value);
}

