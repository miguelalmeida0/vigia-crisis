import test from 'node:test';
import assert from 'node:assert/strict';
import { compactOperationalSnapshot, operatorEventProjection, redactOperationalSnapshot } from '../src/modules/events/event-routes.mjs';
import { GroundTruthService, publicSourceProjection } from '../src/modules/mission/ground-truth-service.mjs';
import { MissionService } from '../src/modules/mission/mission-service.mjs';
import { publicPreventionSnapshot } from '../src/modules/prevention/prevention-service.mjs';

test('unauthenticated event reads preserve acquisition truth but redact internal work identity',()=>{
  const snapshot={privateTopLevel:'secret-top-level',sources:{firms:{state:'failed',error:'secret provider path /tmp/private',rawSourceProductId:'secret-product'}},clocks:{firms:{observedAt:'2026-08-23T10:00:00Z',privateCursor:'secret-cursor'}},evidenceNeeds:[{id:'need-1',subjectType:'fire_event',subjectId:'event-1',ownerId:'field-1'}],events:[{id:'event-1',observations:[{id:'field-evidence:package-1',type:'field',sensorId:'actor-field',evidenceUrl:'private-object',metadata:{evidenceRequestId:'request-1',checksum:'secret',locationSource:'device_gps'}}],evidenceFusion:{witnesses:[{dependencyGroup:'field_observer:actor-field',type:'field',source:'Accepted VIGIA field evidence',instrument:'actor-field'}],dependencies:[]},evidenceNeed:{id:'need-1',state:'REQUEST_ACTIVE',missingQuantity:'confirm_public_report',reason:'Physical observation required.',ownerId:'field-1',evidenceRequestId:'request-1',serviceLevel:{acknowledgementDueAt:'secret-time'},ranking:{state:'PARTIAL_INFORMATION_GAIN_UNMEASURED'},candidateMethods:[{id:'field',kind:'MANUAL',label:'Manual field inspection',ownerId:'field-1',commitment:null}]}}]};
  const publicValue=redactOperationalSnapshot(snapshot,{authentication:{authenticated:false}});
  assert.deepEqual(publicValue.evidenceNeeds,[]);
  assert.equal(publicValue.events[0].evidenceNeed.state,'REQUEST_ACTIVE');
  assert.equal(publicValue.events[0].evidenceNeed.ownerId,undefined);
  assert.equal(publicValue.events[0].evidenceNeed.evidenceRequestId,undefined);
  assert.equal(publicValue.events[0].evidenceNeed.candidateMethods[0].ownerId,null);
  assert.equal(publicValue.events[0].observations[0].sensorId,null);
  assert.equal(publicValue.events[0].observations[0].evidenceUrl,null);
  assert.equal(publicValue.events[0].observations[0].metadata.checksum,undefined);
  assert.equal(publicValue.events[0].evidenceFusion.witnesses[0].dependencyGroup,'source-group-1');
  assert.equal(publicValue.privateTopLevel,undefined);assert.equal(publicValue.sources.firms.errorPresent,true);assert.equal(publicValue.sources.firms.error,undefined);assert.equal(publicValue.clocks.firms.privateCursor,undefined);assert.doesNotMatch(JSON.stringify(publicValue),/secret provider|secret-product|secret-cursor|secret-top-level/);
  assert.deepEqual(redactOperationalSnapshot(snapshot,{incidentScopes:['event-1'],authentication:{authenticated:true}}),snapshot);
});

