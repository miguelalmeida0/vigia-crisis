import { fetchJson } from '../../shared/fetch.mjs';
import { classifyGovernedConstraints, closureImpactForRoute } from './governed-route-constraints.mjs';
import { projectOsrmCoverageSurface } from './osrm-coverage-surface.mjs';
import { routeExhaustiveOsrmMatrix } from './osrm-route-matrix.mjs';

const DEFAULT_ENDPOINT = 'https://router.project-osrm.org';
const round = (value, digits = 1) => Number(Number(value).toFixed(digits));
async function mapLimit(items, limit, operation) {
  const output = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await operation(items[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}
function fallback(facility, checkedAt, error) {
  return {
    ...facility,
    reachability: {
      state: 'DISTANCE_ONLY_FALLBACK',
      method: 'GREAT_CIRCLE_PREFILTER_ONLY',
      routeDistanceKm: null,
      travelTimeMinutes: null,
      currentRoute: null,
      alternativeRoute: null,
      alternativeRouteState: 'NOT_COMPUTED',
      roadClosureImpact: { state: 'UNKNOWN', closures: [], reason: 'No governed current road-closure feed was supplied to the routing request.' },
      terrainAccessConstraints: { state: 'NOT_ROUTING_CONSTRAINED', constraints: [], reason: 'No governed vehicle or terrain access constraint was supplied to the routing provider.' },
      source: null,
      checkedAt,
      confidence: { state: 'UNAVAILABLE', score: null },
      reason: `Road-network routing unavailable: ${String(error?.message ?? error ?? 'unknown_error')}. Straight-line distance is retained for discovery only and is not an arrival-time estimate.`
    }
  };
}
function routingConstraintBlock(facility, checkedAt, context, { allowGeometricClosures = false } = {}) {
  const classified = classifyGovernedConstraints(context);
  const closures = allowGeometricClosures ? classified.unresolvedClosures : classified.closures;
  const vehicleConstraints = classified.vehicleConstraints;
  if (!closures.length && !vehicleConstraints.length) return null;
  return {
    ...facility,
    reachability: {
      state: 'WITHHELD_UNSUPPORTED_GOVERNED_CONSTRAINT',
      method: 'OSRM_ROAD_NETWORK_NOT_CLOSURE_AWARE',
      routeDistanceKm: null,
      travelTimeMinutes: null,
      currentRoute: null,
      alternativeRoute: null,
      alternativeRouteState: 'NOT_COMPUTED',
      roadClosureImpact: {
        state: closures.length ? 'GOVERNED_CLOSURE_REQUIRES_CAPABLE_ROUTER' : 'NO_GOVERNED_CLOSURE_SUPPLIED',
        closures: closures.map((item) => ({ id: item.id ?? item.closureId ?? null, state: item.state ?? null, source: item.source ?? null, observedAt: item.observedAt ?? item.updatedAt ?? null })),
        reason: closures.length ? 'The configured public OSRM endpoint cannot apply a governed closure that lacks usable geometry, so VIGIA withholds travel time instead of routing through a potentially closed road.' : 'No unresolved active governed closure is supplied.'
      },
      terrainAccessConstraints: {
        state: vehicleConstraints.length ? 'GOVERNED_CONSTRAINT_REQUIRES_CAPABLE_ROUTER' : 'NOT_ROUTING_CONSTRAINED',
        constraints: vehicleConstraints,
        reason: vehicleConstraints.length ? 'The configured public OSRM profile cannot enforce the supplied emergency-vehicle, bridge, terrain, or incident-access constraints.' : 'No governed vehicle constraint is supplied.'
      },
      source: { provider: 'OSRM public routing service', roadData: 'OpenStreetMap', endpoint: null },
      checkedAt,
      confidence: { state: 'WITHHELD', score: null },
      reason: 'A governed routing constraint is active, but the configured router cannot apply it. A closure-capable routing adapter or an attributable field route report is required.'
    }
  };
}
function routeDescriptor(route) {
  if (!route) return null;
  return {
    distanceKm: round(Number(route.distance) / 1000, 2),
    travelTimeMinutes: round(Number(route.duration) / 60, 1),
    geometry: route.geometry?.type === 'LineString' ? route.geometry : null,
    geometryState: route.geometry?.type === 'LineString' ? 'AVAILABLE' : 'NOT_RETURNED',
    roads: [...new Map((route.legs??[]).flatMap(leg=>leg.steps??[]).filter(step=>step.name||step.ref).map(step=>[step.ref??step.name,{name:step.name??null,ref:step.ref??null}])).values()].slice(0,100)
  };
}

export class OsrmRoutingAdapter {
  constructor({ fetchImpl = globalThis.fetch, endpoint = DEFAULT_ENDPOINT, timeoutMs = 6_000, clock = () => new Date(), concurrency = 3 } = {}) {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('invalid_routing_endpoint');
    this.fetchImpl = fetchImpl;
    this.endpoint = parsed.origin;
    this.timeoutMs = timeoutMs;
    this.clock = clock;
    this.concurrency = concurrency;
  }

  async route(origin, facility, context = {}) {
    const checkedAt = this.clock().toISOString();
    const constraints = classifyGovernedConstraints(context);
    const blocked = routingConstraintBlock(facility, checkedAt, context, { allowGeometricClosures: true });
    if (blocked) { blocked.reachability.source.endpoint = this.endpoint; return blocked; }
    const coordinates = `${facility.coordinate[0]},${facility.coordinate[1]};${origin[0]},${origin[1]}`;
    const url = `${this.endpoint}/route/v1/driving/${coordinates}?alternatives=3&steps=true&overview=full&geometries=geojson`;
    try {
      const payload = await fetchJson(url, { fetchImpl: this.fetchImpl, timeoutMs: this.timeoutMs, maxBytes: 1_500_000 });
      if (payload?.code === 'NoRoute' || !payload?.routes?.length) return {
        ...facility,
        reachability: {
          state: 'UNREACHABLE', method: 'OSRM_ROAD_NETWORK', routeDistanceKm: null, travelTimeMinutes: null,
          currentRoute: null, alternativeRoute: null, alternativeRouteState: 'NO_ROUTE',
          roadClosureImpact: { state: 'UNKNOWN', closures: [], reason: 'No governed current road-closure feed was supplied to the routing request.' },
          terrainAccessConstraints: { state: 'NOT_ROUTING_CONSTRAINED', constraints: [], reason: 'No governed vehicle or terrain access constraint was supplied to the routing provider.' },
          source: { provider: 'OSRM public routing service', roadData: 'OpenStreetMap', endpoint: this.endpoint }, checkedAt,
          confidence: { state: 'ROUTING_PROVIDER_RESULT', score: null }, reason: 'The routing provider returned no drivable route.'
        }
      };
      const evaluatedRoutes = payload.routes.map((route) => ({ route, impact: closureImpactForRoute(route, constraints.geometricClosures) }));
      if (constraints.geometricClosures.length && evaluatedRoutes.some((item) => !item.impact.evaluable)) return {
        ...facility,
        reachability: {
          state: 'WITHHELD_CLOSURE_GEOMETRY_NOT_EVALUABLE', method: 'OSRM_WITH_GOVERNED_CLOSURE_FILTER', routeDistanceKm: null, travelTimeMinutes: null,
          currentRoute: null, alternativeRoute: null, alternativeRouteState: 'NOT_COMPUTED',
          roadClosureImpact: { state: 'WITHHELD', closures: constraints.closures, reason: 'The routing response omitted usable line geometry, so governed closure intersection could not be evaluated.' },
          terrainAccessConstraints: { state: 'NOT_ROUTING_CONSTRAINED', constraints: [], reason: 'No governed vehicle constraint is supplied.' },
          source: { provider: 'OSRM public routing service', roadData: 'OpenStreetMap', endpoint: this.endpoint }, checkedAt,
          confidence: { state: 'WITHHELD', score: null }, reason: 'No route is shown because the returned path could not be tested against the governed closure geometry.'
        }
      };
      const permitted = evaluatedRoutes.filter((item) => item.impact.impactedClosureIds.length === 0);
      const rejected = evaluatedRoutes.filter((item) => item.impact.impactedClosureIds.length > 0);
      if (!permitted.length) return {
        ...facility,
        reachability: {
          state: 'WITHHELD_NO_CLOSURE_CLEAR_ROUTE', method: 'OSRM_WITH_GOVERNED_CLOSURE_FILTER', routeDistanceKm: null, travelTimeMinutes: null,
          currentRoute: null, alternativeRoute: null, alternativeRouteState: 'NO_CLOSURE_CLEAR_ALTERNATIVE_RETURNED',
          roadClosureImpact: { state: 'APPLIED_TO_RETURNED_ROUTES', closures: constraints.closures, rejectedRouteCount: rejected.length, reason: 'Every returned OSRM alternative intersected governed active closure geometry.' },
          terrainAccessConstraints: { state: 'NOT_ROUTING_CONSTRAINED', constraints: [], reason: 'No governed vehicle constraint is supplied.' },
          source: { provider: 'OSRM public routing service', roadData: 'OpenStreetMap', endpoint: this.endpoint }, checkedAt,
          confidence: { state: 'WITHHELD', score: null }, reason: 'The public router returned no closure-clear alternative. This does not prove the facility is globally unreachable.'
        }
      };
      const currentRoute = routeDescriptor(permitted[0].route);
      const alternativeRoute = routeDescriptor(permitted[1]?.route);
      return {
        ...facility,
        reachability: {
          state: 'ROUTED',
          method: 'OSRM_ROAD_NETWORK',
          routeDistanceKm: currentRoute.distanceKm,
          travelTimeMinutes: currentRoute.travelTimeMinutes,
          currentRoute,
          alternativeRoute,
          alternativeRouteState: alternativeRoute ? 'AVAILABLE' : 'NOT_RETURNED',
          roadClosureImpact: constraints.geometricClosures.length ? {
            state: 'APPLIED_TO_RETURNED_ROUTES', closures: constraints.closures,
            rejectedRouteCount: rejected.length,
            reason: 'Returned route alternatives intersecting governed active closure geometry were excluded. This is path filtering, not network-wide dynamic rerouting.'
          } : { state: 'UNKNOWN', closures: [], reason: 'The public route result is not joined to a governed current road-closure feed.' },
          terrainAccessConstraints: { state: 'NOT_ROUTING_CONSTRAINED', constraints: [], reason: 'The route has not been qualified for emergency-vehicle restrictions, bridge limits, traffic, terrain hazards, or incident access controls.' },
          source: { provider: 'OSRM public routing service', roadData: 'OpenStreetMap', endpoint: this.endpoint },
          checkedAt,
          confidence: { state: 'CONTEXTUAL_ESTIMATE', score: null },
          reason: constraints.geometricClosures.length
            ? 'Travel time is the fastest returned OSRM alternative not intersecting supplied governed closure geometry. It is not a dispatch ETA or proof of all-route passability.'
            : 'Travel time is a public road-network estimate, not a dispatch ETA or proof of passability.'
        }
      };
    } catch (error) {
      return fallback(facility, checkedAt, error);
    }
  }

  async routeMany(origin, facilities, context = {}) {
    const constraints = classifyGovernedConstraints(context);
    if (constraints.closures.length || constraints.vehicleConstraints.length) {
      return facilities.map((facility) => {
        const blocked = routingConstraintBlock(facility, this.clock().toISOString(), context);
        blocked.reachability.source.endpoint = this.endpoint;
        return blocked;
      });
    }
    if (facilities.length < 2) return mapLimit(facilities, this.concurrency, (facility) => this.route(origin, facility, context));
    const checkedAt = this.clock().toISOString();
    try {
      return await routeExhaustiveOsrmMatrix(origin, facilities, {
        endpoint: this.endpoint, fetchImpl: this.fetchImpl, timeoutMs: this.timeoutMs,
        checkedAt, concurrency: this.concurrency, onBatchFailure: (facility, error) => fallback(facility, checkedAt, error)
      });
    } catch (error) {
      return facilities.map((facility) => fallback(facility, checkedAt, error));
    }
  }

  async routeDetails(origin, facilities, context = {}) {
    return mapLimit(facilities, this.concurrency, async (facility) => {
      const detailed = await this.route(origin, facility, context);
      if (['ROUTED', 'UNREACHABLE'].includes(detailed.reachability?.state)) return detailed;
      return {
        ...facility,
        reachability: {
          ...facility.reachability,
          routeDetail: {
            state: 'UNAVAILABLE', checkedAt: detailed.reachability?.checkedAt ?? this.clock().toISOString(),
            reason: detailed.reachability?.reason ?? 'Full route geometry was not returned.'
          }
        }
      };
    });
  }

  async coverageSurface(facilities, sampleCoordinates, context = {}) {
    return projectOsrmCoverageSurface({
      facilities,
      sampleCoordinates,
      context,
      endpoint: this.endpoint,
      fetchImpl: this.fetchImpl,
      timeoutMs: this.timeoutMs,
      checkedAt: this.clock().toISOString()
    });
  }
}
