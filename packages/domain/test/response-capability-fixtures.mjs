import { normalizeDynamicCapacity } from '../src/response-capability/index.mjs';

export const at = '2026-09-04T15:00:00.000Z';

export const reachability = (minutes, distanceKm) => ({
  state: 'ROUTED', method: 'OSRM_ROAD_NETWORK', routeDistanceKm: distanceKm, travelTimeMinutes: minutes,
  currentRoute: { travelTimeMinutes: minutes, distanceKm, geometry: null, geometryState: 'NOT_RETURNED' },
  alternativeRoute: null, alternativeRouteState: 'NOT_RETURNED',
  roadClosureImpact: { state: 'UNKNOWN', closures: [] }, terrainAccessConstraints: { state: 'NOT_ROUTING_CONSTRAINED', constraints: [] },
  source: { provider: 'OSRM' }, checkedAt: at, confidence: { state: 'CONTEXTUAL_ESTIMATE', score: null }, reason: null
});

export const facility = (id, kind, minutes, capacity = null) => ({
  id, kind, name: id, coordinate: [-8.4, 41.1], distanceKm: minutes / 2,
  reachability: reachability(minutes, minutes / 1.5),
  staticCapability: kind === 'HOSPITAL' ? { emergencyDepartment: { state: 'KNOWN', value: true } } : { wildfireCapability: { state: 'KNOWN', value: true } },
  provenance: { provider: 'OpenStreetMap contributors' },
  dynamicCapacity: capacity ?? normalizeDynamicCapacity(kind, null)
});
