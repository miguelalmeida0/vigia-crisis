import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createActionBudget, createAuthorityContext, createControlPlaneReplay, createWildfireControlPolicies, verifyControlPlaneReplay
} from '../packages/domain/src/control-plane/index.mjs';
import { createCanonicalOperationalEvent, createSourceRegistry } from '../packages/domain/src/event-fabric/index.mjs';
import { ControlPlaneService } from '../apps/api/src/modules/intelligence/control-plane-service.mjs';
import { AppendOnlyOperationalEventJournal } from '../apps/api/src/modules/intelligence/append-only-event-journal.mjs';
import { OperationalIntelligenceService } from '../apps/api/src/modules/intelligence/operational-intelligence-service.mjs';

const fixturePath = new URL('../packages/domain/test/fixtures/control-plane/autonomous-wildfire.json', import.meta.url);
const fixture = JSON.parse(await readFile(fixturePath, 'utf8')), policies = createWildfireControlPolicies();
const root = path.resolve('.tmp'); await mkdir(root, { recursive: true });
const directory = await mkdtemp(path.join(root, 'autonomous-wildfire-'));
const sourceRegistry = createSourceRegistry(fixture.sources.map((source) => ({
  ...source, staleAfterMs: 6 * 60 * 60_000, registeredAt: fixture.registeredAt, geographicApplicability: { bbox: [-9, 39, -7, 41] },
  capabilities: ['FAMILY_CLASS_QUORUM'], metadata: { priority: source.priority, reliability: 0.95, cost: source.priority,
    provenanceStrength: source.familyClass === 'REPORT' ? 'ATTRIBUTED' : 'VERIFIED' }
})));
const intelligence = new OperationalIntelligenceService({ journal: new AppendOnlyOperationalEventJournal({ filePath: path.join(directory, 'events.jsonl') }), sourceRegistry });
const control = new ControlPlaneService({ intelligenceService: intelligence, policies,
  budget: createActionBudget({ maximumActionsPerCycle: 20, maximumActionsPerIncident: 50, maximumAttemptsPerAction: 3, maximumActionsPerProvider: 4 }) });
const authority = createAuthorityContext({ principalId: 'runtime:autonomous-demo', grantedCapabilities: [
  'control:evidence-acquisition', 'control:reversible', 'control:contradiction-work'
], validFrom: fixture.registeredAt, authorityRef: 'demo-bounded-control-authority' });

function event({ id, sourceId, familyId, familyClass, at, stance = 'SUPPORTING', state = 'OBSERVED_POSITIVE', upstreamMeasurementId = id, resolvesEventIds = [] }) {
  return createCanonicalOperationalEvent({ eventType: 'wildfire.demo_observation', hazardType: 'wildfire',
    provider: { adapterId: `demo:${sourceId}`, adapterVersion: '1', providerEventId: id },
    source: { sourceId, familyId, familyClass, producerId: sourceId, upstreamOrigin: `demo:${sourceId}` },
    clocks: { occurredAt: at, observedAt: at, publishedAt: at, receivedAt: at, ingestedAt: null }, geometry: fixture.location,
    correlationKeys: [fixture.incidentId], payload: { observationState: state, stance, materiality: 'MATERIAL', opportunity: { state: 'VALID' }, resolvesEventIds },
    provenance: { strength: familyClass === 'REPORT' ? 'ATTRIBUTED' : 'VERIFIED', upstreamMeasurementId, rawPayloadHash: `fixture:${id}`, proofStatus: 'VERIFIED' },
    proof: { fixture: fixture.schemaVersion, synthetic: false } });
}
async function ingest(record, ingestedAt) { return intelligence.ingestOperationalEvent(record, { ingestedAt, project: false }); }
async function reconcile(at, consequentialIntent = false) {
  return control.reconcile({ asOf: at, authority, consequentialIntentByIncident: { [fixture.incidentId]: consequentialIntent } });
}

const report = event({ id: 'weak-report', sourceId: 'report:public', familyId: 'report.public', familyClass: 'REPORT', at: '2026-08-24T12:00:00Z' });
const viirsA = event({ id: 'viirs-a', sourceId: 'viirs:broker-a', familyId: 'physical.viirs', familyClass: 'PHYSICAL', at: '2026-08-24T12:01:00Z', upstreamMeasurementId: 'viirs-pixel-001' });
const viirsB = event({ id: 'viirs-b', sourceId: 'viirs:broker-b', familyId: 'physical.viirs', familyClass: 'PHYSICAL', at: '2026-08-24T12:01:01Z', upstreamMeasurementId: 'viirs-pixel-001' });
await ingest(report, '2026-08-24T12:00:10Z'); await ingest(viirsA, '2026-08-24T12:01:10Z'); await ingest(viirsB, '2026-08-24T12:01:11Z');
const acquisition = await reconcile('2026-08-24T12:03:00Z');
let twin = await intelligence.getTwinAsOf('2026-08-24T12:03:00Z');
const afterDuplicate = { state: twin.incidents[0].evaluation.state,
  independentPhysicalFamilies: twin.incidents[0].evaluation.independentFamilies.filter((item) => item.familyClass === 'PHYSICAL').length,
  causalDuplicates: twin.incidents[0].evaluation.excludedEvidence.filter((item) => item.classification === 'CAUSAL_DUPLICATE').length,
  activeAcquisitions: twin.controlPlane.acquisitionRequests.filter((item) => item.status === 'ACTIVE').map((item) => item.sourceId).sort() };

