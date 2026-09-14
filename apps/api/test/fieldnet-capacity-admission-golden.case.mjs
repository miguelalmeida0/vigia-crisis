import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { FieldNetService } from '../../field-node/src/service.mjs';
import { FieldNodeStore } from '../../field-node/src/sqlite-store.mjs';
import { createFieldIncidentPackage, sha256 } from '../../../packages/domain/src/fieldnet/contracts.mjs';
import { FieldCapacityReportProvider } from '../../../packages/domain/src/fieldnet/capacity-report-provider.mjs';
import { CentralFieldNetService } from '../src/modules/fieldnet/central-fieldnet-service.mjs';
import { FieldCapacityAdmissionService } from '../src/modules/fieldnet/field-capacity-admission-service.mjs';

const NOW = new Date('2026-09-04T15:00:00Z');
const INCIDENT_ID = 'incident:capacity:golden';
const EVIDENCE_HASH = sha256('fieldnet-hospital-capacity-golden-evidence');

test('field verification task -> offline receipt -> report -> central receipt -> governed admission -> capacity projection', async (t) => {
  const directory = await mkdtemp(path.join(process.cwd(), '.tmp/test/field-capacity-golden-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const nodeId = 'field-node:capacity-golden';
  const store = new FieldNodeStore({ filePath: path.join(directory, 'field.sqlite'), nodeId, clock: () => NOW });
  t.after(() => store.close());
  const field = new FieldNetService({ store, clock: () => NOW, incidentId: INCIDENT_ID });
  field.importPackage(createFieldIncidentPackage({ incidentId: INCIDENT_ID, createdAt: '2026-09-04T14:00:00Z' }), 'regional-vigia');
  field.registerDevice({
    deviceId: 'device:capacity-golden', deviceType: 'PHONE', hardwareIdentity: 'hardware:capacity-golden', ownerOperator: 'observer:capacity-golden',
    capabilities: ['STRUCTURED_FIELD_REPORT', 'TASK_ACK'], timeQuality: 'SYNCED',
    observer: {
      observerId: 'observer:capacity-golden', observerClass: 'MUNICIPAL_OPERATOR', verificationState: 'ROLE_ATTESTED',
      organizationId: 'municipality:capacity-golden', attestationReference: 'attestation:capacity-golden',
      attestedBy: 'field-control:capacity-golden', attestedAt: '2026-09-04T13:00:00Z'
    }
  }, 'field-control:capacity-golden');
  const task = field.createVerificationTask({
    taskId: 'task:capacity-golden', incidentId: INCIDENT_ID, objective: 'Report aggregate receiving capacity through the authorized remote facility channel.',
    owner: 'team:health-capacity', dueAt: '2026-09-04T15:30:00Z', acknowledgeBy: '2026-09-04T15:05:00Z',
    safeZoneConstraint: { mode: 'REMOTE_ONLY', instruction: 'Use only the authorized remote facility channel.' },
    targetObserverClasses: ['MUNICIPAL_OPERATOR'], expectedReportTypes: ['HOSPITAL_CAPACITY_UPDATE'],
    requiredEvidence: ['AGGREGATE_CAPACITY', 'ATTRIBUTABLE_SOURCE'], completionCriteria: 'One attributable aggregate capacity observation is persisted.',
    linkedInformationRequirementId: 'requirement:hospital-capacity:golden'
  }, 'field-control:capacity-golden').task;
  field.acknowledgeVerificationTask(task.taskId, {
    taskVersion: task.version, deviceId: 'device:capacity-golden', sessionId: 'session:capacity-golden',
    disposition: 'ACCEPTED', safetyState: 'SAFE_TO_PROCEED'
  }, 'field-control:capacity-golden');
  field.addStructuredReport({
    reportId: 'report:capacity-golden', reportType: 'HOSPITAL_CAPACITY_UPDATE', incidentId: INCIDENT_ID,
    deviceId: 'device:capacity-golden', sessionId: 'session:capacity-golden', linkedTaskId: task.taskId,
    observedAt: '2026-09-04T14:58:00Z', receivedAt: '2026-09-04T14:59:00Z', connectivityAtCapture: 'OFFLINE',
    geometry: { type: 'Point', coordinates: [-8.61, 41.15] }, horizontalUncertaintyM: 8, rawEvidenceHash: EVIDENCE_HASH,
    structuredAnswers: {
      facilityId: 'hospital:capacity-golden', edStatus: 'OPERATIONAL', bedsAvailable: 4, icuAvailability: 'LIMITED',
      staffAvailable: { DOCTORS: 2, NURSES: 4 }, ambulanceAccess: 'OPEN', acceptingPatients: 'YES',
      nextExpectedUpdate: '2026-09-04T15:15:00Z'
    }
  }, 'field-control:capacity-golden');
  field.completeVerificationTask(task.taskId, {
    taskVersion: store.task(task.taskId).version, evidenceObservationIds: ['report:capacity-golden']
  }, 'field-control:capacity-golden');

  const central = new CentralFieldNetService({
    filePath: path.join(directory, 'central.json'), clock: () => NOW,
    operationalEventService: { async operatorEvent(id) { return id === INCIDENT_ID ? { event: { id, evidenceState: 'CURRENT', knowledgeState: 'CURRENT', physicalOperationalState: 'UNKNOWN', lastSeenAt: NOW.toISOString() } } : null; } }
  });
  await central.initialize();
  const queued = store.pendingSync({ mode: 'FULL', incidentId: INCIDENT_ID });
  const synced = await central.sync({
    schemaVersion: 'vigia.fieldnet-sync-request.v1', nodeId, cursor: '0',
    mutations: queued.items.map((item) => item.mutation).sort((left, right) => left.localSequence - right.localSequence)
  });
  store.recordSyncAttempt(queued.items.filter((item) => synced.acceptedMutationIds.includes(item.mutationId)));
  const centralSnapshot = central.snapshot(INCIDENT_ID);
  assert.equal(centralSnapshot.observations.find((item) => item.observationId === 'report:capacity-golden').freshness, 'CURRENT_CENTRAL_RECEIPT');
  assert.equal(centralSnapshot.tasks.find((item) => item.taskId === task.taskId).state, 'COMPLETED');
  assert.equal(centralSnapshot.acknowledgements.some((item) => item.disposition === 'ACCEPTED'), true);

  const rawProvider = new FieldCapacityReportProvider({ snapshotForIncident: (incidentId, options) => central.snapshot(incidentId, options), clock: () => NOW });
  assert.equal((await rawProvider.listForIncident(INCIDENT_ID)).items.length, 0, 'central receipt alone must not admit capacity');
  const admission = new FieldCapacityAdmissionService({
    filePath: path.join(directory, 'admissions.json'), clock: () => NOW,
    snapshotForIncident: (incidentId, options) => central.snapshot(incidentId, options),
    authorizeAdmission: async (context) => ({
      authorized: context.actor?.permissions?.includes('fieldnet:capacity-admit') === true,
      scope: context.scope, action: context.action, incidentId: context.incidentId, truthEnvironment: context.truthEnvironment,
      principalId: context.actor.id, authorityReference: 'authority:capacity:regional-eoc'
    })
  });
  await admission.initialize();
  await admission.admit({ id: 'operator:capacity-admitter:golden', permissions: ['fieldnet:capacity-admit'] }, {
    incidentId: INCIDENT_ID, observationId: 'report:capacity-golden', expectedReportType: 'HOSPITAL_CAPACITY_UPDATE',
    expectedRawEvidenceHash: EVIDENCE_HASH, truthEnvironment: 'LIVE_OPERATIONAL', decisionReference: 'decision:capacity:golden'
  });
  const admittedProvider = new FieldCapacityReportProvider({
    clock: () => NOW,
    snapshotForIncident: async (incidentId, options) => admission.decorateSnapshot(incidentId, central.snapshot(incidentId, options))
  });
  const capacity = await admittedProvider.listForIncident(INCIDENT_ID);
  assert.equal(capacity.items.length, 1);
  assert.equal(capacity.items[0].facilityId, 'hospital:capacity-golden');
  assert.equal(capacity.items[0].bedsAvailable, 4);
  assert.equal(capacity.items[0].source.name, 'VIGIA FieldNet');
  assert.equal(admission.verifyIntegrity().valid, true);
  assert.equal(store.verifyAudit().valid, true);
});
