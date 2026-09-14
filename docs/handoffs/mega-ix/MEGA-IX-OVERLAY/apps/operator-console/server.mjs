import http from 'node:http';
import { createHash,createHmac,randomBytes,timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyOneTimeAdmission } from './admission.mjs';
import { signOperatorProxyRequest } from '../../packages/domain/src/operator-proxy/request-auth.mjs';
import { computeOperatorAssetTree } from './asset-integrity.mjs';
import { retryableProxyTransport } from './proxy-transport.mjs';
import {createBasemapDelivery} from './basemap-delivery.mjs';

const packageRoot = fileURLToPath(new URL('.', import.meta.url));
const root = process.env.VIGIA_OPERATOR_STATIC_ROOT ? join(packageRoot, process.env.VIGIA_OPERATOR_STATIC_ROOT) : packageRoot;
if (root !== packageRoot && root !== join(packageRoot, 'dist')) throw new Error('operator_console_static_root_must_be_package_or_dist');
const port = Number(process.env.PORT || 4190);
const host = process.env.HOST || '127.0.0.1';
const authority = process.env.VIGIA_OPERATOR_PUBLIC_AUTHORITY || `${host}:${port}`;
if(!/^[A-Za-z0-9.-]+:\d{2,5}$/.test(authority))throw new Error('operator_console_public_authority_invalid');
const consoleOrigin = `http://${authority}`;
const backendUrl = new URL(process.env.VIGIA_BACKEND_URL || 'http://127.0.0.1:4177');
if (!['http:', 'https:'].includes(backendUrl.protocol) || backendUrl.username || backendUrl.password) throw new Error('operator_console_backend_url_invalid');
const backend = backendUrl.origin;
const basemapMode=process.env.VIGIA_OPERATOR_BASEMAP_MODE??'isolated';
if(!['isolated','backend'].includes(basemapMode))throw new Error('operator_basemap_mode_invalid');
const deliverBasemap=basemapMode==='isolated'?createBasemapDelivery():async()=>false;
const proxyKeyFile = process.env.VIGIA_OPERATOR_PROXY_KEY_FILE || process.env.VIGIA_OPERATOR_TOKEN_FILE || fileURLToPath(new URL('../../.tmp/release/operator-token', import.meta.url));
const operatorProxyKey = String(process.env.VIGIA_OPERATOR_PROXY_KEY || process.env.VIGIA_OPERATOR_TOKEN || (()=>{try{return readFileSync(proxyKeyFile,'utf8').trim();}catch{return'';}})());
const accessTokenFile=process.env.VIGIA_OPERATOR_ACCESS_TOKEN_FILE||fileURLToPath(new URL('../../.tmp/release/operator-console-access-token',import.meta.url));
const operatorAccessToken=String(process.env.VIGIA_OPERATOR_ACCESS_TOKEN||(()=>{try{return readFileSync(accessTokenFile,'utf8').trim();}catch{return'';}})());
if(Boolean(operatorProxyKey)!==Boolean(operatorAccessToken))throw new Error('operator_console_credentials_incomplete');
if(operatorProxyKey&&operatorProxyKey.length<32)throw new Error('operator_console_proxy_key_invalid');
const admissionCookieName='vigia_operator_access';
const usedAdmissionNonces=new Map();
const admissionCookieSeconds=8*60*60;
const admissionSessions=new Map();
const maxAdmissionSessions=128;
const buildIdentity=(()=>{try{return JSON.parse(readFileSync(join(root,'build-manifest.json'),'utf8'));}catch{return null;}})();
const servedAssetIdentity=buildIdentity?computeOperatorAssetTree(root):null;
const expectedReleaseId=String(process.env.VIGIA_RELEASE_ID??'').trim();
const expectedOperationalDataHash=String(process.env.VIGIA_OPERATIONAL_DATA_HASH??'').trim(),expectedStatementHash=String(process.env.VIGIA_APPROVED_RELEASE_STATEMENT_SHA256??'').trim();
if(buildIdentity&&servedAssetIdentity.assetDigest!==buildIdentity.assetDigest)throw new Error('operator_console_served_asset_digest_mismatch');
if(expectedReleaseId&&(!buildIdentity||buildIdentity.releaseId!==expectedReleaseId||buildIdentity.operationalDataHash!==expectedOperationalDataHash||buildIdentity.releaseStatementHash!==expectedStatementHash||!String(buildIdentity.codeStateHash??'').startsWith('sha256:')||!String(buildIdentity.operatorSourceHash??'').startsWith('sha256:')||!String(servedAssetIdentity?.assetDigest??'').startsWith('sha256:')))throw new Error('operator_console_release_identity_mismatch');
const portugalBoundaryPath=fileURLToPath(new URL('../../data/replay/raw/openstreetmap/portugal-thermal-context-v1/portugal-boundary.json',import.meta.url));
const boundaryBytes=readFileSync(portugalBoundaryPath);if(boundaryBytes.length>8*1024*1024||`sha256:${createHash('sha256').update(boundaryBytes).digest('hex')}`!==buildIdentity?.boundary?.sha256||boundaryBytes.length!==buildIdentity?.boundary?.bytes)throw new Error('operator_console_boundary_identity_mismatch');
const maxProxyRequestBytes = 2_000_000;
const maxProxyResponseBytes = 32_000_000;
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.tif': 'image/tiff', '.tiff': 'image/tiff'
};
const consoleCsp="default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; media-src 'self' blob:; worker-src 'self'; manifest-src 'self'";
function securityHeaders(res,{document=false}={}){if(document)res.setHeader('Content-Security-Policy',consoleCsp);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');}
function equalText(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&x.length>0&&timingSafeEqual(x,y);}
function cookie(req,name){for(const part of String(req.headers.cookie??'').split(';')){const [key,...value]=part.trim().split('=');if(key===name)return value.join('=');}return'';}
function pruneAdmissionSessions(now=Date.now()){for(const[id,session]of admissionSessions)if(session.expiresAt<=now)admissionSessions.delete(id);}
function issueAdmissionSession(){const now=Date.now();pruneAdmissionSessions(now);if(admissionSessions.size>=maxAdmissionSessions)throw new Error('operator_admission_capacity_reached');const id=randomBytes(32).toString('base64url');admissionSessions.set(id,{createdAt:now,expiresAt:now+admissionCookieSeconds*1000,releaseId:buildIdentity?.releaseId??null});return id;}
function admitted(req){const id=cookie(req,admissionCookieName),now=Date.now();pruneAdmissionSessions(now);const session=admissionSessions.get(id);return Boolean(operatorAccessToken&&session&&session.expiresAt>now&&session.releaseId===(buildIdentity?.releaseId??null));}
function listenerProof(challenge){return createHmac('sha256',operatorAccessToken).update(['operator-console-listener-proof-v1',challenge,buildIdentity?.releaseId??'',buildIdentity?.codeStateHash??'',servedAssetIdentity?.assetDigest??''].join('\0')).digest('hex');}
function acceptOneTimeAdmission(value){
  const now=Date.now();
  for(const [nonce,expiresAt] of usedAdmissionNonces)if(expiresAt<now)usedAdmissionNonces.delete(nonce);
  if(usedAdmissionNonces.size>=128)throw new Error('operator_admission_capacity_reached');
  const nonces=new Set(usedAdmissionNonces.keys()),claim=verifyOneTimeAdmission(value,operatorAccessToken,{now,usedNonces:nonces});
  usedAdmissionNonces.set(claim.nonce,claim.exp*1000);
}
function writeJson(res, status, payload) {
  securityHeaders(res);
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, { 'content-type':'application/json; charset=utf-8', 'content-length': body.length, 'cache-control':'no-store', 'x-content-type-options':'nosniff' });
  res.end(body);
}
async function proxy(req, res, upstreamPath) {
  const controller = new AbortController();
  // A governed source refresh performs several real provider calls and can
  // legitimately run longer than an ordinary UI read. Keep both paths
  // bounded, while allowing that explicit operator action to complete.
  const timeoutMs = upstreamPath.startsWith('/api/v1/world/refresh') ? 45_000 : 25_000;
  const inboundTimeout=Object.assign(new Error('operator_proxy_request_timeout'),{statusCode:408});
  const clientDisconnected=new Error('operator_proxy_client_disconnected');
  const abortClient=()=>{if(!res.writableEnded&&!controller.signal.aborted)controller.abort(clientDisconnected);};
  req.once('aborted',abortClient);
  res.once('close',abortClient);
  const timer = setTimeout(() => {controller.abort(inboundTimeout);if(!req.complete&&!req.destroyed)req.destroy(inboundTimeout);}, timeoutMs);
  try {
    if (!upstreamPath.startsWith('/') || upstreamPath.startsWith('//') || upstreamPath.includes('\\')) throw Object.assign(new Error('operator_proxy_path_invalid'), { statusCode: 400 });
    const target = new URL(`.${upstreamPath}`, `${backend}/`);
    if (target.origin !== backend) throw Object.assign(new Error('operator_proxy_target_invalid'), { statusCode: 400 });
    const chunks=[]; let requestBytes=0;
    for await (const chunk of req) {
      requestBytes += chunk.length;
      if (requestBytes > maxProxyRequestBytes) throw Object.assign(new Error('operator_proxy_request_too_large'), { statusCode: 413 });
      chunks.push(chunk);
    }
    const body=chunks.length?Buffer.concat(chunks):undefined;
    const headers = {};
    for (const name of ['accept','content-type','user-agent','origin','sec-fetch-site','if-none-match','if-modified-since','x-vigia-operator-intent']) {
      const value=req.headers[name]; if(value) headers[name]=value;
    }
    headers.origin=consoleOrigin;
    headers['sec-fetch-site']='same-origin';
    headers['x-vigia-ui-proxy']='mission-dark-realdata-2.0';
    const performUpstream=async()=>{
      const attemptHeaders={...headers,connection:'close'};
      Object.assign(attemptHeaders,signOperatorProxyRequest({key:operatorProxyKey,releaseId:buildIdentity.releaseId,method:req.method,path:`${target.pathname}${target.search}`,bodyBytes:body??Buffer.alloc(0),intent:String(headers['x-vigia-operator-intent']??'')}));
      const response=await fetch(target,{method:req.method,headers:attemptHeaders,body:['GET','HEAD'].includes(req.method||'GET')?undefined:body,redirect:'manual',signal:controller.signal});
      const responseChunks=[];let responseBytes=0;
      if(response.body)for await(const chunk of response.body){
        const bytes=Buffer.from(chunk);responseBytes+=bytes.length;
        if(responseBytes>maxProxyResponseBytes){controller.abort();throw Object.assign(new Error('operator_proxy_response_too_large'),{statusCode:502});}
        responseChunks.push(bytes);
      }
      return{response,out:Buffer.concat(responseChunks,responseBytes)};
    };
    let upstream;
    try{upstream=await performUpstream();}
    catch(error){
      if(controller.signal.aborted||error?.statusCode||!retryableProxyTransport(req.method,body,headers['content-type']))throw error;
      console.warn(JSON.stringify({level:'warn',component:'operator_proxy_transport_retry',at:new Date().toISOString(),method:req.method,path:target.pathname,error:String(error?.cause?.code||error?.code||error?.message||'transport_failure')}));
      upstream=await performUpstream();
    }
    const {response,out}=upstream,copyHeaders={};
    for(const name of ['content-type','cache-control','etag','last-modified','x-vigia-provider','x-vigia-acquired-at','x-vigia-last-good-at','x-vigia-source-state','x-vigia-provenance','x-content-type-options']){
      const value=response.headers.get(name);if(value)copyHeaders[name]=value;
    }
    copyHeaders['content-length']=String(out.length);
    res.writeHead(response.status,copyHeaders);res.end(out);
  } catch (error) {
    const disconnected=!error?.statusCode&&controller.signal.reason===clientDisconnected;
    if(disconnected){if(!res.destroyed)res.destroy();return;}
    if(!res.destroyed)writeJson(res, Number(error?.statusCode) || (controller.signal.reason===inboundTimeout?408:502), { error:controller.signal.reason===inboundTimeout?'operator_proxy_request_timeout':'canonical_vigia_backend_unavailable' });
  } finally { clearTimeout(timer);req.removeListener('aborted',abortClient);res.removeListener('close',abortClient); }
}
async function handleRequest(req,res) {
  securityHeaders(res);
  if(String(req.headers.host??'')!==authority)return writeJson(res,421,{error:'operator_console_authority_rejected'});
  const url = new URL(req.url || '/', consoleOrigin);
  if(url.pathname==='/'&&(url.searchParams.has('admission')||url.searchParams.has('access'))){
    if(req.method!=='GET'||!url.searchParams.has('admission'))return writeJson(res,403,{error:'operator_console_one_time_admission_required'});
    let admissionSession;
    try{acceptOneTimeAdmission(String(url.searchParams.get('admission')??''));admissionSession=issueAdmissionSession();}
    catch(error){return writeJson(res,error?.message==='operator_admission_capacity_reached'?503:403,{error:error?.message??'operator_admission_rejected'});}
    securityHeaders(res,{document:true});res.writeHead(303,{'cache-control':'no-store','location':'/#/command-overview','set-cookie':`${admissionCookieName}=${admissionSession}; Path=/; Max-Age=${admissionCookieSeconds}; HttpOnly; SameSite=Strict`});res.end();return;
  }
  if(url.pathname==='/__operator/prove'){
    const challenge=String(url.searchParams.get('challenge')??'');
    if(req.method!=='GET'||!operatorAccessToken||!/^[a-f0-9]{64}$/.test(challenge))return writeJson(res,400,{error:'operator_console_proof_challenge_invalid'});
    return writeJson(res,200,{schemaVersion:'vigia.operator-listener-proof.v1',challenge,releaseId:buildIdentity?.releaseId??null,codeStateHash:buildIdentity?.codeStateHash??null,assetDigest:servedAssetIdentity?.assetDigest??null,proof:listenerProof(challenge)});
  }
  if(url.pathname.startsWith('/backend/')){
    const fetchSite=String(req.headers['sec-fetch-site']??'').toLowerCase();
    if(!admitted(req)||fetchSite!=='same-origin'||(req.headers.origin&&req.headers.origin!==consoleOrigin))return writeJson(res,403,{error:'operator_console_origin_rejected'});
    if(req.method==='POST'&&url.pathname==='/backend/api/v10/session'&&req.headers.origin!==consoleOrigin)return writeJson(res,403,{error:'operator_console_origin_rejected'});
    if(await deliverBasemap(req,res,url.pathname))return;
  }
  if(url.pathname==='/__operator/logout'){
    if(req.method!=='POST'||!admitted(req)||String(req.headers['sec-fetch-site']??'').toLowerCase()!=='same-origin'||req.headers.origin!==consoleOrigin)return writeJson(res,403,{error:'operator_console_origin_rejected'});
    admissionSessions.delete(cookie(req,admissionCookieName));securityHeaders(res);res.writeHead(204,{'cache-control':'no-store','clear-site-data':'"cache", "storage"','set-cookie':`${admissionCookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`});res.end();return;
  }
  if (url.pathname === '/__operator/ready') {
    return writeJson(res, 200, {
      ok: true,
      frontend: 'operator-console',
      path: 'apps/operator-console',
      version: '2.1.0',
      releaseId:buildIdentity?.releaseId??null,
      codeStateHash:buildIdentity?.codeStateHash??null,
      operationalDataHash:buildIdentity?.operationalDataHash??null,
      releaseStatementHash:buildIdentity?.releaseStatementHash??null,
      sourceHash:buildIdentity?.operatorSourceHash??null,
      assetDigest:servedAssetIdentity?.assetDigest??null,
      servedAssetFiles:servedAssetIdentity?.files??null,
      servedAssetBytes:servedAssetIdentity?.bytes??null,
    });
  }
  if(url.pathname==='/__operator/portugal-boundary'){
    if(req.method!=='GET')return writeJson(res,405,{error:'method_not_allowed'});
    const metadata=statSync(portugalBoundaryPath);if(metadata.size!==buildIdentity.boundary.bytes||metadata.size>8*1024*1024)return writeJson(res,503,{error:'operator_boundary_unavailable'});securityHeaders(res);res.writeHead(200,{'content-type':'application/json; charset=utf-8','content-length':metadata.size,'cache-control':'public, max-age=86400','x-vigia-provider':'OpenStreetMap governed Portugal boundary','x-vigia-content-sha256':buildIdentity.boundary.sha256,'x-content-type-options':'nosniff'});createReadStream(portugalBoundaryPath).pipe(res);return;
  }
  if (url.pathname === '/backend/__health') {
    try {
      // The operator health probe must measure the API health boundary, not a
      // potentially expensive incident inventory projection. Using /events
      // here caused healthy runtimes to flash unavailable when the projection
      // store was busy even though the API listener and services were ready.
      const target=new URL('/api/v10/health',backend),headers={accept:'application/json',origin:consoleOrigin,'sec-fetch-site':'same-origin','x-vigia-ui-proxy':'mission-dark-realdata-2.0',...signOperatorProxyRequest({key:operatorProxyKey,releaseId:buildIdentity.releaseId,method:'GET',path:`${target.pathname}${target.search}`})};
      const response = await fetch(target, { headers, signal:AbortSignal.timeout(3500) });
      return writeJson(res, response.ok ? 200 : 503, { ok:response.ok, status:response.status });
    } catch { return writeJson(res, 503, { ok:false, error:'canonical_vigia_backend_unavailable' }); }
  }
  if (url.pathname.startsWith('/backend/')) return proxy(req, res, `${url.pathname.slice('/backend'.length)}${url.search}`);

  const raw = decodeURIComponent(url.pathname);
  const safe = normalize(raw).replace(/^(\.\.(\/|\\|$))+/, '');
  let path = join(root, safe === '/' ? 'index.html' : safe);
  if (!existsSync(path) || statSync(path).isDirectory()) path = join(root, 'index.html');
  securityHeaders(res,{document:extname(path)==='.html'});
  const assetStat=statSync(path),isDocument=extname(path)==='.html';
  // URLs are stable across releases: revalidate them rather than incorrectly
  // declaring them immutable. Live API responses retain their no-store policy.
  const etag=`W/"${assetStat.size.toString(16)}-${Math.trunc(assetStat.mtimeMs).toString(16)}"`;
  res.setHeader('Cache-Control',isDocument?'no-store':'private, max-age=0, must-revalidate');
  if(!isDocument){res.setHeader('ETag',etag);if(req.headers['if-none-match']===etag){res.writeHead(304);res.end();return;}}
  res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
  createReadStream(path).on('error', () => { res.statusCode = 500; res.end('Unable to read asset'); }).pipe(res);
}

const server = http.createServer((req, res) => {
  handleRequest(req,res).catch((error)=>{
    if(res.headersSent){res.destroy();return;}
    const status=error instanceof URIError?400:Number(error?.statusCode)||500;
    writeJson(res,status,{error:status===400?'malformed_request_path':'operator_console_request_failed'});
  });
});
server.maxConnections=128;
server.headersTimeout=10_000;
server.requestTimeout=50_000;
server.keepAliveTimeout=5_000;
server.maxRequestsPerSocket=100;
server.on('clientError',(_error,socket)=>{if(!socket.writable||socket.destroyed)return;socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');});
const sockets=new Set();server.on('connection',(socket)=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});

server.listen(port, host, () => {
  console.log(`VIGIA Operator Console 2.1.0 running at http://${host}:${port}/#/command-overview`);
  console.log(`Static product root: ${root}`);
  console.log(`Canonical VIGIA backend: ${backend}`);
});
const shutdown=()=>{admissionSessions.clear();server.close(()=>process.exit(0));for(const socket of sockets)socket.end();setTimeout(()=>{for(const socket of sockets)socket.destroy();process.exit(1);},3_000).unref?.();};
process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
