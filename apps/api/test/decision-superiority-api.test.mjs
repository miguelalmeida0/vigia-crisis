import test from 'node:test';
import assert from 'node:assert/strict';
import { CanonicalOperatorApiService } from '../src/modules/operator/canonical-operator-api-service.mjs';
import { OperationalIntelligenceService } from '../src/modules/intelligence/operational-intelligence-service.mjs';
import { MemoryOperationalEventJournal } from '../src/modules/intelligence/memory-event-journal.mjs';
import { ShiftHandoffService } from '../src/modules/operator/shift-handoff-service.mjs';
import { PostgresIntelligenceRepository } from '../src/modules/intelligence/postgres-intelligence-repository.mjs';
import { boundedDecisionResponse,compactDecisionIntelligence } from '../src/modules/operator/decision-intelligence-projection.mjs';
import { projectDecisionSuperiority } from '../../../packages/domain/src/operational-twin/decision-superiority.mjs';
import { policyForRoute } from '../src/http/route-security-policy.mjs';
import { at,actor,registry,event,health,requirement } from '../../../packages/domain/test/intelligence/operational-intelligence-fixture.mjs';

async function harness(){
  const clock=()=>new Date(at(10));
  const source=new OperationalIntelligenceService({journal:new MemoryOperationalEventJournal({clock}),sourceRegistry:registry(),clock,currentTwinCacheMs:0});
  // Event knowledge time is the journal commit time, not a backdated observedAt.
  let minute=0;const journalClock=()=>new Date(at(minute));
  const history=new OperationalIntelligenceService({journal:new MemoryOperationalEventJournal({clock:journalClock}),sourceRegistry:registry(),clock:journalClock,currentTwinCacheMs:0});
  await history.ingestOperationalEvent(event('thermal',0));minute=5;await history.ingestOperationalEvent(event('optical',5));await history.ingestOperationalEvent(health('UNAVAILABLE',5));
  let recoveryReads=0;
  const services={operationalIntelligenceService:history,operationalRecoveryService:{async project(twin){recoveryReads++;return{truth:{incidents:[]},sourceResolution:{jobs:[]},informationCollection:{requirements:[requirement()]},humanAttention:{items:[]},healthAxes:{}};}}};
  return {api:new CanonicalOperatorApiService({services,clock}),services,history,source,recoveryReads:()=>recoveryReads};
}

test('authenticated query reconstructs T1 without T2 evidence, source failure or current work joins',async()=>{
  const h=await harness(),result=await h.api.decisionQuery(actor,{question:'Why is this incident unconfirmed?',incidentId:'incident:test-fire',asOf:at(2)});
  assert.equal(result.asOf,at(2));assert.match(result.results[0].summary,/not independently confirmed/);
  assert.equal(result.evidenceIds.length,1);assert.equal(h.recoveryReads(),0);
  const current=await h.api.decisionQuery(actor,{question:'Why is this incident unconfirmed?',incidentId:'incident:test-fire'});
  assert.match(current.results[0].summary,/Independent physical/);
  assert.ok(h.recoveryReads()>0);
  await assert.rejects(()=>h.api.decisionQuery(actor,{question:'Why?',asOf:at(11)}),/time_invalid/);
  await assert.rejects(()=>h.api.decisionQuery({...actor,capabilities:['read:incident_command']},{question:'Why?',asOf:at(2)}),/forbidden/);
  await assert.rejects(()=>h.api.decisionQuery(actor,{question:'Why?',incidentId:'incident:foreign'}),/scope_forbidden/);
});

test('counterfactual API is read-only and unsupported targets cannot escape incident scope',async()=>{
  const h=await harness(),before=JSON.stringify(await h.history.getCurrentTwin());
  const result=await h.api.decisionQuery(actor,{incidentId:'incident:test-fire',assumption:{kind:'SOURCE_FAILURE',entityId:'source:thermal'}});
  assert.equal(result.productionMutated,false);assert.equal(JSON.stringify(await h.history.getCurrentTwin()),before);
  await assert.rejects(()=>h.api.decisionQuery(actor,{assumption:{kind:'SOURCE_FAILURE',entityId:'source:foreign'}}),/out_of_scope/);
  for(const route of ['/api/v10/operator/intelligence-query','/api/v10/operator/intelligence-counterfactual'])assert.equal(policyForRoute('GET',route).capability,'read:incident_command');
});

