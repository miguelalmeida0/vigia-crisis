import { createHash, randomUUID } from 'node:crypto';
import { assertCan, assertIncidentScope } from '../../../../../packages/domain/src/authorization.mjs';
import { validateCapDraft } from './cap-alert-transport.mjs';

export const PROTECTION_TRANSITIONS = Object.freeze({
  DRAFT: ['REVIEW', 'CANCELLED', 'EXPIRED'],
  REVIEW: ['APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED'],
  APPROVED: ['DISPATCH_ELIGIBLE', 'CANCELLED', 'EXPIRED'],
  DISPATCH_ELIGIBLE: ['EXTERNAL_SEND_DISABLED', 'DISPATCHED', 'CANCELLED', 'EXPIRED'],
  EXTERNAL_SEND_DISABLED: ['CANCELLED', 'EXPIRED'],
  DISPATCHED: ['ACKNOWLEDGED', 'UPDATED', 'CANCELLED', 'EXPIRED'],
  EXERCISE_SENT: ['ACKNOWLEDGED', 'EXPIRED'],
  ACKNOWLEDGED: ['UPDATED', 'CANCELLED', 'EXPIRED'],
  UPDATED: ['ACKNOWLEDGED', 'CANCELLED', 'EXPIRED'],
  SUPERSEDED: [], REJECTED: [], CANCELLED: [], EXPIRED: []
});

export const EXERCISE_TRANSPORT = Object.freeze({
  transportId: 'vigia-isolated-exercise-ledger', state: 'DISPATCH_DISABLED',
  deliveryMode: 'ISOLATED_EXERCISE_REPOSITORY', externalTransport: false,
  exerciseDeliveryState: 'AVAILABLE'
});

export const EXERCISE_ACTIONS = Object.freeze({
  SEND: { messageType: 'Alert', event: 'CAP_EXERCISE_SENT', nextState: 'EXERCISE_SENT' },
  UPDATE: { messageType: 'Update', event: 'CAP_EXERCISE_UPDATED', nextState: 'UPDATED' },
  SUPERSEDE: { messageType: 'Update', event: 'CAP_EXERCISE_SUPERSEDED', nextState: 'SUPERSEDED' },
  CANCEL: { messageType: 'Cancel', event: 'CAP_EXERCISE_CANCELLED', nextState: 'CANCELLED' }
});

export const protectionList = (value) => Array.isArray(value) ? value : [];
export const protectionValues = (value) => Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
export const protectionFail = (code, statusCode = 400, details) => {
  const error = new Error(code);
  error.statusCode = statusCode;
  if (details !== undefined) error.details = details;
  throw error;
};
export const protectionText = (value, code) => {
  if (typeof value !== 'string' || !value.trim()) protectionFail(code);
  return value.trim();
};
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const protectionRequestHash = (value) => `sha256:${sha256(JSON.stringify(value))}`;
export const protectionIncidentMatches = (workflow, incidentId) => String(workflow?.incidentId ?? workflow?.incident?.id ?? '') === String(incidentId);
export const protectionWorkflowIndex = (state, incidentId, workflowId) => protectionList(state.protectionWorkflows).findIndex((item) => item.workflowId === workflowId && protectionIncidentMatches(item, incidentId));
export const protectionExpired = (workflow, at) => Date.parse(workflow.expiresAt) <= at.getTime() || Boolean(workflow.authority?.validUntil && Date.parse(workflow.authority.validUntil) <= at.getTime());

export function authorizeProtectionActor(actor, incidentId) {
  assertCan(actor, 'command:incident');
  assertIncidentScope(actor, incidentId);
  return String(actor?.id ?? '');
}

export function protectionReceipt(clock, workflow, event) {
  const at = clock().toISOString();
  const core = { workflowId: workflow.workflowId, incidentId: workflow.incidentId, event, at, universe: workflow.universe };
  return { schemaVersion: 'vigia.protection-receipt.v1', receiptId: `protection-receipt:${sha256(JSON.stringify(core)).slice(0, 24)}`, ...core };
}

export function protectionExerciseTarget(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) protectionFail('non_production_protection_dispatch_requires_isolated_exercise_target');
  if (value.type !== 'EXERCISE_CONTROL') protectionFail('exercise_target_type_must_be_EXERCISE_CONTROL');
  return { type: 'EXERCISE_CONTROL', id: protectionText(value.id, 'exercise_target_id_required'), label: typeof value.label === 'string' && value.label.trim() ? value.label.trim() : null };
}

