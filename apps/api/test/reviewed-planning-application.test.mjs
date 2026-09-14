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
const proposalVersionFor=(proposalType,boundHash,sourceHash=sourceProjectionHash)=>semanticHash('crisis-planning-proposal-version',{incidentId,proposalType,proposalHash:boundHash,sourceProjectionHash:sourceHash,compiledAgainstIntentHash});
const proposalVersion=proposalVersionFor('OPERATIONAL_PERIOD',proposalHash);
const planningGeneratedAt='2026-09-04T09:55:00.000Z';
const authorizationActor={id:'operator:supervisor',role:'supervisor',capabilities:['command:incident'],incidentScopes:[incidentId],authentication:{authenticated:true}};
const planningProjection=(overrides={})=>({
  schemaVersion:'vigia.crisis-planning-projection.v1',incidentId,generatedAt:planningGeneratedAt,projectionHash:planningProjectionHash,sourceProjectionHash,
  proposalReviewBindings:{OPERATIONAL_PERIOD:{proposalType:'OPERATIONAL_PERIOD',section:'operationalPeriodProposal',state:'CURRENT_REVIEWABLE_PROPOSAL',sectionState:'READY_FOR_HUMAN_APPROVAL',proposalHash,proposalVersion,generatedAt:planningGeneratedAt,expiresAt:'2026-09-04T10:25:00.000Z',sourceProjectionHash,compiledAgainstIntentHash}},
  operationalPeriodProposal:{state:'READY_FOR_HUMAN_APPROVAL',value:{operationalPeriodId:'period:one',periodStart:'2026-09-04T10:00:00.000Z',periodEnd:'2026-09-04T14:00:00.000Z',owners:['Incident Commander'],deadlines:['2026-09-04T13:00:00.000Z'],objectives:[{objectiveId:'objective:one',statement:'Protect the north community.',target:'North community',owner:'Incident Commander',deadline:'2026-09-04T13:00:00.000Z'}],assignments:[{assignmentId:'assignment:proposal-only'}],proposalHash}},...overrides
});

