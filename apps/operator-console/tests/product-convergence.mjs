import test from 'node:test';
import assert from 'node:assert/strict';
import {incidentsFor} from '../src/approved/data/model.js';
import {SignalMetricCard,EnvironmentalConditionsStrip} from '../src/approved/ui/signals.js';
const metric=(id,value,at='2026-09-08T12:00:00Z')=>({id,label:id,value,display:String(value),unit:'',available:true,source:'IPMA',observedAt:at});

test('incident investigation ranks current and candidate records before dated earlier records without changing source order',()=>{
 const incidents=[{id:'old',name:'Earlier',status:'NEEDS_REVALIDATION',observedAt:'2026-09-08T10:00:00Z'},{id:'candidate',name:'Candidate',status:'DETECTION_CANDIDATE',observedAt:'2026-09-07T10:00:00Z'},{id:'closed',name:'Closed',status:'HISTORICAL_CLOSED',observedAt:'2026-09-08T11:00:00Z'},{id:'current',name:'Current',status:'VERIFIED_CURRENT',observedAt:'2026-09-08T09:00:00Z'},{id:'newer',name:'Newer',status:'NEEDS_REVALIDATION',observedAt:'2026-09-08T11:00:00Z'}];
 const original=incidents.map(x=>x.id);assert.deepEqual(incidentsFor({incidents}).map(x=>x.id),['current','candidate','newer','old','closed']);assert.deepEqual(incidents.map(x=>x.id),original);
});
test('ordinary weather and measured zero do not imply danger through their semantic appearance',()=>{
 for(const id of ['temperature','rain','wind','humidity']){const html=SignalMetricCard(metric(id,0));assert.match(html,/signal-blue/);assert.doesNotMatch(html,/signal-red|signal-amber/);assert.match(html,/signal-value">0/);}
 assert.match(SignalMetricCard(metric('fireDanger',3)),/signal-amber/);
});
test('shared measurement context only replaces repeated timestamps when every displayed fact shares the time',()=>{
 const vm={generatedAt:'2026-09-08T12:30:00Z',physical:{metrics:{temperature:metric('temperature',20),wind:metric('wind',4)}}};
 assert.match(EnvironmentalConditionsStrip(vm),/data-shared-observation-time="true"/);
 vm.physical.metrics.wind.observedAt='2026-09-08T11:00:00Z';assert.match(EnvironmentalConditionsStrip(vm),/data-shared-observation-time="false"/);
});
