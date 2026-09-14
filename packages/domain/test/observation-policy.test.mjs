import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveObservation } from '../src/observation-policy.mjs';

test('observation policy chooses clear recent optical then radar fallback', () => {
  const now = new Date('2026-08-08T00:00:00Z');
  const optical = [{ id: 'cloudy', sensor: 'Sentinel-2', acquiredAt: '2026-08-07T12:00:00Z', cloudCover: 90 }, { id: 'clear', sensor: 'Sentinel-2', acquiredAt: '2026-08-06T12:00:00Z', cloudCover: 8 }];
  assert.equal(resolveObservation({ optical, now }).primary.id, 'clear');
  assert.equal(resolveObservation({ optical: [], radar: [{ id: 'r', sensor: 'Sentinel-1', acquiredAt: '2026-08-07T18:00:00Z' }], now }).radarFallback, true);
});
