import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp,rm } from 'node:fs/promises';
import { CapFeedAdapter,FileCapIntegrationRepository,parseCapAlert } from '../src/modules/integrations/cap-feed-adapter.mjs';

const now='2026-08-23T20:00:00.000Z',clock=()=>new Date(now);
const alert=({identifier='PT-CAP-1',event='Wildfire',extra=''}={})=>`<?xml version="1.0"?><alert xmlns="urn:oasis:names:tc:emergency:cap:1.2"><identifier>${identifier}</identifier><sender>operations@authority.example</sender><sent>2026-08-23T19:58:00Z</sent><status>Actual</status><msgType>Alert</msgType><scope>Restricted</scope><info><category>Fire</category><event>${event}</event><urgency>Immediate</urgency><severity>Severe</severity><certainty>Observed</certainty><headline>Vegetation fire</headline><description>Agency-reported incident.</description><area><areaDesc>Central Portugal</areaDesc><polygon>39.90,-8.20 39.91,-8.10 39.80,-8.10 39.90,-8.20</polygon></area></info>${extra}</alert>`;
async function env(){const root=await mkdtemp(path.join(process.env.TMPDIR,'cap-adapter-'));return{root,repository:new FileCapIntegrationRepository({filePath:path.join(root,'state.json')})};}

test('CAP adapter is explicitly NOT_CONFIGURED without an endpoint',async()=>{const value=await env();try{const adapter=new CapFeedAdapter({repository:value.repository,clock});assert.equal((await adapter.poll()).state,'NOT_CONFIGURED');assert.equal((await adapter.status()).accepted,0);}finally{await rm(value.root,{recursive:true,force:true});}});

test('CAP adapter binds, persists, projects, audits and idempotently rejects replay',async()=>{const value=await env(),projected=[];let authorization=null;try{
  const adapter=new CapFeedAdapter({endpoint:'https://alerts.authority.example/cap',bearerToken:'protected-secret',repository:value.repository,clock,minimumPollMs:30_000,fetchImpl:async(_url,init)=>{authorization=init.headers.authorization;return new Response(alert(),{status:200,headers:{'content-type':'application/cap+xml'}});},bindIncident:async cap=>cap.identifier==='PT-CAP-1'?{incidentId:'PT-2026-CANONICAL'}:null,projectIncident:async projection=>projected.push(projection)});
  const first=await adapter.poll();assert.equal(first.state,'READY');assert.equal(first.outcomes[0].state,'ACCEPTED');assert.equal(projected.length,1);assert.equal(projected[0].physicalEvidence,false);assert.equal(projected[0].incidentId,'PT-2026-CANONICAL');assert.equal(authorization,'Bearer protected-secret');
  const persisted=await value.repository.status();assert.equal(Object.keys(persisted.messages).length,1);assert(persisted.audit.some(item=>item.type==='CAP_ALERT_ACCEPTED'));assert(!JSON.stringify(persisted).includes('protected-secret'));
  const replay=new CapFeedAdapter({endpoint:'https://alerts.authority.example/cap',repository:value.repository,clock,fetchImpl:async()=>new Response(alert(),{status:200,headers:{'content-type':'application/xml'}}),bindIncident:async()=>({incidentId:'PT-2026-CANONICAL'}),projectIncident:async()=>{throw new Error('duplicate_must_not_project');}});const second=await replay.poll();assert.equal(second.outcomes[0].state,'DUPLICATE');
}finally{await rm(value.root,{recursive:true,force:true});}});

test('CAP adapter quarantines unsafe, invalid and unbound alerts without losing valid siblings',async()=>{const value=await env(),projected=[];try{
  const body=`<feed>${alert()}${alert({identifier:'UNBOUND'})}${alert({identifier:'INVALID',event:''})}</feed>`;
  const adapter=new CapFeedAdapter({endpoint:'https://alerts.authority.example/cap',repository:value.repository,clock,fetchImpl:async()=>new Response(body,{status:200,headers:{'content-type':'text/xml'}}),bindIncident:async cap=>cap.identifier==='PT-CAP-1'?{incidentId:'PT-1'}:null,projectIncident:async projection=>projected.push(projection)}),result=await adapter.poll();
  assert.equal(result.state,'DEGRADED');assert.deepEqual(result.outcomes.map(item=>item.state),['ACCEPTED','QUARANTINED','QUARANTINED']);assert.equal(projected.length,1);assert.equal((await value.repository.status()).quarantine.length,2);
  assert.throws(()=>parseCapAlert(`<!DOCTYPE alert [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>${alert()}`),/cap_xml_unsafe_declaration/);
}finally{await rm(value.root,{recursive:true,force:true});}});

test('CAP adapter enforces MIME, response ceiling, rate-limit backoff and redacted health',async()=>{for(const [label,response] of [['mime',new Response('no',{status:200,headers:{'content-type':'text/plain'}})],['oversize',new Response('x',{status:200,headers:{'content-type':'application/xml','content-length':String(6*1024*1024)}})],['rate',new Response('',{status:429,headers:{'retry-after':'120'}})]]){const value=await env();try{const adapter=new CapFeedAdapter({endpoint:'https://alerts.authority.example/cap',bearerToken:'must-not-leak',repository:value.repository,clock,fetchImpl:async()=>response.clone()}),result=await adapter.poll();assert.equal(result.state,'UNAVAILABLE',label);assert(result.health.nextAttemptAt,label);assert(!JSON.stringify(result).includes('must-not-leak'),label);}finally{await rm(value.root,{recursive:true,force:true});}}});

test('CAP adapter cancels a chunked response as soon as the byte ceiling is crossed',async()=>{const value=await env();let produced=0,cancelled=false;try{
  const stream=new ReadableStream({pull(controller){produced+=1;controller.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled=true;}}),adapter=new CapFeedAdapter({endpoint:'https://alerts.authority.example/cap',repository:value.repository,clock,fetchImpl:async()=>new Response(stream,{status:200,headers:{'content-type':'application/cap+xml'}})}),result=await adapter.poll();
  assert.equal(result.state,'UNAVAILABLE');assert.equal(result.failureClass,'cap_response_too_large');assert.equal(cancelled,true);assert(produced<=7,`reader consumed ${produced} MiB before cancellation`);
}finally{await rm(value.root,{recursive:true,force:true});}});
