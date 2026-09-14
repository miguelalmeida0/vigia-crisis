import {
  FACILITY_ROUTE_BANDS, RESPONSE_FACILITY_KINDS, finiteCount, isoOrNull, textOrNull,
} from './capacity-contract.mjs';
import { facilityCapacityAvailability } from './facility-truth.mjs';
import {
  responseCoverageSurfaceProjection, routedLineGeometry, validCoordinate,
} from './response-coverage-surface.mjs';

export function resourceCoverageMapProjection(incident, facilities, generatedAt, coverageSurface = null) {
  const allFacilities = RESPONSE_FACILITY_KINDS.flatMap((kind) => facilities[kind] ?? []);
  const routeFeatures = [];
  const facilityFeatures = [];
  const excluded = [];
  for (const facility of allFacilities) {
    if (validCoordinate(facility.coordinate)) {
      facilityFeatures.push({
        type: 'Feature',
        id: facility.id,
        geometry: { type: 'Point', coordinates: [Number(facility.coordinate[0]), Number(facility.coordinate[1])] },
        properties: {
          facilityId: facility.id,
          facilityKind: facility.kind,
          canonicalId: facility.canonicalId ?? null,
          canonicalType: facility.canonicalType ?? null,
          presentation: facility.presentation ?? null,
          label: facility.name ?? facility.id,
          source: textOrNull(facility.provenance?.provider ?? facility.source?.name ?? facility.source),
          sourceReference: textOrNull(facility.provenance?.sourceRecordId ?? facility.provenance?.archiveSha256 ?? facility.source?.reference),
          updatedAt: isoOrNull(facility.dynamicCapacity?.lastUpdatedAt ?? facility.freshness?.retrievedAt ?? facility.provenance?.retrievedAt),
          freshnessState: textOrNull(facility.freshness?.state ?? facility.freshness),
          routeState: facility.reachability?.state ?? 'UNKNOWN',
          routeConfidenceState: textOrNull(facility.reachability?.confidence?.state) ?? 'UNKNOWN',
          capacityState: facility.dynamicCapacity?.state ?? 'UNKNOWN',
          capacityConfidenceState: textOrNull(facility.dynamicCapacity?.confidence?.state) ?? 'UNKNOWN',
          capacityAvailability: facilityCapacityAvailability(facility),
          truthBoundary: 'Mapped facility context does not prove present operating status, capacity, dispatch, assignment, or arrival.'
        }
      });
    }
    const geometry = routedLineGeometry(facility);
    if (!geometry) {
      excluded.push({
        facilityId: facility.id,
        facilityKind: facility.kind,
        reason: facility.reachability?.state === 'ROUTED' ? 'ROUTED_LINE_GEOMETRY_NOT_RETURNED' : 'ROAD_ROUTE_NOT_AVAILABLE'
      });
      continue;
    }
    const reachability = facility.reachability;
    const closure = reachability.roadClosureImpact ?? {};
    const access = reachability.terrainAccessConstraints ?? {};
    const closureIds = Array.isArray(closure.closures) ? closure.closures.map((item) => textOrNull(item?.id ?? item)).filter(Boolean) : [];
    const routeExplanation = [
      `Road-routed ${facility.kind.toLowerCase().replaceAll('_', ' ')} candidate`,
      `${finiteCount(reachability.travelTimeMinutes) ?? 'unknown'} minute route estimate`,
      `capacity ${facilityCapacityAvailability(facility).toLowerCase().replaceAll('_', ' ')}`,
      closure.state && closure.state !== 'UNKNOWN' ? `closure impact ${String(closure.state).toLowerCase().replaceAll('_', ' ')}` : null,
      access.state && !['UNKNOWN', 'NOT_ROUTING_CONSTRAINED'].includes(String(access.state)) ? `access constraint ${String(access.state).toLowerCase().replaceAll('_', ' ')}` : null
    ].filter(Boolean).join('; ');
    routeFeatures.push({
      type: 'Feature',
      id: `response-route:${facility.id}`,
      geometry,
      properties: {
        layer: 'responseCoverageRoutes',
        facilityId: facility.id,
        facilityKind: facility.kind,
        label: facility.name ?? facility.id,
        travelTimeMinutes: finiteCount(reachability.travelTimeMinutes),
        routeDistanceKm: finiteCount(reachability.routeDistanceKm),
        routeMethod: textOrNull(reachability.method),
        routeCheckedAt: isoOrNull(reachability.checkedAt),
        routeSource: textOrNull(reachability.source?.provider ?? reachability.source?.name ?? reachability.source),
        routeConfidenceState: textOrNull(reachability.confidence?.state) ?? 'UNKNOWN',
        alternativeRouteState: textOrNull(reachability.alternativeRouteState),
        roadClosureState: textOrNull(closure.state) ?? 'UNKNOWN',
        roadClosureIds: closureIds,
        roadClosureReason: textOrNull(closure.reason),
        accessConstraintState: textOrNull(access.state) ?? 'UNKNOWN',
        accessConstraintReason: textOrNull(access.reason),
        capacityState: facility.dynamicCapacity?.state ?? 'UNKNOWN',
        capacityAvailability: facilityCapacityAvailability(facility),
        dispatchClaimed: false,
        explanation: `${routeExplanation}.`
      }
    });
  }
  const coverageBands = RESPONSE_FACILITY_KINDS.flatMap((kind) => FACILITY_ROUTE_BANDS[kind].map((minutes) => {
    const matching = routeFeatures.filter((feature) => feature.properties.facilityKind === kind && Number(feature.properties.travelTimeMinutes) <= minutes);
    return { facilityKind: kind, minutes, routeFeatureIds: matching.map((feature) => feature.id), facilityIds: matching.map((feature) => feature.properties.facilityId), count: matching.length };
  }));
  const routeSources = [...new Set(routeFeatures.map((feature) => feature.properties.routeSource).filter(Boolean))];
  const routeCheckTimes = routeFeatures.map((feature) => feature.properties.routeCheckedAt).filter(Boolean).sort((left, right) => Date.parse(left) - Date.parse(right));
  const responseCoverageSurface = responseCoverageSurfaceProjection(coverageSurface, facilities, generatedAt);
  return {
    schemaVersion: 'vigia.resource-coverage-map.v1',
    state: routeFeatures.length ? 'ROUTED_PATH_COVERAGE_AVAILABLE' : 'WITHHELD_NO_ROUTED_GEOMETRY',
    generatedAt,
    incidentId: String(incident.id),
    geometryPolicy: 'ROUTED_ROAD_LINES_ONLY',
    serviceArea: {
      state: routeFeatures.length ? 'ROUTED_PATHS_ONLY_NO_ISOCHRONE' : 'WITHHELD_NO_ROUTED_GEOMETRY',
      geometry: null,
      reason: routeFeatures.length
        ? 'The routing source returned path geometries, not isochrone polygons. VIGIA shows exact returned road paths and does not draw a radius or claim area-wide reachability.'
        : 'No valid routed road geometry was supplied; VIGIA withholds service-area geometry instead of drawing a decorative radius.',
      unlockCondition: 'Admit routed road paths for path coverage, or a governed routing isochrone for a true service-area polygon.'
    },
    routeFeatures: { type: 'FeatureCollection', features: routeFeatures },
    facilityFeatures: { type: 'FeatureCollection', features: facilityFeatures },
    responseCoverageSurface,
    coverageBands,
    excluded,
    source: { providers: routeSources, checkedAt: routeCheckTimes[0] ?? null, oldestCheckedAt: routeCheckTimes[0] ?? null, latestCheckedAt: routeCheckTimes.at(-1) ?? null, projectedAt: generatedAt },
    truthBoundary: 'Rendered lines are routing estimates along returned road geometry. They do not prove current passability, a service-area polygon, dispatch, resource availability, assignment, acknowledgement, or arrival.'
  };
}
