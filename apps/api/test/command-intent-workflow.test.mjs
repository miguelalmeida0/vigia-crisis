import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { Router } from '../src/http/router.mjs';
import { registerIncidentCommandRoutes } from '../src/modules/incident-command/incident-command-routes.mjs';
import { IncidentCommandService } from '../src/modules/incident-command/incident-command-service.mjs';
import { applyIncidentCommandEvent,emptyIncidentState } from '../../../packages/domain/src/incident-command/reducer.mjs';
import { semanticHash } from '../../../packages/domain/src/intelligence/shared.mjs';

const incidentId='incident:command-intent-exercise';
const now=new Date('2026-09-04T10:00:00.000Z');
const proposalHash=`operational-period-proposal:sha256:${'a'.repeat(64)}`;
const planningProjectionHash=`crisis-planning-projection:sha256:${'c'.repeat(64)}`;
const sourceProjectionHash=`canonical-governed-operator-twin:sha256:${'d'.repeat(64)}`;
const compiledAgainstIntentHash=`command-intent:sha256:${'e'.repeat(64)}`;
const proposalVersionFor=(sourceHash=sourceProjectionHash)=>semanticHash('crisis-planning-proposal-version',{incidentId,proposalType:'OPERATIONAL_PERIOD',proposalHash,sourceProjectionHash:sourceHash,compiledAgainstIntentHash});
const proposalVersion=proposalVersionFor();
const planningGeneratedAt='2026-09-04T09:55:00.000Z';
const authorizationActor={id:'operator:supervisor',role:'supervisor',capabilities:['command:incident'],incidentScopes:[incidentId],authentication:{authenticated:true}};
const periodBounds={periodStart:'2026-09-04T10:30:00.000Z',periodEnd:'2026-09-04T13:00:00.000Z'};
const planningProjection=(overrides={})=>({
  schemaVersion:'vigia.crisis-planning-projection.v1',incidentId,generatedAt:planningGeneratedAt,projectionHash:planningProjectionHash,sourceProjectionHash,
  proposalReviewBindings:{OPERATIONAL_PERIOD:{proposalType:'OPERATIONAL_PERIOD',section:'operationalPeriodProposal',state:'CURRENT_REVIEWABLE_PROPOSAL',sectionState:'READY_FOR_HUMAN_APPROVAL',proposalHash,proposalVersion,generatedAt:planningGeneratedAt,expiresAt:'2026-09-04T10:25:00.000Z',sourceProjectionHash,compiledAgainstIntentHash}},
  operationalPeriodProposal:{state:'READY_FOR_HUMAN_APPROVAL',value:{operationalPeriodId:'period:one',periodStart:'2026-09-04T10:00:00.000Z',periodEnd:'2026-09-04T14:00:00.000Z',owners:['Incident Commander'],deadlines:['2026-09-04T13:00:00.000Z'],objectives:[{objectiveId:'objective:one',statement:'Protect the north community.',target:'North community',owner:'Incident Commander',deadline:'2026-09-04T13:00:00.000Z'}],assignments:[{assignmentId:'assignment:proposal-only'}],proposalHash}},...overrides
});

const planningProjectionFor=({proposalType,section,sectionState,proposalHash:boundHash,proposal})=>({
  schemaVersion:'vigia.crisis-planning-projection.v1',incidentId,generatedAt:planningGeneratedAt,projectionHash:planningProjectionHash,sourceProjectionHash,
  proposalReviewBindings:{[proposalType]:{proposalType,section,state:'CURRENT_REVIEWABLE_PROPOSAL',sectionState,proposalHash:boundHash,proposalVersion,generatedAt:planningGeneratedAt,expiresAt:'2026-09-04T10:25:00.000Z',sourceProjectionHash,compiledAgainstIntentHash}},
  [section]:{state:sectionState,value:{...proposal,proposalHash:boundHash}},
});

function repository(){
  let state=emptyIncidentState(incidentId);
  state.incident={incidentId,universe:'SHADOW',canonicalEventIds:[incidentId],lastUpdatedAt:now.toISOString()};
  const events=[];
  return{
    state:async id=>id===incidentId?structuredClone(state):null,
    append:async event=>{events.push(structuredClone(event));state=applyIncidentCommandEvent(state,event);return structuredClone(state);},
    recentEvents:async()=>({events:structuredClone(events),page:{returned:events.length}}),
    verifyHead:async()=>({valid:true}),
    events
  };
}

