import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { readJsonBody } from '../src/http/body.mjs';
import { SignedIngressAdmission } from '../src/http/signed-ingress-admission.mjs';
import { RequestGate } from '../src/shared/request-gate.mjs';

test('JSON request bodies have a non-resetting absolute deadline',async()=>{
  const request=new Readable({read(){}});let destroyedWith=null;const destroy=request.destroy.bind(request);request.destroy=(error)=>{destroyedWith=error;return destroy(error);};
  await assert.rejects(()=>readJsonBody(request,{timeoutMs:20}),error=>error.message==='request_body_timeout'&&error.statusCode===408);
  assert.equal(request.destroyed,true);assert.equal(destroyedWith?.message,'request_body_timeout');
});

test('signed ingress admission rejects excess pre-authentication bodies and recovers its slot',async()=>{
  const admission=new SignedIngressAdmission({gate:new RequestGate({maxConcurrent:1,maxConcurrentPerClient:1,maxRequestsPerWindow:10})}),request={socket:{remoteAddress:'198.51.100.20'}};let release;
  const first=admission.run(request,()=>new Promise((resolve)=>{release=resolve;}));await new Promise((resolve)=>setImmediate(resolve));
  await assert.rejects(()=>admission.run(request,async()=>null),error=>error.statusCode===503||error.statusCode===429);
  release('accepted');assert.equal(await first,'accepted');assert.equal(await admission.run(request,async()=>42),42);
});

test('API transport and FieldNet deployment keep explicit bounded authority',async()=>{
  const [server,compose,fieldServer,fieldService]=await Promise.all([
    readFile(new URL('../src/server.mjs',import.meta.url),'utf8'),
    readFile(new URL('../../../infra/docker-compose.remote-shadow.yml',import.meta.url),'utf8'),
    readFile(new URL('../../field-node/src/server.mjs',import.meta.url),'utf8'),
    readFile(new URL('../../field-node/src/service.mjs',import.meta.url),'utf8')
  ]);
  for(const contract of ['server.maxConnections=128','server.headersTimeout=10_000','server.requestTimeout=20_000','server.keepAliveTimeout=5_000','server.maxRequestsPerSocket=100'])assert.match(server,new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  const fieldnetBlock=compose.match(/\n  fieldnet:\n([\s\S]*?)\n  web:\n/)?.[1]??'';assert.ok(fieldnetBlock);assert.doesNotMatch(fieldnetBlock,/operator_token|VIGIA_OPERATOR_TOKEN|FIELDNET_CENTRAL_TOKEN/);
  assert.doesNotMatch(fieldServer,/FIELDNET_CENTRAL_TOKEN|VIGIA_OPERATOR_TOKEN/);assert.doesNotMatch(fieldService,/centralToken|authorization:\s*`Bearer/);
});
