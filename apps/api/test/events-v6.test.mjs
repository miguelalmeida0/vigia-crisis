import test from 'node:test';
import assert from 'node:assert/strict';
import { satelliteLabel } from '../src/modules/world/firms-gateway.mjs';

test('FIRMS sensor identifiers are normalized for operators', () => {
  assert.equal(satelliteLabel('N', 'VIIRS_SNPP_NRT'), 'VIIRS S-NPP');
  assert.equal(satelliteLabel('N21', 'VIIRS_NOAA21_NRT'), 'VIIRS NOAA-21');
  assert.equal(satelliteLabel('', 'VIIRS_NOAA20_NRT'), 'VIIRS NOAA-20');
});
