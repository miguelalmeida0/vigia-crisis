import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config/env.mjs';
import { LocalShadowSessionService } from '../src/modules/session/local-shadow-session-service.mjs';

function response(){const headers=new Map();return{getHeader:(name)=>headers.get(name.toLowerCase()),setHeader:(name,value)=>headers.set(name.toLowerCase(),value),headers};}
function request(cookie='',headers={}){return{headers:{host:'127.0.0.1:4177',...(cookie?{cookie}:{}),...headers},socket:{remoteAddress:'127.0.0.1',encrypted:false}};}
function config(){return loadConfig({VIGIA_RUNTIME_PROFILE:'local_shadow',VIGIA_LOCAL_OPERATOR_AUTOLOGIN:'1',VIGIA_OPERATOR_TOKEN:'operator-bootstrap-test-token-32-bytes',HOST:'127.0.0.1',VIGIA_LOCAL_SECRETS_DISABLED:'1'});}

test('local autologin is impossible under a production or non-loopback boundary',()=>{
  assert.throws(()=>loadConfig({VIGIA_RUNTIME_PROFILE:'local_shadow',VIGIA_LOCAL_OPERATOR_AUTOLOGIN:'1',NODE_ENV:'production',HOST:'127.0.0.1',VIGIA_LOCAL_SECRETS_DISABLED:'1'}),/requires VIGIA_RUNTIME_PROFILE=local_shadow/);
  assert.throws(()=>loadConfig({VIGIA_RUNTIME_PROFILE:'local_shadow',VIGIA_LOCAL_OPERATOR_AUTOLOGIN:'1',HOST:'0.0.0.0',VIGIA_LOCAL_SECRETS_DISABLED:'1'}),/loopback host/);
});

test('local shadow session is signed, HttpOnly, expiring, restorable and revocable',()=>{
  let now=1_800_000_000_000;const service=new LocalShadowSessionService(config(),{now:()=>now,secret:Buffer.alloc(32,7)}),control={actor:()=>null},res=response();
  const issued=service.ensure(request(),res,control);
  assert.equal(issued.actor.name,'Miguel Almeida');assert.equal(issued.actor.title,'Shadow Operator');assert.equal(issued.actor.role,'administrator');
  const setCookie=res.getHeader('set-cookie');assert.ok(setCookie.every((value)=>/HttpOnly/.test(value)&&/SameSite=Strict/.test(value)));
  const cookie=setCookie.map((value)=>value.split(';')[0]).join('; '),restored=service.current(request(cookie),control);
  assert.equal(restored.actor.authentication.mode,'local_shadow_session');
  const token=setCookie[0].split(';')[0],tampered=`${token.slice(0,-1)}${token.endsWith('a')?'b':'a'}`;
  assert.equal(service.current(request(tampered),control),null);
  const out=response();service.signOut(request(cookie),out);assert.equal(service.current(request(cookie),control),null);assert.ok(out.getHeader('set-cookie').some((value)=>/vigia_shadow_signed_out=1/.test(value)));
  const expiring=new LocalShadowSessionService(config(),{now:()=>now,secret:Buffer.alloc(32,8)}),expRes=response();expiring.ensure(request(),expRes,control);const expCookie=expRes.getHeader('set-cookie').map((value)=>value.split(';')[0]).join('; ');now+=28_801_000;assert.equal(expiring.current(request(expCookie),control),null);
});

test('local shadow session creation requires the exact console origin and same-origin Fetch Metadata',()=>{
  const service=new LocalShadowSessionService(config(),{secret:Buffer.alloc(32,6)}),valid=request('',{origin:'http://127.0.0.1:4190','sec-fetch-site':'same-origin',authorization:'Bearer operator-bootstrap-test-token-32-bytes'});
  assert.doesNotThrow(()=>service.assertSameOrigin(valid));
  assert.doesNotThrow(()=>service.assertBootstrapCredential(valid));
  for(const candidate of [request('',{authorization:'Bearer wrong'}),request('',{authorization:'Basic operator-bootstrap-test-token-32-bytes'}),request()])assert.throws(()=>service.assertBootstrapCredential(candidate),/local_shadow_session_bootstrap_rejected/);
  for(const candidate of [request(),request('',{origin:'http://127.0.0.1:4191','sec-fetch-site':'same-origin'}),request('',{origin:'http://127.0.0.1:4190','sec-fetch-site':'cross-site'}),request('',{origin:'http://localhost:4190','sec-fetch-site':'same-origin'})])assert.throws(()=>service.assertSameOrigin(candidate),/local_shadow_session_origin_rejected/);
});

test('bounded local session pool evicts the oldest live session instead of refusing the operator',()=>{
  let now=1_800_000_000_000;const service=new LocalShadowSessionService(config(),{now:()=>now,secret:Buffer.alloc(32,5)}),control={actor:()=>null},issued=[];
  for(let index=0;index<129;index+=1){const res=response(),session=service.ensure(request(),res,control,{explicit:true});issued.push({session,cookie:res.getHeader('set-cookie')[0].split(';')[0]});now+=1;}
  assert.equal(service.current(request(issued[0].cookie),control),null);assert.equal(service.current(request(issued.at(-1).cookie),control).sessionId,issued.at(-1).session.sessionId);
});
