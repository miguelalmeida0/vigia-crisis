import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeClient,governedIncidentCommandActorAuthorized,governedOperatorConsoleHeaders,governedSessionBootstrapHeaders } from '../../../scripts/command-survival/runtime_client.mjs';
import { Readable } from 'node:stream';
import { loadConfig } from '../src/config/env.mjs';
import { Router } from '../src/http/router.mjs';
import { resolveRequestActor } from '../src/modules/control/request-context.mjs';
import { registerIncidentCommandRoutes } from '../src/modules/incident-command/incident-command-routes.mjs';
import { IncidentCommandService } from '../src/modules/incident-command/incident-command-service.mjs';
import { PostgresIncidentCommandRepository } from '../src/modules/incident-command/postgres-incident-command-repository.mjs';
import { LocalShadowSessionService } from '../src/modules/session/local-shadow-session-service.mjs';
import { registerSessionRoutes } from '../src/modules/session/session-routes.mjs';

const incidentId = 'CSX-auth-regression';
const roles = ['FIREFIGHTER','COMPANY_OFFICER','DIVISION_SUPERVISOR','INCIDENT_COMMAND','DISPATCH_EOC','ACCOUNTABILITY','MAYDAY_RESCUE'];

function response() {
  const headers = new Map();
  return {
    statusCode: null,
    body: '',
    getHeader: (name) => headers.get(name.toLowerCase()),
    setHeader: (name, value) => headers.set(name.toLowerCase(), value),
    writeHead(status, values = {}) { this.statusCode = status; for (const [name, value] of Object.entries(values)) headers.set(name.toLowerCase(), value); },
    end(value = '') { this.body += value; },
  };
}

function request(url, cookie = '',method='GET') {
  return { method,url,headers:{host:'127.0.0.1:4177',...(cookie?{cookie}:{}),...(method==='POST'?{origin:'http://127.0.0.1:4190','sec-fetch-site':'same-origin','x-vigia-operator-intent':'operator-console',authorization:'Bearer operator-runtime-test-token-32-bytes'}:{})},socket:{remoteAddress:'127.0.0.1',encrypted:false} };
}

function runtime() {
  const config=loadConfig({VIGIA_RUNTIME_PROFILE:'local_shadow',VIGIA_LOCAL_OPERATOR_AUTOLOGIN:'1',VIGIA_OPERATOR_TOKEN:'operator-runtime-test-token-32-bytes',HOST:'127.0.0.1',VIGIA_LOCAL_SECRETS_DISABLED:'1'});
  const sessionService=new LocalShadowSessionService(config,{secret:Buffer.alloc(32,9)}),controlService={actor:()=>null};
  const incidentCommandService={
    get:async()=>({schemaVersion:'vigia.incident-command-state.v1',incidentId}),
    events:async()=>({schemaVersion:'vigia.incident-command-event-stream.v1',events:[],verification:{valid:true}}),
    projection:async(_id,role)=>({schemaVersion:'vigia.incident-command-role-projection.v1',role}),
    fallback:async()=>({schemaVersion:'vigia.manual-fallback-export.v1'}),
  };
  const router=new Router();registerSessionRoutes(router,{sessionService,controlService});registerIncidentCommandRoutes(router,{incidentCommandService});
  const dispatch=async(url,cookie='',method='GET')=>{const req=request(url,cookie,method),res=response(),actor=resolveRequestActor(req,controlService,config,sessionService);await router.safeHandle(req,res,{actor});return{status:res.statusCode,body:JSON.parse(res.body),setCookies:res.getHeader('set-cookie')??[]};};
  return{dispatch};
}

