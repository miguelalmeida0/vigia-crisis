import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTOR, AT, INCIDENT_ID, OperationalPeriodService, ProtectionWorkflowService, SCENARIO_NAMES,
  activeCollection, autopilot, buildHumanAttention, buildResponseCapabilityProjection, candidate,
  createFieldObserver, createFieldTaskAcknowledgement, createFieldTaskCompletion,
  createFieldVerificationTask, createStructuredFieldReport, emitGoldenReceipt, hospital,
  normalizeDynamicCapacity, projectCrisisPlanning, reachability, repository, sha256, station,
} from './anduril-crisis-os-golden-fixture.mjs';

test(SCENARIO_NAMES.GOLDEN_1, async (t) => {
  const before = autopilot({
    incident: {
      id: INCIDENT_ID,
      label: 'Isolated golden-scenario incident',
      coordinate: [-8.61, 41.15],
      revision: 'revision:1',
      operationalTruth: { classification: 'DETECTION_CANDIDATE', priority: { whyRankedAboveNext: 'Fresh thermal signal requires corroboration.' } },
      observations: [{ id: 'thermal:golden:1', type: 'THERMAL', observedAt: '2026-09-04T11:57:00.000Z' }]
    },
    triggers: [{ id: 'trigger:thermal:golden', type: 'NEW_THERMAL_DETECTION', observedAt: '2026-09-04T11:57:00.000Z', evidenceReferences: ['thermal:golden:1'] }],
    informationRequirements: [{ id: 'requirement:golden:independence', incidentId: INCIDENT_ID, state: 'COLLECTING', missingQuantity: 'Independent causal source family' }],
    collectionTasks: [activeCollection()],
    candidateAcquisitions: [candidate()]
  });
  assert.equal(before.livingTwin.truth.value.classification, 'DETECTION_CANDIDATE');
  assert.equal(before.autopilot.doingNow[0].backingObjectIds[0], 'task:golden:field');
  assert.ok(before.autopilot.nextActions.some((item) => item.actionType === 'RECOMPUTE_INCIDENT_TRUTH'));
  assert.ok(before.autopilot.nextActions.some((item) => item.actionType === 'RANK_NEXT_COLLECTION'));
  assert.equal(before.autopilot.mutationsExecuted, false);

  const after = autopilot({
    incident: {
      id: INCIDENT_ID,
      label: 'Isolated golden-scenario incident',
      coordinate: [-8.61, 41.15],
      revision: 'revision:2',
      operationalTruth: { classification: 'DETECTION_CANDIDATE', priority: { whyRankedAboveNext: 'A second source family changed the evidence strength; official confirmation remains absent.' } }
    },
    intelligence: {
      mode: 'CONTROLLED_TEST_FIXTURE', snapshotVersion: 'snapshot:2', projectionHash: 'fixture:not-production:2',
      situation: { state: 'MULTI_FAMILY_SIGNAL_UNCONFIRMED', freshness: 'CURRENT', why: { independentPhysicalFamilies: ['VIIRS', 'FIELD_OBSERVATION'] } },
      unknowns: []
    },
    triggers: [{ id: 'trigger:family:golden', type: 'NEW_CAUSAL_SOURCE_FAMILY', observedAt: '2026-09-04T11:59:00.000Z', evidenceReferences: ['field:golden:1'] }],
    informationRequirements: [{ id: 'requirement:golden:independence', incidentId: INCIDENT_ID, state: 'SATISFIED', missingQuantity: 'Independent causal source family' }],
    collectionTasks: [activeCollection({ state: 'COMPLETED' })]
  });
  assert.equal(after.bindings.incidentRevision, 'revision:2');
  assert.deepEqual(after.livingTwin.sourceFamilies.value, ['VIIRS', 'FIELD_OBSERVATION']);
  assert.equal(after.autopilot.doingNow.length, 0);
  assert.ok(after.autopilot.nextActions.some((item) => item.actionType === 'RECOMPUTE_PRIORITY'));
  assert.equal(after.livingTwin.truth.value.classification, 'DETECTION_CANDIDATE');
  await emitGoldenReceipt(t, {
    scenarioId: 'GOLDEN_1', service: 'projectCrisisAutopilot', before, after,
    transitions: [
      { objectType: 'COLLECTION_TASK', objectId: 'task:golden:field', fromState: 'IN_PROGRESS', toState: 'COMPLETED' },
      { objectType: 'INCIDENT_REVISION', objectId: INCIDENT_ID, fromState: 'revision:1', toState: 'revision:2' }
    ],
    claims: ['COLLECTION_TASK_LINKED', 'DECISION_REVISION_RECORDED', 'AUTO_VERIFICATION_FALSE']
  });
});

