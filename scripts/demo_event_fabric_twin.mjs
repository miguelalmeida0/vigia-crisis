import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CapOperationalAdapter, createSourceRegistry, FieldNetOperationalAdapter, FirmsOperationalAdapter
} from '../packages/domain/src/event-fabric/index.mjs';
import { AppendOnlyOperationalEventJournal } from '../apps/api/src/modules/intelligence/append-only-event-journal.mjs';
import { OperationalIntelligenceService } from '../apps/api/src/modules/intelligence/operational-intelligence-service.mjs';

const root = process.cwd(), fixtures = path.join(root, 'packages/domain/test/fixtures/event-fabric');
const load = async (name) => JSON.parse(await readFile(path.join(fixtures, name), 'utf8'));
const [fieldRows, firmsRows, capRows] = await Promise.all([load('fieldnet-observations.json'), load('firms-viirs-records.json'), load('cap-alerts.json')]);
const common = { staleAfterMs: 6 * 60 * 60_000, registeredAt: '2026-08-24T11:00:00Z' };
const sourceRegistry = createSourceRegistry([
  { ...common, sourceId: 'fieldnet:citizen-report-channel', familyId: 'report.fieldnet-human', familyClass: 'REPORT' },
  { ...common, sourceId: 'fieldnet:municipal-hotline', familyId: 'report.fieldnet-human', familyClass: 'REPORT' },
  { ...common, sourceId: 'fieldnet:camera-17', familyId: 'physical.fieldnet-optical', familyClass: 'PHYSICAL' },
  { ...common, sourceId: 'firms-broker-a', familyId: 'physical.viirs', familyClass: 'PHYSICAL' },
  { ...common, sourceId: 'firms-broker-b', familyId: 'physical.viirs', familyClass: 'PHYSICAL' },
  { ...common, sourceId: 'cap-authority', familyId: 'official.cap-alert', familyClass: 'OFFICIAL' }
]);
const fieldnet = new FieldNetOperationalAdapter(), firmsA = new FirmsOperationalAdapter({ id: 'firms-a', sourceId: 'firms-broker-a' });
const firmsB = new FirmsOperationalAdapter({ id: 'firms-b', sourceId: 'firms-broker-b' }), cap = new CapOperationalAdapter();
const journal = new AppendOnlyOperationalEventJournal({ filePath: path.join(root, '.tmp/event-fabric-demo/operational-events-v3.jsonl'), clock: () => new Date('2026-08-24T12:33:00Z') });
const service = new OperationalIntelligenceService({ journal, sourceRegistry, adapters: [fieldnet, firmsA, firmsB, cap], clock: () => new Date('2026-08-24T12:33:00Z') });
await service.initialize();

const ingest = (adapterId, payload, receivedAt, context = {}) => service.ingestRawProviderPayload(adapterId, payload, { receivedAt, ingestedAt: receivedAt, projectedAt: receivedAt, context });
await ingest(fieldnet.id, fieldRows[0], '2026-08-24T12:01:00Z');
await ingest(firmsA.id, firmsRows, '2026-08-24T12:09:00Z', { correlationKeys: ['incident:wildfire-demo'] });
await ingest(firmsB.id, firmsRows[0], '2026-08-24T12:09:30Z', { correlationKeys: ['incident:wildfire-demo'] });
await ingest(fieldnet.id, { ...fieldRows[2], observationId: 'CAMERA-POSITIVE-INITIAL', observedAt: '2026-08-24T12:12:00Z', resolvesEventIds: [] }, '2026-08-24T12:13:00Z');
await ingest(cap.id, capRows, '2026-08-24T12:15:00Z');
await ingest(fieldnet.id, fieldRows[3], '2026-08-24T12:16:00Z');
await service.ingestSourceHealth({ sourceId: 'fieldnet:camera-17', status: 'UNAVAILABLE', at: '2026-08-24T12:17:00Z', reason: 'Heartbeat lost.' }, { receivedAt: '2026-08-24T12:17:00Z', ingestedAt: '2026-08-24T12:17:00Z' });
await service.ingestSourceHealth({ sourceId: 'fieldnet:camera-17', status: 'ACTIVE', at: '2026-08-24T12:18:00Z', lastSuccessAt: '2026-08-24T12:18:00Z' }, { receivedAt: '2026-08-24T12:18:00Z', ingestedAt: '2026-08-24T12:18:00Z' });
const negativeResult = await ingest(fieldnet.id, fieldRows[1], '2026-08-24T12:19:00Z'), negativeEventId = negativeResult.ingestion[0].event.id;
await ingest(fieldnet.id, { ...fieldRows[2], resolvesEventIds: [negativeEventId] }, '2026-08-24T12:25:00Z');