test('incident-command stays forbidden without authentication and all governed reads succeed with the real local-shadow session',async()=>{
  const {dispatch}=runtime(),base=`/api/v10/incident-command/incidents/${incidentId}`;
  assert.equal((await dispatch(base)).status,401);
  const inert=await dispatch('/api/v10/session');assert.equal(inert.body.authenticated,false);assert.equal(inert.setCookies.length,0);
  const issued=await dispatch('/api/v10/session','', 'POST');
  assert.equal(issued.status,200);assert.equal(issued.body.actor.name,'Miguel Almeida');assert.equal(issued.body.actor.title,'Shadow Operator');
  assert.ok(issued.setCookies.every((value)=>/HttpOnly/.test(value)));
  const cookie=issued.setCookies.map((value)=>value.split(';')[0]).join('; ');
  assert.equal((await dispatch(base,cookie)).status,200);
  for(const role of roles)assert.equal((await dispatch(`${base}/projections/${role}`,cookie)).status,200);
  assert.equal((await dispatch(`${base}/fallback/ACCOUNTABILITY_ROSTER`,cookie)).status,200);
});

test('remote-shadow session truth is derived from the authenticated environment bearer without a loopback cookie',async()=>{
  const router=new Router(),sessionService={enabled:false,current:()=>null},controlService={actor:()=>null};registerSessionRoutes(router,{sessionService,controlService});
  const actor={id:'remote-operator',name:'Remote Operator',role:'administrator',capabilities:['read:incident_command'],incidentScopes:['*'],authentication:{authenticated:true,mode:'environment_bearer',credentialSource:'authorization_header'}};
  const req={method:'GET',url:'/api/v10/session',headers:{host:'api:4177',authorization:'Bearer redacted'},socket:{remoteAddress:'172.20.0.4'}},res=response();
  await router.safeHandle(req,res,{actor});const body=JSON.parse(res.body);assert.equal(res.statusCode,200);assert.equal(body.authenticated,true);assert.equal(body.mode,'environment_bearer');assert.equal(body.actor.id,'remote-operator');assert.equal(body.sessionId,null);
});

test('runtime verifier retains and propagates the governed session cookie to every protected central request',async()=>{
  const calls=[];let issued=false;
  const actor={id:'miguel-almeida',name:'Miguel Almeida',title:'Shadow Operator',role:'administrator',capabilities:['read:incident_command','command:incident'],incidentScopes:['*'],authentication:{authenticated:true,mode:'local_shadow_session'}};
  const fetchFn=async(url,options={})=>{calls.push({url,method:options.method??'GET',headers:options.headers??{},body:options.body??null});const session=String(url).endsWith('/api/v10/session'),cookie=options.headers?.cookie;if(session&&!issued){assert.equal(options.method,'POST');assert.equal(options.headers?.origin,'http://127.0.0.1:4190');assert.equal(options.headers?.['sec-fetch-site'],'same-origin');assert.deepEqual(JSON.parse(options.body),{intent:'local-shadow-operator-session'});issued=true;return new Response(JSON.stringify({authenticated:true,sessionId:'session-1',actor}),{status:200,headers:[['content-type','application/json'],['set-cookie','vigia_shadow_session=signed; Path=/; HttpOnly; SameSite=Strict']]});}return new Response(JSON.stringify(session?{authenticated:true,sessionId:'session-1',actor}:{schemaVersion:'ok'}),{status:200,headers:{'content-type':'application/json'}});};
  const client=createRuntimeClient({central:'http://127.0.0.1:4177',field:'http://127.0.0.1:4188',operatorToken:'operator-runtime-test-token-32-bytes',fetchFn});
  await client.establishGovernedSession();await client.centralRequest('/api/v10/incident-command/incidents/example');await client.centralRequest('/api/v10/incident-command/incidents/example/events');
  const protectedCalls=calls.filter((item)=>item.url.includes('/incident-command/'));
  assert.equal(protectedCalls.length,2);assert.ok(protectedCalls.every((item)=>item.headers.cookie==='vigia_shadow_session=signed'));assert.ok(protectedCalls.every((item)=>!('authorization' in item.headers)));
  const sessionCalls=calls.filter((item)=>item.url.endsWith('/api/v10/session'));assert.deepEqual(sessionCalls.map((item)=>item.method),['POST','GET']);assert.equal(sessionCalls[1].headers.cookie,'vigia_shadow_session=signed');
  assert.equal(sessionCalls[0].headers.authorization,'Bearer operator-runtime-test-token-32-bytes');
});

