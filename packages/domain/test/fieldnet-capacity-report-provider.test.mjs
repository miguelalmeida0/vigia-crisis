import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FIELD_CAPACITY_ADMISSION_CONTRACT,
  FieldCapacityReportProvider,
  evaluateFieldCapacityReportAdmission,
  projectAdmittedFieldCapacityReport
} from '../src/fieldnet/capacity-report-provider.mjs';

const NOW = new Date('2026-09-04T15:00:00Z');

function report(overrides = {}) {
  return {
    fieldReportContract: 'vigia.structured-field-report.v1',
    observationId: 'report:hospital:1',
    incidentId: 'incident:1',
    reportType: 'HOSPITAL_CAPACITY_UPDATE',
    reportState: 'OBSERVATION_PENDING_GOVERNED_ADMISSION',
    observedAt: '2026-09-04T14:55:00Z',
    observerIdentity: {
      observerId: 'observer:health:1',
      observerClass: 'MUNICIPAL_OPERATOR',
      verificationState: 'ROLE_ATTESTED',
      trustBand: 'TRUSTED_ROLE_ATTESTED'
    },
    payload: {
      admissionState: 'OBSERVATION_PENDING_GOVERNED_ADMISSION',
      structuredAnswers: {
        facilityId: 'hospital:1',
        facilityName: 'Hospital name is intentionally not projected',
        edStatus: 'LIMITED',
        bedsAvailable: 7,
        icuAvailability: 'UNKNOWN',
        staffAvailable: { DOCTORS: 2, NURSES: 6 },
        ambulanceAccess: 'OPEN',
        acceptingPatients: 'YES',
        constraints: ['Free text must not cross the projection boundary.'],
        nextExpectedUpdate: '2026-09-04T15:15:00Z'
      },
      note: 'Source-side note must not cross the projection boundary.'
    },
    ...overrides
  };
}

function admission(overrides = {}) {
  return {
    schemaVersion: 'vigia.field-capacity-admission.v1',
    state: 'ADMITTED',
    scope: 'AGGREGATE_OPERATIONAL_CAPACITY',
    truthEnvironment: 'LIVE_OPERATIONAL',
    incidentId: 'incident:1',
    observationId: 'report:hospital:1',
    reportType: 'HOSPITAL_CAPACITY_UPDATE',
    admissionReference: 'admission:capacity:1',
    sourceReference: 'fieldnet-observation:report:hospital:1',
    authorityReference: 'authority:capacity-admission:regional',
    admittedBy: 'operator:admission:1',
    admittedAt: '2026-09-04T14:58:00Z',
    ...overrides
  };
}

test('pending, synced, or trusted reports do not become operational capacity without separate admission', () => {
  const pending = report();
  assert.equal(projectAdmittedFieldCapacityReport(pending, { incidentId: 'incident:1', now: NOW }), null);
  assert.deepEqual(evaluateFieldCapacityReportAdmission(pending, { incidentId: 'incident:1', now: NOW }), {
    admitted: false,
    item: null,
    reasonCode: 'GOVERNED_ADMISSION_REQUIRED',
    observationId: 'report:hospital:1'
  });
  assert.equal(projectAdmittedFieldCapacityReport({ ...pending, syncState: 'ACKNOWLEDGED' }, { incidentId: 'incident:1', now: NOW }), null);
});

test('exact central admission projects only allowlisted aggregate hospital capacity', () => {
  const projected = projectAdmittedFieldCapacityReport({ ...report(), capacityAdmission: admission() }, { incidentId: 'incident:1', now: NOW });
  assert.equal(projected.facilityId, 'hospital:1');
  assert.equal(projected.state, 'FIELD_REPORTED');
  assert.equal(projected.admitted, true);
  assert.equal(projected.admissionReference, 'admission:capacity:1');
  assert.equal(projected.source.reference, 'fieldnet-observation:report:hospital:1');
  assert.deepEqual(projected.staffAvailable, { DOCTORS: 2, NURSES: 6, EMERGENCY_STAFF: null, CRITICAL_CARE_STAFF: null });
  assert.equal(projected.reporterRole, 'MUNICIPAL_OPERATOR');
  assert.equal('note' in projected, false);
  assert.deepEqual(projected.constraints, ['Free text must not cross the projection boundary.']);
  assert.equal('facilityName' in projected, false);
  assert.equal('geometry' in projected, false);
});

test('operational constraint lists reject embedded contact details at the admission boundary', () => {
  const candidate = report();
  candidate.payload.structuredAnswers.constraints = ['Access restricted', 'Call +351 912 345 678', 'operator@example.org'];
  const projected = projectAdmittedFieldCapacityReport({ ...candidate, capacityAdmission: admission() }, { incidentId: 'incident:1', now: NOW });
  assert.deepEqual(projected.constraints, ['Access restricted']);
  assert.doesNotMatch(JSON.stringify(projected), /912 345 678|operator@example/);
});

test('projection rejects weak observer identity, cross-incident bindings, incomplete provenance and future admission', () => {
  const cases = [
    [report({ observerIdentity: { observerClass: 'PUBLIC', verificationState: 'UNVERIFIED', trustBand: 'UNVERIFIED' }, capacityAdmission: admission() }), 'OBSERVER_NOT_ROLE_ATTESTED'],
    [report({ capacityAdmission: admission({ incidentId: 'incident:other' }) }), 'ADMISSION_BINDING_MISMATCH'],
    [report({ capacityAdmission: admission({ authorityReference: null }) }), 'ADMISSION_PROVENANCE_INCOMPLETE'],
    [report({ capacityAdmission: admission({ admittedAt: '2026-09-04T15:00:01Z' }) }), 'ADMISSION_CHRONOLOGY_INVALID']
  ];
  for (const [candidate, reasonCode] of cases) {
    assert.equal(evaluateFieldCapacityReportAdmission(candidate, { incidentId: 'incident:1', now: NOW }).reasonCode, reasonCode);
  }
});

