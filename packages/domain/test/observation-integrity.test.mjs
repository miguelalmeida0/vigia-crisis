import test from 'node:test';
import assert from 'node:assert/strict';
import { bboxCovers, observationSuitability, sceneAgeHours } from '../src/observation-integrity.mjs';

test('observation integrity binds scenes to selected geography', () => {
  assert.equal(bboxCovers([-9, 39, -8, 40], [-8.5, 39.5]), true);
  assert.equal(bboxCovers([-9, 39, -8, 40], [-7.5, 39.5]), false);
});

test('observation suitability exposes age and cloud instead of opaque score', () => {
  const now = new Date('2026-08-08T12:00:00Z');
  assert.equal(sceneAgeHours('2026-08-08T06:00:00Z', now), 6);
  const quality = observationSuitability({ sensor: 'Sentinel-2', acquiredAt: '2026-08-08T06:00:00Z', cloudCover: 12, resolutionMeters: 10 }, now);
  assert.equal(quality.level, 'good');
  assert.equal(quality.currentEnough, true);
});
