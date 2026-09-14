import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { loadConfig } from './config/env.mjs';
import { Router } from './http/router.mjs';
import { json, problem } from './http/responses.mjs';
import { applySecurityHeaders } from './http/security-headers.mjs';
import { SseHub } from './stream/sse-hub.mjs';
import { createServices } from './application/create-services.mjs';
import { createRuntime } from './application/create-runtime.mjs';
import { registerRoutes } from './application/register-routes.mjs';
import { resolveRequestActor } from './modules/control/request-context.mjs';
import { createLocalShadowSessionService } from './modules/session/local-shadow-session-service.mjs';
import { ReleaseIdentityService } from './modules/release/release-identity-service.mjs';
import './shared/runtime-profiler.mjs';
import { createOperatorProxyAuthenticator,operatorProxyPublicFailure } from './http/operator-proxy-auth.mjs';

function openBrowser(url) {
  const command = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  const child = spawn(command[0], command[1], { detached: true, stdio: 'ignore' }); child.unref();
}
const processStartedAt = new Date(performance.timeOrigin).toISOString();
const environmentConfig=loadConfig();const releaseIdentityService=new ReleaseIdentityService({projectRoot:environmentConfig.projectRoot,runtimeProfile:environmentConfig.runtimeProfile,component:'api',expectedReleaseId:environmentConfig.releaseIdAssertion,expectedCodeStateHash:environmentConfig.codeStateHashAssertion,expectedOperationalDataHash:environmentConfig.operationalDataHashAssertion,expectedStatementHash:environmentConfig.releaseStatementHashAssertion});const releaseIdentity=releaseIdentityService.identity();const config=Object.freeze({...environmentConfig,releaseId:releaseIdentity.releaseId});const hub = new SseHub(); const sessionService=createLocalShadowSessionService(config);const authenticateOperatorProxyRequest=createOperatorProxyAuthenticator({key:config.operatorProxyKey,releaseId:config.releaseId});
let services = null; let runtime = null; let router = null; let startupError = null;
const startup = { processStartedAt, listenerAt: null, servicesReadyAt: null, listenerMs: null, servicesReadyMs: null, phase: 'process_starting', subphase:null,phaseStartedAt: processStartedAt, lastCompletedPhase: null, phaseHistory: [] };
function recordStartupPhase({phase,state,at,...details}){
  const observedAt=at??new Date().toISOString(),entry={phase:String(phase),state:String(state),at:observedAt,...details};
  if(entry.state==='started'){startup.phase=entry.phase;startup.phaseStartedAt=observedAt;}
  if(entry.state==='completed')startup.lastCompletedPhase=entry.phase;
  if(entry.subphase&&entry.state==='subphase_started')startup.subphase=entry.subphase;
  if(entry.subphase&&['subphase_completed','subphase_failed','subphase_skipped'].includes(entry.state))startup.subphase=entry.subphase;
  if(entry.state==='completed')startup.subphase=null;
  startup.phaseHistory.push(entry);if(startup.phaseHistory.length>64)startup.phaseHistory.splice(0,startup.phaseHistory.length-64);
  console.log(JSON.stringify({level:'info',component:'service_startup_phase',...entry}));
}
function redactedStartupError(error){
  let value=String(error?.message??error??'unknown_startup_failure');
  value=value.replace(/postgres(?:ql)?:\/\/[^\s/@:]+(?::[^\s/@]*)?@/gi,'postgresql://[REDACTED]@').replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi,'[REDACTED CREDENTIAL]');
  return value.slice(0,500);
}
async function handleHttpRequest(req,res){
  const receivedCorrelation=String(req.headers['x-vigia-correlation-id']??''),correlationId=/^[A-Za-z0-9._:-]{8,128}$/.test(receivedCorrelation)?receivedCorrelation:randomUUID(),requestStarted=performance.now();
  req.socket.setNoDelay?.(true);
  req.vigiaCorrelationId=correlationId;res.setHeader('X-VIGIA-Correlation-ID',correlationId);res.setHeader('X-VIGIA-Release-ID',releaseIdentityService.identity().releaseId);
  res.once('finish',()=>{const pathname=(()=>{try{return new URL(req.url,'http://localhost').pathname}catch{return'invalid'}})(),incidentMatch=pathname.match(/\/(?:incidents|events)\/([^/]+)/),incidentId=(()=>{try{return incidentMatch?decodeURIComponent(incidentMatch[1]).slice(0,180):null}catch{return'INVALID_ENCODING'}})();console.log(JSON.stringify({level:res.statusCode>=500?'error':res.statusCode>=400?'warn':'info',component:'http_request',at:new Date().toISOString(),correlationId,incidentId,releaseId:releaseIdentityService.identity().releaseId,method:req.method,path:pathname,status:res.statusCode,durationMs:Number((performance.now()-requestStarted).toFixed(3))}));});
  applySecurityHeaders(res);
  const requestUrl = new URL(req.url, 'http://localhost');
  if(req.method==='GET'&&requestUrl.pathname==='/api/v10/release')return json(res,200,releaseIdentityService.snapshot({runtime,services,startup,startupError}));
  if (!router || !services || !runtime) {
    const url = requestUrl;
    if (req.method === 'GET' && ['/live','/api/v10/live','/api/v1/health','/api/v2/health','/api/v9/health','/api/v10/health'].includes(url.pathname)) return json(res, 200, { status: startupError ? 'degraded' : 'starting', version: '10.0.0', product: 'VIGIA Physical Intelligence Core', universe: 'production', sourceRefreshState: startupError ? 'startup_failed' : 'services_loading', startedAt: processStartedAt, startup:{...startup,state:startupError?'failed':'loading',startupState:startupError?'failed':'loading',ready:false,...(config.runtimeProfile==='local_shadow'&&startupError?{error:startupError}:{})} });
    return problem(res, 503, startupError ? 'runtime_startup_failed' : 'runtime_starting', startupError ? 'The runtime is unavailable. Inspect authenticated operational diagnostics.' : 'The HTTP listener is available while local state and services finish loading. Retry shortly.');
  }
  await authenticateOperatorProxyRequest(req);
  const actor = resolveRequestActor(req, services.controlService, config, sessionService);
  const handled = await router.safeHandle(req, res, { services, runtime, actor }); if (handled) return;
  problem(res, 404, 'not_found', 'Route not found. The canonical Operator Console is served separately on port 4190.');
}
const server = http.createServer((req, res) => {
  void handleHttpRequest(req,res).catch((error)=>{
    if(res.headersSent||res.destroyed){res.destroy();return;}
    applySecurityHeaders(res);
    const malformed=error?.code==='ERR_INVALID_URL'||error instanceof URIError,proxyFailure=operatorProxyPublicFailure(error);
    if(!malformed)console.error(JSON.stringify({level:'error',component:'http_request_boundary',at:new Date().toISOString(),method:req.method,error:String(error?.message??error).slice(0,240),...(error?.operatorProxyAuditReason?{operatorProxyAuditReason:error.operatorProxyAuditReason}:{}),...(Number.isFinite(error?.operatorProxyAgeMs)?{operatorProxyAgeMs:error.operatorProxyAgeMs,operatorProxyMaximumAgeMs:error.operatorProxyMaximumAgeMs}:{})}));
    const status=malformed?400:proxyFailure?.status??500,code=malformed?'malformed_request_target':proxyFailure?.code??'request_boundary_failed';
    problem(res,status,code,status===500?'Unexpected server error.':code.replaceAll('_',' '));
  });
});
server.on('clientError',(_error,socket)=>{if(!socket.writable||socket.destroyed)return;socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');});
server.maxConnections=128;
server.headersTimeout=10_000;
server.requestTimeout=20_000;
server.keepAliveTimeout=5_000;
server.maxRequestsPerSocket=100;
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.port, config.host, resolve); });
startup.listenerAt = new Date().toISOString(); startup.listenerMs = Math.round(performance.now());
startup.phase = 'listener_ready'; startup.phaseStartedAt = startup.listenerAt;
const address = server.address(); const port = typeof address === 'object' && address ? address.port : config.port; const url = `http://${config.host}:${port}`;
console.log(`\nVIGIA 10.0 Physical Intelligence Core: ${url}`); console.log('Universe: PRODUCTION · synthetic provenance rejected');console.log(`FIRMS ${config.firmsMapKey?'CONFIGURED':'NOT CONFIGURED'}${config.firmsMapKey?` · poll ${Math.round(config.firmsPollIntervalMs/1000)}s`:''}`);console.log(`SENTINEL-3 AUTH ${config.cdseAccessToken||(config.cdseUsername&&config.cdsePassword)?'CONFIGURED':'NOT CONFIGURED'}`);console.log('POSTGIS INITIALIZING');
console.log(`HTTP LISTENER READY · ${startup.listenerMs}ms · services loading in background`);
void (async()=>{
  try {
    services = await createServices({ config, hub, releaseIdentity, onStartupPhase:recordStartupPhase }); runtime = createRuntime({ config, services, hub, startup }); router = new Router(); registerRoutes(router, { services, hub, runtime, sessionService,releaseIdentityService });
    startup.servicesReadyAt = new Date().toISOString(); startup.servicesReadyMs = Math.round(performance.now());
    startup.phase = 'services_ready'; startup.phaseStartedAt = startup.servicesReadyAt;
    console.log(`LOCAL SERVICES READY · ${startup.servicesReadyMs}ms · POSTGIS ${services.physicalTruthStore.status().state.toUpperCase()}`);
    runtime.startTimers(); void runtime.initialize();
  } catch (error) { startupError = redactedStartupError(error); console.error(JSON.stringify({ level:'error', component:'service_startup', at:new Date().toISOString(), error:startupError })); }
})();
if (config.openBrowser) setTimeout(() => openBrowser(url), 250).unref?.();
const shutdown = () => { runtime?.stop?.(); server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 3_000).unref?.(); };
process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
