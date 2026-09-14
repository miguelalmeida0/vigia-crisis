import http from 'node:http';
import { chmodSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FieldNodeStore } from './sqlite-store.mjs';
import { FieldNetService } from './service.mjs';
import { FieldSensorGateway } from './sensor-gateway.mjs';
import { evaluateFieldNetReadiness, restrictedCapacityTaskReadiness } from './readiness.mjs';
import { ReleaseIdentityService } from '../../api/src/modules/release/release-identity-service.mjs';
import { RequestGate } from '../../api/src/shared/request-gate.mjs';
import { FieldRequestVerifier } from '../../../packages/domain/src/fieldnet/request-auth.mjs';
import { fieldEventVisible, publicFieldNodeHealth, resolveFieldRequestIncident, scopedFieldNodeSnapshot } from './http-boundary.mjs';
import { FieldNetUiSessionManager } from './ui-session-manager.mjs';
import { createFieldNodeBodyReader, createFieldNodeJsonResponder, createFieldNodeUiAssetServer, fieldNodeCorsHeaders } from './http-helpers.mjs';
import { createCapacityTaskRoutePolicy, uiSessionRouteAllowed } from './route-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const host = process.env.FIELDNET_HOST ?? '127.0.0.1';
const port = Number(process.env.FIELDNET_PORT ?? 4188);
const publicAuthority = String(process.env.FIELDNET_PUBLIC_AUTHORITY ?? '').trim();
const nodeId = process.env.FIELDNET_NODE_ID ?? 'field-node:local-1';
const dbPath = path.resolve(root, process.env.FIELDNET_DB_PATH ?? 'data/runtime/fieldnet/field-node.sqlite');
const centralUrl = process.env.FIELDNET_CENTRAL_URL || null;
const monitorIntervalMs = Math.max(250, Number(process.env.FIELDNET_MONITOR_INTERVAL_MS ?? 2_000));
const maxBodyBytes = Math.max(1024, Number(process.env.FIELDNET_MAX_BODY_BYTES ?? 524_288));
const maxResponseBytes = Math.max(64*1024, Number(process.env.FIELDNET_MAX_RESPONSE_BYTES ?? 8*1024*1024));
const bodyTimeoutMs=Math.max(1_000,Number(process.env.FIELDNET_BODY_TIMEOUT_MS??10_000));
const maxConnections=Math.max(8,Number(process.env.FIELDNET_MAX_CONNECTIONS??64));
const headersTimeoutMs=Math.max(1_000,Number(process.env.FIELDNET_HEADERS_TIMEOUT_MS??10_000));
const requestTimeoutMs=Math.max(headersTimeoutMs,Number(process.env.FIELDNET_HTTP_REQUEST_TIMEOUT_MS??20_000));
const keepAliveTimeoutMs=Math.max(500,Number(process.env.FIELDNET_KEEP_ALIVE_TIMEOUT_MS??5_000));
const maxRequestsPerSocket=Math.max(1,Number(process.env.FIELDNET_MAX_REQUESTS_PER_SOCKET??100));
const controlSocketPath=process.env.FIELDNET_CONTROL_SOCKET?path.resolve(root,process.env.FIELDNET_CONTROL_SOCKET):null;
const allowSharedControlListener=process.env.FIELDNET_ALLOW_SHARED_CONTROL_LISTENER==='1';
if(!controlSocketPath&&!allowSharedControlListener)throw new Error('fieldnet_protected_control_socket_required_at_startup');
const secret=(name)=>{const direct=process.env[name];if(direct)return direct;const file=process.env[`${name}_FILE`];if(!file)return'';try{return readFileSync(file,'utf8').trim();}catch{return'';}};
const controlKey=secret('FIELDNET_CONTROL_KEY');const controlKeyId=process.env.FIELDNET_CONTROL_KEY_ID??'field-operator';
if(controlKey.length<32)throw new Error('fieldnet_control_key_required_at_startup');
const capacityTaskKey=secret('FIELDNET_CAPACITY_TASK_KEY'),capacityTaskKeyId=process.env.FIELDNET_CAPACITY_TASK_KEY_ID??'fieldnet-capacity-task-resolver';
if(capacityTaskKey&&capacityTaskKey.length<32)throw new Error('fieldnet_capacity_task_key_invalid_at_startup');
if(capacityTaskKey&&capacityTaskKeyId===controlKeyId)throw new Error('fieldnet_capacity_task_principal_must_be_distinct');
const controlIncidentScopes=new Set(String(process.env.FIELDNET_CONTROL_INCIDENT_SCOPES??'').split(',').map((item)=>item.trim()).filter(Boolean));
if(controlIncidentScopes.size!==1||controlIncidentScopes.has('*'))throw new Error('exact_fieldnet_control_incident_scope_required_at_startup');
const fieldPrincipalKey=(keyId)=>keyId===controlKeyId?controlKey:capacityTaskKey&&keyId===capacityTaskKeyId?capacityTaskKey:null;
const requestVerifier=new FieldRequestVerifier({keyFor:fieldPrincipalKey});
const uiSessions=new FieldNetUiSessionManager({ttlMs:Math.max(60_000,Number(process.env.FIELDNET_UI_SESSION_TTL_MS??30*60_000)),maxSessions:Math.max(1,Number(process.env.FIELDNET_UI_MAX_SESSIONS??64))});
const uiRoot=path.join(root,'apps/field-node/public/fieldnet-lite');
const monotonicStartedAt = performance.now();
const processStartedAt = new Date(performance.timeOrigin).toISOString();
const releaseIdentityService=new ReleaseIdentityService({projectRoot:root,runtimeProfile:process.env.VIGIA_RUNTIME_PROFILE??'local_shadow',component:'fieldnode',expectedReleaseId:process.env.VIGIA_RELEASE_ID??null,expectedCodeStateHash:process.env.VIGIA_CODE_STATE_HASH??null,expectedOperationalDataHash:process.env.VIGIA_OPERATIONAL_DATA_HASH??null,expectedStatementHash:process.env.VIGIA_APPROVED_RELEASE_STATEMENT_SHA256??null});
const expectedReleaseIdentity=releaseIdentityService.identity();
const startup={processStartedAt,listenerAt:null,servicesReadyAt:null,state:'loading',ready:false};
const deploymentIdentityStore={status:()=>({state:'ready',releaseId:expectedReleaseIdentity.releaseId,codeStateHash:expectedReleaseIdentity.codeStateHash,operationalDataHash:expectedReleaseIdentity.operationalDataHash,releaseStatementHash:expectedReleaseIdentity.releaseStatementHash,recordedAt:processStartedAt,authority:'FIELD_NODE_PROCESS_ASSERTION'})};

