import { createFieldTask, validIso } from './contracts.mjs';
import {
  FIELD_OBSERVER_CLASSES,
  FIELD_REPORT_TYPES,
  FIELD_TASK_ACKNOWLEDGEMENT_DISPOSITIONS,
  PUBLIC_SAFE_MODES,
  SAFE_ZONE_MODES,
  assertAllowedKeys,
  assertObject,
  enumValue,
  noDefaultPii,
  nullableNumber,
  opaqueId,
  point,
  requiredText,
  textList
} from './field-report-validation.mjs';

export function createFieldVerificationTask(input = {}, { now = new Date(), originNode, authenticatedPrincipal } = {}) {
  const createdAt = validIso(input.createdAt ?? now, 'field_task_created_at_invalid');
  const dueAt = validIso(input.dueAt, 'field_task_due_at_required');
  if (Date.parse(dueAt) <= Date.parse(createdAt)) throw new Error('field_task_due_at_must_follow_creation');
  const targetObserverClasses = [...new Set((input.targetObserverClasses ?? []).map((value) => enumValue(value, new Set(FIELD_OBSERVER_CLASSES), 'field_task_observer_class_invalid')))];
  if (!targetObserverClasses.length) throw new Error('field_task_target_observer_class_required');
  const safety = assertObject(input.safeZoneConstraint, 'field_task_safe_zone_constraint_required');
  assertAllowedKeys(safety, new Set(['mode', 'instruction', 'hazardExclusionM', 'authorityReference']), 'field_task_safe_zone_field_unsupported');
  const safeZoneConstraint = {
    mode: enumValue(safety.mode, SAFE_ZONE_MODES, 'field_task_safe_zone_mode_invalid'),
    instruction: requiredText(safety.instruction, 'field_task_safe_zone_instruction_required', 500),
    hazardExclusionM: nullableNumber(safety.hazardExclusionM, 'field_task_hazard_exclusion_invalid'),
    authorityReference: safety.authorityReference ? requiredText(safety.authorityReference, 'field_task_authority_reference_invalid', 240) : null
  };
  const location = point(input.location);
  if (targetObserverClasses.includes('PUBLIC') && (!PUBLIC_SAFE_MODES.has(safeZoneConstraint.mode) || location)) throw new Error('public_field_task_must_be_remote_only');
  const expectedReportTypes = [...new Set((input.expectedReportTypes ?? []).map((value) => enumValue(value, new Set(FIELD_REPORT_TYPES), 'field_task_expected_report_type_invalid')))];
  if (!expectedReportTypes.length) throw new Error('field_task_expected_report_type_required');
  const requiredEvidence = textList(input.requiredEvidence, 'field_task_required_evidence_invalid', 20);
  if (!requiredEvidence.length) throw new Error('field_task_required_evidence_required');
  const principal = opaqueId(authenticatedPrincipal, 'field_task_authenticated_principal_required');
  const base = createFieldTask({
    taskId: opaqueId(input.taskId, 'field_task_id_required'),
    incidentId: opaqueId(input.incidentId, 'field_task_incident_id_required'),
    subject: input.subject ?? {},
    requiredAction: requiredText(input.objective ?? input.requiredAction, 'field_task_objective_required', 500),
    owner: opaqueId(input.owner, 'field_task_owner_required'),
    priority: input.priority,
    createdAt, dueAt, requiredEvidence,
    dependencies: input.dependencies ?? []
  }, { now });
  const task = {
    ...base,
    taskType: 'FIELD_VERIFICATION',
    objective: base.requiredAction,
    location,
    safeZoneConstraint,
    targetObserverClasses,
    expectedReportTypes,
    completionCriteria: requiredText(input.completionCriteria, 'field_task_completion_criteria_required', 500),
    acknowledgementPolicy: {
      required: true,
      acknowledgeBy: validIso(input.acknowledgeBy ?? dueAt, 'field_task_acknowledge_by_invalid'),
      acceptedDispositions: [...FIELD_TASK_ACKNOWLEDGEMENT_DISPOSITIONS]
    },
    issuedBy: principal,
    originNode: opaqueId(originNode, 'field_task_origin_node_required'),
    linkedInformationRequirementId: input.linkedInformationRequirementId ? opaqueId(input.linkedInformationRequirementId, 'field_task_information_requirement_id_invalid') : null,
    authorityBoundary: 'Field verification request only. It is not dispatch authority and never directs public observers toward a hazard.'
  };
  noDefaultPii(task);
  return Object.freeze(task);
}