test(SCENARIO_NAMES.GOLDEN_2, async (t) => {
  const observer = createFieldObserver({
    observerId: 'observer:golden:municipal', observerClass: 'MUNICIPAL_OPERATOR', verificationState: 'ROLE_ATTESTED',
    organizationId: 'municipality:golden', attestationReference: 'attestation:golden', attestedBy: 'field-control:golden',
    attestedAt: '2026-09-04T11:00:00.000Z'
  }, { now: new Date(AT) });
  const device = { deviceId: 'device:golden', ownerOperator: observer.observerId, timeQuality: 'SYNCED', observer };
  const task = createFieldVerificationTask({
    taskId: 'task:golden:road', incidentId: INCIDENT_ID, objective: 'Confirm road access from the designated safe point.', owner: 'municipal-team:golden',
    dueAt: '2026-09-04T12:30:00.000Z', acknowledgeBy: '2026-09-04T12:05:00.000Z', location: { type: 'Point', coordinates: [-8.61, 41.15] },
    safeZoneConstraint: { mode: 'KNOWN_SAFE_POINT', instruction: 'Remain at the designated safe point.', hazardExclusionM: 500 },
    targetObserverClasses: ['MUNICIPAL_OPERATOR'], expectedReportTypes: ['ROAD_ACCESS'], requiredEvidence: ['CURRENT_ACCESS_STATE', 'GNSS_POINT'],
    completionCriteria: 'One linked attributable ROAD_ACCESS observation is persisted.', linkedInformationRequirementId: 'requirement:golden:road'
  }, { now: new Date(AT), originNode: 'field-node:golden', authenticatedPrincipal: 'field-control:golden' });
  const acknowledgement = createFieldTaskAcknowledgement(task, {
    taskVersion: task.version, deviceId: device.deviceId, sessionId: 'session:golden', disposition: 'ACCEPTED', safetyState: 'SAFE_TO_PROCEED'
  }, { now: new Date(AT), originNode: 'field-node:golden', authenticatedPrincipal: 'field-control:golden', device });
  const report = createStructuredFieldReport({
    reportId: 'report:golden:road', reportType: 'ROAD_ACCESS', incidentId: INCIDENT_ID, deviceId: device.deviceId, sessionId: 'session:golden',
    observedAt: '2026-09-04T11:58:00.000Z', receivedAt: AT, connectivityAtCapture: 'OFFLINE',
    geometry: { type: 'Point', coordinates: [-8.61, 41.15] }, horizontalUncertaintyM: 8, rawEvidenceHash: sha256('golden-road-raw'),
    structuredAnswers: { roadId: 'road:N2:golden', accessState: 'RESTRICTED', vehicleClasses: ['EMERGENCY'], constraints: ['Smoke limits visibility.'], alternativeRouteKnown: 'YES' },
    linkedTaskId: task.taskId
  }, { now: new Date(AT), originNode: 'field-node:golden', authenticatedPrincipal: 'field-control:golden', device });
  const completion = createFieldTaskCompletion({ ...task, version: 2 }, {
    taskVersion: 2, evidenceObservationIds: [report.observationId]
  }, { now: new Date(AT), originNode: 'field-node:golden', authenticatedPrincipal: 'field-control:golden' });
  assert.equal(report.capture.connectivityAtCapture, 'OFFLINE');
  assert.equal(report.provenance.observerVerificationState, 'ROLE_ATTESTED');
  assert.equal(report.reportState, 'OBSERVATION_PENDING_GOVERNED_ADMISSION');
  assert.equal(report.privacy.containsPersonallyIdentifiableStaffData, false);
  assert.equal(acknowledgement.syncState, 'PENDING');
  assert.match(acknowledgement.truthBoundary, /does not prove task completion/);
  assert.deepEqual(completion.evidenceObservationIds, ['report:golden:road']);
  assert.match(completion.truthBoundary, /does not automatically admit/);
  const projected = autopilot({
    triggers: [{ id: 'trigger:field:golden', type: 'FIELD_OBSERVATION', observedAt: report.observedAt, evidenceReferences: [report.observationId] }]
  });
  assert.ok(projected.autopilot.nextActions.some((item) => item.actionType === 'RECOMPUTE_INCIDENT_TRUTH'));
  assert.equal(projected.truthBoundary.automaticTruthMutation, false);
  await emitGoldenReceipt(t, {
    scenarioId: 'GOLDEN_2', service: 'FieldNet field-report contracts + projectCrisisAutopilot', before: { task }, after: { acknowledgement, report, completion, projected },
    transitions: [
      { objectType: 'FIELD_TASK', objectId: task.taskId, fromState: 'ASSIGNED', toState: 'ACKNOWLEDGED', receiptReference: acknowledgement.acknowledgementId },
      { objectType: 'FIELD_OBSERVATION', objectId: report.observationId, fromState: 'OFFLINE_CAPTURED', toState: report.reportState, receiptReference: report.evidenceHash ?? report.rawEvidenceHash },
      { objectType: 'FIELD_TASK', objectId: task.taskId, fromState: 'ACKNOWLEDGED', toState: 'COMPLETION_RECORDED', receiptReference: completion.completionId ?? completion.evidenceHash },
      { objectType: 'INCIDENT_REEVALUATION', objectId: INCIDENT_ID, fromState: 'NOT_REQUESTED', toState: 'PROPOSED' }
    ],
    claims: ['OFFLINE_CAPTURE_RETAINED', 'TASK_ACKNOWLEDGEMENT_RECEIPT', 'ADMISSION_PENDING', 'REEVALUATION_TRIGGERED']
  });
});

