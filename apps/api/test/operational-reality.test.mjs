import test from 'node:test';
import assert from 'node:assert/strict';
import {RealityQuestions} from '../src/modules/intelligence/reality-questions.mjs';
import {OperationalRecoveryService,buildOperationalTruthProjection,reevaluateRetainedWork} from '../src/modules/operator/operational-recovery-service.mjs';
import {normalizeFirmsRow} from '../src/modules/world/firms-normalizer.mjs';
import {geographicContext} from '../../../packages/domain/src/operational-twin/geographic-context.mjs';
import {thermalMetrics,weatherMetrics,placeMetrics} from '../../../packages/domain/src/operational-twin/physical-conditions.mjs';
import {applicableIpmaWarnings} from '../../../packages/domain/src/operational-twin/warning-applicability.mjs';
import {buildSituation,compareSituations} from '../../../packages/domain/src/intelligence/situation-model.mjs';
import {presentSourcePaths} from '../../../scripts/release/build_release_manifest.mjs';
import {compactCommandDisplayTwin,compactGlobalTwin} from '../src/modules/operator/canonical-operator-view-projection.mjs';
import {retainedFireObservation,RetainedFireObservationReconciler} from '../src/modules/intelligence/retained-fire-observations.mjs';
import {deriveIncidentCurrentness} from '../../../packages/domain/src/operational-twin/incident-currentness.mjs';
import {validateCanonicalOperationalEvent} from '../../../packages/domain/src/event-fabric/index.mjs';
import {evaluateTaskRelevance} from '../../../packages/domain/src/operational-twin/task-relevance.mjs';

const now='2026-09-14T12:00:00.000Z',old='2026-08-20T12:00:00.000Z',actor={id:'operator',role:'administrator',incidentScopes:['pilot']};
const event=(id,at)=>({id,eventType:'wildfire.thermal_observation',source:{sourceId:'nasa-firms',familyClass:'PHYSICAL'},clocks:{observedAt:at,ingestedAt:at},payload:{}});
const incident=(id,events)=>({incident:{id:'incident:'+id,label:id,location:{coordinate:[-7.9,38.5]}},fireActivityEvents:events,evaluation:{state:'INSUFFICIENT'},evidenceGraph:{sources:[{id:'nasa-firms'}],observations:[],evidence:[]},evidenceDebt:{needs:[]}});
const source={state:'current',lastSuccessAt:now};

test('Ask counts only authorized fire activity, and historical task queries never read current work',async()=>{
 const twin={asOf:now,incidents:[incident('pilot',[event('new',now)]),incident('private',[event('secret',now)])]};let reads=0;
 const query=new RealityQuestions({intelligence:{getCurrentTwin:async()=>twin},clock:()=>new Date(now),recovery:{project:async()=>{reads++;throw Error('Current work must not be read');}}});
 const result=await query.answer(actor,{incidentId:'pilot',question:'Which incidents are current?'});
 assert.equal(result.state,'ANSWERED');assert.match(result.answer,/1 current/);assert.equal(result.results[0].incidentId,'incident:pilot');assert.doesNotMatch(JSON.stringify(result),/private|secret/);
 await assert.rejects(query.answer(actor,{incidentId:'private',question:'Which incidents are current?'}),/scope/);
 const history=await query.answer(actor,{incidentId:'pilot',question:'Why was this task suspended?',asOf:old});assert.equal(history.state,'UNAVAILABLE');assert.equal(reads,0);
});