test('public event projection omits nested operator workflow aliases and all protected physical identities',()=>{
  const secret='operator-workflow-secret';
  const event={id:'event-public',label:'Public event',coordinate:[-8,40],observations:[{id:'camera:private',type:'camera',sensorId:secret,instrument:secret,independenceGroup:secret,at:'2026-08-22T12:00:00Z',coordinate:[-8.123456,40.654321],geolocationUncertaintyM:3,footprint:{secret},measurement:{value:999,unit:secret},qualityFlags:[secret],receivedAt:secret,provenance:{rawSourceProductId:secret},processing:{worker:secret},rawPayload:{secret}}],evidenceFusion:{state:'physical_evidence',witnesses:[{type:'camera',source:secret,instrument:secret,dependencyGroup:secret,nativeConfidence:99,nativeConfidenceDefinition:secret,platform:secret,processingChain:secret}],dependencies:[{dependencyGroup:secret,observationIds:['private-observation']}],ambiguities:[{kind:'conflicting_physical_observations',supportGroups:[secret],negativeGroups:[secret]}]},fireEvidenceState:{physicalEvidence:[{type:'drone',source:secret,instrument:secret,dependencyGroup:secret}],independenceGroups:[secret],associationAmbiguity:{reasonCodes:[secret]},nextObservationOpportunity:{state:'COMMITTED_OR_AVAILABLE',id:secret,label:secret,availability:'AVAILABLE',scheduledAt:'2026-08-22T13:00:00Z'},nextObservation:{state:'COMMITTED_OR_AVAILABLE',id:secret,label:secret}},prospectiveDetectionTiming:{traceId:`prospective:event-public:${secret}`,providerObservationAt:'2026-08-22T12:00:00Z',apiAvailableAt:'2026-08-22T12:00:01Z'},timeline:[{id:secret,type:'ground_sensor',sensor:secret,instrument:secret,coordinate:[-8.765432,40.123456],measurement:{value:777},receivedAt:secret,provenance:{secret},at:'2026-08-22T12:00:00Z'}],observationPlan:{opportunitiesV2:[{evidenceNeedId:secret,ownerId:secret}],opportunityResults:[{evidence_need_id:secret,attributable_observation_id:secret}],options:[]},evidenceNeeds:[{id:secret}],associationDecisions:[{observationId:secret}],ambiguousAssociations:[{observationId:secret}],observedThermalSupport:{features:[{properties:{observationId:secret}}]},geometryTimeline:[{observationId:secret}],actionPlan:{ownerId:secret,observationOptions:[secret]}};
  const projected=redactOperationalSnapshot({events:[event],evidenceNeeds:[]},{authentication:{authenticated:false}}).events[0],encoded=JSON.stringify(projected);
  assert.doesNotMatch(encoded,/operator-workflow-secret|opportunitiesV2|opportunityResults|associationDecisions|ambiguousAssociations|observedThermalSupport|geometryTimeline|actionPlan/);
  assert.equal(projected.observations[0].id,'physical-observation-1');assert.equal(projected.observations[0].instrument,null);assert.equal(projected.observations[0].coordinate,undefined);assert.equal(projected.observations[0].measurement,undefined);assert.equal(projected.timeline[0].coordinate,undefined);assert.equal(projected.timeline[0].measurement,undefined);assert.equal(projected.evidenceFusion.witnesses[0].instrument,undefined);assert.equal(projected.evidenceFusion.witnesses[0].nativeConfidence,undefined);assert.equal(projected.evidenceFusion.witnesses[0].nativeConfidenceDefinition,undefined);assert.equal(projected.evidenceFusion.witnesses[0].platform,undefined);assert.equal(projected.evidenceFusion.witnesses[0].processingChain,undefined);assert.equal(projected.evidenceFusion.ambiguities[0].supportGroups[0],'source-group-1');assert.equal(projected.fireEvidenceState.physicalEvidence[0].instrument,null);assert.equal(projected.fireEvidenceState.nextObservationOpportunity.id,'public-observation-option-1');assert.equal(projected.fireEvidenceState.nextObservationOpportunity.label,'Observation option');assert.equal(projected.prospectiveDetectionTiming.traceId,null);
  const authenticated=redactOperationalSnapshot({events:[event],evidenceNeeds:[]},{incidentScopes:['event-public'],authentication:{authenticated:true}}).events[0];assert.equal(authenticated.prospectiveDetectionTiming.traceId,`prospective:event-public:${secret}`);assert.equal(authenticated.observations[0].measurement.value,999);
});

test('public thermal projections keep operational measurements but remove provider provenance and diagnostics',()=>{
  const secret='thermal-provider-secret',thermal={id:'thermal-public',type:'thermal',source:'public-thermal',sourceFamily:'viirs',at:'2026-08-22T12:00:00Z',coordinate:[-8,40],frpMw:12.5,brightnessKelvin:330,rawSourceProductId:secret,rawSourceProductIds:[secret],sensorId:secret,instrument:secret,evidenceUrl:secret,receivedAt:secret,providerReceivedAt:secret,acquiredAt:secret,archivePath:secret,checksum:secret,provenance:{rawSourceProductId:secret,url:secret},processing:{diagnostic:secret},rawPayload:{secret},metadata:{negativeEvidenceEligible:true,privateDiagnostic:secret}};
  const projected=redactOperationalSnapshot({events:[{id:'thermal-event',observations:[thermal],timeline:[thermal],thermal:{series:[thermal]},thermalSeries:[thermal]}],evidenceNeeds:[]},{authentication:{authenticated:false}}).events[0],encoded=JSON.stringify(projected);
  assert.equal(projected.observations[0].frpMw,12.5);assert.equal(projected.observations[0].brightnessKelvin,330);assert.equal(projected.observations[0].sensorId,null);assert.equal(projected.observations[0].instrument,null);assert.equal(projected.timeline[0].frpMw,12.5);assert.equal(projected.thermal.series[0].frpMw,12.5);assert.doesNotMatch(encoded,/thermal-provider-secret|rawSourceProduct|providerReceivedAt|archivePath|checksum|privateDiagnostic|rawPayload|processing|provenance/);
});

