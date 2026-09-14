import test from 'node:test';
import assert from 'node:assert/strict';
import { productionObservationReality } from '../src/production-integrity.mjs';

test('production reality separates physical evidence from public report observations',()=>{
  const reality=productionObservationReality([
    {id:'thermal-1',type:'thermal',sourceFamily:'viirs',provenance:{synthetic:false}},
    {id:'report-1',type:'report',source:'civil-protection',provenance:{synthetic:false}},
    {id:'field-1',type:'field',source:'verified field package',provenance:{synthetic:false}}
  ]);
  assert.deepEqual({total:reality.totalEventObservations,physical:reality.physicalObservations,reports:reality.reportObservations,other:reality.otherObservations,synthetic:reality.syntheticObservations},{total:3,physical:2,reports:1,other:0,synthetic:0});
});
