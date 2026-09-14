import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { sha256 } from '../../../packages/domain/src/fieldnet/contracts.mjs';
import { FieldCapacityReportProvider } from '../../../packages/domain/src/fieldnet/capacity-report-provider.mjs';
import { FieldCapacityAdmissionService } from '../src/modules/fieldnet/field-capacity-admission-service.mjs';

const NOW = new Date('2026-09-04T15:00:00Z');
const EVIDENCE_HASH = sha256('hospital-capacity-source-evidence');

function observation(overrides = {}) {
  return {
    fieldReportContract: 'vigia.structured-field-report.v1',
    observationId: 'report:hospital:central:1',
    incidentId: 'incident:central:1',
    reportType: 'HOSPITAL_CAPACITY_UPDATE',
    reportState: 'OBSERVATION_PENDING_GOVERNED_ADMISSION',
    observedAt: '2026-09-04T14:55:00Z',
    claimedObservedAt: '2026-09-04T14:55:00Z',
    centralReceivedAt: '2026-09-04T14:56:00Z',
    centralRecordId: 'central-mutation:capacity:1',
    freshness: 'CURRENT_CENTRAL_RECEIPT',
    rawEvidenceHash: EVIDENCE_HASH,
    observerIdentity: {
      observerId: 'observer:health:opaque-1',
      observerClass: 'MUNICIPAL_OPERATOR',
      verificationState: 'ROLE_ATTESTED',
      trustBand: 'TRUSTED_ROLE_ATTESTED'
    },
    payload: {
      admissionState: 'OBSERVATION_PENDING_GOVERNED_ADMISSION',
      structuredAnswers: {
        facilityId: 'hospital:central:1',
        facilityName: 'Private free text intentionally stays in the source ledger',
        edStatus: 'OPERATIONAL',
        bedsAvailable: 6,
        icuAvailability: 'LIMITED',
        staffAvailable: { DOCTORS: 2, NURSES: 5 },
        ambulanceAccess: 'OPEN',
        acceptingPatients: 'YES',
        constraints: ['Free text intentionally stays in the source ledger.']
      },
      note: 'Never copy source-side free text into the admission ledger.'
    },
    ...overrides
  };
}

function authorized(context) {
  return {
    authorized: context.actor?.permissions?.includes('fieldnet:capacity-admit') === true,
    scope: context.scope,
    action: context.action,
    incidentId: context.incidentId,
    truthEnvironment: context.truthEnvironment,
    principalId: context.actor?.id,
    authorityReference: `authority:capacity:${context.truthEnvironment.toLowerCase()}`
  };
}

