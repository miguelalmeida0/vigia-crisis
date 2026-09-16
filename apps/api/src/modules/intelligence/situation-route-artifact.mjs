import { hash } from '../../../../../packages/domain/src/intelligence/world-knowledge.mjs';

// A route's STABLE IDENTITY — the road geometry itself, which facility it
// reaches, which roads it uses, how far/long it is — never changes unless
// the underlying road network or the facility's location genuinely changes.
// Everything else evaluateRoute()/evaluateRouteAlternatives() attach to a
// route (state, restrictionIds, roadInformation, calculatedAt, validUntil,
// retryAfter) is VOLATILE OBSERVATION METADATA: it is recomputed against
// whatever restrictions/freshness apply at the moment of a given rebuild,
// independent of whether the road path itself is still the same. Only the
// stable fields are content-hashed and deduplicated into
// situation_route_artifact; the volatile fields stay inline in the snapshot
// row (they are small — a handful of strings/booleans per route, not a
// geometry).
const STABLE_KEYS = ['facilityId', 'direction', 'source', 'distanceKm', 'travelTimeMinutes', 'roads', 'geometry'];

function stableContentHash(route) {
  const stable = Object.fromEntries(STABLE_KEYS.map((key) => [key, route[key] ?? null]));
  return `route:sha256:${hash(stable)}`;
}

// Replaces a route's geometry/roads with a `routeArtifactHash` reference and
// records the stable content (if not already known) into `artifacts`
// (Map<hash, stableFields>) for the caller to persist. Recurses into
// normalRoute (the full pre-restriction route evaluateRouteAlternatives()
// retains inline when a restriction forces a detour) and each entry of
// alternatives — both carry their own full geometry today and both benefit
// from the same dedup. Returns a new object; never mutates its input.
export function compactRoute(route, artifacts) {
  if (!route || typeof route !== 'object') return route;
  if (!route.geometry) {
    // No geometry to deduplicate (e.g. a failed/UNAVAILABLE route) — still
    // recurse in case a nested normalRoute/alternative does have one.
    const copy = { ...route };
    if (route.normalRoute) copy.normalRoute = compactRoute(route.normalRoute, artifacts);
    if (Array.isArray(route.alternatives)) copy.alternatives = route.alternatives.map((a) => compactRoute(a, artifacts));
    return copy;
  }
  const contentHash = stableContentHash(route);
  if (!artifacts.has(contentHash)) {
    artifacts.set(contentHash, {
      facilityId: route.facilityId ?? null, direction: route.direction ?? null, source: route.source ?? null,
      distanceKm: route.distanceKm ?? null, travelTimeMinutes: route.travelTimeMinutes ?? null,
      roads: route.roads ?? [], geometry: route.geometry
    });
  }
  const copy = { ...route, routeArtifactHash: contentHash };
  delete copy.geometry; delete copy.roads;
  if (route.normalRoute) copy.normalRoute = compactRoute(route.normalRoute, artifacts);
  if (Array.isArray(route.alternatives)) copy.alternatives = route.alternatives.map((a) => compactRoute(a, artifacts));
  return copy;
}

export function compactRouteList(routes, artifacts) {
  return (routes ?? []).map((route) => compactRoute(route, artifacts));
}

// Inverse of compactRoute(): given a route (or list) that may carry a
// routeArtifactHash instead of inline geometry/roads, merges the stable
// fields back in from `artifactsByHash` (Map<hash, stableFields>, e.g. the
// result of a batched SELECT ... WHERE content_hash = ANY($1)). Consumers
// downstream of the store (SituationService, compareSituations,
// evaluateRouteAlternatives, ...) see the exact same shape they always did —
// this rehydration is the only reason none of them need to change.
export function hydrateRoute(route, artifactsByHash) {
  if (!route || typeof route !== 'object') return route;
  let copy = route;
  if (route.routeArtifactHash) {
    const artifact = artifactsByHash.get(route.routeArtifactHash);
    copy = { ...route };
    delete copy.routeArtifactHash;
    if (artifact) { copy.geometry = artifact.geometry; copy.roads = artifact.roads; }
  } else if (route.normalRoute || Array.isArray(route.alternatives)) {
    copy = { ...route };
  }
  if (copy.normalRoute) copy.normalRoute = hydrateRoute(copy.normalRoute, artifactsByHash);
  if (Array.isArray(copy.alternatives)) copy.alternatives = copy.alternatives.map((a) => hydrateRoute(a, artifactsByHash));
  return copy;
}

export function hydrateRouteList(routes, artifactsByHash) {
  return (routes ?? []).map((route) => hydrateRoute(route, artifactsByHash));
}

// Collects every routeArtifactHash referenced anywhere in a route (including
// nested normalRoute/alternatives), so a caller can batch one SELECT across
// every route in a payload (or a whole page of payloads) instead of one
// query per route.
export function collectRouteArtifactHashes(routes, into = new Set()) {
  for (const route of routes ?? []) {
    if (!route || typeof route !== 'object') continue;
    if (route.routeArtifactHash) into.add(route.routeArtifactHash);
    if (route.normalRoute) collectRouteArtifactHashes([route.normalRoute], into);
    if (Array.isArray(route.alternatives)) collectRouteArtifactHashes(route.alternatives, into);
  }
  return into;
}
