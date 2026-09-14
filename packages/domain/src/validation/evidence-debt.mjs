import { createHash } from 'node:crypto';

export const EVIDENCE_DEBT_STATES = Object.freeze([
  'OPEN',
  'MEASURING',
  'WATCHING',
  'PARTIALLY_MEASURED',
  'MEASURED',
  'EXTERNALLY_BLOCKED',
  'PRESERVED_UNKNOWN',
  'RESOLVED'
]);

const STATE_SET = new Set(EVIDENCE_DEBT_STATES);
const required = (value, code) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(code);
  return normalized;
};
const finiteNonNegative = (value, code) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) throw new Error(code);
  return normalized;
};
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function createEvidenceDebtItem(input = {}) {
  const createdAt = required(input.created_at ?? input.createdAt, 'evidence_debt_created_at_required');
  const state = String(input.current_state ?? input.currentState ?? 'OPEN').toUpperCase();
  if (!STATE_SET.has(state)) throw new Error('invalid_evidence_debt_state');
  const item = {
    schemaVersion: 'vigia.evidence-debt-item.v1',
    id: required(input.id, 'evidence_debt_id_required'),
    subject: required(input.subject, 'evidence_debt_subject_required'),
    quantity_question: required(input.quantity_question ?? input.quantityQuestion, 'evidence_debt_quantity_required'),
    current_state: state,
    why_unknown: required(input.why_unknown ?? input.whyUnknown, 'evidence_debt_reason_required'),
    why_it_matters: required(input.why_it_matters ?? input.whyItMatters, 'evidence_debt_importance_required'),
    decision_blocked: required(input.decision_blocked ?? input.decisionBlocked, 'evidence_debt_decision_required'),
    measurement_method: required(input.measurement_method ?? input.measurementMethod, 'evidence_debt_method_required'),
    evidence_required: [...(input.evidence_required ?? input.evidenceRequired ?? [])].map(String),
    acceptable_reference_authority: [...(input.acceptable_reference_authority ?? input.acceptableReferenceAuthority ?? [])].map(String),
    current_denominator: finiteNonNegative(input.current_denominator ?? input.currentDenominator ?? 0, 'invalid_evidence_debt_current_denominator'),
    target_denominator: finiteNonNegative(input.target_denominator ?? input.targetDenominator, 'invalid_evidence_debt_target_denominator'),
    system_resolvable: Boolean(input.system_resolvable ?? input.systemResolvable),
    human_required: Boolean(input.human_required ?? input.humanRequired),
    field_required: Boolean(input.field_required ?? input.fieldRequired),
    next_opportunity: input.next_opportunity ?? input.nextOpportunity ?? null,
    watch_state: required(input.watch_state ?? input.watchState ?? 'NOT_ARMED', 'evidence_debt_watch_state_required'),
    owner_class: required(input.owner_class ?? input.ownerClass, 'evidence_debt_owner_required'),
    closure_contract: required(input.closure_contract ?? input.closureContract, 'evidence_debt_closure_contract_required'),
    created_at: createdAt,
    updated_at: required(input.updated_at ?? input.updatedAt ?? createdAt, 'evidence_debt_updated_at_required'),
    resolved_at: input.resolved_at ?? input.resolvedAt ?? null,
    resolution_evidence: input.resolution_evidence ?? input.resolutionEvidence ?? null,
    provenance: structuredClone(input.provenance ?? {}),
    version: 1,
    history: []
  };
  if (item.current_denominator > item.target_denominator && item.target_denominator !== 0) throw new Error('evidence_debt_denominator_exceeds_target');
  return Object.freeze(item);
}

