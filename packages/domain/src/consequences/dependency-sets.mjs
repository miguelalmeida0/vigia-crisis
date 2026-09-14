import {geometriesShareCorridor} from './shared-dependency.mjs';

// COMMON-MODE DEPENDENCIES AND MINIMAL CUT SETS.
//
// Pairwise false redundancy answers "do these two routes share a road?".
// This answers the harder question: what is the smallest set of roads whose
// loss removes EVERY stored option?
//
// A cut of size 1 is a road every option depends on. A cut of size 2 means no
// single road removes all support, but a specific pair would. That distinction
// matters: telling an operator that two roads are each a single point of failure
// when neither is would be a lie in the direction of panic.
//
// This is deterministic set analysis over retained road names. It is NOT
// probabilistic reliability engineering, there is no failure rate anywhere in
// it, and nothing here is called a physical single point of failure — the
// retained data supports statements about stored routes, not about tarmac.

export const MAX_CUT_SIZE = 3;
const MAX_ROADS_CONSIDERED = 64;

const hits = (cut, roadSet) => cut.some((road) => roadSet.has(road));

function combinations(values, size, start = 0, current = [], out = []) {
  if (current.length === size) { out.push([...current]); return out; }
  for (let index = start; index < values.length; index += 1) {
    current.push(values[index]);
    combinations(values, size, index + 1, current, out);
    current.pop();
  }
  return out;
}

/**
 * Minimal sets of roads whose loss removes every stored option.
 *
 * Routes with no recorded road names cannot be cut by road analysis. They are
 * reported as `routesWithoutRoadNames` and make the analysis incomplete rather
 * than silently making a cut look smaller than it is.
 */
export function minimalCutSets(routeRows, {maxCutSize = MAX_CUT_SIZE} = {}) {
  const rows = (routeRows ?? []).filter((row) => row?.routeId);
  const withRoads = rows.filter((row) => (row.roadKeys ?? []).length);
  const withoutRoads = rows.filter((row) => !(row.roadKeys ?? []).length);

  if (!rows.length) return {routeCount: 0, cuts: [], smallestCutSize: null, analysisComplete: true, routesWithoutRoadNames: [], reason: 'NO_ROUTE_STORED'};
  if (!withRoads.length) {
    return {routeCount: rows.length, cuts: [], smallestCutSize: null, analysisComplete: false,
      routesWithoutRoadNames: withoutRoads.map((row) => row.routeId).sort(), reason: 'NO_ROAD_NAMES_RECORDED'};
  }

  const roadSets = withRoads.map((row) => new Set(row.roadKeys));
  const universe = [...new Set(withRoads.flatMap((row) => row.roadKeys))].sort();
  // Bounded on purpose: an unbounded hitting-set search is not something an
  // incident system should run. Truncation is reported, never hidden.
  const considered = universe.slice(0, MAX_ROADS_CONSIDERED);
  const truncated = considered.length < universe.length;

  const cuts = [];
  const limit = Math.min(maxCutSize, considered.length);
  for (let size = 1; size <= limit; size += 1) {
    for (const cut of combinations(considered, size)) {
      // Minimality: skip anything that contains an already-found smaller cut.
      if (cuts.some((found) => found.roads.every((road) => cut.includes(road)))) continue;
      if (!roadSets.every((roadSet) => hits(cut, roadSet))) continue;
      cuts.push({roads: cut, size});
    }
    // A size-1 cut exists, so every larger cut is a superset of one. Stop.
    if (size === 1 && cuts.length) break;
  }

  const enriched = cuts.map((cut) => {
    const covering = cut.roads.map((road) => withRoads.filter((row) => row.roadKeys.includes(road)));
    const geometryConfirmed = covering.every((group) => group.length < 2 || group.some((left, index) => group.slice(index + 1)
      .some((right) => geometriesShareCorridor(left.route?.geometry, right.route?.geometry))));
    return {
      ...cut,
      basis: geometryConfirmed ? 'GEOMETRY_CONFIRMED' : 'NAMED_ROAD',
      routeIds: withRoads.map((row) => row.routeId).sort(),
      commonMode: cut.size === 1
    };
  }).sort((left, right) => left.size - right.size || left.roads.join().localeCompare(right.roads.join()));

  return {
    routeCount: rows.length,
    analysedRouteCount: withRoads.length,
    cuts: enriched,
    smallestCutSize: enriched[0]?.size ?? null,
    // Complete only when every route had road names and nothing was truncated.
    analysisComplete: !withoutRoads.length && !truncated,
    routesWithoutRoadNames: withoutRoads.map((row) => row.routeId).sort(),
    truncated,
    reason: enriched.length
      ? enriched[0].size === 1 ? 'COMMON_ROAD_ON_EVERY_STORED_ROUTE' : 'NO_SINGLE_ROAD_REMOVES_EVERY_ROUTE'
      : `NO_CUT_FOUND_WITHIN_SIZE_${limit}`
  };
}

/**
 * Plain statement of a cut-set finding. Returns null when there is nothing
 * proven to say.
 */
export function describeCutSets(analysis, {serviceLabel = 'stored'} = {}) {
  if (!analysis?.cuts?.length) {
    if (analysis?.reason === 'NO_ROAD_NAMES_RECORDED') {
      return {text: `Road names are not recorded for the stored ${serviceLabel} routes, so their shared dependencies are not established.`, basis: null, complete: false};
    }
    return null;
  }
  const smallest = analysis.cuts.filter((cut) => cut.size === analysis.smallestCutSize);
  const single = analysis.smallestCutSize === 1;
  const list = (roads) => (roads.length === 1 ? roads[0] : `${roads.slice(0, -1).join(', ')} and ${roads[roads.length - 1]}`);

  const text = single
    ? analysis.analysedRouteCount === 1
      ? `The only stored ${serviceLabel} route uses ${list(smallest.map((cut) => cut.roads[0]))}.`
      : `Every stored ${serviceLabel} option currently depends on ${list(smallest.map((cut) => cut.roads[0]))}.`
    : `No single road removes every stored ${serviceLabel} route. ${list(smallest[0].roads)} together would.`;

  const basis = smallest.every((cut) => cut.basis === 'GEOMETRY_CONFIRMED') ? 'GEOMETRY_CONFIRMED' : 'NAMED_ROAD';
  return {
    text,
    basis,
    complete: analysis.analysisComplete,
    qualifier: basis === 'NAMED_ROAD'
      ? 'Shared by road name. The retained geometry does not establish that they use the same stretch.'
      : null,
    incompleteNote: analysis.analysisComplete ? null
      : analysis.routesWithoutRoadNames.length
        ? `${analysis.routesWithoutRoadNames.length} stored route(s) have no recorded road names and are not covered by this analysis.`
        : 'Not every road could be considered, so a smaller shared dependency may exist.'
  };
}
