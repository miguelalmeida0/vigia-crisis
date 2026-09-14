import assert from 'node:assert/strict';
import { appendFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  Agent1OperationalProjectionAdapter, createCanonicalOperationalEvent, createSourceRegistry, FieldNetOperationalAdapter
} from '../../../packages/domain/src/event-fabric/index.mjs';
import { AppendOnlyOperationalEventJournal } from '../src/modules/intelligence/append-only-event-journal.mjs';
import { MemoryOperationalEventJournal } from '../src/modules/intelligence/memory-event-journal.mjs';
import { OperationalIntelligenceService } from '../src/modules/intelligence/operational-intelligence-service.mjs';

function event(id, receivedAt = '2026-08-24T12:01:00Z', payload = { observationState: 'OBSERVED_POSITIVE', stance: 'SUPPORTING' }) {
  return createCanonicalOperationalEvent({
    eventType: 'wildfire.public_report', hazardType: 'wildfire', provider: { adapterId: 'test', adapterVersion: '1', providerEventId: id },
    source: { sourceId: 'test-reporter', familyId: 'report.test', familyClass: 'REPORT', producerId: 'reporter', upstreamOrigin: 'test-fixture' },
    clocks: { occurredAt: '2026-08-24T12:00:00Z', observedAt: '2026-08-24T12:00:00Z', publishedAt: null, receivedAt, ingestedAt: null },
    geometry: [-8, 40], correlationKeys: ['incident:journal-test'], payload,
    provenance: { strength: 'ATTRIBUTED', upstreamMeasurementId: id, rawPayloadHash: `raw:${id}` }
  });
}

test('append-only journal is idempotent across concurrent instances, survives restart, and isolates a torn line', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'vigia-operational-journal-')), filePath = path.join(directory, 'events.jsonl');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const first = new AppendOnlyOperationalEventJournal({ filePath }), second = new AppendOnlyOperationalEventJournal({ filePath });
  await Promise.all([first.initialize(), second.initialize()]);
  const same = event('same');
  const retries = await Promise.all([first.appendEvent(same, { ingestedAt: '2026-08-24T12:02:00Z' }), second.appendEvent(same, { ingestedAt: '2026-08-24T12:02:01Z' })]);
  assert.deepEqual(retries.map((item) => item.state).sort(), ['ACCEPTED', 'DUPLICATE']);
  await assert.rejects(first.appendEvent({ ...same, source: { ...same.source, sourceId: 'rebound-source' } }), (error) => error.code === 'EVENT_IDENTITY_CONFLICT');
  await assert.rejects(first.appendEvent(event('same', '2026-08-24T12:02:02Z', { observationState: 'OBSERVED_NEGATIVE', stance: 'CONTRADICTING' })), (error) => error.code === 'PROVIDER_EVENT_IDENTITY_CONFLICT');
  await Promise.all([first.appendEvent(event('a'), { ingestedAt: '2026-08-24T12:03:00Z' }), second.appendEvent(event('b'), { ingestedAt: '2026-08-24T12:03:01Z' })]);
  const restarted = new AppendOnlyOperationalEventJournal({ filePath }); await restarted.initialize();
  assert.equal((await restarted.events()).length, 3); assert.deepEqual((await restarted.records()).map((item) => item.sequence), [1, 2, 3]);
  await appendFile(filePath, '{"partial":', 'utf8');
  const recovered = new AppendOnlyOperationalEventJournal({ filePath }); await recovered.initialize();
  assert.equal(recovered.status().diagnostics.length, 1);
  await recovered.appendEvent(event('after-torn'), { ingestedAt: '2026-08-24T12:04:00Z' });
  assert.equal((await recovered.events()).length, 4);
  const body = await readFile(filePath, 'utf8'); assert.equal(body.includes('{"partial":\n'), true);
});

