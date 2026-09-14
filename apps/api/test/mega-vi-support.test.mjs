import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSituation,scenario} from '../../../packages/domain/src/intelligence/situation-model.mjs';
import {operationalSupport,settlementObjects,supportComparison,causalSupportEvents} from '../../../packages/domain/src/intelligence/operational-support.mjs';
import {accessResilience} from '../../../packages/domain/src/intelligence/access-resilience.mjs';
import {SituationAsk} from '../src/modules/intelligence/situation-ask.mjs';
import {SituationService} from '../src/modules/intelligence/situation-service.mjs';
import {historicalAnalogs} from '../../../packages/domain/src/intelligence/access-resilience.mjs';
import {OperatorStateRepository} from '../src/modules/interventions/operator-state-repository.mjs';
import {operationalSourceFamilies} from '../src/modules/mission/operational-source-families.mjs';
const at='2026-09-13T10:00:00Z';
function fixture(){
 const facilities=['h1','h2','f1','f2','rc'].map((id,i)=>({id,canonicalName:id,canonicalType:id[0]==='h'?'hospital':id[0]==='f'?'fire_station':'temporary_reception_center',coordinate:[-7.9+i*.01,38.6],fields:{'capabilities.emergencyDepartment':{state:'RESOLVED'},'capabilities.fireResponse':{state:'RESOLVED'},'designation.kind':{state:'RESOLVED'}},capabilities:{emergencyDepartment:id[0]==='h',fireResponse:id[0]==='f'},designation:id==='rc'?{kind:'ZCAP'}:null,provenance:{'capabilities.emergencyDepartment':[{retrievedAt:at,validUntil:'2026-09-14T10:00:00Z'}]}}));
 const routes=facilities.map((f,i)=>({id:'r'+f.id,facilityId:f.id,direction:'FACILITY_TO_INCIDENT',calculatedAt:at,validUntil:'2026-09-13T10:05:00Z',travelTimeMinutes:10+i*5,distanceKm:8+i,geometry:{type:'LineString',coordinates:[f.coordinate,[-7.8,38.7]]},roads:[{ref:i%2===0?'N114':'A6'}]}));
 routes[0].alternatives=[{...routes[0],roads:[{ref:'N236'}],travelTimeMinutes:18}];
 const places=[{id:'town',name:'Test settlement',kind:'settlement',coordinate:[-7.85,38.7],municipality:'Test municipality',source:'CONTROLLED_TEST',population:{value:0,authority:'INE',referenceYear:2021,sourceUrl:'https://mapas.ine.pt/test',retrievedAt:at,geographicUnit:'SETTLEMENT'}}];
 return buildSituation({incident:{id:'test',coordinate:[-7.8,38.7]},facilities,routes,places,communityRoutes:routes.map(r=>({...r,id:'c'+r.id,settlementId:'town',direction:'FACILITY_TO_SETTLEMENT'})),roadCoverage:{connected:true,state:'PARTIAL',checkedAt:at,validUntil:'2026-09-13T10:10:00Z',coveredRoads:['N114','N236','A6']},sources:[]},{at,universe:'CONTROLLED_TEST'});
}
test('multi-failure considers all roads simultaneously independent of input order',()=>{const s=fixture(),failures=[{kind:'ROAD_UNAVAILABLE',entityId:'N114'},{kind:'ROAD_UNAVAILABLE',entityId:'N236'}],a=scenario(s,failures),b=scenario(s,[...failures].reverse());assert.equal(a.snapshot.routes[0].state,'AFFECTED_BY_RESTRICTION');assert.equal(a.snapshot.routes[0].travelTimeMinutes,null);assert.deepEqual(a.snapshot.routes,b.snapshot.routes);});
test('road plus facility removes both primary and alternate without changing observed truth',()=>{const s=fixture(),original=JSON.stringify(s),r=scenario(s,[{kind:'ROAD_UNAVAILABLE',entityId:'N114'},{kind:'FACILITY_UNAVAILABLE',entityId:'h2'},{kind:'ROAD_UNAVAILABLE',entityId:'N236'}]);assert.equal(accessResilience(r.snapshot).groups[0].options.length,0);assert.equal(operationalSupport(r.snapshot).communities[0].groups[0].options.length,0);assert.equal(JSON.stringify(s),original);assert.equal(r.operationalWrites,0);});
test('duplicate and excessive failures cannot manufacture options',()=>{const s=fixture(),a={kind:'FACILITY_UNAVAILABLE',entityId:'h1'};assert.equal(accessResilience(scenario(s,[a,a]).snapshot).groups[0].primary.facilityId,'h2');assert.throws(()=>scenario(s,Array(9).fill(a)));assert.throws(()=>scenario(s,[]));assert.throws(()=>scenario(s,{kind:'ROAD_UNAVAILABLE',entityId:'N999'}));});
test('expired routes and expired qualification never establish current support or notices',()=>{const s=fixture();assert.equal(operationalSupport(s,{at:'2026-09-13T10:06:00Z'}).groups[0].options.length,0);s.facilities[0].provenance['capabilities.emergencyDepartment'][0].validUntil='2026-09-13T09:59:00Z';assert.equal(accessResilience(s).groups[0].primary.facilityId,'h2');assert.equal(operationalSupport(s,{at:'2026-09-13T10:06:00Z'}).notices.length,0);});
test('population preserves valid zero/year and rejects parish totals and future receipts',()=>{const s=fixture();assert.equal(settlementObjects(s)[0].population.value,0);assert.equal(settlementObjects(s)[0].population.referenceYear,2021);s.places[0].population.geographicUnit='PARISH';assert.equal(settlementObjects(s)[0].population,null);s.places[0].population.geographicUnit='SETTLEMENT';s.places[0].population.retrievedAt='2027-01-01';assert.equal(settlementObjects(s)[0].population,null);});
test('coverage contains measured route relationships rather than invented polygons',()=>{const support=operationalSupport(fixture()),coverage=support.coverage[0];assert.equal(coverage.isochrones,false);assert.equal(coverage.boundary,null);assert.equal(coverage.relationships.length,2);assert.equal(coverage.relationships[0].direction,'FACILITY_TO_SETTLEMENT');assert.equal(coverage.relationships[0].bandMinutes,15);});
test('road dependencies retain route revisions, category, subject and calculation time',()=>{const support=operationalSupport(fixture()),road=support.corridors.find(c=>c.road==='N114');assert.ok(road.routeCount>=3);assert.ok(road.settlementIds.includes('town'));assert.ok(road.relationships.every(r=>r.routeRevision&&r.category&&r.incidentId&&r.calculatedAt===at));assert.ok(support.notices.length<=3);});
test('stale road information suppresses rule notices without hiding calculated routes',()=>{const s=fixture();s.roadCoverage.validUntil='2026-09-13T09:59:00Z';const support=operationalSupport(s);assert.equal(support.notices.length,0);assert.ok(support.groups[0].primary);});
test('community reception never retains expired designation or activation as current',()=>{const s=fixture(),f=s.facilities.find(f=>f.id==='rc');f.coordinate=s.places[0].coordinate;f.fields['activation.state']={state:'RESOLVED'};f.provenance['activation.state']=[{retrievedAt:at,validUntil:'2026-09-13T10:01:00Z'}];s.rankings.activeReception=['rc'];assert.equal(operationalSupport(s).communities[0].nearbyDesignations[0].activationConfirmed,true);assert.equal(operationalSupport(s,{at:'2026-09-13T10:02:00Z'}).communities[0].nearbyDesignations[0].activationConfirmed,false);f.provenance['designation.kind']=[{retrievedAt:at,validUntil:'2026-09-13T10:01:00Z'}];assert.equal(operationalSupport(s,{at:'2026-09-13T10:02:00Z'}).communities[0].nearbyDesignations.length,0);});
test('historical support comparison and causal references follow actual ranking changes',()=>{const before=fixture(),after=scenario(before,{kind:'FACILITY_UNAVAILABLE',entityId:'h1'}).snapshot;const diff=supportComparison(before,after);assert.equal(diff.changes.find(c=>c.category==='emergency_hospital').current.primary,'h2');const events=causalSupportEvents(before,after,[{id:'fact-change',kind:'CAPABILITY_CHANGED',dependencies:['h1']}]);assert.equal(events[0].triggerId,'fact-change');assert.ok(events[0].supportChanges.length);assert.equal(causalSupportEvents(before,after,[{id:'retry',kind:'ROUTE_CHANGED',freshnessOnly:true}]).length,0);});
test('historical comparison resolves route and community names without requiring frontend snapshot context',async()=>{const before=fixture(),after=structuredClone(before);after.id='later';after.knownAt='2026-09-13T10:01:00Z';after.routes[0].travelTimeMinutes=14;after.communityRoutes[0].travelTimeMinutes=16;const service=new SituationService({store:{},knowledge:{}});service.snapshot=async(_id,time)=>({snapshot:time===at?before:after});const result=await service.compare('test',at,after.knownAt);assert.equal(result.material.find(c=>c.kind==='ROUTE_CHANGED').subjectLabel,'h1');assert.equal(result.support.changes.find(c=>c.subjectId==='town').subjectName,'Test settlement');});
test('supported operational questions map to bounded deterministic tools',()=>{
 const ask=new SituationAsk({}),s=fixture();
 for(const [q,tool,args]of [
 ['Which settlements have the longest route to verified emergency healthcare?','getCommunitySupport',{order:'LONGEST_HEALTHCARE'}],
 ['Which communities have only one retained fire-response option?','getCommunitySupport',{filter:'SINGLE_FIRE'}],
 ['Which settlements depend on N114 for their primary hospital route?','getCommunitySupport',{road:'N114'}],
 ['Which settlements have designated reception facilities nearby?','getCommunitySupport',{filter:'RECEPTION'}],
 ['Which hospital routes use N114?','getRoadDependencies',{road:'N114',type:'emergency_hospital'}],
 ['Show operational coverage','getOperationalCoverage',{}],['Show causal timeline','getCausalTimeline',{}]
 ]){const intent=ask.parse(q,s);assert.equal(intent.tool,tool,q);for(const [key,value]of Object.entries(args))assert.equal(intent[key],value,q);}
 const failures=JSON.parse(ask.parse('What if N114 and h2 are unavailable?',s).failures);assert.equal(failures.length,2);
 assert.equal(ask.parse('Show the safest evacuation route',s),null);
});
test('access analog explains retained topology and excludes future captures',()=>{
 const a=fixture(),b=fixture();a.incident.observedAt=at;b.incident.id='past';b.incident.observedAt='2025-09-13';
 const result=historicalAnalogs(a,[b]);assert.ok(result.matches[0].similar.some(x=>x.attribute.includes('calculated options')));
 b.knownAt='2027-01-01';assert.equal(historicalAnalogs(a,[b]).matches.length,0);
});
test('route refresh waits for due work and bounds calls without dropping pending routes',async()=>{
 const s=fixture();let calls=0;const service=new SituationService({store:{},knowledge:{},clock:()=>new Date('2026-09-13T10:06:00Z'),routingAdapter:{route:async()=>{calls++;return {reachability:{checkedAt:'2026-09-13T10:06:01Z',currentRoute:{geometry:s.routes[0].geometry,travelTimeMinutes:5,distanceKm:3,roads:[{ref:'A6'}]}}};}}});
 const refreshed=await service.recalculateRoutes(s,s,'2026-09-13T10:06:00Z');assert.equal(calls,4);assert.equal(refreshed.length,5);assert.equal(service.incidentRoutingPending,true);assert.equal(refreshed.filter(r=>r.calculatedAt==='2026-09-13T10:06:01Z').length,4);
});
test('scoped durable mutations serialize, reject unowned fields and roll back failed mirrors',async()=>{
 let fail=false;const writes=[];const repository=new OperatorStateRepository({filePath:'/unused/scoped.json',writer:async(_path,state)=>writes.push(structuredClone(state)),mirrorStore:{commitOperationalState:async()=>({persisted:!fail})}});
 await Promise.all([repository.mutate(s=>({...s,watchedEventIds:['one']}),{fields:['watchedEventIds'],returnSnapshot:false}),repository.mutate(s=>({...s,evidenceNeeds:[{id:'need'}]}),{fields:['evidenceNeeds'],returnSnapshot:false})]);
 assert.deepEqual(repository.snapshotFields(['watchedEventIds','evidenceNeeds']),{watchedEventIds:['one'],evidenceNeeds:[{id:'need'}]});
 await assert.rejects(repository.mutate(()=>({audit:[]}),{fields:['watchedEventIds']}),/not_owned/);
 fail=true;await assert.rejects(repository.mutate(()=>({watchedEventIds:[]}),{fields:['watchedEventIds']}),/mirror_not_persisted/);
 assert.deepEqual(repository.snapshotFields(['watchedEventIds']).watchedEventIds,['one']);assert.deepEqual(writes.at(-1).watchedEventIds,['one']);
});
test('readiness recognizes authoritative families without promoting fixtures or stale sources',()=>{
 const url='https://official.example/directory',source={url,authority:'GOVERNMENT',provider:'Official directory'},fact={id:'accepted',entityId:'hospital',predicate:'capabilities.emergencyDepartment',value:true,state:'ACCEPTED',source};
 const knowledge={factsByEntity:new Map([['hospital',[fact]]]),sourceCache:new Map([[url,{status:'AVAILABLE',lastFetch:at,pollIntervalMs:86400000}]])};
 assert.deepEqual(operationalSourceFamilies({knowledge,at}).families.map(f=>f.family),['health']);
 fact.universe='CONTROLLED_TEST';assert.equal(operationalSourceFamilies({knowledge,at}).count,0);
 fact.universe='SCENARIO';assert.equal(operationalSourceFamilies({knowledge,at}).count,0);
 fact.universe='OPERATIONAL';knowledge.sourceCache.get(url).lastFetch='2020-01-01';assert.equal(operationalSourceFamilies({knowledge,at}).count,0);
});