await intelligence.ingestSourceHealth({ sourceId: 'sensor:optical', status: 'UNAVAILABLE', at: '2026-08-24T12:04:00Z', reason: 'Injected optical provider outage.' }, { ingestedAt: '2026-08-24T12:04:00Z', project: false });
const outage = await reconcile('2026-08-24T12:05:00Z');
const thermal = event({ id: 'thermal-independent', sourceId: 'sensor:thermal', familyId: 'physical.thermal', familyClass: 'PHYSICAL', at: '2026-08-24T12:06:00Z' });
await ingest(thermal, '2026-08-24T12:06:10Z'); await reconcile('2026-08-24T12:07:00Z');
const official = event({ id: 'official-cap-alert', sourceId: 'authority:cap', familyId: 'official.cap', familyClass: 'OFFICIAL', at: '2026-08-24T12:08:00Z' });
await ingest(official, '2026-08-24T12:08:10Z'); await reconcile('2026-08-24T12:09:00Z');
await intelligence.ingestSourceHealth({ sourceId: 'sensor:thermal', status: 'STALE', at: '2026-08-24T12:10:00Z', reason: 'Expected supporting cadence exceeded.' }, { ingestedAt: '2026-08-24T12:10:00Z', project: false });
const staleReaction = await reconcile('2026-08-24T12:11:00Z');

const contradiction = event({ id: 'blocking-negative', sourceId: 'authority:field', familyId: 'official.field', familyClass: 'OFFICIAL', at: '2026-08-24T12:12:00Z', stance: 'CONTRADICTING', state: 'OBSERVED_NEGATIVE' });
await ingest(contradiction, '2026-08-24T12:12:10Z'); const guarded = await reconcile('2026-08-24T12:13:00Z');
const radar = event({ id: 'radar-independent', sourceId: 'sensor:radar', familyId: 'physical.radar', familyClass: 'PHYSICAL', at: '2026-08-24T12:14:00Z' });
const resolution = event({ id: 'field-resolution', sourceId: 'authority:field', familyId: 'official.field', familyClass: 'OFFICIAL', at: '2026-08-24T12:14:30Z', resolvesEventIds: [contradiction.id] });
await ingest(radar, '2026-08-24T12:14:10Z'); await ingest(resolution, '2026-08-24T12:14:40Z');
const finalRun = await reconcile('2026-08-24T12:15:00Z', true); twin = await intelligence.getTwinAsOf('2026-08-24T12:15:00Z');
const events = await intelligence.getOperationalEvents({ asOf: '2026-08-24T12:15:00Z' });
const twinReplay = await intelligence.createReplay('2026-08-24T12:15:00Z'), controlReplay = createControlPlaneReplay({ events, sourceRegistry, policies, asOf: '2026-08-24T12:15:00Z', consequentialIntentByIncident: { [fixture.incidentId]: true } });
const proof = {
  schemaVersion: 'vigia.autonomous-wildfire-proof.v1', journalPath: path.join(directory, 'events.jsonl'), afterDuplicate,
  runs: { acquisition: acquisition.state, outage: outage.state, staleReaction: staleReaction.state, guarded: guarded.state, final: finalRun.state },
  final: { intelligenceState: twin.incidents[0].evaluation.state, evidenceDebt: twin.incidents[0].evidenceDebt.count,
    activeAcquisitions: twin.controlPlane.acquisitionRequests.filter((item) => ['ACTIVE', 'BACKOFF'].includes(item.status)).length,
    contradictionWork: twin.controlPlane.workItems.map((item) => item.status),
    consequentialActionsExecuted: twin.controlPlane.actions.filter((item) => item.safetyClass === 'CONSEQUENTIAL' && item.status === 'SUCCEEDED').length,
    authorityRequired: twin.controlPlane.actions.filter((item) => item.status === 'AUTHORITY_REQUIRED').length,
    receipts: twin.controlPlane.receipts.length, convergenceCycles: control.status().metrics.convergenceCycles },
  replay: { twinValid: (await intelligence.verifyReplay(twinReplay)).valid, controlValid: verifyControlPlaneReplay(controlReplay, { events: [...events].reverse(), sourceRegistry, policies, consequentialIntentByIncident: { [fixture.incidentId]: true } }).valid,
    projectionHash: twin.projectionHash, replayProjectionHash: twinReplay.projectionHash }, metrics: control.status().metrics
};
console.log(JSON.stringify(proof, null, 2));
if (proof.afterDuplicate.independentPhysicalFamilies !== 1 || proof.afterDuplicate.causalDuplicates !== 1 || proof.final.intelligenceState !== 'CORROBORATED'
  || proof.final.evidenceDebt !== 0 || proof.final.consequentialActionsExecuted !== 0 || !proof.replay.twinValid || !proof.replay.controlValid) throw new Error('autonomous_wildfire_proof_failed');
