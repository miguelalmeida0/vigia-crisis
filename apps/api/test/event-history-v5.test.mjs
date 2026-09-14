import test from 'node:test';
import assert from 'node:assert/strict';
import { EventObservationRepository } from '../src/modules/events/event-observation-repository.mjs';

test('event observation history retains unique recent observations across refreshes', async () => {
  const now = new Date('2026-08-08T15:00:00Z');
  const repo = new EventObservationRepository({ retentionMs: 72 * 60 * 60_000 });
  const first = await repo.merge([{ id: 'thermal:a', at: '2026-08-08T14:40:00Z', type: 'thermal' }], now);
  assert.equal(first.length, 1);
  const second = await repo.merge([
    { id: 'thermal:a', at: '2026-08-08T14:40:00Z', type: 'thermal' },
    { id: 'report:b', at: '2026-08-08T14:50:00Z', type: 'report' }
  ], now);
  assert.deepEqual(second.map((item) => item.id), ['thermal:a', 'report:b']);
});

test('event observation history rejects impossible future and expired observations', async () => {
  const now = new Date('2026-08-08T15:00:00Z');
  const repo = new EventObservationRepository({ retentionMs: 60 * 60_000 });
  const result = await repo.merge([
    { id: 'old', at: '2026-08-08T12:00:00Z' },
    { id: 'current', at: '2026-08-08T14:50:00Z' },
    { id: 'future', at: '2026-08-08T16:00:00Z' }
  ], now);
  assert.deepEqual(result.map((item) => item.id), ['current']);
});
