import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FileIntelligenceRepository } from '../src/modules/intelligence/file-intelligence-repository.mjs';
import { PostgresOperationalIntelligenceRepository } from '../src/modules/intelligence/postgres-operational-intelligence-repository.mjs';
import { DecisionMemoryService, ProspectiveArchiveService } from '../src/modules/decision-foundry/learning-service.mjs';
import { CWFIS_PROSPECTIVE_RIGHTS_RECORD, CwfisProspectiveProvider } from '../src/modules/decision-foundry/cwfis-prospective-provider.mjs';
import { OperationalIntelligenceQueryServiceV2 } from '../src/modules/decision-foundry/operational-query-service.mjs';
import { materializeDecisionObjectSetProjection } from '../src/modules/decision-foundry/object-set-projection.mjs';
import { invalidateDecisionObjectSetCache, queryDecisionObjectSet } from '../src/modules/decision-foundry/query-service.mjs';

const at = '2026-08-25T00:00:00.000Z';
async function repository() { const directory = await mkdtemp(path.join(os.tmpdir(), 'vigia-convergence-')); const value = new FileIntelligenceRepository({ filePath: path.join(directory, 'repository.json'), clock: () => new Date(at) }); await value.initialize(); return value; }
const event = { id: 'event-a', semanticIdentity: 'provider:revision:a', incidentId: 'incident-a', type: 'EVIDENCE_RECEIVED', effectiveAt: at, receivedAt: at, payload: { value: 1 }, rights: { state: 'READY' } };
const object = (value = 1) => ({ schemaVersion: 'vigia.test-object.v1', value });

async function writeFixture(root, relativePath, value) {
  const file = path.join(root, relativePath); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value));
}

async function projectionFixture() {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'vigia-indexed-projection-')), incidentId = '2025-AZGCP-000597';
  const priorityVector = (candidateIdentity, consequenceRank) => ({ consequenceRank, deadlineEpochMs: Number.MAX_SAFE_INTEGER, criticalDecisionsUnlocked: 0, materialHypothesesSeparated: 0, evidenceContractsSatisfied: 1, independentFamiliesGained: 0, forecastHorizonsUnlocked: 1, scientificGatesUnlocked: 0, sourceEligible: 0, rightsReadiness: 1, sourceQuality: 2, expectedLatencyMs: 1000, expectedCostUnits: 0, expectedBytes: 100, retryRisk: 0, candidateIdentity });
  const packet = { incident: { id: incidentId }, knowledgeTime: at, decisions: { results: [] }, hypotheses: { results: [] }, evidenceNeedIds: [], rankedAcquisitions: [{ candidateId: 'candidate-a', priorityVector: priorityVector('candidate-a', 2), blockingConditions: ['NO_VALID_OBSERVATION_OPPORTUNITY'], explanation: 'bounded fixture' }, { candidateId: 'candidate-b', priorityVector: priorityVector('candidate-b', 1), blockingConditions: ['NO_VALID_OBSERVATION_OPPORTUNITY'], explanation: 'bounded fixture' }] };
  const progression = { fingerprint: 'fixture-progression', acceptedStateIds: ['a', 'b', 'c'], revisions: [] }, summary = { schemaVersion: 'vigia.progression-projection-summary.v1', incidentId, sourceFingerprint: progression.fingerprint, acceptedStateCount: 3, revisionCount: 0, invalidRevisionCount: 0, unstableGeometry: false };
  await Promise.all([
    writeFixture(projectRoot, `data/runtime/decision-foundry/packets/${incidentId}.json`, packet),
    writeFixture(projectRoot, `data/runtime/decision-foundry/progressions/${incidentId}.json`, progression),
    writeFixture(projectRoot, `data/runtime/decision-foundry/projection-inputs/progressions/${incidentId}.json`, summary),
    writeFixture(projectRoot, `data/runtime/decision-foundry/future-labels/${incidentId}.json`, { labels: [{ horizonHours: 3 }] }),
    writeFixture(projectRoot, 'data/runtime/data-foundry/lineage-graph.json', { verification: { passed: true } })
  ]);
  return { projectRoot, incidentId };
}

