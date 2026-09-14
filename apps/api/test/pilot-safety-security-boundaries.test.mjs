import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdir,mkdtemp,rm } from 'node:fs/promises';
import path from 'node:path';
import { Router } from '../src/http/router.mjs';
import { policyForRoute } from '../src/http/route-security-policy.mjs';
import { registerRoutes } from '../src/application/register-routes.mjs';
import { resolveRequestActor } from '../src/modules/control/request-context.mjs';
import { CentralFieldNetService } from '../src/modules/fieldnet/central-fieldnet-service.mjs';
import { CurrentImageryService } from '../src/modules/observations/current-imagery-service.mjs';
import { FieldSensorGateway } from '../../field-node/src/sensor-gateway.mjs';
import { FieldRequestVerifier,signFieldRequest,signFieldResponse,verifyFieldResponse } from '../../../packages/domain/src/fieldnet/request-auth.mjs';
import { canonical,sha256 } from '../../../packages/domain/src/fieldnet/contracts.mjs';
import { fetchRaw } from '../src/shared/fetch.mjs';
import { ThermalWmsAdapter } from '../src/modules/world/adapters/thermal-wms-adapter.mjs';
import { BasemapService } from '../src/modules/basemap/basemap-service.mjs';

const response=()=>({statusCode:null,body:'',headers:{},setHeader(name,value){this.headers[name]=value;},writeHead(status,headers={}){this.statusCode=status;Object.assign(this.headers,headers);},end(value=''){this.body+=value;}});
const servicesProxy=()=>new Proxy({}, {get:(object,key)=>object[key]??(object[key]=new Proxy(()=>{}, {get:(target,property)=>target[property]??(target[property]=()=>({})),apply:()=>({})}))});

test('all registered routes carry complete explicit policy and unknown routes default deny',()=>{
  const router=new Router();registerRoutes(router,{services:servicesProxy(),hub:{size:0,add(){}},runtime:{},sessionService:{},releaseIdentityService:{identity:()=>({releaseId:'test'})}});
  const routes=router.routes();
  const routeSignatures=new Set(routes.map((item)=>`${item.method} ${item.path}`));
  assert.equal(routeSignatures.size,routes.length);
  assert.equal(routeSignatures.has('GET /api/v10/operator/incidents/:incidentId/response-capability'),true);
  for(const {method,path,policy} of routes){assert.ok(policy,`${method} ${path}`);for(const key of ['boundary','authentication','incidentScoped','mutationIntent','redaction','audit'])assert.notEqual(policy[key],undefined,`${method} ${path} missing ${key}`);}
  assert.throws(()=>policyForRoute('POST','/api/v10/unclassified-danger'),/route_security_policy_missing/);
  assert.equal(policyForRoute('GET','/api/v10/alerts').authentication,'required');
  assert.equal(policyForRoute('GET','/api/v10/prevention/findings').authentication,'required');
  assert.equal(policyForRoute('GET','/api/v2/audit').capability,'read:audit');
  assert.equal(policyForRoute('POST','/api/v10/fieldnet/sync').boundary,'signed-field-node');
  assert.equal(policyForRoute('GET','/api/v1/basemap/:kind/:z/:x/:y').localVisualization,true);
  assert.equal(policyForRoute('GET','/api/v10/events/thermal/overlay').localVisualization,true);
  assert.equal(policyForRoute('GET','/api/v10/fieldnet/capacity-admissions/status').capability,'read:fieldnet');
  assert.equal(policyForRoute('POST','/api/v10/fieldnet/capacity-admissions').capability,'fieldnet:capacity-admit');
  assert.equal(policyForRoute('POST','/api/v10/fieldnet/capacity-admissions/revocations').capability,'fieldnet:capacity-admit');
});

