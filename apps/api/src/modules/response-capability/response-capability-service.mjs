import { assertCan, assertIncidentScope } from '../../../../../packages/domain/src/authorization.mjs';
import { buildResponseCapabilityProjection, RESPONSE_FACILITY_KINDS } from '../../../../../packages/domain/src/response-capability/index.mjs';
import { projectResponseCoverage } from './response-coverage-projector.mjs';
import { annotateCandidateRanks, OPERATOR_RESPONSE_COHORT_LIMITS, routingCoverage, selectOperatorCandidateCohort } from './routing-cohort.mjs';
import { ResponseRecommendationReviewManager } from './response-recommendation-review-manager.mjs';
import { projectRoutedFacilities, responseDecisionContext } from './facility-projection.mjs';
import { discoverResponseCandidates } from './response-candidate-discovery.mjs';
export class ResponseCapabilityService {
  #routeCache = new Map();
  #coverageCache = new Map();
  constructor({ detectionService, facilityRepository, routingAdapter, capacityReportProvider = null,
    capacityTaskDispatcher = null, recommendationRepository = null, clock = () => new Date(), routeCacheMs = 5 * 60_000,
    routeCacheMaxEntries = 1_024, sourceAvailability = {} }) {
    Object.assign(this, { detectionService, facilityRepository, routingAdapter, capacityReportProvider, capacityTaskDispatcher, clock, routeCacheMs, routeCacheMaxEntries, sourceAvailability });
    this.recommendationReviews = new ResponseRecommendationReviewManager({ repository: recommendationRepository, clock });
  }
  async reviewRecommendation(actor, incidentId, recommendationId, input) {
    assertCan(actor, 'command:incident');
    assertIncidentScope(actor, incidentId);
    return this.recommendationReviews.review({ actor, incidentId, recommendationId, input });
  }
  async project(actor, incidentId, options = {}) {
    assertCan(actor, 'read:incident_command');
    assertIncidentScope(actor, incidentId);
    const incident = await this.detectionService.find(incidentId, { actor });
    if (!incident) return null;
    return this.projectIncident(incident, options);
  }
  /** Canonical-operator projection hook for an already scoped incident twin. */
  async projectIncident(incident, options = {}) {
    const coordinate = incident?.coordinate
      ?? incident?.incident?.location?.coordinate
      ?? incident?.incident?.location?.geometry?.coordinates
      ?? incident?.location?.coordinate
      ?? incident?.location?.geometry?.coordinates;
    const normalized = { ...incident, id: incident?.id ?? incident?.incidentId ?? incident?.incident?.id, coordinate };
    if (!normalized.id || !Array.isArray(normalized.coordinate)) throw new Error('geolocated_incident_required');
    const generatedAt = this.clock().toISOString();
    const reports = await this.#capacityReports(normalized.id);
    const discovered = discoverResponseCandidates({
      repository: this.facilityRepository, incident: normalized,
      reports: reports.items, clock: this.clock, options
    });
    const byKind = Object.fromEntries(RESPONSE_FACILITY_KINDS.map((kind) => [kind, []]));
    for (const kind of RESPONSE_FACILITY_KINDS) {
      const candidates = discovered.byKind[kind] ?? [];
      const routed = ['HOSPITAL', 'FIRE_STATION', 'EMS_BASE', 'CIVIL_PROTECTION', 'POLICE', 'PUBLIC_INSTITUTION', 'SHELTER', 'WATER_POINT', 'AIR_SUPPORT_BASE'].includes(kind)
        ? await this.#routes(normalized.coordinate, candidates, { incidentId: normalized.id, roadContext: options.roadContext ?? null, vehicleConstraints: options.vehicleConstraints ?? null })
        : candidates;
      byKind[kind] = projectRoutedFacilities({ kind, routed, reports: reports.items, clock: this.clock });
    }
    const decisionContext = responseDecisionContext(normalized, options);
    const exhaustiveRankedByKind = annotateCandidateRanks(byKind, discovered.sourceCoverage, decisionContext);
    for (const kind of RESPONSE_FACILITY_KINDS) {
      discovered.retrieval.byKind[kind].routingEligibleCount = byKind[kind].length;
      discovered.retrieval.byKind[kind].rankedCount = exhaustiveRankedByKind[kind].length;
    }
    const operatorCohort = selectOperatorCandidateCohort(exhaustiveRankedByKind, options.operatorCohortLimitPerKind ?? OPERATOR_RESPONSE_COHORT_LIMITS);
    const rankedByKind = Object.fromEntries(await Promise.all(RESPONSE_FACILITY_KINDS.map(async (kind) => [
      kind,
      await this.#routeDetails(normalized.coordinate, operatorCohort[kind], {
        incidentId: normalized.id,
        roadContext: options.roadContext ?? null,
        vehicleConstraints: options.vehicleConstraints ?? null
      })
    ])));
    const coverageSurface = await projectResponseCoverage({
      incident: normalized, byKind: rankedByKind, routingAdapter: this.routingAdapter, cache: this.#coverageCache,
      cacheMs: this.routeCacheMs, clock: this.clock,
      roadContext: options.roadContext ?? null, vehicleConstraints: options.vehicleConstraints ?? null
    });
    const fieldNetAvailability = await this.#fieldNetAvailability(normalized.id);
    const projectionInput = {
      incident: normalized,
      facilitiesByKind: rankedByKind,
      generatedAt,
      decisionContext,
      sourceAvailability: {
        ...this.sourceAvailability,
        ...reports.sourceAvailability,
        ...(options.sourceAvailability ?? {}),
        fieldNetHospitalCapacity: fieldNetAvailability,
        fieldNetFireCapacity: fieldNetAvailability
      },
      sourceCoverage: {
        ...discovered.sourceCoverage,
        DYNAMIC_CAPACITY: reports.coverage,
        ROAD_ROUTING: {
          ...routingCoverage(exhaustiveRankedByKind, this.routingAdapter, generatedAt),
          returnedOperatorCandidateCount: Object.values(rankedByKind).flat().length,
          operatorCohortPolicy: 'DECISION_RANK_AFTER_EXHAUSTIVE_HOSPITAL_FIRE_ROAD_MATRIX'
        },
        CANDIDATE_RETRIEVAL: discovered.retrieval
      },
      roadContext: options.roadContext ?? null,
      coverageSurface
    };
    const planned = buildResponseCapabilityProjection(projectionInput);
    const collectionTaskExecutions = await this.#dispatchCapacityTasks(planned, rankedByKind);
    const finalProjection = Object.keys(collectionTaskExecutions).length
      ? buildResponseCapabilityProjection({ ...projectionInput, collectionTaskExecutions })
      : planned;
    this.situationService?.observeResponse(finalProjection);
    return this.recommendationReviews.decorateAndRemember(finalProjection);
  }
  async #fieldNetAvailability(incidentId) {
    const checkedAt = this.clock().toISOString();
    if (!this.capacityTaskDispatcher?.availabilityFor) return {
      state: 'NOT_CONNECTED',
      checkedAt,
      reason: 'No exact-scope trusted FieldNet capacity-task destination is configured for this incident.'
    };
    try {
      return await this.capacityTaskDispatcher.availabilityFor(incidentId);
    } catch (error) {
      return {
        state: 'DEGRADED',
        checkedAt,
        reason: String(error?.message ?? 'fieldnet_capacity_task_destination_unavailable').slice(0, 160)
      };
    }
  }
  async #dispatchCapacityTasks(projection, facilitiesByKind) {
    if (!this.capacityTaskDispatcher?.ensureCapacityTask) return {};
    const facilities = new Map(['HOSPITAL', 'FIRE_STATION'].flatMap((kind) => (facilitiesByKind[kind] ?? []).map((facility) => [String(facility.id), facility])));
    const executions = {};
    await Promise.all((projection.informationRequirements ?? []).map(async (requirement) => {
      const facility = facilities.get(String(requirement.subjectId));
      if (!facility || !['HOSPITAL', 'FIRE_STATION'].includes(facility.kind)) return;
      const strategyId = facility.kind === 'HOSPITAL' ? 'fieldnet-hospital-capacity' : 'fieldnet-fire-capacity';
      const task = requirement.collectionTasks?.find((item) => item.strategyId === strategyId);
      if (!task || task.state !== 'SCHEDULED') return;
      const key = `${requirement.id}:${strategyId}`;
      try {
        executions[key] = await this.capacityTaskDispatcher.ensureCapacityTask({ requirement, facility });
      } catch (error) {
        const lastAttempt = this.clock().toISOString();
        executions[key] = {
          state: 'RETRY_WAIT',
          attemptCount: Math.max(1, Number(task.attemptCount ?? 0) + 1),
          lastAttempt,
          nextAttempt: requirement.currentAssessment?.nextCheckAt ?? null,
          result: { state: 'FIELDNET_TASK_ATTEMPT_FAILED', reason: String(error?.message ?? 'fieldnet_capacity_task_attempt_failed').slice(0, 160) },
          receipt: null,
          delivery: { state: 'NOT_RECORDED', reason: 'FieldNet did not return a durable task record.' },
          acknowledgement: { state: 'NOT_RECORDED', reason: 'FieldNet did not record an acknowledgement.' },
          centralReconciliation: { state: 'NOT_RECORDED', reason: 'No durable local FieldNet task was available for central reconciliation.' }
        };
      }
    }));
    return executions;
  }
  async #capacityReports(incidentId) {
    if (!this.capacityReportProvider?.listForIncident) return {
      items: [],
      sourceAvailability: {},
      coverage: { state: 'NOT_CONNECTED', recordCount: 0, checkedAt: this.clock().toISOString(), reason: 'No trusted dynamic facility-capacity provider is connected.' }
    };
    try {
      const value = await this.capacityReportProvider.listForIncident(incidentId);
      const items = Array.isArray(value?.items) ? value.items : Array.isArray(value) ? value : [];
      return {
        items,
        sourceAvailability: value?.sourceAvailability ?? {},
        coverage: { state: 'CONNECTED', recordCount: items.length, checkedAt: this.clock().toISOString(), source: value?.source ?? null, reason: null }
      };
    } catch (error) {
      return {
        items: [], sourceAvailability: {},
        coverage: { state: 'DEGRADED', recordCount: 0, checkedAt: this.clock().toISOString(), reason: String(error?.message ?? error) }
      };
    }
  }
  async #routes(origin, facilities, routingContext = {}) {
    if (!facilities.length) return [];
    if (!this.routingAdapter?.routeMany) return facilities.map((facility) => ({ ...facility, reachability: {
      state: 'DISTANCE_ONLY_FALLBACK', method: 'GREAT_CIRCLE_PREFILTER_ONLY', routeDistanceKm: null, travelTimeMinutes: null,
      currentRoute: null, alternativeRoute: null, alternativeRouteState: 'NOT_COMPUTED', roadClosureImpact: { state: 'UNKNOWN', closures: [], reason: 'No road routing adapter is configured.' },
      terrainAccessConstraints: { state: 'UNKNOWN', constraints: [] }, source: null, checkedAt: this.clock().toISOString(), confidence: { state: 'UNAVAILABLE', score: null },
      reason: 'Road-network routing is not configured; straight-line distance is discovery context only.'
    } }));
    const contextIdentity = routingContext.roadContext?.revision
      ?? routingContext.roadContext?.version
      ?? routingContext.roadContext?.updatedAt
      ?? JSON.stringify(routingContext.roadContext ?? null);
    const constraintIdentity = routingContext.vehicleConstraints?.revision
      ?? routingContext.vehicleConstraints?.version
      ?? JSON.stringify(routingContext.vehicleConstraints ?? null);
    const key = `${origin.join(',')}|${facilities.map((facility) => [facility.id,facility.canonicalRevision??'',facility.coordinate?.join(',')].join(':')).join(',')}|road:${contextIdentity}|constraints:${constraintIdentity}`;
    const cached = this.#readRouteCache(key);
    if (cached) return cached;
    const value = await this.routingAdapter.routeMany(origin, facilities, routingContext);
    this.#writeRouteCache(key, value);
    return value;
  }
  async #routeDetails(origin, facilities, routingContext = {}) {
    if (!facilities.length || typeof this.routingAdapter?.routeDetails !== 'function') return facilities;
    const contextIdentity = JSON.stringify({ road: routingContext.roadContext ?? null, vehicle: routingContext.vehicleConstraints ?? null });
    const key = `details|${origin.join(',')}|${facilities.map((item) => [item.id,item.canonicalRevision??'',item.coordinate?.join(',')].join(':')).join(',')}|${contextIdentity}`;
    const cached = this.#readRouteCache(key);
    if (cached) return cached;
    const value = await this.routingAdapter.routeDetails(origin, facilities, routingContext);
    this.#writeRouteCache(key, value);
    return value;
  }
  #readRouteCache(key){const cached=this.#routeCache.get(key);if(!cached)return null;if(cached.expiresAt<=this.clock().getTime()){this.#routeCache.delete(key);return null;}this.#routeCache.delete(key);this.#routeCache.set(key,cached);return structuredClone(cached.value);}
  #writeRouteCache(key,value){this.#routeCache.delete(key);this.#routeCache.set(key,{value:structuredClone(value),expiresAt:this.clock().getTime()+this.routeCacheMs});while(this.#routeCache.size>this.routeCacheMaxEntries)this.#routeCache.delete(this.#routeCache.keys().next().value);}
}
