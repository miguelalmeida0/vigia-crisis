import test from 'node:test';
import assert from 'node:assert/strict';
import { ObservationOpportunityService } from '../src/modules/observations/observation-opportunity-service.mjs';
import { ScientificRuntimeService } from '../src/modules/observations/scientific-runtime-service.mjs';
import { GeoIntegrityProofRepository } from '../src/modules/observations/geo-integrity-proof-repository.mjs';
import { SensorRegistryService } from '../src/modules/sensors/sensor-registry-service.mjs';

const clock=()=>new Date('2026-08-09T12:00:00.000Z');

test('future schedule source failure is explicit and cannot manufacture an opportunity',async()=>{
  const service=new ObservationOpportunityService({filePath:'schedule.json',reader:async()=>{throw new Error('schedule_store_unavailable');},clock});
  const health=await service.refresh();
  const plan=await service.plan({coordinate:[-8.1,40.1]},{options:[]});
  assert.equal(health.state,'unavailable');
  assert.match(health.error,/schedule_store_unavailable/);
  assert.equal(plan.future.length,0);
  assert.equal(plan.state,'REMOTE_PASS_DEPENDENT');
  assert.equal(plan.remote.find((item)=>item.id==='remote:sentinel2').availability,'PASS_DEPENDENT');
  assert.equal(plan.remote.find((item)=>item.id==='remote:viirs').availability,'CREDENTIAL_REQUIRED');
  assert.ok(plan.options.some((item)=>item.availability==='MANUAL_REQUEST'));
});

test('remote opportunity planner distinguishes cadence, pass dependence and credential blockers',async()=>{
  const service=new ObservationOpportunityService({filePath:null,clock});await service.refresh();
  const plan=await service.plan({coordinate:[-8.1,40.1]},{options:[]},{firms:{state:'current'},sentinel3:{state:'not_configured'},mtg:{state:'current'},sentinel2:{state:'catalogue_available'}});
  assert.equal(plan.recommended,null);
  assert.equal(plan.state,'REMOTE_PASS_DEPENDENT');
  assert.equal(plan.remote.find((item)=>item.id==='remote:viirs').availability,'PASS_DEPENDENT');
  assert.equal(plan.remote.find((item)=>item.id==='remote:mtg').availability,'ESTIMATED_CADENCE');
  assert.equal(plan.remote.find((item)=>item.id==='remote:mtg').latency.value,10);
  assert.equal(plan.remote.find((item)=>item.id==='remote:sentinel3').availability,'CREDENTIAL_REQUIRED');
});

test('scientific runtime dependency failure remains unavailable',async()=>{
  const service=new ScientificRuntimeService({projectRoot:process.cwd(),runner:async()=>({ok:false,error:'rasterio_missing'}),clock});
  const state=await service.refresh();
  assert.equal(state.ok,false);
  assert.equal(state.state,'unavailable');
  assert.equal(state.details.error,'rasterio_missing');
  assert.equal(state.details.attempts,1);
});

test('scientific runtime retries one transient worker timeout and retains attempt evidence',async()=>{
  let calls=0;
  const service=new ScientificRuntimeService({projectRoot:process.cwd(),runner:async()=>++calls===1?{ok:false,error:'geospatial_worker_timeout'}:{ok:true,python:'3.12'},clock});
  const state=await service.refresh();
  assert.equal(state.ok,true);
  assert.equal(state.state,'ready');
  assert.equal(state.details.attempts,2);
  assert.equal(calls,2);
});

test('connected-asset registry failure is exposed rather than converted to no assets configured',async()=>{
  const service=new SensorRegistryService({filePath:'sensors.json',reader:async()=>{throw new Error('asset_registry_unavailable');},clock});
  const state=await service.refresh();
  assert.equal(state.state,'unavailable');
  assert.equal(state.count,0);
  assert.match(state.error,/asset_registry_unavailable/);
  assert.deepEqual(await service.nearby([-8.1,40.1]),[]);
});

test('geo-integrity proof persistence failure is reported and rejects the commit',async()=>{
  const repository=new GeoIntegrityProofRepository({filePath:'proofs.json',writer:async()=>{throw new Error('proof_store_unavailable');},clock});
  await repository.initialize();
  await assert.rejects(()=>repository.record({key:'scene:pixel',result:{ok:true,pixelVerified:true}}),/proof_store_unavailable/);
  assert.equal(repository.snapshot().count,0);
  assert.equal(repository.snapshot().persistence.state,'failed');
});
