import test from 'node:test';
import assert from 'node:assert/strict';
import { isPhysicalObservation, normalizePhysicalObservation } from '../src/physical-observation.mjs';

test('canonical physical observation preserves source independence and measurement provenance',()=>{
  const item=normalizePhysicalObservation({id:'mtg:1',type:'thermal',source:'EUMETSAT',sourceFamily:'mtg_fci',independenceGroup:'mtg_fci',observedAt:'2026-08-09T12:00:00Z',coordinate:[-8,40],frpMw:31,frpUncertaintyMw:4,qualityFlags:['nominal']},{receivedAt:new Date('2026-08-09T12:01:00Z')});
  assert.equal(item.schemaVersion,'physical-observation.v1'); assert.equal(item.measurement.frpMw,31); assert.equal(item.calibratedFireProbability,null); assert.equal(item.independenceGroup,'mtg_fci'); assert.equal(isPhysicalObservation(item),true);
});
test('canonical physical observation rejects impossible geometry',()=>assert.throws(()=>normalizePhysicalObservation({id:'x',type:'thermal',source:'s',sourceFamily:'f',independenceGroup:'g',observedAt:'2026-08-09T12:00:00Z',coordinate:[220,40]}),/invalid_physical_observation_coordinate/));