export function protectionExerciseRequest(action, input, target) {
  return {
    action, target, sender: input.sender ?? null, identifier: input.identifier ?? null,
    event: input.event ?? null, urgency: input.urgency ?? null, severity: input.severity ?? null,
    certainty: input.certainty ?? null, effective: input.effective ?? null, headline: input.headline ?? null,
    instruction: input.instruction ?? null, references: protectionValues(input.references),
    replacementReference: input.replacementReference ?? null, reason: input.reason ?? null
  };
}

export function findExerciseReceipt(state, idempotencyKey) {
  for (const workflow of protectionList(state.protectionWorkflows)) {
    const receipt = protectionList(workflow.exerciseReceipts).find((item) => item.idempotencyKey === idempotencyKey);
    if (receipt) return { workflow, receipt };
  }
  return null;
}

export const hasLiveIdempotency = (state, key) => protectionList(state.protectionWorkflows).some((workflow) => workflow.dispatch?.idempotencyKey === key || protectionList(workflow.dispatchDeliveries).some((delivery) => delivery.idempotencyKey === key));
export const hasExerciseIdempotency = (state, key) => protectionList(state.protectionWorkflows).some((workflow) => protectionList(workflow.exerciseReceipts).some((receipt) => receipt.idempotencyKey === key));
export function replayExerciseResult(found) {
  const receipt = { ...found.receipt, idempotentReplay: true };
  const delivery = protectionList(found.workflow.exerciseDeliveries).find((item) => item.receiptId === receipt.receiptId) ?? null;
  return { workflow: found.workflow, delivery, receipt };
}

export function protectionExerciseReceipt(clock, { workflow, event, action, actorId, idempotencyKey, hash, target, cap, references = [] }) {
  const recordedAt = clock().toISOString();
  const receiptId = `protection-exercise-receipt:${sha256(JSON.stringify({ workflowId: workflow.workflowId, incidentId: workflow.incidentId, event, idempotencyKey, hash })).slice(0, 32)}`;
  return {
    schemaVersion: 'vigia.protection-exercise-receipt.v1', receiptId, event, action,
    workflowId: workflow.workflowId, incidentId: workflow.incidentId, universe: 'EXERCISE', productionTruth: false,
    actorId,
    authorityBinding: {
      requirement: workflow.authority.requirement, owner: workflow.authority.owner,
      state: workflow.authority.state, validUntil: workflow.authority.validUntil,
      approvedBy: workflow.approval.approvedBy, approvalReceiptId: workflow.approval.receiptId
    },
    idempotencyKey, requestHash: hash, recordedAt, state: 'PERSISTED', idempotentReplay: false,
    exerciseTarget: target,
    cap: cap ? { identifier: cap.identifier, messageType: cap.msgType, status: cap.status, scope: cap.scope } : null,
    references, deliveryMode: EXERCISE_TRANSPORT.deliveryMode, transportId: EXERCISE_TRANSPORT.transportId,
    externalTransportInvoked: false,
    truthBoundary: 'This receipt records an isolated exercise lifecycle action only. It is not an external delivery, public alert, or production-truth claim.'
  };
}