async function setup(t, { observations = [observation()], writer } = {}) {
  const directory = await mkdtemp(path.join(process.cwd(), '.tmp/test/field-capacity-admission-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'admissions.json');
  const snapshotForIncident = async (incidentId) => ({ incidentId, observations });
  const service = new FieldCapacityAdmissionService({ filePath, snapshotForIncident, authorizeAdmission: authorized, clock: () => NOW, writer });
  await service.initialize();
  return { directory, filePath, observations, service, snapshotForIncident };
}

function admissionInput(overrides = {}) {
  return {
    incidentId: 'incident:central:1',
    observationId: 'report:hospital:central:1',
    expectedReportType: 'HOSPITAL_CAPACITY_UPDATE',
    expectedRawEvidenceHash: EVIDENCE_HASH,
    truthEnvironment: 'LIVE_OPERATIONAL',
    decisionReference: 'decision:capacity:1',
    ...overrides
  };
}

const actor = { id: 'operator:capacity-admitter:1', displayName: 'Personal name must never persist', permissions: ['fieldnet:capacity-admit'] };

test('authorized admission is durable, idempotent, privacy-minimal and executable by the response provider', async (t) => {
  const { filePath, service, snapshotForIncident } = await setup(t);
  const first = await service.admit(actor, admissionInput());
  assert.equal(first.duplicate, false);
  assert.equal(first.admission.state, 'ADMITTED');
  assert.equal(first.admission.sourceReference, 'central-fieldnet-record:central-mutation:capacity:1');
  assert.equal(first.admission.truthEnvironment, 'LIVE_OPERATIONAL');
  assert.equal(first.admission.sourceEvidenceHash, EVIDENCE_HASH);
  const retry = await service.admit(actor, admissionInput());
  assert.equal(retry.duplicate, true);
  assert.equal(retry.admission.admissionReference, first.admission.admissionReference);

  const provider = new FieldCapacityReportProvider({
    clock: () => NOW,
    snapshotForIncident: async (incidentId, options) => service.decorateSnapshot(incidentId, await snapshotForIncident(incidentId, options))
  });
  const projection = await provider.listForIncident('incident:central:1');
  assert.equal(projection.items.length, 1);
  assert.equal(projection.items[0].facilityId, 'hospital:central:1');
  assert.equal(projection.items[0].bedsAvailable, 6);
  assert.equal(projection.items[0].admitted, true);

  const persisted = await readFile(filePath, 'utf8');
  assert.equal(persisted.includes(actor.displayName), false);
  assert.equal(persisted.includes('Private free text'), false);
  assert.equal(persisted.includes('Free text intentionally'), false);
  assert.equal(service.verifyIntegrity().valid, true);

  const reopened = new FieldCapacityAdmissionService({ filePath, snapshotForIncident, authorizeAdmission: authorized, clock: () => NOW });
  await reopened.initialize();
  assert.equal(reopened.admissionFor('incident:central:1', 'report:hospital:central:1').admissionReference, first.admission.admissionReference);
  assert.equal(reopened.status().liveAdmissions, 1);
  assert.equal(reopened.status().auditRecords, 1);
});

test('admission fails closed for absent authority, stale receipt, evidence mismatch and untrusted observers', async (t) => {
  const { service } = await setup(t);
  await assert.rejects(() => service.admit({ id: 'operator:unauthorized', permissions: [] }, admissionInput()), /field_capacity_admission_forbidden/);
  await assert.rejects(() => service.admit(actor, admissionInput({ expectedRawEvidenceHash: sha256('wrong') })), /field_capacity_evidence_hash_mismatch/);

  const stale = await setup(t, { observations: [observation({ freshness: 'STALE_AT_CENTRAL_RECEIPT' })] });
  await assert.rejects(() => stale.service.admit(actor, admissionInput()), /field_capacity_current_central_receipt_required/);
  const publicObserver = await setup(t, { observations: [observation({ observerIdentity: { observerId: 'observer:public:1', observerClass: 'PUBLIC', verificationState: 'UNVERIFIED', trustBand: 'UNVERIFIED' } })] });
  await assert.rejects(() => publicObserver.service.admit(actor, admissionInput()), /field_capacity_observer_not_role_attested/);
  assert.equal(service.status().liveAdmissions, 0);
});

test('live and isolated-exercise admissions cannot leak or dual-admit the same observation', async (t) => {
  const exerciseObservation = observation({ observationId: 'report:hospital:exercise:1', rawEvidenceHash: sha256('exercise-evidence') });
  const { service, snapshotForIncident } = await setup(t, { observations: [observation(), exerciseObservation] });
  await service.admit(actor, admissionInput({
    observationId: exerciseObservation.observationId,
    expectedRawEvidenceHash: exerciseObservation.rawEvidenceHash,
    truthEnvironment: 'ISOLATED_EXERCISE',
    decisionReference: 'exercise:decision:1'
  }));
  const raw = await snapshotForIncident('incident:central:1');
  const liveSnapshot = service.decorateSnapshot('incident:central:1', raw);
  assert.equal(liveSnapshot.observations.find((item) => item.observationId === exerciseObservation.observationId).capacityAdmission, undefined);
  const exerciseSnapshot = service.decorateSnapshot('incident:central:1', raw, { truthEnvironment: 'ISOLATED_EXERCISE' });
  assert.equal(exerciseSnapshot.observations.find((item) => item.observationId === exerciseObservation.observationId).capacityAdmission.truthEnvironment, 'ISOLATED_EXERCISE');
  await assert.rejects(() => service.admit(actor, admissionInput({ observationId: exerciseObservation.observationId, expectedRawEvidenceHash: exerciseObservation.rawEvidenceHash })), /field_capacity_cross_environment_admission_forbidden/);
  assert.equal(service.status().liveAdmissions, 0);
  assert.equal(service.status().isolatedExerciseAdmissions, 1);
});

test('governed revocation immediately removes capacity from the provider without deleting audit history', async (t) => {
  const { service, snapshotForIncident } = await setup(t);
  const admitted = await service.admit(actor, admissionInput());
  const revoked = await service.revoke(actor, {
    incidentId: 'incident:central:1', observationId: 'report:hospital:central:1', truthEnvironment: 'LIVE_OPERATIONAL',
    admissionReference: admitted.admission.admissionReference, reasonCode: 'SOURCE_RETRACTED', decisionReference: 'decision:capacity:revoke:1'
  });
  assert.equal(revoked.duplicate, false);
  const duplicate = await service.revoke(actor, {
    incidentId: 'incident:central:1', observationId: 'report:hospital:central:1', truthEnvironment: 'LIVE_OPERATIONAL',
    admissionReference: admitted.admission.admissionReference, reasonCode: 'SOURCE_RETRACTED', decisionReference: 'decision:capacity:revoke:1'
  });
  assert.equal(duplicate.duplicate, true);
  const provider = new FieldCapacityReportProvider({ snapshotForIncident: async (incidentId, options) => service.decorateSnapshot(incidentId, await snapshotForIncident(incidentId, options)) });
  const result = await provider.listForIncident('incident:central:1');
  assert.equal(result.items.length, 0);
  assert.equal(result.inspection.exclusionCounts.GOVERNED_ADMISSION_REQUIRED, 1);
  assert.equal(service.status().revokedAdmissions, 1);
  assert.equal(service.status().auditRecords, 2);
  assert.equal(service.verifyIntegrity().valid, true);
});

test('failed persistence cannot publish an in-memory admission and corrupt ledgers fail closed', async (t) => {
  const failing = await setup(t, { writer: async () => { throw new Error('simulated_persistence_failure'); } });
  await assert.rejects(() => failing.service.admit(actor, admissionInput()), /simulated_persistence_failure/);
  assert.equal(failing.service.status().liveAdmissions, 0);
  assert.equal(failing.service.status().auditRecords, 0);

  const { filePath, snapshotForIncident } = await setup(t);
  await writeFile(filePath, '{broken-json', 'utf8');
  const corrupt = new FieldCapacityAdmissionService({ filePath, snapshotForIncident, authorizeAdmission: authorized });
  await assert.rejects(() => corrupt.initialize(), /field_capacity_admission_ledger_corrupt/);
});
