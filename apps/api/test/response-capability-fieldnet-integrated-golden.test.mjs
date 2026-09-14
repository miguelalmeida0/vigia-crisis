import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, unlink } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createFieldIncidentPackage, sha256 } from '../../../packages/domain/src/fieldnet/contracts.mjs';
import { FieldCapacityReportProvider } from '../../../packages/domain/src/fieldnet/capacity-report-provider.mjs';
import { FieldNodeStore } from '../../field-node/src/sqlite-store.mjs';
import { CentralFieldNetService } from '../src/modules/fieldnet/central-fieldnet-service.mjs';
import { FieldCapacityAdmissionService } from '../src/modules/fieldnet/field-capacity-admission-service.mjs';
import { OperatorStateRepository } from '../src/modules/interventions/operator-state-repository.mjs';
import { FieldNetCapacityTaskClient } from '../src/modules/response-capability/fieldnet-capacity-task-client.mjs';
import {
  CONTROL_KEY, CONTROL_KEY_ID, INCIDENT_ID, NODE_ID, TASK_KEY, TASK_KEY_ID,
  responseService, root, scratchRoot, serverEntry, signedSocketRequest, waitForListener
} from './response-capability-fieldnet-task-fixtures.mjs';
import { emitGoldenReceipt, SCENARIO_NAMES } from './anduril-crisis-os-golden-fixture.mjs';