test('file repository makes concurrent semantic event ingestion idempotent', async () => {
  const repo = await repository(), results = await Promise.all(Array.from({ length: 32 }, () => repo.appendEvent(event)));
  assert.equal(results.filter((item) => item.state === 'ACCEPTED').length, 1); assert.equal(results.filter((item) => item.state === 'DUPLICATE').length, 31); assert.equal((await repo.readSnapshot()).events.length, 1);
  await assert.rejects(() => repo.appendEvent({ ...event, payload: { value: 2 } }), /identity_conflict/);
});

test('optimistic concurrency prevents mixed revision state and failed transactions do not commit', async () => {
  const repo = await repository(); await repo.putObject('EVIDENCE', 'evidence-a', object(), { incidentId: 'incident-a' });
  const results = await Promise.allSettled([repo.putObject('EVIDENCE', 'evidence-a', object(2), { incidentId: 'incident-a', expectedRevision: 1 }), repo.putObject('EVIDENCE', 'evidence-a', object(3), { incidentId: 'incident-a', expectedRevision: 1 })]);
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1); assert.equal(results.filter((item) => item.status === 'rejected').length, 1);
  const before = await repo.readSnapshot(); await assert.rejects(() => repo.transact(() => { throw new Error('injected_projection_crash'); }), /injected_projection_crash/); assert.deepEqual(await repo.readSnapshot(), before);
});

test('foreign-key lineage, rights persistence, restart reconstruction, cursors, and consistency tokens hold', async () => {
  const repo = await repository(); await repo.putObject('RAW', 'raw-a', object(), { incidentId: 'incident-a', rights: { state: 'READY' } }); await repo.putObject('EVIDENCE', 'evidence-a', object(), { incidentId: 'incident-a', rights: { state: 'RESTRICTED' } });
  await repo.linkLineage({ parentKind: 'RAW', parentId: 'raw-a', childKind: 'EVIDENCE', childId: 'evidence-a', relationship: 'DERIVED_FROM' }); await assert.rejects(() => repo.linkLineage({ parentKind: 'RAW', parentId: 'missing', childKind: 'EVIDENCE', childId: 'evidence-a', relationship: 'DERIVED_FROM' }), /foreign_key/);
  const first = await repo.listObjects({ incidentId: 'incident-a', limit: 1 }), second = await repo.listObjects({ incidentId: 'incident-a', limit: 1, cursor: first.nextCursor, projectionVersion: first.projectionVersion }); assert.equal(first.results.length, 1); assert.equal(second.results.length, 1);
  await repo.putObject('EVIDENCE', 'evidence-b', object(), { incidentId: 'incident-a' }); await assert.rejects(() => repo.listObjects({ projectionVersion: first.projectionVersion }), /consistency_token_mismatch/); await assert.rejects(() => repo.listObjects({ cursor: first.nextCursor }), /cursor_projection_mismatch/);
  const restarted = new FileIntelligenceRepository({ filePath: repo.filePath }); assert.equal((await restarted.getObject('EVIDENCE', 'evidence-a')).rights.state, 'RESTRICTED');
});

test('race: semantic acquisitions converge once and integrity conflicts leave no partial state', async () => {
  const repo = await repository(), attempts = await Promise.allSettled([
    repo.putObject('ACQUISITION_TASK', 'worker-a', object(), { semanticIdentity: 'provider:product:window' }),
    repo.putObject('ACQUISITION_TASK', 'worker-b', object(), { semanticIdentity: 'provider:product:window' })
  ]);
  assert.equal(attempts.filter((item) => item.status === 'fulfilled').length, 1); assert.equal(attempts.filter((item) => item.status === 'rejected').length, 1);
  assert.equal((await repo.listObjects({ kind: 'ACQUISITION_TASK' })).results.length, 1);
  const before = await repo.readSnapshot(); await assert.rejects(() => repo.persistArchiveSnapshot({ schemaVersion: 'vigia.prospective-knowledge-time-snapshot.v1', fingerprint: 'snapshot-invalid', manifestId: 'manifest', sequence: 2, incidentId: 'incident-a', providerId: 'provider', productId: 'product', vigiaReceivedAt: at, rawObjectHash: 'a'.repeat(64), previousSnapshotFingerprint: 'missing' }), /foreign_key/); assert.deepEqual(await repo.readSnapshot(), before);
});

