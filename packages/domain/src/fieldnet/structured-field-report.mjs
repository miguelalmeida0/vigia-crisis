import { createFieldObservation, validIso } from './contracts.mjs';
import { normalizeStructuredAnswers, reportClaim } from './field-report-normalizers.mjs';
import {
  CONNECTIVITY_STATES,
  FIELD_REPORT_TYPES,
  enumValue,
  mediaReferences,
  noDefaultPii,
  opaqueId,
  optionalText,
  point,
  requiredText
} from './field-report-validation.mjs';

export function createStructuredFieldReport(input = {}, { now = new Date(), originNode, authenticatedPrincipal, device } = {}) {
  const reportType = enumValue(input.reportType, new Set(FIELD_REPORT_TYPES), 'field_report_type_invalid');
  if (device?.observer?.schemaVersion !== 'vigia.field-observer.v1') throw new Error('field_report_registered_observer_required');
  const observer = device.observer;
  if (!observer.active || observer.verificationState === 'SUSPENDED') throw new Error('field_report_observer_suspended');
  if (observer.observerClass === 'AUTOMATED_SENSOR') throw new Error('automated_sensor_must_use_sensor_gateway');
  if (device.ownerOperator !== observer.observerId) throw new Error('field_report_device_observer_mismatch');
  if (input.deviceId !== device.deviceId) throw new Error('field_report_device_identity_mismatch');
  if (input.observerId && input.observerId !== observer.observerId) throw new Error('field_report_observer_identity_mismatch');
  const observedAt = validIso(input.observedAt, 'field_report_observed_at_required');
  const receivedAt = validIso(input.receivedAt ?? now, 'field_report_received_at_invalid');
  const answers = normalizeStructuredAnswers(reportType, input.structuredAnswers);
  const claim = reportClaim(reportType, answers);
  const note = optionalText(input.note, 'field_report_note_invalid', 500);
  const media = mediaReferences(input.mediaReferences, observedAt);
  const bearingDegrees = input.bearingDegrees === undefined || input.bearingDegrees === null || input.bearingDegrees === '' ? null : Number(input.bearingDegrees);
  if (bearingDegrees !== null && (!Number.isFinite(bearingDegrees) || bearingDegrees < 0 || bearingDegrees >= 360)) throw new Error('field_report_bearing_invalid');
  noDefaultPii({ note, media, answers });
  const principal = opaqueId(authenticatedPrincipal, 'field_report_authenticated_principal_required');
  const sessionId = opaqueId(input.sessionId, 'field_report_session_id_required');
  const connectivityAtCapture = enumValue(input.connectivityAtCapture, CONNECTIVITY_STATES, 'field_report_connectivity_state_invalid');
  const observation = createFieldObservation({
    observationId: opaqueId(input.reportId ?? input.observationId, 'field_report_id_required'),
    incidentId: opaqueId(input.incidentId, 'field_report_incident_id_required'),
    sourceIdentity: {
      kind: 'HUMAN', observerClass: observer.observerClass,
      observerVerificationState: observer.verificationState, observerTrustBand: observer.trustBand
    },
    deviceId: opaqueId(input.deviceId, 'field_report_device_id_required'),
    observerIdentity: {
      observerId: observer.observerId, observerClass: observer.observerClass,
      verificationState: observer.verificationState, trustBand: observer.trustBand,
      organizationId: observer.organizationId
    },
    observedAt, receivedAt, deviceClockQuality: input.deviceClockQuality ?? device.timeQuality,
    geometry: point(input.geometry, 'field_report_gps_invalid'),
    horizontalUncertaintyM: input.horizontalUncertaintyM,
    observationType: reportType,
    payload: {
      reportType, structuredAnswers: answers, note, mediaReferences: media, bearingDegrees,
      ...claim, admissionState: 'OBSERVATION_PENDING_GOVERNED_ADMISSION'
    },
    evidenceReference: input.evidenceReference ? requiredText(input.evidenceReference, 'field_report_evidence_reference_invalid', 240) : null,
    rawEvidenceHash: input.rawEvidenceHash,
    freshnessContractMs: input.freshnessContractMs,
    causalMetadata: {
      ...(input.causalMetadata ?? {}), sessionId, connectivityAtCapture, authenticatedPrincipal: principal,
      linkedTaskId: input.linkedTaskId ? opaqueId(input.linkedTaskId, 'field_report_linked_task_id_invalid') : null
    }
  }, { now, originNode });
  return Object.freeze({
    ...observation,
    fieldReportContract: 'vigia.structured-field-report.v1', reportType,
    reportState: 'OBSERVATION_PENDING_GOVERNED_ADMISSION',
    capture: {
      sessionId, connectivityAtCapture, gpsCaptured: true,
      gpsAccuracyM: observation.horizontalUncertaintyM, bearingDegrees,
      deviceClockQuality: observation.deviceClockQuality
    },
    provenance: {
      originNode: observation.originNode, authenticatedPrincipal: principal,
      observerId: observer.observerId, observerClass: observer.observerClass,
      observerVerificationState: observer.verificationState,
      observerAttestationReference: observer.attestationReference,
      deviceId: observation.deviceId, sessionId, observedAt, receivedAt,
      rawEvidenceHash: observation.rawEvidenceHash
    },
    privacy: {
      policy: 'NO_PII_BY_DEFAULT', staffRepresentation: 'AGGREGATE_OPERATIONAL_COUNTS_ONLY',
      containsPersonallyIdentifiableStaffData: false
    },
    truthBoundary: 'This is an attributable field observation. It is not verified incident truth, official geometry, dispatch, authority, or an outcome until separately admitted.'
  });
}
