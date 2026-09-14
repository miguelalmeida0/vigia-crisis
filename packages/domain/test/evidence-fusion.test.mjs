import test from 'node:test';
import assert from 'node:assert/strict';
import { fuseEventEvidence } from '../src/evidence-fusion.mjs';

const at='2026-08-09T12:00:00Z';
test('fusion never invents probability without validated calibration',()=>{
  const result=fuseEventEvidence([{id:'a',type:'thermal',at,coordinate:[-8,40],sourceFamily:'viirs',independenceGroup:'viirs_noaa20',confidence:'high'},{id:'b',type:'thermal',at,coordinate:[-8,40],sourceFamily:'mtg_fci',independenceGroup:'mtg_fci',confidence:.8}]);
  assert.equal(result.evidenceStrength,'two_dependency_groups'); assert.equal(result.independentFamilies,2); assert.equal(result.calibrated,false); assert.equal(result.existenceProbability,null);
  assert.deepEqual(result.witnesses.map((item)=>item.sourceFamily).sort(),['mtg_fci','viirs']);
});
test('repeated same-family detections are dependency-aware',()=>{
  const result=fuseEventEvidence([{id:'a',type:'thermal',at,sourceFamily:'mtg_fci',independenceGroup:'mtg_fci'},{id:'b',type:'thermal',at:'2026-08-09T12:10:00Z',sourceFamily:'mtg_fci',independenceGroup:'mtg_fci'}]);
  assert.equal(result.independentFamilies,1); assert.equal(result.dependencies.length,1); assert.equal(result.dependencies[0].observationIds.length,2);
});
test('fusion exposes contradictory physical observations as ambiguity',()=>{
  const result=fuseEventEvidence([
    {id:'a',type:'thermal',at,sourceFamily:'viirs',independenceGroup:'viirs_noaa20',classification:'thermal_hotspot'},
    {id:'b',type:'field',at,sourceFamily:'field',independenceGroup:'field:1',classification:'no_fire_observed',metadata:{negativeEvidenceEligible:true}}
  ]);
  assert.equal(result.state,'ambiguous'); assert.equal(result.ambiguities[0].kind,'conflicting_physical_observations'); assert.equal(result.existenceProbability,null);
});
test('validated flag alone cannot manufacture calibrated probability',()=>{
  const result=fuseEventEvidence([{id:'a',type:'thermal',at,independenceGroup:'viirs',classification:'hotspot'}],{calibration:{id:'self-asserted',validated:true,likelihoodRatios:{viirs:2}}});
  assert.equal(result.calibrated,false); assert.equal(result.existenceProbability,null);
});
