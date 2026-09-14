import { fetchJson } from '../../shared/fetch.mjs';

const round = (value, digits = 1) => Number(Number(value).toFixed(digits));

async function mapLimit(items, limit, operation) {
  const output = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await operation(items[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}

const source = (endpoint) => ({ provider: 'OSRM public routing service', roadData: 'OpenStreetMap', endpoint });

function unreachable(facility, endpoint, checkedAt) {
  return {
    ...facility,
    reachability: {
      state: 'UNREACHABLE', method: 'OSRM_TABLE_ROAD_NETWORK', routeDistanceKm: null,
      travelTimeMinutes: null, currentRoute: null, alternativeRoute: null,
      alternativeRouteState: 'NO_ROUTE',
      roadClosureImpact: { state: 'UNKNOWN', closures: [], reason: 'No governed current road-closure feed was supplied to the routing request.' },
      terrainAccessConstraints: { state: 'NOT_ROUTING_CONSTRAINED', constraints: [], reason: 'No governed vehicle or terrain access constraint was supplied to the routing provider.' },
      source: source(endpoint), checkedAt,
      confidence: { state: 'ROUTING_PROVIDER_RESULT', score: null },
      reason: 'The routing provider explicitly returned no drivable route in the exhaustive table result.'
    }
  };
}

function routed(facility, endpoint, checkedAt, duration, distance) {
  const travelTimeMinutes = round(duration / 60, 1);
  const routeDistanceKm = round(distance / 1000, 2);
  return {
    ...facility,
    reachability: {
      state: 'ROUTED', method: 'OSRM_TABLE_ROAD_NETWORK', routeDistanceKm,
      travelTimeMinutes,
      currentRoute: { travelTimeMinutes, distanceKm: routeDistanceKm, geometry: null, geometryState: 'NOT_RETURNED' },
      alternativeRoute: null, alternativeRouteState: 'NOT_REQUESTED_FOR_DENOMINATOR',
      roadClosureImpact: { state: 'UNKNOWN', closures: [], reason: 'The exhaustive table result is not joined to a governed current road-closure feed.' },
      terrainAccessConstraints: { state: 'NOT_ROUTING_CONSTRAINED', constraints: [], reason: 'The public driving profile does not prove emergency-vehicle or incident-access suitability.' },
      source: source(endpoint), checkedAt,
      confidence: { state: 'CONTEXTUAL_ESTIMATE', score: null },
      reason: 'Travel time is an exhaustive public road-network table estimate, not a dispatch ETA or proof of current passability.'
    }
  };
}

function batches(items, size) {
  const output = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function routeExhaustiveOsrmMatrix(origin, facilities, {
  endpoint, fetchImpl, timeoutMs, checkedAt, batchSize = 49, concurrency = 3,
  retryAttempts = 3, retryBaseDelayMs = 150, onBatchFailure = null
}) {
  const groups = batches(facilities, Math.max(1, Math.min(49, batchSize)));
  const results = await mapLimit(groups, concurrency, async (group, groupIndex) => {
    const coordinates = [origin, ...group.map((item) => item.coordinate)].map((item) => `${item[0]},${item[1]}`).join(';');
    const destinations = group.map((_, index) => index + 1).join(';');
    const url = `${endpoint}/table/v1/driving/${coordinates}?sources=0&destinations=${destinations}&annotations=duration,distance`;
    let failure = null;
    for (let attempt = 1; attempt <= Math.max(1, retryAttempts); attempt += 1) {
      try {
        const payload = await fetchJson(url, { fetchImpl, timeoutMs, maxBytes: 1_500_000 });
        if (payload?.code !== 'Ok' || !Array.isArray(payload?.durations?.[0]) || !Array.isArray(payload?.distances?.[0])) {
          throw new Error(`osrm_table_invalid_response:${payload?.code ?? 'missing_code'}`);
        }
        if (payload.durations[0].length !== group.length || payload.distances[0].length !== group.length) {
          throw new Error('osrm_table_denominator_mismatch');
        }
        return group.map((facility, index) => {
          const duration = payload.durations[0][index], distance = payload.distances[0][index];
          return Number.isFinite(duration) && Number.isFinite(distance)
            ? routed(facility, endpoint, checkedAt, duration, distance)
            : unreachable(facility, endpoint, checkedAt);
        });
      } catch (error) {
        failure = error;
        if (attempt < retryAttempts) await delay(retryBaseDelayMs * attempt + 50 * groupIndex);
      }
    }
    if (typeof onBatchFailure === 'function') return group.map((facility) => onBatchFailure(facility, failure));
    throw failure;
  });
  return results.flat();
}