export function createProtectionWorkflow({ actorId, incidentId, input, externalDispatch, clock }) {
  const now = clock().toISOString();
  const target = input.targetPopulationOrArea;
  if (!target || typeof target !== 'object' || Array.isArray(target) || !Object.keys(target).length) protectionFail('protection_target_population_or_area_required');
  const provenanceRefs = protectionValues(input.provenanceRefs);
  if (!provenanceRefs.length) protectionFail('protection_provenance_required');
  const universe = String(input.universe ?? 'LIVE_PRODUCTION');
  if (!['LIVE_PRODUCTION', 'EXERCISE'].includes(universe)) protectionFail('invalid_protection_universe');
  return {
    schemaVersion: 'vigia.protect-workflow.v3', workflowId: input.workflowId ?? `protect:${randomUUID()}`,
    incidentId, universe, productionTruth: universe === 'LIVE_PRODUCTION', state: 'DRAFT',
    targetPopulationOrArea: structuredClone(target),
    exposureAssessment: protectionText(input.exposureAssessment, 'exposure_assessment_required'),
    threshold: { definition: protectionText(input.protectionThreshold, 'protection_threshold_required'), state: 'RECORDED' },
    recommendation: { description: protectionText(input.recommendation, 'protection_recommendation_required'), state: 'DRAFT' },
    authority: { requirement: protectionText(input.authorityRequirement, 'authority_requirement_required'), state: 'REQUIRED', owner: protectionText(input.authorityOwner, 'authority_owner_required'), validUntil: input.authorityValidUntil ? new Date(input.authorityValidUntil).toISOString() : null },
    approval: { state: 'NOT_REVIEWED', approvedBy: null, approvedAt: null, receiptId: null },
    dispatch: { state: 'NOT_ELIGIBLE', externalSendEnabled: Boolean(externalDispatch) && universe === 'LIVE_PRODUCTION', idempotencyKey: null, receipt: null },
    acknowledgement: null, exerciseDeliveries: [], exerciseReceipts: [], provenanceRefs,
    expiresAt: new Date(protectionText(input.expiresAt, 'expires_at_required')).toISOString(),
    expectedPostcondition: protectionText(input.expectedPostcondition, 'expected_postcondition_required'),
    createdAt: now, createdBy: actorId, history: [{ state: 'DRAFT', at: now, actorId }]
  };
}

export function buildProtectionCapDraft({ workflow, input, alertTransport, clock }) {
  if (protectionExpired(workflow, clock())) protectionFail('protection_authority_or_workflow_expired', 409);
  if (workflow.universe === 'EXERCISE') {
    if (input.status != null && input.status !== 'Exercise') protectionFail('exercise_cap_status_must_be_Exercise', 409);
    if (input.scope != null && input.scope !== 'Restricted') protectionFail('exercise_cap_scope_must_be_Restricted', 409);
  }
  const area = workflow.targetPopulationOrArea ?? {};
  const status = workflow.universe === 'EXERCISE' ? 'Exercise' : input.status ?? 'Draft';
  const msgType = input.msgType ?? (workflow.state === 'UPDATED' ? 'Update' : workflow.state === 'CANCELLED' ? 'Cancel' : 'Alert');
  const sent = clock().toISOString();
  const transport = workflow.universe === 'EXERCISE' ? EXERCISE_TRANSPORT : alertTransport.status();
  const cap = {
    schemaVersion: 'OASIS-CAP-1.2', identifier: input.identifier ?? `VIGIA-${workflow.workflowId}-${sent}`,
    sender: protectionText(input.sender ?? workflow.authority.owner, 'cap_sender_required'), sent, status, msgType,
    scope: workflow.universe === 'EXERCISE' ? 'Restricted' : input.scope ?? 'Restricted', category: 'Fire',
    event: protectionText(input.event ?? 'Wildfire protection recommendation', 'cap_event_required'),
    urgency: protectionText(input.urgency, 'cap_urgency_required'), severity: protectionText(input.severity, 'cap_severity_required'), certainty: protectionText(input.certainty, 'cap_certainty_required'),
    effective: new Date(input.effective ?? sent).toISOString(), expires: new Date(workflow.expiresAt).toISOString(), senderName: workflow.authority.owner,
    headline: protectionText(input.headline, 'cap_headline_required'), description: workflow.recommendation.description,
    instruction: protectionText(input.instruction, 'cap_instruction_required'), web: input.web ?? null, contact: input.contact ?? null,
    parameters: { incidentId: workflow.incidentId, workflowId: workflow.workflowId, universe: workflow.universe, productionTruth: workflow.productionTruth, authorityRequirement: workflow.authority.requirement, approvalState: workflow.approval.state, approvalReceiptId: workflow.approval.receiptId, sourceAttribution: workflow.provenanceRefs },
    references: protectionValues(input.references),
    area: { areaDesc: protectionText(area.areaDesc ?? area.label ?? area.name, 'cap_target_area_description_required'), polygon: area.polygon ?? null, circle: area.circle ?? null, geocode: area.geocode ?? null },
    dispatch: { state: workflow.universe === 'EXERCISE' ? EXERCISE_TRANSPORT.state : alertTransport.enabled ? 'TRANSPORT_CONFIGURED' : 'DISPATCH_DISABLED', transport, idempotencyRequired: true }
  };
  const validation = validateCapDraft(cap, { now: clock() });
  if (!validation.valid) protectionFail(`cap_schema_invalid:${validation.errors.join(',')}`, 400, validation);
  return { cap, validation, transport };
}
