import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { sha256 } from '../../../packages/domain/src/fieldnet/contracts.mjs';
import { FieldCapacityAdmissionService } from '../src/modules/fieldnet/field-capacity-admission-service.mjs';

const NOW = new Date('2026-09-04T15:00:00Z');

function observation(incidentId, observationId, evidence) {
  return {
    fieldReportContract: 'vigia.structured-field-report.v1',
    incidentId,
    observationId,
    reportType: 'HOSPITAL_CAPACITY_UPDATE',
    reportState: 'OBSERVATION_PENDING_GOVERNED_ADMISSION',
    claimedObservedAt: '2026-09-04T14:55:00Z',
    centralReceivedAt: '2026-09-04T14:56:00Z',
    centralRecordId: `central:${observationId}`,
    freshness: 'CURRENT_CENTRAL_RECEIPT',
    rawEvidenceHash: evidence,
    observerIdentity: {
      observerId: `observer:${observationId}`,
      observerClass: 'MUNICIPAL_OPERATOR',
      verificationState: 'ROLE_ATTESTED',
      trustBand: 'TRUSTED_ROLE_ATTESTED'
    },
    payload: {
      admissionState: 'OBSERVATION_PENDING_GOVERNED_ADMISSION',
      structuredAnswers: { facilityId: `hospital:${observationId}`, bedsAvailable: 1 }
    }
  };
}

async function fixture(t) {
  const directory = await mkdtemp(path.join(process.cwd(), '.tmp/test/field-capacity-binding-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'ledger.json');
  const first = observation('incident:one', 'observation:one', sha256('evidence:one'));
  const second = observation('incident:two', 'observation:two', sha256('evidence:two'));
  const observations = new Map([[first.incidentId, first], [second.incidentId, second]]);
  const snapshotForIncident = async (incidentId) => ({ incidentId, observations: observations.has(incidentId) ? [observations.get(incidentId)] : [] });
  const authorizeAdmission = ({ actor, scope, action, incidentId, truthEnvironment }) => ({
    authorized: actor?.authorized === true,
    scope,
    action,
    incidentId,
    truthEnvironment,
    principalId: actor?.id,
    authorityReference: 'authority:capacity:test'
  });
  const service = new FieldCapacityAdmissionService({ filePath, snapshotForIncident, authorizeAdmission, clock: () => NOW });
  await service.initialize();
  const actor = { id: 'operator:capacity:test', authorized: true };
  for (const report of [first, second]) {
    await service.admit(actor, {
      incidentId: report.incidentId,
      observationId: report.observationId,
      expectedReportType: report.reportType,
      expectedRawEvidenceHash: report.rawEvidenceHash,
      truthEnvironment: 'LIVE_OPERATIONAL',
      decisionReference: `decision:${report.observationId}`
    });
  }
  return { actor, filePath, service, snapshotForIncident, authorizeAdmission };
}

test('ledger initialization rejects a current index rebound to another incident and observation', async (t) => {
  const { filePath, snapshotForIncident, authorizeAdmission } = await fixture(t);
  const ledger = JSON.parse(await readFile(filePath, 'utf8'));
  const keys = Object.keys(ledger.current).sort();
  ledger.current[keys[0]].admissionReference = ledger.current[keys[1]].admissionReference;
  await writeFile(filePath, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');

  const reopened = new FieldCapacityAdmissionService({ filePath, snapshotForIncident, authorizeAdmission, clock: () => NOW });
  await assert.rejects(
    () => reopened.initialize(),
    (error) => error.message === 'field_capacity_admission_integrity_failed'
      && error.details.failures.some((failure) => failure.startsWith('CURRENT_BINDING_INVALID:'))
  );
});

test('ledger initialization rejects a revocation rebound to another admission', async (t) => {
  const { actor, filePath, service, snapshotForIncident, authorizeAdmission } = await fixture(t);
  const admissions = Object.values(JSON.parse(await readFile(filePath, 'utf8')).admissions).sort((left, right) => left.incidentId.localeCompare(right.incidentId));
  for (const [index, admission] of admissions.entries()) {
    await service.revoke(actor, {
      incidentId: admission.incidentId,
      observationId: admission.observationId,
      truthEnvironment: admission.truthEnvironment,
      admissionReference: admission.admissionReference,
      reasonCode: index === 0 ? 'SOURCE_RETRACTED' : 'SUPERSEDED',
      decisionReference: `decision:revoke:${index}`
    });
  }
  const ledger = JSON.parse(await readFile(filePath, 'utf8'));
  const keys = Object.keys(ledger.current).sort();
  ledger.current[keys[0]].revocationReference = ledger.current[keys[1]].revocationReference;
  await writeFile(filePath, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');

  const reopened = new FieldCapacityAdmissionService({ filePath, snapshotForIncident, authorizeAdmission, clock: () => NOW });
  await assert.rejects(
    () => reopened.initialize(),
    (error) => error.message === 'field_capacity_admission_integrity_failed'
      && error.details.failures.some((failure) => failure.startsWith('CURRENT_REVOCATION_BINDING_INVALID:'))
  );
});

test('state-key delimiter injection is rejected before admission lookup or persistence', async (t) => {
  const { actor, service } = await fixture(t);
  await assert.rejects(() => service.admit(actor, {
    incidentId: 'incident:one|LIVE_OPERATIONAL',
    observationId: 'observation:one',
    expectedReportType: 'HOSPITAL_CAPACITY_UPDATE',
    expectedRawEvidenceHash: sha256('evidence:one'),
    truthEnvironment: 'LIVE_OPERATIONAL'
  }), /field_capacity_incident_id_required/);
});
