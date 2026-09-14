import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, unlink } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createFieldIncidentPackage } from '../../../packages/domain/src/fieldnet/contracts.mjs';
import { FieldNetCapacityTaskClient, validateTrustedCapacityDestination } from '../src/modules/response-capability/fieldnet-capacity-task-client.mjs';
import { assertRestrictedCapacityReadiness } from '../src/modules/response-capability/fieldnet-capacity-task-contract.mjs';
import { CONTROL_KEY, CONTROL_KEY_ID, INCIDENT_ID, NODE_ID, TASK_KEY, TASK_KEY_ID, facility, responseService, root, scratchRoot, serverEntry, signedSocketRequest, waitForListener } from './response-capability-fieldnet-task-fixtures.mjs';

test('response projection persists one exact-scope FieldNet capacity task, duplicate projection no-ops, and admitted aggregate truth resolves the IR', async (t) => {
  await mkdir(scratchRoot, { recursive: true });
  const directory = await mkdtemp(path.join(scratchRoot, 'fieldnet-capacity-task-bridge-'));
  const socketPath = path.join(scratchRoot, `fct-${process.pid}-${Date.now().toString(36)}.sock`);
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
      FIELDNET_DB_PATH: path.join(directory, 'fieldnet.sqlite'),
      FIELDNET_HOST: '127.0.0.1',
      FIELDNET_NODE_ID: NODE_ID,
      FIELDNET_PORT: '0',
      FIELDNET_CENTRAL_URL: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => {
    if (child.exitCode === null) { child.kill('SIGTERM'); await new Promise((resolve) => child.once('exit', resolve)); }
    await unlink(socketPath).catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  });
  await waitForListener(child);
  const now = new Date();
  const imported = await signedSocketRequest({
    socketPath,
    keyId: CONTROL_KEY_ID,
    key: CONTROL_KEY,
    method: 'POST',
    requestPath: '/api/fieldnet/incidents/import',
    body: { package: createFieldIncidentPackage({ incidentId: INCIDENT_ID, createdAt: new Date(now.getTime() - 60_000) }) }
  });
  assert.equal(imported.status, 201);
  assert.equal(imported.signed, true);

  const destination = { nodeId: NODE_ID, incidentIds: [INCIDENT_ID], capabilities: ['fieldnet:sync', 'fieldnet:capacity-task'], status: 'active' };
  const readiness = await signedSocketRequest({ socketPath, keyId: TASK_KEY_ID, key: TASK_KEY, requestPath: '/api/fieldnet/capacity-task-readiness' });
  assert.equal(readiness.status, 200);
  assertRestrictedCapacityReadiness(readiness.body, { destinationNodeId: NODE_ID, incidentId: INCIDENT_ID, expectedReleaseIdentity: readiness.body.releaseIdentity });
  const client = new FieldNetCapacityTaskClient({ socketPath, keyId: TASK_KEY_ID, key: TASK_KEY, incidentId: INCIDENT_ID, destination, expectedReleaseIdentity: readiness.body.releaseIdentity, clock: () => new Date(now) });
  let reports = [];
  const reportProvider = { async listForIncident() { return { source: 'admitted aggregate capacity read model', sourceAvailability: { fieldNetFireCapacity: 'CONNECTED' }, items: reports }; } };
  const service = responseService({ dispatcher: client, reportProvider, now });
  const incident = { id: INCIDENT_ID, coordinate: [-8.5, 41.2], truthState: 'VERIFIED_CURRENT' };

  const first = await service.projectIncident(incident);
  const firstRequirement = first.informationRequirements.find((item) => item.subjectId === 'station:bridge');
  const firstTask = firstRequirement.collectionTasks.find((item) => item.strategyId === 'fieldnet-fire-capacity');
  assert.equal(firstTask.state, 'FIELDNET_TASK_PERSISTED', JSON.stringify(firstTask));
  assert.equal(firstTask.receipt.state, 'PERSISTED_LOCAL');
  assert.equal(firstTask.delivery.state, 'PERSISTED_AT_TRUSTED_FIELDNET_DESTINATION');
  assert.equal(firstTask.acknowledgement.state, 'NOT_RECORDED');
  assert.equal(firstTask.centralReconciliation.state, 'LOCAL_ONLY_PENDING_SYNC');
  assert.equal(firstTask.attemptCount, 1);
  const firstExecution = firstRequirement.collectionPlan.executions.find((item) => item.strategyId === 'fieldnet-fire-capacity');
  assert.deepEqual(firstExecution, {
    collectionTaskId: firstTask.id,
    strategyId: 'fieldnet-fire-capacity',
    state: 'FIELDNET_TASK_PERSISTED',
    attemptCount: 1,
    lastAttempt: now.toISOString(),
    nextAttempt: firstRequirement.currentAssessment.nextCheckAt,
    backoff: { state: 'READY_TO_SYNC', nextAttempt: null },
    deadline: firstRequirement.deadline,
    escalation: {
      state: 'MONITORING',
      escalateTo: 'INCIDENT_COMMAND',
      reason: 'Escalate if evidence is not locally completed and centrally reconciled by the deadline.'
    },
    receiptId: firstTask.receipt.receiptId,
    localPersistenceState: 'PERSISTED_AT_TRUSTED_FIELDNET_DESTINATION',
    localCompletionState: 'NOT_COMPLETED',
    centralReconciliationState: 'LOCAL_ONLY_PENDING_SYNC'
  });

  const second = await service.projectIncident(incident);
  const secondTask = second.informationRequirements[0].collectionTasks.find((item) => item.strategyId === 'fieldnet-fire-capacity');
  assert.equal(secondTask.receipt.receiptId, firstTask.receipt.receiptId);
  assert.match(secondTask.result.reason, /already existed/);
  const taskInventory = await signedSocketRequest({
    socketPath,
    keyId: CONTROL_KEY_ID,
    key: CONTROL_KEY,
    requestPath: `/api/fieldnet/incidents/${encodeURIComponent(INCIDENT_ID)}/tasks`
  });
  assert.equal(taskInventory.status, 200);
  assert.equal(taskInventory.body.tasks.length, 1);
  assert.equal(taskInventory.body.tasks[0].linkedInformationRequirementId, firstRequirement.id);
  assert.equal(taskInventory.body.tasks[0].safeZoneConstraint.mode, 'REMOTE_ONLY');
  assert.equal(JSON.stringify(taskInventory.body).includes('individualName'), false);

  reports = [{
    facilityId: 'station:bridge', state: 'FIELD_REPORTED', admitted: true,
    admissionReference: 'admission:station:bridge', observedAt: new Date(now.getTime() - 1_000).toISOString(),
    source: { name: 'VIGIA FieldNet', reference: 'field-observation:station:bridge' },
    crewsAvailable: 1, enginesAvailable: 1, stationReadiness: 'OPERATIONAL'
  }];
  const resolved = await service.projectIncident(incident);
  assert.equal(resolved.informationRequirements.length, 0);
  assert.equal(resolved.optimizerInputs.candidates[0].capacityKnown, true);
  assert.equal(resolved.optimizerInputs.candidates[0].availableCapacityConfirmed, true);

  const forbidden = await signedSocketRequest({
    socketPath,
    keyId: TASK_KEY_ID,
    key: TASK_KEY,
    requestPath: `/api/fieldnet/incidents/${encodeURIComponent(INCIDENT_ID)}/tasks`
  });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.error, 'fieldnet_capacity_task_route_forbidden');
});

