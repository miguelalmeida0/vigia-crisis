import { RESPONSE_FACILITY_KINDS, finiteCount, isoOrNull } from './capacity-contract.mjs';
import { facilityCapacityAvailability } from './facility-truth.mjs';

export function validCoordinate(value) {
  return Array.isArray(value) && value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))
    && Number(value[0]) >= -180 && Number(value[0]) <= 180 && Number(value[1]) >= -90 && Number(value[1]) <= 90;
}

export function routedLineGeometry(facility) {
  if (facility?.reachability?.state !== 'ROUTED') return null;
  const geometry = facility.reachability?.currentRoute?.geometry;
  if (geometry?.type !== 'LineString' || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2 || !geometry.coordinates.every(validCoordinate)) return null;
  return { type: 'LineString', coordinates: geometry.coordinates.map((coordinate) => [Number(coordinate[0]), Number(coordinate[1])]) };
}

export function responseCoverageSurfaceProjection(surface, facilities, generatedAt) {
  const source = surface && typeof surface === 'object' ? surface : null;
  if (source?.state !== 'ROAD_NETWORK_SAMPLES_AVAILABLE' || !Array.isArray(source.samples)) return {
    schemaVersion: 'vigia.response-coverage-surface.v1',
    state: source?.state ?? 'WITHHELD_NO_GOVERNED_SURFACE',
    geometryPolicy: 'ROUTED_POINT_SAMPLES_NO_INTERPOLATED_AREA',
    generatedAt,
    checkedAt: isoOrNull(source?.checkedAt),
    features: { type: 'FeatureCollection', features: [] },
    source: source?.source ?? null,
    reason: source?.reason ?? 'No governed road-network sample surface is available.',
    unlockCondition: 'Restore a routing adapter that returns attributable road-network duration samples and can enforce any active governed closure or vehicle constraint.',
    truthBoundary: source?.truthBoundary ?? 'No regional response-coverage claim is made.'
  };
  const facilityById = new Map(RESPONSE_FACILITY_KINDS.flatMap((kind) => facilities[kind] ?? []).map((facility) => [String(facility.id), facility]));
  const features = source.samples.filter((sample) => validCoordinate(sample?.coordinate)).map((sample, index) => {
    const byKind = Object.fromEntries(RESPONSE_FACILITY_KINDS.map((kind) => {
      const route = sample?.byKind?.[kind];
      if (!route || !Number.isFinite(Number(route.travelTimeMinutes))) return [kind, {
        state: 'UNROUTED', facilityId: null, travelTimeMinutes: null, routeDistanceKm: null,
        capacityAvailability: 'UNKNOWN', committedCount: null,
        explanation: `No road-network duration was returned for ${kind.toLowerCase().replaceAll('_', ' ')}.`
      }];
      const facility = facilityById.get(String(route.facilityId));
      const availability = facility ? facilityCapacityAvailability(facility) : 'UNKNOWN';
      const committed = finiteCount(facility?.dynamicCapacity?.fields?.crewsAssigned);
      const minutes = finiteCount(route.travelTimeMinutes);
      const withinBand = minutes !== null && minutes <= 60;
      return [kind, {
        state: withinBand ? (availability === 'CONFIRMED_AVAILABLE' ? 'CONFIRMED_AVAILABLE_WITHIN_60_MIN' : availability === 'CONFIRMED_NO_AVAILABLE_CAPACITY' ? 'NO_CONFIRMED_AVAILABLE_CAPACITY_WITHIN_60_MIN' : 'ROUTED_WITHIN_60_MIN_CAPACITY_UNKNOWN') : 'ROUTED_BEYOND_60_MIN',
        facilityId: route.facilityId,
        facilityLabel: facility?.name ?? route.facilityId,
        travelTimeMinutes: minutes,
        routeDistanceKm: finiteCount(route.routeDistanceKm),
        capacityAvailability: availability,
        committedCount: committed,
        explanation: `${facility?.name ?? route.facilityId} is the fastest sampled ${kind.toLowerCase().replaceAll('_', ' ')} at ${minutes} minutes by ${source.method ?? 'road-network routing'}; ${availability.toLowerCase().replaceAll('_', ' ')}${committed === null ? '; committed count unknown' : `; ${committed} reported committed`}.`
      }];
    }));
    const routed = Object.values(byKind).filter((item) => Number.isFinite(item.travelTimeMinutes));
    const available = routed.filter((item) => item.capacityAvailability === 'CONFIRMED_AVAILABLE');
    const unknown = routed.filter((item) => item.capacityAvailability === 'UNKNOWN');
    const within60 = routed.filter((item) => item.travelTimeMinutes <= 60);
    const fastest = [...routed].sort((left, right) => left.travelTimeMinutes - right.travelTimeMinutes || String(left.facilityId).localeCompare(String(right.facilityId)))[0] ?? null;
    const coverageState = available.some((item) => item.travelTimeMinutes <= 60)
      ? 'CONFIRMED_AVAILABLE_CAPABILITY'
      : within60.length && unknown.length ? 'ROUTED_CAPABILITY_DYNAMIC_STATE_UNKNOWN'
        : within60.length ? 'ROUTED_NO_CONFIRMED_AVAILABLE_CAPACITY'
          : 'UNCOVERED_WITHIN_60_MIN_SAMPLE';
    return {
      type: 'Feature',
      id: sample.sampleId ?? `road-sample:${index + 1}`,
      geometry: { type: 'Point', coordinates: [Number(sample.coordinate[0]), Number(sample.coordinate[1])] },
      properties: {
        layer: 'responseCoverageSurface',
        sampleId: sample.sampleId ?? `road-sample:${index + 1}`,
        coverageState,
        responseMinutes: fastest?.travelTimeMinutes ?? null,
        fastestFacilityId: fastest?.facilityId ?? null,
        fastestFacilityLabel: fastest?.facilityLabel ?? null,
        availableFacilityCount: available.length,
        dynamicUnknownCount: unknown.length,
        committedFacilityCount: routed.filter((item) => Number(item.committedCount) > 0).length,
        fireMinutes: byKind.FIRE_STATION.travelTimeMinutes,
        hospitalMinutes: byKind.HOSPITAL.travelTimeMinutes,
        emsMinutes: byKind.EMS_BASE.travelTimeMinutes,
        waterMinutes: byKind.WATER_POINT.travelTimeMinutes,
        capabilityByKind: byKind,
        explanation: fastest
          ? `${fastest.facilityLabel} is the fastest routed mapped facility at ${fastest.travelTimeMinutes} minutes. ${available.length} class route${available.length === 1 ? '' : 's'} has confirmed available capacity; ${unknown.length} class route${unknown.length === 1 ? '' : 's'} has unresolved dynamic capacity.`
          : 'No facility-to-sample road-network duration was returned.'
      }
    };
  });
  return {
    schemaVersion: 'vigia.response-coverage-surface.v1',
    state: features.length ? 'ROAD_NETWORK_SAMPLE_SURFACE_AVAILABLE' : 'WITHHELD_NO_ROUTABLE_PATH',
    geometryPolicy: 'ROUTED_POINT_SAMPLES_NO_INTERPOLATED_AREA',
    generatedAt,
    checkedAt: isoOrNull(source.checkedAt),
    features: { type: 'FeatureCollection', features },
    source: source.source ?? null,
    roadClosureImpact: source.roadClosureImpact ?? null,
    terrainAccessConstraints: source.terrainAccessConstraints ?? null,
    reason: features.length ? null : source.reason ?? 'The router returned no reachable coverage sample.',
    unlockCondition: features.length ? null : 'Restore attributable road-network sampling.',
    truthBoundary: `${source.truthBoundary ?? 'Each feature is a road-network duration sample.'} Rendering must remain discrete; VIGIA does not interpolate the samples into an asserted continuous service area.`
  };
}