function response(){
  const headers=new Map();
  return{statusCode:null,body:'',getHeader:name=>headers.get(name.toLowerCase()),setHeader:(name,value)=>headers.set(name.toLowerCase(),value),writeHead(status,values={}){this.statusCode=status;for(const[name,value]of Object.entries(values))headers.set(name.toLowerCase(),value);},end(value=''){this.body+=value;}};
}

async function dispatch(router,{actor,body={},path=`/api/v10/incident-command/incidents/${encodeURIComponent(incidentId)}/intents`}={}){
  const bytes=Buffer.from(JSON.stringify(body)),req=Readable.from([bytes]);
  Object.assign(req,{method:'POST',url:path,headers:{host:'127.0.0.1:4177','content-type':'application/json','content-length':String(bytes.length)},socket:{remoteAddress:'127.0.0.1'}});
  const res=response();
  await router.safeHandle(req,res,{actor});
  return{status:res.statusCode,payload:JSON.parse(res.body)};
}

test('confirmed command intent is actor-bound, durable, and never applies planning mutations',async()=>{
  const store=repository(),service=new IncidentCommandService({repository:store,releaseId:'release:test',clock:()=>now});
  const input={idempotencyKey:'intent-one',intentType:'PROTECT_AREA',statement:'Protect the north community while preserving responder access.',target:'North community',owner:'Incident Commander',deadline:'2026-09-04T14:00:00Z',...periodBounds,protectionMessage:{whatHappened:'An admitted incident requires a bounded draft.',whatToDo:'Await an authorized instruction.'},resourceRequirements:[{id:'need:crews',requiredKind:'FIRE_STATION',requiredResourceType:'WILDFIRE_CREWS',requiredQuantity:2,minimumCrewSize:4,stagingRequired:true}]},result=await service.proposeCommandIntent(incidentId,input,'operator:supervisor',authorizationActor);
  assert.equal(result.commandIntent.requestedBy,'operator:supervisor');
  assert.equal(result.commandIntent.confirmation.confirmedBy,'operator:supervisor');
  assert.equal(result.commandIntent.state,'CONFIRMED_FOR_COMPILATION');
  assert.equal(result.commandIntent.periodStart,periodBounds.periodStart);
  assert.equal(result.commandIntent.periodEnd,periodBounds.periodEnd);
  assert.equal(result.commandIntent.periodBoundarySource,'OPERATOR_SUPPLIED_COMMAND_INTENT');
  assert.equal(result.commandIntent.mutationsApplied,false);
  assert.equal(result.commandIntent.protectionMessage.whatHappened,input.protectionMessage.whatHappened);
  assert.equal(result.commandIntent.resourceRequirements[0].requiredQuantity,2);
  assert.equal(result.commandIntent.resourceRequirements[0].minimumCrewSize,4);
  assert.equal(result.commandIntent.resourceRequirements[0].stagingRequired,true);
  assert.equal(Object.keys(result.objectives).length,0);
  assert.equal(Object.keys(result.assignments).length,0);
  assert.equal(Object.keys(result.resourceRequests).length,0);
  assert.equal(store.events[0].type,'COMMAND_INTENT_PROPOSED');
  assert.equal(result.receipt.schemaVersion,'vigia.command-intent-receipt.v1');
  assert.equal(result.receipt.eventId,store.events[0].eventId);
  assert.equal(result.receipt.idempotencyKey,'intent-one');
  assert.equal(result.receipt.idempotentReplay,false);
  assert.match(result.commandIntent.truthBoundary,/does not approve/i);
  const replayed=await service.proposeCommandIntent(incidentId,input,'operator:supervisor',authorizationActor);
  assert.equal(replayed.receipt.idempotentReplay,true);
  assert.equal(store.events.filter(event=>event.type==='COMMAND_INTENT_PROPOSED').length,1);
  await assert.rejects(()=>service.proposeCommandIntent(incidentId,{...input,target:'Different target'},'operator:supervisor',authorizationActor),error=>error.statusCode===409&&error.message==='command_intent_idempotency_conflict');
  await assert.rejects(()=>service.proposeCommandIntent(incidentId,{...input,periodEnd:'2026-09-04T13:30:00.000Z'},'operator:supervisor',authorizationActor),error=>error.statusCode===409&&error.message==='command_intent_idempotency_conflict');
});

