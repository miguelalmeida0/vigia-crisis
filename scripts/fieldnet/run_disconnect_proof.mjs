import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIncidentPackage, defaultOutputPath as packagePath } from './build_incident_package.mjs';
import { sha256 } from '../../packages/domain/src/fieldnet/contracts.mjs';
import { elapsed, now, requestJson, reservePort, startCentralMock, startFieldNode, stopFieldNode, waitFor, writeJson } from './proof-runtime.mjs';
import { buildDataIntegrity, buildHandoff, buildProof } from './proof-artifacts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const validationDir = path.join(root, 'data/validation/fieldnet');
const proofPath = path.join(validationDir, 'fieldnet-disconnection-proof.json');
const replayPath = path.join(validationDir, 'fieldnet-disconnection-replay.json');
const handoffPath = path.join(validationDir, 'fieldnet-kernel-handoff.json');
await mkdir(validationDir, { recursive: true });
const packageBuild = await buildIncidentPackage({ outputPath: packagePath });
const pkg = packageBuild.package;
await writeJson(handoffPath, { schemaVersion: 'vigia.fieldnet-kernel-handoff.v1', status: 'PROOF_RUNNING', incidentId: pkg.incidentId, packagePath: path.relative(root, packagePath), updatedAt: now() });

const proofDirectory = await mkdtemp(path.join(root, '.tmp/fieldnet-proof-'));
const dbPath = path.join(proofDirectory, 'field-node.sqlite');
const [fieldPort, centralPort] = await Promise.all([reservePort(), reservePort()]);
const fieldBase = `http://127.0.0.1:${fieldPort}`;
let field;
let central;
const timings = {};