const store = new FieldNodeStore({ filePath: dbPath, nodeId });
const service = new FieldNetService({ store, centralUrl, nodeKey:secret('FIELDNET_NODE_KEY')||null, releaseIdentity:releaseIdentityService.identity(),incidentId:[...controlIncidentScopes][0], requestTimeoutMs: Number(process.env.FIELDNET_REQUEST_TIMEOUT_MS ?? 2_000) });
const sensorGateway = new FieldSensorGateway({ fieldNetService:service, allowedWebSocketHosts:String(process.env.FIELDNET_SENSOR_WS_ALLOWED_HOSTS??'').split(',').map((item)=>item.trim()).filter(Boolean), hardwareReportPath:path.resolve(root, process.env.FIELDNET_HARDWARE_REPORT ?? 'data/validation/fieldnet/sensors/hardware-discovery.json') });
class FieldStreamHub{
  #clients=new Set();#byPrincipal=new Map();
  constructor({maxClients=64,maxPerPrincipal=8,maxAgeMs=15*60_000,backpressureTimeoutMs=2_000}={}){Object.assign(this,{maxClients,maxPerPrincipal,maxAgeMs,backpressureTimeoutMs});}
  add(response,{incidentId,principal}){const key=String(principal).slice(0,160),count=this.#byPrincipal.get(key)??0;if(this.#clients.size>=this.maxClients)throw Object.assign(new Error('fieldnet_sse_capacity_exhausted'),{statusCode:503});if(count>=this.maxPerPrincipal)throw Object.assign(new Error('fieldnet_sse_principal_capacity_exhausted'),{statusCode:429});const row={response,incidentId:String(incidentId),principal:key,ageTimer:null,drainTimer:null};this.#clients.add(row);this.#byPrincipal.set(key,count+1);const remove=()=>this.#remove(row);response.once('close',remove);response.once('error',remove);row.ageTimer=setTimeout(()=>{response.end();remove();},this.maxAgeMs);row.ageTimer.unref?.();return row;}
  remove(row){this.#remove(row);}
  publish(event){const message=`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;for(const row of this.#clients){if(!fieldEventVisible(event,row.incidentId))continue;try{if(row.response.write(message)===false&&!row.drainTimer){const drained=()=>{if(row.drainTimer)clearTimeout(row.drainTimer);row.drainTimer=null;};row.response.once('drain',drained);row.drainTimer=setTimeout(()=>{row.response.destroy();this.#remove(row);},this.backpressureTimeoutMs);row.drainTimer.unref?.();}}catch{this.#remove(row);}}}
  close(){for(const row of this.#clients)row.response.end();this.#clients.clear();this.#byPrincipal.clear();}
  #remove(row){if(!this.#clients.delete(row))return;if(row.ageTimer)clearTimeout(row.ageTimer);if(row.drainTimer)clearTimeout(row.drainTimer);const remaining=(this.#byPrincipal.get(row.principal)??1)-1;if(remaining>0)this.#byPrincipal.set(row.principal,remaining);else this.#byPrincipal.delete(row.principal);}
}
const streams = new FieldStreamHub();
const preAuthGate = new RequestGate({maxConcurrent:12,maxConcurrentPerClient:4,maxRequestsPerWindow:Number.MAX_SAFE_INTEGER,windowMs:60_000,maxClients:8});
const publicRequestGate = new RequestGate({maxConcurrent:4,maxConcurrentPerClient:2,maxRequestsPerWindow:120,windowMs:60_000,maxClients:8});
const principalRequestGate = new RequestGate({maxConcurrent:12,maxConcurrentPerClient:4,maxRequestsPerWindow:240,windowMs:60_000,maxClients:128});
service.on('field-event', (event) => streams.publish(event));

const json = createFieldNodeJsonResponder({ maxResponseBytes, fieldPrincipalKey });
const serveUiAsset = createFieldNodeUiAssetServer({ uiRoot });
const body = createFieldNodeBodyReader({ bodyTimeoutMs, maxBodyBytes });

const actor = (request) => String(request.vigiaUiSession?.principalId??request.vigiaFieldPrincipal?.keyId??request.vigiaFieldEnvelope?.keyId??'field-operator:unidentified');
const incidentAllowed=(incidentId)=>controlIncidentScopes.has(String(incidentId));
const { assertCapacityTaskBoundary, capacityTaskRouteAllowed } = createCapacityTaskRoutePolicy({ capacityTaskKeyId, capacityTaskKey, store, nodeId, incidentAllowed });
const releaseSnapshot=()=>releaseIdentityService.snapshot({runtime:{startedAt:processStartedAt},services:{deploymentIdentityStore},startup});
const readinessSnapshot=()=>{const node=service.snapshot(),release=releaseSnapshot();return evaluateFieldNetReadiness({process:{alive:true,pid:process.pid,startedAt:processStartedAt,listenerBound:Boolean(startup.listenerAt)},releaseIdentity:release,expectedReleaseIdentity,startup:{...release.process.startup,listenerAt:startup.listenerAt},deploymentIdentity:release.schema.deploymentIdentity,incidentScope:{exact:controlIncidentScopes.size===1&&!controlIncidentScopes.has('*'),incidentId:service.incidentId,expectedIncidentId:[...controlIncidentScopes][0]},storage:store.readiness(),internalServices:{fieldNetService:Boolean(service),sensorGateway:Boolean(sensorGateway),deploymentIdentityStore:Boolean(deploymentIdentityStore)},centralConnectivity:{configured:node.centralUrlConfigured,connectionState:node.connectionState,releaseCompatibility:node.releaseCompatibility}});};

const handleRequest=({publicOnly,expectedHost})=>async (request, response) => {
  try {
    response.corsHeaders = fieldNodeCorsHeaders(request);
    const gateKey=String(request.socket?.remoteAddress??'unknown').slice(0,160);
    const listenerHost=expectedHost();if(request.headers.host!==listenerHost)throw Object.assign(new Error('fieldnet_host_rejected'),{statusCode:421});
    if (request.method === 'OPTIONS') { response.writeHead(204, response.corsHeaders); response.end(); return; }
    const url = new URL(request.url, `http://${listenerHost}`);
    const pathname = url.pathname;
    if(request.method==='GET'&&(pathname==='/api/fieldnet/release'||pathname==='/fieldnet/release'))return publicRequestGate.run(gateKey,()=>json(response,200,releaseSnapshot()));
    if(request.method==='GET'&&(pathname==='/ready'||pathname==='/api/fieldnet/ready'))return publicRequestGate.run(gateKey,()=>{const readiness=readinessSnapshot();return json(response,readiness.ready?200:503,readiness);});
    if (request.method === 'GET' && (pathname === '/' || pathname === '/health')) return publicRequestGate.run(gateKey,()=>json(response, 200, publicFieldNodeHealth({releaseId:releaseIdentityService.identity().releaseId})));
    if(!publicOnly&&request.method==='GET'&&serveUiAsset(response,pathname))return;
    if(publicOnly)return json(response,404,{error:'route_not_found'});
    const fieldApi=pathname.startsWith('/api/fieldnet/'),sessionCandidate=fieldApi&&pathname!=='/api/fieldnet/ui-sessions'&&uiSessions.hasSessionCookie(request.headers);
    if(fieldApi&&!sessionCandidate){request.vigiaFieldEnvelope=await preAuthGate.run(gateKey,()=>requestVerifier.verifyEnvelope({method:request.method,path:pathname,headers:request.headers}));if(request.vigiaFieldEnvelope.keyId===capacityTaskKeyId&&!capacityTaskRouteAllowed(request.method,pathname))throw Object.assign(new Error('fieldnet_capacity_task_route_forbidden'),{statusCode:403});}
    if(fieldApi&&sessionCandidate){
      if(!uiSessionRouteAllowed(request.method,pathname))throw Object.assign(new Error('fieldnet_ui_route_forbidden'),{statusCode:403});
      await preAuthGate.run(gateKey,async()=>{const input=request.method==='POST'?await body(request):null,incidentId=resolveFieldRequestIncident({pathname,searchParams:url.searchParams,input,store});request.vigiaUiSession=uiSessions.authenticate({headers:request.headers,method:request.method,incidentId});if(incidentId&&!incidentAllowed(incidentId))throw Object.assign(new Error('fieldnet_incident_scope_forbidden'),{statusCode:403});});
    }
    return await principalRequestGate.run(actor(request),async()=>{
    if(fieldApi&&!sessionCandidate){const input=request.method==='POST'?await body(request):null;request.vigiaFieldPrincipal=requestVerifier.verifyBody({envelope:request.vigiaFieldEnvelope,body:input});response.vigiaFieldPrincipal=request.vigiaFieldPrincipal;assertCapacityTaskBoundary({principal:request.vigiaFieldPrincipal,method:request.method,pathname,input});const incidentId=resolveFieldRequestIncident({pathname,searchParams:url.searchParams,input,store});if(incidentId&&!incidentAllowed(incidentId))throw Object.assign(new Error('fieldnet_incident_scope_forbidden'),{statusCode:403});}
    if (request.method === 'POST' && pathname === '/api/fieldnet/ui-sessions') { const input=await body(request),device=store.device(input.deviceId);if(!device?.observer?.active||device.observer.verificationState==='SUSPENDED')throw Object.assign(new Error('fieldnet_ui_active_observer_device_required'),{statusCode:409});if(String(input.incidentId)!==[...controlIncidentScopes][0])throw Object.assign(new Error('fieldnet_incident_scope_forbidden'),{statusCode:403});const issued=uiSessions.issue({principalId:device.ownerOperator,issuedBy:actor(request),incidentId:input.incidentId,deviceId:device.deviceId,observerClass:device.observer.observerClass,secureCookie:String(request.headers['x-forwarded-proto']??'').toLowerCase()==='https'});return json(response,201,{session:uiSessions.publicSession(issued.session),csrfToken:issued.csrfToken,uiUrl:'/fieldnet-lite/'},{'set-cookie':issued.setCookie});}
    if (request.method === 'GET' && pathname === '/api/fieldnet/ui-session') { const refreshed=uiSessions.refreshCsrf(request.headers);request.vigiaUiSession=refreshed.session;return json(response,200,{session:uiSessions.publicSession(refreshed.session),csrfToken:refreshed.csrfToken});}
    if (request.method === 'POST' && pathname === '/api/fieldnet/ui-session/revoke') { const revoked=uiSessions.revoke(request.headers);return json(response,200,{state:'REVOKED',removed:revoked.removed},{'set-cookie':revoked.clearCookie});}
    if (request.method === 'GET' && pathname === '/api/fieldnet/state') {const snapshot=service.snapshot(),incidents=snapshot.incidents.filter((item)=>incidentAllowed(item.incidentId));return json(response,200,request.vigiaFieldPrincipal?.keyId===capacityTaskKeyId?{schemaVersion:'vigia.fieldnet-capacity-task-destination.v1',nodeId:snapshot.nodeId,incidents:incidents.map((item)=>({incidentId:item.incidentId}))}:{...snapshot,incidents});}
    if (request.method === 'GET' && pathname === '/api/fieldnet/capacity-task-readiness') return json(response,200,restrictedCapacityTaskReadiness(readinessSnapshot(),{nodeId,incidentId:[...controlIncidentScopes][0]}));
    if (request.method === 'POST' && pathname === '/api/fieldnet/connection-state') { const input = await body(request); return json(response, 200, service.setConnectionState(input.state, actor(request))); }
    if (request.method === 'POST' && pathname === '/api/fieldnet/incidents/import') { const input = await body(request); return json(response, 201, service.importPackage(input.package ?? input, actor(request))); }
    if (request.method === 'GET' && pathname === '/api/fieldnet/incidents') return json(response, 200, { incidents: store.incidents().filter((item)=>incidentAllowed(item.incidentId)) });
    if (request.method === 'POST' && pathname === '/api/fieldnet/devices') { const input = await body(request); return json(response, 201, service.registerDevice(input.device ?? input, actor(request))); }
    if (request.method === 'GET' && pathname === '/api/fieldnet/devices') return json(response, 200, { devices: store.devices() });
    if (request.method === 'GET' && pathname === '/api/fieldnet/sensor-gateway') return json(response, 200, sensorGateway.status());
    if (request.method === 'GET' && pathname === '/api/fieldnet/sensors') return json(response, 200, { sensors:sensorGateway.sensors(), hardware:sensorGateway.status().hardware });
    if (request.method === 'POST' && pathname === '/api/fieldnet/sensors') { const input = await body(request); return json(response, 201, sensorGateway.register(input.sensor ?? input, actor(request))); }
    if (request.method === 'POST' && pathname === '/api/fieldnet/sensor-observations') { const input = await body(request); return json(response, 201, sensorGateway.ingest(input.observation ?? input, actor(request), { transport:'HTTP_LOCAL_REST' })); }
    if (request.method === 'POST' && pathname === '/api/fieldnet/sensorthings/v1.1/observations') { const input = await body(request); return json(response, 201, sensorGateway.ingestSensorThings(input.observation ?? input, actor(request))); }
    if (request.method === 'POST' && pathname === '/api/fieldnet/sensor-gateway/websocket') { const input = await body(request); return json(response, 202, await sensorGateway.connectWebSocket({ sensorId:input.sensorId, actor:actor(request) })); }
    if (request.method === 'POST' && pathname === '/api/fieldnet/observations') { const input = await body(request); return json(response, 201, service.addObservation(input.observation ?? input, actor(request))); }
    if (request.method === 'POST' && pathname === '/api/fieldnet/reports') { const input = await body(request); return json(response, 201, service.addStructuredReport(input.report ?? input, actor(request))); }
    if (request.method === 'POST' && pathname === '/api/fieldnet/tasks') { const input = await body(request); return json(response, 201, service.createTask(input.task ?? input, actor(request))); }
    if (request.method === 'POST' && pathname === '/api/fieldnet/verification-tasks') { const input = await body(request); return json(response, 201, service.createVerificationTask(input.task ?? input, actor(request))); }
    if (request.method === 'POST' && pathname === '/api/fieldnet/annotations') { const input = await body(request); return json(response, 201, service.addAnnotation({ ...input, actor: actor(request) })); }
    if (request.method === 'POST' && pathname === '/api/fieldnet/sync') return json(response, 200, await service.syncOnce());
    if (request.method === 'GET' && pathname === '/api/fieldnet/sync-queue') {const queue=store.pendingSync({ mode: url.searchParams.get('mode') ?? store.state().connectionState, limit: Number(url.searchParams.get('limit') ?? 100) }),items=queue.items.filter((item)=>incidentAllowed(item.mutation?.incidentId));return json(response, 200,{...queue,items,pendingTotal:items.length});}
    if (request.method === 'GET' && pathname === '/api/fieldnet/events') {
      const incidentId=url.searchParams.get('incidentId');if(!incidentId)throw Object.assign(new Error('fieldnet_incident_id_required'),{statusCode:400});if(!incidentAllowed(incidentId))throw Object.assign(new Error('fieldnet_incident_scope_forbidden'),{statusCode:403});
      const stream=streams.add(response,{incidentId,principal:actor(request)});
      try{
        response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', ...response.corsHeaders });
        response.write(`event: READY\ndata: ${JSON.stringify(scopedFieldNodeSnapshot(service.snapshot(),incidentId))}\n\n`);
      }catch(error){streams.remove(stream);throw error;}
      return;
    }

    let match;
    if (request.method === 'GET' && (match = pathname.match(/^\/api\/fieldnet\/incidents\/([^/]+)$/))) return json(response, store.incident(decodeURIComponent(match[1])) ? 200 : 404, store.incident(decodeURIComponent(match[1])) ?? { error: 'incident_not_found' });
    if (request.method === 'GET' && (match = pathname.match(/^\/api\/fieldnet\/incidents\/([^/]+)\/observations$/))) return json(response, 200, { observations: store.observations(decodeURIComponent(match[1])) });
    if (request.method === 'GET' && (match = pathname.match(/^\/api\/fieldnet\/incidents\/([^/]+)\/tasks$/))) return json(response, 200, { tasks: store.tasks(decodeURIComponent(match[1])) });
    if (request.method === 'GET' && (match = pathname.match(/^\/api\/fieldnet\/incidents\/([^/]+)\/command-survival$/))) return json(response, 200, service.commandSurvival(decodeURIComponent(match[1])));
    if (request.method === 'POST' && (match = pathname.match(/^\/api\/fieldnet\/incidents\/([^/]+)\/command-survival\/events$/))) { const input=await body(request);return json(response,201,service.addCommandSurvivalEvent(decodeURIComponent(match[1]),input.event??input,actor(request))); }
    if (request.method === 'GET' && (match = pathname.match(/^\/api\/fieldnet\/incidents\/([^/]+)\/evidence-debt$/))) return json(response, 200, { items:store.evidenceDebt(decodeURIComponent(match[1])) });
    if (request.method === 'POST' && (match = pathname.match(/^\/api\/fieldnet\/incidents\/([^/]+)\/evidence-debt$/))) { const input=await body(request); return json(response,201,store.upsertEvidenceDebt(decodeURIComponent(match[1]),input.item??input,actor(request))); }
    if (request.method === 'GET' && (match = pathname.match(/^\/api\/fieldnet\/incidents\/([^/]+)\/truth-graph$/))) return json(response, 200, store.truthGraph(decodeURIComponent(match[1])));
    if (request.method === 'GET' && (match = pathname.match(/^\/api\/fieldnet\/incidents\/([^/]+)\/conflicts$/))) return json(response, 200, { conflicts: store.conflicts(decodeURIComponent(match[1]), url.searchParams.get('state')) });
    if (request.method === 'GET' && (match = pathname.match(/^\/api\/fieldnet\/incidents\/([^/]+)\/audit$/))) return json(response, 200, { verification: store.verifyAudit(), records: store.audit(decodeURIComponent(match[1])) });
    if (request.method === 'GET' && (match = pathname.match(/^\/api\/fieldnet\/incidents\/([^/]+)\/replay$/))) return json(response, 200, store.replay(decodeURIComponent(match[1])));
    if (request.method === 'GET' && (match = pathname.match(/^\/api\/fieldnet\/incidents\/([^/]+)\/offline-map$/))) return json(response, 200, store.offlineMap(decodeURIComponent(match[1])));
    if (request.method === 'GET' && (match = pathname.match(/^\/api\/fieldnet\/incidents\/([^/]+)\/source-freshness$/))) return json(response, 200, service.incidentFreshness(decodeURIComponent(match[1])));
    if (request.method === 'GET' && (match = pathname.match(/^\/api\/fieldnet\/incidents\/([^/]+)\/metrics$/))) return json(response, 200, store.metrics(decodeURIComponent(match[1])));
    if (request.method === 'GET' && (match = pathname.match(/^\/api\/fieldnet\/tasks\/([^/]+)$/))) { const task = store.task(decodeURIComponent(match[1])); return json(response, task ? 200 : 404, task ?? { error: 'task_not_found' }); }
    if (request.method === 'GET' && (match = pathname.match(/^\/api\/fieldnet\/tasks\/([^/]+)\/lifecycle$/))) { const lifecycle = store.taskLifecycle(decodeURIComponent(match[1])); return json(response, lifecycle ? 200 : 404, lifecycle ?? { error: 'task_not_found' }); }
    if (request.method === 'GET' && (match = pathname.match(/^\/api\/fieldnet\/tasks\/([^/]+)\/acknowledgements$/))) return json(response, 200, { acknowledgements:store.taskAcknowledgements(decodeURIComponent(match[1])) });
    if (request.method === 'POST' && (match = pathname.match(/^\/api\/fieldnet\/tasks\/([^/]+)\/acknowledgements$/))) { const input = await body(request); return json(response, 201, service.acknowledgeTask(decodeURIComponent(match[1]), { ...input, actor: actor(request) })); }
    if (request.method === 'POST' && (match = pathname.match(/^\/api\/fieldnet\/tasks\/([^/]+)\/verification-acknowledgements$/))) { const input = await body(request); return json(response, 201, service.acknowledgeVerificationTask(decodeURIComponent(match[1]), input.acknowledgement ?? input, actor(request))); }
    if (request.method === 'POST' && (match = pathname.match(/^\/api\/fieldnet\/tasks\/([^/]+)\/completion$/))) { const input = await body(request); return json(response, 201, service.completeVerificationTask(decodeURIComponent(match[1]), input.completion ?? input, actor(request))); }
    if (request.method === 'POST' && (match = pathname.match(/^\/api\/fieldnet\/incidents\/([^/]+)\/alerts\/([^/]+)\/acknowledgements$/))) { const input = await body(request); return json(response, 201, service.acknowledgeAlert(decodeURIComponent(match[1]), decodeURIComponent(match[2]), { ...input, actor: actor(request) })); }
    if (request.method === 'POST' && (match = pathname.match(/^\/api\/fieldnet\/tasks\/([^/]+)\/mutations$/))) { const input = await body(request); return json(response, 200, service.mutateTask(decodeURIComponent(match[1]), { ...input, actor: actor(request) })); }
    if (request.method === 'POST' && (match = pathname.match(/^\/api\/fieldnet\/conflicts\/([^/]+)\/resolve$/))) { const input = await body(request); return json(response, 200, service.resolveConflict(decodeURIComponent(match[1]), { ...input, actor: actor(request) })); }
    return json(response, 404, { error: 'route_not_found' });
    });
  } catch (error) {
    if(response.headersSent){response.destroy(error);return;}
    const known = ['not_found', 'required', 'invalid', 'conflict', 'changed', 'mismatch', 'not_registered', 'rejected', 'must_be', 'cannot', 'not_eligible', 'suspended', 'missing', 'not_linked'].some((fragment) => String(error.message).includes(fragment));
    const status = String(error.message).endsWith('_not_found') ? 404 : error.statusCode ?? (known ? 409 : 500);
    return json(response, status, { error: error.message ?? 'fieldnet_internal_error' });
  }
};

const configureServer=(target,{connectionLimit=maxConnections}={})=>{target.maxConnections=connectionLimit;target.headersTimeout=headersTimeoutMs;target.requestTimeout=requestTimeoutMs;target.keepAliveTimeout=keepAliveTimeoutMs;target.maxRequestsPerSocket=maxRequestsPerSocket;const sockets=new Set();target.on('connection',(socket)=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));if(sockets.size>connectionLimit)socket.destroy();});return sockets;};
let publicServer;
publicServer=http.createServer(handleRequest({publicOnly:Boolean(controlSocketPath),expectedHost:()=>publicAuthority||`${host}:${publicServer.address()?.port??port}`}));
const publicSockets=configureServer(publicServer);
const controlServer=controlSocketPath?http.createServer(handleRequest({publicOnly:false,expectedHost:()=> 'fieldnode.local'})):null;
const controlSockets=controlServer?configureServer(controlServer,{connectionLimit:Math.max(8,Math.floor(maxConnections/2))}):new Set();

