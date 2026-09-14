import test from 'node:test';
import assert from 'node:assert/strict';
import { createFuelContinuityFinding } from '../src/fuel-continuity-finding.mjs';

test('fuel continuity finding preserves screening semantics and physical measures',()=>{
  const finding=createFuelContinuityFinding({findingId:'fuel:1',geometry:{type:'Polygon',coordinates:[[[-8,37],[-7.99,37],[-7.99,37.01],[-8,37.01],[-8,37]]]},coordinate:[-8,37],currentObservationId:'s2-current',comparisonObservationId:'s2-prior',firstObservableInterval:{start:'2025-08-06T11:30:00Z',end:'2026-08-08T11:31:00Z'},affectedAreaHa:1.12,corridorLengthM:218,nearestStructureM:15.8,structuresWithinPolicyRadius:2,sourceQuality:{state:'PIXEL_VERIFIED'},detectorVersion:'fuel_continuity_change_screen_v1',calibrationState:'SCREENING_CANDIDATE',provenance:{synthetic:false},createdAt:'2026-08-11T00:00:00Z'});
  assert.equal(finding.kind,'FUEL_CONTINUITY_CHANGE');
  assert.equal(finding.calibrationState,'SCREENING_CANDIDATE');
  assert.equal(finding.affectedAreaHa,1.12);
  assert.equal('confidence' in finding,false);
});

test('fuel continuity finding rejects invalid geometry and time order',()=>{
  assert.throws(()=>createFuelContinuityFinding({findingId:'bad',geometry:{type:'Point',coordinates:[0,0]},coordinate:[0,0],currentObservationId:'a',comparisonObservationId:'b',firstObservableInterval:{start:'2026-08-08T00:00:00Z',end:'2025-08-08T00:00:00Z'},affectedAreaHa:1,corridorLengthM:1,nearestStructureM:1,structuresWithinPolicyRadius:1,detectorVersion:'v1',createdAt:'2026-08-11T00:00:00Z'}));
});
