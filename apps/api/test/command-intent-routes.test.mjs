import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { Router } from '../src/http/router.mjs';
import { registerIncidentCommandRoutes } from '../src/modules/incident-command/incident-command-routes.mjs';
import { IncidentCommandService } from '../src/modules/incident-command/incident-command-service.mjs';
import { applyIncidentCommandEvent,emptyIncidentState } from '../../../packages/domain/src/incident-command/reducer.mjs';

const incidentId='incident:command-intent-exercise';
const now=new Date('2026-09-04T10:00:00.000Z');
const proposalHash=`operational-period-proposal:sha256:${'a'.repeat(64)}`;
const proposalVersion=`crisis-planning-proposal-version:sha256:${'b'.repeat(64)}`;
const planningProjectionHash=`crisis-planning-projection:sha256:${'c'.repeat(64)}`;
const sourceProjectionHash=`canonical-governed-operator-twin:sha256:${'d'.repeat(64)}`;
const planningGeneratedAt='2026-09-04T09:55:00.000Z';
const authorizationActor={id:'operator:supervisor',role:'supervisor',capabilities:['command:incident'],incidentScopes:[incidentId],authentication:{authenticated:true}};
const planningProjection=(overrides={})=>({
  schemaVersion:'vigia.crisis-planning-projection.v1',incidentId,generatedAt:planningGeneratedAt,projectionHash:planningProjectionHash,sourceProjectionHash,
  proposalReviewBindings:{OPERATIONAL_PERIOD:{proposalType:'OPERATIONAL_PERIOD',section:'operationalPeriodProposal',state:'CURRENT_REVIEWABLE_PROPOSAL',sectionState:'READY_FOR_HUMAN_APPROVAL',proposalHash,proposalVersion,generatedAt:planningGeneratedAt,expiresAt:'2026-09-04T10:25:00.000Z',sourceProjectionHash,compiledAgainstIntentHash:`command-intent:sha256:${'e'.repeat(64)}`}},
  operationalPeriodProposal:{state:'READY_FOR_HUMAN_APPROVAL',value:{operationalPeriodId:'period:one',periodStart:'2026-09-04T10:00:00.000Z',periodEnd:'2026-09-04T14:00:00.000Z',owners:['Incident Commander'],deadlines:['2026-09-04T13:00:00.000Z'],objectives:[{objectiveId:'objective:one',statement:'Protect the north community.',target:'North community',owner:'Incident Commander',deadline:'2026-09-04T13:00:00.000Z'}],assignments:[{assignmentId:'assignment:proposal-only'}],proposalHash}},...overrides
});

const planningProjectionFor=({proposalType,section,sectionState,proposalHash:boundHash,proposal})=>({
  schemaVersion:'vigia.crisis-planning-projection.v1',incidentId,generatedAt:planningGeneratedAt,projectionHash:planningProjectionHash,sourceProjectionHash,
  proposalReviewBindings:{[proposalType]:{proposalType,section,state:'CURRENT_REVIEWABLE_PROPOSAL',sectionState,proposalHash:boundHash,proposalVersion,generatedAt:planningGeneratedAt,expiresAt:'2026-09-04T10:25:00.000Z',sourceProjectionHash,compiledAgainstIntentHash:`command-intent:sha256:${'e'.repeat(64)}`}},
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

test('command-intent route enforces command authority and incident scope',async()=>{
  const calls=[],router=new Router();
  registerIncidentCommandRoutes(router,{incidentCommandService:{proposeCommandIntent:async(id,input,actor)=>{calls.push({id,input,actor});return{schemaVersion:'vigia.command-intent-receipt.v1'};}}});
  const body={idempotencyKey:'intent-route-one',intentType:'VERIFY_ROUTE',statement:'Verify access.',target:'Route N2',owner:'Commander',deadline:'2026-09-04T14:00:00Z'},authenticated={authentication:{authenticated:true},incidentScopes:[incidentId]};
  assert.equal((await dispatch(router,{actor:{...authenticated,id:'viewer:1',role:'viewer'},body})).status,403);
  assert.equal((await dispatch(router,{actor:{...authenticated,id:'supervisor:1',role:'supervisor'},body})).status,201);
  assert.deepEqual(calls,[{id:incidentId,input:body,actor:'supervisor:1'}]);
  assert.equal((await dispatch(router,{actor:{...authenticated,id:'supervisor:2',role:'supervisor',incidentScopes:['incident:other']},body})).status,403);
});

test('reviewed-plan apply route passes the authenticated authority context and fails closed by role/scope',async()=>{
  const calls=[],router=new Router(),decisionId='planning-decision-route';
  registerIncidentCommandRoutes(router,{incidentCommandService:{applyReviewedPlan:async(id,input,actorId,authority)=>{calls.push({id,input,actorId,authority});return{schemaVersion:'vigia.planning-application-receipt.v1'};}}});
  const path=`/api/v10/incident-command/incidents/${encodeURIComponent(incidentId)}/planning-decisions/${decisionId}/apply`,body={idempotencyKey:'apply-route-one'},authenticated={authentication:{authenticated:true},incidentScopes:[incidentId]};
  assert.equal((await dispatch(router,{path,actor:{...authenticated,id:'viewer:1',role:'viewer'},body})).status,403);
  const supervisor={...authenticated,id:'supervisor:1',role:'supervisor'};
  assert.equal((await dispatch(router,{path,actor:supervisor,body})).status,201);
  assert.equal(calls.length,1);
  assert.equal(calls[0].id,incidentId);
  assert.deepEqual(calls[0].input,{...body,decisionId});
  assert.equal(calls[0].actorId,'supervisor:1');
  assert.equal(calls[0].authority,supervisor);
  assert.equal((await dispatch(router,{path,actor:{...supervisor,id:'supervisor:2',incidentScopes:['incident:other']},body})).status,403);
});

