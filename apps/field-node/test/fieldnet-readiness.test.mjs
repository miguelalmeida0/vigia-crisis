import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateFieldNetReadiness, restrictedCapacityTaskReadiness } from '../src/readiness.mjs';
import { authoritativeFieldNetReady } from '../../../scripts/local_runtime.mjs';

const identity=Object.freeze({
  releaseId:'vigia-test-release',
  codeStateHash:`sha256:${'a'.repeat(64)}`,
  operationalDataHash:`sha256:${'b'.repeat(64)}`,
  releaseStatementHash:`sha256:${'c'.repeat(64)}`
});

function readiness(overrides={}){
  return evaluateFieldNetReadiness({
    process:{alive:true,pid:1234,startedAt:'2026-09-04T00:00:00.000Z',listenerBound:true},
    releaseIdentity:identity,
    expectedReleaseIdentity:identity,
    startup:{state:'services_ready',ready:true,listenerAt:'2026-09-04T00:00:01.000Z',servicesReadyAt:'2026-09-04T00:00:01.000Z'},
    deploymentIdentity:{state:'ready',...identity,recordedAt:'2026-09-04T00:00:00.000Z'},
    incidentScope:{exact:true,incidentId:'incident-1',expectedIncidentId:'incident-1'},
    storage:{opened:true,writable:true,state:'ready',mode:'SQLITE_WAL_FULL_SYNC'},
    internalServices:{fieldNetService:true,sensorGateway:true,deploymentIdentityStore:true},
    centralConnectivity:{configured:true,connectionState:'FULL',releaseCompatibility:{state:'COMPATIBLE'}},
    ...overrides
  });
}

function release(startup={state:'services_ready',ready:true,servicesReadyAt:'2026-09-04T00:00:01.000Z'},deployment={state:'ready',...identity}){
  return{ok:true,body:{...identity,process:{servicesReady:startup.ready===true,startup},schema:{deploymentIdentity:deployment}}};
}

test('A: a live FieldNet process with the right release remains not ready until its listener and startup are ready',()=>{
  const result=readiness({process:{alive:true,pid:1234,startedAt:'2026-09-04T00:00:00.000Z',listenerBound:false},startup:{state:'loading',ready:false,listenerAt:null,servicesReadyAt:null}});
  assert.equal(result.checks.liveness.ready,true);assert.equal(result.ready,false);
});

test('B: liveness/health success cannot override startup.loading',()=>{
  const fieldReadiness=readiness({startup:{state:'loading',ready:false,listenerAt:'2026-09-04T00:00:01.000Z',servicesReadyAt:null}});
  assert.equal(authoritativeFieldNetReady({componentOwnedReady:true,release:release({state:'loading',ready:false,servicesReadyAt:null}),readiness:{ok:false,body:fieldReadiness},manifest:identity,expectedIncidentId:'incident-1'}),false);
});

test('C: a release-identity mismatch fails readiness',()=>{
  const result=readiness({releaseIdentity:{...identity,codeStateHash:`sha256:${'d'.repeat(64)}`}});
  assert.equal(result.checks.releaseIdentity.ready,false);assert.equal(result.ready,false);
});

test('D: an inexact or unexpected incident scope fails readiness',()=>{
  const result=readiness({incidentScope:{exact:false,incidentId:'incident-2',expectedIncidentId:'incident-1'}});
  assert.equal(result.checks.incidentScope.ready,false);assert.equal(result.ready,false);
});

test('E: unavailable or non-writable durable storage fails readiness',()=>{
  const result=readiness({storage:{opened:true,writable:false,state:'failed',mode:'SQLITE_WAL_FULL_SYNC'}});
  assert.equal(result.checks.storage.ready,false);assert.equal(result.ready,false);
});

test('required internal services must all be initialized',()=>{
  const result=readiness({internalServices:{fieldNetService:true,sensorGateway:false,deploymentIdentityStore:true}});
  assert.equal(result.checks.internalServices.ready,false);assert.equal(result.ready,false);
});

test('F: every authoritative condition must pass before local runtime accepts FieldNet',()=>{
  const fieldReadiness=readiness();
  assert.equal(fieldReadiness.ready,true);
  assert.deepEqual(Object.fromEntries(Object.keys(identity).map((key)=>[key,fieldReadiness[key]])),identity);
  assert.equal(authoritativeFieldNetReady({componentOwnedReady:true,release:release(),readiness:{ok:true,body:fieldReadiness},manifest:identity,expectedIncidentId:'incident-1'}),true);
});

test('restricted capacity-task readiness exposes every authoritative local gate and keeps central connectivity non-gating',()=>{
  const restricted=restrictedCapacityTaskReadiness(readiness(),{nodeId:'field-node:1',incidentId:'incident-1'});
  assert.equal(restricted.ready,true);
  assert.deepEqual(Object.keys(restricted.checks),['process','listener','releaseIdentity','startup','deploymentIdentity','incidentScope','storage','internalServices']);
  assert.ok(Object.values(restricted.checks).every((item)=>item.ready===true));
  assert.equal(restricted.centralConnectivity.readinessGate,false);
  const notReady=restrictedCapacityTaskReadiness(readiness({storage:{opened:true,writable:false,state:'failed'}}),{nodeId:'field-node:1',incidentId:'incident-1'});
  assert.equal(notReady.ready,false);
  assert.equal(notReady.checks.storage.ready,false);
});
