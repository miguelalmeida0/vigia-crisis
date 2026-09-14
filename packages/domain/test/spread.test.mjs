import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSpreadScenario } from '../src/spread-envelope.mjs';

test('spread screening produces ordered uncertainty envelopes', () => {
  const scenario = buildSpreadScenario({ coordinate: [-8, 40], riskLevel: 5, windSpeedKph: 30, humidityPercent: 20, windDirectionDeg: 90 });
  assert.equal(scenario.envelopes.length, 3);
  assert.ok(scenario.envelopes[2].outer.properties.downwindKm > scenario.envelopes[0].outer.properties.downwindKm);
  assert.match(scenario.modelNotice, /Unvalidated/);
});