test('capacity task bridge fails closed for missing connector, unavailable FieldNet, wrong incident, and untrusted destination', async () => {
  const now = new Date();
  const incident = { id: INCIDENT_ID, coordinate: [-8.5, 41.2], truthState: 'VERIFIED_CURRENT' };
  const providerThatMustNotEnableTasking = { async listForIncident() { return { sourceAvailability: { fieldNetFireCapacity: 'CONNECTED' }, items: [] }; } };
  const missing = await responseService({ reportProvider: providerThatMustNotEnableTasking, now }).projectIncident(incident);
  const missingTask = missing.informationRequirements[0].collectionTasks.find((item) => item.strategyId === 'fieldnet-fire-capacity');
  assert.equal(missingTask.state, 'TERMINAL_UNAVAILABLE');
  assert.equal(missingTask.result.state, 'CONNECTOR_NOT_CONFIGURED');

  const destination = { nodeId: NODE_ID, incidentIds: [INCIDENT_ID], capabilities: ['fieldnet:sync', 'fieldnet:capacity-task'], status: 'active' };
  const unavailableClient = new FieldNetCapacityTaskClient({
    socketPath: path.join(root, '.tmp/test/fieldnet-capacity-task-unavailable.sock'),
    keyId: TASK_KEY_ID,
    key: TASK_KEY,
    incidentId: INCIDENT_ID,
    destination,
    expectedReleaseIdentity: {
      releaseId: 'vigia-unavailable-test', codeStateHash: 'sha256:unavailable',
      operationalDataHash: 'sha256:unavailable', releaseStatementHash: 'sha256:unavailable'
    },
    clock: () => new Date(now),
    timeoutMs: 250
  });
  const unavailable = await responseService({ dispatcher: unavailableClient, reportProvider: providerThatMustNotEnableTasking, now }).projectIncident(incident);
  const unavailableTask = unavailable.informationRequirements[0].collectionTasks.find((item) => item.strategyId === 'fieldnet-fire-capacity');
  assert.equal(unavailableTask.state, 'RETRY_WAIT');
  assert.equal(unavailableTask.result.state, 'CONNECTOR_UNAVAILABLE');
  assert.equal(unavailableTask.receipt, null);

  assert.throws(() => validateTrustedCapacityDestination({
    incidentId: INCIDENT_ID,
    destination: { nodeId: NODE_ID, incidentIds: [INCIDENT_ID], capabilities: ['fieldnet:sync'], status: 'active' }
  }), /destination_capability_missing/);
  assert.throws(() => validateTrustedCapacityDestination({
    incidentId: INCIDENT_ID,
    destination: { nodeId: NODE_ID, incidentIds: [INCIDENT_ID, 'incident:other'], capabilities: ['fieldnet:capacity-task'], status: 'active' }
  }), /destination_scope_invalid/);

  const initial = missing.informationRequirements[0];
  await assert.rejects(() => unavailableClient.ensureCapacityTask({ requirement: { ...initial, incidentId: 'incident:wrong' }, facility: facility() }), /incident_scope_forbidden/);
});

