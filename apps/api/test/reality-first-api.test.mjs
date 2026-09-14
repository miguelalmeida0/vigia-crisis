import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStations, normalizeWarnings } from '../src/modules/world/ipma-gateway.mjs';
import { LiveSourceGateway } from '../src/modules/world/live-source-gateway.mjs';
import { withOperatorIntelligence } from '../src/modules/operator/operator-intelligence-projection.mjs';
import { decisionIntelligenceQuery } from '../src/modules/operator/decision-intelligence-service.mjs';
import { appendOperationalActivity } from '../src/modules/operator/physical-activity.mjs';

const now='2026-09-08T12:00:00.000Z',clock=()=>new Date(now);
test('physical operations history includes dated authorized human actions and excludes evaluation ticks, future and foreign scope',()=>{
  const physical={asOf:now,activity:[],incidents:[{incidentId:'incident:one',locationLabel:'Test incident',changes:[]}]};
  const data={humanAttention:{state:'READY',value:{items:[{id:'owned',incidentId:'incident:one',state:'OWNED',lastUpdatedAt:now,title:'Verify access'},{id:'computed',incidentId:'incident:one',state:'EVALUATED',lastUpdatedAt:now}]}},responseOperations:{state:'READY',value:{activity:[{id:'field',incidentId:'incident:one',eventType:'FIELD_REPORT',at:now,summary:'Access reported blocked'},{id:'foreign',incidentId:'incident:two',eventType:'TASK_ASSIGNED',at:now},{id:'future',incidentId:'incident:one',eventType:'TASK_COMPLETED',at:'2026-09-09T00:00:00Z'}]}}};
  const result=appendOperationalActivity(physical,data,{incidentScopes:['incident:one']},'incident:one');
  assert.deepEqual(result.activity.map(e=>e.id),['owned','field']);assert.equal(result.activity[1].type,'Field report');assert.equal(result.incidents[0].changes.length,2);
});
test('IPMA directions follow the documented 1=N 8=NW 0=unknown contract and clocks stay distinct',()=>{
  const features=[0,1,8,9].map(code=>({geometry:{type:'Point',coordinates:[-8,40]},properties:{idEstacao:code,idDireccVento:code,descDirVento:'',time:'2026-09-08T10:00:00',temperatura:28,humidade:30,precAcumulada:0}}));
  const out=normalizeStations({type:'FeatureCollection',features},null,now);assert.deepEqual(out.map(r=>r.windDirection),[null,'N','NW','N']);assert.equal(out[0].observedAt,'2026-09-08T10:00:00.000Z');assert.equal(out[0].receivedAt,now);assert.equal(out[0].measurementDefinitions.rain.periodMinutes,60);
});
test('warning validity never becomes an issuance or observation clock',()=>{const [w]=normalizeWarnings([{idAreaAviso:'BGC',startTime:now,endTime:'2026-09-11T12:00:00Z'}],null,now);assert.equal(w.issuedAt,null);assert.equal(w.observedAt,undefined);assert.equal(w.receivedAt,now);assert.equal(w.endAt,'2026-09-11T12:00:00.000Z');});
const result=id=>({id,data:[],state:{id,state:'current',lastSuccessAt:now}});
const pt=()=>Object.fromEntries(['fires','riskToday','riskTomorrow','weather','warnings','history'].map(id=>[id,result(id)]));
test('one failed provider cannot erase successful peers; circuit opens and recovers',async()=>{
  let at=Date.parse(now),calls=0,failed=true;
  const gateway=new LiveSourceGateway({clock:()=>new Date(at),policy:{deadlineMs:20,openAfterFailures:2,cooldownMs:50},ptdata:{snapshot:async()=>pt()},ipma:{snapshot:async()=>{calls++;if(failed)throw new Error('offline');return {ipmaWeather:result('ipmaWeather'),ipmaWarnings:result('ipmaWarnings')};}},copernicus:{snapshot:async()=>result('copernicus')},firms:{snapshot:async()=>result('firms')}});
  const first=await gateway.snapshot();assert.equal(first.ipmaWeather.state.state,'unavailable');assert.equal(first.fires.state.state,'current');assert.equal(first.firms.state.state,'current');
  await gateway.snapshot();await gateway.snapshot();assert.equal(calls,2,'circuit suppresses repeated requests');
  at+=51;failed=false;const recovered=await gateway.snapshot();assert.equal(recovered.ipmaWeather.state.state,'current');assert.equal(recovered.ipmaWeather.state.circuit,'CLOSED');
});
test('a hung provider hits a deadline without overlapping retries or blocking weather',async()=>{
  const gateway=new LiveSourceGateway({clock,policy:{deadlineMs:10},ptdata:{snapshot:async()=>pt()},ipma:{snapshot:async()=>({ipmaWeather:result('ipmaWeather'),ipmaWarnings:result('ipmaWarnings')})},copernicus:{snapshot:()=>new Promise(()=>{})},firms:{snapshot:async()=>result('firms')}});
  const p=await gateway.snapshot();assert.equal(p.copernicus.state.state,'unavailable');assert.equal(p.ipmaWeather.state.state,'current');const p2=await gateway.snapshot();assert.match(p2.copernicus.state.error,/overlapping acquisition suppressed/);
});
test('national observations survive incident reasoning failure without inventing incidents',()=>{
  const p=withOperatorIntelligence({},null,{incidentScopes:['*']},null,null,{meta:{mode:'production',generatedAt:now},sources:{ipmaWarnings:{state:'current',lastSuccessAt:now}},directWarnings:[]},now);
  assert.equal(p.physicalWorld.state,'DEGRADED');assert.equal(p.physicalWorld.value.incidents.length,0);assert.equal(p.physicalWorld.value.summary.find(m=>m.id==='activeWarnings').value,0);
});
test('physical Ask keeps authorization and historical cache isolation',async()=>{
  const actor={id:'operator',role:'supervisor',permissions:['read:incident_command','read:replay'],incidentScopes:['incident:one']};
  const twin={asOf:now,incidents:[{incident:{id:'incident:one',location:{geometry:{type:'Point',coordinates:[-8,40]}}}}]};let cacheReads=0;
  const ctx={actor,clock,currentTwin:async()=>twin,services:{worldService:{snapshot:async()=>{cacheReads++;return null;}},operationalIntelligenceService:{getTwinAsOf:async at=>({...twin,asOf:at})}}};
  const live=await decisionIntelligenceQuery(ctx,{incidentId:'one',question:"What don't we know?"});assert.match(live.primaryAnswer,/Current weather.*unknown/);assert.equal(cacheReads,1);
  const past=await decisionIntelligenceQuery(ctx,{incidentId:'one',question:'What are conditions there?',asOf:'2026-09-08T11:00:00Z'});assert.match(past.primaryAnswer,/unknown/);assert.equal(cacheReads,1);assert.match(past.historicalWorkBoundary,/present-day source caches/);
  await assert.rejects(()=>decisionIntelligenceQuery(ctx,{incidentId:'two',question:'What are conditions there?'}),e=>e.statusCode===403);
});
