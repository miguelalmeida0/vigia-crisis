import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { createOperatorProxyAuthenticator,operatorProxyPublicFailure } from '../src/http/operator-proxy-auth.mjs';
import { readJsonBody } from '../src/http/body.mjs';
import { resolveRequestActor } from '../src/modules/control/request-context.mjs';
import { loadConfig } from '../src/config/env.mjs';
import { signOperatorProxyRequest } from '../../../packages/domain/src/operator-proxy/request-auth.mjs';

const key='api-operator-proxy-test-key-at-least-32-bytes',releaseId='vigia-test-release',now=1_800_000_000_000;
const config={runtimeProfile:'remote_shadow',operatorProxyKey:key,operatorBearerToken:key,operatorActorId:'operator:test',operatorActorRole:'supervisor',operatorIncidentScopes:['*']};
function request({method='POST',path='/api/v2/evidence-requests',body=Buffer.from('{"incidentId":"incident-1"}'),nonce='a'.repeat(32),headers={}}={}){
  const req=Readable.from(body.length?[body]:[]);req.method=method;req.url=path;req.headers={...signOperatorProxyRequest({key,releaseId,method,path,bodyBytes:body,timestamp:now,nonce,intent:method==='GET'?'':'operator-console'}),...headers};req.socket={remoteAddress:'172.20.0.5'};return req;
}

test('API authenticates a method/path/body assertion and exposes the exact cached body',async()=>{
  const authenticate=createOperatorProxyAuthenticator({key,releaseId,now:()=>now}),req=request();
  await authenticate(req);
  const actor=resolveRequestActor(req,null,config);
  assert.equal(actor.authentication.mode,'operator_proxy_assertion');assert.equal(actor.id,'operator:test');
  assert.deepEqual(await readJsonBody(req),{incidentId:'incident-1'});
  await assert.rejects(()=>readJsonBody(req,{limitBytes:4}),/request_body_too_large/);
});

test('API rejects body substitution and reserves a nonce before concurrent body reads',async()=>{
  const authenticate=createOperatorProxyAuthenticator({key,releaseId,now:()=>now}),tampered=Buffer.from('{"incidentId":"incident-2"}');
  const changed=request({body:tampered,nonce:'c'.repeat(32)});changed.headers=signOperatorProxyRequest({key,releaseId,method:changed.method,path:changed.url,bodyBytes:Buffer.from('{"incidentId":"incident-1"}'),timestamp:now,nonce:'c'.repeat(32),intent:'operator-console'});
  await assert.rejects(()=>authenticate(changed),/operator_proxy_body_rejected/);
  const first=request({nonce:'d'.repeat(32)}),second=request({nonce:'d'.repeat(32)}),results=await Promise.allSettled([authenticate(first),authenticate(second)]);
  assert.equal(results.filter(item=>item.status==='fulfilled').length,1);assert.match(String(results.find(item=>item.status==='rejected').reason?.message),/operator_proxy_replayed/);
});

test('signed bodyless reads authenticate without waiting for a request stream end event',async()=>{
  const authenticate=createOperatorProxyAuthenticator({key,releaseId,now:()=>now}),req=new Readable({read(){}}),path='/api/v10/operator/incidents';
  req.method='GET';req.url=path;req.headers=signOperatorProxyRequest({key,releaseId,method:'GET',path,bodyBytes:Buffer.alloc(0),timestamp:now,nonce:'f'.repeat(32)});req.socket={remoteAddress:'172.20.0.5'};
  const result=await Promise.race([authenticate(req),new Promise((_,reject)=>setTimeout(()=>reject(new Error('bodyless_get_waited_for_stream_end')),50))]);
  assert.equal(result.method,'GET');assert.equal(req.vigiaRawBody.length,0);
  req.destroy();
});

test('pre-router assertion failures preserve bounded stable public status codes',async()=>{
  const authenticate=createOperatorProxyAuthenticator({key,releaseId,now:()=>now,maxBodyBytes:4}),oversized=request({body:Buffer.from('12345'),nonce:'e'.repeat(32)});
  const error=await authenticate(oversized).then(()=>null,value=>value);assert.equal(error.statusCode,413);assert.deepEqual(operatorProxyPublicFailure(error),{status:413,code:'request_body_too_large'});
  assert.deepEqual(operatorProxyPublicFailure(Object.assign(new Error('private_signature_detail'),{statusCode:401})),{status:401,code:'operator_proxy_authentication_rejected'});
  assert.deepEqual(operatorProxyPublicFailure(Object.assign(new Error('private_timeout_detail'),{statusCode:408})),{status:408,code:'request_body_timeout'});
  assert.deepEqual(operatorProxyPublicFailure(Object.assign(new Error('private_capacity_detail'),{statusCode:503})),{status:503,code:'operator_proxy_capacity_unavailable'});
});

