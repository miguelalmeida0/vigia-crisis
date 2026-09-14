import test from 'node:test';
import assert from 'node:assert/strict';
import { OperationalEventService } from '../src/modules/events/operational-event-service.mjs';

test('operational snapshots ingest accepted evidence and enforce needs before returning', async () => {
  const calls = [];
  const service = new OperationalEventService({
    fireEventService: {
      async snapshot() {
        calls.push('fire_snapshot');
        return { summary: {}, events: [{ id: 'event-1', actionNeed: { needsRouting: true } }] };
      }
    },
    evidenceNeedService: {
      async ingestAcceptedEvidence() { calls.push('ingest'); },
      async sync(events) { calls.push(`sync:${events.length}`); },
      enrich(snapshot) { calls.push('enrich'); return { ...snapshot, invariant: 'enforced' }; }
    }
  });

  const snapshot = await service.snapshot();

  assert.deepEqual(calls, ['ingest', 'fire_snapshot', 'sync:1', 'enrich']);
  assert.equal(snapshot.invariant, 'enforced');
});
