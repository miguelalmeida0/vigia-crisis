import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { FixtureGateway } from './fixtures/runtime/fixture-gateway.mjs';
import { buildEventObservations, trackFireEvents } from '../../../packages/domain/src/fire-event-tracker.mjs';
import { EventObservationRepository } from '../src/modules/events/event-observation-repository.mjs';

const now=()=>new Date('2026-08-07T12:00:00Z');

test('synthetic world data is confined to the TEST fixture provider',async()=>{
  const fixture=await new FixtureGateway({clock:now}).snapshot();
  const values=Object.values(fixture).flatMap((entry)=>entry.data??[]);
  assert.ok(values.length>0);
  assert.ok(values.every((item)=>item.provenance?.synthetic===true));
  assert.ok(fixture.firms.data.length>0);
});

test('TEST may exercise synthetic association while production persistence rejects it',async()=>{
  const fixture=await new FixtureGateway({clock:now}).snapshot();
  const observations=buildEventObservations({fires:fixture.fires.data,thermalDetections:fixture.firms.data,now:now()});
  const events=trackFireEvents(observations,{now:now()});
  assert.equal(events.find((event)=>event.incidentIds.includes('fx-1'))?.evidenceState,'multisource');
  const directory=await mkdtemp(path.join(os.tmpdir(),'vigia-reality-test-'));
  try{
    const testRepository=new EventObservationRepository({filePath:path.join(directory,'test.json'),universe:'test'});
    await testRepository.merge(observations,now());
    assert.ok(testRepository.productionIntegrityStatus().syntheticObservations>0);
    const productionRepository=new EventObservationRepository({filePath:path.join(directory,'production.json'),universe:'production'});
    await assert.rejects(()=>productionRepository.merge(observations,now()),(error)=>error?.name==='ProductionIntegrityViolation');
  }finally{await rm(directory,{recursive:true,force:true});}
});
