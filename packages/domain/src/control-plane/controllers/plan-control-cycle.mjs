import { immutable, isoTime, semanticHash } from '../../intelligence/shared.mjs';
import { createControlAction } from '../action/action-model.mjs';
import { createDesiredState } from '../desired-state.mjs';
import { evaluateControlPolicy } from '../policy/policy-evaluation.mjs';
import { effectivePolicies, POLICY_KINDS } from '../policy/policy-model.mjs';
import { selectEvidenceSource } from '../source-selection.mjs';

function byKind(policies) { return new Map(policies.map((policy) => [policy.kind, policy])); }
function activeRequests(twin, incidentId) { return twin.controlPlane.acquisitionRequests.filter((item) => item.incidentId === incidentId && item.status === 'ACTIVE'); }
function sourceMap(twin) { return new Map(twin.sourceHealth.sources.map((source) => [source.sourceId, source])); }
function existingFamilies(incident) { return incident.evaluation.qualifyingEvidence.map((item) => item.sourceFamilyId).filter(Boolean); }

function planned(policy, decision, desired, input, existingActions) {
  const action = createControlAction({ ...input, desiredStateId: desired.id, policy, plannedAt: decision.evaluatedAt });
  const existing = existingActions.find((item) => item.id === action.id);
  return existing && ['AUTHORITY_REQUIRED', 'AUTHORIZED_BUT_EXECUTION_DISABLED', 'SHADOW'].includes(existing.status) ? null : action;
}

function decisionState(policy, facts, at, desiredInput) {
  const decision = evaluateControlPolicy({ policy, facts, evaluatedAt: at });
  const desired = decision.outcome === 'NOT_APPLICABLE' ? null : createDesiredState({ ...desiredInput, policy, effectiveAt: at, reasons: decision.reasons });
  return { decision, desired };
}

function planNeed({ incident, need, policies, twin, at, requests, sources, existingActions }) {
  const selection = selectEvidenceSource({ need, sources: [...sources.values()], existingFamilyIds: existingFamilies(incident) });
  const selectedSource = sources.get(selection.selectedSourceId), activeRequest = requests.find((item) => item.needId === need.id || item.sourceId === selection.selectedSourceId);
  const facts = { incidentId: incident.incident.id, need, sourceSelection: selection, selectedSource, activeRequest, debtCount: incident.evidenceDebt.count };
  const policy = policies.get(POLICY_KINDS.MISSING_INDEPENDENT_CORROBORATION), result = decisionState(policy, facts, at, {
    subjectType: 'EVIDENCE_NEED', subjectId: need.id,
    state: selection.state === 'SELECTED' ? 'ACQUISITION_ACTIVE' : 'AWAITING_ELIGIBLE_SOURCE', parameters: { selection }
  });
  const actions = [];
  if (result.decision.outcome === 'APPLY') {
    const action = planned(policy, result.decision, result.desired, { incidentId: incident.incident.id, subjectType: 'EVIDENCE_NEED', subjectId: need.id,
      type: policy.actionTemplate.type, safetyClass: policy.actionTemplate.safetyClass, requiredCapabilities: policy.actionTemplate.requiredCapabilities,
      target: { sourceId: selection.selectedSourceId, needId: need.id }, parameters: { need },
      postcondition: { kind: 'ACQUISITION_REQUEST_STATUS', needId: need.id, status: 'ACTIVE' }, reasons: result.decision.reasons }, existingActions);
    if (action) actions.push(action);
  }
  return { decisions: [result.decision], desiredStates: result.desired ? [result.desired] : [], actions, selections: [selection] };
}

