import test from 'node:test';
import assert from 'node:assert/strict';
import { signOperatorProxyRequest, verifyOperatorProxyBody, verifyOperatorProxyEnvelope } from '../src/operator-proxy/request-auth.mjs';

const key='operator-proxy-test-key-with-at-least-32-bytes',releaseId='vigia-test-release',now=1_800_000_000_000;
const nonce='a'.repeat(32),body=Buffer.from('{"incidentId":"incident-1"}'),path='/api/v10/incidents/incident-1?view=command';

test('operator proxy assertion binds release, method, exact target, intent and body bytes',()=>{
  const headers=signOperatorProxyRequest({key,releaseId,method:'POST',path,bodyBytes:body,timestamp:now,nonce,intent:'operator-console'});
  const claim=verifyOperatorProxyEnvelope({headers,key,releaseId,method:'POST',path,now});
  assert.equal(verifyOperatorProxyBody(claim,body),claim);
  for(const changed of [
    {method:'PATCH',path,releaseId}, {method:'POST',path:`${path}&extra=1`,releaseId}, {method:'POST',path,releaseId:'other-release'},
  ])assert.throws(()=>verifyOperatorProxyEnvelope({headers,key,now,...changed}),/rejected/);
  assert.throws(()=>verifyOperatorProxyBody(claim,Buffer.from('{"incidentId":"incident-2"}')),/body_rejected/);
  assert.throws(()=>verifyOperatorProxyEnvelope({headers:{...headers,'x-vigia-operator-intent':'different'},key,releaseId,method:'POST',path,now}),/signature_rejected/);
});

test('operator proxy assertion rejects expiry, future issuance and wrong keys',()=>{
  const headers=signOperatorProxyRequest({key,releaseId,method:'GET',path:'/api/v10/events',timestamp:now,nonce});
  assert.throws(()=>verifyOperatorProxyEnvelope({headers,key,releaseId,method:'GET',path:'/api/v10/events',now:now+60_001}),/envelope_rejected/);
  assert.throws(()=>verifyOperatorProxyEnvelope({headers,key,releaseId,method:'GET',path:'/api/v10/events',now:now-60_001}),/envelope_rejected/);
  assert.throws(()=>verifyOperatorProxyEnvelope({headers,key:`${key}-wrong`,releaseId,method:'GET',path:'/api/v10/events',now}),/signature_rejected/);
});
