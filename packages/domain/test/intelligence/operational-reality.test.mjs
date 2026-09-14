import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveIncidentCurrentness} from '../../src/operational-twin/incident-currentness.mjs';
import {evaluateTaskRelevance} from '../../src/operational-twin/task-relevance.mjs';
import {operationalMateriality} from '../../src/operational-twin/operational-materiality.mjs';
import {applicableIpmaWarnings} from '../../src/operational-twin/warning-applicability.mjs';
import {weatherMetrics,thermalMetrics} from '../../src/operational-twin/physical-conditions.mjs';
const at='2026-09-14T12:00:00Z',signal=(id,observedAt,type='wildfire.thermal_observation',family='PHYSICAL',payload={})=>({id,eventType:type,source:{sourceId:family==='PHYSICAL'?'nasa-firms':'official',familyClass:family},clocks:{observedAt,ingestedAt:observedAt},payload});
const current=(events,asOf=at)=>deriveIncidentCurrentness({events,asOf});
test('A: current, monitoring, stale, historical and reopened use fire observation clocks only',()=>{
 const old=signal('old','2026-08-20T12:00:00Z');
 assert.equal(current([old],old.clocks.observedAt).state,'CURRENT');
 assert.equal(current([old],'2026-08-22T12:00:00Z').state,'MONITORING');
 assert.equal(current([old],'2026-08-25T12:00:00Z').state,'STALE');
 const weather=signal('weather',at,'wildfire.weather_context','CONTEXT');
 assert.equal(current([old,weather]).state,'HISTORICAL');
 assert.equal(current([old,signal('new',at)]).state,'REOPENED');
 assert.equal(current([old,signal('late','2026-08-21T12:00:00Z')]).state,'HISTORICAL');
 assert.equal(current([old]).resolution,null);
});
test('official resolution is supported; contained is current but not resolved; weather alerts and future receipt do not refresh fire',()=>{
 const old=signal('old','2026-08-20T12:00:00Z');
 assert.equal(current([old,signal('contained',at,'wildfire.official_alert','OFFICIAL',{officialIncidentStatus:'CONTAINED'})]).state,'REOPENED');
 assert.equal(current([old,signal('end',at,'wildfire.official_alert','OFFICIAL',{officialIncidentStatus:'EXTINGUISHED'})]).state,'RESOLVED');
 assert.equal(current([old,{...signal('weather',at,'wildfire.official_alert','OFFICIAL'),hazardType:'heat'}]).state,'HISTORICAL');
 assert.equal(current([old,{...signal('future',at),clocks:{observedAt:at,ingestedAt:'2026-09-15T12:00:00Z'}}]).state,'HISTORICAL');
});
test('B/F: task history survives suspension and reopening; completed work stays completed',()=>{
 const old=signal('old','2026-08-20T12:00:00Z');let task={id:'verify',state:'ACTIVE',attemptHistory:[{attempt:1}]};
 task=evaluateTaskRelevance(task,current([old],old.clocks.observedAt));assert.equal(task.relevance.state,'ACTIVE');
 task=evaluateTaskRelevance(task,current([old]));assert.equal(task.relevance.state,'SUSPENDED');
 task=evaluateTaskRelevance(task,current([old,signal('new',at)]));assert.equal(task.relevance.state,'NEEDS_REVIEW');
 assert.equal(task.relevance.history.length,3);assert.equal(task.attemptHistory.length,1);
 assert.equal(evaluateTaskRelevance({...task,state:'COMPLETED'},current([old,signal('new',at)])).relevance.state,'COMPLETED');
});
test('C: five tiny weather updates remain in audit and become one non-alert attention item',()=>{
 const events=Array.from({length:5},(_,i)=>({id:'w'+i,type:'Weather',source:'IPMA',incidentId:'i',at:`2026-09-14T11:${10+i}:00Z`,comparison:{delta:.1,minutes:1},text:'Temperature increased 0.1 °C.'}));
 const result=operationalMateriality(events,{asOf:at});assert.equal(events.length,5);assert.equal(result.auditCount,5);assert.equal(result.events.length,1);assert.equal(result.events[0].material,false);assert.equal(result.events[0].severity,'INFORMATIONAL');
});
test('D: two national warnings, one intersects the selected point; holes, expiry and source failure are respected',()=>{
 const records=['EVR','BJA'].map(areaId=>({id:areaId,areaId,type:'Heat',level:'yellow',startAt:'2026-09-14T10:00:00Z',endAt:'2026-09-14T18:00:00Z',provenance:{synthetic:false,provider:'IPMA'}})),source={state:'current',lastSuccessAt:at};
 const areas=[{id:'EVR',source:'Geographic fixture',geometry:{type:'Polygon',coordinates:[[[-8,38],[-7,38],[-7,39],[-8,39],[-8,38]]]}}];
 const answer=applicableIpmaWarnings({records,areas,location:[-7.5,38.5],source,asOf:at});assert.equal(records.length,2);assert.equal(answer.warnings.length,1);assert.equal(answer.metric.value,1);assert.match(answer.warnings[0].applicabilityBasis,/inside/);
 assert.equal(applicableIpmaWarnings({records,location:[-7.5,38.5],source,asOf:at}).metric.value,null);
 assert.equal(applicableIpmaWarnings({records,district:'Évora',source:{...source,error:'offline'},asOf:at}).warnings[0].state,'CURRENTNESS_UNAVAILABLE');
});
test('H: received now, observed 47 minutes ago retains observation age; zero rain is valid',()=>{
 const w=weatherMetrics([{source:'IPMA',id:'station',stationName:'Évora',coordinate:[-7.9,38.5],observedAt:'2026-09-14T11:13:00Z',receivedAt:at,temperatureC:22.8,humidityPercent:84,windSpeedKph:13.3,precipitationMm:0}],at,{location:[-7.9,38.5]});
 assert.equal(w.metrics.find(m=>m.id==='temperature').ageMinutes,47);assert.equal(w.metrics.find(m=>m.id==='rain').value,0);
});
test('latest thermal distance differs from nearest; transport duplicates do not inflate counts',()=>{
 const rows=[{id:'a',source:'NASA FIRMS',product:'VIIRS',coordinate:[-7.9,38.5],observedAt:'2026-09-14T11:20:00Z'},{id:'b',source:'NASA FIRMS',product:'VIIRS',coordinate:[-7.8,38.5],observedAt:'2026-09-14T11:50:00Z'}];
 const t=thermalMetrics([...rows,{...rows[1],id:'copy'}],[-7.9,38.5],at);assert.equal(t.detections.length,2);assert.equal(t.metrics.find(m=>m.id==='thermalDistance').value,0);assert.ok(t.metrics.find(m=>m.id==='thermalLatestDistance').value>0);
});