test('runtime verifier authorizes explicit incident-command capabilities without an obsolete wildcard capability',()=>{
  const actor={role:'administrator',capabilities:['read:incident_command','command:incident'],incidentScopes:['*'],authentication:{mode:'local_shadow_session'}};
  assert.equal(governedIncidentCommandActorAuthorized(actor),true);
  assert.equal(governedIncidentCommandActorAuthorized({...actor,capabilities:['*']}),false);
  assert.equal(governedIncidentCommandActorAuthorized({...actor,incidentScopes:['incident:one']}),false);
});

test('all runtime certifiers share the governed session bootstrap header contract',()=>{
  const localHeaders={origin:'http://127.0.0.1:4190','sec-fetch-site':'same-origin','x-vigia-ui-proxy':'mission-dark-realdata-2.0'};
  assert.deepEqual(governedOperatorConsoleHeaders({operatorOrigin:'http://127.0.0.1:4190'}),localHeaders);
  assert.deepEqual(governedSessionBootstrapHeaders({operatorOrigin:'http://127.0.0.1:4190',operatorToken:'token-1'}),{...localHeaders,authorization:'Bearer token-1'});
});

test('missing PostGIS degrades incident command without preventing the production shell from starting',async()=>{
  const repository=new PostgresIncidentCommandRepository();
  const status=await repository.initialize();
  assert.equal(status.state,'not_configured');
  assert.equal(status.capability,'incident-command');
  await assert.rejects(()=>repository.state('incident-unavailable'),(error)=>error?.statusCode===503&&error?.code==='incident_command_postgis_unavailable'&&error?.details?.dependency==='postgis');
});

test('incident import preview and confirmation require the dedicated command capability',async()=>{
  let calls=0;
  const router=new Router();registerIncidentCommandRoutes(router,{incidentCommandService:{previewImport:async()=>{calls+=1;return{status:'VALID'};},importIncident:async()=>{calls+=1;return{receipt:{}};}}});
  const dispatch=async(role,path)=>{const body=Buffer.from('{}'),req=Readable.from([body]);Object.assign(req,{method:'POST',url:path,headers:{host:'127.0.0.1:4177','content-type':'application/json','content-length':String(body.length)},socket:{remoteAddress:'127.0.0.1'}});const res=response();await router.safeHandle(req,res,{actor:{id:`actor:${role}`,role,authentication:{authenticated:true}}});return res.statusCode;};
  assert.equal(await dispatch('viewer','/api/v10/incident-command/imports/validate'),403);
  assert.equal(await dispatch('viewer','/api/v10/incident-command/imports'),403);
  assert.equal(calls,0);
  assert.equal(await dispatch('supervisor','/api/v10/incident-command/imports/validate'),200);
  assert.equal(await dispatch('supervisor','/api/v10/incident-command/imports'),201);
  assert.equal(calls,2);
});

test('incident import API returns an explicit durable receipt and invalidates the selected operator projection',async()=>{
  const incidentId='incident:exercise-context',importId='command-import:exercise-context',receivedAt='2026-09-05T16:30:00.000Z';let invalidation=null;
  const service={
    async importIncident(){return{schemaVersion:'vigia.incident-command-import-result.v1',receipt:{duplicate:false,importId,incidentId,sourcePayloadHash:`sha256:${'a'.repeat(64)}`,status:'ACCEPTED',receivedAt},state:{incident:{incidentId,universe:'SHADOW'},lastEventId:'command-event:import'}};},
    async projectionInvalidator(value){invalidation=value;}
  };
  const router=new Router();registerIncidentCommandRoutes(router,{incidentCommandService:service});
  const body=Buffer.from(JSON.stringify({incidentId})),req=Readable.from([body]);Object.assign(req,{method:'POST',url:'/api/v10/incident-command/imports',headers:{host:'127.0.0.1:4177','content-type':'application/json','content-length':String(body.length)},socket:{remoteAddress:'127.0.0.1'}});const res=response();
  await router.safeHandle(req,res,{actor:{id:'operator:supervisor',role:'supervisor',incidentScopes:['*'],authentication:{authenticated:true}}});
  const payload=JSON.parse(res.body);assert.equal(res.statusCode,201);assert.equal(payload.receipt.schemaVersion,'vigia.incident-command-import-receipt.v1');assert.equal(payload.receipt.receiptId,importId);assert.equal(payload.receipt.recordedAt,receivedAt);assert.deepEqual(invalidation,{incidentId,type:'INCIDENT_IMPORTED',eventId:'command-event:import',duplicate:false});
});