const planningProjectionFor=({proposalType,section,sectionState,proposalHash:boundHash,proposal})=>({
  schemaVersion:'vigia.crisis-planning-projection.v1',incidentId,generatedAt:planningGeneratedAt,projectionHash:planningProjectionHash,sourceProjectionHash,
  proposalReviewBindings:{[proposalType]:{proposalType,section,state:'CURRENT_REVIEWABLE_PROPOSAL',sectionState,proposalHash:boundHash,proposalVersion:proposalVersionFor(proposalType,boundHash),generatedAt:planningGeneratedAt,expiresAt:'2026-09-04T10:25:00.000Z',sourceProjectionHash,compiledAgainstIntentHash}},
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

test('reviewed resource, replan, evacuation, and protection proposals apply only as bounded planning artifacts',async(t)=>{
  const cases=[
    {
      proposalType:'RESOURCE_RECOMMENDATION',section:'resourceOptimizer',sectionState:'RECOMMENDATIONS_READY_FOR_APPROVAL',proposalHash:`resource-optimizer-proposal:sha256:${'1'.repeat(64)}`,
      proposal:{recommendations:[{recommendationId:'recommendation:one',facilityId:'station:one',resourceType:'WILDFIRE_CREWS',recommendedQuantity:2,owner:'Logistics lead',deadline:'2026-09-04T10:30:00.000Z',capacityObservedAt:'2026-09-04T09:58:00.000Z',routeCheckedAt:'2026-09-04T09:59:00.000Z',proposedStaging:{state:'GOVERNED_CANDIDATE',facilityId:'station:one'},crewStatus:{state:'ATTRIBUTABLE_CURRENT_REPORT'},coverage:{state:'ROUTED_TIME_AVAILABLE'},candidateConstraints:[]}],remainingUncoveredDemand:[]},
      expectedSchema:'vigia.applied-resource-planning-artifact.v1',expectedState:'APPROVED_RESOURCE_REQUESTS_NOT_SENT',resourceRequests:1,
    },
    {
      proposalType:'AUTONOMOUS_REPLAN',section:'autonomousReplanning',sectionState:'NEW_PLAN_READY_FOR_APPROVAL',proposalHash:`autonomous-replan-proposal:sha256:${'2'.repeat(64)}`,
      proposal:{oldPlan:{assignments:[{id:'assignment:one',facilityId:'station:old'}]},newPlan:{assignments:[{id:'assignment:one',facilityId:'station:new',state:'PROPOSED_REPLAN',execution:false}]},whatChanged:[{path:'assignments.assignment:one',requiresApproval:true}],triggers:[{source:{reference:'evidence:resource-unavailable'}}]},
      expectedSchema:'vigia.applied-replan-artifact.v1',expectedState:'APPROVED_PLAN_REVISION_NOT_EXECUTED',resourceRequests:0,
    },
    {
      proposalType:'EVACUATION_CORRIDOR',section:'evacuationCorridor',sectionState:'READY_FOR_AUTHORITY_REVIEW',proposalHash:`evacuation-corridor-proposal:sha256:${'3'.repeat(64)}`,
      proposal:{scenario:{scenarioId:'scenario:one',validUntil:'2026-09-04T11:00:00.000Z'},recommendedCorridor:{routeId:'route:one',eligible:true,updatedAt:'2026-09-04T09:58:00.000Z',shelterUpdatedAt:'2026-09-04T09:57:00.000Z',constraintAssessment:{state:'ELIGIBLE',assessments:['TERRAIN','WEATHER','RESOURCE'].map(axis=>({axis,state:'CLEAR',eligible:true,records:[{state:'CLEAR',updatedAt:'2026-09-04T09:58:00.000Z',source:{attributable:true,sourceId:`${axis.toLowerCase()}:source`,reference:`evidence:${axis.toLowerCase()}`}}]}))}},alternativeCorridors:[],decisionDeadline:'2026-09-04T10:30:00.000Z',planningOnly:true,officialOrder:false},
      expectedSchema:'vigia.applied-evacuation-planning-artifact.v1',expectedState:'APPROVED_CORRIDOR_PLANNING_ONLY',resourceRequests:0,
    },
    {
      proposalType:'PROTECTION_TIMELINE',section:'protectionTimeline',sectionState:'ADMITTED_SCENARIO_WINDOWS_AVAILABLE',proposalHash:`protection-bubble-timeline:sha256:${'4'.repeat(64)}`,
      proposal:{scenario:{scenarioId:'scenario:one',admissionReference:'admission:one',validUntil:'2026-09-04T11:00:00.000Z'},windows:[{minutes:15,state:'SCENARIO_AVAILABLE',scenarioExposure:{communityId:'community:one'},admissionReference:'admission:one',evidenceReferences:['evidence:window:15'],source:{attributable:true,sourceId:'scenario:source',reference:'evidence:scenario'},computedAt:'2026-09-04T09:59:00.000Z',calculationMethod:'ADMITTED_SCENARIO_WINDOW',confidence:{state:'SCENARIO_CONFIDENCE'},requiredPreparation:['Prepare review.'],decisionDeadline:'2026-09-04T10:20:00.000Z'}]},
      expectedSchema:'vigia.applied-protection-planning-artifact.v1',expectedState:'APPROVED_PROTECTION_READINESS_PLANNING_ONLY',resourceRequests:0,
    },
  ];
  for(const item of cases)await t.test(item.proposalType,async()=>{
    const store=repository(),projection=planningProjectionFor(item),currentProposalVersion=projection.proposalReviewBindings[item.proposalType].proposalVersion,service=new IncidentCommandService({repository:store,releaseId:'release:test',clock:()=>now,planningProjectionResolver:async()=>projection});
    const reviewed=await service.recordPlanningDecision(incidentId,{idempotencyKey:`review-${item.proposalType}`,proposalType:item.proposalType,proposalHash:item.proposalHash,proposalVersion:currentProposalVersion,planningProjectionHash,planningGeneratedAt,sourceProjectionHash,decision:'APPROVE_FOR_PLANNING',reason:'Approve the exact current proposal inside its planning-only boundary.'},'operator:supervisor',authorizationActor),decisionId=reviewed.receipt.decisionId;
    await assert.rejects(()=>service.applyReviewedPlan(incidentId,{decisionId,idempotencyKey:`missing-boundary-${item.proposalType}`},'operator:supervisor',authorizationActor),error=>error.statusCode===400&&error.message==='planning_only_application_boundary_acknowledgement_required');
    const applied=await service.applyReviewedPlan(incidentId,{decisionId,idempotencyKey:`apply-${item.proposalType}`,applicationBoundary:'APPLY_REVIEWED_PLANNING_ONLY'},'operator:supervisor',authorizationActor),artifact=Object.values(applied.planningArtifacts)[0],application=Object.values(applied.planningApplications)[0];
    assert.equal(applied.receipt.schemaVersion,'vigia.planning-application-receipt.v2');
    assert.equal(artifact.schemaVersion,item.expectedSchema);
    assert.equal(artifact.state,item.expectedState);
    assert.equal(artifact.execution,false);
    assert.equal(artifact.dispatchClaimed,false);
    assert.equal(Object.keys(applied.resourceRequests).length,item.resourceRequests);
    assert.equal(Object.keys(applied.assignments).length,0);
    assert.equal(application.assignmentsCreated,0);
    assert.equal(application.resourceRequestsSent,0);
    assert.equal(application.resourcesDispatched,0);
    assert.equal(application.evacuationOrdersIssued,0);
    assert.equal(application.protectionAuthoritiesGranted,0);
    assert.equal(application.warningsSent,0);
    assert.equal(application.authority.boundary,'PLANNING_ONLY_NO_CONSEQUENTIAL_AUTHORITY');
    if(item.proposalType==='RESOURCE_RECOMMENDATION'){
      const request=Object.values(applied.resourceRequests)[0];
      assert.equal(request.state,'PLANNING_APPROVED_NOT_REQUESTED');
      assert.equal(request.requestSent,false);
      assert.equal(request.assignmentCreated,false);
    }
    const replay=await service.applyReviewedPlan(incidentId,{decisionId,idempotencyKey:`apply-${item.proposalType}`,applicationBoundary:'APPLY_REVIEWED_PLANNING_ONLY'},'operator:supervisor',authorizationActor);
    assert.equal(replay.receipt.idempotentReplay,true);
    assert.equal(store.events.filter(event=>event.type==='PLANNING_PROPOSAL_APPLIED').length,1);
  });
});

test('reviewed planning application fails closed when current capacity evidence has aged out',async()=>{
  const item={proposalType:'RESOURCE_RECOMMENDATION',section:'resourceOptimizer',sectionState:'RECOMMENDATIONS_READY_FOR_APPROVAL',proposalHash:`resource-optimizer-proposal:sha256:${'5'.repeat(64)}`,proposal:{recommendations:[{recommendationId:'recommendation:stale',facilityId:'station:stale',resourceType:'WILDFIRE_CREWS',recommendedQuantity:1,owner:'Logistics lead',deadline:'2026-09-04T10:30:00.000Z',capacityObservedAt:'2026-09-04T09:20:00.000Z',routeCheckedAt:'2026-09-04T09:59:00.000Z'}]}},store=repository(),projection=planningProjectionFor(item),currentProposalVersion=projection.proposalReviewBindings[item.proposalType].proposalVersion,service=new IncidentCommandService({repository:store,releaseId:'release:test',clock:()=>now,planningProjectionResolver:async()=>projection});
  const reviewed=await service.recordPlanningDecision(incidentId,{idempotencyKey:'review-stale-resource',proposalType:item.proposalType,proposalHash:item.proposalHash,proposalVersion:currentProposalVersion,planningProjectionHash,planningGeneratedAt,sourceProjectionHash,decision:'APPROVE_FOR_PLANNING',reason:'Exercise the fail-closed freshness boundary.'},'operator:supervisor',authorizationActor);
  await assert.rejects(()=>service.applyReviewedPlan(incidentId,{decisionId:reviewed.receipt.decisionId,idempotencyKey:'apply-stale-resource',applicationBoundary:'APPLY_REVIEWED_PLANNING_ONLY'},'operator:supervisor',authorizationActor),error=>error.statusCode===409&&error.message==='planning_resource_recommendation_contract_invalid');
  assert.equal(store.events.filter(event=>event.type==='PLANNING_PROPOSAL_APPLIED').length,0);
  assert.equal(Object.keys((await store.state(incidentId)).resourceRequests).length,0);
});