function planExistingRequest({ incident, request, policies, at, sources, existingActions }) {
  const selectedSource = sources.get(request.sourceId), facts = { incidentId: incident.incident.id, subjectType: 'ACQUISITION_REQUEST', subjectId: request.id, selectedSource, activeRequest: request };
  const decisions = [], desiredStates = [], actions = [];
  for (const kind of [POLICY_KINDS.SOURCE_STALE, POLICY_KINDS.PROVIDER_UNAVAILABLE]) {
    const policy = policies.get(kind), state = kind === POLICY_KINDS.SOURCE_STALE ? 'SOURCE_RESELECTION_REQUIRED' : 'PROVIDER_BACKOFF_ACTIVE';
    const result = decisionState(policy, facts, at, { subjectType: 'ACQUISITION_REQUEST', subjectId: request.id, state, parameters: { requestId: request.id, sourceId: request.sourceId } });
    decisions.push(result.decision); if (result.desired) desiredStates.push(result.desired);
    if (result.decision.outcome === 'APPLY') {
      const action = planned(policy, result.decision, result.desired, { incidentId: incident.incident.id, subjectType: 'ACQUISITION_REQUEST', subjectId: request.id,
        type: policy.actionTemplate.type, safetyClass: policy.actionTemplate.safetyClass, requiredCapabilities: policy.actionTemplate.requiredCapabilities,
        target: { sourceId: request.sourceId, requestId: request.id }, parameters: { request },
        postcondition: { kind: 'ACQUISITION_REQUEST_NOT_ACTIVE', requestId: request.id }, reasons: result.decision.reasons }, existingActions);
      if (action) actions.push(action);
    }
  }
  return { decisions, desiredStates, actions };
}

function planIncidentPolicies({ incident, policies, twin, at, requests, existingActions, consequentialIntent }) {
  const decisions = [], desiredStates = [], actions = [], openRequests = requests.filter((item) => item.incidentId === incident.incident.id && ['ACTIVE', 'BACKOFF'].includes(item.status));
  const contradictionWork = twin.controlPlane.workItems.find((item) => item.incidentId === incident.incident.id && item.kind === 'CONTRADICTION_RESOLUTION' && item.status === 'ACTIVE');
  const qualifyingFamilies = new Set(incident.evaluation.qualifyingEvidence.map((item) => item.sourceFamilyId).filter(Boolean));
  const sourceFamilies = new Map(twin.sourceHealth.sources.map((item) => [item.sourceId, item.familyId]));
  const resolvedRequestIds = openRequests.filter((item) => qualifyingFamilies.has(sourceFamilies.get(item.sourceId))).map((item) => item.id).sort();
  const blockingContradictions = incident.evaluation.contradictions.filter((item) => item.blocking);
  const resolvedWorkItemIds = blockingContradictions.length ? [] : twin.controlPlane.workItems
    .filter((item) => item.incidentId === incident.incident.id && item.kind === 'CONTRADICTION_RESOLUTION' && item.status === 'ACTIVE').map((item) => item.id).sort();
  const specifications = [
    { kind: POLICY_KINDS.BLOCKING_CONTRADICTION, state: 'CONTRADICTION_WORK_OPEN', subjectType: 'INCIDENT', subjectId: incident.incident.id,
      facts: { incidentId: incident.incident.id, blockingContradictions, contradictionWork }, capability: 'control:contradiction-work',
      postcondition: { kind: 'WORK_ITEM_STATUS', workKind: 'CONTRADICTION_RESOLUTION', status: 'ACTIVE' } },
    { kind: POLICY_KINDS.SATISFIED_WORK_CLOSURE, state: 'ACQUISITION_WORK_CLOSED', subjectType: 'INCIDENT', subjectId: incident.incident.id,
      facts: { incidentId: incident.incident.id, debtCount: incident.evidenceDebt.count, openRequests, resolvedRequestIds, resolvedWorkItemIds }, capability: 'control:reversible',
      postcondition: { kind: 'NO_ACTIVE_ACQUISITION_REQUESTS', incidentId: incident.incident.id } },
    { kind: POLICY_KINDS.CONSEQUENTIAL_WARNING_GUARD, state: 'CONSEQUENTIAL_ACTION_HELD', subjectType: 'INCIDENT', subjectId: incident.incident.id,
      facts: { incidentId: incident.incident.id, consequentialIntent }, capability: 'control:consequential', postcondition: null }
  ];
  for (const spec of specifications) {
    const policy = policies.get(spec.kind), result = decisionState(policy, spec.facts, at, { subjectType: spec.subjectType, subjectId: spec.subjectId, state: spec.state, parameters: {} });
    decisions.push(result.decision); if (result.desired) desiredStates.push(result.desired);
    if (['APPLY', 'AUTHORITY_REQUIRED'].includes(result.decision.outcome)) {
      const requestIds = spec.kind !== POLICY_KINDS.SATISFIED_WORK_CLOSURE ? openRequests.map((item) => item.id).sort()
        : resolvedRequestIds.length ? resolvedRequestIds : spec.facts.debtCount === 0 ? openRequests.map((item) => item.id).sort() : [];
      const workItemIds = spec.kind === POLICY_KINDS.SATISFIED_WORK_CLOSURE ? resolvedWorkItemIds : [];
      const postcondition = spec.kind === POLICY_KINDS.SATISFIED_WORK_CLOSURE ? { kind: 'RESOLVED_WORK_CLOSED', requestIds, workItemIds } : spec.postcondition;
      const target = spec.kind === POLICY_KINDS.SATISFIED_WORK_CLOSURE ? { incidentId: incident.incident.id, requestIds, workItemIds } : { incidentId: incident.incident.id };
      const action = planned(policy, result.decision, result.desired, { incidentId: incident.incident.id, subjectType: spec.subjectType, subjectId: spec.subjectId,
        type: policy.actionTemplate.type, safetyClass: policy.actionTemplate.safetyClass, requiredCapabilities: policy.actionTemplate.requiredCapabilities ?? [spec.capability], target,
        parameters: { requestIds, workItemIds }, postcondition, reasons: result.decision.reasons }, existingActions);
      if (action) actions.push(action);
    }
  }
  return { decisions, desiredStates, actions };
}