test('life-safety command route rejects missing authentication, exact capability, scope and mutation intent',async()=>{
  const router=new Router(),calls=[];router.post('/api/v10/incident-command/incidents/:incidentId/commands',async({res,context})=>{calls.push(context.actor.id);res.writeHead(201);res.end('{}');});
  const dispatch=async(actor,{intent=true,headers={}}={})=>{const req=Readable.from([]);Object.assign(req,{method:'POST',url:'/api/v10/incident-command/incidents/incident%3Aone/commands',headers:{host:'127.0.0.1',...(intent?{'x-vigia-operator-intent':'operator-console'}:{}),...headers},socket:{remoteAddress:'127.0.0.1'}});const res=response();await router.safeHandle(req,res,{actor});return res.statusCode;};
  assert.equal(await dispatch({id:'anonymous',role:'public_viewer',authentication:{authenticated:false}}),401);
  assert.equal(await dispatch({id:'supervisor',role:'supervisor',capabilities:['read:incident_command'],incidentScopes:['incident:one'],authentication:{authenticated:true}}),403);
  assert.equal(await dispatch({id:'supervisor',role:'supervisor',capabilities:['command:incident'],incidentScopes:['incident:other'],authentication:{authenticated:true}}),403);
  assert.equal(await dispatch({id:'supervisor',role:'supervisor',capabilities:['command:incident'],incidentScopes:['incident:one'],authentication:{authenticated:true,mode:'local_shadow_session'}},{intent:false}),403);
  assert.equal(await dispatch({id:'supervisor',role:'supervisor',capabilities:['command:incident'],incidentScopes:['incident:one'],authentication:{authenticated:true,mode:'local_shadow_session'}}),201);
  assert.deepEqual(calls,['supervisor']);
  const forgedReq={headers:{authorization:'','x-vigia-role':'administrator','x-vigia-actor':'attacker'},socket:{remoteAddress:'127.0.0.1'}};
  assert.equal(resolveRequestActor(forgedReq,null,{operatorBearerToken:'protected'}).authentication.authenticated,false);
});

test('field request MAC binds method, route, body, clock and nonce',()=>{
  const key='fieldnet-boundary-test-key-32-bytes-minimum',now=new Date('2026-08-22T10:00:00Z'),body={schemaVersion:'vigia.fieldnet-sync-request.v1',nodeId:'node:one',mutations:[]};
  const verifier=new FieldRequestVerifier({keyFor:(keyId)=>keyId==='node:one'?key:null,clock:()=>now});
  const headers=signFieldRequest({method:'POST',path:'/api/v10/fieldnet/sync',keyId:'node:one',key,body,now,nonce:'nonce-legitimate-0001'});
  const principal=verifier.verify({method:'POST',path:'/api/v10/fieldnet/sync',headers,body});assert.equal(principal.keyId,'node:one');
  const responseBody={schemaVersion:'vigia.fieldnet-sync-response.v1',acceptedMutationIds:[],cursor:'0',updates:[]},responseHeaders=signFieldResponse({keyId:principal.keyId,key,requestNonce:principal.requestNonce,requestBodyHash:principal.requestBodyHash,body:responseBody});assert.equal(verifyFieldResponse({keyId:principal.keyId,key,requestNonce:principal.requestNonce,requestBodyHash:principal.requestBodyHash,body:responseBody,headers:responseHeaders}).authenticated,true);assert.throws(()=>verifyFieldResponse({keyId:principal.keyId,key,requestNonce:principal.requestNonce,requestBodyHash:principal.requestBodyHash,body:{...responseBody,cursor:'forged'},headers:responseHeaders}),/fieldnet_central_response_authentication_failed/);
  assert.throws(()=>verifier.verify({method:'POST',path:'/api/v10/fieldnet/sync',headers,body}),/fieldnet_nonce_replayed/);
  const changedHeaders=signFieldRequest({method:'POST',path:'/api/v10/fieldnet/sync',keyId:'node:one',key,body,now,nonce:'nonce-tamper-000002'});
  assert.throws(()=>verifier.verify({method:'POST',path:'/api/v10/fieldnet/sync',headers:changedHeaders,body:{...body,nodeId:'node:two'}}),/fieldnet_body_hash_mismatch/);
  assert.throws(()=>verifier.verify({method:'POST',path:'/api/v10/fieldnet/other',headers:changedHeaders,body}),/fieldnet_signature_rejected/);
  const expired=signFieldRequest({method:'POST',path:'/api/v10/fieldnet/sync',keyId:'node:one',key,body,now:new Date('2026-08-22T09:00:00Z'),nonce:'nonce-expired-00001'});
  assert.throws(()=>verifier.verify({method:'POST',path:'/api/v10/fieldnet/sync',headers:expired,body}),/fieldnet_signature_timestamp_rejected/);
  const stagedHeaders=signFieldRequest({method:'POST',path:'/api/v10/fieldnet/sync',keyId:'node:one',key,body,now,nonce:'nonce-staged-envelope'}),envelope=verifier.verifyEnvelope({method:'POST',path:'/api/v10/fieldnet/sync',headers:stagedHeaders});
  assert.equal(envelope.keyId,'node:one');assert.equal(verifier.verifyBody({envelope,body}).keyId,'node:one');
});