test('service quarantines invalid events, deduplicates retries, exposes typed queries, and rebuilds after projection failure', async () => {
  const journal = new MemoryOperationalEventJournal({ clock: () => new Date('2026-08-24T12:02:00Z') });
  const registry = createSourceRegistry([{ sourceId: 'test-reporter', familyId: 'report.test', familyClass: 'REPORT', staleAfterMs: 3_600_000, registeredAt: '2026-08-24T12:00:00Z' }]);
  const coordinated = [];
  const service = new OperationalIntelligenceService({ journal, sourceRegistry: registry, clock: () => new Date('2026-08-24T12:02:00Z'), onAcceptedEvent: async (acceptedEvent) => coordinated.push(acceptedEvent.id) });
  await service.initialize();
  const accepted = await service.ingestOperationalEvent(event('service'), { ingestedAt: '2026-08-24T12:01:00Z', projectedAt: '2026-08-24T12:02:00Z' });
  const duplicate = await service.ingestOperationalEvent(event('service', '2026-08-24T12:01:30Z'), { ingestedAt: '2026-08-24T12:01:30Z', projectedAt: '2026-08-24T12:02:00Z' });
  assert.equal(accepted.state, 'ACCEPTED'); assert.equal(duplicate.state, 'DUPLICATE');
  assert.deepEqual(coordinated, [accepted.event.id]);
  const invalid = await service.ingestOperationalEvent({ ...event('bad-schema'), schemaVersion: 'vigia.operational-event.v999' });
  assert.equal(invalid.state, 'REJECTED'); assert.equal((await service.rejectionLog()).length, 1);
  const twin = await service.getTwinAsOf('2026-08-24T12:02:00Z');
  assert.equal(twin.incidents.length, 1); assert.equal((await service.getEvidenceState('incident:journal-test', { asOf: '2026-08-24T12:02:00Z' })).state, 'REPORT_ONLY');
  assert.equal((await service.getEvidenceDebt('incident:journal-test', { asOf: '2026-08-24T12:02:00Z' })).count > 0, true);
  assert.equal((await service.getEvent(accepted.event.id)).id, accepted.event.id); assert.equal((await service.getIncidentEvents('incident:journal-test', { asOf: '2026-08-24T12:02:00Z' })).length, 1);
  assert.equal((await service.getOperationalTimeline('incident:journal-test', { asOf: '2026-08-24T12:02:00Z' })).length > 0, true);
  const replay = await service.createReplay('2026-08-24T12:02:00Z'); assert.equal((await service.verifyReplay(replay)).valid, true);
  const replaySummary = await service.createTrustedReplaySummary('2026-08-24T12:02:00Z'), trustedReplay = await service.createTrustedReplay('2026-08-24T12:02:00Z');
  assert.equal(replaySummary.replayHash, trustedReplay.replayHash); assert.equal(replaySummary.operational.replayHash, trustedReplay.operational.replayHash); assert.equal(replaySummary.operational.inputEventCount, 1);
  assert.equal((await service.replayIncident('incident:journal-test', '2026-08-24T12:02:00Z')).incident.incident.id, 'incident:journal-test');

  let failProjection = true;
  const faultJournal = {
    initialize: (...args) => journal.initialize(...args), status: () => journal.status(), appendEvent: (...args) => journal.appendEvent(...args),
    appendRejection: (...args) => journal.appendRejection(...args), rejections: (...args) => journal.rejections(...args),
    events: async () => { if (failProjection) throw new Error('injected_projection_read_failure'); return journal.events(); }
  };
  const resilient = new OperationalIntelligenceService({ journal: faultJournal, sourceRegistry: registry, clock: () => new Date('2026-08-24T12:03:00Z') });
  const persisted = await resilient.ingestOperationalEvent(event('survives-projection'), { ingestedAt: '2026-08-24T12:03:00Z' });
  assert.equal(persisted.state, 'ACCEPTED'); assert.equal(persisted.projection.state, 'FAILED');
  failProjection = false; assert.equal((await resilient.getCurrentTwin()).eventCount, 2);
});

test('raw service boundary isolates bad records without stopping the batch', async () => {
  const adapter = new FieldNetOperationalAdapter(), journal = new MemoryOperationalEventJournal();
  const service = new OperationalIntelligenceService({ journal, adapters: [adapter], clock: () => new Date('2026-08-24T12:05:00Z') });
  const rows = [
    { observationId: 'good', reporterId: 'operator', kind: 'human_report', observedAt: '2026-08-24T12:00:00Z', coordinate: [-8, 40], correlationKeys: ['incident:batch'] },
    { observationId: 'bad', reporterId: 'operator', kind: 'human_report', observedAt: 'invalid', coordinate: [-8, 40] }
  ];
  const result = await service.ingestRawProviderPayload(adapter.id, rows, { receivedAt: '2026-08-24T12:04:00Z', ingestedAt: '2026-08-24T12:05:00Z' });
  assert.equal(result.ingestion.length, 1); assert.equal(result.rejections.length, 1); assert.equal((await service.rejectionLog()).length, 1);
});

