import test from 'node:test';
import assert from 'node:assert/strict';
import { OperationalReadinessService,publicOperationalReadiness } from '../src/modules/mission/operational-readiness-service.mjs';

test('readiness fails with explicit evidence when physical sources and auth are absent', async () => {
  const service = new OperationalReadinessService({
    config: { fixtureMode: false, operatorBearerToken: '' },
    repository: { persistenceStatus: () => ({ state: 'ready' }), snapshot:()=>({actors:[]}) }, eventRepository: { persistenceStatus: () => ({ state: 'ready' }), productionIntegrityStatus:()=>({universe:'production',totalObservations:0,syntheticObservations:0,syntheticObservationIds:[]}) },
    auditService: { verifyChain: () => ({ valid: true, count: 2 }) },
    operationalEventService: { async snapshot() { return { summary: { acquisitionInvariantHolds: true, evidenceAcquisition: {}, currentEvents: 2, currentPhysicalEvents: 0 }, sources: { firms: { state: 'not_configured' }, mtgPixels: { state: 'not_configured' }, sentinel3Pixels: { state: 'not_configured' }, observationSchedule: { state: 'not_configured' } } }; } },
    scientificRuntimeService: { snapshot: () => ({ ok: true, state: 'ready' }) },
    geoIntegrityProofRepository: { snapshot: () => ({ count: 4, persistence: { state: 'ready' } }) }, sensorRegistryService: { snapshot: () => ({ count: 0 }) }, clock: () => new Date('2026-08-09T12:00:00Z')
  });
  const result = await service.snapshot();
  assert.equal(result.ready, false); assert.equal(result.status, 'not_ready');
  assert.equal(result.checks.find((item) => item.id === 'physical_source_families').state, 'insufficient');
  assert.equal(result.checks.find((item) => item.id === 'authenticated_operator_boundary').state, 'not_configured');
  const boundary=result.checks.find((item)=>item.id==='authenticated_operator_boundary').evidence;assert.equal('actorId' in boundary,false);assert.equal('actorRole' in boundary,false);
  assert.equal(result.checks.find((item) => item.id === 'production_synthetic_observations').state, 'zero');
});

test('historical or stale physical sources never satisfy current two-family readiness',async()=>{
  const service=new OperationalReadinessService({config:{operatorBearerToken:'configured'},repository:{persistenceStatus:()=>({state:'ready'}),snapshot:()=>({actors:[]})},eventRepository:{persistenceStatus:()=>({state:'ready'}),productionIntegrityStatus:()=>({universe:'production',syntheticObservations:0})},physicalTruthStore:{status:()=>({state:'ready'})},auditService:{verifyChain:()=>({valid:true})},operationalEventService:{snapshot:async()=>({summary:{acquisitionInvariantHolds:true,evidenceAcquisition:{}},sources:{firms:{state:'stale',accepted:10},mtgPixels:{state:'not_configured',accepted:0},sentinel3Pixels:{state:'stale',accepted:4},observationSchedule:{}}})},scientificRuntimeService:{snapshot:()=>({ok:true,state:'ready'})},geoIntegrityProofRepository:{snapshot:()=>({count:0,persistence:{state:'ready'}})},sensorRegistryService:{snapshot:()=>({assets:[],state:'not_configured'})}});
  const result=await service.snapshot(),families=result.checks.find((item)=>item.id==='physical_source_families');assert.equal(families.ok,false);assert.deepEqual(families.evidence.families,[]);assert.match(families.evidence.criterion,/current source/);
});

test('public readiness exposes stable states and counts without raw repository diagnostics',()=>{const projected=publicOperationalReadiness({ready:false,status:'not_ready',checkedAt:'2026-08-23T12:00:00Z',checks:[{id:'postgres_physical_truth',ok:false,state:'degraded',blocking:true,evidence:{lastError:'/private/db.sock password=secret'}}],capabilities:{nativePixels:{state:'runtime_unavailable',persistedProofs:2}}});assert.equal(projected.checks[0].evidencePresent,true);assert.equal(projected.capabilities.nativePixels.persistedProofs,2);assert.doesNotMatch(JSON.stringify(projected),/private|password|secret|lastError/);});
