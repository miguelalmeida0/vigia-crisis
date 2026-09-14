import { canonical, sha256, stableId } from '../../../../../packages/domain/src/fieldnet/contracts.mjs';

export const FIELDNET_CAPACITY_TASK_SPECIFICATIONS = Object.freeze({
  HOSPITAL: Object.freeze({
    strategyId: 'fieldnet-hospital-capacity',
    reportType: 'HOSPITAL_CAPACITY_UPDATE',
    observerClass: 'MUNICIPAL_OPERATOR',
    requiredEvidence: Object.freeze(['FACILITY_IDENTITY', 'CURRENT_AGGREGATE_RECEIVING_CAPACITY', 'ATTRIBUTABLE_OBSERVATION_TIME']),
    objective: 'Report aggregate current hospital receiving capacity through the authorized remote FieldNet workflow.',
    completionCriteria: 'One incident-scoped, attributable aggregate hospital-capacity report is persisted and separately admitted by central authority.'
  }),
  FIRE_STATION: Object.freeze({
    strategyId: 'fieldnet-fire-capacity',
    reportType: 'FIRE_STATION_CAPACITY_UPDATE',
    observerClass: 'AUTHORIZED_RESPONDER',
    requiredEvidence: Object.freeze(['FACILITY_IDENTITY', 'CURRENT_AGGREGATE_RESPONSE_CAPACITY', 'ATTRIBUTABLE_OBSERVATION_TIME']),
    objective: 'Report aggregate current fire-station response capacity through the authorized remote FieldNet workflow.',
    completionCriteria: 'One incident-scoped, attributable aggregate fire-station-capacity report is persisted and separately admitted by central authority.'
  })
});

export const safeCapacityTaskReason = (error, fallback) => String(typeof error === 'string' ? error : error?.message ?? fallback).replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 160) || fallback;
export const isOpaqueCapacityTaskValue = (value) => typeof value === 'string' && value.length > 0 && value.length <= 160 && !/[\s@]/.test(value);
export const isExactIncidentList = (value, incidentId) => Array.isArray(value) && value.length === 1 && String(value[0]) === String(incidentId) && value[0] !== '*';

const READINESS_SCHEMA = 'vigia.fieldnet-capacity-task-readiness.v1';
const READINESS_CHECKS = Object.freeze(['process', 'listener', 'releaseIdentity', 'startup', 'deploymentIdentity', 'incidentScope', 'storage', 'internalServices']);
const RELEASE_IDENTITY_FIELDS = Object.freeze(['releaseId', 'codeStateHash', 'operationalDataHash', 'releaseStatementHash']);

export function assertRestrictedCapacityReadiness(payload, { destinationNodeId, incidentId, expectedReleaseIdentity } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.schemaVersion !== READINESS_SCHEMA) {
    throw new Error('fieldnet_capacity_task_readiness_schema_invalid');
  }
  if (payload.ready !== true) throw new Error('fieldnet_capacity_task_destination_not_ready');
  if (payload.nodeId !== destinationNodeId) throw new Error('fieldnet_capacity_task_destination_identity_mismatch');
  if (payload.incidentScope?.exact !== true || payload.incidentScope?.incidentId !== incidentId) {
    throw new Error('fieldnet_capacity_task_incident_scope_not_ready');
  }
  for (const checkName of READINESS_CHECKS) {
    if (payload.checks?.[checkName]?.ready !== true) throw new Error(`fieldnet_capacity_task_readiness_check_failed:${checkName}`);
  }
  for (const field of RELEASE_IDENTITY_FIELDS) {
    const actual = payload.releaseIdentity?.[field];
    const expected = expectedReleaseIdentity?.[field];
    if (typeof actual !== 'string' || actual.length === 0 || typeof expected !== 'string' || expected.length === 0) {
      throw new Error(`fieldnet_capacity_task_release_identity_missing:${field}`);
    }
    if (actual !== expected) throw new Error(`fieldnet_capacity_task_release_identity_mismatch:${field}`);
  }
  if (payload.centralConnectivity?.readinessGate !== false) throw new Error('fieldnet_capacity_task_central_connectivity_boundary_invalid');
  return payload;
}

