import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256 } from '../src/fieldnet/contracts.mjs';
import {
  FIELD_OBSERVER_CLASSES,
  FIELD_REPORT_TYPES,
  createFieldObserver,
  createFieldTaskAcknowledgement,
  createFieldTaskCompletion,
  createFieldVerificationTask,
  createStructuredFieldReport
} from '../src/fieldnet/field-reports.mjs';

const NOW = new Date('2026-09-04T12:00:00Z');
const observer = createFieldObserver({
  observerId: 'observer:municipal:17',
  observerClass: 'MUNICIPAL_OPERATOR',
  verificationState: 'ROLE_ATTESTED',
  organizationId: 'municipality:17',
  attestationReference: 'role-attestation:17',
  attestedBy: 'fieldnet-control:regional',
  attestedAt: '2026-09-04T11:00:00Z'
}, { now: NOW });
const device = { deviceId: 'device:field:17', ownerOperator: observer.observerId, timeQuality: 'SYNCED', observer };

function report(overrides = {}) {
  return createStructuredFieldReport({
    reportId: 'report:road:17',
    reportType: 'ROAD_ACCESS',
    incidentId: 'incident:17',
    deviceId: device.deviceId,
    sessionId: 'session:17',
    observedAt: '2026-09-04T11:58:00Z',
    receivedAt: '2026-09-04T12:00:00Z',
    connectivityAtCapture: 'OFFLINE',
    geometry: { type: 'Point', coordinates: [-8.61, 41.15] },
    horizontalUncertaintyM: 8,
    rawEvidenceHash: sha256('road-17-raw'),
    structuredAnswers: {
      roadId: 'road:N2:segment-17',
      roadName: 'N2',
      accessState: 'RESTRICTED',
      vehicleClasses: ['LIGHT', 'EMERGENCY'],
      constraints: ['Smoke reduces visibility.'],
      alternativeRouteKnown: 'YES'
    },
    ...overrides
  }, { now: NOW, originNode: 'field-node:17', authenticatedPrincipal: 'field-control:17', device });
}

test('trusted observer classes are explicit and role trust requires attributable attestation', () => {
  assert.deepEqual(FIELD_OBSERVER_CLASSES, [
    'AUTHORIZED_RESPONDER', 'MUNICIPAL_OPERATOR', 'UTILITY_OPERATOR', 'TRAINED_VOLUNTEER',
    'RESEARCH_PARTNER', 'PUBLIC', 'AUTOMATED_SENSOR'
  ]);
  assert.equal(observer.trustBand, 'TRUSTED_ROLE_ATTESTED');
  assert.equal(observer.privacyClassification, 'OPAQUE_OPERATIONAL_IDENTITY_NO_PII');
  assert.throws(() => createFieldObserver({ observerId:'observer:false', observerClass:'AUTHORIZED_RESPONDER', verificationState:'ROLE_ATTESTED' }), /attestation_required/);
  assert.throws(() => createFieldObserver({ observerId:'observer:public', observerClass:'PUBLIC', verificationState:'ROLE_ATTESTED', attestationReference:'self', attestedBy:'self' }), /public_observer_cannot_self_attest/);
});

test('ROAD_ACCESS remains an attributable observation with capture, provenance and admission boundaries', () => {
  const value = report();
  assert.equal(value.observationType, 'ROAD_ACCESS');
  assert.equal(value.payload.subjectKey, 'road:N2:segment-17');
  assert.equal(value.payload.claimValue, 'RESTRICTED');
  assert.equal(value.capture.connectivityAtCapture, 'OFFLINE');
  assert.equal(value.capture.gpsAccuracyM, 8);
  assert.equal(value.provenance.observerVerificationState, 'ROLE_ATTESTED');
  assert.equal(value.reportState, 'OBSERVATION_PENDING_GOVERNED_ADMISSION');
  assert.equal(value.privacy.containsPersonallyIdentifiableStaffData, false);
  assert.match(value.truthBoundary, /not verified incident truth/);
});

