import {
  hasAvailableFireCapacity, hasAvailableHospitalCapacity, hasKnownFireCapacity,
  hasKnownHospitalCapacity, responseCapabilityQualified,
} from './facility-truth.mjs';
import { semanticHash } from '../intelligence/shared.mjs';
import { bindResponseRecommendation } from './recommendation-review.mjs';
import { recommendationReviewState, recommendationValidity } from './recommendation-validity.mjs';

export function buildResponseRecommendations(fireStations, hospitals, optimizerCandidates, generatedAt, incidentId) {
  const fastestFire = fireStations.find((item) => item.reachability?.state === 'ROUTED') ?? null;
    const fastestHospital = hospitals.find((item) => item.reachability?.state === 'ROUTED') ?? null;
    const eligibleById = new Map(optimizerCandidates.filter((item) => item.eligibleForDispatchRecommendation).map((item) => [item.facilityId, item]));
    const bestFire = fireStations.find((item) => eligibleById.has(item.id)) ?? null;
    const bestHospital = hospitals.find((item) => eligibleById.has(item.id)) ?? null;
    const fireChoice = bestFire ?? fastestFire;
    const hospitalChoice = bestHospital ?? fastestHospital;
    const recommendations = [
      fireChoice ? {
        kind: 'FIRE_RESPONSE_REVIEW',
        facilityId: fireChoice.id,
        recommendation: bestFire && fastestFire && bestFire.id !== fastestFire.id
          ? `${fastestFire.name} is closest by routed time, but its effective current capacity is not eligible. Review ${bestFire.name}, ${Number((bestFire.reachability.travelTimeMinutes - fastestFire.reachability.travelTimeMinutes).toFixed(1))} minutes farther, because it has attributable available incident-relevant capacity.`
          : hasAvailableFireCapacity(fireChoice) && responseCapabilityQualified(fireChoice) ? `Review ${fireChoice.name} as the fastest routed fire-response candidate with attributable available capacity.` : hasKnownFireCapacity(fireChoice) ? `${fireChoice.name} is the fastest routed station, but its current report does not confirm effective available wildfire capacity; review reinforcement.` : `Verify current capacity and wildfire capability at ${fireChoice.name}; it is the fastest routed station but effective availability is not confirmed.`,
        basis: 'ROAD_ROUTE_AND_CAPACITY_TRUTH',
        authority: 'PLANNING_SUPPORT_ONLY'
      } : {
        kind: 'FIRE_RESPONSE_REVIEW', facilityId: null,
        recommendation: 'Road travel time to fire response is unavailable; do not use straight-line order as a dispatch recommendation.',
        basis: 'ROUTING_UNAVAILABLE', authority: 'PLANNING_SUPPORT_ONLY'
      },
      hospitalChoice ? {
        kind: 'MEDICAL_RECEIVING_REVIEW',
        facilityId: hospitalChoice.id,
        recommendation: bestHospital && fastestHospital && bestHospital.id !== fastestHospital.id
          ? `${fastestHospital.name} is nearest by routed time, but its receiving capacity is not currently eligible. Review ${bestHospital.name}, ${Number((bestHospital.reachability.travelTimeMinutes - fastestHospital.reachability.travelTimeMinutes).toFixed(1))} minutes farther, because it has attributable receiving capacity.`
          : hasAvailableHospitalCapacity(hospitalChoice) && responseCapabilityQualified(hospitalChoice) ? `Review ${hospitalChoice.name} as the fastest routed hospital with attributable receiving capacity.` : hasKnownHospitalCapacity(hospitalChoice) ? `${hospitalChoice.name} is the fastest routed hospital, but its current report does not confirm available receiving capacity; review alternatives.` : `Verify emergency receiving capability and capacity at ${hospitalChoice.name}; route time alone is insufficient.`,
        basis: 'ROAD_ROUTE_AND_CAPACITY_TRUTH',
        authority: 'PLANNING_SUPPORT_ONLY'
      } : {
        kind: 'MEDICAL_RECEIVING_REVIEW', facilityId: null,
        recommendation: 'Hospital road travel time is unavailable; do not infer medical access from straight-line distance.',
        basis: 'ROUTING_UNAVAILABLE', authority: 'PLANNING_SUPPORT_ONLY'
      }
    ];
  const facilityById = new Map([...fireStations, ...hospitals].map((facility) => [facility.id, facility]));
  return recommendations.map((recommendation) => {
    const validity = recommendationValidity(facilityById.get(recommendation.facilityId));
    return bindResponseRecommendation({
      ...recommendation,
      recommendationId: semanticHash('response-decision-recommendation', {
        kind: recommendation.kind,
        facilityId: recommendation.facilityId,
        incidentId
      }).slice(0, 57),
      state: recommendationReviewState(validity, generatedAt),
      ...validity,
      requiresHumanApproval: true,
      dispatchClaimed: false,
      assignmentClaimed: false
    });
  });
}