test('provider emits admitted hospital and fire capacity with an auditable exclusion inventory', async () => {
  const fire = report({
    observationId: 'report:station:1',
    reportType: 'FIRE_STATION_CAPACITY_UPDATE',
    observedAt: '2026-09-04T14:56:00Z',
    payload: { structuredAnswers: {
      stationId: 'station:1', crewsAvailable: 2, crewSize: 5, enginesAvailable: 1, tankersAvailable: null,
      estimatedMobilizationMinutes: 8, commandVehiclesAvailable: 1, specialistTeamsAvailable: 1,
      alreadyCommittedResources: { CREWS: 1 }, specialistCapabilities: ['WILDFIRE'], communicationsStatus: 'OPERATIONAL',
      constraints: ['Narrow appliance access.'], nextExpectedUpdate: '2026-09-04T15:10:00Z'
    } },
    capacityAdmission: admission({
      observationId: 'report:station:1', reportType: 'FIRE_STATION_CAPACITY_UPDATE', admissionReference: 'admission:capacity:2',
      sourceReference: 'fieldnet-observation:report:station:1'
    })
  });
  const provider = new FieldCapacityReportProvider({
    clock: () => NOW,
    snapshotForIncident: async (incidentId) => ({ incidentId, observations: [
      report({ observationId: 'report:hospital:pending', payload: { ...report().payload, structuredAnswers: { ...report().payload.structuredAnswers, facilityId: 'hospital:pending' } } }),
      { ...report(), capacityAdmission: admission() },
      fire
    ] })
  });
  const result = await provider.listForIncident('incident:1');
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items.map((item) => item.facilityId), ['hospital:1', 'station:1']);
  assert.equal(result.items[1].crewsAvailable, 2);
  assert.equal(result.items[1].tankersAvailable, null);
  assert.equal(result.items[1].commandVehiclesAvailable, 1);
  assert.deepEqual(result.items[1].alreadyCommittedResources, { CREWS: 1 });
  assert.deepEqual(result.items[1].specialistCapabilities, ['WILDFIRE']);
  assert.deepEqual(result.items[1].constraints, ['Narrow appliance access.']);
  assert.equal(result.items[1].nextExpectedUpdate, '2026-09-04T15:10:00Z');
  assert.equal(result.inspection.capacityObservationsInspected, 3);
  assert.equal(result.inspection.excludedReports, 1);
  assert.equal(result.inspection.exclusionCounts.GOVERNED_ADMISSION_REQUIRED, 1);
  assert.deepEqual(result.sourceAvailability, {});
  assert.equal(result.admissionProjection.state, 'CONNECTED');
  assert.equal(result.admissionProjection.taskingConnectorState, 'NOT_ASSERTED');
});

test('provider rejects a snapshot that is not bound to the requested incident', async () => {
  const provider = new FieldCapacityReportProvider({ snapshotForIncident: async () => ({ incidentId: 'incident:other', observations: [] }) });
  await assert.rejects(() => provider.listForIncident('incident:1'), /field_capacity_snapshot_scope_mismatch/);
  assert.deepEqual(FIELD_CAPACITY_ADMISSION_CONTRACT.requiredBindings, ['incidentId', 'observationId', 'reportType', 'truthEnvironment']);
});

test('provider exhausts central observation collection pages and fails closed on a stalled cursor', async () => {
  const calls = [];
  const admitted = { ...report(), capacityAdmission: admission() };
  const provider = new FieldCapacityReportProvider({
    snapshotForIncident: async (incidentId, options) => {
      calls.push(options);
      return options.collectionCursors.observations
        ? { incidentId, observations: [admitted], collectionPages: { observations: { hasMore: false, nextCursor: 'page:2' } } }
        : { incidentId, observations: [report({ observationId: 'report:hospital:pending-page' })], collectionPages: { observations: { hasMore: true, nextCursor: 'page:1' } } };
    }
  });
  const result = await provider.listForIncident('incident:1');
  assert.equal(result.items.length, 1);
  assert.equal(result.inspection.pagesRead, 2);
  assert.equal(calls.every((call) => call.afterCursor === Number.MAX_SAFE_INTEGER && call.limit === 250), true);

  const stalled = new FieldCapacityReportProvider({
    snapshotForIncident: async (incidentId) => ({ incidentId, observations: [], collectionPages: { observations: { hasMore: true, nextCursor: '' } } })
  });
  await assert.rejects(() => stalled.listForIncident('incident:1'), /field_capacity_snapshot_cursor_stalled/);
});

test('live providers never project isolated exercise admissions', async () => {
  const exercise = { ...report(), capacityAdmission: admission({ truthEnvironment: 'ISOLATED_EXERCISE' }) };
  const snapshotForIncident = async (incidentId) => ({ incidentId, observations: [exercise] });
  const live = await new FieldCapacityReportProvider({ snapshotForIncident }).listForIncident('incident:1');
  assert.equal(live.items.length, 0);
  assert.equal(live.inspection.exclusionCounts.TRUTH_ENVIRONMENT_MISMATCH, 1);
  const isolated = await new FieldCapacityReportProvider({ snapshotForIncident, truthEnvironment: 'ISOLATED_EXERCISE' }).listForIncident('incident:1');
  assert.equal(isolated.items.length, 1);
  assert.equal(isolated.truthEnvironment, 'ISOLATED_EXERCISE');
});
