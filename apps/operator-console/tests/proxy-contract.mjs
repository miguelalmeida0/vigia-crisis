import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createOneTimeAdmission } from '../admission.mjs';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import net from 'node:net';
import { verifyOperatorProxyBody,verifyOperatorProxyEnvelope } from '../../../packages/domain/src/operator-proxy/request-auth.mjs';

const buildIdentity=JSON.parse(await readFile(new URL('../dist/build-manifest.json',import.meta.url),'utf8'));
const compose=await readFile(new URL('../../../infra/docker-compose.remote-shadow.yml',import.meta.url),'utf8');
assert.match(compose,/VIGIA_OPERATOR_PUBLIC_AUTHORITY:\s*"127\.0\.0\.1:\$\{VIGIA_SHADOW_PORT:-4190\}"/);
assert.match(compose,/require\('node:http'\)\.get\([^\n]+path:'\/__operator\/ready'[^\n]+headers:\{host:process\.env\.VIGIA_OPERATOR_PUBLIC_AUTHORITY\}/);
assert.doesNotMatch(compose,/fetch\('http:\/\/127\.0\.0\.1:4190\/__operator\/ready'/);
const operatorDockerfile=await readFile(new URL('../../../infra/Dockerfile.operator',import.meta.url),'utf8');
assert.match(operatorDockerfile,/COPY --from=build --chown=node:node \/opt\/vigia\/apps\/operator-console \.\/apps\/operator-console/);
const proxySource=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
assert.match(proxySource,/clientDisconnected[\s\S]*?res\.destroy\(\);return;/,'an intentionally cancelled stale browser read must not be rewritten as a synthetic 502 response');

async function freePort(){const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p;}
const upstreamPort=await freePort(),attackerPort=await freePort(),uiPort=await freePort();
let attackerHits=0,upstreamRequests=[];
const attacker=http.createServer((_req,res)=>{attackerHits+=1;res.end('escaped');});
attacker.listen(attackerPort,'127.0.0.1');await once(attacker,'listening');
let transientReadHits=0,idempotentMutationHits=0,nonIdempotentMutationHits=0,idempotentBodies=[];
const upstream=http.createServer(async(req,res)=>{
  upstreamRequests.push({url:req.url,headers:req.headers,authorization:req.headers.authorization??null,cookie:req.headers.cookie??null,origin:req.headers.origin??null,fetchSite:req.headers['sec-fetch-site']??null,proxy:req.headers['x-vigia-ui-proxy']??null});
  if(req.url==='/api/v10/transient-read'){
    transientReadHits+=1;
    if(transientReadHits===1){req.socket.destroy();return;}
    res.setHeader('content-type','application/json');return res.end(JSON.stringify({state:'recovered'}));
  }
  if(req.url==='/api/v10/transient-idempotent-mutation'){
    idempotentMutationHits+=1;const chunks=[];for await(const chunk of req)chunks.push(chunk);idempotentBodies.push(Buffer.concat(chunks).toString('utf8'));
    if(idempotentMutationHits===1){req.socket.destroy();return;}
    res.setHeader('content-type','application/json');return res.end(JSON.stringify({state:'recorded'}));
  }
  if(req.url==='/api/v10/transient-non-idempotent-mutation'){
    nonIdempotentMutationHits+=1;for await(const _chunk of req){}
    req.socket.destroy();return;
  }
  if(req.url==='/api/v10/health'){res.setHeader('content-type','application/json');return res.end(JSON.stringify({status:'degraded',startup:{ready:true,state:'services_ready'}}));}
  if(req.url==='/api/v10/events'){res.setHeader('content-type','application/json');return res.end(JSON.stringify({state:'ready',meta:{region:'Portugal mainland'},events:[{id:'evt-pt',label:'Portugal event',coordinate:[-8,40]}],summary:{},sources:{firms:{state:'current'}}}));}
  if(req.url?.startsWith('/api/v1/basemap/')){const body=Buffer.from([1,2,3,4,5]);res.writeHead(200,{'content-type':'image/png','x-vigia-provider':'test-provider'});return res.end(body);}
  res.writeHead(404,{'content-type':'application/json'});res.end(JSON.stringify({error:'not_found'}));
});
upstream.listen(upstreamPort,'127.0.0.1');await once(upstream,'listening');
const accessToken='operator-proxy-contract-access-token-32-bytes',operatorToken='configured-operator-bearer-32-bytes',childEnv={...process.env,VIGIA_OPERATOR_BASEMAP_MODE:'backend',PORT:String(uiPort),VIGIA_OPERATOR_STATIC_ROOT:'dist',VIGIA_RELEASE_ID:buildIdentity.releaseId,VIGIA_OPERATIONAL_DATA_HASH:buildIdentity.operationalDataHash,VIGIA_APPROVED_RELEASE_STATEMENT_SHA256:buildIdentity.releaseStatementHash,VIGIA_BACKEND_URL:`http://127.0.0.1:${upstreamPort}`,VIGIA_OPERATOR_TOKEN:operatorToken,VIGIA_OPERATOR_ACCESS_TOKEN:accessToken};
const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:childEnv,stdio:['ignore','pipe','pipe']});
try{
  let ready=false;for(let i=0;i<50;i++){try{const r=await fetch(`http://127.0.0.1:${uiPort}/__operator/ready`);if(r.ok){ready=true;break}}catch{}await delay(50);}assert.equal(ready,true,'frontend proxy did not become ready');
  const oneTime=createOneTimeAdmission(accessToken),admission=await fetch(`http://127.0.0.1:${uiPort}/?admission=${encodeURIComponent(oneTime)}`,{redirect:'manual'});assert.equal(admission.status,303);const cookie=String(admission.headers.get('set-cookie')).split(';')[0],sameOrigin={cookie,'sec-fetch-site':'same-origin'};
  const replay=await fetch(`http://127.0.0.1:${uiPort}/?admission=${encodeURIComponent(oneTime)}`,{redirect:'manual'});assert.equal(replay.status,403);
  const legacy=await fetch(`http://127.0.0.1:${uiPort}/?access=${encodeURIComponent(accessToken)}`,{redirect:'manual'});assert.equal(legacy.status,403);
  const health=await fetch(`http://127.0.0.1:${uiPort}/backend/__health`,{headers:sameOrigin});assert.equal(health.status,200);assert.equal('backend' in await health.json(),false);
  assert.equal(upstreamRequests.filter(item=>item.url==='/api/v10/health').length,1,'operator liveness must use the bounded API health contract rather than an incident projection');
  const events=await fetch(`http://127.0.0.1:${uiPort}/backend/api/v10/events`,{headers:{...sameOrigin,authorization:'Bearer caller-controlled'}});assert.equal(events.status,200);assert.equal(events.headers.has('x-vigia-backend'),false);const json=await events.json();assert.equal(json.events[0].id,'evt-pt');
  const transientRead=await fetch(`http://127.0.0.1:${uiPort}/backend/api/v10/transient-read`,{headers:sameOrigin});assert.equal(transientRead.status,200);assert.equal((await transientRead.json()).state,'recovered');assert.equal(transientReadHits,2,'safe reads retry once after a transport failure');
  const idempotentBody=JSON.stringify({action:'RELEASE_OWNERSHIP',idempotencyKey:'proxy-contract:release:one'}),idempotentMutation=await fetch(`http://127.0.0.1:${uiPort}/backend/api/v10/transient-idempotent-mutation`,{method:'POST',headers:{...sameOrigin,'content-type':'application/json','x-vigia-operator-intent':'operator-console'},body:idempotentBody});assert.equal(idempotentMutation.status,200);assert.equal((await idempotentMutation.json()).state,'recorded');assert.equal(idempotentMutationHits,2);assert.deepEqual(idempotentBodies,[idempotentBody,idempotentBody],'an idempotent proxy retry preserves exact request bytes');
  const nonIdempotentMutation=await fetch(`http://127.0.0.1:${uiPort}/backend/api/v10/transient-non-idempotent-mutation`,{method:'POST',headers:{...sameOrigin,'content-type':'application/json','x-vigia-operator-intent':'operator-console'},body:JSON.stringify({action:'UNSAFE_WITHOUT_KEY'})});assert.equal(nonIdempotentMutation.status,502);assert.equal(nonIdempotentMutationHits,1,'a mutation without a durable idempotency key must never retry');
  const governed=upstreamRequests.filter(item=>['/api/v10/health','/api/v10/events'].includes(item.url));assert.ok(governed.length>=2);assert.ok(governed.every(item=>item.authorization===null&&item.cookie===null));assert.ok(governed.every(item=>item.origin===`http://127.0.0.1:${uiPort}`&&item.fetchSite==='same-origin'&&item.proxy==='mission-dark-realdata-2.0'));for(const item of governed){const claim=verifyOperatorProxyEnvelope({headers:item.headers,key:operatorToken,releaseId:buildIdentity.releaseId,method:'GET',path:item.url});verifyOperatorProxyBody(claim,Buffer.alloc(0));}
  const tile=await fetch(`http://127.0.0.1:${uiPort}/backend/api/v1/basemap/imagery/8/1/1`,{headers:sameOrigin});assert.equal(tile.status,200);assert.equal(tile.headers.get('x-vigia-provider'),'test-provider');assert.deepEqual([...new Uint8Array(await tile.arrayBuffer())],[1,2,3,4,5]);
  const escaped=await new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port:uiPort,path:`/backend//127.0.0.1:${attackerPort}/secret`,method:'GET',headers:sameOrigin},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end();});
  assert.equal(escaped,400);assert.equal(attackerHits,0,'proxy escaped its configured backend origin');
  const oversized=await fetch(`http://127.0.0.1:${uiPort}/backend/api/v10/events`,{method:'POST',headers:sameOrigin,body:'x'.repeat(2_000_001)});assert.equal(oversized.status,413);
  const hostileHost=await new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port:uiPort,path:'/__operator/ready',headers:{host:`attacker.example:${uiPort}`}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end();});
  assert.equal(hostileHost,421);
  const hostileOrigin=await fetch(`http://127.0.0.1:${uiPort}/backend/api/v10/events`,{headers:{...sameOrigin,origin:`http://attacker.example:${uiPort}`}});assert.equal(hostileOrigin.status,403);
  const crossSite=await fetch(`http://127.0.0.1:${uiPort}/backend/api/v10/events`,{headers:{...sameOrigin,'sec-fetch-site':'cross-site'}});assert.equal(crossSite.status,403);
  const malformed=await new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port:uiPort,path:'/%ZZ'},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end();});assert.equal(malformed,400);
  assert.equal((await fetch(`http://127.0.0.1:${uiPort}/__operator/ready`)).status,200);
  console.log('Proxy contract passed: canonical JSON/binary traversal, exact authority/origin, malformed-path survival, and bounded request bodies.');
} finally {child.kill('SIGTERM');upstream.close();attacker.close();}