test('signed-envelope diagnostics identify the internal rejected field without changing the public failure',async()=>{
  const authenticate=createOperatorProxyAuthenticator({key,releaseId,now:()=>now}),stale=request({nonce:'g'.repeat(32)});
  stale.headers=signOperatorProxyRequest({key,releaseId,method:stale.method,path:stale.url,bodyBytes:Buffer.from('{"incidentId":"incident-1"}'),timestamp:now-60_001,nonce:'g'.repeat(32),intent:'operator-console'});
  const staleError=await authenticate(stale).then(()=>null,value=>value);
  assert.equal(staleError.operatorProxyAuditReason,'TIMESTAMP_OUTSIDE_WINDOW');
  assert.equal(staleError.operatorProxyAgeMs,60_001);
  assert.deepEqual(operatorProxyPublicFailure(staleError),{status:401,code:'operator_proxy_authentication_rejected'});

  const mismatch=request({nonce:'h'.repeat(32)});
  mismatch.headers=signOperatorProxyRequest({key,releaseId:'vigia-other-release',method:mismatch.method,path:mismatch.url,bodyBytes:Buffer.from('{"incidentId":"incident-1"}'),timestamp:now,nonce:'h'.repeat(32),intent:'operator-console'});
  const mismatchError=await authenticate(mismatch).then(()=>null,value=>value);
  assert.equal(mismatchError.operatorProxyAuditReason,'RELEASE_ID_MISMATCH');
  assert.deepEqual(operatorProxyPublicFailure(mismatchError),{status:401,code:'operator_proxy_authentication_rejected'});
});

test('remote shadow rejects raw bearer while explicit loopback local shadow retains it',()=>{
  const remote={method:'POST',url:'/api/v2/evidence-requests',headers:{authorization:`Bearer ${key}`,host:'api:4177'},socket:{remoteAddress:'172.20.0.5'}};
  assert.equal(resolveRequestActor(remote,null,config).authentication.authenticated,false);
  const local={...remote,headers:{...remote.headers,host:'127.0.0.1:4177'},socket:{remoteAddress:'127.0.0.1'}};
  assert.equal(resolveRequestActor(local,null,{...config,runtimeProfile:'local_shadow'}).authentication.mode,'environment_bearer');
});

test('remote-shadow deployment shares an HMAC key only with API and Operator and proxy forwards no reusable credential',async()=>{
  const [compose,server,apiServer,dockerfile]=await Promise.all([
    readFile(new URL('../../../infra/docker-compose.remote-shadow.yml',import.meta.url),'utf8'),
    readFile(new URL('../../operator-console/server.mjs',import.meta.url),'utf8'),
    readFile(new URL('../src/server.mjs',import.meta.url),'utf8'),
    readFile(new URL('../../../infra/Dockerfile.operator',import.meta.url),'utf8'),
  ]);
  assert.match(compose,/VIGIA_OPERATOR_PROXY_KEY_FILE:\s*\/run\/secrets\/operator_proxy_key/g);assert.doesNotMatch(compose,/operator_token|VIGIA_OPERATOR_TOKEN_FILE/);
  const fieldnet=compose.match(/\n  fieldnet:\n([\s\S]*?)\n  web:\n/)?.[1]??'';assert.doesNotMatch(fieldnet,/operator_proxy_key|VIGIA_OPERATOR_PROXY_KEY/);
  assert.match(compose,/api:[\s\S]*?networks: \[database, fieldnet_control, operator_control, api_ingress\]/);assert.match(fieldnet,/networks: \[fieldnet_control, fieldnet_ingress\]/);assert.match(compose,/web:[\s\S]*?networks: \[operator_control, operator_ingress\]/);assert.match(compose,/operator_control: \{ internal: true \}/);assert.match(compose,/fieldnet_control: \{ internal: true \}/);
  for(const ingress of ['api_ingress','fieldnet_ingress','operator_ingress'])assert.match(compose,new RegExp(`^  ${ingress}: \\{\\}$`,'m'));
  assert.doesNotMatch(server,/headers\.authorization\s*=|for \(const name of \[[^\]]*'cookie'/);assert.doesNotMatch(server,/req\.headers\.cookie\?\{cookie|copyHeaders\[['"]set-cookie['"]\]|getSetCookie/);
  assert.ok(apiServer.indexOf('await authenticateOperatorProxyRequest(req)')<apiServer.indexOf('resolveRequestActor(req'));
  assert.match(dockerfile,/packages\/domain\/src\/operator-proxy\/request-auth\.mjs/);
});

test('remote-shadow configuration requires a full-length operator proxy key',()=>{
  const remote={VIGIA_RUNTIME_PROFILE:'remote_shadow',VIGIA_RELEASE_ID:'vigia-test',VIGIA_CODE_STATE_HASH:`sha256:${'c'.repeat(64)}`,VIGIA_OPERATIONAL_DATA_HASH:`sha256:${'a'.repeat(64)}`,VIGIA_APPROVED_RELEASE_STATEMENT_SHA256:`sha256:${'b'.repeat(64)}`,VIGIA_LOCAL_SECRETS_DISABLED:'1'};
  assert.throws(()=>loadConfig(remote),/remote_shadow_operator_proxy_key_required/);
  const configured=loadConfig({...remote,VIGIA_OPERATOR_PROXY_KEY:key});assert.equal(configured.operatorProxyKey,key);assert.equal(configured.operatorBearerToken,key);
});
