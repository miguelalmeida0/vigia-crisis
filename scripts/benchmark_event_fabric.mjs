import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { adaptRecords, createSourceRegistry, FieldNetOperationalAdapter } from '../packages/domain/src/event-fabric/index.mjs';
import { evaluateEvidenceContract } from '../packages/domain/src/intelligence/evaluation/evaluate-evidence-contract.mjs';
import { OPERATIONAL_WILDFIRE_CONTRACT_V1, createOperationalTwinReplay, projectOperationalTwin, verifyOperationalTwinReplay } from '../packages/domain/src/operational-twin/index.mjs';
import { AppendOnlyOperationalEventJournal } from '../apps/api/src/modules/intelligence/append-only-event-journal.mjs';
import { MemoryOperationalEventJournal } from '../apps/api/src/modules/intelligence/memory-event-journal.mjs';

const requested = Number(process.argv.find((item) => item.startsWith('--events='))?.split('=')[1] ?? 10_000);
if (!Number.isInteger(requested) || requested < 1 || requested > 50_000) throw new Error('events_must_be_an_integer_between_1_and_50000');
const measure = async (operation) => { const started = performance.now(), value = await operation(); return { value, milliseconds: Number((performance.now() - started).toFixed(3)) }; };
const metric = (count, milliseconds) => ({ count, milliseconds, eventsPerSecond: Number((count / (milliseconds / 1000)).toFixed(1)), meanMilliseconds: Number((milliseconds / count).toFixed(6)) });
const adapter = new FieldNetOperationalAdapter();
const rows = Array.from({ length: requested }, (_, index) => ({
  observationId: `benchmark-${index}`, reporterId: `reporter-${index % 100}`, kind: 'human_report',
  observedAt: new Date(Date.parse('2026-08-24T12:00:00Z') + index % 3_600 * 1000).toISOString(),
  coordinate: [-9 + index % 1000 / 10_000, 39 + Math.floor(index / 1000) % 100 / 1000], correlationKeys: [`incident:benchmark-${index}`]
}));
const normalization = await measure(() => adaptRecords({ adapter, records: rows, receivedAt: '2026-08-24T13:00:00Z' }));
const events = normalization.value.events;
const deduplication = await measure(() => {
  const index = new Map(); for (const event of [...events, ...events.slice(0, Math.floor(events.length / 10))]) if (!index.has(event.id)) index.set(event.id, event); return index;
});
const memory = new MemoryOperationalEventJournal({ clock: () => new Date('2026-08-24T13:00:00Z') });
const memoryPersistence = await measure(async () => { for (const event of events) await memory.appendEvent(event, { ingestedAt: '2026-08-24T13:00:00Z' }); return memory.events(); });
const projectCount = Math.min(requested, 2_000), projectedEvents = memoryPersistence.value.slice(0, projectCount), sourceRegistry = createSourceRegistry([]);
const projection = await measure(() => projectOperationalTwin({ events: projectedEvents, sourceRegistry, asOf: '2026-08-24T13:30:00Z' }));
const sampleIncident = projection.value.incidents[0], evaluationIterations = Math.min(requested, 10_000);
const contractEvaluation = await measure(() => {
  let output; for (let index = 0; index < evaluationIterations; index += 1) output = evaluateEvidenceContract({ claim: sampleIncident.claim, contract: OPERATIONAL_WILDFIRE_CONTRACT_V1, evidenceGraph: sampleIncident.evidenceGraph, evaluationTime: '2026-08-24T13:30:00Z' }); return output;
});
const replay = await measure(() => createOperationalTwinReplay({ events: projectedEvents, sourceRegistry, asOf: '2026-08-24T13:30:00Z' }));
const replayVerification = verifyOperationalTwinReplay(replay.value, { events: [...projectedEvents].reverse(), sourceRegistry });
await mkdir(path.join(process.cwd(), '.tmp'), { recursive: true });
const directory = await mkdtemp(path.join(process.cwd(), '.tmp/event-fabric-benchmark-')), durableCount = Math.min(requested, 1_000);
let durablePersistence;
try {
  const durable = new AppendOnlyOperationalEventJournal({ filePath: path.join(directory, 'events.jsonl') }); await durable.initialize();
  durablePersistence = await measure(async () => { for (const event of events.slice(0, durableCount)) await durable.appendEvent(event, { ingestedAt: '2026-08-24T13:00:00Z' }); return durable.status(); });
} finally { await rm(directory, { recursive: true, force: true }); }
const output = {
  schemaVersion: 'vigia.event-fabric-benchmark.v1', requestedEvents: requested,
  workload: { normalizationEvents: requested, dedupInputEvents: requested + Math.floor(requested / 10), memoryPersistenceEvents: requested, durableFsyncEvents: durableCount, projectionEvents: projectCount, contractEvaluationIterations: evaluationIterations, replayEvents: projectCount },
  results: {
    normalization: metric(requested, normalization.milliseconds), deduplication: metric(requested + Math.floor(requested / 10), deduplication.milliseconds),
    memoryPersistence: metric(requested, memoryPersistence.milliseconds), durableFsyncPersistence: metric(durableCount, durablePersistence.milliseconds),
    operationalTwinProjection: metric(projectCount, projection.milliseconds), contractEvaluation: metric(evaluationIterations, contractEvaluation.milliseconds),
    fullReplay: metric(projectCount, replay.milliseconds)
  },
  integrity: { normalized: events.length, rejected: normalization.value.rejections.length, uniqueAfterRetryInjection: deduplication.value.size, projectedIncidents: projection.value.incidents.length, replayVerified: replayVerification.valid }
};
console.log(JSON.stringify(output, null, 2));