test('command intent rejects unsupported effects and non-future deadlines before append',async()=>{
  const store=repository(),service=new IncidentCommandService({repository:store,releaseId:'release:test',clock:()=>now});
  await assert.rejects(()=>service.proposeCommandIntent(incidentId,{idempotencyKey:'unsupported',intentType:'DISPATCH_NOW',statement:'Dispatch.',target:'Area',owner:'Commander',deadline:'2026-09-04T14:00:00Z',...periodBounds},'operator:supervisor',authorizationActor),error=>error.statusCode===400&&error.message==='command_intent_type_unsupported');
  await assert.rejects(()=>service.proposeCommandIntent(incidentId,{idempotencyKey:'past-deadline',intentType:'VERIFY_ROUTE',statement:'Verify route.',target:'Route N2',owner:'Commander',deadline:'2026-09-04T09:59:59Z',...periodBounds},'operator:supervisor',authorizationActor),error=>error.statusCode===400&&error.message==='command_intent_future_deadline_required');
  await assert.rejects(()=>service.proposeCommandIntent(incidentId,{intentType:'VERIFY_ROUTE',statement:'Verify route.',target:'Route N2',owner:'Commander',deadline:'2026-09-04T14:00:00Z',...periodBounds},'operator:supervisor',authorizationActor),error=>error.statusCode===400&&error.message==='command_intent_idempotency_key_required');
  await assert.rejects(()=>service.proposeCommandIntent(incidentId,{idempotencyKey:'invalid-quantity',intentType:'VERIFY_ROUTE',statement:'Verify route.',target:'Route N2',owner:'Commander',deadline:'2026-09-04T14:00:00Z',...periodBounds,resourceRequirements:[{requiredKind:'FIRE_STATION',requiredQuantity:0}]},'operator:supervisor',authorizationActor),error=>error.statusCode===400&&error.message==='command_intent_requiredQuantity_invalid');
  await assert.rejects(()=>service.proposeCommandIntent(incidentId,{idempotencyKey:'missing-start',intentType:'VERIFY_ROUTE',statement:'Verify route.',target:'Route N2',owner:'Commander',deadline:'2026-09-04T14:00:00Z',periodEnd:periodBounds.periodEnd},'operator:supervisor',authorizationActor),error=>error.statusCode===400&&error.message==='command_intent_period_start_required');
  await assert.rejects(()=>service.proposeCommandIntent(incidentId,{idempotencyKey:'invalid-order',intentType:'VERIFY_ROUTE',statement:'Verify route.',target:'Route N2',owner:'Commander',deadline:'2026-09-04T14:00:00Z',periodStart:'2026-09-04T13:00:00.000Z',periodEnd:'2026-09-04T12:00:00.000Z'},'operator:supervisor',authorizationActor),error=>error.statusCode===400&&error.message==='command_intent_period_chronology_invalid');
  await assert.rejects(()=>service.proposeCommandIntent(incidentId,{idempotencyKey:'past-start',intentType:'VERIFY_ROUTE',statement:'Verify route.',target:'Route N2',owner:'Commander',deadline:'2026-09-04T14:00:00Z',periodStart:'2026-09-04T09:59:00.000Z',periodEnd:'2026-09-04T12:00:00.000Z'},'operator:supervisor',authorizationActor),error=>error.statusCode===400&&error.message==='command_intent_period_start_in_past');
  assert.equal(store.events.length,0);
});

test('command-intent and planning-review services fail closed without authenticated command authority and exact incident scope',async()=>{
  const service=new IncidentCommandService({repository:repository(),releaseId:'release:test',clock:()=>now,planningProjectionResolver:async()=>planningProjection()}),intent={idempotencyKey:'authority-intent',intentType:'VERIFY_ROUTE',statement:'Verify route.',target:'Route N2',owner:'Commander',deadline:'2026-09-04T14:00:00Z',...periodBounds},review={idempotencyKey:'authority-review',proposalType:'OPERATIONAL_PERIOD',proposalHash,proposalVersion,planningProjectionHash,planningGeneratedAt,sourceProjectionHash,decision:'REJECT',reason:'Authority boundary test.'};
  await assert.rejects(()=>service.proposeCommandIntent(incidentId,intent,'operator:supervisor'),error=>error.statusCode===403);
  await assert.rejects(()=>service.recordPlanningDecision(incidentId,review,'operator:supervisor'),error=>error.statusCode===403);
  await assert.rejects(()=>service.recordPlanningDecision(incidentId,review,'operator:supervisor',{...authorizationActor,incidentScopes:['incident:other']}),error=>error.statusCode===403&&error.message==='incident_scope_forbidden');
});