const listenPublic=()=>publicServer.listen(port,host,()=>{const address=publicServer.address();startup.listenerAt=new Date().toISOString();startup.servicesReadyAt=startup.listenerAt;startup.state='services_ready';startup.ready=true;process.stdout.write(`${JSON.stringify({event:'FIELDNET_LISTENING',host,port:address.port,nodeId,dbPath,controlTransport:controlSocketPath?'UNIX_SOCKET_0600':'ISOLATED_SHARED_TCP_PROOF_ONLY',controlSocket:controlSocketPath,listenerReadyMs:Number((performance.now()-monotonicStartedAt).toFixed(3)),readiness:readinessSnapshot()})}\n`);});
if(controlServer){mkdirSync(path.dirname(controlSocketPath),{recursive:true,mode:0o700});try{unlinkSync(controlSocketPath);}catch(error){if(error.code!=='ENOENT')throw error;}controlServer.listen(controlSocketPath,()=>{chmodSync(controlSocketPath,0o600);listenPublic();});}else listenPublic();

const monitor = centralUrl ? setInterval(() => { service.checkCentral().catch(() => {}); }, monitorIntervalMs) : null;
if (monitor) { monitor.unref(); setTimeout(() => { service.checkCentral().catch(() => {}); }, 25).unref(); }

const close = () => {
  if (monitor) clearInterval(monitor);
  sensorGateway.close();
  streams.close();
  for(const socket of [...publicSockets,...controlSockets])socket.destroy();
  let pending=controlServer?2:1;const done=()=>{pending-=1;if(pending)return;try{if(controlSocketPath)unlinkSync(controlSocketPath);}catch(error){if(error.code!=='ENOENT')process.stderr.write(`${error.message}\n`);}store.close();process.exit(0);};
  publicServer.close(done);if(controlServer)controlServer.close(done);
};
process.on('SIGTERM', close);
process.on('SIGINT', close);
