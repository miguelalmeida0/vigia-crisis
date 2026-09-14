import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createHmac } from 'node:crypto';
import { createOneTimeAdmission } from '../../operator-console/admission.mjs';

const projectRoot=fileURLToPath(new URL('../../..',import.meta.url));
const serverEntry=fileURLToPath(new URL('../../operator-console/server.mjs',import.meta.url));

const freePort=async()=>{
  const server=net.createServer();
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const port=server.address().port;
  await new Promise((resolve,reject)=>server.close((error)=>error?reject(error):resolve()));
  return port;
};

const waitForReady=async(origin,child)=>{
  const deadline=Date.now()+8_000;
  while(Date.now()<deadline){
    if(child.exitCode!==null)throw new Error(`operator_console_exited_${child.exitCode}`);
    try{const response=await fetch(`${origin}/__operator/ready`);if(response.ok)return;}catch{}
    await new Promise(resolve=>setTimeout(resolve,40));
  }
  throw new Error('operator_console_test_start_timeout');
};

test('production operator runtime applies document CSP without attaching it to proxied binary data',async(t)=>{
  const backendPort=await freePort();
  const operatorPort=await freePort();
  const binary=Buffer.from([0,1,2,3,255,128,64]);
  let sessionAuthorization=null,imageAuthorization=null,sessionCookie=null,imageCookie=null,sessionSignature=null,imageSignature=null;
  const backend=http.createServer((req,res)=>{
    if(req.url==='/api/v1/test-image'){
      imageAuthorization=req.headers.authorization??null;
      imageCookie=req.headers.cookie??null;imageSignature=req.headers['x-vigia-operator-signature']??null;
      res.writeHead(200,{'content-type':'image/png','content-length':binary.length,'cache-control':'private, max-age=60'});
      res.end(binary);
      return;
    }
    if(req.url==='/api/v10/session'&&req.method==='POST'){
      sessionAuthorization=req.headers.authorization??null;
      sessionCookie=req.headers.cookie??null;sessionSignature=req.headers['x-vigia-operator-signature']??null;
      const body=Buffer.from('{"authenticated":true}');res.writeHead(200,{'content-type':'application/json','content-length':body.length});res.end(body);return;
    }
    res.writeHead(404,{'content-type':'application/json'});
    res.end('{}');
  });
  backend.listen(backendPort,'127.0.0.1');
  await once(backend,'listening');
  t.after(()=>new Promise(resolve=>backend.close(()=>resolve())));

  const child=spawn(process.execPath,[serverEntry],{
    cwd:projectRoot,
    env:{...process.env,PORT:String(operatorPort),HOST:'127.0.0.1',VIGIA_OPERATOR_STATIC_ROOT:'dist',VIGIA_BACKEND_URL:`http://127.0.0.1:${backendPort}`,VIGIA_OPERATOR_TOKEN:'operator-proxy-test-token-32-bytes',VIGIA_OPERATOR_ACCESS_TOKEN:'operator-console-access-test-token-32-bytes'},
    stdio:['ignore','pipe','pipe'],
  });
  t.after(()=>{if(child.exitCode===null)child.kill('SIGTERM');});
  const origin=`http://127.0.0.1:${operatorPort}`;
  await waitForReady(origin,child);

  for(const path of ['/','/route-that-uses-the-spa-fallback']){
    const response=await fetch(`${origin}${path}`);
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-type')??'',/^text\/html/);
    const csp=response.headers.get('content-security-policy')??'';
    for(const directive of ["default-src 'self'","script-src 'self'","object-src 'none'","base-uri 'none'","frame-ancestors 'none'","connect-src 'self'","worker-src 'self'","manifest-src 'self'"])assert.match(csp,new RegExp(directive.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
    assert.doesNotMatch(csp,/unsafe-eval|default-src \*/);
    assert.equal(response.headers.get('referrer-policy'),'no-referrer');
    assert.equal(response.headers.get('permissions-policy'),'camera=(), microphone=(), geolocation=()');
    assert.equal(response.headers.get('cache-control'),'no-store');
  }

  const headerless=await fetch(`${origin}/backend/api/v10/session`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  assert.equal(headerless.status,403);assert.equal(sessionAuthorization,null);
  const forgedWithoutAdmission=await fetch(`${origin}/backend/api/v10/session`,{method:'POST',headers:{origin,'sec-fetch-site':'same-origin','content-type':'application/json'},body:'{}'});
  assert.equal(forgedWithoutAdmission.status,403);assert.equal(sessionAuthorization,null);
  const challenge='a'.repeat(64),proof=await fetch(`${origin}/__operator/prove?challenge=${challenge}`).then((response)=>response.json()),proofMaterial=['operator-console-listener-proof-v1',challenge,proof.releaseId??'',proof.codeStateHash??'',proof.assetDigest??''].join('\0'),expectedProof=createHmac('sha256','operator-console-access-test-token-32-bytes').update(proofMaterial).digest('hex');assert.equal(proof.schemaVersion,'vigia.operator-listener-proof.v1');assert.equal(proof.proof,expectedProof);
  const oneTime=createOneTimeAdmission('operator-console-access-test-token-32-bytes');
  const admission=await fetch(`${origin}/?admission=${encodeURIComponent(oneTime)}`,{redirect:'manual'});
  assert.equal(admission.status,303);assert.equal(admission.headers.get('location'),'/#/command-overview');
  const replay=await fetch(`${origin}/?admission=${encodeURIComponent(oneTime)}`,{redirect:'manual'});assert.equal(replay.status,403);
  const legacy=await fetch(`${origin}/?access=operator-console-access-test-token-32-bytes`,{redirect:'manual'});assert.equal(legacy.status,403);
  const cookie=String(admission.headers.get('set-cookie')).split(';')[0];assert.match(cookie,/^vigia_operator_access=/);assert.doesNotMatch(cookie,/operator-console-access-test-token/);
  const proxied=await fetch(`${origin}/backend/api/v1/test-image`,{headers:{cookie,'sec-fetch-site':'same-origin'}});
  assert.equal(proxied.status,200);
  assert.equal(proxied.headers.get('content-type'),'image/png');
  assert.equal(proxied.headers.get('content-security-policy'),null);
  assert.deepEqual(Buffer.from(await proxied.arrayBuffer()),binary);
  assert.equal(imageAuthorization,null);assert.equal(imageCookie,null);assert.match(imageSignature,/^[A-Za-z0-9_-]{43}$/);
  const session=await fetch(`${origin}/backend/api/v10/session`,{method:'POST',headers:{cookie,origin,'sec-fetch-site':'same-origin','content-type':'application/json'},body:'{}'});
  assert.equal(session.status,200);assert.equal(sessionAuthorization,null);assert.equal(sessionCookie,null);assert.match(sessionSignature,/^[A-Za-z0-9_-]{43}$/);assert.doesNotMatch(await session.text(),/operator-proxy-test-token/);
  const logout=await fetch(`${origin}/__operator/logout`,{method:'POST',headers:{cookie,origin,'sec-fetch-site':'same-origin'}});assert.equal(logout.status,204);assert.match(logout.headers.get('set-cookie')??'',/Max-Age=0/);
  const revoked=await fetch(`${origin}/backend/api/v1/test-image`,{headers:{cookie,'sec-fetch-site':'same-origin'}});assert.equal(revoked.status,403);
});