const twin = await service.getTwinAsOf('2026-08-24T12:33:00Z'), incident = twin.incidents.find((item) => item.incident.id === 'incident:wildfire-demo');
const replay = await service.createReplay('2026-08-24T12:33:00Z'), verification = await service.verifyReplay(replay);
const afterFirstPhysical = await service.getTwinAsOf('2026-08-24T12:09:05Z'), afterBrokerDuplicate = await service.getTwinAsOf('2026-08-24T12:10:00Z');
const beforeLate = await service.getTwinAsOf('2026-08-24T12:15:30Z'), afterLate = await service.getTwinAsOf('2026-08-24T12:16:30Z');
const unavailable = await service.getTwinAsOf('2026-08-24T12:17:30Z'), contradicted = await service.getTwinAsOf('2026-08-24T12:20:00Z');
const summary = {
  demo: 'VIGIA Event Fabric + Ambient Operational Twin v1', journal: service.status().journal,
  incident: {
    id: incident.incident.id, state: incident.evaluation.state, satisfied: incident.evaluation.satisfied,
    qualifyingEvidence: incident.evaluation.qualifyingEvidence.map((item) => item.evidenceId),
    excludedEvidence: incident.evaluation.excludedEvidence.map((item) => ({ evidenceId: item.evidenceId, classification: item.classification })),
    evidenceDebt: { state: incident.evidenceDebt.state, count: incident.evidenceDebt.count },
    transitions: twin.transitions.filter((item) => item.incidentId === incident.incident.id).map((item) => ({ at: item.at, from: item.from, to: item.to, reasons: item.reasons }))
  },
  proofPoints: {
    duplicateDelivery: {
      independentFamiliesBefore: afterFirstPhysical.incidents[0].evaluation.independentFamilies.length,
      independentFamiliesAfter: afterBrokerDuplicate.incidents[0].evaluation.independentFamilies.length,
      quorumUnchanged: afterFirstPhysical.incidents[0].evaluation.independentFamilies.length === afterBrokerDuplicate.incidents[0].evaluation.independentFamilies.length
    },
    lateEvent: { observedAt: fieldRows[3].observedAt, receivedAt: '2026-08-24T12:16:00Z', eventCountBeforeReceipt: beforeLate.eventCount, eventCountAfterReceipt: afterLate.eventCount },
    unavailableSource: { evidenceState: unavailable.incidents[0].evaluation.state, blockingContradictions: unavailable.incidents[0].evaluation.contradictions.filter((item) => item.blocking).length },
    historicalQuery: { asOf: contradicted.asOf, evidenceState: contradicted.incidents[0].evaluation.state },
    currentQuery: { asOf: twin.asOf, evidenceState: incident.evaluation.state }
  },
  sourceHealth: twin.sourceHealth.sources.map((item) => ({ sourceId: item.sourceId, status: item.status })),
  sourceTransitions: twin.transitions.filter((item) => item.entityType === 'SOURCE').map((item) => ({ sourceId: item.sourceId, at: item.at, from: item.from, to: item.to, reasons: item.reasons })),
  failures: twin.failures, replay: { replayHash: replay.replayHash, projectionHash: replay.projectionHash, verified: verification.valid },
  durableRejections: (await service.rejectionLog()).map((item) => ({ code: item.code, providerEventId: item.providerEventId }))
};
console.log(JSON.stringify(summary, null, 2));