test('hospital and fire-station forms preserve unknowns, accept aggregate operational counts, and reject PII/headcount leakage', () => {
  const hospital = createStructuredFieldReport({
    reportId:'report:hospital:17', reportType:'HOSPITAL_CAPACITY_UPDATE', incidentId:'incident:17', deviceId:device.deviceId, sessionId:'session:17',
    observedAt:'2026-09-04T11:58:00Z', receivedAt:'2026-09-04T12:00:00Z', connectivityAtCapture:'ONLINE', geometry:{type:'Point',coordinates:[-8.6,41.1]}, horizontalUncertaintyM:5,
    rawEvidenceHash:sha256('hospital-17-raw'), structuredAnswers:{facilityId:'hospital:17',facilityName:'Hospital 17',edStatus:'OPERATIONAL',bedsAvailable:null,icuAvailability:'UNKNOWN',staffAvailable:{doctors:2,nurses:6},ambulanceAccess:'OPEN',acceptingPatients:'YES',nextExpectedUpdate:'2026-09-04T12:30:00Z'}
  }, { now:NOW, originNode:'field-node:17', authenticatedPrincipal:'field-control:17', device });
  assert.equal(hospital.payload.structuredAnswers.bedsAvailable, null);
  assert.deepEqual(hospital.payload.structuredAnswers.staffAvailable, { DOCTORS:2, NURSES:6 });
  const fire = createStructuredFieldReport({
    reportId:'report:station:17', reportType:'FIRE_STATION_CAPACITY_UPDATE', incidentId:'incident:17', deviceId:device.deviceId, sessionId:'session:17',
    observedAt:'2026-09-04T11:59:00Z', receivedAt:'2026-09-04T12:00:00Z', connectivityAtCapture:'DEGRADED', geometry:{type:'Point',coordinates:[-8.62,41.14]}, horizontalUncertaintyM:7,
    rawEvidenceHash:sha256('station-17-raw'), structuredAnswers:{stationId:'station:17',crewsAvailable:2,crewSize:5,enginesAvailable:1,tankersAvailable:1,specialistCapabilities:['WILDFIRE'],estimatedMobilizationMinutes:8,alreadyCommittedResources:{crews:1},communicationsStatus:'DEGRADED'}
  }, { now:NOW, originNode:'field-node:17', authenticatedPrincipal:'field-control:17', device });
  assert.equal(fire.payload.structuredAnswers.crewsAvailable, 2);
  assert.deepEqual(fire.payload.structuredAnswers.alreadyCommittedResources, { CREWS:1 });
  assert.throws(() => createStructuredFieldReport({
    ...hospital,
    reportId:'report:pii:17', observationId:undefined,
    structuredAnswers:{facilityId:'hospital:17',edStatus:'OPERATIONAL',staffAvailable:{'Dr Alice':1}}
  }, { now:NOW, originNode:'field-node:17', authenticatedPrincipal:'field-control:17', device }), /hospital_capacity_staff_counts_invalid/);
  assert.throws(() => report({ reportId:'report:pii-note:17', note:'Call responder at +351 912 345 678.' }), /field_report_pii_rejected/);
});

test('all FieldNet Lite report types have a governed contract and automated sensors stay on the sensor gateway', () => {
  assert.deepEqual(FIELD_REPORT_TYPES, [
    'FIRE_SMOKE', 'ROAD_ACCESS', 'COMMUNITY_STATUS', 'RESOURCE_STATUS', 'INFRASTRUCTURE',
    'FIELD_BOUNDARY_POINT', 'PROTECTION_ACK', 'OTHER', 'HOSPITAL_CAPACITY_UPDATE', 'FIRE_STATION_CAPACITY_UPDATE'
  ]);
  const automated = createFieldObserver({ observerId:'sensor:17', observerClass:'AUTOMATED_SENSOR', verificationState:'UNVERIFIED' }, { now:NOW });
  assert.throws(() => createStructuredFieldReport({
    reportId:'report:sensor:17', reportType:'OTHER', incidentId:'incident:17', deviceId:'sensor-device:17', sessionId:'session:17', observedAt:'2026-09-04T11:59:00Z', connectivityAtCapture:'ONLINE', geometry:{type:'Point',coordinates:[-8.6,41.1]}, horizontalUncertaintyM:1, rawEvidenceHash:sha256('sensor'), structuredAnswers:{subjectId:'subject:17',status:'SEEN'}
  }, { now:NOW, originNode:'field-node:17', authenticatedPrincipal:'field-control:17', device:{deviceId:'sensor-device:17',ownerOperator:'sensor:17',timeQuality:'SYNCED',observer:automated} }), /must_use_sensor_gateway/);
});