test('shift briefing is durable, scoped and does not acknowledge itself',async()=>{
  const h=await harness();let state={shiftHandoffs:[],audit:[]};
  const repository={snapshot:()=>structuredClone(state),async mutate(fn){state=fn(structuredClone(state));}};
  const handoff=new ShiftHandoffService({repository,operationalIntelligenceService:h.history,operationalRecoveryService:h.services.operationalRecoveryService,clock:()=>new Date(at(6))});
  const record=await handoff.create(actor,{summary:'Isolated test handoff',since:at(0)});
  assert.equal(record.acknowledgedAt,null);assert.equal(record.intelligenceBrief.schemaVersion,'vigia.decision-superiority.v2');
  assert.deepEqual(record.scopeIncidentIds,['incident:test-fire']);assert.equal(handoff.list({...actor,incidentScopes:['incident:foreign']}).handoffs.length,0);
  assert.equal(state.shiftHandoffs[0].intelligenceBrief.asOf,at(5));
});

test('native decision history joins exact immutable snapshots with incident and knowledge-time predicates',async()=>{
  let sql,params;const pool={on(){},async query(query,args){sql=query;params=args;return{rows:[]};}};
  const repository=new PostgresIntelligenceRepository({pool});repository.ready=true;repository.health.state='ready';
  assert.deepEqual(await repository.decisionContexts('incident:test-fire',{asOf:at(2)}),[]);
  assert.match(sql,/s.snapshot_version=d.snapshot_version AND s.incident_id=d.incident_id/);
  assert.match(sql,/d.created_at<=\$2::timestamptz AND s.generated_at<=d.created_at/);
  assert.deepEqual(params,['incident:test-fire',at(2)]);assert.match(sql,/LIMIT 20/);
  await assert.rejects(()=>repository.decisionContexts('incident:test-fire',{asOf:'invalid'}),/clock_required/);
});

test('query response bounds deeply nested references with explicit totals',()=>{
  const input={results:[{evidenceIds:Array.from({length:1000},(_,i)=>`e:${i}`),paths:Array.from({length:1000},(_,i)=>({id:i}))}]};
  const output=boundedDecisionResponse(input);assert.equal(output.results[0].evidenceIds.length,20);assert.equal(output.results[0].evidenceIdsTotal,1000);
  assert.equal(input.results[0].evidenceIds.length,1000);assert.ok(JSON.stringify(output).length<2000);
});

test('immutable decision history is independent of current projection and source-refresh availability',async()=>{
  const api=new CanonicalOperatorApiService({clock:()=>new Date(at(10)),services:{
    operationalIntelligenceService:{async getCurrentTwin(){assert.fail('History must not await current source refresh');},async getTwinAsOf(){assert.fail('Immutable context already has its own knowledge time');}},
    repository:{snapshot:()=>({humanAttentionActions:[]})},intelligenceService:{async decisionContexts(user,id,{asOf}){assert.equal(user,actor);assert.equal(id,'incident:test-fire');assert.equal(asOf,at(2));return[];}}
  }});
  const result=await api.decisionQuery(actor,{history:true,incidentId:'incident:test-fire',asOf:at(2)});
  assert.equal(result.asOf,at(2));assert.equal(result.nativeHistoryState,'READY');assert.deepEqual(result.decisions,[]);
});

test('bounded display totals preserve full governed counts, including nested upstream lineage gaps',async()=>{
  const h=await harness(),p=projectDecisionSuperiority({twin:await h.history.getCurrentTwin(),actor});
  p.graph.coverage.unknownUpstreamSources=Array.from({length:260},(_,i)=>({taskId:`task:${i}`}));
  p.assessments=Array.from({length:30},()=>p.assessments[0]);
  const wire=compactDecisionIntelligence(p);
  assert.equal(wire.assessments.length,3);assert.equal(wire.assessmentsTotal,30);
  assert.equal(wire.graph.coverage.unknownUpstreamSources.length,20);assert.equal(wire.graph.coverage.unknownUpstreamSourcesTotal,260);
  assert.equal(boundedDecisionResponse(wire).graph.coverage.unknownUpstreamSourcesTotal,260);
});
