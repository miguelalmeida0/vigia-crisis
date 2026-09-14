import {pointRouteDistanceM} from '../intelligence/road-observations.mjs';
import {routeRoadKeys} from './canonical-inputs.mjs';

// FALSE REDUNDANCY.
//
// Two stored routes are not two ways out. If both of them run over the same
// road, one restriction removes both, and presenting them as redundancy tells
// the operator something untrue at the moment it matters most.
//
// This module states only what the retained data proves, and it is explicit
// about which of two different claims it is making:
//
//   NAMED_ROAD        both routes list the same road reference. That is a claim
//                     about names, not about tarmac. Two distinct stretches of
//                     the N114 carry the same name.
//   GEOMETRY_CONFIRMED the routes additionally run within CORRIDOR_M of each
//                     other along that road, so the retained geometry supports a
//                     shared physical corridor.
//
// A named-road finding is never reported as a geometric one.

export const CORRIDOR_M = 60;
const SAMPLE_LIMIT = 64;
export const DEPENDENCY_BASES = Object.freeze(['NAMED_ROAD', 'GEOMETRY_CONFIRMED']);

/** Evenly spaced vertices of a LineString, bounded so long routes stay cheap. */
function sampleVertices(geometry) {
  const coordinates = geometry?.type === 'LineString' && Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
  if (coordinates.length <= SAMPLE_LIMIT) return coordinates;
  const step = (coordinates.length - 1) / (SAMPLE_LIMIT - 1);
  return Array.from({length: SAMPLE_LIMIT}, (unused, index) => coordinates[Math.round(index * step)]);
}

/**
 * True when the retained geometries of both routes run together for at least two
 * sampled points. One coincident point is a crossing, not a shared corridor.
 * Returns false whenever either geometry is missing: absent geometry is never
 * read as agreement.
 */
export function geometriesShareCorridor(left, right, {corridorM = CORRIDOR_M} = {}) {
  if (left?.type !== 'LineString' || right?.type !== 'LineString') return false;
  let together = 0;
  for (const point of sampleVertices(left)) {
    if (pointRouteDistanceM(point, right) <= corridorM) together += 1;
    if (together >= 2) return true;
  }
  return false;
}

/**
 * Roads that every one of the given routes depends on, and roads that only some
 * of them share. `routeRows` are canonical-input rows (see canonical-inputs).
 *
 * `allRoutesAffected` is the operationally decisive field: when true, the stored
 * routes offer no independent fallback with respect to that road.
 */
export function sharedRoadDependencies(routeRows, {corridorM = CORRIDOR_M} = {}) {
  const rows = (routeRows ?? []).filter((row) => row?.routeId);
  if (rows.length < 2) return {routeCount: rows.length, independent: null, dependencies: [], reason: rows.length ? 'ONLY_ONE_ROUTE_STORED' : 'NO_ROUTE_STORED'};

  const counts = new Map();
  for (const row of rows) {
    for (const key of row.roadKeys ?? routeRoadKeys(row.route)) {
      if (!counts.has(key)) counts.set(key, []);
      counts.get(key).push(row);
    }
  }

  const dependencies = [...counts.entries()]
    .filter(([, sharing]) => sharing.length > 1)
    .map(([road, sharing]) => {
      const geometryConfirmed = sharing.some((left, index) => sharing.slice(index + 1)
        .some((right) => geometriesShareCorridor(left.route?.geometry, right.route?.geometry, {corridorM})));
      return {
        road,
        basis: geometryConfirmed ? 'GEOMETRY_CONFIRMED' : 'NAMED_ROAD',
        routeIds: sharing.map((row) => row.routeId).sort(),
        routeCount: sharing.length,
        allRoutesAffected: sharing.length === rows.length,
        // The exact wording each basis is entitled to use.
        claim: geometryConfirmed
          ? `The retained geometry of ${sharing.length === rows.length ? 'both stored routes runs' : 'these stored routes run'} along ${road}.`
          : `${sharing.length === rows.length ? 'Both stored routes use' : 'These stored routes use'} the same named road ${road}. Whether they use the same stretch of it is not established by the retained geometry.`
      };
    })
    .sort((left, right) => Number(right.allRoutesAffected) - Number(left.allRoutesAffected) || right.routeCount - left.routeCount || left.road.localeCompare(right.road));

  const blocking = dependencies.filter((row) => row.allRoutesAffected);
  return {
    routeCount: rows.length,
    // `independent` answers: do these routes provide redundancy? false when a
    // road is common to all of them. Never asserted true on absent evidence.
    independent: blocking.length === 0,
    dependencies,
    blockingRoads: blocking.map((row) => row.road),
    reason: blocking.length ? 'SHARED_ROAD_ON_EVERY_STORED_ROUTE' : 'NO_ROAD_COMMON_TO_EVERY_STORED_ROUTE'
  };
}

/**
 * Plain-language statement of a redundancy finding, for the operator surface.
 * Returns null when there is nothing proven to say.
 */
export function describeSharedDependency(analysis) {
  if (!analysis || analysis.routeCount < 2 || analysis.independent !== false) return null;
  const roads = analysis.blockingRoads;
  const geometryConfirmed = analysis.dependencies.filter((row) => row.allRoutesAffected).every((row) => row.basis === 'GEOMETRY_CONFIRMED');
  const list = roads.length === 1 ? roads[0] : `${roads.slice(0, -1).join(', ')} and ${roads[roads.length - 1]}`;
  const subject = analysis.routeCount === 2 ? 'both' : 'all of them';
  return {
    text: roads.length === 1
      ? `${analysis.routeCount} stored routes are available, but ${subject} still depend on ${list}.`
      : `${analysis.routeCount} stored routes are available, but ${subject} use ${list}.`,
    basis: geometryConfirmed ? 'GEOMETRY_CONFIRMED' : 'NAMED_ROAD',
    qualifier: geometryConfirmed ? null : 'Shared by road name. The retained geometry does not establish that they use the same stretch.'
  };
}
