import test from 'node:test';
import assert from 'node:assert/strict';
import { fireEventGeometry, fireEventThermalSupport } from '../src/fire-event-geometry.mjs';

test('thermal support preserves individual sensor-pixel evidence and does not call it a perimeter',()=>{
  const observations=[{id:'t1',type:'thermal',at:'2026-08-09T12:00:00Z',coordinate:[-8,40],satellite:'VIIRS NOAA-20',scanKm:.6,trackKm:.4,frpMw:22}];
  const support=fireEventThermalSupport(observations); const envelope=fireEventGeometry(observations);
  assert.equal(support.features.length,1); assert.equal(support.features[0].properties.authoritativePerimeter,false); assert.equal(support.features[0].properties.geometryBasis,'nominal_pixel_support');
  assert.equal(envelope.properties.kind,'observed_thermal_support_envelope'); assert.equal(envelope.properties.authoritativePerimeter,false);
});
