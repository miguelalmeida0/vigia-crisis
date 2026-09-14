import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFreshness } from '../src/source-health.mjs';

test('future upstream timestamps are exposed as conflicts', () => {
  const result = evaluateFreshness({
    upstreamAt: '2026-08-07T12:30:00Z', fetchedAt: '2026-08-07T12:00:00Z', now: new Date('2026-08-07T12:00:00Z'), staleAfterSeconds: 600
  });
  assert.equal(result.timeConflict, true);
  assert.equal(result.state, 'conflict');
});
