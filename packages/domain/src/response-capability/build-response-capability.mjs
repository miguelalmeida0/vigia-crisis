import { immutable } from '../intelligence/shared.mjs';
import { buildResponseProjectionId } from './recommendation-review.mjs';
import { RESPONSE_FACILITY_KINDS } from './capacity-contract.mjs';
import { capacityInformationRequirement } from './capacity-collection.mjs';
import {
  facilitiesInside,
} from './facility-truth.mjs';
import { buildOptimizerCandidates } from './response-optimizer-candidates.mjs';
import { buildResponseGaps } from './response-gap-analysis.mjs';
import { resourceCoverageMapProjection } from './resource-coverage-map.mjs';
import { resourceOptimizerProjection } from './resource-optimizer-projection.mjs';
import { buildResponseRecommendations } from './response-recommendations.mjs';
import { fireSurgeProjection, medicalSurgeProjection } from './surge-projections.mjs';

export function buildResponseCapabilityProjection({
  incident,
  facilitiesByKind = {},
  generatedAt = new Date().toISOString(),
  decisionContext = {},
  sourceAvailability = {},
  collectionTaskExecutions = {},
  sourceCoverage = {},
  roadContext = null,
  coverageSurface = null
}) {
  if (!incident?.id || !Array.isArray(incident.coordinate) || incident.coordinate.length !== 2 || !incident.coordinate.every(Number.isFinite)) {
    throw new Error('geolocated_incident_required');
  }
  const facilities = Object.fromEntries(RESPONSE_FACILITY_KINDS.map((kind) => [kind, [...(facilitiesByKind[kind] ?? [])]]));
  const hospitals = facilities.HOSPITAL;
  const fireStations = facilities.FIRE_STATION;
  const fireWithin30 = fireStations.filter((item) => item.reachability?.state === 'ROUTED' && item.reachability.travelTimeMinutes <= 30);
  const relevantFire = fireStations.filter((item) => item.reachability?.state !== 'ROUTED' || item.reachability.travelTimeMinutes <= 60);
  const relevantHospitals = hospitals.filter((item) => item.reachability?.state !== 'ROUTED' || item.reachability.travelTimeMinutes <= 60);
  const { allCandidates, optimizerCandidates } = buildOptimizerCandidates(facilities, decisionContext);
  const facilityById = new Map(allCandidates.map((facility) => [facility.id, facility]));
  const requirements = optimizerCandidates.filter((candidate) => candidate.capacityKnown === false && candidate.capacityDecisionRelevant).map((candidate) => {
    const facility = facilityById.get(candidate.facilityId);
    const decisionBlocked = candidate.kind === 'HOSPITAL'
      ? decisionContext.medicalDecision ?? 'Select a safe receiving facility.'
      : candidate.kind === 'FIRE_STATION'
        ? decisionContext.fireDecision ?? 'Select effective wildfire response capacity.'
        : `Determine whether ${facility?.name ?? candidate.facilityId} can contribute to the current incident plan.`;
    return capacityInformationRequirement({ incidentId: incident.id, facility, generatedAt, decisionBlocked, sourceAvailability, collectionTaskExecutions });
  });
  const gaps = buildResponseGaps({ facilities, fireStations, hospitals, fireWithin30, relevantFire, relevantHospitals, requirements, decisionContext, roadContext });
  const recommendations = buildResponseRecommendations(fireStations, hospitals, optimizerCandidates, generatedAt, incident.id);
  const resourceOptimizer = resourceOptimizerProjection(optimizerCandidates, Object.values(facilities).flat(), gaps, generatedAt, decisionContext);
  const resourceCoverageMap = resourceCoverageMapProjection(incident, facilities, generatedAt, coverageSurface);
  const medicalSurge = medicalSurgeProjection(decisionContext.medicalSurgeInput, generatedAt);
  const fireResponseSurge = fireSurgeProjection(decisionContext.fireResponseSurgeInput, generatedAt);
  const retrievalByKind = sourceCoverage.CANDIDATE_RETRIEVAL?.byKind ?? {};
  const retrievalCoverage = {
    schemaVersion: 'vigia.response-facility-retrieval-coverage.v1',
    maximumDistanceKm: sourceCoverage.CANDIDATE_RETRIEVAL?.maximumDistanceKm ?? null,
    covered: sourceCoverage.CANDIDATE_RETRIEVAL?.covered === true,
    byKind: Object.fromEntries(RESPONSE_FACILITY_KINDS.map((kind) => [kind, {
      retrievedCount: Number(retrievalByKind[kind]?.withinDistanceCount ?? 0),
      eligibleCount: Number(retrievalByKind[kind]?.routingEligibleCount ?? facilities[kind].length),
      rankedCount: Number(retrievalByKind[kind]?.rankedCount ?? facilities[kind].filter((facility) => Number.isInteger(facility.retrievalRank) && facility.retrievalRank > 0).length),
      returnedCount: facilities[kind].length,
      retrievalTruncatedCount: Number(retrievalByKind[kind]?.truncatedCount ?? 0),
      truncatedCount: Number(retrievalByKind[kind]?.truncatedCount ?? 0),
      operatorTrimmedCount: Math.max(0, Number(retrievalByKind[kind]?.rankedCount ?? facilities[kind].length) - facilities[kind].length),
      cohortPolicy: retrievalByKind[kind]?.cohortPolicy ?? 'NOT_REPORTED',
      omissionReason: retrievalByKind[kind]?.omissionReason ?? null
    }])),
    truthBoundary: sourceCoverage.CANDIDATE_RETRIEVAL?.truthBoundary ?? 'No governed retrieval metadata was supplied.'
  };
  const projection = {
    schemaVersion: 'vigia.response-capability.v1',
    generatedAt,
    incident: { id: String(incident.id), coordinate: [...incident.coordinate], truthState: incident.truthState ?? incident.operationalTruth?.classification ?? incident.truthStage ?? null },
    decisionContext: {
      fireCapacityRequired: decisionContext.fireCapacityRequired === true,
      medicalCapacityRequired: decisionContext.medicalCapacityRequired === true,
      fireDecision: decisionContext.fireDecision ?? null,
      medicalDecision: decisionContext.medicalDecision ?? null,
      requiredFacilityKinds: Array.isArray(decisionContext.requiredFacilityKinds) ? decisionContext.requiredFacilityKinds.filter((kind) => RESPONSE_FACILITY_KINDS.includes(kind)) : []
    },
    sourceCoverage,
    retrievalCoverage,
    routing: sourceCoverage.ROAD_ROUTING ?? {
      state: 'UNAVAILABLE', eligibleCandidateCount: 0, resolvedCandidateCount: 0,
      completionRule: 'AVAILABLE requires every returned routing-eligible facility to be ROUTED or explicitly declared UNREACHABLE by the configured provider.'
    },
    facilities,
    reachabilityBands: {
      fire: [10, 20, 30, 45, 60].map((minutes) => facilitiesInside(fireStations, minutes)),
      hospital: [15, 30, 45, 60].map((minutes) => facilitiesInside(hospitals, minutes)),
      state: [...fireStations, ...hospitals].some((facility) => facility.reachability?.state === 'ROUTED') ? 'ROAD_ROUTING_AVAILABLE' : 'ROAD_ROUTING_UNAVAILABLE'
    },
    roadContext: roadContext ?? { state: 'UNKNOWN', source: null, closures: [], reason: 'No governed current road-closure feed was supplied.' },
    responseGaps: gaps,
    informationRequirements: requirements,
    optimizerInputs: {
      schemaVersion: 'vigia.resource-optimizer-input.v1',
      candidates: optimizerCandidates,
      constraints: gaps.map((gap) => ({ code: gap.code, state: gap.state, explanation: gap.why })),
      unknowns: optimizerCandidates.flatMap((item) => item.exclusionReasons.map((reason) => ({ facilityId: item.facilityId, reason }))),
      truthBoundary: 'Optimizer eligibility requires both a road-network route and attributable current capacity. Candidate rank is not dispatch, authority, acknowledgement, or availability.'
    },
    resourceOptimizer,
    resourceCoverageMap,
    medicalSurge,
    fireResponseSurge,
    recommendations,
    truthBoundary: 'OpenStreetMap facility records are governed static context. Routing is an estimate, not dispatch. Dynamic capacity exists only when an attributable report is admitted; missing values remain unknown, never zero.'
  };
  return immutable({ ...projection, projectionId: buildResponseProjectionId(projection) });
}