export function validateTrustedCapacityDestination({ destination, incidentId } = {}) {
  if (!isOpaqueCapacityTaskValue(incidentId) || incidentId === '*') throw new Error('fieldnet_capacity_task_exact_incident_required');
  if (!destination || typeof destination !== 'object' || Array.isArray(destination)) throw new Error('fieldnet_capacity_task_destination_untrusted');
  if (!isOpaqueCapacityTaskValue(destination.nodeId) || destination.status !== 'active') throw new Error('fieldnet_capacity_task_destination_untrusted');
  if (!isExactIncidentList(destination.incidentIds, incidentId)) throw new Error('fieldnet_capacity_task_destination_scope_invalid');
  if (!Array.isArray(destination.capabilities) || !destination.capabilities.includes('fieldnet:capacity-task')) throw new Error('fieldnet_capacity_task_destination_capability_missing');
  return Object.freeze({
    nodeId: destination.nodeId,
    incidentIds: Object.freeze([String(incidentId)]),
    capabilities: Object.freeze([...new Set(destination.capabilities.map(String))]),
    status: 'active'
  });
}

export function buildFieldNetCapacityTask({ requirement, facility, destinationNodeId } = {}) {
  const specification = FIELDNET_CAPACITY_TASK_SPECIFICATIONS[facility?.kind];
  if (!specification || !requirement?.id || !requirement?.incidentId || String(requirement.subjectId) !== String(facility?.id)) throw new Error('governed_capacity_information_requirement_required');
  if (!isOpaqueCapacityTaskValue(String(requirement.incidentId)) || String(requirement.incidentId) === '*') throw new Error('fieldnet_capacity_task_exact_incident_required');
  if (!isOpaqueCapacityTaskValue(String(facility.id)) || !isOpaqueCapacityTaskValue(String(destinationNodeId))) throw new Error('fieldnet_capacity_task_opaque_identity_required');
  const taskId = stableId('field-capacity-task', requirement.incidentId, requirement.id, facility.id, destinationNodeId);
  return Object.freeze({
    taskId,
    incidentId: String(requirement.incidentId),
    subject: Object.freeze({ type: 'RESPONSE_FACILITY', facilityId: String(facility.id), facilityKind: facility.kind }),
    objective: specification.objective,
    owner: `fieldnet-capacity-resolver:${destinationNodeId}`,
    priority: 'P3_TASK',
    createdAt: requirement.createdAt,
    dueAt: requirement.deadline,
    acknowledgeBy: requirement.currentAssessment?.nextCheckAt,
    location: null,
    safeZoneConstraint: Object.freeze({
      mode: 'REMOTE_ONLY',
      instruction: 'Use only the authorized remote FieldNet form. Do not travel toward the incident or expose individual-level information.',
      hazardExclusionM: null,
      authorityReference: null
    }),
    targetObserverClasses: Object.freeze([specification.observerClass]),
    expectedReportTypes: Object.freeze([specification.reportType]),
    requiredEvidence: specification.requiredEvidence,
    completionCriteria: specification.completionCriteria,
    linkedInformationRequirementId: requirement.id
  });
}

export function assertPersistedCapacityTask(task, expected, destinationNodeId) {
  if (!task || typeof task !== 'object' || task.taskId !== expected.taskId) throw new Error('fieldnet_capacity_task_receipt_missing');
  if (task.taskType !== 'FIELD_VERIFICATION' || task.incidentId !== expected.incidentId) throw new Error('fieldnet_capacity_task_receipt_scope_mismatch');
  if (task.originNode !== destinationNodeId || task.linkedInformationRequirementId !== expected.linkedInformationRequirementId) throw new Error('fieldnet_capacity_task_receipt_binding_mismatch');
  if (canonical(task.subject) !== canonical(expected.subject) || canonical(task.expectedReportTypes) !== canonical(expected.expectedReportTypes)) throw new Error('fieldnet_capacity_task_receipt_subject_mismatch');
  if (task.owner !== expected.owner || task.priority !== expected.priority || task.objective !== expected.objective) throw new Error('fieldnet_capacity_task_receipt_policy_mismatch');
  if (canonical(task.safeZoneConstraint) !== canonical(expected.safeZoneConstraint) || canonical(task.targetObserverClasses) !== canonical(expected.targetObserverClasses)) throw new Error('fieldnet_capacity_task_receipt_safety_mismatch');
  if (canonical(task.requiredEvidence) !== canonical(expected.requiredEvidence) || task.completionCriteria !== expected.completionCriteria || task.location !== null) throw new Error('fieldnet_capacity_task_receipt_evidence_mismatch');
  return task;
}