test('two-way verification tasking enforces safe-zone, deadline, owner, evidence and acknowledgement semantics', () => {
  const task = createFieldVerificationTask({
    taskId:'task:road:17', incidentId:'incident:17', objective:'Confirm whether N2 is passable from the municipal observation point.', owner:'team:municipal:17',
    dueAt:'2026-09-04T12:20:00Z', acknowledgeBy:'2026-09-04T12:05:00Z', location:{type:'Point',coordinates:[-8.61,41.15]},
    safeZoneConstraint:{mode:'KNOWN_SAFE_POINT',instruction:'Remain at the municipal observation point and do not approach smoke.',hazardExclusionM:500},
    targetObserverClasses:['MUNICIPAL_OPERATOR'], expectedReportTypes:['ROAD_ACCESS'], requiredEvidence:['CURRENT_ACCESS_STATE','GNSS_POINT'], completionCriteria:'One linked attributable ROAD_ACCESS report is persisted.'
  }, { now:NOW, originNode:'field-node:17', authenticatedPrincipal:'field-control:17' });
  assert.equal(task.state, 'ASSIGNED');
  assert.equal(task.acknowledgementPolicy.required, true);
  assert.match(task.authorityBoundary, /not dispatch authority/);
  const acknowledgement = createFieldTaskAcknowledgement(task, { taskVersion:1, deviceId:device.deviceId, sessionId:'session:17', disposition:'ACCEPTED', safetyState:'SAFE_TO_PROCEED' }, { now:NOW, originNode:'field-node:17', authenticatedPrincipal:'field-control:17', device });
  assert.equal(acknowledgement.disposition, 'ACCEPTED');
  assert.match(acknowledgement.truthBoundary, /does not prove task completion/);
  assert.throws(() => createFieldTaskAcknowledgement(task, { taskVersion:1, deviceId:device.deviceId, sessionId:'session:17', disposition:'ACCEPTED', safetyState:'CANNOT_ASSESS' }, { now:NOW, originNode:'field-node:17', authenticatedPrincipal:'field-control:17', device }), /requires_safe_to_proceed/);
  const completion = createFieldTaskCompletion({ ...task, version:2 }, { taskVersion:2, evidenceObservationIds:['report:road:17'] }, { now:NOW, originNode:'field-node:17', authenticatedPrincipal:'field-control:17' });
  assert.deepEqual(completion.evidenceObservationIds, ['report:road:17']);
  assert.match(completion.truthBoundary, /does not automatically admit/);
});

test('public tasking is remote-only and cannot include a hazard-directed location', () => {
  const base = {
    taskId:'task:public:17',incidentId:'incident:17',objective:'Confirm whether the official warning was received.',owner:'team:public-information:17',dueAt:'2026-09-04T12:20:00Z',
    safeZoneConstraint:{mode:'REMOTE_ONLY',instruction:'Respond only from your present safe location.'},targetObserverClasses:['PUBLIC'],expectedReportTypes:['PROTECTION_ACK'],requiredEvidence:['WARNING_RECEIPT'],completionCriteria:'One linked receipt observation is persisted.'
  };
  assert.doesNotThrow(() => createFieldVerificationTask(base, { now:NOW, originNode:'field-node:17', authenticatedPrincipal:'field-control:17' }));
  assert.throws(() => createFieldVerificationTask({ ...base, taskId:'task:public:unsafe', location:{type:'Point',coordinates:[-8.6,41.1]} }, { now:NOW, originNode:'field-node:17', authenticatedPrincipal:'field-control:17' }), /must_be_remote_only/);
});