test('duplicate import receipts cannot be rebound to another incident or import identity',async()=>{
  let appended=false;
  const repository={initialize:async()=>{},recordImport:async input=>({duplicate:true,importId:'import:prior',incidentId:'incident:prior',sourcePayloadHash:input.sourcePayloadHash,status:'ACCEPTED'}),append:async()=>{appended=true;},state:async()=>null,events:async()=>[],verify:async()=>({valid:true})};
  const service=new IncidentCommandService({repository,releaseId:'release-test',canonicalEventResolver:async id=>({id}),clock:()=>new Date('2026-08-21T12:00:00Z')});
  const raw={adapter:'ROSTER_JSON',universe:'SHADOW',sourceSystem:'MANUAL_IMPORT:ROSTER_JSON:test.json',importId:'import:new',incidentId:'incident:new',canonicalEventIds:['PT-1'],sourcePayload:{incident:{name:'Test'}}};
  await assert.rejects(()=>service.importIncident(raw,'supervisor'),error=>error.statusCode===409&&error.message==='incident_import_receipt_binding_conflict');
  assert.equal(appended,false);
});

test('conflicting duplicate incident import fails before an orphan import receipt can be recorded',async()=>{
  let recorded=false,appended=false;
  const repository={initialize:async()=>{},recordImport:async()=>{recorded=true;},append:async()=>{appended=true;},state:async()=>({incident:{importId:'import:existing',importHash:'different-import-hash'}}),events:async()=>[],verify:async()=>({valid:true})};
  const service=new IncidentCommandService({repository,releaseId:'release-test',canonicalEventResolver:async id=>({id}),clock:()=>new Date('2026-08-21T12:00:00Z')});
  const raw={adapter:'ROSTER_JSON',universe:'SHADOW',sourceSystem:'MANUAL_IMPORT:ROSTER_JSON:test.json',incidentId:'incident:new',canonicalEventIds:['PT-1'],sourcePayload:{incident:{name:'Changed test'}}};
  await assert.rejects(()=>service.importIncident(raw,'supervisor'),error=>error.statusCode===409&&error.message==='duplicate_incident_identity_conflict');
  assert.equal(recorded,false);assert.equal(appended,false);
});

test('incident import receipts reject caller-controlled release provenance before persistence',async()=>{
  let recorded=false,appended=false;
  const repository={initialize:async()=>{},recordImport:async()=>{recorded=true;},append:async()=>{appended=true;},state:async()=>null,events:async()=>[],verify:async()=>({valid:true})};
  const service=new IncidentCommandService({repository,releaseId:'release-test',canonicalEventResolver:async id=>({id}),clock:()=>new Date('2026-08-21T12:00:00Z')});
  const raw={adapter:'ROSTER_JSON',universe:'SHADOW',sourceSystem:'MANUAL_IMPORT:ROSTER_JSON:test.json',incidentId:'incident:new',canonicalEventIds:['PT-1'],releaseId:'caller-controlled-release',sourcePayload:{incident:{name:'Test'}}};
  await assert.rejects(()=>service.importIncident(raw,'supervisor'),error=>error.statusCode===400&&error.message==='incident_import_confirmation_rejected'&&error.details?.rejections?.[0]?.code==='incident_import_release_identity_mismatch');
  assert.equal(recorded,false);assert.equal(appended,false);
});