test('public bootstrap does not expose internal requests, packages, outcomes or operator roster',async()=>{
  const publicActor={id:'public-readonly',role:'public_viewer',authentication:{authenticated:false,mode:'public_read_only'}};
  const service=new GroundTruthService({
    operationalEventService:{snapshot:async()=>{throw new Error('live_state_unavailable');}},worldService:{snapshot:async()=>({meta:{generatedAt:'2026-08-09T12:00:00Z',mode:'public-sources',region:'Portugal'},sources:{},fires:[],riskToday:[],riskTomorrow:[],weather:[],warnings:[],earthObservations:[],thermalDetections:[]})},
    preventionService:{snapshot:async()=>({candidates:[]})},detectionService:{snapshot:async()=>({incidents:[]})},outcomeService:{snapshot:()=>{throw new Error('public_outcome_read');}},
    repository:{snapshot:()=>({evidenceNeeds:[{id:'secret'}],evidenceRequests:[{id:'secret'}],evidencePackages:[{id:'secret'}],hazards:[],interventions:[],reobservations:[],watchPlaces:[],watchedEventIds:[]})},
    controlService:{snapshot:()=>({organizations:[],workspaces:[],territories:[],actors:[{id:'internal-operator'}]})},detectorRegistry:{models:()=>[]},auditService:{verifyChain:()=>({valid:true,count:0})}
  });
  const value=await service.bootstrap(publicActor);
  assert.equal(value.operations.restricted,true);
  assert.deepEqual(value.operations.evidenceRequests,[]);
  assert.deepEqual(value.operations.evidencePackages,[]);
  assert.equal(value.operations.effectiveness.requestsCreated,0);
  assert.equal(value.operations.effectiveness.requestsProducingNewEvidence,0);
  assert.equal(value.outcomes.restricted,true);
  assert.deepEqual(value.control.actors,[publicActor]);
});

test('public bootstrap source diagnostics expose coarse health without raw identities, locators, or error text',async()=>{
  const projected=publicSourceProjection({firms:{state:'failed',configured:true,accepted:7,fetchedAt:'2026-08-23T10:00:00Z',error:'token abc at /private/path',rawSourceProductId:'secret-product',rawSourceProductIds:['secret-array'],url:'https://private.example/token'}}),encoded=JSON.stringify(projected);
  assert.deepEqual(projected.firms,{state:'failed',configured:true,errorPresent:true,fetchedAt:'2026-08-23T10:00:00.000Z',accepted:7});
  assert.doesNotMatch(encoded,/token abc|private|secret-product|secret-array|https:/);
});

test('narrow authenticated bootstrap receives restricted prevention and outcomes projections',async()=>{
  const actor={id:'viewer-narrow',role:'viewer',incidentScopes:['PT-A'],authentication:{authenticated:true,mode:'session'}},preventionCalls=[];
  const service=new GroundTruthService({
    worldService:{snapshot:async()=>({meta:{generatedAt:'2026-08-22T12:00:00Z',mode:'test',region:'Portugal'},sources:{},fires:[],riskToday:[],riskTomorrow:[],weather:[],warnings:[],earthObservations:[],thermalDetections:[]})},preventionService:{snapshot:async(options)=>{preventionCalls.push(options);return{restricted:true,findings:[]};}},detectionService:{snapshot:async()=>({incidents:[]})},outcomeService:{snapshot:()=>{throw new Error('narrow_outcome_read');}},repository:{snapshot:()=>({evidenceNeeds:[],evidenceRequests:[],evidencePackages:[],hazards:[],interventions:[],reobservations:[],watchPlaces:[],watchedEventIds:[]})},controlService:{snapshot:()=>({actors:[]})},detectorRegistry:{models:()=>[]},auditService:{verifyChain:()=>({valid:true,count:0})}
  });
  const value=await service.bootstrap(actor);assert.equal(preventionCalls[0].publicProjection,true);assert.equal(value.prevention.restricted,true);assert.equal(value.outcomes.restricted,true);
});