test(SCENARIO_NAMES.GOLDEN_RESPONSE_CAPACITY, async (t) => {
  await mkdir(scratchRoot, { recursive: true });
  const directory = await mkdtemp(path.join(scratchRoot, 'fieldnet-integrated-golden-'));
  const socketPath = path.join(scratchRoot, `fic-${process.pid}-${Date.now().toString(36)}.sock`);
  const databasePath = path.join(directory, 'fieldnet.sqlite');
  const now = new Date();
  let store = null;
  const child = spawn(process.execPath, [serverEntry], {
    cwd: root,
    env: {
      ...process.env,
      FIELDNET_CONTROL_SOCKET: socketPath,
      FIELDNET_CONTROL_KEY: CONTROL_KEY,
      FIELDNET_CONTROL_KEY_ID: CONTROL_KEY_ID,
      FIELDNET_CAPACITY_TASK_KEY: TASK_KEY,
      FIELDNET_CAPACITY_TASK_KEY_ID: TASK_KEY_ID,
      FIELDNET_CONTROL_INCIDENT_SCOPES: INCIDENT_ID,
      FIELDNET_DB_PATH: databasePath,
      FIELDNET_HOST: '127.0.0.1',
      FIELDNET_NODE_ID: NODE_ID,
      FIELDNET_PORT: '0',
      FIELDNET_CENTRAL_URL: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => {
    store?.close();
    if (child.exitCode === null) { child.kill('SIGTERM'); await new Promise((resolve) => child.once('exit', resolve)); }
    await unlink(socketPath).catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  });
  await waitForListener(child);
  const imported = await signedSocketRequest({
    socketPath, keyId: CONTROL_KEY_ID, key: CONTROL_KEY, method: 'POST',
    requestPath: '/api/fieldnet/incidents/import',
    body: { package: createFieldIncidentPackage({ incidentId: INCIDENT_ID, createdAt: new Date(now.getTime() - 60_000) }) }
  });
  assert.equal(imported.status, 201, JSON.stringify(imported.body));
  const readiness = await signedSocketRequest({
    socketPath, keyId: TASK_KEY_ID, key: TASK_KEY,
    requestPath: '/api/fieldnet/capacity-task-readiness'
  });
  const destination = {
    nodeId: NODE_ID, incidentIds: [INCIDENT_ID],
    capabilities: ['fieldnet:sync', 'fieldnet:capacity-task'], status: 'active'
  };
  const client = new FieldNetCapacityTaskClient({
    socketPath, keyId: TASK_KEY_ID, key: TASK_KEY, incidentId: INCIDENT_ID,
    destination, expectedReleaseIdentity: readiness.body.releaseIdentity, clock: () => now
  });
  const repository = new OperatorStateRepository({ filePath: path.join(directory, 'operator.json'), clock: () => now });
  await repository.initialize();
  let fieldProvider = null;
  const provider = { async listForIncident(incidentId) {
    return fieldProvider ? fieldProvider.listForIncident(incidentId) : { items: [], sourceAvailability: {} };
  } };
  const service = responseService({ dispatcher: client, reportProvider: provider, recommendationRepository: repository, now });
  const incident = { id: INCIDENT_ID, coordinate: [-8.5, 41.2], truthState: 'VERIFIED_CURRENT' };
  const initial = await service.projectIncident(incident);
  const requirement = initial.informationRequirements.find((item) => item.subjectId === 'station:bridge');
  const execution = requirement.collectionTasks.find((item) => item.strategyId === 'fieldnet-fire-capacity');
  const taskId = execution.result.sourceRecordId;
  assert.equal(execution.state, 'FIELDNET_TASK_PERSISTED');
  const inventory = await signedSocketRequest({
    socketPath, keyId: CONTROL_KEY_ID, key: CONTROL_KEY,
    requestPath: `/api/fieldnet/incidents/${encodeURIComponent(INCIDENT_ID)}/tasks`
  });
  const task = inventory.body.tasks.find((item) => item.taskId === taskId);
  assert.equal(task.linkedInformationRequirementId, requirement.id);
  assert.deepEqual(task.expectedReportTypes, ['FIRE_STATION_CAPACITY_UPDATE']);
  const registered = await signedSocketRequest({
    socketPath, keyId: CONTROL_KEY_ID, key: CONTROL_KEY, method: 'POST',
    requestPath: '/api/fieldnet/devices', body: { device: {
      deviceId: 'device:integrated-golden', deviceType: 'PHONE', hardwareIdentity: 'hardware:integrated-golden',
      ownerOperator: 'observer:integrated-golden', capabilities: ['STRUCTURED_FIELD_REPORT', 'TASK_ACK'], timeQuality: 'SYNCED',
      observer: {
        observerId: 'observer:integrated-golden', observerClass: 'AUTHORIZED_RESPONDER', verificationState: 'ROLE_ATTESTED',
        organizationId: 'fire-service:integrated-golden', attestationReference: 'attestation:integrated-golden',
        attestedBy: CONTROL_KEY_ID, attestedAt: new Date(now.getTime() - 3_600_000).toISOString()
      }
    } }
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  const acknowledged = await signedSocketRequest({
    socketPath, keyId: CONTROL_KEY_ID, key: CONTROL_KEY, method: 'POST',
    requestPath: `/api/fieldnet/tasks/${encodeURIComponent(taskId)}/verification-acknowledgements`,
    body: { taskVersion: task.version, deviceId: 'device:integrated-golden', sessionId: 'session:integrated-golden', disposition: 'ACCEPTED', safetyState: 'SAFE_TO_PROCEED' }
  });
  assert.equal(acknowledged.status, 201, JSON.stringify(acknowledged.body));
  const reportId = 'report:capacity:integrated-golden';
  const evidenceHash = sha256('integrated-golden-aggregate-capacity-evidence');
  const reported = await signedSocketRequest({
    socketPath, keyId: CONTROL_KEY_ID, key: CONTROL_KEY, method: 'POST',
    requestPath: '/api/fieldnet/reports', body: { report: {
      reportId, reportType: 'FIRE_STATION_CAPACITY_UPDATE', incidentId: INCIDENT_ID,
      deviceId: 'device:integrated-golden', sessionId: 'session:integrated-golden', linkedTaskId: taskId,
      observedAt: new Date(now.getTime() - 1_000).toISOString(), receivedAt: now.toISOString(), connectivityAtCapture: 'OFFLINE',
      geometry: { type: 'Point', coordinates: [-8.4, 41.1] }, horizontalUncertaintyM: 8, rawEvidenceHash: evidenceHash,
      structuredAnswers: {
        stationId: 'station:bridge', crewsAvailable: 2, crewSize: 5, enginesAvailable: 1,
        tankersAvailable: 1, estimatedMobilizationMinutes: 7,
        alreadyCommittedResources: { CREWS: 0 }, communicationsStatus: 'OPERATIONAL',
        nextExpectedUpdate: new Date(now.getTime() + 15 * 60_000).toISOString()
      }
    } }
  });
  assert.equal(reported.status, 201, JSON.stringify(reported.body));
  const currentTask = (await signedSocketRequest({
    socketPath, keyId: CONTROL_KEY_ID, key: CONTROL_KEY,
    requestPath: `/api/fieldnet/tasks/${encodeURIComponent(taskId)}`
  })).body;
  assert.equal((await signedSocketRequest({
    socketPath, keyId: CONTROL_KEY_ID, key: CONTROL_KEY, method: 'POST',
    requestPath: `/api/fieldnet/tasks/${encodeURIComponent(taskId)}/completion`,
    body: { taskVersion: currentTask.version, evidenceObservationIds: [reportId] }
  })).status, 201);
  child.kill('SIGTERM');
  await new Promise((resolve) => child.once('exit', resolve));

  store = new FieldNodeStore({ filePath: databasePath, nodeId: NODE_ID, clock: () => now });
  assert.equal(store.taskLifecycle(taskId).localCompletion.state, 'COMPLETED_LOCAL_PENDING_SYNC');
  const central = new CentralFieldNetService({
    filePath: path.join(directory, 'central.json'), clock: () => now,
    operationalEventService: { async operatorEvent(id) { return id === INCIDENT_ID ? { event: { id, lastSeenAt: now.toISOString() } } : null; } }
  });
  await central.initialize();
  const queued = store.pendingSync({ mode: 'FULL', incidentId: INCIDENT_ID });
  const synced = await central.sync({
    schemaVersion: 'vigia.fieldnet-sync-request.v1', nodeId: NODE_ID, cursor: '0',
    mutations: queued.items.map((item) => item.mutation).sort((a, b) => a.localSequence - b.localSequence)
  });
  store.recordSyncAttempt(queued.items.filter((item) => synced.acceptedMutationIds.includes(item.mutationId)));
  assert.equal(store.taskLifecycle(taskId).centralReconciliation.state, 'CENTRAL_RECONCILED');
  const admission = new FieldCapacityAdmissionService({
    filePath: path.join(directory, 'admission.json'), clock: () => now,
    snapshotForIncident: (id, options) => central.snapshot(id, options),
    authorizeAdmission: async (context) => ({
      authorized: true, scope: context.scope, action: context.action, incidentId: context.incidentId,
      truthEnvironment: context.truthEnvironment, principalId: context.actor.id,
      authorityReference: 'authority:integrated-golden-admission'
    })
  });
  await admission.initialize();
  await admission.admit({ id: 'operator:admitter', permissions: ['fieldnet:capacity-admit'] }, {
    incidentId: INCIDENT_ID, observationId: reportId, expectedReportType: 'FIRE_STATION_CAPACITY_UPDATE',
    expectedRawEvidenceHash: evidenceHash, truthEnvironment: 'LIVE_OPERATIONAL',
    decisionReference: 'decision:integrated-golden-admission'
  });
  fieldProvider = new FieldCapacityReportProvider({
    clock: () => now,
    snapshotForIncident: async (id, options) => admission.decorateSnapshot(id, central.snapshot(id, options))
  });
  const resolved = await service.projectIncident(incident);
  assert.equal(resolved.informationRequirements.some((item) => item.id === requirement.id), false);
  const recommendation = resolved.resourceOptimizer.recommendedStaging.find((item) => item.facilityId === 'station:bridge');
  assert.ok(recommendation);
  assert.equal(recommendation.dispatchClaimed, false);
  const reviewed = await service.reviewRecommendation({
    id: 'commander:integrated-golden', role: 'supervisor', incidentScopes: [INCIDENT_ID]
  }, INCIDENT_ID, recommendation.recommendationId, {
    projectionId: resolved.projectionId, recommendationVersion: recommendation.recommendationVersion,
    recommendationHash: recommendation.recommendationHash, disposition: 'ACKNOWLEDGED_FOR_REVIEW',
    idempotencyKey: 'review:integrated-golden'
  });
  assert.equal(reviewed.receipt.truthEffect, 'REVIEW_STATE_ONLY');
  const refreshed = await service.projectIncident(incident);
  assert.equal(refreshed.recommendationReviews[0].receiptId, reviewed.receipt.receiptId);
  assert.equal(repository.snapshot().responseRecommendationReviewActions.length, 1);
  await emitGoldenReceipt(t, {
    scenarioId: 'GOLDEN_RESPONSE_CAPACITY',
    service: 'ResponseCapabilityService + signed FieldNet task/ack/report/completion + central sync/admission/review',
    before: initial,
    after: refreshed,
    transitions: [
      { objectType: 'INFORMATION_REQUIREMENT', objectId: requirement.id, fromState: 'OPEN', toState: 'CLOSED_BY_ADMITTED_REPORT' },
      { objectType: 'FIELDNET_TASK', objectId: taskId, fromState: 'GENERATED', toState: 'PERSISTED' },
      { objectType: 'FIELDNET_TASK_ACK', objectId: taskId, fromState: 'NOT_RECORDED', toState: acknowledged.body.acknowledgement.disposition },
      { objectType: 'FIELDNET_TYPED_REPORT', objectId: reportId, fromState: 'NOT_RECORDED', toState: 'PERSISTED' },
      { objectType: 'FIELDNET_LOCAL_COMPLETION', objectId: taskId, fromState: 'PENDING', toState: 'COMPLETED_LOCAL_PENDING_SYNC' },
      { objectType: 'FIELDNET_CENTRAL_SYNC', objectId: taskId, fromState: 'PENDING', toState: 'CENTRAL_RECONCILED' },
      { objectType: 'CAPACITY_ADMISSION', objectId: reportId, fromState: 'NOT_ADMITTED', toState: 'ADMITTED' },
      { objectType: 'RESOURCE_OPTIMIZER', objectId: INCIDENT_ID, fromState: initial.resourceOptimizer.state, toState: resolved.resourceOptimizer.state },
      { objectType: 'RECOMMENDATION_REVIEW', objectId: recommendation.recommendationId, fromState: 'UNREVIEWED', toState: reviewed.receipt.disposition },
    ],
    claims: [
      'CAPACITY_REQUIREMENT_CREATED', 'SIGNED_FIELDNET_TASK_PERSISTED', 'FIELDNET_TASK_ACKNOWLEDGED',
      'TYPED_CAPACITY_REPORT_PERSISTED', 'LOCAL_COMPLETION_RECORDED', 'CENTRAL_RECONCILIATION_RECORDED',
      'CAPACITY_ADMISSION_RECORDED', 'SAME_REQUIREMENT_CLOSED', 'OPTIMIZER_RECALCULATED',
      'REVIEW_RECEIPT_PERSISTED',
    ],
  });
});
