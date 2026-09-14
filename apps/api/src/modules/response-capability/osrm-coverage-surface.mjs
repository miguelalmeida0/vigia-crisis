import { fetchJson } from '../../shared/fetch.mjs';
import { classifyGovernedConstraints } from './governed-route-constraints.mjs';

const validCoordinate = (value) => Array.isArray(value) && value.length >= 2
  && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))
  && Number(value[0]) >= -180 && Number(value[0]) <= 180
  && Number(value[1]) >= -90 && Number(value[1]) <= 90;
const round = (value, digits = 1) => Number(Number(value).toFixed(digits));
const source = (endpoint) => ({ provider: 'OSRM public routing service', roadData: 'OpenStreetMap', endpoint });

export async function projectOsrmCoverageSurface({ facilities, sampleCoordinates, context, endpoint, fetchImpl, timeoutMs, checkedAt }) {
  const candidates = (Array.isArray(facilities) ? facilities : []).filter((facility) => facility?.id && validCoordinate(facility.coordinate)).slice(0, 24);
  const samples = (Array.isArray(sampleCoordinates) ? sampleCoordinates : []).filter(validCoordinate).slice(0, 25)
    .map((coordinate) => [Number(coordinate[0]), Number(coordinate[1])]);
  if (!candidates.length || !samples.length) return {
    schemaVersion: 'vigia.road-network-coverage-samples.v1', state: 'WITHHELD_NO_ROUTABLE_INPUT', checkedAt,
    source: null, samples: [], reason: 'No governed facility coordinate or valid coverage sample coordinate is available.',
    truthBoundary: 'No road-network regional coverage claim is made.'
  };
  const constraints = classifyGovernedConstraints(context);
  if (constraints.closures.length || constraints.vehicleConstraints.length) return {
    schemaVersion: 'vigia.road-network-coverage-samples.v1', state: 'WITHHELD_UNSUPPORTED_GOVERNED_CONSTRAINT', checkedAt,
    source: source(endpoint), samples: [],
    roadClosureImpact: {
      state: constraints.closures.length ? 'GOVERNED_CLOSURE_REQUIRES_CAPABLE_ROUTER' : 'NO_GOVERNED_CLOSURE_SUPPLIED',
      closures: constraints.closures,
      reason: constraints.closures.length ? 'A public duration matrix cannot prove that every sampled path avoids governed closure geometry.' : 'No active governed closure is supplied.'
    },
    terrainAccessConstraints: {
      state: constraints.vehicleConstraints.length ? 'GOVERNED_CONSTRAINT_REQUIRES_CAPABLE_ROUTER' : 'NOT_ROUTING_CONSTRAINED',
      constraints: constraints.vehicleConstraints,
      reason: constraints.vehicleConstraints.length ? 'The public driving profile cannot enforce the supplied emergency-vehicle constraint.' : 'No governed vehicle constraint is supplied.'
    },
    reason: 'The configured public routing matrix cannot apply all active governed constraints. A closure-capable routing adapter or other constraint-aware matrix source is required.',
    truthBoundary: 'No regional reachability surface is projected while a supplied constraint cannot be enforced.'
  };
  const coordinates = [...candidates.map((facility) => facility.coordinate), ...samples]
    .map((coordinate) => `${Number(coordinate[0])},${Number(coordinate[1])}`).join(';');
  const sourceIndexes = candidates.map((_, index) => index).join(';');
  const destinationIndexes = samples.map((_, index) => index + candidates.length).join(';');
  const url = `${endpoint}/table/v1/driving/${coordinates}?sources=${sourceIndexes}&destinations=${destinationIndexes}&annotations=duration,distance`;
  try {
    const payload = await fetchJson(url, { fetchImpl, timeoutMs, maxBytes: 2_000_000 });
    if (payload?.code !== 'Ok' || !Array.isArray(payload.durations)) throw new Error(`routing_table_${payload?.code ?? 'invalid_response'}`);
    const projected = samples.map((coordinate, sampleIndex) => {
      const byKind = {};
      candidates.forEach((facility, facilityIndex) => {
        const seconds = payload.durations?.[facilityIndex]?.[sampleIndex];
        const metres = payload.distances?.[facilityIndex]?.[sampleIndex];
        if (!Number.isFinite(seconds) || seconds < 0) return;
        const candidate = {
          facilityId: String(facility.id), facilityKind: String(facility.kind ?? 'UNKNOWN'), travelTimeMinutes: round(seconds / 60, 1),
          routeDistanceKm: Number.isFinite(metres) && metres >= 0 ? round(metres / 1000, 2) : null
        };
        const current = byKind[candidate.facilityKind];
        if (!current || candidate.travelTimeMinutes < current.travelTimeMinutes
          || (candidate.travelTimeMinutes === current.travelTimeMinutes && candidate.facilityId.localeCompare(current.facilityId) < 0)) byKind[candidate.facilityKind] = candidate;
      });
      return { sampleId: `road-sample:${sampleIndex + 1}`, coordinate, byKind };
    });
    return {
      schemaVersion: 'vigia.road-network-coverage-samples.v1',
      state: projected.some((sample) => Object.keys(sample.byKind).length) ? 'ROAD_NETWORK_SAMPLES_AVAILABLE' : 'WITHHELD_NO_ROUTABLE_PATH',
      checkedAt, method: 'OSRM_TABLE_ROAD_NETWORK_SAMPLING', source: source(endpoint), facilityCount: candidates.length,
      sampleCount: projected.length, samples: projected,
      roadClosureImpact: { state: 'UNKNOWN', closures: [], reason: 'No governed current road-closure feed was supplied.' },
      terrainAccessConstraints: { state: 'NOT_ROUTING_CONSTRAINED', constraints: [], reason: 'The matrix is not qualified for emergency-vehicle, bridge, traffic, terrain, or incident-access constraints.' },
      reason: null,
      truthBoundary: 'Each point is an OSRM road-network duration sample from mapped facilities. Points are not a continuous service area and do not prove passability, availability, dispatch, assignment, or arrival.'
    };
  } catch (error) {
    return {
      schemaVersion: 'vigia.road-network-coverage-samples.v1', state: 'WITHHELD_ROUTING_UNAVAILABLE', checkedAt,
      source: source(endpoint), samples: [], reason: `Road-network coverage sampling unavailable: ${String(error?.message ?? error ?? 'unknown_error')}.`,
      truthBoundary: 'No regional response-coverage claim is made when the routing table cannot be resolved.'
    };
  }
}