test('B/F: historical verification work is retained without acquisition; reopened fire re-enters review',async()=>{
 let state={},time=now;
 const repository={snapshot:()=>structuredClone(state),mutate:async fn=>{state=fn(structuredClone(state));}};
 const service=new OperationalRecoveryService({repository,projectRoot:process.cwd(),clock:()=>new Date(time)}),calls=[],acquire=service.sourceResolutionRouter.acquire.bind(service.sourceResolutionRouter);
 service.sourceResolutionRouter.acquire=async ids=>{calls.push(ids);return acquire(ids);};
 const row=incident('pilot',[event('old',old)]);row.evidenceDebt.needs=[{id:'need',missingQuantity:'wildfire.official-corroboration',eligibility:{requiredSourceFamilyClasses:['OFFICIAL']}}];
 const twin={incidents:[row],sourceHealth:{sources:[]}};
 const archived=await service.synchronize(twin);assert.equal(archived.sourceResolution.summary.suspended,1);assert.equal(calls.flat().length,0);assert.equal(archived.sourceResolution.jobs[0].attemptCount,0);
 row.fireActivityEvents.push(event('reopen',now));time='2026-09-14T12:01:00.000Z';
 const reopened=await service.synchronize(twin);assert.equal(reopened.truth.currentCount,1);assert.equal(reopened.truth.currentnessCounts.REOPENED,1);assert.equal(reopened.sourceResolution.jobs[0].relevance.state,'NEEDS_REVIEW');assert.ok(calls.flat().length>0);assert.ok(reopened.sourceResolution.jobs[0].relevance.history.some(t=>t.to==='SUSPENDED'));
 const tasks=reevaluateRetainedWork({crisisAutopilotCollectionTasks:[{id:'task',incidentId:'pilot',state:'ACTIVE',attempts:[{id:'prior'}]}]},buildOperationalTruthProjection({incidents:[incident('pilot',[event('old',old)])]},{at:now}),twin,now);
 assert.equal(tasks.crisisAutopilotCollectionTasks[0].relevance.state,'SUSPENDED');assert.equal(tasks.crisisAutopilotCollectionTasks[0].attempts.length,1);
});

test('E: FIRMS failure does not remove weather, warnings, road restrictions or mapped facilities; retained thermal expires',()=>{
 const detections=[{id:'heat',source:'NASA FIRMS',product:'VIIRS',coordinate:[-7.9,38.5],observedAt:'2026-09-14T11:13:00Z',sourceState:'unavailable'}];
 const thermal=thermalMetrics(detections,[-7.9,38.5],now,null,{state:'unavailable',error:'timeout'});
 assert.equal(thermal.metrics[0].ageMinutes,47);assert.equal(thermal.metrics[0].freshness,'STALE');
 const expired=thermalMetrics(detections,[-7.9,38.5],'2026-09-18T12:00:00Z',null,{state:'unavailable'});assert.equal(expired.latestThermalDetection,null);assert.equal(expired.retainedHistory.length,1);assert.equal(expired.metrics.find(m=>m.id==='thermal60').value,null);
 assert.equal(weatherMetrics([{source:'IPMA',observedAt:now,coordinate:[-7.9,38.5],temperatureC:22.8}],now).temperature.value,22.8);
 assert.equal(applicableIpmaWarnings({records:[{id:'w',areaId:'EVR',level:'yellow',startAt:old,endAt:'2026-09-15T00:00:00Z',provenance:{synthetic:false}}],district:'Évora',source,asOf:now}).metric.value,1);
 const context=placeMetrics([{id:'f',name:'Hospital',source:'OSM',observedAt:now}],[{id:'road',state:'CLOSED',source:'IP',observedAt:now,statusEvidenceId:'restriction'}],now);assert.equal(context.places.length,1);assert.equal(context.roads[0].statusLabel,'Known closed');
});

test('G: nearest named settlement, major road, fire station and water point retain geographic evidence, not availability',()=>{
 const features=[['v','Canaviais','settlement',-.01],['r','N114','ROAD_REFERENCE',-.02],['f','Bombeiros de Évora','fire_station',-.03],['w','Mapped hydrant','water_point',-.04]].map(([id,name,kind,dx])=>({id,name,kind,source:'OpenStreetMap',coordinate:[-7.9+dx,38.5],receivedAt:old}));
 const geo=geographicContext({location:[-7.9,38.5],features,asOf:now});
 assert.equal(geo.nearest.settlement.name,'Canaviais');assert.equal(geo.nearest.majorRoad.name,'N114');assert.equal(geo.nearest.fireStation.name,'Bombeiros de Évora');assert.equal(geo.nearest.water.name,'Mapped hydrant');assert.ok(geo.features.every(f=>f.distanceKm>0&&f.availability==='NOT_ESTABLISHED'));
 assert.equal(geographicContext({location:[-7.9,38.5],features:[{...features[0],receivedAt:'2026-09-15T00:00:00Z'}],asOf:now}).features.length,0);
});

