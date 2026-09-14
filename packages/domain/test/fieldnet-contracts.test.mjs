import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFieldIncidentPackage,
  createFieldSensorRegistration,
  qualifyProductionFieldSensor,
  createFieldObservation,
  priorityDisposition,
  sha256,
  sourceFreshness,
  verifyIncidentPackage
} from '../src/fieldnet/contracts.mjs';
import { appendConflictResolutionEvidence, compareTaskMutation, createConflictResolutionPlan, observationRelationship } from '../src/fieldnet/reconciliation.mjs';

test('bounded incident package is hash-bound and canonical-event bound', () => {
  const pkg = createFieldIncidentPackage({ incidentId: 'incident:real-1', createdAt: '2026-08-13T12:00:00Z' });
  assert.equal(verifyIncidentPackage(pkg), true);
  assert.throws(() => verifyIncidentPackage({ ...pkg, incidentState: { changed: true } }), /hash_mismatch/);
  assert.throws(() => verifyIncidentPackage({ ...pkg, canonicalEventId: 'other' }), /invalid_incident_package/);
});

test('human observations remain local reports and preserve clock/freshness quality', () => {
  const observation = createFieldObservation({
    observationId: 'obs:1', incidentId: 'incident:1', deviceId: 'device:1', observerIdentity: 'shadow:operator-a',
    observedAt: '2026-08-13T10:00:00Z', receivedAt: '2026-08-13T10:30:00Z', deviceClockQuality: 'SKEWED',
    geometry: { type: 'Point', coordinates: [-7, 40] }, horizontalUncertaintyM: 25, observationType: 'FIELD_NOTE',
    rawEvidenceHash: sha256('controlled-exercise-note'), sourceIdentity: { kind: 'HUMAN' }
  }, { originNode: 'field:1' });
  assert.equal(observation.freshness, 'STALE_AT_RECEIPT');
  assert.equal(observation.deviceClockQuality, 'SKEWED');
  assert.equal(observation.physicalFamilyQualification, 'HUMAN_FIELD_REPORT_NOT_PHYSICAL_SENSOR_FAMILY');
});

test('field observations reject impossible future chronology instead of appearing current', () => {
  assert.throws(() => createFieldObservation({
    observationId: 'obs:future', incidentId: 'incident:1', deviceId: 'device:1', observerIdentity: 'shadow:operator-a',
    observedAt: '2026-08-13T10:01:00Z', receivedAt: '2026-08-13T10:00:00Z', geometry: { type: 'Point', coordinates: [-7, 40] },
    horizontalUncertaintyM: 25, observationType: 'FIELD_NOTE', rawEvidenceHash: sha256('future-note'), sourceIdentity: { kind: 'HUMAN' }
  }, { originNode: 'field:1' }), /field_observation_future_timestamp/);
});

test('cached regional freshness cannot become current-local and bandwidth priorities are explicit', () => {
  const freshness = sourceFreshness({ sourceFamily: 'viirs', lastReceivedAt: '2026-08-13T11:59:00Z', freshnessContractMs: 120_000 }, { now: new Date('2026-08-13T12:00:00Z') });
  assert.equal(freshness.state, 'LAST_KNOWN_WITHIN_CONTRACT');
  assert.match(freshness.qualification, /never CURRENT_LOCAL/);
  assert.equal(priorityDisposition('P1_COMMAND', 'LOW_BANDWIDTH'), 'SEND_IMMEDIATELY');
  assert.equal(priorityDisposition('P4_TELEMETRY', 'LOW_BANDWIDTH'), 'BATCH');
  assert.equal(priorityDisposition('P6_BULK_MEDIA', 'LOW_BANDWIDTH'), 'DEFER');
  assert.equal(priorityDisposition('P0_LIFE_SAFETY', 'ISOLATED'), 'QUEUE_LOCAL');
});

test('causal task reconciliation preserves concurrent authoritative edits as conflict', () => {
  const task = { taskId: 'task:1', incidentId: 'incident:1', version: 3, state: 'IN_PROGRESS', owner: 'shadow:a', priority: 'P1_COMMAND' };
  const result = compareTaskMutation({ task, baseVersion: 2, actor: 'shadow:b', mutationId: 'mutation:b', changes: { state: 'BLOCKED' } });
  assert.equal(result.outcome, 'CONFLICT');
  assert.deepEqual(result.conflictingFields, ['state']);
  assert.equal(result.conflict.resolutionRequirement, 'HUMAN_REQUIRED');
  assert.equal(observationRelationship({ payload: { subjectKey: 'road:1', claimField: 'access', claimValue: 'OPEN' } }, { payload: { subjectKey: 'road:1', claimField: 'access', claimValue: 'BLOCKED' } }), 'CONTRADICTS');
});

