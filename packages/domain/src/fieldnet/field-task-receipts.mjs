import { sha256, stableId, validIso } from './contracts.mjs';
import {
  ACK_SAFETY_STATES,
  FIELD_TASK_ACKNOWLEDGEMENT_DISPOSITIONS,
  enumValue,
  noDefaultPii,
  opaqueId,
  optionalText
} from './field-report-validation.mjs';

export function createFieldTaskAcknowledgement(task, input = {}, { now = new Date(), originNode, authenticatedPrincipal, device } = {}) {
  if (task?.taskType !== 'FIELD_VERIFICATION') throw new Error('field_verification_task_required');
  if (device?.observer?.schemaVersion !== 'vigia.field-observer.v1') throw new Error('field_task_registered_observer_required');
  const observer = device.observer;
  if (!observer.active || observer.verificationState === 'SUSPENDED') throw new Error('field_task_observer_suspended');
  if (!task.targetObserverClasses?.includes(observer.observerClass)) throw new Error('field_task_observer_class_not_eligible');
  if (device.ownerOperator !== observer.observerId) throw new Error('field_task_device_observer_mismatch');
  if (input.deviceId !== device.deviceId) throw new Error('field_task_device_identity_mismatch');
  const disposition = enumValue(input.disposition, new Set(FIELD_TASK_ACKNOWLEDGEMENT_DISPOSITIONS), 'field_task_acknowledgement_disposition_invalid');
  const safetyState = enumValue(input.safetyState, ACK_SAFETY_STATES, 'field_task_acknowledgement_safety_state_invalid');
  if (disposition === 'ACCEPTED' && safetyState !== 'SAFE_TO_PROCEED') throw new Error('field_task_acceptance_requires_safe_to_proceed');
  if (disposition === 'DECLINED_UNSAFE' && safetyState !== 'NOT_SAFE') throw new Error('field_task_unsafe_decline_requires_not_safe');
  const taskVersion = Number(input.taskVersion);
  if (!Number.isSafeInteger(taskVersion) || taskVersion < 1) throw new Error('field_task_acknowledgement_version_required');
  const observerId = observer.observerId;
  const principal = opaqueId(authenticatedPrincipal, 'field_task_acknowledgement_principal_required');
  const acknowledgedAt = validIso(input.acknowledgedAt ?? now, 'field_task_acknowledged_at_invalid');
  const acknowledgement = {
    schemaVersion: 'vigia.field-task-acknowledgement.v1',
    acknowledgementId: stableId('field-task-ack', task.taskId, observerId, taskVersion),
    taskId: task.taskId,
    incidentId: task.incidentId,
    taskVersion,
    disposition,
    safetyState,
    observer: {
      observerId, observerClass: observer.observerClass, verificationState: observer.verificationState,
      trustBand: observer.trustBand, organizationId: observer.organizationId
    },
    deviceId: opaqueId(input.deviceId, 'field_task_acknowledgement_device_id_required'),
    sessionId: opaqueId(input.sessionId, 'field_task_acknowledgement_session_id_required'),
    note: optionalText(input.note, 'field_task_acknowledgement_note_invalid', 500),
    acknowledgedAt,
    syncState: 'PENDING',
    provenance: { authenticatedPrincipal: principal, originNode: opaqueId(originNode, 'field_task_acknowledgement_origin_node_required') },
    truthBoundary: 'This receipt proves acknowledgement or refusal only. It does not prove task completion, field truth, dispatch, or outcome.'
  };
  noDefaultPii(acknowledgement);
  return Object.freeze({ ...acknowledgement, receiptHash: sha256(acknowledgement) });
}

export function createFieldTaskCompletion(task, input = {}, { now = new Date(), originNode, authenticatedPrincipal } = {}) {
  if (task?.taskType !== 'FIELD_VERIFICATION') throw new Error('field_verification_task_required');
  const taskVersion = Number(input.taskVersion);
  if (!Number.isSafeInteger(taskVersion) || taskVersion < 1) throw new Error('field_task_completion_version_required');
  const evidenceObservationIds = [...new Set((input.evidenceObservationIds ?? []).map((id) => opaqueId(id, 'field_task_completion_evidence_id_invalid')))];
  if (!evidenceObservationIds.length) throw new Error('field_task_completion_evidence_required');
  const completedAt = validIso(input.completedAt ?? now, 'field_task_completed_at_invalid');
  const completion = {
    schemaVersion: 'vigia.field-task-completion.v1',
    completionId: stableId('field-task-completion', task.taskId, taskVersion, evidenceObservationIds),
    taskId: task.taskId,
    incidentId: task.incidentId,
    taskVersion,
    evidenceObservationIds,
    note: optionalText(input.note, 'field_task_completion_note_invalid', 500),
    completedAt,
    provenance: {
      authenticatedPrincipal: opaqueId(authenticatedPrincipal, 'field_task_completion_principal_required'),
      originNode: opaqueId(originNode, 'field_task_completion_origin_node_required')
    },
    truthBoundary: 'Completion means the requested evidence was submitted and bound to this task; it does not automatically admit the observation as canonical truth or prove an operational outcome.'
  };
  noDefaultPii(completion);
  return Object.freeze({ ...completion, completionHash: sha256(completion) });
}