test('MODIS and VIIRS preserve native sensors and stable identities across transport row order',()=>{
 const row={latitude:38.5,longitude:-7.9,acq_date:'2026-09-14',acq_time:'1100',satellite:'T',confidence:'81',frp:'0'};
 const a=normalizeFirmsRow(row,1,'MODIS_NRT'),b=normalizeFirmsRow(row,99,'MODIS_NRT');assert.equal(a.id,b.id);assert.equal(a.instrument,'MODIS');assert.equal(a.frpMw,0);assert.match(a.qualityDefinition,/0–100/);
 assert.equal(normalizeFirmsRow({...row,satellite:'N'},2,'VIIRS_SNPP_NRT').instrument,'VIIRS');assert.equal(normalizeFirmsRow({...row,acq_time:'9999'},2,'MODIS_NRT'),null);
});

test('warning changes distinguish activation, expiry and lost coverage without fabricating cancellation',()=>{
 const input={incident:{id:'pilot',coordinate:[-7.9,38.5]},facilities:[],notices:[],warningCoverage:'CURRENT'},before=buildSituation(input,{at:old}),notice={id:'w',state:'ACTIVE',type:'Heat',area:'Évora',receivedAt:now,expiresAt:'2026-09-14T18:00:00Z'};
 const active=buildSituation({...input,notices:[notice]},{at:now});assert.ok(compareSituations(before,active).material.some(c=>c.kind==='APPLICABLE_WARNING_ACTIVE'));
 const failed=buildSituation({...input,warningCoverage:'UNKNOWN'},{at:'2026-09-14T12:10:00Z'});assert.equal(compareSituations(active,failed).material.filter(c=>c.kind==='APPLICABLE_WARNING_ENDED').length,0);
 const expired=buildSituation({...input,warningCoverage:'UNKNOWN'},{at:'2026-09-14T19:00:00Z'});assert.equal(compareSituations(active,expired).material.find(c=>c.kind==='APPLICABLE_WARNING_ENDED').current,'EXPIRED');
});

test('release source inventory removes only explicitly tracked deletions',()=>{
 assert.deepEqual(presentSourcePaths(Buffer.from('a.mjs\0removed.md\0new.mjs\0a.mjs\0'),Buffer.from('removed.md\0')),['a.mjs','new.mjs']);
});

test('bounded command and national inventories retain currentness and prioritize the active queue',()=>{
 const rows=Array.from({length:120},(_,i)=>({...incident(String(i),[]),operationalTruth:{currentness:{state:i===119?'CURRENT':'HISTORICAL',inActiveQueue:i===119},priority:{rank:120-i}}})),section={state:'READY',value:{incidents:rows}};
 const command=compactCommandDisplayTwin(section).value;
 assert.equal(command.incidents.length,96);assert.equal(command.incidents[0].incident.id,'incident:119');assert.equal(command.incidents[0].operationalTruth.currentness.state,'CURRENT');
 assert.equal(compactGlobalTwin(section).value.incidents[0].operationalTruth.currentness.state,'HISTORICAL');
});

