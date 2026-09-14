import test from 'node:test';
import assert from 'node:assert/strict';
import { assessObservationResolution } from '../src/sensor-resolution-policy.mjs';

test('Sentinel-2 may screen landscape fuel continuity but cannot certify object-scale dumping',()=>{
  const fuel=assessObservationResolution({decisionType:'fuel_continuity',resolutionMeters:10,sensor:'Sentinel-2'});
  const trash=assessObservationResolution({decisionType:'small_illegal_dumping',resolutionMeters:10,sensor:'Sentinel-2'});
  assert.equal(fuel.state,'screening_only'); assert.equal(fuel.allowedUse,'landscape_screening');
  assert.equal(trash.state,'insufficient_resolution'); assert.equal(trash.allowedUse,'abstain'); assert.ok(trash.escalateTo.includes('drone'));
});

test('sub-metre imagery passes the access-obstruction candidate-resolution gate',()=>{
  const result=assessObservationResolution({decisionType:'emergency_access_obstruction',resolutionMeters:.3,sensor:'aerial'});
  assert.equal(result.state,'candidate_resolution_sufficient'); assert.equal(result.allowedUse,'candidate_detection');
});