test('accepted-event coordination failures remain bound to the persisted event and retry without re-ingestion', async () => {
  const journal = new MemoryOperationalEventJournal({ clock: () => new Date('2026-08-24T12:02:00Z') });
  const registry = createSourceRegistry([{ sourceId: 'test-reporter', familyId: 'report.test', familyClass: 'REPORT', staleAfterMs: 3_600_000, registeredAt: '2026-08-24T12:00:00Z' }]);
  let attempts = 0;
  const service = new OperationalIntelligenceService({
    journal, sourceRegistry: registry, clock: () => new Date('2026-08-24T12:02:00Z'),
    onAcceptedEvent: async () => { attempts += 1; if (attempts === 1) throw new Error('transient_coordination_failure'); },
  });
  const accepted = await service.ingestOperationalEvent(event('coordination-retry'), { ingestedAt: '2026-08-24T12:01:00Z', project: false });
  assert.equal(accepted.state, 'ACCEPTED');
  assert.equal((await journal.events()).length, 1);
  assert.equal(service.status().metrics.autopilotCoordinationRetriesPending, 1);
  const retry = await service.retryAcceptedEventHandlers();
  assert.deepEqual(retry, { state: 'CAUGHT_UP', considered: 1, completed: 1, pending: 0 });
  assert.equal(attempts, 2);
  assert.equal((await journal.events()).length, 1);
  assert.equal(service.status().metrics.autopilotCoordinationRetriesPending, 0);
});

test('current twin projection is single-flight cached and invalidates on a new journal record', async () => {
  const memory = new MemoryOperationalEventJournal({ clock: () => new Date('2026-08-24T12:02:00Z') });
  let eventReads = 0;
  const journal = {
    initialize: (...args) => memory.initialize(...args), status: () => memory.status(),
    appendEvent: (...args) => memory.appendEvent(...args), appendRejection: (...args) => memory.appendRejection(...args),
    rejections: (...args) => memory.rejections(...args), events: async (...args) => { eventReads += 1; return memory.events(...args); }
  };
  const registry = createSourceRegistry([{ sourceId: 'test-reporter', familyId: 'report.test', familyClass: 'REPORT', staleAfterMs: 3_600_000, registeredAt: '2026-08-24T12:00:00Z' }]);
  const service = new OperationalIntelligenceService({ journal, sourceRegistry: registry, clock: () => new Date('2026-08-24T12:02:00Z') });
  await service.ingestOperationalEvent(event('cache-a'), { ingestedAt: '2026-08-24T12:01:00Z', project: false });
  const [first, concurrent] = await Promise.all([service.getCurrentTwin(), service.getCurrentTwin()]);
  const retained = await service.getCurrentTwin();
  assert.equal(first.projectionHash, concurrent.projectionHash); assert.equal(retained.projectionHash, first.projectionHash); assert.equal(eventReads, 1);
  await service.ingestOperationalEvent(event('cache-b'), { ingestedAt: '2026-08-24T12:01:30Z', project: false });
  const refreshed = await service.getCurrentTwin();
  assert.notEqual(refreshed.projectionHash, first.projectionHash); assert.equal(eventReads, 2);
});

test('Agent 1 compatibility events remain contextual and project into canonical incidents',async()=>{
  const adapter=new Agent1OperationalProjectionAdapter(),journal=new MemoryOperationalEventJournal(),registry=createSourceRegistry([{sourceId:adapter.id,familyId:'system.agent1-operational-projection',familyClass:'SYSTEM',staleAfterMs:120_000,registeredAt:'2026-08-24T12:00:00Z'}]),service=new OperationalIntelligenceService({journal,sourceRegistry:registry,adapters:[adapter],clock:()=>new Date('2026-08-24T12:05:00Z')});
  const result=await service.ingestRawProviderPayload(adapter.id,[{id:'PT-2026-TEST',label:'Governed compatibility projection',coordinate:[-8,40],firstSeenAt:'2026-08-24T12:00:00Z',lastSeenAt:'2026-08-24T12:04:00Z',evidenceState:'reported',knowledgeState:'report_only'}],{receivedAt:'2026-08-24T12:05:00Z'}),twin=await service.getCurrentTwin(),family=twin.incidents[0].evidenceGraph.sourceFamilies[0];
  assert.equal(result.ingestion[0].state,'ACCEPTED');assert.equal(twin.incidents.length,1);assert.equal(family.familyClass,'CONTEXT');assert.equal(family.metadata.operationalFamilyClass,'SYSTEM');assert.equal(twin.incidents[0].evaluation.state,'INSUFFICIENT');
});