test('legacy public mission and prevention projections exclude operator identities and evidence locators',async()=>{
  const rawPrevention={meta:{generatedAt:'2026-08-22T12:00:00Z'},summary:{candidates:1},findings:[{findingId:'finding-1',kind:'fuel',coordinate:[-8,40],ownerId:'operator-secret',evidenceNeedId:'need-secret',provenance:{url:'private'},reviewSummary:{count:1,latest:{decision:'keep',reviewerType:'DOMAIN_EXPERT_REVIEW',reviewedAt:'2026-08-22T11:00:00Z'}}}],candidates:[],verifiedHazards:[{id:'hazard-secret'}],models:[],detectorRuns:[{id:'run-secret'}],preventionReviews:[{reviewerId:'reviewer-secret'}],reviewContext:{private:true},reviewExchange:{private:true},validation:{state:'PARTIAL'}};
  const projected=publicPreventionSnapshot(rawPrevention);assert.equal(projected.restricted,true);assert.deepEqual(projected.verifiedHazards,[]);assert.doesNotMatch(JSON.stringify(projected),/operator-secret|need-secret|private|hazard-secret|run-secret|reviewer-secret/);
  const mission=new MissionService({worldService:{snapshot:async()=>({meta:{generatedAt:'2026-08-22T12:00:00Z',mode:'public',region:'Portugal'},sources:{},fires:[],riskToday:[],riskTomorrow:[],weather:[],warnings:[],earthObservations:[],thermalDetections:[]})},preventionService:{snapshot:async()=>projected},detectionService:{snapshot:async()=>({incidents:[]})},commandService:{snapshot:()=>({actors:[{id:'operator-secret'}],evidenceRequests:[{id:'request-secret',state:'requested'}],hazards:[],interventions:[]})}});
  const value=await mission.snapshot();assert.equal(value.operator.restricted,true);assert.equal(value.operator.summary.openEvidenceRequests,1);assert.doesNotMatch(JSON.stringify(value),/operator-secret|request-secret/);
});

test('V10 event inventory is bounded while preserving a full-detail contract',()=>{
  const observations=Array.from({length:240},(_,index)=>({id:`thermal-${index}`,type:'thermal',at:new Date(Date.parse('2026-08-12T00:00:00Z')+index*60_000).toISOString(),sourceFamily:index%2?'viirs':'sentinel3_slstr',frpMw:index}));
  const features=observations.map((item)=>({type:'Feature',properties:{observationId:item.id},geometry:{type:'Point',coordinates:[-8,40]}}));
  const event={id:'large-event',observations,timeline:observations,geometryTimeline:observations,associationDecisions:observations.map((item)=>({observationId:item.id})),observedThermalSupport:{type:'FeatureCollection',features},thermal:{series:observations},thermalSeries:observations};
  const compact=compactOperationalSnapshot({events:[event]}).events[0];
  assert.equal(compact.observationInventory.total,240);assert.ok(compact.observationInventory.returned>0&&compact.observationInventory.returned<=12);assert.equal(compact.observationInventory.truncated,true);assert.equal(compact.observationInventory.detailHref,'/api/v10/events/large-event');assert.ok(compact.observedThermalSupport.features.length<=12);assert.ok(compact.associationDecisions.length<=12);assert.ok(compact.thermal.series.length<=12);assert.ok(compact.timeline.length<=12);assert.ok(compact.geometryTimeline.length<=12);assert.ok(compact.observations.some((item)=>item.id==='thermal-239'));
});

test('V10 event list keeps the operational head bounded while retaining total inventory',()=>{
  const result=compactOperationalSnapshot({events:Array.from({length:75},(_,index)=>({id:`event-${index}`,observations:[]}))});
  assert.deepEqual(result.eventInventory,{total:75,returned:40,truncated:true});
  assert.equal(result.events.length,40);assert.equal(result.events[0].id,'event-0');assert.equal(result.events.at(-1).id,'event-39');
});

test('operator event detail is product-aware and bounded without changing the durable truth count',()=>{
  const observations=Array.from({length:480},(_,index)=>({id:`physical-${index}`,type:'thermal',at:new Date(Date.parse('2026-08-01T00:00:00Z')+index*60_000).toISOString(),sourceFamily:index%2?'viirs':'sentinel3_slstr',frpMw:index%37,provenance:{rawSourceProductId:`raw-product-${Math.floor(index/10)}`}}));
  const event={id:'large-detail',observations,timeline:observations,geometryTimeline:observations,associationDecisions:observations.map((item)=>({observationId:item.id})),observedThermalSupport:{type:'FeatureCollection',features:observations.map((item)=>({type:'Feature',properties:{observationId:item.id},geometry:{type:'Point',coordinates:[-8,40]}}))},thermal:{samples:480,series:observations},thermalSeries:observations};
  const projected=operatorEventProjection(event);
  assert.deepEqual(projected.observationInventory,{total:480,returned:48,truncated:true,fullDetailHref:'/api/v10/events/large-detail'});
  assert.equal(projected.projection.kind,'operator');assert.equal(projected.projection.completeTruthRetained,true);assert.equal(projected.observedThermalSupport.features.length,48);assert.equal(projected.associationDecisions.length,48);assert.ok(projected.timeline.length<=180);assert.ok(projected.geometryTimeline.length<=120);assert.ok(projected.thermal.series.length<=240);assert.ok(projected.thermalSeries.length<=240);
});