test('central FieldNet binds active node identity, capability, incident scope and local sequence',async(t)=>{
  const base=path.resolve('.tmp/test');await mkdir(base,{recursive:true});const directory=await mkdtemp(path.join(base,'pilot-fieldnet-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const key='central-fieldnet-node-key-32-bytes-minimum',now=new Date('2026-08-22T10:00:00Z'),service=new CentralFieldNetService({filePath:path.join(directory,'central.json'),clock:()=>now,nodeRegistry:{'node:one':{key,incidentIds:['incident:one'],capabilities:['fieldnet:sync','fieldnet:command-survival'],status:'active'}},operationalEventService:{operatorEvent:async(id)=>({event:{id,evidenceState:'CURRENT',knowledgeState:'CURRENT',physicalOperationalState:'UNKNOWN',lastSeenAt:now.toISOString()}})}});await service.initialize();
  const mutation=(id,incidentId,localSequence)=>({id,incidentId,originNode:'node:one',actor:'field-operator',type:'ANNOTATION_ADDED',localSequence,payload:{value:id},payloadHash:sha256(canonical({value:id}))});
  const requestBody={schemaVersion:'vigia.fieldnet-sync-request.v1',nodeId:'node:one',mutations:[mutation('mutation:one','incident:one',1)]};
  const req=(body,nonce,keyId='node:one')=>({method:'POST',url:'/api/v10/fieldnet/sync',headers:signFieldRequest({method:'POST',path:'/api/v10/fieldnet/sync',keyId,key,body,now,nonce})});
  assert.equal(service.authorizeSync(req(requestBody,'node-auth-good-0001'),requestBody).keyId,'node:one');
  const stagedRequest=req(requestBody,'node-auth-staged-0001'),envelope=service.authorizeSyncEnvelope(stagedRequest);assert.equal(envelope.keyId,'node:one');assert.equal(service.authorizeSyncBody(envelope,requestBody).keyId,'node:one');
  const commandPayload={event:{eventId:'command:one',incidentId:'incident:one'}},commandBody={...requestBody,mutations:[{...mutation('mutation:command','incident:one',1),type:'COMMAND_SURVIVAL_EVENT',payload:commandPayload,payloadHash:sha256(canonical(commandPayload))}]};assert.equal(service.authorizeSync(req(commandBody,'node-auth-command-cap'),commandBody).keyId,'node:one');service.nodeRegistry['node:one'].capabilities=['fieldnet:sync'];assert.throws(()=>service.authorizeSync(req(commandBody,'node-auth-command-deny'),commandBody),/fieldnet_node_command_capability_forbidden/);service.nodeRegistry['node:one'].capabilities=['fieldnet:sync','fieldnet:command-survival'];
  const wrongIncident={...requestBody,mutations:[mutation('mutation:wrong','incident:other',1)]};assert.throws(()=>service.authorizeSync(req(wrongIncident,'node-auth-wrong-scope'),wrongIncident),/fieldnet_node_incident_scope_forbidden/);
  const wrongIdentity={...requestBody,nodeId:'node:two'};assert.throws(()=>service.authorizeSync(req(wrongIdentity,'node-auth-wrong-id-01'),wrongIdentity),/fieldnet_node_identity_mismatch/);
  await service.sync(requestBody);
  await assert.rejects(()=>service.sync({...requestBody,mutations:[mutation('mutation:sequence-replay','incident:one',1)]}),/fieldnet_local_sequence_replayed/);
});

test('central FieldNet rejects payload IDs that cross incident ownership',async(t)=>{
  const base=path.resolve('.tmp/test');await mkdir(base,{recursive:true});const directory=await mkdtemp(path.join(base,'pilot-fieldnet-binding-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const now=new Date('2026-08-22T10:00:00Z'),service=new CentralFieldNetService({filePath:path.join(directory,'central.json'),clock:()=>now,nodeRegistry:{'node:one':{key:'central-fieldnet-node-key-32-bytes-minimum',incidentIds:['incident:one','incident:two'],capabilities:['fieldnet:sync'],status:'active'}},operationalEventService:{operatorEvent:async(id)=>({event:{id,evidenceState:'CURRENT',knowledgeState:'CURRENT',physicalOperationalState:'UNKNOWN',lastSeenAt:now.toISOString()}})}});await service.initialize();
  const make=(id,incidentId,type,localSequence,payload)=>({id,incidentId,originNode:'node:one',actor:'field-operator',type,localSequence,payload,payloadHash:sha256(canonical(payload))});
  const task={taskId:'task:shared',incidentId:'incident:one',schemaVersion:'vigia.field-task.v1',version:1,state:'OPEN'};
  await service.sync({schemaVersion:'vigia.fieldnet-sync-request.v1',nodeId:'node:one',mutations:[make('mutation:create','incident:one','TASK_CREATED',1,task)]});
  const update={taskId:'task:shared',applied:true,changes:{state:'COMPLETED'},outcome:'APPLIED'};
  await assert.rejects(()=>service.sync({schemaVersion:'vigia.fieldnet-sync-request.v1',nodeId:'node:one',mutations:[make('mutation:cross','incident:two','TASK_UPDATED',2,update)]}),/fieldnet_task_incident_mismatch/);
  assert.equal(service.snapshot('incident:one').tasks[0].state,'OPEN');assert.equal(service.snapshot('incident:two').tasks.length,0);
});

test('cross-origin redirects default deny and explicit redirects strip credentials',async()=>{
  await assert.rejects(()=>fetchRaw('https://provider.test/start',{headers:{authorization:'Bearer secret'},fetchImpl:async()=>new Response(null,{status:302,headers:{location:'https://cdn.test/file'}})}),/upstream_redirect_origin_rejected/);
  let observedAuthorization='unset',calls=0;const result=await fetchRaw('https://provider.test/start',{allowCrossOriginRedirect:true,headers:{authorization:'Bearer secret',cookie:'private=1'},fetchImpl:async(_url,options)=>{calls+=1;if(calls===1)return new Response(null,{status:302,headers:{location:'https://cdn.test/file'}});observedAuthorization=options.headers.authorization??null;return new Response(Uint8Array.from([1,2]),{status:200,headers:{'content-type':'application/octet-stream'}});}});
  assert.equal(result.body.length,2);assert.equal(observedAuthorization,null);
});

test('imagery proxy rejects authority tricks, private redirects, invalid MIME and oversized responses while allowing a bounded image',async()=>{
  const publicDns=async()=>[{address:'93.184.216.34'}],allowed='https://sentinel-cogs.s3.us-west-2.amazonaws.com/example.jpg';
  const handle=(service,href)=>new URL(service.proxyUrl(href),'http://vigia.local').searchParams.get('handle');
  const noFetch=new CurrentImageryService({resolveHost:publicDns,fetchImpl:async()=>{throw new Error('must_not_fetch');}});
  assert.equal(noFetch.proxyUrl('https://sentinel-cogs.s3.us-west-2.amazonaws.com.evil.test/x.jpg'),null);
  assert.equal(noFetch.proxyUrl('https://sentinel-cogs.s3.us-west-2.amazonaws.com:444/x.jpg'),null);
  assert.equal(noFetch.proxyUrl(`${allowed}#authority-confusion`),null);
  const crossOrigin=new CurrentImageryService({resolveHost:publicDns,fetchImpl:async()=>new Response(null,{status:302,headers:{location:'https://gibs.earthdata.nasa.gov/private.jpg'}})});
  await assert.rejects(()=>crossOrigin.proxy(handle(crossOrigin,allowed)),/upstream_redirect_origin_rejected/);
  let resolutions=0;const redirecting=new CurrentImageryService({resolveHost:async()=>[{address:++resolutions===1?'93.184.216.34':'127.0.0.1'}],fetchImpl:async()=>new Response(null,{status:302,headers:{location:'https://sentinel-cogs.s3.us-west-2.amazonaws.com/private.jpg'}})});
  await assert.rejects(()=>redirecting.proxy(handle(redirecting,allowed)),/preview_destination_not_public/);
  const wrongType=new CurrentImageryService({resolveHost:publicDns,fetchImpl:async()=>new Response('not image',{status:200,headers:{'content-type':'text/html'}})});await assert.rejects(()=>wrongType.proxy(handle(wrongType,allowed)),/upstream_not_image/);
  const oversized=new CurrentImageryService({resolveHost:publicDns,fetchImpl:async()=>new Response(null,{status:200,headers:{'content-type':'image/jpeg','content-length':String(9*1024*1024)}})});await assert.rejects(()=>oversized.proxy(handle(oversized,allowed)),/upstream_body_too_large/);
  const legitimate=new CurrentImageryService({resolveHost:publicDns,fetchImpl:async()=>new Response(Uint8Array.from([255,216,255,217]),{status:200,headers:{'content-type':'image/jpeg'}})});const image=await legitimate.proxy(handle(legitimate,allowed));assert.equal(image.buffer.length,4);assert.equal(image.sourceState,'current');
});

test('FieldNode WebSocket uses only registered governed targets and rejects private resolution',async(t)=>{
  class BoundedSocket{static supportsPrebufferLimit=true;static maxPayloadBytes=256*1024;constructor(){throw new Error('must_not_connect');}}
  const sensor={schemaVersion:'vigia.field-sensor-registration.v1',sensorId:'sensor:one',websocketUrl:'wss://sensor.example.test/stream'};
  const service={store:{nodeId:'node:test',devices:()=>[sensor]}};
  const gateway=new FieldSensorGateway({fieldNetService:service,hardwareReportPath:'/not-present',allowedWebSocketHosts:['sensor.example.test'],resolveHost:async()=>[{address:'127.0.0.1'}],WebSocketImpl:BoundedSocket});
  await assert.rejects(()=>gateway.connectWebSocket({sensorId:'sensor:one',url:'wss://attacker.example/ignored'}),/field_sensor_websocket_destination_rejected/);
  sensor.websocketUrl='ws://sensor.example.test/stream';await assert.rejects(()=>gateway.connectWebSocket({sensorId:'sensor:one'}),/field_sensor_websocket_destination_rejected/);
});

test('FieldNode WebSocket rejects duplicate sockets and oversized messages',async(t)=>{
  const instances=[];class FakeSocket{static supportsPrebufferLimit=true;static maxPayloadBytes=256*1024;constructor(){this.readyState=0;this.listeners={};this.closed=null;instances.push(this);}addEventListener(type,listener){this.listeners[type]=listener;}close(code,reason){this.readyState=3;this.closed={code,reason};this.listeners.close?.();}}
  const sensor={schemaVersion:'vigia.field-sensor-registration.v1',sensorId:'sensor:one',websocketUrl:'wss://sensor.example.test/stream'},service={store:{nodeId:'node:test',devices:()=>[sensor]}};
  const gateway=new FieldSensorGateway({fieldNetService:service,hardwareReportPath:'/not-present',allowedWebSocketHosts:['sensor.example.test'],resolveHost:async()=>[{address:'93.184.216.34'}],WebSocketImpl:FakeSocket});
  await gateway.connectWebSocket({sensorId:'sensor:one'});await assert.rejects(()=>gateway.connectWebSocket({sensorId:'sensor:one'}),/field_sensor_websocket_already_connected/);
  instances[0].listeners.message({data:'x'.repeat(256*1024+1)});assert.deepEqual(instances[0].closed,{code:1009,reason:'message_too_large'});gateway.close();
});

test('FieldNode WebSocket enforces aggregate admission before opening more sockets',async(t)=>{
  class FakeSocket{static supportsPrebufferLimit=true;static maxPayloadBytes=256*1024;constructor(){this.readyState=0;this.listeners={};}addEventListener(type,listener){this.listeners[type]=listener;}close(){this.readyState=3;this.listeners.close?.();}}
  const sensors=['one','two'].map((id)=>({schemaVersion:'vigia.field-sensor-registration.v1',sensorId:`sensor:${id}`,websocketUrl:`wss://sensor.example.test/${id}`})),service={store:{nodeId:'node:test',devices:()=>sensors}};
  const gateway=new FieldSensorGateway({fieldNetService:service,hardwareReportPath:'/not-present',allowedWebSocketHosts:['sensor.example.test'],resolveHost:async()=>[{address:'93.184.216.34'}],WebSocketImpl:FakeSocket,maxWebSockets:1});
  await gateway.connectWebSocket({sensorId:'sensor:one',actor:'operator:a'});
  await assert.rejects(()=>gateway.connectWebSocket({sensorId:'sensor:two',actor:'operator:b'}),/field_sensor_websocket_capacity_exhausted/);
  gateway.close();
});

test('FieldNode WebSocket fails closed without a pre-buffer payload limit and bounds DNS setup time',async()=>{
  const sensor={schemaVersion:'vigia.field-sensor-registration.v1',sensorId:'sensor:one',websocketUrl:'wss://sensor.example.test/stream'},service={store:{nodeId:'node:test',devices:()=>[sensor]}},unbounded=new FieldSensorGateway({fieldNetService:service,hardwareReportPath:'/not-present',allowedWebSocketHosts:['sensor.example.test']});
  await assert.rejects(()=>unbounded.connectWebSocket({sensorId:'sensor:one'}),/field_sensor_websocket_bounded_transport_required/);assert.equal(unbounded.status().adapters.WEBSOCKET_CLIENT.state,'BOUNDED_TRANSPORT_NOT_CONFIGURED');
  class BoundedSocket{static supportsPrebufferLimit=true;static maxPayloadBytes=256*1024;}
  const bounded=new FieldSensorGateway({fieldNetService:service,hardwareReportPath:'/not-present',allowedWebSocketHosts:['sensor.example.test'],WebSocketImpl:BoundedSocket,resolveHost:()=>new Promise(()=>{}),connectTimeoutMs:20});const started=Date.now();
  await assert.rejects(()=>bounded.connectWebSocket({sensorId:'sensor:one'}),/field_sensor_websocket_setup_timeout/);assert.ok(Date.now()-started<500);assert.equal(bounded.status().capacity.pendingConnections,0);
});

test('thermal metadata calls are admission-controlled and share one upstream request',async()=>{
  let calls=0;const adapter=new ThermalWmsAdapter({fetchImpl:async()=>{calls+=1;await new Promise((resolve)=>setTimeout(resolve,5));return new Response('<WMS_Capabilities><Layer><Name>FRP-PIXEL</Name></Layer></WMS_Capabilities>',{status:200,headers:{'content-type':'application/xml'}});}});
  const [first,second]=await Promise.all([adapter.probe('operator:a'),adapter.probe('operator:b')]);
  assert.equal(calls,1);assert.equal(first.layers[0],'FRP-PIXEL');assert.deepEqual(first,second);
});

test('unavailable map sources reject instead of returning transparent success pixels',async()=>{
  const basemap=new BasemapService({fetchImpl:async()=>{throw new Error('provider_down');}});
  await assert.rejects(()=>basemap.tile({kind:'imagery',z:8,x:1,y:1}),error=>error.statusCode===503&&/basemap_upstream_unavailable/.test(error.message));
  const thermal=new ThermalWmsAdapter({fetchImpl:async()=>{throw new Error('provider_down');}});
  await assert.rejects(()=>thermal.tile(8,1,1),error=>error.statusCode===503&&/thermal_wms_unavailable/.test(error.message));
});
