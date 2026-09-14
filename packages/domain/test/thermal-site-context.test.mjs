import assert from 'node:assert/strict';
import test from 'node:test';
import { buildThermalContextResolver, compactThermalContext, thermalContextClass } from '../src/thermal-site-context.mjs';
import { assessThermalCandidateV4Candidate } from '../src/thermal-candidate-policy.mjs';

test('thermal context excludes renewable generators and retains heat-capable sources', () => {
  assert.equal(thermalContextClass({ power: 'generator', 'generator:source': 'solar' }), null);
  assert.equal(thermalContextClass({ power: 'plant', 'plant:source': 'gas' }), 'THERMAL_POWER');
  assert.equal(thermalContextClass({ man_made: 'kiln' }), 'DIRECT_HIGH_TEMPERATURE_INDUSTRIAL');
});

test('resolver reports boundary membership and exact industrial polygon containment', () => {
  const compact = compactThermalContext({ elements: [{ type: 'way', id: 1, tags: { landuse: 'industrial', name: 'Test works' }, geometry: [{ lon: 0, lat: 0 }, { lon: 1, lat: 0 }, { lon: 1, lat: 1 }, { lon: 0, lat: 1 }, { lon: 0, lat: 0 }] }] }, [{ geojson: { type: 'Polygon', coordinates: [[[-2, -2], [2, -2], [2, 2], [-2, 2], [-2, -2]]] } }]);
  const resolve = buildThermalContextResolver(compact);
  assert.deepEqual(resolve([.5, .5]), { insidePortugal: true, heatContext: { id: 'way/1', contextClass: 'INDUSTRIAL_LANDUSE', name: 'Test works', tags: { landuse: 'industrial' }, distanceKm: 0 } });
  assert.equal(resolve([3, 3]).insidePortugal, false);
});

test('V4 suppresses low-FRP mapped heat without suppressing the same signal in unmapped context', () => {
  const observation = { type: 'thermal', at: '2026-08-13T00:00:00.000Z', coordinate: [-8, 40], frpMw: 2, confidence: 'nominal', satellite: 'VIIRS NOAA-20' };
  const now = new Date('2026-08-13T00:05:00.000Z');
  const unmapped = assessThermalCandidateV4Candidate({ observations: [observation], siteContext: { insidePortugal: true, heatContext: null } }, { now });
  const mapped = assessThermalCandidateV4Candidate({ observations: [observation], siteContext: { insidePortugal: true, heatContext: { contextClass: 'INDUSTRIAL_WORKS', distanceKm: .05 } } }, { now });
  assert.equal(unmapped.qualifiesAsFireCandidate, true);
  assert.equal(mapped.decision, 'SUPPRESS_MAPPED_PERSISTENT_HEAT_CONTEXT');
});
