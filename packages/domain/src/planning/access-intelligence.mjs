import {factFreshness} from '../consequences/freshness.mjs';
import {minimalCutSets, describeCutSets} from '../consequences/dependency-sets.mjs';
import {routeRoadKeys} from '../consequences/canonical-inputs.mjs';

// ACCESS, READ FROM VIGIA XI RATHER THAN RECOMPUTED.
//
// Planning does not decide whether a road is usable, whether information is
// stale, or whether two routes are independent. XI already decided all three.
// This module asks XI and translates the answer into the vocabulary planning
// needs, so there is exactly one place in VIGIA where road truth is determined.
//
// The translation that matters most:
//   road eliminated by an assumption  -> ROUTE_ELIMINATED  (INFEASIBLE)
//   road information expired          -> ROUTE_STALE       (UNKNOWN)
// Those are different, and collapsing the second into the first would invent a
// closure out of an expiry.

export const ACCESS_STATES = Object.freeze(['ROUTE_AVAILABLE', 'ROUTE_STALE', 'ROUTE_ELIMINATED', 'NO_ROUTE_RETAINED']);

const roadKeysOf = (route) => (route.roadKeys ?? routeRoadKeys(route));

/**
 * Resolves how a resource can reach a requirement's destination, over retained
 * routes only. Never proposes a path VIGIA does not already hold.
 *
 * `eliminatedRoads` and `eliminatedRouteIds` come from a what-if assumption or
 * from an XI consequence that removed a route; they are scenario inputs and
 * never mutate anything.
 */
export function resolveAccess({requirement, routes = [], sourceValidUntil = null, sourceLastCheckedAt = null, at,
  eliminatedRoads = new Set(), eliminatedRouteIds = new Set(), staleRoads = new Set()}) {
  // Preference order is the requirement's declared routeIds, not the order the
  // catalog happens to return. "Primary" must be an explicit statement by the
  // caller, or "we fell back to the alternative" would depend on array order.
  const declared = requirement.routeIds ?? [];
  const byId = new Map(routes.map((route) => [route.id, route]));
  const candidates = declared.map((id) => byId.get(id)).filter(Boolean);
  if (!candidates.length) {
    return {state: 'NO_ROUTE_RETAINED', routeId: null, minutes: null, roads: [], reason: 'no retained route', sharedDependency: null};
  }

  // Road information freshness is XI's answer, not a second opinion.
  const roadInformation = factFreshness({factId: 'road-information', kind: 'ROAD_INFORMATION',
    lastCheckedAt: sourceLastCheckedAt, validUntil: sourceValidUntil}, at);

  const evaluated = candidates.map((route) => {
    const roads = roadKeysOf(route);
    const eliminated = eliminatedRouteIds.has(route.id) || roads.some((road) => eliminatedRoads.has(road));
    const stale = roadInformation.state === 'EXPIRED' || roads.some((road) => staleRoads.has(road));
    return {route, roads, eliminated, stale, minutes: Number.isFinite(route.minutes) ? route.minutes : null};
  });

  // Shared dependency across every candidate, so two "alternatives" that both
  // rest on one road are never presented as independent access.
  const cuts = minimalCutSets(candidates.map((route) => ({routeId: route.id, roadKeys: roadKeysOf(route), route})));
  const sharedDependency = describeCutSets(cuts, {serviceLabel: requirement.serviceId ? 'candidate' : 'candidate'});

  const usable = evaluated.filter((row) => !row.eliminated).sort((left, right) =>
    Number(left.stale) - Number(right.stale)
    || (left.minutes ?? Infinity) - (right.minutes ?? Infinity)
    || left.route.id.localeCompare(right.route.id));

  if (!usable.length) {
    return {state: 'ROUTE_ELIMINATED', routeId: evaluated[0].route.id, minutes: null, roads: evaluated[0].roads,
      reason: 'every retained route uses a road assumed unavailable', sharedDependency,
      eliminatedRouteIds: evaluated.map((row) => row.route.id).sort()};
  }

  const best = usable[0];
  const primaryId = declared[0] ?? null;
  const shared = {sharedDependency, cutSets: cuts,
    // Named for the planning layer: when every candidate rests on one road, two
    // resources routed over "different" options are not independent.
    commonModeRoads: cuts.cuts.filter((cut) => cut.commonMode).map((cut) => cut.roads[0])};

  if (best.stale) {
    return {state: 'ROUTE_STALE', routeId: best.route.id, minutes: best.minutes, roads: best.roads,
      age: roadInformation.age, lastCheckedAt: roadInformation.lastCheckedAt,
      reason: 'road information supporting this route needs checking', ...shared};
  }

  return {state: 'ROUTE_AVAILABLE', routeId: best.route.id, minutes: best.minutes, roads: best.roads,
    usedAlternative: primaryId !== null && best.route.id !== primaryId,
    eliminatedPrimary: primaryId !== null && best.route.id !== primaryId ? primaryId : null,
    reason: 'a retained route is held', ...shared};
}

/**
 * Roads that several candidate assignments all depend on. Surfaces the planning
 * risk that two apparently separate resources share one access dependency.
 */
export function sharedAccessAcross(candidates) {
  const byRoad = new Map();
  // Operator-facing text must use resource names; the raw id stays in provenance.
  const names = new Map(candidates.map((candidate) => [candidate.resourceId, candidate.resourceName ?? candidate.resourceId]));
  for (const candidate of candidates) {
    for (const road of candidate.access?.roads ?? []) {
      if (!byRoad.has(road)) byRoad.set(road, []);
      byRoad.get(road).push(candidate.resourceId);
    }
  }
  const shared = [...byRoad.entries()]
    .filter(([, resources]) => new Set(resources).size > 1)
    .map(([road, resources]) => {
      const ids = [...new Set(resources)].sort();
      return {road, resourceIds: ids, resourceNames: ids.map((id) => names.get(id) ?? id), resourceCount: ids.length};
    })
    .sort((left, right) => right.resourceCount - left.resourceCount || left.road.localeCompare(right.road));
  return {
    shared,
    // Every candidate resting on one road: losing it removes all of them.
    commonToAll: shared.filter((row) => row.resourceCount === new Set(candidates.map((c) => c.resourceId)).size).map((row) => row.road),
    text: shared.length
      ? shared.map((row) => `${row.resourceNames.join(' and ')} ${row.resourceCount === 2 ? 'both depend' : 'all depend'} on ${row.road}.`)
      : []
  };
}
