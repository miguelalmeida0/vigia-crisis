import {
  FACILITY_ROUTE_BANDS, finiteCount, textOrNull,
} from './capacity-contract.mjs';
import {
  availableCapacityFor, availableQuantitiesFor, availableQuantityFor, candidateCapabilities,
  candidateConstraints, committedQuantitiesFor, hasCurrentCapacityReport, knownCapacityFor,
  responseCapabilityQualified,
} from './facility-truth.mjs';
import { validCoordinate } from './response-coverage-surface.mjs';

export function buildOptimizerCandidates(facilities, decisionContext) {
  const fireStations = facilities.FIRE_STATION;
  const hospitals = facilities.HOSPITAL;
  const allCandidates = [...fireStations, ...hospitals, ...facilities.EMS_BASE, ...facilities.CIVIL_PROTECTION, ...facilities.POLICE, ...facilities.SHELTER, ...facilities.WATER_POINT, ...facilities.AIR_SUPPORT_BASE];
    const optimizerCandidates = allCandidates.map((facility) => {
      const capacityReportConfirmed = hasCurrentCapacityReport(facility);
      const capacityKnown = knownCapacityFor(facility);
      const availableCapacityConfirmed = availableCapacityFor(facility);
      const capabilityQualified = responseCapabilityQualified(facility);
      const availableQuantity = availableQuantityFor(facility);
      const availableQuantities = availableQuantitiesFor(facility);
      const committedQuantities = committedQuantitiesFor(facility);
      const demand = decisionContext.resourceDemand?.byFacilityKind?.[facility.kind] ?? decisionContext.resourceDemand?.[facility.kind] ?? null;
      const capacityDecisionRelevant = (facility.kind === 'HOSPITAL' && decisionContext.medicalCapacityRequired === true)
        || (facility.kind === 'FIRE_STATION' && decisionContext.fireCapacityRequired === true)
        || (Array.isArray(decisionContext.requiredFacilityKinds) && decisionContext.requiredFacilityKinds.includes(facility.kind))
        || demand !== null;
      const requiredQuantity = finiteCount(demand?.required ?? demand);
      const competingDemandQuantity = finiteCount(decisionContext.currentCommitments?.byFacilityId?.[facility.id] ?? decisionContext.currentCommitments?.[facility.id]);
      const effectiveAvailableQuantity = availableQuantity === null ? null : competingDemandQuantity === null
        ? availableQuantity : Math.max(0, availableQuantity - competingDemandQuantity);
      const stagingConstraint = decisionContext.stagingConstraints?.byFacilityId?.[facility.id] ?? null;
      const stagingSafety = stagingConstraint?.state ?? 'NOT_ASSESSED';
      const stagingSafe = !['UNSAFE', 'BLOCKED', 'PROHIBITED'].includes(String(stagingSafety).toUpperCase());
      const coveragePenalty = Number.isFinite(Number(decisionContext.coverageTradeoffs?.byFacilityId?.[facility.id]))
        ? Math.max(0, Number(decisionContext.coverageTradeoffs.byFacilityId[facility.id])) : 0;
      const demandSatisfied = requiredQuantity === null || (effectiveAvailableQuantity !== null && effectiveAvailableQuantity >= requiredQuantity);
      return {
        facilityId: facility.id,
        kind: facility.kind,
        routeState: facility.reachability?.state ?? 'UNKNOWN',
        travelTimeMinutes: facility.reachability?.travelTimeMinutes ?? null,
        routeDistanceKm: facility.reachability?.routeDistanceKm ?? null,
        routeCheckedAt: facility.reachability?.checkedAt ?? null,
        straightLineDistanceKm: facility.distanceKm,
        capacityState: facility.dynamicCapacity?.state ?? 'UNKNOWN',
        capacityObservedAt: facility.dynamicCapacity?.lastUpdatedAt ?? null,
        capacityReportConfirmed,
        capacityKnown,
        capacityDecisionRelevant,
        availableCapacityConfirmed,
        availableQuantity,
        availableQuantities,
        committedQuantities,
        requiredQuantity,
        competingDemandQuantity,
        effectiveAvailableQuantity,
        commitmentAdjustmentState: competingDemandQuantity === null ? 'NO_SEPARATE_COMMITMENT_INPUT_AVAILABLE_VALUE_RETAINED' : 'ADMITTED_COMMITMENT_SUBTRACTED',
        stagingSafety,
        stagingCandidate: validCoordinate(facility.coordinate) && textOrNull(facility.provenance?.provider) && textOrNull(facility.provenance?.sourceRecordId ?? facility.provenance?.archiveSha256 ?? facility.provenance?.reference) ? {
          state: 'GOVERNED_CANDIDATE',
          kind: 'FACILITY_ORIGIN_HOLDING_POINT',
          coordinate: [Number(facility.coordinate[0]), Number(facility.coordinate[1])],
          facilityId: facility.id,
          source: { sourceId: facility.provenance.provider, reference: facility.provenance.sourceRecordId ?? facility.provenance.archiveSha256 ?? facility.provenance.reference },
          truthBoundary: 'This is the governed facility origin, not a selected or approved incident staging location.'
        } : null,
        crewStatus: {
          state: capacityReportConfirmed ? 'ATTRIBUTABLE_CURRENT_REPORT' : 'UNKNOWN',
          crewsAvailable: finiteCount(facility.dynamicCapacity?.fields?.crewsAvailable),
          wildfireCrewsAvailable: finiteCount(facility.dynamicCapacity?.fields?.wildfireCrewsAvailable),
          crewsAssigned: finiteCount(facility.dynamicCapacity?.fields?.crewsAssigned),
          crewSize: finiteCount(facility.dynamicCapacity?.fields?.crewSize),
          readiness: textOrNull(facility.dynamicCapacity?.fields?.stationReadiness),
        },
        capabilities: candidateCapabilities(facility),
        coverage: {
          state: facility.reachability?.state === 'ROUTED' ? 'ROUTED_TIME_AVAILABLE' : 'UNKNOWN',
          travelTimeMinutes: facility.reachability?.travelTimeMinutes ?? null,
          routeDistanceKm: facility.reachability?.routeDistanceKm ?? null,
          withinMinutes: facility.reachability?.state === 'ROUTED' ? FACILITY_ROUTE_BANDS[facility.kind].filter((minutes) => facility.reachability.travelTimeMinutes <= minutes) : [],
        },
        constraints: candidateConstraints(facility),
        coveragePenalty,
        confirmedCapacity: capacityKnown,
        capabilityQualified,
        eligibleForDispatchRecommendation: facility.reachability?.state === 'ROUTED' && availableCapacityConfirmed && capabilityQualified && stagingSafe && demandSatisfied,
        exclusionReasons: [
          ...(facility.reachability?.state === 'ROUTED' ? [] : ['ROAD_REACHABILITY_NOT_PROVEN']),
          ...(capacityKnown ? [] : ['CURRENT_CAPACITY_NOT_CONFIRMED']),
          ...(capacityKnown && !availableCapacityConfirmed ? ['CURRENT_AVAILABLE_CAPACITY_NOT_CONFIRMED'] : []),
          ...(capabilityQualified ? [] : ['INCIDENT_RELEVANT_STATIC_OR_REPORTED_CAPABILITY_NOT_CONFIRMED']),
          ...(stagingSafe ? [] : ['STAGING_LOCATION_NOT_SAFE']),
          ...(demandSatisfied ? [] : ['EFFECTIVE_CAPACITY_BELOW_ADMITTED_DEMAND'])
        ]
      };
    });
  return { allCandidates, optimizerCandidates };
}