test('FieldNet offline commands derive authority and truth metadata from the authenticated node principal',async()=>{
  let appended=null,receipt=null;const repository={state:async()=>({incident:{universe:'SHADOW'}}),append:async event=>{appended=event;return{duplicate:false};},recordOfflineReceipt:async input=>{receipt=input;return{duplicate:false};}};
  const service=new IncidentCommandService({repository,releaseId:'release-test',clock:()=>new Date('2026-08-22T12:00:00Z')}),payload={event:{eventId:'offline:event',incidentId:'incident:one',type:'PERSON_UPSERTED',payload:{personId:'person:one'},exercise:false,responsibleOwner:'claimed:chief',verificationState:'VERIFIED',confidence:1,auditReference:'claimed:audit'}},mutation={id:'mutation:offline',incidentId:'incident:one',originNode:'node:one',actor:'fieldnet-node:node:one',type:'COMMAND_SURVIVAL_EVENT',localSequence:1,payload,payloadHash:'sha256:bound'};
  await service.acceptOfflineMutation(mutation);assert.equal(appended.author,'fieldnet-node:node:one');assert.equal(appended.responsibleOwner,'fieldnet-node:node:one');assert.equal(appended.exercise,true);assert.equal(appended.verificationState,'UNVERIFIED');assert.equal(appended.confidence,null);assert.equal(appended.auditReference,null);assert.equal(appended.receivedAt,'2026-08-22T12:00:00.000Z');assert.equal(appended.centralReceivedAt,'2026-08-22T12:00:00.000Z');assert.equal(receipt.mutationId,mutation.id);
});

test('FieldNet offline commands use immutable central receipt time and reject unbounded claimed chronology',async()=>{
  const appended=[],receipts=[],repository={state:async()=>({incident:{universe:'SHADOW'}}),append:async event=>{appended.push(event);return{duplicate:false};},recordOfflineReceipt:async input=>{receipts.push(input);return{duplicate:false};}},service=new IncidentCommandService({repository,releaseId:'release-test',clock:()=>new Date('2026-08-22T12:00:00Z')}),mutation=(id,event)=>({id,incidentId:'incident:one',originNode:'node:one',actor:'fieldnet-node:node:one',type:'COMMAND_SURVIVAL_EVENT',localSequence:1,payload:{event},payloadHash:'sha256:bound',centralReceivedAt:'2026-08-22T12:00:00.000Z',signedRequestAt:'2026-08-22T11:59:59.000Z'});
  const valid=mutation('mutation:valid',{eventId:'offline:valid',incidentId:'incident:one',type:'PERSON_UPSERTED',payload:{personId:'person:one'},observedAt:'2026-08-22T11:58:00Z',receivedAt:'2020-01-01T00:00:00Z'}),result=await service.acceptOfflineMutation(valid);assert.equal(result.state,'APPLIED');assert.equal(appended[0].receivedAt,'2026-08-22T12:00:00.000Z');assert.equal(appended[0].claimedReceivedAt,'2020-01-01T00:00:00Z');assert.equal(appended[0].claimedObservedAt,'2026-08-22T11:58:00Z');
  const future=await service.acceptOfflineMutation(mutation('mutation:future',{eventId:'offline:future',incidentId:'incident:one',type:'PERSON_UPSERTED',payload:{personId:'person:two'},observedAt:'2026-08-22T13:00:00Z'})),ancient=await service.acceptOfflineMutation(mutation('mutation:ancient',{eventId:'offline:ancient',incidentId:'incident:one',type:'PERSON_UPSERTED',payload:{personId:'person:three'},observedAt:'2026-08-20T11:00:00Z'}));assert.equal(future.state,'CONFLICTED');assert.equal(ancient.state,'CONFLICTED');assert.match(future.reason,/offline_observed_at_out_of_bounds/);assert.equal(appended.length,1);assert.deepEqual(receipts.map((item)=>item.state),['APPLIED','CONFLICTED','CONFLICTED']);
});