function merge(target, part) { for (const key of ['decisions', 'desiredStates', 'actions', 'selections']) target[key].push(...(part[key] ?? [])); }

export function planControlCycle({ twin, policies, at, consequentialIntentByIncident = {} } = {}) {
  const evaluatedAt = isoTime(at, 'control_cycle_time_required'), active = byKind(effectivePolicies(policies, evaluatedAt));
  for (const kind of Object.values(POLICY_KINDS)) if (!active.has(kind)) throw new Error(`effective_control_policy_required:${kind}`);
  const result = { decisions: [], desiredStates: [], actions: [], selections: [] }, requests = twin.controlPlane.acquisitionRequests, sources = sourceMap(twin), existingActions = twin.controlPlane.actions;
  for (const incident of twin.incidents) {
    const incidentRequests = activeRequests(twin, incident.incident.id);
    for (const request of incidentRequests) merge(result, planExistingRequest({ incident, request, policies: active, at: evaluatedAt, sources, existingActions }));
    for (const need of incident.evidenceDebt.needs) merge(result, planNeed({ incident, need, policies: active, twin, at: evaluatedAt, requests: incidentRequests, sources, existingActions }));
    merge(result, planIncidentPolicies({ incident, policies: active, twin, at: evaluatedAt, requests, existingActions,
      consequentialIntent: Boolean(consequentialIntentByIncident[incident.incident.id]) }));
  }
  for (const key of ['decisions', 'desiredStates', 'actions']) result[key].sort((left, right) => String(left.id ?? left.decisionId).localeCompare(String(right.id ?? right.decisionId)));
  const core = { schemaVersion: 'vigia.control-cycle-plan.v1', evaluatedAt, observedProjectionHash: twin.projectionHash, ...result };
  return immutable({ ...core, planHash: semanticHash('control-cycle-plan', core) });
}