test('planning review server-resolves and binds one exact current proposal without applying it',async()=>{
  const store=repository(),service=new IncidentCommandService({repository:store,releaseId:'release:test',clock:()=>now,planningProjectionResolver:async()=>planningProjection()});
  const result=await service.recordPlanningDecision(incidentId,{idempotencyKey:'review-one',proposalType:'OPERATIONAL_PERIOD',proposalHash,proposalVersion,planningProjectionHash,planningGeneratedAt,sourceProjectionHash,decision:'APPROVE_FOR_PLANNING',reason:'The attributed objective, owner, and deadline are ready for command review.'},'operator:supervisor',authorizationActor);
  const decision=Object.values(result.decisions)[0];
  assert.equal(decision.proposalHash,proposalHash);
  assert.equal(decision.decidedBy,'operator:supervisor');
  assert.equal(decision.state,'APPROVED_FOR_PLANNING_ONLY');
  assert.equal(decision.mutationsApplied,false);
  assert.equal(decision.dispatchClaimed,false);
  assert.equal(decision.authorityGranted,false);
  assert.equal(decision.proposalVersion,proposalVersion);
  assert.equal(decision.planningProjectionHash,planningProjectionHash);
  assert.equal(decision.sourceProjectionHash,sourceProjectionHash);
  assert.equal(result.receipt.state,'PERSISTED');
  assert.equal(Object.keys(result.assignments).length,0);
  assert.equal(Object.keys(result.resourceRequests).length,0);
  assert.match(decision.truthBoundary,/does not mutate/i);
});

test('planning review accepts unrelated whole-projection recompilation only when the exact proposal binding is unchanged',async()=>{
  const recompiledHash=`crisis-planning-projection:sha256:${'9'.repeat(64)}`,store=repository(),service=new IncidentCommandService({repository:store,releaseId:'release:test',clock:()=>now,planningProjectionResolver:async()=>planningProjection({projectionHash:recompiledHash})});
  const result=await service.recordPlanningDecision(incidentId,{idempotencyKey:'review-recompiled',proposalType:'OPERATIONAL_PERIOD',proposalHash,proposalVersion,planningProjectionHash,planningGeneratedAt,sourceProjectionHash,decision:'APPROVE_FOR_PLANNING',reason:'The exact proposal binding remains current after unrelated sections recompiled.'},'operator:supervisor',authorizationActor),decision=Object.values(result.decisions)[0];
  assert.equal(decision.submittedPlanningProjectionHash,planningProjectionHash);
  assert.equal(decision.planningProjectionHash,recompiledHash);
  assert.equal(decision.planningProjectionRecompiled,true);
  assert.equal(decision.proposalHash,proposalHash);
  assert.equal(decision.proposalVersion,proposalVersion);
  assert.equal(decision.sourceProjectionHash,sourceProjectionHash);
});

test('reviewed planning application revalidates a changed source projection when the exact proposal and intent binding remain unchanged',async()=>{
  const refreshedSourceHash=`canonical-governed-operator-twin:sha256:${'8'.repeat(64)}`,refreshedVersion=proposalVersionFor(refreshedSourceHash),store=repository();
  let resolutionCount=0;
  const projectionForSource=(sourceHash,version)=>{
    const projection=planningProjection();
    return{...projection,sourceProjectionHash:sourceHash,projectionHash:`crisis-planning-projection:sha256:${resolutionCount.toString(16).padStart(64,'0')}`,proposalReviewBindings:{...projection.proposalReviewBindings,OPERATIONAL_PERIOD:{...projection.proposalReviewBindings.OPERATIONAL_PERIOD,sourceProjectionHash:sourceHash,proposalVersion:version}}};
  };
  const service=new IncidentCommandService({repository:store,releaseId:'release:test',clock:()=>now,planningProjectionResolver:async()=>++resolutionCount===1?projectionForSource(sourceProjectionHash,proposalVersion):projectionForSource(refreshedSourceHash,refreshedVersion)});
  const reviewed=await service.recordPlanningDecision(incidentId,{idempotencyKey:'review-source-revalidation',proposalType:'OPERATIONAL_PERIOD',proposalHash,proposalVersion,planningProjectionHash,planningGeneratedAt,sourceProjectionHash,decision:'APPROVE_FOR_PLANNING',reason:'Review the exact current operational-period proposal.'},'operator:supervisor',authorizationActor),decisionId=reviewed.receipt.decisionId;
  const applied=await service.applyReviewedPlan(incidentId,{decisionId,idempotencyKey:'apply-source-revalidation'},'operator:supervisor',authorizationActor);
  assert.equal(applied.receipt.state,'PERSISTED');
  assert.equal(applied.decisions[decisionId].mutationsApplied,true);
  assert.equal(Object.keys(applied.operationalPeriods).length,1);
  assert.equal(Object.values(applied.planningApplications)[0].sourceProjectionRevalidated,true);
  assert.equal(Object.values(applied.planningApplications)[0].sourceProjectionHash,sourceProjectionHash);
  assert.equal(Object.values(applied.planningApplications)[0].revalidatedSourceProjectionHash,refreshedSourceHash);
});