export function projectCapacityTaskLifecycle({ task, destinationNodeId, centralTask, localLifecycle = null, attemptedAt, nextAttempt, duplicate }) {
  const taskHash = sha256(task);
  const receiptId = stableId('field-capacity-task-receipt', destinationNodeId, task.taskId, taskHash);
  const acknowledged = Boolean(task.lastAcknowledgement || task.acknowledgedAt || ['ACKNOWLEDGED', 'IN_PROGRESS', 'EVIDENCE_SUBMITTED', 'COMPLETED'].includes(task.state));
  const completed = task.state === 'COMPLETED';
  const centralRecorded = Boolean(centralTask && centralTask.taskId === task.taskId && centralTask.incidentId === task.incidentId && centralTask.originNode === destinationNodeId);
  const state = completed ? 'FIELDNET_TASK_COMPLETED' : acknowledged ? 'FIELDNET_TASK_ACKNOWLEDGED' : 'FIELDNET_TASK_PERSISTED';
  return Object.freeze({
    state,
    attemptCount: Math.max(1, Number(localLifecycle?.attemptCount ?? 0)),
    lastAttempt: localLifecycle?.lastAttempt ?? attemptedAt,
    nextAttempt: completed ? null : localLifecycle?.nextAttempt ?? nextAttempt,
    backoff: localLifecycle?.backoff ?? { state: 'NOT_REQUIRED', nextAttempt: null },
    deadline: localLifecycle?.deadline ?? task.dueAt ?? null,
    escalation: localLifecycle?.escalation ?? { state: 'MONITORING', escalateTo: 'INCIDENT_COMMAND', reason: 'Escalate if the evidence task is not locally completed and centrally reconciled by the deadline.' },
    result: Object.freeze({
      state,
      reason: duplicate ? 'The deterministic task already existed with the same governed binding; no duplicate task was created.' : 'The trusted FieldNet destination persisted the governed verification task.',
      providerId: destinationNodeId,
      sourceRecordId: task.taskId,
      receiptId
    }),
    receipt: Object.freeze({ schemaVersion: 'vigia.fieldnet-task-receipt.v1', receiptId, state: 'PERSISTED_LOCAL', at: task.createdAt, providerId: destinationNodeId, sourceRecordId: task.taskId, taskHash }),
    delivery: Object.freeze({ state: 'PERSISTED_AT_TRUSTED_FIELDNET_DESTINATION', destinationNodeId, recordedTaskId: task.taskId, recordedAt: task.createdAt }),
    acknowledgement: acknowledged ? Object.freeze({
      state: 'RECORDED_LOCAL',
      acknowledgementId: task.lastAcknowledgement?.acknowledgementId ?? null,
      acknowledgedAt: task.lastAcknowledgement?.acknowledgedAt ?? task.acknowledgedAt ?? null
    }) : Object.freeze({ state: 'NOT_RECORDED', reason: 'The trusted FieldNet node has not recorded an acknowledgement.' }),
    localCompletion: localLifecycle?.localCompletion ?? (completed
      ? Object.freeze({ state: 'COMPLETED_LOCAL_PENDING_SYNC', completedAt: task.completedAt ?? null, evidence: task.completionEvidence ?? [] })
      : Object.freeze({ state: 'NOT_COMPLETED', completedAt: null, evidence: [] })),
    centralReconciliation: centralRecorded ? Object.freeze({ state: 'CENTRAL_RECONCILED', centralRecordId: centralTask.centralRecordId ?? null, centralCursor: centralTask.centralCursor ?? null }) : Object.freeze({ state: 'LOCAL_ONLY_PENDING_SYNC', reason: 'The durable local FieldNet task has not yet appeared in the central reconciliation ledger.' })
  });
}