test('invariant: public field observations remain unverified observations and public tasking is remote-only', () => {
  const observer = createFieldObserver({
    observerId: 'observer:golden:public', observerClass: 'PUBLIC', verificationState: 'UNVERIFIED'
  }, { now: new Date(AT) });
  const device = { deviceId: 'device:golden:public', ownerOperator: observer.observerId, timeQuality: 'SYNCED', observer };
  const report = createStructuredFieldReport({
    reportId: 'report:golden:public-smoke', reportType: 'FIRE_SMOKE', incidentId: INCIDENT_ID,
    deviceId: device.deviceId, sessionId: 'session:golden:public', observedAt: '2026-09-04T11:58:00.000Z', receivedAt: AT,
    connectivityAtCapture: 'ONLINE', geometry: { type: 'Point', coordinates: [-8.61, 41.15] }, horizontalUncertaintyM: 35,
    rawEvidenceHash: sha256('golden-public-smoke-raw'), structuredAnswers: { subjectId: 'smoke:golden', status: 'VISIBLE' }
  }, { now: new Date(AT), originNode: 'field-node:golden', authenticatedPrincipal: 'public-session:golden', device });
  assert.equal(observer.trustBand, 'UNVERIFIED');
  assert.equal(report.reportState, 'OBSERVATION_PENDING_GOVERNED_ADMISSION');
  assert.equal(report.provenance.observerVerificationState, 'UNVERIFIED');
  assert.match(report.truthBoundary, /not verified incident truth/i);
  assert.throws(() => createFieldObserver({
    observerId: 'observer:golden:public-invalid', observerClass: 'PUBLIC', verificationState: 'ROLE_ATTESTED',
    attestationReference: 'self:invalid', attestedBy: 'observer:golden:public-invalid', attestedAt: AT
  }, { now: new Date(AT) }), /public_observer_cannot_self_attest/);
  assert.throws(() => createFieldVerificationTask({
    taskId: 'task:golden:public-unsafe', incidentId: INCIDENT_ID, objective: 'Approach the incident.', owner: 'public:golden',
    dueAt: '2026-09-04T12:30:00.000Z', location: { type: 'Point', coordinates: [-8.61, 41.15] },
    safeZoneConstraint: { mode: 'KNOWN_SAFE_POINT', instruction: 'Approach the point.' }, targetObserverClasses: ['PUBLIC'],
    expectedReportTypes: ['FIRE_SMOKE'], requiredEvidence: ['VISUAL_REPORT'], completionCriteria: 'Submit a report.'
  }, { now: new Date(AT), originNode: 'field-node:golden', authenticatedPrincipal: 'field-control:golden' }), /public_field_task_must_be_remote_only/);
});