export function transitionEvidenceDebtItem(item, state, patch = {}) {
  const nextState = String(state ?? '').toUpperCase();
  if (!STATE_SET.has(nextState)) throw new Error('invalid_evidence_debt_state');
  const updatedAt = required(patch.updated_at ?? patch.updatedAt, 'evidence_debt_transition_time_required');
  const currentDenominator = finiteNonNegative(patch.current_denominator ?? patch.currentDenominator ?? item.current_denominator, 'invalid_evidence_debt_current_denominator');
  if (currentDenominator > item.target_denominator && item.target_denominator !== 0) throw new Error('evidence_debt_denominator_exceeds_target');
  if (['MEASURED', 'RESOLVED'].includes(nextState) && !patch.resolution_evidence && !patch.resolutionEvidence && !item.resolution_evidence) throw new Error('evidence_debt_resolution_evidence_required');
  if (['MEASURED', 'RESOLVED'].includes(nextState) && item.target_denominator > 0 && currentDenominator < item.target_denominator) throw new Error('evidence_debt_target_not_reached');
  const historyRecord = {
    from: item.current_state,
    to: nextState,
    at: updatedAt,
    denominator_before: item.current_denominator,
    denominator_after: currentDenominator,
    evidence: patch.resolution_evidence ?? patch.resolutionEvidence ?? null
  };
  return Object.freeze({
    ...item,
    current_state: nextState,
    current_denominator: currentDenominator,
    watch_state: String(patch.watch_state ?? patch.watchState ?? item.watch_state),
    next_opportunity: patch.next_opportunity ?? patch.nextOpportunity ?? item.next_opportunity,
    resolution_evidence: patch.resolution_evidence ?? patch.resolutionEvidence ?? item.resolution_evidence,
    provenance: structuredClone(patch.provenance ?? item.provenance),
    updated_at: updatedAt,
    resolved_at: ['MEASURED', 'RESOLVED'].includes(nextState) ? (patch.resolved_at ?? patch.resolvedAt ?? updatedAt) : null,
    version: Number(item.version ?? 1) + 1,
    history: [...(item.history ?? []), historyRecord]
  });
}

export function createMeasurementPlan(input = {}) {
  const methods = [...(input.measurementMethods ?? input.measurement_methods ?? [])];
  if (!methods.length) throw new Error('measurement_plan_methods_required');
  const core = {
    schemaVersion: 'vigia.measurement-plan.v1',
    id: required(input.id, 'measurement_plan_id_required'),
    evidenceDebtItemId: required(input.evidenceDebtItemId ?? input.evidence_debt_item_id, 'measurement_plan_debt_item_required'),
    objective: required(input.objective, 'measurement_plan_objective_required'),
    dataset: structuredClone(input.dataset ?? {}),
    frozenSplit: input.frozenSplit ?? input.frozen_split ?? null,
    measurementMethods: methods.map((method) => ({
      id: required(method.id, 'measurement_method_id_required'),
      version: required(method.version, 'measurement_method_version_required'),
      deterministic: method.deterministic !== false,
      parameters: structuredClone(method.parameters ?? {}),
      prohibitedInputs: [...(method.prohibitedInputs ?? [])].map(String)
    })),
    requiredEvidence: [...(input.requiredEvidence ?? input.required_evidence ?? [])].map(String),
    successContract: required(input.successContract ?? input.success_contract, 'measurement_plan_success_contract_required'),
    createdAt: required(input.createdAt ?? input.created_at, 'measurement_plan_created_at_required')
  };
  return Object.freeze({ ...core, planHash: `sha256:${hash(core)}` });
}

export function createMeasurementCampaign(input = {}) {
  const methods = [...(input.measurementMethods ?? input.measurement_methods ?? [])];
  if (!methods.length) throw new Error('measurement_campaign_methods_required');
  const core = {
    schemaVersion: 'vigia.measurement-campaign.v1',
    id: required(input.id, 'measurement_campaign_id_required'),
    objective: required(input.objective, 'measurement_campaign_objective_required'),
    dataset: structuredClone(input.dataset ?? {}),
    frozenSplit: input.frozenSplit ?? input.frozen_split ?? null,
    measurementMethods: structuredClone(methods),
    requiredEvidence: [...(input.requiredEvidence ?? input.required_evidence ?? [])].map(String),
    progress: structuredClone(input.progress ?? { state: 'NOT_STARTED', completed: 0, denominator: 0 }),
    metrics: structuredClone(input.metrics ?? {}),
    remainingDebt: [...(input.remainingDebt ?? input.remaining_debt ?? [])].map(String),
    version: required(input.version, 'measurement_campaign_version_required'),
    generatedAt: required(input.generatedAt ?? input.generated_at, 'measurement_campaign_generated_at_required'),
    priorCampaignHash: input.priorCampaignHash ?? null
  };
  return Object.freeze({ ...core, campaignHash: `sha256:${hash(core)}` });
}
