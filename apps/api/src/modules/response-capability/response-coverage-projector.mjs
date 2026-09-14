import { RESPONSE_FACILITY_KINDS } from '../../../../../packages/domain/src/response-capability/index.mjs';

function sampleGrid(coordinate) {
  const [longitude, latitude] = coordinate.map(Number);
  const offsetsKm = [-20, -10, 0, 10, 20];
  const latitudeDegreesPerKm = 1 / 110.574;
  const longitudeDegreesPerKm = 1 / (111.320 * Math.max(0.2, Math.cos(latitude * Math.PI / 180)));
  return offsetsKm.flatMap((northKm) => offsetsKm.map((eastKm) => [
    Number((longitude + eastKm * longitudeDegreesPerKm).toFixed(6)),
    Number((latitude + northKm * latitudeDegreesPerKm).toFixed(6))
  ]));
}

export async function projectResponseCoverage({ incident, byKind, routingAdapter, cache, cacheMs, clock, roadContext, vehicleConstraints }) {
  const facilities = RESPONSE_FACILITY_KINDS.flatMap((kind) => (byKind[kind] ?? []).slice(0, 3));
  const checkedAt = clock().toISOString();
  if (!routingAdapter?.coverageSurface) return {
    schemaVersion: 'vigia.road-network-coverage-samples.v1',
    state: 'WITHHELD_ROUTER_CAPABILITY_UNAVAILABLE', checkedAt, source: null, samples: [],
    reason: 'The configured routing adapter does not expose governed road-network coverage sampling.',
    truthBoundary: 'Facility routes remain visible, but no regional response-coverage surface is claimed.'
  };
  const roadIdentity = roadContext?.revision ?? roadContext?.version ?? roadContext?.updatedAt ?? JSON.stringify(roadContext ?? null);
  const constraintIdentity = vehicleConstraints?.revision ?? vehicleConstraints?.version ?? JSON.stringify(vehicleConstraints ?? null);
  const key = `${incident.id}|${incident.coordinate.join(',')}|${facilities.map((facility) => facility.id).join(',')}|road:${roadIdentity}|constraints:${constraintIdentity}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > clock().getTime()) return structuredClone(cached.value);
  const value = await routingAdapter.coverageSurface(facilities, sampleGrid(incident.coordinate), { incidentId: incident.id, roadContext, vehicleConstraints });
  cache.set(key, { value: structuredClone(value), expiresAt: clock().getTime() + cacheMs });
  while (cache.size > 32) cache.delete(cache.keys().next().value);
  return value;
}