test('restricted FieldNet capacity readiness fails closed on partial checks, scope, or release quartet', () => {
  const releaseIdentity = {
    releaseId: 'vigia-readiness-contract', codeStateHash: 'sha256:code',
    operationalDataHash: 'sha256:data', releaseStatementHash: 'sha256:statement'
  };
  const payload = {
    schemaVersion: 'vigia.fieldnet-capacity-task-readiness.v1', ready: true,
    nodeId: NODE_ID, incidentScope: { exact: true, incidentId: INCIDENT_ID }, releaseIdentity,
    checks: Object.fromEntries(['process', 'listener', 'releaseIdentity', 'startup', 'deploymentIdentity', 'incidentScope', 'storage', 'internalServices'].map((name) => [name, { ready: true }])),
    centralConnectivity: { configured: false, connectionState: 'OFFLINE', readinessGate: false }
  };
  assert.equal(assertRestrictedCapacityReadiness(payload, { destinationNodeId: NODE_ID, incidentId: INCIDENT_ID, expectedReleaseIdentity: releaseIdentity }), payload);
  assert.throws(() => assertRestrictedCapacityReadiness({ ...payload, checks: { ...payload.checks, storage: { ready: false } } }, { destinationNodeId: NODE_ID, incidentId: INCIDENT_ID, expectedReleaseIdentity: releaseIdentity }), /readiness_check_failed:storage/);
  assert.throws(() => assertRestrictedCapacityReadiness({ ...payload, releaseIdentity: { ...releaseIdentity, codeStateHash: '' } }, { destinationNodeId: NODE_ID, incidentId: INCIDENT_ID, expectedReleaseIdentity: releaseIdentity }), /release_identity_missing:codeStateHash/);
  assert.throws(() => assertRestrictedCapacityReadiness({ ...payload, centralConnectivity: { readinessGate: true } }, { destinationNodeId: NODE_ID, incidentId: INCIDENT_ID, expectedReleaseIdentity: releaseIdentity }), /central_connectivity_boundary_invalid/);
});