test('crash: packet/outcome and information-value constraints are atomic across restart', async () => {
  const repo = await repository(), before = await repo.readSnapshot();
  const outcome = { schemaVersion: 'vigia.decision-outcome.v1', id: 'outcome-a', packetFingerprint: 'missing-packet', incidentId: 'incident-a', decisionTime: at };
  await assert.rejects(() => repo.persistDecisionOutcome(outcome), /packet_foreign_key/); assert.deepEqual(await repo.readSnapshot(), before);
  const packet = { schemaVersion: 'vigia.crisis-decision-packet.v1', replayFingerprint: 'packet-a', incident: { id: 'incident-a' }, knowledgeTime: at }; await repo.persistDecisionPacket(packet); await repo.persistDecisionOutcome({ ...outcome, packetFingerprint: packet.replayFingerprint });
  const information = { schemaVersion: 'vigia.realized-information-value.v1', id: 'value-a', acquisitionId: 'acquisition-a', incidentId: 'incident-a', providerId: 'provider-a', acquisitionType: 'PERIMETER' }; await repo.persistInformationValueOutcome(information); const stable = await repo.readSnapshot();
  await assert.rejects(() => repo.persistInformationValueOutcome({ ...information, id: 'value-b' }), /acquisition_conflict/); assert.deepEqual(await repo.readSnapshot(), stable);
  const restarted = new FileIntelligenceRepository({ filePath: repo.filePath }); assert.ok(await restarted.getObject('DECISION_OUTCOME', outcome.id)); assert.ok(await restarted.getObject('INFORMATION_VALUE_OUTCOME', information.id));
});

test('prospective archive appends immutable snapshots and Decision Memory never performs consequential action', async () => {
  const repo = await repository(), archive = new ProspectiveArchiveService({ repository: repo }), manifest = await archive.registerManifest({ id: 'manifest-a', mode: 'INCIDENT_WATCH', providers: ['provider-a'], products: ['perimeter'], regions: ['region-a'], incidentIds: ['incident-a'], cadenceSeconds: 300, retentionDays: 365, startedAt: at, rights: { state: 'READY', licenceId: 'OPEN' } });
  const first = await archive.capture(manifest, { incidentId: 'incident-a', providerId: 'provider-a', productId: 'perimeter', providerPublishedAt: at, vigiaReceivedAt: at, rawObjectReference: 'raw:a', rawObjectHash: 'a'.repeat(64) });
  const second = await archive.capture(manifest, { incidentId: 'incident-a', providerId: 'provider-a', productId: 'perimeter', providerPublishedAt: at, vigiaReceivedAt: '2026-08-25T00:05:00Z', rawObjectReference: 'raw:b', rawObjectHash: 'b'.repeat(64) });
  assert.notEqual(first.fingerprint, second.fingerprint); assert.equal(second.previousSnapshotFingerprint, first.fingerprint); assert.equal((await archive.history('incident-a')).results[0].fingerprint, first.fingerprint);
  const memory = new DecisionMemoryService({ repository: repo }); const shadow = await memory.recordShadow({ id: 'shadow-a', incidentId: 'incident-a', recordedAt: at, decisionPacketFingerprint: 'packet-a', wouldHaveActions: ['WARN'] }); assert.equal(shadow.consequentialActionsExecuted, 0);
});