try {
  const centralOnlineStart=performance.now();
  central=await startCentralMock({port:centralPort,incidentId:pkg.incidentId,filePath:path.join(proofDirectory,'central-fieldnet-ledger.json')});
  timings.centralOnlineMs=elapsed(centralOnlineStart);
  const firstStart = performance.now();
  field = await startFieldNode({ root, port: fieldPort, centralPort, dbPath, incidentId });
  timings.coldListenerReadyMs = elapsed(firstStart);
  timings.reportedColdListenerReadyMs = field.listener.listenerReadyMs;
  await waitFor(async () => (await requestJson(fieldBase, '/health')).ok, { label: 'field_health' });
  await waitFor(async () => (await requestJson(fieldBase, '/api/fieldnet/state')).connectionState === 'FULL', { label: 'initial_central_connection' });

  const importStart = performance.now();
  const imported = await requestJson(fieldBase, '/api/fieldnet/incidents/import', { method: 'POST', value: { package: pkg, actor: 'regional-vigia' } });
  timings.packageImportMs = elapsed(importStart);
  assert.equal(imported.incident.incidentId, pkg.incidentId);
  assert.equal((await requestJson(fieldBase, '/api/fieldnet/incidents/import', { method: 'POST', value: { package: pkg, actor: 'regional-vigia' } })).duplicate, true);
  const mapLoadStart=performance.now();
  const initialOfflineMap=await requestJson(fieldBase,`/api/fieldnet/incidents/${encodeURIComponent(pkg.incidentId)}/offline-map`);
  timings.offlineMapLoadMs=elapsed(mapLoadStart);
  assert.equal(initialOfflineMap.baseLayer.remoteTileDependencies,0);
  await new Promise((resolve)=>central.server.close(resolve)); central=null;
  const isolationStart=performance.now();
  await waitFor(async () => (await requestJson(fieldBase, '/api/fieldnet/state')).connectionState === 'REGIONAL_DISCONNECTED', { label: 'regional_disconnect' });
  timings.wanIsolationDetectionMs=elapsed(isolationStart);

  const devices = [
    { deviceId: 'field-device:shadow-phone-a', deviceType: 'PHONE', hardwareIdentity: 'controlled-exercise-phone-a', ownerOperator: 'shadow:operator-a', capabilities: ['FIELD_REPORT', 'TASK_ACK'], calibrationStatus: 'NOT_APPLICABLE', timeQuality: 'SYNCED', locationQuality: 'GNSS_10M', trustQualification: 'CONTROLLED_EXERCISE' },
    { deviceId: 'field-device:shadow-phone-b', deviceType: 'PHONE', hardwareIdentity: 'controlled-exercise-phone-b', ownerOperator: 'shadow:operator-b', capabilities: ['FIELD_REPORT', 'TASK_ACK'], calibrationStatus: 'NOT_APPLICABLE', timeQuality: 'SKEWED', locationQuality: 'GNSS_25M', trustQualification: 'CONTROLLED_EXERCISE' }
  ];
  for (const device of devices) await requestJson(fieldBase, '/api/fieldnet/devices', { method: 'POST', value: { ...device, actor: device.ownerOperator } });
  const packagedAlert = pkg.currentAlerts[0];
  let alertAcknowledgementProof = { state: 'NOT_APPLICABLE', reason: 'Selected real incident had no current regional alert at package time; capability is covered by persistent-store tests.' };
  if (packagedAlert) {
    const route = `/api/fieldnet/incidents/${encodeURIComponent(pkg.incidentId)}/alerts/${encodeURIComponent(packagedAlert.id)}/acknowledgements`;
    const localAlertAck = await requestJson(fieldBase, route, { method: 'POST', value: { actor: 'shadow:field-team-a', alertVersion: packagedAlert.version, note: 'Acknowledged locally while disconnected.' } });
    const duplicateLocalAlertAck = await requestJson(fieldBase, route, { method: 'POST', value: { actor: 'shadow:field-team-a', alertVersion: packagedAlert.version, note: 'Acknowledged locally while disconnected.' } });
    assert.equal(localAlertAck.duplicate, false); assert.equal(duplicateLocalAlertAck.duplicate, true);
    alertAcknowledgementProof = { state: 'PROVEN', alertId: packagedAlert.id, duplicateSuppressed: true };
  }

  const coordinate = pkg.incidentState.coordinate;
  const receivedAt = now();
  const firstObservation = {
    observationId: 'field-observation:controlled-road-a', incidentId: pkg.incidentId, deviceId: devices[0].deviceId, observerIdentity: 'shadow:operator-a', sourceIdentity: { kind: 'HUMAN', exercise: true },
    observedAt: receivedAt, receivedAt, deviceClockQuality: 'SYNCED', geometry: { type: 'Point', coordinates: coordinate }, horizontalUncertaintyM: 10, observationType: 'ACCESS_CONDITION',
    payload: { subjectKey: 'access:incident-north-approach', claimField: 'accessState', claimValue: 'PASSABLE', exerciseMode: 'CONTROLLED_FIELD_EXERCISE', note: 'Shadow operator A reports passable.' },
    evidenceReference: { kind: 'CONTROLLED_EXERCISE_REPORT' }, rawEvidenceHash: sha256('controlled-field-exercise:road-a:passable'), causalMetadata: { clientId: 'shadow-client-a', clientSequence: 1 }, verificationOwner: 'shadow:field-team-a'
  };
  const secondObservation = {
    observationId: 'field-observation:controlled-road-b', incidentId: pkg.incidentId, deviceId: devices[1].deviceId, observerIdentity: 'shadow:operator-b', sourceIdentity: { kind: 'HUMAN', exercise: true },
    observedAt: new Date(Date.parse(receivedAt) - 30 * 60_000).toISOString(), receivedAt, deviceClockQuality: 'SKEWED', geometry: { type: 'Point', coordinates: [coordinate[0] + 0.0002, coordinate[1] + 0.0002] }, horizontalUncertaintyM: 25, observationType: 'ACCESS_CONDITION',
    payload: { subjectKey: 'access:incident-north-approach', claimField: 'accessState', claimValue: 'BLOCKED', exerciseMode: 'CONTROLLED_FIELD_EXERCISE', note: 'Shadow operator B reports obstruction.' },
    evidenceReference: { kind: 'CONTROLLED_EXERCISE_REPORT' }, rawEvidenceHash: sha256('controlled-field-exercise:road-b:blocked'), causalMetadata: { clientId: 'shadow-client-b', clientSequence: 1 }, verificationOwner: 'shadow:field-team-a'
  };
  const obsStart = performance.now();
  const firstResult = await requestJson(fieldBase, '/api/fieldnet/observations', { method: 'POST', value: { ...firstObservation, actor: 'shadow:operator-a' } });
  timings.firstOfflineObservationCommitMs = elapsed(obsStart);
  const conflictStart = performance.now();
  const secondResult = await requestJson(fieldBase, '/api/fieldnet/observations', { method: 'POST', value: { ...secondObservation, actor: 'shadow:operator-b' } });
  timings.conflictingObservationCommitMs = elapsed(conflictStart);
  assert.equal(firstResult.conflicts.length, 0);
  assert.equal(secondResult.conflicts.length, 1);
  assert.equal(secondResult.observation.freshness, 'STALE_AT_RECEIPT');
  assert.equal(secondResult.observation.physicalFamilyQualification, 'HUMAN_FIELD_REPORT_NOT_PHYSICAL_SENSOR_FAMILY');
  const duplicateObservation = await requestJson(fieldBase, '/api/fieldnet/observations', { method: 'POST', value: { ...firstObservation, actor: 'shadow:operator-a' } });
  assert.equal(duplicateObservation.duplicate, true);

  const evidenceDebtId = `debt:fieldnet:${secondResult.conflicts[0].conflictId}`;
  const debtCreated = await requestJson(fieldBase, `/api/fieldnet/incidents/${encodeURIComponent(pkg.incidentId)}/evidence-debt`, { method:'POST', value:{ actor:'shadow:incident-lead', item:{ id:evidenceDebtId, question:'Is the northern approach passable at the conflicting observation time?', currentState:'OPEN', whyUnknown:'Two attributable field reports disagree on access state.', whyItMatters:'An unsafe route assignment could delay evidence collection.', howWeCanKnow:['Independent field observation from the eastern corridor','Qualified thermal or environmental sensor only if physically available and qualified'], whatVigiaIsDoing:'VERIFICATION_TASK_PLANNED', closesWhen:'Independent evidence resolves accessState or an authorized operator records a time-dependent change.', linkedConflictId:secondResult.conflicts[0].conflictId, currentDenominator:0, targetDenominator:1, systemResolvable:false, fieldRequired:true } } });
  assert.equal(debtCreated.created,true);
  assert.equal(debtCreated.item.currentState,'OPEN');

  const verificationTask = secondResult.verificationTasks[0].task;
  const ackStart = performance.now();
  const ack = await requestJson(fieldBase, `/api/fieldnet/tasks/${encodeURIComponent(verificationTask.taskId)}/acknowledgements`, { method: 'POST', value: { actor: 'shadow:field-team-a', taskVersion: verificationTask.version, note: 'Acknowledged inside disconnected cell.' } });
  timings.taskAcknowledgementCommitMs = elapsed(ackStart);
  const duplicateAck = await requestJson(fieldBase, `/api/fieldnet/tasks/${encodeURIComponent(verificationTask.taskId)}/acknowledgements`, { method: 'POST', value: { actor: 'shadow:field-team-a', taskVersion: verificationTask.version, note: 'Acknowledged inside disconnected cell.' } });
  assert.equal(ack.duplicate, false);
  assert.equal(duplicateAck.duplicate, true);
  const baseVersion = ack.task.version;
  const taskA = await requestJson(fieldBase, `/api/fieldnet/tasks/${encodeURIComponent(verificationTask.taskId)}/mutations`, { method: 'POST', value: { mutationId: 'field-mutation:controlled-task-a', actor: 'shadow:operator-a', baseVersion, changes: { state: 'IN_PROGRESS' }, causalMetadata: { clientId: 'shadow-client-a', clientSequence: 2 } } });
  const taskB = await requestJson(fieldBase, `/api/fieldnet/tasks/${encodeURIComponent(verificationTask.taskId)}/mutations`, { method: 'POST', value: { mutationId: 'field-mutation:controlled-task-b', actor: 'shadow:operator-b', baseVersion, changes: { state: 'BLOCKED' }, causalMetadata: { clientId: 'shadow-client-b', clientSequence: 2 } } });
  assert.equal(taskA.outcome, 'APPLY');
  assert.equal(taskB.outcome, 'CONFLICT');

  const priorityMessages = [
    ['field-mutation:priority-p0', 'P0_LIFE_SAFETY', 'Controlled exercise life-safety marker'],
    ['field-mutation:priority-p3', 'P3_TASK', 'Controlled exercise task annotation'],
    ['field-mutation:priority-p4', 'P4_TELEMETRY', 'Controlled exercise telemetry summary'],
    ['field-mutation:priority-p5', 'P5_THUMBNAIL', 'Controlled exercise thumbnail reference'],
    ['field-mutation:priority-p6', 'P6_BULK_MEDIA', `Controlled exercise bulk evidence ${'x'.repeat(32_000)}`]
  ];
  for (const [mutationId, priority, text] of priorityMessages) await requestJson(fieldBase, '/api/fieldnet/annotations', { method: 'POST', value: { mutationId, incidentId: pkg.incidentId, actor: 'shadow:operator-a', subjectId: verificationTask.taskId, body: text, priority } });
  await requestJson(fieldBase, '/api/fieldnet/connection-state', { method: 'POST', value: { state: 'LOW_BANDWIDTH', actor: 'shadow:exercise-controller' } });
  const lowBandwidthQueue = await requestJson(fieldBase, '/api/fieldnet/sync-queue?mode=LOW_BANDWIDTH&limit=100');
  const fullQueue = await requestJson(fieldBase, '/api/fieldnet/sync-queue?mode=FULL&limit=100');
  assert.equal(lowBandwidthQueue.items.some((item) => item.priority === 'P6_BULK_MEDIA'), false);
  assert.equal(fullQueue.items.some((item) => item.priority === 'P6_BULK_MEDIA'), true);
  await requestJson(fieldBase, '/api/fieldnet/connection-state', { method: 'POST', value: { state: 'REGIONAL_DISCONNECTED', actor: 'shadow:exercise-controller' } });

  const beforeRestart = await requestJson(fieldBase, `/api/fieldnet/incidents/${encodeURIComponent(pkg.incidentId)}/metrics`);
  const offlineMapBefore = await requestJson(fieldBase, `/api/fieldnet/incidents/${encodeURIComponent(pkg.incidentId)}/offline-map`);
  const truthBefore = await requestJson(fieldBase, `/api/fieldnet/incidents/${encodeURIComponent(pkg.incidentId)}/truth-graph`);
  await stopFieldNode(field);
  const restart = performance.now();
  field = await startFieldNode({ root, port: fieldPort, centralPort, dbPath, incidentId });
  timings.restartListenerReadyMs = elapsed(restart);
  const afterRestart = await waitFor(async () => requestJson(fieldBase, `/api/fieldnet/incidents/${encodeURIComponent(pkg.incidentId)}/metrics`), { label: 'restart_persistence' });
  for (const key of ['incidents', 'observations', 'tasks', 'acknowledgements', 'alertAcknowledgements', 'mutations', 'openConflicts', 'pendingSync']) assert.equal(afterRestart[key], beforeRestart[key], `restart count mismatch: ${key}`);

  central = await startCentralMock({ port: centralPort, incidentId: pkg.incidentId, filePath: path.join(proofDirectory, 'central-fieldnet-ledger.json') });
  const reconciliationStart = performance.now();
  const reconciledState = await waitFor(async () => {
    const [state, metrics] = await Promise.all([requestJson(fieldBase, '/api/fieldnet/state'), requestJson(fieldBase, `/api/fieldnet/incidents/${encodeURIComponent(pkg.incidentId)}/metrics`)]);
    return state.connectionState === 'FULL' && metrics.pendingSync === 0 ? { state, metrics } : false;
  }, { timeoutMs: 15_000, intervalMs: 150, label: 'automatic_reconciliation' });
  timings.automaticReconnectReconciliationMs = elapsed(reconciliationStart);
  assert.equal(central.state.firstResponseDropped, true);
  assert.ok(central.state.duplicateDeliveries > 0);
  assert.equal(central.state.rejected, 0);

  const debtUpdated = await requestJson(fieldBase, `/api/fieldnet/incidents/${encodeURIComponent(pkg.incidentId)}/evidence-debt`, { method:'POST', value:{ actor:'shadow:incident-lead', item:{ id:evidenceDebtId, question:debtCreated.item.question, currentState:'PARTIALLY_MEASURED', whyUnknown:debtCreated.item.whyUnknown, whyItMatters:debtCreated.item.whyItMatters, howWeCanKnow:debtCreated.item.howWeCanKnow, whatVigiaIsDoing:'INDEPENDENT_VERIFICATION_ASSIGNED', closesWhen:debtCreated.item.closesWhen, linkedConflictId:secondResult.conflicts[0].conflictId, currentDenominator:1, targetDenominator:2, systemResolvable:false, fieldRequired:true } } });
  assert.equal(debtUpdated.item.revision,2);
  assert.equal(debtUpdated.item.currentState,'PARTIALLY_MEASURED');

  const resolved = await requestJson(fieldBase, `/api/fieldnet/conflicts/${encodeURIComponent(taskB.conflict.conflictId)}/resolve`, { method: 'POST', value: { actor: 'shadow:incident-lead', strategy: 'ACCEPT_OFFLINE' } });
  assert.equal(resolved.task.state, 'BLOCKED');
  await waitFor(async () => (await requestJson(fieldBase, `/api/fieldnet/incidents/${encodeURIComponent(pkg.incidentId)}/metrics`)).pendingSync === 0, { timeoutMs: 8_000, label: 'resolution_sync' });

  const [finalMetrics, finalTruth, finalAudit, finalReplay, finalMap, freshness, finalConflicts, observations, tasks, finalDebt] = await Promise.all([
    requestJson(fieldBase, `/api/fieldnet/incidents/${encodeURIComponent(pkg.incidentId)}/metrics`),
    requestJson(fieldBase, `/api/fieldnet/incidents/${encodeURIComponent(pkg.incidentId)}/truth-graph`),
    requestJson(fieldBase, `/api/fieldnet/incidents/${encodeURIComponent(pkg.incidentId)}/audit`),
    requestJson(fieldBase, `/api/fieldnet/incidents/${encodeURIComponent(pkg.incidentId)}/replay`),
    requestJson(fieldBase, `/api/fieldnet/incidents/${encodeURIComponent(pkg.incidentId)}/offline-map`),
    requestJson(fieldBase, `/api/fieldnet/incidents/${encodeURIComponent(pkg.incidentId)}/source-freshness`),
    requestJson(fieldBase, `/api/fieldnet/incidents/${encodeURIComponent(pkg.incidentId)}/conflicts`),
    requestJson(fieldBase, `/api/fieldnet/incidents/${encodeURIComponent(pkg.incidentId)}/observations`),
    requestJson(fieldBase, `/api/fieldnet/incidents/${encodeURIComponent(pkg.incidentId)}/tasks`),
    requestJson(fieldBase, `/api/fieldnet/incidents/${encodeURIComponent(pkg.incidentId)}/evidence-debt`)
  ]);
  assert.equal(finalAudit.verification.valid, true);
  assert.equal(observations.observations.length, 2);
  assert.equal(tasks.tasks.length, 1);
  assert.equal(central.state.incidentIds.size, 1);
  assert.equal(central.state.typeAccepted.FIELD_OBSERVATION_ADDED, 2);
  assert.equal(new Set(observations.observations.map((item) => item.observationId)).size, observations.observations.length);
  assert.equal(new Set(tasks.tasks.map((item) => item.taskId)).size, tasks.tasks.length);
  assert.ok(Object.keys(central.state.priorityAccepted).length >= 7);
  assert.ok(freshness.sources.every((item) => item.qualification.includes('never CURRENT_LOCAL')));
  assert.equal(finalMap.baseLayer.state, 'LOCAL_OFFLINE_GEOGRAPHY_AND_TERRAIN_PACKAGED');
  assert.equal(finalMap.baseLayer.remoteTileDependencies, 0);
  assert.ok(finalMap.baseLayer.geoJson.features.length > 0);
  assert.equal(finalMap.baseLayer.terrain.width, 80);
  assert.equal(finalMap.baseLayer.terrain.height, 80);
  assert.equal(pkg.measurementDebt.length, 8);
  assert.equal(finalDebt.items.length,9);
  assert.equal(finalReplay.evidenceDebt.find((item)=>item.id===evidenceDebtId)?.currentState,'PARTIALLY_MEASURED');

  const centralTruth = central.state.centralService.snapshot(pkg.incidentId);
  assert.equal(centralTruth.observations.length, 2);
  assert.equal(centralTruth.tasks.length, 1);
  assert.equal(centralTruth.tasks[0].state, 'BLOCKED');
  const dataIntegrity = buildDataIntegrity({ observations: observations.observations, tasks: tasks.tasks, finalMetrics, centralState: central.state, expectedAlertAcknowledgements: packagedAlert ? 1 : 0 });
  assert.equal(dataIntegrity.zeroSilentLoss, true);
  assert.equal(dataIntegrity.zeroDuplicateApplication, true);
  assert.equal(dataIntegrity.fabricatedProductionObservations, 0);

  const artifactContext = { root, dbPath, packagePath, proofPath, replayPath, pkg, packageBuild, timings, beforeRestart, afterRestart, finalMetrics, secondResult, taskB, resolved, finalConflicts, lowBandwidthQueue, fullQueue, centralState: central.state, reconciledState, centralTruth, dataIntegrity, finalAudit, freshness, finalTruth, offlineMapBefore, finalMap, alertAcknowledgementProof, debtCreated, debtUpdated, finalDebt };
  const proof = buildProof(artifactContext);
  const proofId = sha256(proof);
  proof.proofId = proofId;
  await writeJson(proofPath, proof);
  await writeJson(replayPath, { ...finalReplay, proofId, replayQualification: 'Deterministic persisted mutation/audit replay from the controlled disconnect exercise.' });

  const handoff = buildHandoff({ ...artifactContext, proof, proofId });
  await writeJson(handoffPath, handoff);
  process.stdout.write(`${JSON.stringify({ ok: true, verdict: proof.verdict, incidentId: pkg.incidentId, proofPath, replayPath, handoffPath, timingsMs: timings, dataIntegrity, audit: finalAudit.verification })}\n`);
} finally {
  if (field) await stopFieldNode(field).catch(() => {});
  if (central) await new Promise((resolve) => central.server.close(resolve)).catch(() => {});
}