test('retained native observations age from source time, deduplicate transport repeats, and preserve public report authority',async()=>{
 const o={id:'old-thermal',thermalId:'measurement-old',type:'thermal',instrument:'VIIRS',satellite:'NOAA-20',at:old,receivedAt:old,coordinate:[-7.9,38.5],frpMw:0,provenance:{synthetic:false,provider:'NASA FIRMS',rawSourceProductId:'raw:retained',checksumSha256:'a'.repeat(64)}};
 const e=retainedFireObservation(o,'pilot',now);assert.equal(validateCanonicalOperationalEvent(e).valid,true);assert.equal(e.payload.frpMw,0);assert.equal(e.clocks.observedAt,old);assert.equal(deriveIncidentCurrentness({events:[e],asOf:now}).state,'HISTORICAL');
 assert.equal(retainedFireObservation({...o,frpMw:null},'pilot',now).payload.frpMw,null);
 assert.equal(retainedFireObservation({...o,provenance:{...o.provenance,synthetic:true}},'pilot',now),null);
 assert.equal(retainedFireObservation({...o,receivedAt:'2026-09-15T00:00:00Z'},'pilot',now),null);
 const report=retainedFireObservation({...o,type:'report',status:'closed',provenance:{...o.provenance,provider:'ptdata',origin:'ptdata_public_report'}},'pilot',now);
 assert.equal(report.source.familyClass,'REPORT');assert.equal(validateCanonicalOperationalEvent(report).valid,true);assert.notEqual(deriveIncidentCurrentness({events:[report],asOf:now}).state,'RESOLVED');
 const events=[],service={getOperationalEvents:async()=>events,ingestOperationalEvent:async event=>{events.push(event);return{state:'ACCEPTED'};}};
 const reconciler=new RetainedFireObservationReconciler({service,clock:()=>new Date(now)});
 assert.equal((await reconciler.reconcile([{id:'pilot',observations:[o]}])).accepted,1);
 assert.equal((await reconciler.reconcile([{id:'pilot',observations:[o]}])).accepted,0);
 assert.equal((await reconciler.reconcile([{id:'a',observations:[{...o,id:'ambiguous'}]},{id:'b',observations:[{...o,id:'ambiguous'}]}])).ambiguous,2);
});

test('a registry baseline without health evidence is not presented as a source outage',async()=>{
 const twin={asOf:now,incidents:[incident('pilot',[event('new',now)])],sourceHealth:{sources:[{sourceId:'nasa-firms',familyClass:'PHYSICAL',status:'STALE',lastHealthEventId:null}]}};
 const query=new RealityQuestions({intelligence:{getCurrentTwin:async()=>twin},clock:()=>new Date(now)});
 assert.equal((await query.answer(actor,{incidentId:'pilot',question:'Which source outage affects current incidents?'})).resultCount,0);
 twin.sourceHealth.sources[0]={...twin.sourceHealth.sources[0],status:'UNAVAILABLE',lastHealthEventId:'health:failure',lastFailureAt:now};
 assert.equal((await query.answer(actor,{incidentId:'pilot',question:'Which source outage affects current incidents?'})).resultCount,1);
 const task={state:'ACTIVE',sourceId:'nasa-firms'},currentness={state:'CURRENT',inActiveQueue:true,evaluatedAt:now};
 assert.equal(evaluateTaskRelevance(task,currentness,{sources:[{sourceId:'nasa-firms',status:'STALE',reason:'Registered source baseline.',lastHealthEventId:null}]}).relevance.state,'ACTIVE');
 assert.equal(evaluateTaskRelevance(task,currentness,{sources:twin.sourceHealth.sources}).relevance.state,'BLOCKED');
});

test('unavailable thermal coverage does not become a zero trend and synthetic proof cannot keep an incident current',async()=>{
 const e={...event('synthetic',now),proof:{synthetic:true}};
 assert.equal(deriveIncidentCurrentness({events:[e],asOf:now}).countsAsCurrent,false);
 const query=new RealityQuestions({intelligence:{getCurrentTwin:async()=>({incidents:[incident('pilot',[])]})},world:{snapshot:async()=>({sources:{firms:{state:'unavailable',error:'timeout'}},thermalDetections:[]})},clock:()=>new Date(now)});
 const answer=await query.answer(actor,{incidentId:'pilot',question:'Thermal activity trend'});
 assert.match(answer.answer,/unavailable/);assert.doesNotMatch(answer.answer,/0 returned/);
});