test('FieldNet durable repository capacity failures become terminal capacity dispositions without a retry backlog',async()=>{
  let receiptWrites=0;const capacityError=Object.assign(new Error('incident_command_projection_capacity_exceeded'),{statusCode:507}),repository={state:async()=>({incident:{universe:'SHADOW'}}),append:async()=>{throw capacityError;},recordOfflineReceipt:async()=>{receiptWrites+=1;}},service=new IncidentCommandService({repository,releaseId:'release-test',clock:()=>new Date('2026-08-22T12:00:00Z')}),payload={event:{eventId:'offline:capacity',incidentId:'incident:one',type:'PERSON_UPSERTED',payload:{personId:'person:one'}}},mutation={id:'mutation:capacity',incidentId:'incident:one',originNode:'node:one',actor:'fieldnet-node:node:one',type:'COMMAND_SURVIVAL_EVENT',localSequence:1,payload,payloadHash:'sha256:bound',centralReceivedAt:'2026-08-22T12:00:00.000Z',signedRequestAt:'2026-08-22T12:00:00.000Z'},result=await service.acceptOfflineMutation(mutation);assert.deepEqual(result,{state:'CAPACITY_REJECTED',eventId:'offline:capacity',reason:'incident_command_projection_capacity_exceeded'});assert.equal(receiptWrites,0);
});

test('a committed offline command remains applied when only receipt accounting reaches capacity',async()=>{
  const capacityError=Object.assign(new Error('incident_command_offline_receipt_capacity_exceeded'),{statusCode:507}),repository={state:async()=>({incident:{universe:'SHADOW'}}),append:async()=>({duplicate:false}),recordOfflineReceipt:async()=>{throw capacityError;}},service=new IncidentCommandService({repository,releaseId:'release-test',clock:()=>new Date('2026-08-22T12:00:00Z')}),payload={event:{eventId:'offline:applied-before-receipt-capacity',incidentId:'incident:one',type:'PERSON_UPSERTED',payload:{personId:'person:one'}}},mutation={id:'mutation:applied-before-receipt-capacity',incidentId:'incident:one',originNode:'node:one',actor:'fieldnet-node:node:one',type:'COMMAND_SURVIVAL_EVENT',localSequence:1,payload,payloadHash:'sha256:bound',centralReceivedAt:'2026-08-22T12:00:00.000Z',signedRequestAt:'2026-08-22T12:00:00.000Z'},result=await service.acceptOfflineMutation(mutation);assert.deepEqual(result,{state:'APPLIED',eventId:'offline:applied-before-receipt-capacity',duplicate:false,receiptState:'CAPACITY_REJECTED'});
});

test('ordinary authenticated location reports cannot self-assert checkpoint confirmation',async()=>{
  let appended=null;const repository={state:async()=>({incident:{universe:'SHADOW'}}),append:async(event)=>{appended=event;return event;}};
  const service=new IncidentCommandService({repository,releaseId:'release-test',clock:()=>new Date('2026-08-22T12:00:00Z')}),payload={personId:'person:one',verificationState:'CONFIRMED',geometry:{type:'Point',coordinates:[-8,40]},source:'RADIO',checkpointId:'invented:checkpoint',observerId:'invented:observer'};
  await assert.rejects(()=>service.execute('incident:one',{type:'LOCATION_REPORTED',payload,verificationState:'VERIFIED'},'operator:scoped'),/confirmed_location_transition_required/);assert.equal(appended,null);
  await service.execute('incident:one',{type:'LOCATION_REPORTED',payload:{...payload,verificationState:'REPORTED'}},'operator:scoped');assert.equal(appended.verificationState,'UNVERIFIED');assert.equal(appended.payload.verificationState,'REPORTED');assert.equal(appended.payload.observerId,'operator:scoped');assert.equal(appended.payload.claimedObserverId,'invented:observer');
});
