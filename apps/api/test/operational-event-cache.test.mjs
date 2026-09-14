import test from 'node:test';
import assert from 'node:assert/strict';
import { OperationalEventService } from '../src/modules/events/operational-event-service.mjs';

function harness() {
  let now = Date.parse('2026-08-11T08:00:00.000Z'), builds = 0, syncs = 0, ingests = 0;
  const fireEventService = { async snapshot() { builds += 1; await new Promise((resolve) => setTimeout(resolve, 10)); return { meta: { generatedAt: new Date(now).toISOString() }, events: [{ id: `event-${builds}` }] }; } };
  const evidenceNeedService = {
    async ingestAcceptedEvidence() { ingests += 1; },
    async sync() { syncs += 1; },
    enrich(snapshot) { return { ...snapshot, enriched: true }; }
  };
  const service = new OperationalEventService({ fireEventService, evidenceNeedService, clock: () => new Date(now), cacheMs: 30_000 });
  return { service, counts: () => ({ builds, syncs, ingests }), advance: (milliseconds) => { now += milliseconds; } };
}

test('operational snapshots coalesce concurrent physical-truth transactions', async () => {
  const { service, counts } = harness();
  const [first, second, third] = await Promise.all([service.snapshot(), service.snapshot(), service.snapshot()]);
  assert.deepEqual(first, second); assert.deepEqual(second, third);
  assert.deepEqual(counts(), { builds: 1, syncs: 1, ingests: 1 });
});

test('operational reads never trigger a rebuild and refresh only when forced', async () => {
  const { service, counts, advance } = harness();
  const initial = await service.snapshot({ force: true });
  await service.snapshot();
  assert.equal(counts().builds, 1);
  advance(30_001); const retained = await service.snapshot();
  assert.deepEqual(retained, initial);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(counts().builds, 1);
  await service.snapshot({ force: true });
  assert.equal(counts().builds, 2);
});

test('an invalidated in-flight snapshot cannot repopulate the cache with pre-acknowledgement state', async () => {
  let builds=0,releaseFirst;
  const firstGate=new Promise((resolve)=>{releaseFirst=resolve;});
  const service=new OperationalEventService({
    fireEventService:{async snapshot(){builds+=1;if(builds===1)await firstGate;return{events:[{id:'event-1',uiFirstSeenAt:builds===1?null:'2026-08-13T10:32:20.953Z'}]};}},
    evidenceNeedService:{async ingestAcceptedEvidence(){},async sync(){},enrich(snapshot){return snapshot;}},
    cacheMs:30_000
  });
  const staleBuild=service.snapshot();
  await new Promise((resolve)=>setTimeout(resolve,0));
  service.invalidate();
  const afterAcknowledgement=service.snapshot();
  releaseFirst();
  assert.equal((await staleBuild).events[0].uiFirstSeenAt,null);
  assert.equal((await afterAcknowledgement).events[0].uiFirstSeenAt,'2026-08-13T10:32:20.953Z');
  assert.equal(builds,2);
  assert.equal((await service.snapshot()).events[0].uiFirstSeenAt,'2026-08-13T10:32:20.953Z');
});