test('CWFIS prospective capture is rights-gated, bounded, raw-preserving, timestamp-honest, and shadow-only', async () => {
  const preserved = [], rawVault = { async preserve(input) { preserved.push(input); return { duplicate: false, product: { id: 'raw-cwfis-a', originalUriOrObjectKey: 'raw/cwfis/a.json', checksumSha256: 'c'.repeat(64) } }; } };
  const withoutApproval = new CwfisProspectiveProvider({ rawVault, clock: () => new Date(at) });
  assert.equal(withoutApproval.rightsStatus().state, 'ACCEPTANCE_REQUIRED'); assert.equal(CWFIS_PROSPECTIVE_RIGHTS_RECORD.historicalQualification, 'NOT_QUALIFIED');
  assert.throws(() => withoutApproval.createManifest({ id: 'canada-a', incidentIds: ['2026_BC_2026-K51915'] }), /rights_acceptance_required/);
  const approval = { state: 'READY', licenceId: CWFIS_PROSPECTIVE_RIGHTS_RECORD.licenceId, acceptedAt: at, acceptedBy: 'authorized-test-principal' };
  const payload = { type: 'FeatureCollection', timeStamp: '2026-08-25T00:00:01Z', features: [{ type: 'Feature', id: 'm3.1', geometry: { type: 'Polygon', coordinates: [[[-120, 49], [-118, 49], [-118, 51], [-120, 51], [-120, 49]]] }, properties: { firstdate: '2026-08-24T12:00:00Z', lastdate: '2026-08-24T23:00:00Z', area: 10 } }] };
  let requested; const fetchImpl = async (url) => { requested = new URL(url); return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/geo+json' } }); };
  const repo = await repository(), archiveService = new ProspectiveArchiveService({ repository: repo }), provider = new CwfisProspectiveProvider({ rawVault, archiveService, fetchImpl, clock: () => new Date(at), rightsApproval: approval });
  const manifest = provider.createManifest({ id: 'canada-a', incidentIds: ['2026_BC_2026-K51915'] }); assert.equal(manifest.externalConsequentialActions, false); assert.equal(provider.rightsStatus().manifestEligible, true);
  await assert.rejects(() => provider.fetchProduct('FIRE_PERIMETER_ESTIMATE', { bbox: [-140, 30, -100, 70] }), /bbox_invalid/);
  const result = await provider.fetchProduct('FIRE_PERIMETER_ESTIMATE', { bbox: [-125, 45, -110, 60], maxFeatures: 10, incidentIds: ['2026_BC_2026-K51915'] });
  assert.equal(requested.protocol, 'https:'); assert.equal(requested.hostname, 'cwfis.cfs.nrcan.gc.ca'); assert.equal(requested.searchParams.get('maxFeatures'), '10'); assert.equal(preserved.length, 1); assert.equal(result.providerPublishedAt, null); assert.equal(result.publicationTimeStatus, 'NOT_EXPOSED_BY_PRODUCT'); assert.equal(result.shadowOnly, true);
  const crosswalk = provider.crosswalk(result.features[0], [{ geometry: { type: 'Point', coordinates: [-119, 50] }, properties: { national_fire_id: '2026_BC_2026-K51915', agency_fire_id: 'K51915', agency_code: 'BC', status_date: '2026-08-24T21:30:00Z' } }]); assert.equal(crosswalk.state, 'SINGLE_SPATIAL_CANDIDATE_NOT_AUTHORITATIVE');
  const snapshot = await provider.capturePerimeter({ manifest, incidentId: '2026_BC_2026-K51915', perimeterResult: result, feature: result.features[0], crosswalk }); assert.equal(snapshot.providerPublishedAt, null); assert.equal(snapshot.externalConsequentialActions, 0); assert.equal(snapshot.perimeterRevision.crosswalk.state, 'SINGLE_SPATIAL_CANDIDATE_NOT_AUTHORITATIVE');
});

test('Query Service V2 returns one-query coherent consumer contracts without N+1 or rights bypass', async () => {
  const repo = await repository(); await repo.putObject('EVIDENCE', 'evidence-a', object(), { incidentId: 'incident-a', knowledgeTime: at }); await repo.putObject('HYPOTHESIS', 'hypothesis-a', object(2), { incidentId: 'incident-a', knowledgeTime: at, rights: { requiredCapability: 'read:hypothesis' } }); await repo.putObject('EVIDENCE', 'evidence-revoked', object(3), { incidentId: 'incident-a', knowledgeTime: at, rights: { state: 'REVOKED' } });
  const service = new OperationalIntelligenceQueryServiceV2({ repository: repo, clock: () => new Date(at) }), snapshot = await service.incidentSnapshot('incident-a', { knowledgeTime: at, authority: { capabilities: [] } });
  assert.equal(snapshot.schemaVersion, 'vigia.operational-intelligence-snapshot.v2'); assert.equal(snapshot.queryMetrics.repositoryQueries, 1); assert.equal(snapshot.queryMetrics.nPlusOneDetected, false); assert.equal(snapshot.rightsRestrictions.excludedObjects, 2); assert.equal(snapshot.partial, false); assert.ok(snapshot.replayReference); assert.ok(snapshot.consistencyToken);
  assert.equal(snapshot.objects.EVIDENCE.length, 1); await assert.rejects(() => service.incidentSnapshot('x'.repeat(300)), /incident_invalid/);
});

test('indexed object sets use coherent snapshots, bounded filters, stable cursors, and incident-local invalidation', async () => {
  const { projectRoot, incidentId } = await projectionFixture(), full = await materializeDecisionObjectSetProjection({ projectRoot, reason: 'TEST_FULL' }); invalidateDecisionObjectSetCache(projectRoot);
  const first = await queryDecisionObjectSet({ projectRoot, name: 'ACQUISITIONS_RANKED_BY_DECISION_VALUE', limit: 1 }); assert.equal(first.sourceState, 'INDEXED_PROJECTION'); assert.equal(first.partial, false); assert.equal(first.consistencyToken, full.consistencyToken);
  if (first.nextCursor) { const second = await queryDecisionObjectSet({ projectRoot, name: 'ACQUISITIONS_RANKED_BY_DECISION_VALUE', limit: 1, cursor: first.nextCursor, consistencyToken: first.consistencyToken }); assert.notDeepEqual(second.results, first.results); }
  const incremental = await materializeDecisionObjectSetProjection({ projectRoot, affectedIncidentIds: [incidentId], reason: 'TEST_INCIDENT_CHANGE' }); assert.equal(incremental.mode, 'INCREMENTAL'); assert.deepEqual(incremental.affectedIncidentIds, [incidentId]); assert.equal(incremental.artifactsRead, 3);
  invalidateDecisionObjectSetCache(projectRoot); await assert.rejects(() => queryDecisionObjectSet({ projectRoot, name: 'ACQUISITIONS_RANKED_BY_DECISION_VALUE', consistencyToken: full.consistencyToken }), /consistency_token_mismatch/);
  await assert.rejects(() => queryDecisionObjectSet({ projectRoot, name: 'ACQUISITIONS_RANKED_BY_DECISION_VALUE', incidentId: 'x'.repeat(300) }), /incident_invalid/);
});

test('file and Postgres semantic histories are equivalent when certification PostGIS is supplied', { skip: !process.env.VIGIA_INTELLIGENCE_CERT_DATABASE_URL }, async () => {
  const file = await repository(), postgres = new PostgresOperationalIntelligenceRepository({ databaseUrl: process.env.VIGIA_INTELLIGENCE_CERT_DATABASE_URL }); await postgres.initialize();
  for (const repo of [file, postgres]) { await repo.appendEvent(event); await repo.putObject('EVIDENCE', 'evidence-a', object(), { incidentId: 'incident-a', rights: { state: 'READY' } }); }
  const normalize = (snapshot) => ({ events: snapshot.events.map((item) => ({ id: item.id ?? item.event_id, semanticIdentity: item.semanticIdentity ?? item.semantic_identity, incidentId: item.incidentId ?? item.incident_id, type: item.type, payload: item.payload, payloadHash: item.payloadHash ?? item.payload_hash, rights: item.rights })), objects: snapshot.objects, lineage: snapshot.lineage });
  assert.deepEqual(normalize(await file.semanticSnapshot()), normalize(await postgres.semanticSnapshot())); await postgres.close();
});
