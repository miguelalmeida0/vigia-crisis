import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { FileIntelligenceRepository } from '../apps/api/src/modules/intelligence/file-intelligence-repository.mjs';
import { PostgresOperationalIntelligenceRepository } from '../apps/api/src/modules/intelligence/postgres-operational-intelligence-repository.mjs';
import { migrationDefinitions } from '../apps/api/src/modules/storage/postgres-migration-runner.mjs';
import { VIGIA_RELEASE_CONTRACT } from '../packages/domain/src/release-contract.mjs';
import { semanticHash } from '../packages/domain/src/intelligence/shared.mjs';
import { writeJsonAtomic } from '../apps/api/src/shared/json-file.mjs';
import { certifyMigrationConvergence } from './lib/certify_migration_convergence.mjs';

const execute = promisify(execFile), root = path.resolve(fileURLToPath(new URL('..', import.meta.url))), reportPath = path.join(root, 'data/validation/backend-convergence/postgis-certification.json');
const allowBlocked = process.argv.includes('--allow-blocked'), suppliedUrl = process.env.VIGIA_INTELLIGENCE_CERT_DATABASE_URL ?? null;
const POSTGIS_IMAGE = 'postgis/postgis:17-3.5', POSTGIS_PLATFORM = 'linux/amd64';
const json = (value) => JSON.stringify(value ?? {});
const token = () => randomBytes(12).toString('hex'), sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function run(command, args, options = {}) { return execute(command, args, { cwd: root, timeout: options.timeout ?? 120_000, maxBuffer: 8 * 1024 * 1024, env: options.env ?? process.env }); }

