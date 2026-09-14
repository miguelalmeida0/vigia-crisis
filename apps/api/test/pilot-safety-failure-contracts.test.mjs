import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeLoader } from '../../operator-console/src/runtimeLoader.js';
import { renderFieldNet } from '../../operator-console/src/routes/fieldnet.js';
import { renderSourceHealth } from '../../operator-console/src/routes/sourceHealth.js';

const event={id:'PT-1',label:'Portugal incident',coordinate:[-8,40],physicalState:{freshness:'current'}};
const baseState=()=>({selectedEventId:'PT-1',selectedFindingId:null,selectedReplayCaseId:null,pilotImportReceipts:[],runtime:{status:'ready',health:{ok:true},session:{authenticated:true,sessionId:'session:one'},bootstrap:{sources:{}},events:{events:[event],sources:{}},fieldnet:{state:'ready',cursor:'12'},dependencies:{health:{state:'READY',lastSuccessAt:'2026-08-22T09:00:00Z'},bootstrap:{state:'READY',lastSuccessAt:'2026-08-22T09:00:00Z'},events:{state:'READY',lastSuccessAt:'2026-08-22T09:00:00Z'},fieldnet:{state:'READY',lastSuccessAt:'2026-08-22T09:00:00Z'}},eventDetails:{},fieldnetIncidents:{},commandIncidents:{}}});
const api=(overrides={})=>({health:async()=>({ok:true}),session:async()=>({authenticated:true,sessionId:'session:one',actor:{capabilities:['read:evidence']}}),bootstrap:async()=>({sources:{}}),events:async()=>({events:[event],sources:{}}),commandBootstrap:async()=>({}),territory:async()=>({}),replay:async()=>({cases:[]}),alerts:async()=>({alerts:[]}),operationsStatus:async()=>({overallStatus:'NOT_CONFIGURED'}),fieldnet:async()=>({state:'ready',cursor:'13'}),detectionBenchmark:async()=>({}),preventionConsensus:async()=>({zones:[]}),operationsTerritories:async()=>({territories:[]}),operationsAssets:async()=>({assets:[]}),operationsRoster:async()=>({people:[]}),evidenceNeeds:async()=>({needs:[]}),evidenceRequests:async()=>({requests:[]}),...overrides});
const loader=(state,client)=>createRuntimeLoader({state,api:client,render:()=>{},persist:()=>{},loadEvent:async()=>{},loadFinding:async()=>{},loadReplayCase:async()=>{}});

test('failed event refresh preserves cache only as explicit STALE last-known state',async()=>{
  const state=baseState(),prior=state.runtime.events,refresh=loader(state,api({events:async()=>{throw new Error('controlled_event_failure');}}));
  const result=await refresh();
  assert.equal(result.requiredSuccess,false);assert.equal(state.runtime.status,'degraded');assert.deepEqual(state.runtime.events,prior);assert.equal(state.runtime.dependencies.events.state,'STALE');assert.equal(state.runtime.dependencies.events.failureClass,'controlled_event_failure');assert.ok(state.runtime.dependencies.events.lastGoodAt);assert.match(state.runtime.error,/STALE/);
});

test('failed central FieldNet read cannot retain a current-ready claim',async()=>{
  const state=baseState(),refresh=loader(state,api({fieldnet:async()=>{throw new Error('controlled_fieldnet_failure');}}));
  const result=await refresh();
  assert.equal(result.requiredSuccess,true);assert.equal(state.runtime.fieldnet.cursor,'12');assert.equal(state.runtime.dependencies.fieldnet.state,'STALE');assert.equal(state.runtime.dependencies.fieldnet.failureClass,'controlled_fieldnet_failure');
  const html=renderFieldNet(state);assert.match(html,/STALE — NOT CURRENT/);assert.doesNotMatch(html,/Central connectivity available/);
});

test('critical refreshes are single-flight and visible pending controls are disabled',async()=>{
  let healthCalls=0,releaseHealth;const waitHealth=new Promise((resolve)=>{releaseHealth=resolve;}),state=baseState(),refresh=loader(state,api({health:async()=>{healthCalls+=1;await waitHealth;return{ok:true};}}));
  const first=refresh(),second=refresh();await Promise.resolve();assert.equal(healthCalls,1);releaseHealth();await Promise.all([first,second]);
  state.runtime.pendingOperations={sourceRefresh:true,fieldnetRefresh:true};
  const sourceHtml=renderSourceHealth(state),fieldHtml=renderFieldNet(state);assert.match(sourceHtml,/Refresh pending…/);assert.match(sourceHtml,/disabled/);assert.match(fieldHtml,/PENDING — CURRENT STATE NOT YET PROVEN/);assert.match(fieldHtml,/disabled/);
});

test('remote-shadow environment bearer continuity enables governed mutations without a browser secret',async()=>{
  const state=baseState(),remote={enabled:true,authenticated:true,sessionId:null,mode:'environment_bearer',actor:{id:'remote-operator',capabilities:['read:evidence','request:evidence'],authentication:{authenticated:true,mode:'environment_bearer'}}},refresh=loader(state,api({createSession:async()=>remote,session:async()=>structuredClone(remote)}));
  await refresh();assert.equal(state.runtime.session.mode,'environment_bearer');assert.equal(state.runtime.session.mutationReady,true);
});

test('remote-shadow bearer continuity fails closed when the authenticated actor changes',async()=>{
  const state=baseState(),issued={enabled:true,authenticated:true,sessionId:null,mode:'environment_bearer',actor:{id:'remote-a',authentication:{authenticated:true,mode:'environment_bearer'}}},confirmed={...issued,actor:{...issued.actor,id:'remote-b'}},refresh=loader(state,api({createSession:async()=>issued,session:async()=>confirmed}));
  await refresh();assert.equal(state.runtime.session.mutationReady,false);
});
