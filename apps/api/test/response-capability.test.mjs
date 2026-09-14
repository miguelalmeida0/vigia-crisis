import test from 'node:test';
import assert from 'node:assert/strict';
import { OsrmRoutingAdapter } from '../src/modules/response-capability/osrm-routing-adapter.mjs';
import { ResponseCapabilityService } from '../src/modules/response-capability/response-capability-service.mjs';
import { registerResponseCapabilityRoutes } from '../src/modules/response-capability/response-capability-routes.mjs';
import { routingCoverage } from '../src/modules/response-capability/routing-cohort.mjs';
import { Router } from '../src/http/router.mjs';
import './response-capability-facility-repository.case.mjs';
const at = '2026-09-04T15:00:00.000Z';
const actor = { role: 'supervisor', capabilities: ['read:incident_command'], incidentScopes: ['one'], authentication: { authenticated: true } };
test('OSRM adapter returns road time, current route, alternative route and explicit closure/access uncertainty', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ code: 'Ok', routes: [
    { distance: 12_400, duration: 1_020, geometry: { type: 'LineString', coordinates: [[-8.5, 41.2], [-8.4, 41.1]] } },
    { distance: 14_000, duration: 1_200, geometry: { type: 'LineString', coordinates: [[-8.5, 41.2], [-8.45, 41.15], [-8.4, 41.1]] } }
  ] }), { status: 200, headers: { 'content-type': 'application/json' } });
  const adapter = new OsrmRoutingAdapter({ fetchImpl, clock: () => new Date(at) });
  const result = await adapter.route([-8.5, 41.2], { id: 'station', coordinate: [-8.4, 41.1], distanceKm: 12 });
  assert.equal(result.reachability.state, 'ROUTED');
  assert.equal(result.reachability.travelTimeMinutes, 17);
  assert.equal(result.reachability.routeDistanceKm, 12.4);
  assert.equal(result.reachability.currentRoute.geometry.type, 'LineString');
  assert.equal(result.reachability.alternativeRouteState, 'AVAILABLE');
  assert.equal(result.reachability.roadClosureImpact.state, 'UNKNOWN');
  assert.equal(result.reachability.terrainAccessConstraints.state, 'NOT_ROUTING_CONSTRAINED');
});
test('OSRM adapter rejects closure-intersecting alternatives and selects the fastest returned closure-clear path', async () => {
  let requestedUrl = null;
  const fetchImpl = async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ code: 'Ok', routes: [
      { distance: 8_000, duration: 600, geometry: { type: 'LineString', coordinates: [[-8.5, 41.2], [-8.45, 41.15], [-8.4, 41.1]] } },
      { distance: 12_000, duration: 960, geometry: { type: 'LineString', coordinates: [[-8.5, 41.2], [-8.55, 41.1], [-8.4, 41.1]] } },
      { distance: 14_000, duration: 1_080, geometry: { type: 'LineString', coordinates: [[-8.5, 41.2], [-8.58, 41.08], [-8.4, 41.1]] } }
    ] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const adapter = new OsrmRoutingAdapter({ fetchImpl, clock: () => new Date(at) });
  const result = await adapter.route([-8.5, 41.2], { id: 'station:closure-clear', coordinate: [-8.4, 41.1], distanceKm: 8 }, {
    roadContext: { revision: 'closure:geometry:r1', closures: [{
      id: 'closure:primary-road', state: 'CLOSED', source: 'Governed FieldNet road report', observedAt: at,
      geometry: { type: 'Point', coordinates: [-8.45, 41.15] }
    }] }
  });
  assert.match(requestedUrl, /alternatives=3/);
  assert.match(requestedUrl, /overview=full/);
  assert.equal(result.reachability.state, 'ROUTED');
  assert.equal(result.reachability.travelTimeMinutes, 16);
  assert.equal(result.reachability.routeDistanceKm, 12);
  assert.equal(result.reachability.alternativeRouteState, 'AVAILABLE');
  assert.equal(result.reachability.roadClosureImpact.state, 'APPLIED_TO_RETURNED_ROUTES');
  assert.equal(result.reachability.roadClosureImpact.rejectedRouteCount, 1);
  assert.match(result.reachability.reason, /not intersecting supplied governed closure geometry/i);
});
test('OSRM table coverage returns explainable facility-class point samples without a service-area polygon', async () => {
  let requestedUrl = null;
  const fetchImpl = async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ code: 'Ok', durations: [[600, 900], [720, 840]], distances: [[8000, 12000], [9000, 11000]] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const adapter = new OsrmRoutingAdapter({ fetchImpl, clock: () => new Date(at) });
  const result = await adapter.coverageSurface([
    { id: 'station:one', kind: 'FIRE_STATION', coordinate: [-8.5, 41.2] },
    { id: 'hospital:one', kind: 'HOSPITAL', coordinate: [-8.4, 41.1] }
  ], [[-8.45, 41.15], [-8.35, 41.05]]);
  assert.equal(result.state, 'ROAD_NETWORK_SAMPLES_AVAILABLE');
  assert.equal(result.samples.length, 2);
  assert.equal(result.samples[0].byKind.FIRE_STATION.travelTimeMinutes, 10);
  assert.equal(result.samples[0].byKind.HOSPITAL.travelTimeMinutes, 12);
  assert.equal(result.samples[1].byKind.HOSPITAL.routeDistanceKm, 11);
  assert.match(requestedUrl, /\/table\/v1\/driving\//);
  assert.match(result.truthBoundary, /not a continuous service area/i);
  assert.doesNotMatch(JSON.stringify(result), /\"type\":\"(?:Polygon|MultiPolygon|Circle)\"/);
});
test('OSRM table coverage fails closed before a request when governed constraints cannot be applied', async () => {
  let requests = 0;
  const adapter = new OsrmRoutingAdapter({ fetchImpl: async () => { requests += 1; throw new Error('must_not_call'); }, clock: () => new Date(at) });
  const result = await adapter.coverageSurface(
    [{ id: 'station:one', kind: 'FIRE_STATION', coordinate: [-8.5, 41.2] }],
    [[-8.45, 41.15]],
    { roadContext: { revision: 'closure:surface:r1', closures: [{ id: 'N17', state: 'CLOSED', source: 'FieldNet' }] } }
  );
  assert.equal(requests, 0);
  assert.equal(result.state, 'WITHHELD_UNSUPPORTED_GOVERNED_CONSTRAINT');
  assert.equal(result.samples.length, 0);
  assert.match(result.reason, /closure-capable routing adapter/i);
});
test('routing failure keeps straight-line discovery distance but never fabricates driving time', async () => {
  const adapter = new OsrmRoutingAdapter({ fetchImpl: async () => { throw new Error('controlled_outage'); }, clock: () => new Date(at) });
  const result = await adapter.route([-8.5, 41.2], { id: 'station', coordinate: [-8.4, 41.1], distanceKm: 12 });
  assert.equal(result.distanceKm, 12);
  assert.equal(result.reachability.state, 'DISTANCE_ONLY_FALLBACK');
  assert.equal(result.reachability.travelTimeMinutes, null);
  assert.equal(result.reachability.currentRoute, null);
  assert.match(result.reachability.reason, /not an arrival-time estimate/);
});
test('routing coverage is AVAILABLE only when every returned eligible facility is routed or provider-declared unreachable', () => {
  const routingAdapter = { endpoint: 'https://routing.example', routeMany() {} };
  const routed = { id: 'station:routed', reachability: { state: 'ROUTED', source: { provider: 'Governed router' }, checkedAt: at } };
  const unreachable = { id: 'station:unreachable', reachability: { state: 'UNREACHABLE', reason: 'The provider returned NoRoute.', source: { provider: 'Governed router' }, checkedAt: at } };
  const available = routingCoverage({ FIRE_STATION: [routed, unreachable] }, routingAdapter, at);
  assert.equal(available.state, 'AVAILABLE');
  assert.deepEqual(available.stateCounts, { ROUTED: 1, UNREACHABLE: 1 });
  assert.equal(available.eligibleCandidateCount, 2);
  assert.equal(available.resolvedCandidateCount, 2);
  const fallback = routingCoverage({ FIRE_STATION: [routed, { id: 'station:fallback', reachability: { state: 'DISTANCE_ONLY_FALLBACK' } }] }, routingAdapter, at);
  assert.equal(fallback.state, 'DEGRADED');
  assert.equal(fallback.resolvedCandidateCount, 1);
});
test('public OSRM fails closed when a governed road closure or vehicle constraint cannot be applied', async () => {
  let requests=0;const adapter=new OsrmRoutingAdapter({fetchImpl:async()=>{requests+=1;throw new Error('must_not_call_unqualified_router');},clock:()=>new Date(at)}),facility={id:'station:closure',coordinate:[-8.4,41.1],distanceKm:4};
  const closure=await adapter.route([-8.5,41.2],facility,{roadContext:{revision:'closure:r1',closures:[{id:'closure:north',state:'CLOSED',source:'FieldNet',observedAt:at}]}});
  assert.equal(requests,0);assert.equal(closure.reachability.state,'WITHHELD_UNSUPPORTED_GOVERNED_CONSTRAINT');assert.equal(closure.reachability.travelTimeMinutes,null);assert.equal(closure.reachability.roadClosureImpact.state,'GOVERNED_CLOSURE_REQUIRES_CAPABLE_ROUTER');assert.equal(closure.reachability.roadClosureImpact.closures[0].id,'closure:north');assert.match(closure.reachability.reason,/closure-capable routing adapter/i);
  const constrained=await adapter.route([-8.5,41.2],facility,{vehicleConstraints:{revision:'vehicle:r1',constraints:[{type:'BRIDGE_LIMIT',state:'ACTIVE'}]}});
  assert.equal(constrained.reachability.terrainAccessConstraints.state,'GOVERNED_CONSTRAINT_REQUIRES_CAPABLE_ROUTER');assert.equal(requests,0);
});
test('response routing receives governed constraint context and cache identity changes with its revision', async () => {
  const candidate={id:'hospital:one',kind:'HOSPITAL',name:'Hospital',coordinate:[-8.4,41.1],distanceKm:4,staticCapability:{emergencyDepartment:{value:true}},provenance:{},freshness:{}},calls=[],facilityRepository={nearest:()=>({covered:true,byKind:{HOSPITAL:[candidate],FIRE_STATION:[],EMS_BASE:[],CIVIL_PROTECTION:[],POLICE:[],SHELTER:[],WATER_POINT:[],AIR_SUPPORT_BASE:[]},sourceCoverage:{}})},routingAdapter={endpoint:'https://closure-capable.example',async routeMany(_origin,items,context){calls.push(structuredClone(context));return items.map(item=>({...item,reachability:{state:'ROUTED',travelTimeMinutes:context.roadContext.revision==='closure:r2'?22:35,routeDistanceKm:9,method:'GOVERNED_CLOSURE_AWARE_TEST_ROUTER',currentRoute:{geometry:{type:'LineString',coordinates:[[-8.5,41.2],item.coordinate]}},alternativeRoute:null,alternativeRouteState:'NOT_RETURNED',roadClosureImpact:{state:'APPLIED',closures:context.roadContext.closures},terrainAccessConstraints:{state:'APPLIED',constraints:[]},source:{provider:'Test closure-capable router'},checkedAt:at,confidence:{state:'CONTEXTUAL_ESTIMATE'}}}));}},service=new ResponseCapabilityService({facilityRepository,routingAdapter,clock:()=>new Date(at)});
  const incident={id:'one',coordinate:[-8.5,41.2],truthState:'DETECTION_CANDIDATE'},road=(revision)=>({revision,closures:[{id:'closure:north',state:'CLOSED'}]});
  const first=await service.projectIncident(incident,{roadContext:road('closure:r1')}),cached=await service.projectIncident(incident,{roadContext:road('closure:r1')}),recomputed=await service.projectIncident(incident,{roadContext:road('closure:r2')});
  assert.equal(calls.length,2);assert.equal(calls[0].incidentId,'one');assert.equal(calls[0].roadContext.revision,'closure:r1');assert.equal(first.facilities.HOSPITAL[0].reachability.travelTimeMinutes,35);assert.equal(cached.facilities.HOSPITAL[0].reachability.travelTimeMinutes,35);assert.equal(recomputed.facilities.HOSPITAL[0].reachability.travelTimeMinutes,22);
});
test('portfolio traversal cannot evict an in-review incident route epoch within its governed TTL', async () => {
  let routeCalls=0;
  const facility=(incidentId)=>({id:`station:${incidentId}`,kind:'FIRE_STATION',name:`Station ${incidentId}`,coordinate:[-8.4,41.1],distanceKm:4,staticCapability:{wildfireCapability:{state:'KNOWN',value:true}},provenance:{provider:'governed-test',sourceRecordId:`station:${incidentId}`},freshness:{}});
  const facilityRepository={nearest:(origin)=>{const incidentId=String(origin[0]);return{covered:true,byKind:{FIRE_STATION:[facility(incidentId)],HOSPITAL:[],EMS_BASE:[],CIVIL_PROTECTION:[],POLICE:[],SHELTER:[],WATER_POINT:[],AIR_SUPPORT_BASE:[]},sourceCoverage:{}};}};
  const routingAdapter={endpoint:'governed:test-router',async routeMany(_origin,items){routeCalls+=1;const checkedAt=new Date(Date.parse(at)+routeCalls*1_000).toISOString();return items.map(item=>({...item,reachability:{state:'ROUTED',travelTimeMinutes:12,routeDistanceKm:8,method:'TEST_ROAD_NETWORK',currentRoute:{},alternativeRoute:null,checkedAt,source:{provider:'governed-test-router'}}}));}};
  const service=new ResponseCapabilityService({facilityRepository,routingAdapter,clock:()=>new Date(at)});
  const selected={id:'selected',coordinate:[1,41.2],truthState:'DETECTION_CANDIDATE'};
  const first=await service.projectIncident(selected),recommendation=first.recommendations.find(item=>item.kind==='FIRE_RESPONSE_REVIEW');
  for(let index=0;index<80;index+=1)await service.projectIncident({id:`portfolio:${index}`,coordinate:[index+10,41.2],truthState:'DETECTION_CANDIDATE'});
  const refreshed=await service.projectIncident(selected),refreshedRecommendation=refreshed.recommendations.find(item=>item.kind==='FIRE_RESPONSE_REVIEW');
  assert.equal(routeCalls,81);
  assert.equal(refreshedRecommendation.supportEpoch.routeCheckedAt,recommendation.supportEpoch.routeCheckedAt);
  assert.equal(refreshedRecommendation.recommendationVersion,recommendation.recommendationVersion);
  assert.equal(refreshedRecommendation.recommendationHash,recommendation.recommendationHash);
});
test('service projects active-incident capacity IRs and admits only attributable aggregate capacity', async () => {
  const facility = (id, kind) => ({ id, kind, name: id, coordinate: [-8.4, 41.1], distanceKm: 10, staticCapability: kind === 'HOSPITAL' ? { emergencyDepartment: { value: true } } : { wildfireCapability: { value: true } }, provenance: {}, freshness: {} });
  let retrievalOptions = null;
  const facilityRepository = { nearest: (_origin, options) => { retrievalOptions = options; return ({
    covered: true,
    byKind: { HOSPITAL: [facility('hospital', 'HOSPITAL')], FIRE_STATION: [facility('station', 'FIRE_STATION')], EMS_BASE: [], CIVIL_PROTECTION: [], POLICE: [], SHELTER: [], WATER_POINT: [], AIR_SUPPORT_BASE: [] },
    sourceCoverage: {}
  }); } };
  const routingAdapter = { endpoint: 'https://routing.example', routeMany: async (_origin, items) => items.map((item) => ({ ...item, reachability: {
    state: 'ROUTED', travelTimeMinutes: item.kind === 'FIRE_STATION' ? 12 : 20, routeDistanceKm: 15, method: 'TEST_ROAD_NETWORK', currentRoute: {}, alternativeRoute: null
  } })) };
  const capacityReportProvider = { listForIncident: async () => ({ source: 'controlled partner sources', sourceAvailability: { fireDispatchFeed: 'CONNECTED' }, items: [{
    facilityId: 'station', state: 'DISPATCH_CONFIRMED', admitted: true, admissionReference: 'admission:dispatch:77', observedAt: '2026-09-04T14:58:00Z', source: { name: 'Regional dispatch', reference: 'dispatch:77' }, crewsAvailable: 2, enginesAvailable: 1
  }] }) };
  const service = new ResponseCapabilityService({
    detectionService: { find: async () => ({ id: 'one', coordinate: [-8.5, 41.2], truthState: 'VERIFIED_CURRENT' }) },
    facilityRepository, routingAdapter, capacityReportProvider, clock: () => new Date(at)
  });
  const result = await service.project(actor, 'one');
  assert.deepEqual(retrievalOptions.mustIncludeIds, ['station']);
  assert.equal(result.facilities.FIRE_STATION[0].dynamicCapacity.fields.crewsAvailable, 2);
  assert.equal(Number.isInteger(result.facilities.FIRE_STATION[0].retrievalRank), true);
  assert.match(result.facilities.FIRE_STATION[0].candidateCohort.eligibility, /^(?:INELIGIBLE|ELIGIBLE)_FOR_PLANNING_RECOMMENDATION$/);
  assert.equal(Array.isArray(result.facilities.FIRE_STATION[0].candidateCohort.exclusions), true);
  assert.equal(result.retrievalCoverage.byKind.FIRE_STATION.rankedCount, 1);
  assert.equal(result.routing.state, 'AVAILABLE');
  assert.equal(result.facilities.FIRE_STATION[0].lastKnownOperationalStatus.state, 'UNKNOWN');
  assert.equal(result.optimizerInputs.candidates.find((item) => item.facilityId === 'station').eligibleForDispatchRecommendation, true);
  assert.equal(result.informationRequirements.some((item) => item.subjectId === 'station'), false);
  assert.equal(result.informationRequirements.some((item) => item.subjectId === 'hospital'), true);
  assert.equal(result.decisionContext.medicalCapacityRequired, true);
  const medical = await service.projectIncident({ id: 'one', coordinate: [-8.5, 41.2], truthState: 'VERIFIED_CURRENT' }, { decisionContext: { medicalCapacityRequired: true, fireCapacityRequired: true } });
  assert.equal(medical.informationRequirements.some((item) => item.subjectId === 'hospital'), true);
  assert.equal(medical.informationRequirements.find((item) => item.subjectId === 'hospital').state, 'BLOCKED_SOURCE_CONNECTOR');
  const historical = await service.projectIncident({ id: 'one', coordinate: [-8.5, 41.2], truthState: 'NEEDS_REVALIDATION' });
  assert.equal(historical.decisionContext.fireCapacityRequired, false);
  assert.equal(historical.decisionContext.medicalCapacityRequired, false);
  assert.equal(historical.informationRequirements.length, 0);
});
test('service enforces incident scope and the dedicated route is registered as an incident-scoped operator read', async () => {
  const service = new ResponseCapabilityService({ detectionService: { find: async () => null }, facilityRepository: {}, routingAdapter: null });
  await assert.rejects(() => service.project({ ...actor, incidentScopes: ['different'] }, 'one'), /incident_scope_forbidden/);
  const router = new Router();
  let canonicalRequest = null;
  let legacyProjectionCalled = false;
  registerResponseCapabilityRoutes(router, {
    canonicalOperatorApiService: {
      async responseCapability(incidentId, options) {
        canonicalRequest = { incidentId, actor: options.actor };
        return { schemaVersion: 'vigia.response-capability.v1', incident: { id: 'incident:one' } };
      }
    },
    responseCapabilityService: { async project() { legacyProjectionCalled = true; return null; } }
  });
  const route = router.routes().find((item) => item.path.endsWith('/response-capability'));
  assert.equal(route.policy.boundary, 'operator');
  assert.equal(route.policy.incidentScoped, true);
  assert.equal(route.policy.incidentParam, 'incidentId');
  const reviewRoute = router.routes().find((item) => item.path.endsWith('/reviews'));
  assert.equal(reviewRoute.method, 'POST');
  assert.equal(reviewRoute.policy.capability, 'command:incident');
  assert.equal(reviewRoute.policy.incidentScoped, true);
  assert.equal(reviewRoute.policy.incidentParam, 'incidentId');
  let status = null;
  let payload = null;
  await router.handle(
    { method: 'GET', url: '/api/v10/operator/incidents/incident%3Aone/response-capability', headers: {} },
    { writeHead(value) { status = value; }, end(value) { payload = JSON.parse(String(value)); } },
    { actor }
  );
  assert.equal(status, 200);
  assert.equal(payload.incident.id, 'incident:one');
  assert.equal(canonicalRequest.incidentId, 'incident:one');
  assert.equal(canonicalRequest.actor, actor);
  assert.equal(legacyProjectionCalled, false);
});