async function dockerEnvironment() {
  try { await run('docker', ['info'], { timeout: 10_000 }); } catch (error) { return { available: false, reason: String(error.stderr ?? error.message).trim() }; }
  const suffix = token().slice(0, 8), container = `vigia-intelligence-cert-${suffix}`, volume = `vigia-intelligence-cert-volume-${suffix}`, user = `vigia_cert_${suffix}`, password = token(), database = `vigia_cert_${suffix}`;
  await run('docker', ['volume', 'create', '--label', 'vigia.purpose=intelligence-certification', volume]);
  try {
    await run('docker', ['run', '--rm', '-d', '--name', container, '--label', 'vigia.purpose=intelligence-certification', '--platform', POSTGIS_PLATFORM, '-e', `POSTGRES_USER=${user}`, '-e', `POSTGRES_PASSWORD=${password}`, '-e', `POSTGRES_DB=${database}`, '-p', '127.0.0.1::5432', '-v', `${volume}:/var/lib/postgresql/data`, POSTGIS_IMAGE], { timeout: 300_000 });
  } catch (error) {
    await run('docker', ['volume', 'rm', volume], { timeout: 30_000 }).catch(() => undefined);
    throw error;
  }
  const portOutput = (await run('docker', ['port', container, '5432/tcp'])).stdout.trim().split('\n')[0], match = portOutput.match(/:(\d+)$/); if (!match) throw new Error('certification_docker_port_unavailable');
  const port = Number(match[1]), databaseUrl = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${port}/${encodeURIComponent(database)}`;
  return { available: true, owned: true, container, volume, user, database, databaseUrl, image: POSTGIS_IMAGE, platform: POSTGIS_PLATFORM, bindAddress: '127.0.0.1', port };
}

async function waitForDatabase(databaseUrl) {
  let last;
  for (let attempt = 0; attempt < 80; attempt += 1) { const pool = new pg.Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 500, max: 1 }); try { await pool.query('SELECT 1'); await pool.end(); return; } catch (error) { last = error; await pool.end().catch(() => undefined); await sleep(500); } }
  throw new Error(`certification_postgres_not_ready:${last?.code ?? last?.message}`);
}

function databaseUrlFor(databaseUrl, database) { const target = new URL(databaseUrl); target.pathname = `/${database}`; return target.toString(); }
function normalizeSemanticSnapshot(snapshot) {
  const iso = (value) => value?.toISOString?.() ?? value;
  return {
    events: snapshot.events.map((item) => ({ id: item.id, semanticIdentity: item.semanticIdentity ?? item.semantic_identity, incidentId: item.incidentId ?? item.incident_id, type: item.type, effectiveAt: iso(item.effectiveAt ?? item.effective_at), receivedAt: iso(item.receivedAt ?? item.received_at), payload: item.payload, payloadHash: item.payloadHash ?? item.payload_hash, rights: item.rights })).sort((a, b) => a.id.localeCompare(b.id)),
    objects: snapshot.objects.map(({ projectionVersion, updatedAt, ...item }) => item).sort((a, b) => `${a.kind}:${a.objectId}`.localeCompare(`${b.kind}:${b.objectId}`)),
    lineage: snapshot.lineage.map((item) => ({ parentKind: item.parentKind ?? item.parent_kind, parentId: item.parentId ?? item.parent_id, childKind: item.childKind ?? item.child_kind, childId: item.childId ?? item.child_id, relationship: item.relationship, rights: item.rights ?? {} })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  };
}
async function applyEquivalentHistory(repository) {
  const incidentId = 'semantic-equivalence-incident', knowledgeTime = '2026-08-25T00:00:00.000Z';
  await repository.appendEvent({ id: 'semantic-event-1', semanticIdentity: 'semantic-provider:revision:1', incidentId, type: 'EVIDENCE_RECEIVED', effectiveAt: knowledgeTime, receivedAt: knowledgeTime, payload: { kind: 'PHYSICAL_OBSERVATION', causalFamilyId: 'family-a' }, rights: { state: 'READY' } });
  const objects = [
    ['RAW_PRODUCT', 'raw-1', { schemaVersion: 'vigia.semantic.raw-product.v1', providerId: 'provider-a', productId: 'product-1' }],
    ['EVIDENCE_STATE', 'evidence-state-1', { schemaVersion: 'vigia.semantic.evidence-state.v1', state: 'CORROBORATED', independentFamilyCount: 2 }],
    ['EVIDENCE_DEBT', 'evidence-debt-1', { schemaVersion: 'vigia.semantic.evidence-debt.v1', openRequirements: ['OFFICIAL_CLASSIFICATION'] }],
    ['DATA_GAP', 'data-gap-1', { schemaVersion: 'vigia.semantic.data-gap.v1', state: 'OPEN', requirement: 'OFFICIAL_CLASSIFICATION' }],
    ['HYPOTHESIS_STATE', 'hypotheses-1', { schemaVersion: 'vigia.semantic.hypotheses.v1', states: { ACTIVE_WILDFIRE: 'SUPPORTED', INDUSTRIAL_THERMAL_SOURCE: 'PLAUSIBLE' } }],
    ['DECISION_DEPENDENCY_GRAPH', 'decision-graph-1', { schemaVersion: 'vigia.semantic.decision-graph.v1', ready: ['ACQUIRE_INDEPENDENT_EVIDENCE'], blocked: ['PROPOSE_OFFICIAL_WARNING'] }],
    ['DECISION_PRIORITY_ORDERING', 'priority-1', { schemaVersion: 'vigia.semantic.priority.v1', orderedCandidateIds: ['candidate-critical', 'candidate-context'] }],
    ['ACQUISITION_PLAN', 'plan-1', { schemaVersion: 'vigia.semantic.acquisition-plan.v1', acquisitions: ['candidate-critical'], budgetConsumed: 1 }],
    ['CONTROL_PLANE_ACTION', 'action-1', { schemaVersion: 'vigia.semantic.control-action.v1', state: 'SHADOW_RECORDED', consequentialActionsExecuted: 0 }],
    ['DECISION_DELTA', 'delta-1', { schemaVersion: 'vigia.semantic.decision-delta.v1', decisionsChanged: ['ACQUIRE_INDEPENDENT_EVIDENCE'] }]
  ];
  for (const [kind, id, payload] of objects) await repository.putObject(kind, id, payload, { incidentId, knowledgeTime, rights: { state: 'READY' } });
  await repository.linkLineage({ parentKind: 'RAW_PRODUCT', parentId: 'raw-1', childKind: 'EVIDENCE_STATE', childId: 'evidence-state-1', relationship: 'DERIVED_FROM', rights: { state: 'READY' } });
  await repository.persistDecisionPacket({ schemaVersion: 'vigia.crisis-decision-packet.v1', replayFingerprint: 'crisis-decision-packet:sha256:' + '9'.repeat(64), incident: { id: incidentId }, knowledgeTime, evidenceState: objects[1][2], evidenceDebt: objects[2][2], hypotheses: objects[4][2], decisionGraph: objects[5][2], priority: objects[6][2], acquisitionPlan: objects[7][2], decisionDelta: objects[9][2] });
}
async function certifySemanticEquivalence(environment) {
  if (!environment.owned) return { state: 'NOT_RUN_SUPPLIED_DATABASE' };
  const database = `${environment.database}_equivalence`, temporaryRoot = path.join(root, '.tmp', 'semantic-equivalence'); await mkdir(temporaryRoot, { recursive: true }); const directory = await mkdtemp(path.join(temporaryRoot, 'run-'));
  await run('docker', ['exec', environment.container, 'createdb', '-U', environment.user, database]);
  const file = new FileIntelligenceRepository({ filePath: path.join(directory, 'repository.json'), clock: () => new Date('2026-08-25T00:00:00.000Z') }), postgres = new PostgresOperationalIntelligenceRepository({ databaseUrl: databaseUrlFor(environment.databaseUrl, database), clock: () => new Date('2026-08-25T00:00:00.000Z') });
  try {
    await file.initialize(); await postgres.initialize(); await applyEquivalentHistory(file); await applyEquivalentHistory(postgres);
    const fileSnapshot = normalizeSemanticSnapshot(await file.semanticSnapshot()), postgresSnapshot = normalizeSemanticSnapshot(await postgres.semanticSnapshot()), fileFingerprint = semanticHash('file-database-semantic-equivalence', fileSnapshot), postgresFingerprint = semanticHash('file-database-semantic-equivalence', postgresSnapshot);
    if (fileFingerprint !== postgresFingerprint) throw new Error('file_database_semantic_divergence');
    return { state: 'PASS', fileFingerprint, postgresFingerprint, events: fileSnapshot.events.length, objects: fileSnapshot.objects.length, lineageEdges: fileSnapshot.lineage.length, certifiedSemantics: ['EVIDENCE_STATE', 'INDEPENDENT_FAMILY_COUNT', 'EVIDENCE_DEBT', 'DATA_GAPS', 'HYPOTHESIS_STATES', 'DECISION_DEPENDENCY_GRAPH', 'DECISION_PRIORITY_ORDERING', 'ACQUISITION_PLAN', 'CONTROL_PLANE_ACTIONS', 'DECISION_DELTA', 'DECISION_PACKET', 'REPLAY_FINGERPRINT'] };
  } finally { await postgres.close().catch(() => undefined); await rm(directory, { recursive: true, force: true }); }
}
async function certifyTransactionalFailureBoundaries(repository) {
  const outcome = {}, count = async (sql, values = []) => Number((await repository.pool.query(sql, values)).rows[0].count);
  const expectInjectedRollback = async (name, operation, verify) => {
    let injected = false;
    try { await repository.transact(async (client) => { await operation(client); throw new Error(`injected_${name}`); }); }
    catch (error) { injected = error.message === `injected_${name}`; }
    outcome[name] = injected && await verify();
  };
  const before = await count('SELECT count(*) count FROM intelligence_event');
  await expectInjectedRollback('rollbackBeforeTransactionWork', async () => undefined, async () => await count('SELECT count(*) count FROM intelligence_event') === before);
  await expectInjectedRollback('rollbackAfterEventInsert', (client) => client.query("INSERT INTO intelligence_event(event_id,semantic_identity,incident_id,event_type,effective_at,received_at,payload,payload_hash,rights) VALUES('failure-event-after','failure:event:after','incident-cert','EVIDENCE_RECEIVED','2026-08-25T00:00:00Z','2026-08-25T00:00:01Z','{}',$1,'{}')", [semanticHash('failure-event', {})]), async () => await count("SELECT count(*) count FROM intelligence_event WHERE event_id='failure-event-after'") === 0);
  await expectInjectedRollback('rollbackBeforeProjectionUpdate', (client) => client.query("INSERT INTO intelligence_event(event_id,semantic_identity,incident_id,event_type,effective_at,received_at,payload,payload_hash,rights) VALUES('failure-event-before-projection','failure:event:before-projection','incident-cert','EVIDENCE_RECEIVED','2026-08-25T00:00:00Z','2026-08-25T00:00:01Z','{}',$1,'{}')", [semanticHash('failure-event', { stage: 'before-projection' })]), async () => await count("SELECT count(*) count FROM intelligence_event WHERE event_id='failure-event-before-projection'") === 0);
  const projectionVersion = Number((await repository.pool.query("SELECT projection_version FROM intelligence_projection_state WHERE projection_name='GLOBAL'")).rows[0].projection_version);
  await expectInjectedRollback('rollbackDuringProjectionUpdate', (client) => client.query("UPDATE intelligence_projection_state SET projection_version=projection_version+1 WHERE projection_name='GLOBAL'"), async () => Number((await repository.pool.query("SELECT projection_version FROM intelligence_projection_state WHERE projection_name='GLOBAL'")).rows[0].projection_version) === projectionVersion);
  const actionPayload = { schemaVersion: 'vigia.cert.control-action.v1', state: 'PLANNED' }, actionHash = semanticHash('intelligence-object-payload', actionPayload);
  const insertAction = (client, id) => client.query('INSERT INTO intelligence_object(object_kind,object_id,incident_id,schema_version,semantic_identity,revision,projection_version,payload,payload_hash,rights) VALUES($1,$2,$3,$4,$5,1,0,$6::jsonb,$7,$8::jsonb)', ['CONTROL_PLANE_ACTION', id, 'incident-cert', actionPayload.schemaVersion, `failure:${id}`, json(actionPayload), actionHash, json({ state: 'READY' })]);
  await expectInjectedRollback('rollbackAfterActionPlanning', (client) => insertAction(client, 'failure-action-after-planning'), async () => await count("SELECT count(*) count FROM intelligence_object WHERE object_kind='CONTROL_PLANE_ACTION' AND object_id='failure-action-after-planning'") === 0);
  await expectInjectedRollback('rollbackBeforeReceiptPersistence', (client) => insertAction(client, 'failure-action-before-receipt'), async () => await count("SELECT count(*) count FROM intelligence_object WHERE object_kind='CONTROL_PLANE_ACTION' AND object_id='failure-action-before-receipt'") === 0 && await count("SELECT count(*) count FROM intelligence_receipt WHERE receipt_id='failure-receipt'") === 0);
  await expectInjectedRollback('rollbackDuringLineagePersistence', (client) => client.query("INSERT INTO intelligence_lineage_edge(parent_kind,parent_id,child_kind,child_id,relationship,rights) VALUES('RAW_PRODUCT','raw-a','EVIDENCE','derived-a','FAILURE_INJECTION','{}')"), async () => await count("SELECT count(*) count FROM intelligence_lineage_edge WHERE relationship='FAILURE_INJECTION'") === 0);
  const materializationHash = semanticHash('failure-materialization', { row: 1 });
  await expectInjectedRollback('rollbackDuringMaterialization', (client) => client.query("INSERT INTO intelligence_projection_row(projection_name,row_id,incident_id,projection_version,payload,payload_hash) VALUES('FAILURE_TEST','failure-row','incident-cert',1,'{}',$1)", [materializationHash]), async () => await count("SELECT count(*) count FROM intelligence_projection_row WHERE projection_name='FAILURE_TEST'") === 0);
  return outcome;
}

async function certify(environment) {
  const started = performance.now(), repo = new PostgresOperationalIntelligenceRepository({ databaseUrl: environment.databaseUrl, clock: () => new Date('2026-08-25T00:00:00Z') }), checks = {};
  let restarted = null;
  try {
  const migration = await repo.initialize(); checks.schemaMigration = migration.migration.latestVersion === VIGIA_RELEASE_CONTRACT.migrationHead; checks.spatialExtension = Boolean((await repo.pool.query('SELECT PostGIS_Version() version')).rows[0]?.version);
  const idempotentMigration = await repo.initialize(); checks.migrationIdempotency = idempotentMigration.migration.latestVersion === VIGIA_RELEASE_CONTRACT.migrationHead && idempotentMigration.migration.applied.length === 0 && idempotentMigration.migration.skipped.length === migrationDefinitions().length;
  const migrationConvergence = await certifyMigrationConvergence({ environment, run, cleanPool: repo.pool }); checks.agent1UpgradeMigration = migrationConvergence.agent1Upgrade?.state === 'PASS'; checks.agent2LineageAdoption = migrationConvergence.agent2LineageAdoption?.state === 'PASS'; checks.cleanUpgradeSchemaEquivalence = migrationConvergence.state === 'PASS';
  await repo.putObject('EVIDENCE', 'commit-object', { schemaVersion: 'vigia.cert.v1', value: 1 }, { incidentId: 'incident-cert', rights: { state: 'READY' } }); checks.transactionCommit = Boolean(await repo.getObject('EVIDENCE', 'commit-object'));
  try { await repo.transact(async (client) => { await client.query("INSERT INTO intelligence_receipt(receipt_id,payload_hash,payload) VALUES('rollback-receipt',$1,'{}')", ['receipt:sha256:' + 'a'.repeat(64)]); throw new Error('injected_rollback'); }); } catch {}
  checks.transactionRollback = Number((await repo.pool.query("SELECT count(*) count FROM intelligence_receipt WHERE receipt_id='rollback-receipt'")).rows[0].count) === 0;
  const baseEvent = (index) => ({ id: `event-${index}`, semanticIdentity: `provider:revision:${index}`, incidentId: 'incident-cert', type: 'EVIDENCE_RECEIVED', effectiveAt: '2026-08-25T00:00:00Z', receivedAt: '2026-08-25T00:00:01Z', payload: { index }, rights: { state: 'READY' } });
  const concurrent = await Promise.all(Array.from({ length: 32 }, (_, index) => repo.appendEvent(baseEvent(index)))); checks.concurrentInserts = concurrent.every((item) => item.state === 'ACCEPTED');
  const duplicate = await Promise.all([repo.appendEvent(baseEvent(0)), repo.appendEvent(baseEvent(0))]); checks.idempotentEventPersistence = duplicate.every((item) => item.state === 'DUPLICATE');
  const concurrentDuplicate = await Promise.all(Array.from({ length: 32 }, () => repo.appendEvent(baseEvent(33)))); checks.concurrentDuplicateEventIngestion = concurrentDuplicate.filter((item) => item.state === 'ACCEPTED').length === 1 && concurrentDuplicate.filter((item) => item.state === 'DUPLICATE').length === 31;
  await repo.putObject('DATA_GAP', 'concurrency-object', { schemaVersion: 'vigia.cert.v1', value: 1 }, { incidentId: 'incident-cert' });
  const optimistic = await Promise.allSettled([repo.putObject('DATA_GAP', 'concurrency-object', { schemaVersion: 'vigia.cert.v1', value: 2 }, { expectedRevision: 1 }), repo.putObject('DATA_GAP', 'concurrency-object', { schemaVersion: 'vigia.cert.v1', value: 3 }, { expectedRevision: 1 })]); checks.concurrencyControl = optimistic.filter((item) => item.status === 'fulfilled').length === 1 && optimistic.filter((item) => item.status === 'rejected').length === 1;
  const acquisitions = await Promise.all([repo.putObject('ACQUISITION_TASK', 'acquisition-a', { schemaVersion: 'vigia.cert.v1', state: 'PLANNED' }, { semanticIdentity: 'acquisition:provider:product:window' }), repo.putObject('ACQUISITION_TASK', 'acquisition-a', { schemaVersion: 'vigia.cert.v1', state: 'PLANNED' }, { semanticIdentity: 'acquisition:provider:product:window' })]); checks.duplicateAcquisitionPrevention = acquisitions.filter((item) => item.state === 'CREATED').length === 1 && acquisitions.filter((item) => item.state === 'DUPLICATE').length === 1;
  const controllerRace = await Promise.allSettled([repo.putObject('CONTROL_PLANE_ACTION', 'controller-action-a', { schemaVersion: 'vigia.cert.control-action.v1', state: 'PLANNED' }, { incidentId: 'incident-cert', semanticIdentity: 'controller:incident-cert:evidence-need-a' }), repo.putObject('CONTROL_PLANE_ACTION', 'controller-action-b', { schemaVersion: 'vigia.cert.control-action.v1', state: 'PLANNED' }, { incidentId: 'incident-cert', semanticIdentity: 'controller:incident-cert:evidence-need-a' })]); checks.concurrentControllerReconciliation = controllerRace.filter((item) => item.status === 'fulfilled').length === 1 && controllerRace.filter((item) => item.status === 'rejected').length === 1;
  const productRace = await Promise.allSettled([repo.putObject('DATA_PRODUCT', 'worker-product-a', { schemaVersion: 'vigia.cert.data-product.v1', state: 'ACQUIRED' }, { incidentId: 'incident-cert', semanticIdentity: 'worker:provider-a:product-a:window-a' }), repo.putObject('DATA_PRODUCT', 'worker-product-b', { schemaVersion: 'vigia.cert.data-product.v1', state: 'ACQUIRED' }, { incidentId: 'incident-cert', semanticIdentity: 'worker:provider-a:product-a:window-a' })]); checks.concurrentDataProductAcquisition = productRace.filter((item) => item.status === 'fulfilled').length === 1 && productRace.filter((item) => item.status === 'rejected').length === 1;
  for (const [kind, id] of [['DATA_PRODUCT', 'data-product-a'], ['PIPELINE_TASK', 'pipeline-task-a'], ['CONTROL_PLANE_ACTION', 'control-action-a'], ['PROOF', 'proof-a'], ['REVOCATION', 'revocation-a'], ['EVIDENCE_DEBT', 'evidence-debt-a']]) await repo.putObject(kind, id, { schemaVersion: `vigia.cert.${kind.toLowerCase().replaceAll('_', '-')}.v1`, state: 'CERTIFIED' }, { incidentId: 'incident-cert', rights: { state: 'READY' } });
  const persistedKinds = new Set((await repo.listObjects({ incidentId: 'incident-cert', limit: 500 })).results.map((item) => item.kind)); checks.requiredObjectPersistence = ['EVIDENCE', 'DATA_GAP', 'DATA_PRODUCT', 'PIPELINE_TASK', 'CONTROL_PLANE_ACTION', 'PROOF', 'REVOCATION', 'EVIDENCE_DEBT'].every((kind) => persistedKinds.has(kind));
  const beforeVersion = (await repo.listObjects({ limit: 1 })).projectionVersion; await repo.putObject('OPERATIONAL_TWIN', 'incident-cert', { schemaVersion: 'vigia.cert-twin.v1', state: 'SUPPORTED' }, { incidentId: 'incident-cert' }); const afterVersion = (await repo.listObjects({ limit: 1 })).projectionVersion; checks.materializedProjectionUpdate = afterVersion > beforeVersion;
  await repo.appendEvent({ ...baseEvent(40), id: 'event-crash-point', semanticIdentity: 'event:crash-point' }); const absent = await repo.getObject('OPERATIONAL_TWIN', 'crash-projection'); await repo.putObject('OPERATIONAL_TWIN', 'crash-projection', { schemaVersion: 'vigia.cert-twin.v1', recoveredFrom: 'event-crash-point' }, { incidentId: 'incident-cert' }); checks.crashBetweenEventAndProjection = absent === null; checks.projectionRecovery = Boolean(await repo.getObject('OPERATIONAL_TWIN', 'crash-projection'));
  let identityRejected = false; try { await repo.putObject('EVIDENCE', 'identity-one', { schemaVersion: 'vigia.cert.v1', value: 1 }, { semanticIdentity: 'semantic-identity-one' }); await repo.putObject('EVIDENCE', 'identity-two', { schemaVersion: 'vigia.cert.v1', value: 2 }, { semanticIdentity: 'semantic-identity-one' }); } catch { identityRejected = true; } checks.uniqueSemanticIdentity = identityRejected;
  await repo.putObject('RAW_PRODUCT', 'raw-a', { schemaVersion: 'vigia.cert.v1', value: 1 }, { rights: { state: 'READY', licenceId: 'CERT' } }); await repo.putObject('EVIDENCE', 'derived-a', { schemaVersion: 'vigia.cert.v1', value: 1 }, { rights: { state: 'RESTRICTED' } }); await repo.linkLineage({ parentKind: 'RAW_PRODUCT', parentId: 'raw-a', childKind: 'EVIDENCE', childId: 'derived-a', relationship: 'DERIVED_FROM', rights: { state: 'RESTRICTED' } });
  checks.lineageIntegrity = Number((await repo.pool.query('SELECT count(*) count FROM intelligence_lineage_edge')).rows[0].count) === 1; let foreignKeyRejected = false; try { await repo.linkLineage({ parentKind: 'RAW_PRODUCT', parentId: 'missing', childKind: 'EVIDENCE', childId: 'derived-a', relationship: 'DERIVED_FROM' }); } catch { foreignKeyRejected = true; } checks.foreignKeyIntegrity = foreignKeyRejected; checks.rightsPropagationPersistence = (await repo.getObject('EVIDENCE', 'derived-a')).rights.state === 'RESTRICTED';
  Object.assign(checks, await certifyTransactionalFailureBoundaries(repo));
  const packet = { schemaVersion: 'vigia.crisis-decision-packet.v1', replayFingerprint: 'crisis-decision-packet:sha256:' + 'b'.repeat(64), incident: { id: 'incident-cert' }, knowledgeTime: '2026-08-25T00:00:00Z', rights: { allowed: true } }; await repo.persistDecisionPacket(packet); checks.decisionPacketPersistence = Number((await repo.pool.query('SELECT count(*) count FROM crisis_decision_packet')).rows[0].count) === 1;
  const coherentVersion = (await repo.listObjects({ incidentId: 'incident-cert', limit: 1 })).projectionVersion; await repo.putObject('POLICY', 'policy-race-a', { schemaVersion: 'vigia.cert.policy.v1', version: 2 }, { incidentId: 'incident-cert' }); let stalePacketRejected = false; try { await repo.getObject('DECISION_PACKET', packet.replayFingerprint, { projectionVersion: coherentVersion }); } catch (error) { stalePacketRejected = error.code === 'CONSISTENCY_TOKEN_MISMATCH'; } checks.policyPacketMixedVersionPrevented = stalePacketRejected; let staleHistoryRejected = false; try { await repo.listObjects({ incidentId: 'incident-cert', projectionVersion: coherentVersion }); } catch (error) { staleHistoryRejected = error.code === 'CONSISTENCY_TOKEN_MISMATCH'; } checks.historicalQueryProjectionRacePrevented = staleHistoryRejected;
  await repo.persistReceipt({ schemaVersion: 'vigia.receipt.v1', id: 'receipt-a', incidentId: 'incident-cert', actionId: 'action-a' }); checks.receiptPersistence = Number((await repo.pool.query("SELECT count(*) count FROM intelligence_receipt WHERE receipt_id='receipt-a'")).rows[0].count) === 1;
  const manifest = { schemaVersion: 'vigia.prospective-capture-manifest.v1', id: 'manifest-a', fingerprint: 'manifest:sha256:' + 'c'.repeat(64), rights: { state: 'READY' } }, snapshot = { schemaVersion: 'vigia.prospective-knowledge-time-snapshot.v1', fingerprint: 'prospective-snapshot:sha256:' + 'd'.repeat(64), manifestId: manifest.id, sequence: 1, incidentId: 'incident-cert', providerId: 'provider-a', productId: 'product-a', providerPublishedAt: '2026-08-25T00:00:00Z', vigiaReceivedAt: '2026-08-25T00:00:01Z', rawObjectReference: 'raw:a', rawObjectHash: 'e'.repeat(64), previousSnapshotFingerprint: null, rights: manifest.rights }; await repo.persistArchiveSnapshot(snapshot); checks.prospectiveArchivePersistence = Number((await repo.pool.query('SELECT count(*) count FROM prospective_archive_snapshot')).rows[0].count) === 1;
  await repo.pool.query("UPDATE prospective_archive_snapshot SET footprint=ST_GeomFromText('POLYGON((-120 49,-119 49,-119 50,-120 50,-120 49))',4326) WHERE snapshot_fingerprint=$1", [snapshot.fingerprint]); const spatial = (await repo.pool.query('SELECT ST_SRID(footprint) srid,ST_GeometryType(footprint) geometry_type FROM prospective_archive_snapshot WHERE snapshot_fingerprint=$1', [snapshot.fingerprint])).rows[0]; checks.spatialTypePersistence = Number(spatial.srid) === 4326 && spatial.geometry_type === 'ST_Polygon'; checks.spatialIndexCreation = Boolean((await repo.pool.query("SELECT to_regclass('public.prospective_archive_footprint_gix') index_name")).rows[0]?.index_name);
  let invalidOutcomeRejected = false; try { await repo.persistDecisionOutcome({ schemaVersion: 'vigia.decision-outcome.v1', id: 'invalid-outcome', packetFingerprint: 'missing-packet', incidentId: 'incident-cert', decisionTime: '2026-08-25T00:00:00Z', adjudicatedAt: null }); } catch { invalidOutcomeRejected = true; } checks.atomicDecisionOutcomeRollback = invalidOutcomeRejected && Number((await repo.pool.query("SELECT count(*) count FROM intelligence_object WHERE object_kind='DECISION_OUTCOME' AND object_id='invalid-outcome'")).rows[0].count) === 0;
  let invalidArchiveRejected = false; try { await repo.persistArchiveSnapshot({ ...snapshot, fingerprint: 'prospective-snapshot:sha256:' + 'f'.repeat(64), sequence: 2, rawObjectHash: '1'.repeat(64), previousSnapshotFingerprint: 'missing-snapshot' }); } catch { invalidArchiveRejected = true; } checks.atomicArchiveRollback = invalidArchiveRejected && Number((await repo.pool.query("SELECT count(*) count FROM intelligence_object WHERE object_kind='PROSPECTIVE_ARCHIVE_SNAPSHOT' AND object_id=$1", ['prospective-snapshot:sha256:' + 'f'.repeat(64)])).rows[0].count) === 0;
  await repo.persistDecisionOutcome({ schemaVersion: 'vigia.decision-outcome.v1', id: 'outcome-a', packetFingerprint: packet.replayFingerprint, incidentId: 'incident-cert', decisionTime: '2026-08-25T00:00:00Z', adjudicatedAt: '2026-08-25T01:00:00Z' }); checks.decisionMemoryPersistence = Number((await repo.pool.query('SELECT count(*) count FROM decision_outcome_ledger')).rows[0].count) === 1;
  await repo.persistInformationValueOutcome({ schemaVersion: 'vigia.realized-information-value.v1', id: 'information-value-a', acquisitionId: 'acquisition-cert-a', incidentId: 'incident-cert', providerId: 'provider-a', acquisitionType: 'PERIMETER' }); checks.informationValuePersistence = Number((await repo.pool.query('SELECT count(*) count FROM information_value_outcome')).rows[0].count) === 1;
  await repo.close(); restarted = new PostgresOperationalIntelligenceRepository({ databaseUrl: environment.databaseUrl }); checks.restartReconstruction = Boolean(await restarted.getObject('DECISION_PACKET', packet.replayFingerprint));
  const semanticEquivalence = await certifySemanticEquivalence(environment); checks.fileDatabaseSemanticEquivalence = semanticEquivalence.state === 'PASS';
  let recovery = { state: 'NOT_RUN_EXTERNAL_DATABASE' };
  if (environment.owned) {
    const backupStarted = performance.now(), dump = '/tmp/vigia-intelligence-cert.dump', restoredDb = `${environment.database}_restore`; await run('docker', ['exec', environment.container, 'pg_dump', '-U', environment.user, '-Fc', '-d', environment.database, '-f', dump]); await run('docker', ['exec', environment.container, 'createdb', '-U', environment.user, restoredDb]); await run('docker', ['exec', environment.container, 'pg_restore', '-U', environment.user, '-d', restoredDb, dump]); const rtoMs = performance.now() - backupStarted;
    const restoreUrl = databaseUrlFor(environment.databaseUrl, restoredDb), restored = new pg.Pool({ connectionString: restoreUrl, max: 2 });
    try {
      const restoredRepository = new PostgresOperationalIntelligenceRepository({ pool: restored }), restoredMigration = await restoredRepository.initialize(), sourceCounts = { events: Number((await restarted.pool.query('SELECT count(*) count FROM intelligence_event')).rows[0].count), packets: Number((await restarted.pool.query('SELECT count(*) count FROM crisis_decision_packet')).rows[0].count), lineage: Number((await restarted.pool.query('SELECT count(*) count FROM intelligence_lineage_edge')).rows[0].count), receipts: Number((await restarted.pool.query('SELECT count(*) count FROM intelligence_receipt')).rows[0].count), archive: Number((await restarted.pool.query('SELECT count(*) count FROM prospective_archive_snapshot')).rows[0].count), decisionMemory: Number((await restarted.pool.query('SELECT count(*) count FROM decision_outcome_ledger')).rows[0].count), informationValue: Number((await restarted.pool.query('SELECT count(*) count FROM information_value_outcome')).rows[0].count) }, restoredCounts = { events: Number((await restored.query('SELECT count(*) count FROM intelligence_event')).rows[0].count), packets: Number((await restored.query('SELECT count(*) count FROM crisis_decision_packet')).rows[0].count), lineage: Number((await restored.query('SELECT count(*) count FROM intelligence_lineage_edge')).rows[0].count), receipts: Number((await restored.query('SELECT count(*) count FROM intelligence_receipt')).rows[0].count), archive: Number((await restored.query('SELECT count(*) count FROM prospective_archive_snapshot')).rows[0].count), decisionMemory: Number((await restored.query('SELECT count(*) count FROM decision_outcome_ledger')).rows[0].count), informationValue: Number((await restored.query('SELECT count(*) count FROM information_value_outcome')).rows[0].count) };
      const projectionStarted = performance.now(), recoveryPayload = { schemaVersion: 'vigia.recovery-projection.v1', incidentId: 'incident-cert', sourceEvents: restoredCounts.events }, recoveryHash = semanticHash('recovery-projection', recoveryPayload); await restored.query("INSERT INTO intelligence_projection_state(projection_name,projection_version,source_event_sequence) VALUES('RECOVERY_REBUILD',1,$1) ON CONFLICT(projection_name) DO UPDATE SET projection_version=EXCLUDED.projection_version,source_event_sequence=EXCLUDED.source_event_sequence", [restoredCounts.events]); await restored.query("INSERT INTO intelligence_projection_row(projection_name,row_id,incident_id,projection_version,payload,payload_hash) VALUES('RECOVERY_REBUILD','incident-cert','incident-cert',1,$1::jsonb,$2) ON CONFLICT(projection_name,row_id) DO UPDATE SET payload=EXCLUDED.payload,payload_hash=EXCLUDED.payload_hash", [json(recoveryPayload), recoveryHash]); const projectionRecoveryMs = performance.now() - projectionStarted;
      const replayStarted = performance.now(), restoredPacket = (await restored.query('SELECT payload FROM crisis_decision_packet WHERE packet_fingerprint=$1', [packet.replayFingerprint])).rows[0]?.payload, replayVerified = semanticHash('restored-decision-packet', restoredPacket) === semanticHash('restored-decision-packet', packet) && restoredCounts.lineage === sourceCounts.lineage && restoredCounts.receipts === sourceCounts.receipts, replayVerificationMs = performance.now() - replayStarted, dataLossRecords = Object.keys(sourceCounts).reduce((sum, key) => sum + Math.max(0, sourceCounts[key] - restoredCounts[key]), 0);
      recovery = { state: 'PASS', rpoEvents: sourceCounts.events - restoredCounts.events, rtoMs, dataLossRecords, projectionRecoveryMs, replayVerificationMs, migrationHead: restoredMigration.migration.latestVersion, migrationIdempotentAfterRestore: restoredMigration.migration.applied.length === 0, decisionPacketVerified: restoredCounts.packets === sourceCounts.packets, lineageVerified: restoredCounts.lineage === sourceCounts.lineage, receiptsVerified: restoredCounts.receipts === sourceCounts.receipts, prospectiveArchiveVerified: restoredCounts.archive === sourceCounts.archive, decisionMemoryVerified: restoredCounts.decisionMemory === sourceCounts.decisionMemory, informationValueVerified: restoredCounts.informationValue === sourceCounts.informationValue, projectionRebuilt: Number((await restored.query("SELECT count(*) count FROM intelligence_projection_row WHERE projection_name='RECOVERY_REBUILD'")).rows[0].count) === 1, replayVerified };
      checks.backupRestore = recovery.rpoEvents === 0 && recovery.dataLossRecords === 0 && recovery.migrationHead === VIGIA_RELEASE_CONTRACT.migrationHead && recovery.migrationIdempotentAfterRestore && recovery.decisionPacketVerified && recovery.lineageVerified && recovery.receiptsVerified && recovery.prospectiveArchiveVerified && recovery.decisionMemoryVerified && recovery.informationValueVerified && recovery.projectionRebuilt && recovery.replayVerified;
    } finally { await restored.end(); }
  } else checks.backupRestore = false;
  await restarted.close(); restarted = null;
  const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name), report = { schemaVersion: 'vigia.intelligence-postgis-certification.v1', generatedAt: new Date().toISOString(), state: failed.length ? 'FAIL' : 'PASS', isolatedDisposableDatabase: environment.owned === true, loopbackOnly: environment.bindAddress === '127.0.0.1', image: environment.image ?? 'SUPPLIED_DATABASE', platform: environment.platform ?? null, credentialsGenerated: environment.owned === true, credentialValuesRecorded: false, migrationHead: migration.migration.latestVersion, migrationIdempotency: { appliedOnSecondRun: idempotentMigration.migration.applied, skippedOnSecondRun: idempotentMigration.migration.skipped }, migrationConvergence, semanticEquivalence, checks, recovery, durationMs: performance.now() - started, failed };
  return report;
  } finally {
    await restarted?.close().catch(() => undefined);
    await repo.close().catch(() => undefined);
  }
}

let environment, report, exitCode = 0;
try {
  environment = suppliedUrl ? { available: true, owned: false, databaseUrl: suppliedUrl } : await dockerEnvironment();
  if (!environment.available) { report = { schemaVersion: 'vigia.intelligence-postgis-certification.v1', generatedAt: new Date().toISOString(), state: 'BLOCKED_DOCKER_UNAVAILABLE', isolatedDisposableDatabase: false, credentialValuesRecorded: false, reason: environment.reason }; exitCode = allowBlocked ? 0 : 2; }
  else { await waitForDatabase(environment.databaseUrl); report = await certify(environment); if (report.state !== 'PASS') exitCode = 1; }
} catch (error) { report = { schemaVersion: 'vigia.intelligence-postgis-certification.v1', generatedAt: new Date().toISOString(), state: 'FAIL', credentialValuesRecorded: false, error: String(error.message ?? error), code: error.code ?? null }; exitCode = 1; }
finally {
  if (environment?.owned) {
    await run('docker', ['stop', environment.container], { timeout: 30_000 }).catch(() => undefined);
    await run('docker', ['rm', '-f', environment.container], { timeout: 30_000 }).catch(() => undefined);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try { await run('docker', ['volume', 'rm', environment.volume], { timeout: 30_000 }); break; }
      catch { await sleep(250); }
    }
  }
}
await writeJsonAtomic(reportPath, report); process.stdout.write(`${JSON.stringify(report, null, 2)}\n`); process.exitCode = exitCode;
