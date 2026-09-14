import test from 'node:test';
import assert from 'node:assert/strict';
import { ExposureService } from '../src/modules/exposure/exposure-service.mjs';
import { DetectorRegistry } from '../src/modules/prevention/detector-registry.mjs';

test('production detector registry contains no synthetic models or findings',()=>{
  const registry=new DetectorRegistry();
  assert.equal(registry.findings({municipalityId:'1816'}).length,0);
  assert.ok(registry.models().length>0);
  assert.ok(registry.models().every((model)=>model.operational===false&&model.calibrated===false&&!/fixture|synthetic|demo/i.test(model.id)));
});

test('provider failure retains truthful public context and never fixture exposure',async()=>{
  const service=new ExposureService({fetchImpl:async()=>{throw new Error('provider_down');},worldService:{snapshot:async()=>({fires:[],riskToday:[],weather:[]})},clock:()=>new Date('2026-08-09T12:00:00Z')});
  const result=await service.inspect({lon:-8.1,lat:40.1});
  assert.equal(result.state,'partial');
  assert.equal(result.provider,'Public-source context fallback');
  assert.equal(result.buildingCountWithin3Km,null);
  assert.equal(result.assets.length,0);
  assert.doesNotMatch(JSON.stringify(result),/fixture|synthetic|demo/i);
});