test('field sensor qualification requires every independent evidence gate', () => {
  const base={sensorId:'sensor:one',hardwareIdentity:'hardware:one',stableHardwareIdentity:true,sensorFamily:'THERMAL',measurementType:'SURFACE_TEMPERATURE',unit:'degC',calibration:{status:'CALIBRATED',recordId:'cal:1',calibratedAt:'2026-08-01T00:00:00Z'},location:{verified:true,geometry:{type:'Point',coordinates:[-7,40]}},time:{quality:'SYNCED',source:'GNSS'},samplingIntervalMs:1000,freshnessContractMs:10_000,rawPayloadPolicy:'PRESERVE',failureMode:{independentFromRegionalSources:true},mode:'PRODUCTION'};
  const qualified=createFieldSensorRegistration(base,{originNode:'field:test',now:new Date('2026-08-13T10:00:00Z')});
  assert.equal(qualified.currentQualification,'QUALIFIED_FIELD_SENSOR');
  assert.equal(qualified.physicalFamilyEligible,true);
  const uncalibrated=createFieldSensorRegistration({...base,sensorId:'sensor:two',calibration:{status:'UNKNOWN'}},{originNode:'field:test',now:new Date('2026-08-13T10:00:00Z')});
  assert.equal(uncalibrated.currentQualification,'CALIBRATION_UNKNOWN');
  assert.equal(uncalibrated.physicalFamilyEligible,false);
  const exercise=createFieldSensorRegistration({...base,sensorId:'sensor:exercise',mode:'EXERCISE'},{originNode:'field:test',now:new Date('2026-08-13T10:00:00Z')});
  assert.notEqual(exercise.currentQualification,'QUALIFIED_FIELD_SENSOR');
});

test('central production gate refuses absent hardware and requires fresh held-out validation', () => {
  const absent=qualifyProductionFieldSensor({hardwareInventory:{sensorHardware:'NOT_PRESENT'},now:new Date('2026-08-14T10:00:00Z')});
  assert.equal(absent.state,'HARDWARE_NOT_PRESENT');
  assert.equal(absent.physicalFamilyEligible,false);
  const registration=createFieldSensorRegistration({sensorId:'sensor:prod',hardwareIdentity:'hardware:prod',stableHardwareIdentity:true,sensorFamily:'THERMAL',measurementType:'SURFACE_TEMPERATURE',unit:'degC',calibration:{status:'CALIBRATED',recordId:'cal:prod',calibratedAt:'2026-08-01T00:00:00Z',validUntil:'2026-09-01T00:00:00Z'},location:{verified:true,geometry:{type:'Point',coordinates:[-7,40]}},time:{quality:'SYNCED',source:'GNSS'},samplingIntervalMs:1000,freshnessContractMs:10_000,rawPayloadPolicy:'PRESERVE',failureMode:{independentFromRegionalSources:true},mode:'PRODUCTION',lastSeenAt:'2026-08-14T09:59:55Z'},{originNode:'field:prod',now:new Date('2026-08-14T09:59:55Z')});
  const qualified=qualifyProductionFieldSensor({hardwareInventory:{sensorHardware:'PRESENT'},registration,heldOutValidation:{state:'MEASURED',split:'HELD_OUT',denominator:50,passed:true},now:new Date('2026-08-14T10:00:00Z')});
  assert.equal(qualified.state,'PRODUCTION_QUALIFIED');
  assert.equal(qualified.physicalFamilyEligible,true);
  const unvalidated=qualifyProductionFieldSensor({hardwareInventory:{sensorHardware:'PRESENT'},registration,now:new Date('2026-08-14T10:00:00Z')});
  assert.equal(unvalidated.blockers.includes('HELD_OUT_VALIDATION_REQUIRED'),true);
});

test('conflict planning never selects a winner and preserves insufficient evidence', () => {
  const conflict={conflictId:'conflict:1',incidentId:'incident:1',subjectType:'FIELD_TASK',subjectId:'task:1',conflictingFields:['state'],versions:[{origin:'regional',version:3,values:{state:'IN_PROGRESS'}},{origin:'field-a',version:2,values:{state:'BLOCKED'}}]};
  const plan=createConflictResolutionPlan(conflict,{now:new Date('2026-08-14T10:00:00Z')});
  assert.equal(plan.state,'OPEN_PRESERVED');
  assert.equal('winner' in plan,false);
  const preserved=appendConflictResolutionEvidence(plan,{evidenceId:'observation:weak',observedAt:'2026-08-14T10:01:00Z',coveredDimensions:['state'],sourceQualification:'UNASSESSED',independentFailureMode:false},{now:new Date('2026-08-14T10:02:00Z')});
  assert.equal(preserved.state,'PRESERVED_UNRESOLVED');
  assert.equal(preserved.resolvedValue,null);
  const resolved=appendConflictResolutionEvidence(plan,{evidenceId:'observation:qualified',observedAt:'2026-08-14T10:03:00Z',coveredDimensions:['state'],sourceQualification:'QUALIFIED',independentFailureMode:true,resolvedValue:'BLOCKED'},{now:new Date('2026-08-14T10:04:00Z')});
  assert.equal(resolved.state,'RESOLVED_BY_NEW_ATTRIBUTABLE_EVIDENCE');
  assert.equal(resolved.originalValuesModified,false);
});