test('planning review rejects forged, stale, and other-incident proposal bindings',async()=>{
  const input={idempotencyKey:'review-invalid',proposalType:'OPERATIONAL_PERIOD',proposalHash,proposalVersion,planningProjectionHash,planningGeneratedAt,sourceProjectionHash,decision:'REJECT',reason:'Binding verification test.'};
  const forged=new IncidentCommandService({repository:repository(),releaseId:'release:test',clock:()=>now,planningProjectionResolver:async()=>planningProjection()});
  await assert.rejects(()=>forged.recordPlanningDecision(incidentId,{...input,proposalHash:`operational-period-proposal:sha256:${'f'.repeat(64)}`},'operator:supervisor',authorizationActor),error=>error.statusCode===409&&error.message==='planning_proposal_hash_mismatch');
  const stale=new IncidentCommandService({repository:repository(),releaseId:'release:test',clock:()=>new Date('2026-09-04T11:00:00.000Z'),planningProjectionResolver:async()=>planningProjection()});
  await assert.rejects(()=>stale.recordPlanningDecision(incidentId,input,'operator:supervisor',authorizationActor),error=>error.statusCode===409&&error.message==='planning_proposal_expired');
  const other=new IncidentCommandService({repository:repository(),releaseId:'release:test',clock:()=>now,planningProjectionResolver:async()=>planningProjection({incidentId:'incident:other'})});
  await assert.rejects(()=>other.recordPlanningDecision(incidentId,input,'operator:supervisor',authorizationActor),error=>error.statusCode===409&&error.message==='planning_proposal_incident_mismatch');
});

test('planning review and explicit authority-gated apply are receipt-backed and idempotent',async()=>{
  const store=repository(),service=new IncidentCommandService({repository:store,releaseId:'release:test',clock:()=>now,planningProjectionResolver:async()=>planningProjection()}),reviewInput={idempotencyKey:'review-apply',proposalType:'OPERATIONAL_PERIOD',proposalHash,proposalVersion,planningProjectionHash,planningGeneratedAt,sourceProjectionHash,decision:'APPROVE_FOR_PLANNING',reason:'Apply only the reviewed period and objective.'};
  const reviewed=await service.recordPlanningDecision(incidentId,reviewInput,'operator:supervisor',authorizationActor),decisionId=reviewed.receipt.decisionId;
  const replayedReview=await service.recordPlanningDecision(incidentId,reviewInput,'operator:supervisor',authorizationActor);
  assert.equal(replayedReview.receipt.idempotentReplay,true);
  assert.equal(store.events.filter(event=>event.type==='DECISION_RECORDED').length,1);
  const applied=await service.applyReviewedPlan(incidentId,{decisionId,idempotencyKey:'apply-one'},'operator:supervisor',authorizationActor);
  assert.equal(applied.receipt.state,'PERSISTED');
  assert.equal(Object.keys(applied.operationalPeriods).length,1);
  assert.equal(Object.keys(applied.objectives).length,1);
  assert.equal(Object.keys(applied.assignments).length,0);
  assert.equal(Object.keys(applied.resourceRequests).length,0);
  assert.equal(applied.decisions[decisionId].state,'APPLIED_TO_CANONICAL_PLAN');
  assert.equal(applied.decisions[decisionId].mutationsApplied,true);
  const replayedApply=await service.applyReviewedPlan(incidentId,{decisionId,idempotencyKey:'apply-one'},'operator:supervisor',authorizationActor);
  assert.equal(replayedApply.receipt.idempotentReplay,true);
  assert.equal(store.events.filter(event=>event.type==='PLANNING_PROPOSAL_APPLIED').length,1);
});
