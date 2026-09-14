import { canonical, sha256, stableId } from '../../../../../packages/domain/src/fieldnet/contracts.mjs';
import { assertNoDefaultFieldPii } from '../../../../../packages/domain/src/fieldnet/field-reports.mjs';
import {
  FIELD_CAPACITY_ADMISSION_SCHEMA,
  FIELD_CAPACITY_ADMISSION_SCOPE,
  FIELD_CAPACITY_AUTHORIZATION_SCOPE,
  FIELD_CAPACITY_REPORT_TYPES,
  FIELD_CAPACITY_REVOCATION_SCHEMA,
  fieldCapacityIso,
  fieldCapacityOpaque
} from './field-capacity-admission-ledger.mjs';

export async function authorizeFieldCapacityDecision(authorizeAdmission, actor, context) {
  const authorization = await authorizeAdmission({ actor, ...context, scope: FIELD_CAPACITY_AUTHORIZATION_SCOPE });
  if (authorization?.authorized !== true || authorization.scope !== FIELD_CAPACITY_AUTHORIZATION_SCOPE || authorization.action !== context.action || String(authorization.incidentId) !== context.incidentId || authorization.truthEnvironment !== context.truthEnvironment) {
    throw Object.assign(new Error('field_capacity_admission_forbidden'), { statusCode: 403 });
  }
  return {
    principalId: fieldCapacityOpaque(authorization.principalId, 'field_capacity_authorized_principal_required'),
    authorityReference: fieldCapacityOpaque(authorization.authorityReference, 'field_capacity_authority_reference_required')
  };
}

export function assertAdmissibleCapacityObservation(observation, expected, { clock, maxObservationAgeMs }) {
  if (String(observation.incidentId) !== expected.incidentId || String(observation.observationId) !== expected.observationId) throw new Error('field_capacity_observation_binding_mismatch');
  if (observation.fieldReportContract !== 'vigia.structured-field-report.v1' || observation.reportType !== expected.expectedReportType || !FIELD_CAPACITY_REPORT_TYPES.has(observation.reportType)) throw new Error('field_capacity_structured_report_required');
  if (observation.rawEvidenceHash !== expected.expectedRawEvidenceHash) throw new Error('field_capacity_evidence_hash_mismatch');
  if (Object.hasOwn(observation, 'capacityAdmission')) throw new Error('field_capacity_observation_contains_untrusted_admission');
  if (observation.reportState !== 'OBSERVATION_PENDING_GOVERNED_ADMISSION' || observation.payload?.admissionState !== 'OBSERVATION_PENDING_GOVERNED_ADMISSION') throw new Error('field_capacity_observation_state_invalid');
  const observer = observation.observerIdentity;
  if (observer?.verificationState !== 'ROLE_ATTESTED' || observer?.trustBand !== 'TRUSTED_ROLE_ATTESTED' || observer?.observerClass === 'PUBLIC') throw new Error('field_capacity_observer_not_role_attested');
  if (!observation.centralRecordId || !observation.centralReceivedAt || observation.freshness !== 'CURRENT_CENTRAL_RECEIPT') throw new Error('field_capacity_current_central_receipt_required');
  const nowMs = clock().getTime();
  const observedAt = Date.parse(observation.claimedObservedAt ?? observation.observedAt ?? '');
  const centralReceivedAt = Date.parse(observation.centralReceivedAt ?? '');
  if (!Number.isFinite(nowMs) || !Number.isFinite(observedAt) || !Number.isFinite(centralReceivedAt) || observedAt > centralReceivedAt || centralReceivedAt > nowMs || nowMs - observedAt > maxObservationAgeMs) throw new Error('field_capacity_observation_freshness_invalid');
}

export function createFieldCapacityAdmission({ observation, authorization, incidentId, observationId, expectedReportType, expectedRawEvidenceHash, truthEnvironment, decisionReference, admittedAt }) {
  const admissionReference = stableId('field-capacity-admission', truthEnvironment, incidentId, observationId, expectedRawEvidenceHash);
  const body = {
    schemaVersion: FIELD_CAPACITY_ADMISSION_SCHEMA,
    state: 'ADMITTED',
    scope: FIELD_CAPACITY_ADMISSION_SCOPE,
    truthEnvironment,
    incidentId,
    observationId,
    reportType: expectedReportType,
    admissionReference,
    sourceReference: `central-fieldnet-record:${fieldCapacityOpaque(observation.centralRecordId, 'field_capacity_central_record_required')}`,
    sourceEvidenceHash: expectedRawEvidenceHash,
    authorityReference: authorization.authorityReference,
    admittedBy: authorization.principalId,
    admittedAt,
    observedAt: fieldCapacityIso(observation.claimedObservedAt ?? observation.observedAt, 'field_capacity_observation_time_invalid'),
    centralReceivedAt: fieldCapacityIso(observation.centralReceivedAt, 'field_capacity_central_receipt_time_invalid'),
    decisionReference,
    privacy: 'AGGREGATE_CAPACITY_ONLY_NO_PII_COPIED',
    truthBoundary: 'This decision admits only the attributable aggregate capacity fields in the bound observation. It is not dispatch, authority delegation, or an outcome.'
  };
  assertNoDefaultFieldPii(body);
  return { ...body, recordHash: sha256(canonical(body)) };
}

export function createFieldCapacityRevocation({ authorization, incidentId, observationId, admissionReference, truthEnvironment, reasonCode, decisionReference, revokedAt }) {
  const revocationReference = stableId('field-capacity-revocation', admissionReference, reasonCode);
  const body = {
    schemaVersion: FIELD_CAPACITY_REVOCATION_SCHEMA,
    state: 'REVOKED',
    truthEnvironment,
    incidentId,
    observationId,
    admissionReference,
    revocationReference,
    reasonCode,
    authorityReference: authorization.authorityReference,
    revokedBy: authorization.principalId,
    revokedAt,
    decisionReference
  };
  return { ...body, recordHash: sha256(canonical(body)) };
}
