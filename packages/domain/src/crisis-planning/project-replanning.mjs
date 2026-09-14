import { semanticHash, stableStringify } from '../intelligence/shared.mjs';
import { CRISIS_REPLAN_TRIGGER_TYPES, normalizedSource, optionalInstant } from './contracts.mjs';
import { idOf, projectionEnvelope, rows, text, unique } from './projection-helpers.mjs';

const REPLAN_TRIGGER_SET = new Set(CRISIS_REPLAN_TRIGGER_TYPES);

function closureIds(responseCapability, triggers) {
  return unique([
    ...rows(responseCapability?.roadContext?.closures).map((closure) => idOf(closure)).filter(Boolean),
    ...triggers.flatMap((trigger) => trigger.closureIds ?? [trigger.closureId]).filter(Boolean),
  ]);
}

function planDiff(oldPlan, newPlan) {
  const changes = [];
  const oldAssignments = new Map(rows(oldPlan?.assignments).map((item) => [idOf(item), item]));
  const newAssignments = new Map(rows(newPlan?.assignments).map((item) => [idOf(item), item]));
  for (const id of unique([...oldAssignments.keys(), ...newAssignments.keys()])) {
    const before = oldAssignments.get(id) ?? null;
    const after = newAssignments.get(id) ?? null;
    if (stableStringify(before) !== stableStringify(after)) changes.push({ path: `assignments.${id}`, before: structuredClone(before), after: structuredClone(after), requiresApproval: true });
  }
  for (const field of ['evacuationCorridorId', 'protectionActionId', 'priorityState', 'authorityState', 'safetyConstraints', 'watchConditions']) {
    if (stableStringify(oldPlan?.[field] ?? null) !== stableStringify(newPlan?.[field] ?? null)) changes.push({ path: field, before: structuredClone(oldPlan?.[field] ?? null), after: structuredClone(newPlan?.[field] ?? null), requiresApproval: true });
  }
  return changes;
}

export function projectAutonomousReplanning({ replanning, triggers, resourceOptimizer, evacuationCorridor, responseCapability, asOf }) {
  const qualifiedTriggers = [];
  const rejectedTriggers = [];
  const closures = rows(responseCapability?.roadContext?.closures);
  for (const trigger of rows(triggers)) {
    const type = String(trigger.type ?? trigger.triggerType ?? '').toUpperCase();
    const linkedClosure = type === 'ROAD_CLOSURE'
      ? closures.find((closure) => idOf(closure) === text(trigger.closureId) || (trigger.closureIds ?? []).map(String).includes(String(idOf(closure))))
      : null;
    const explicitSource = normalizedSource(trigger);
    const sourceReference = text(trigger.sourceReference);
    const source = explicitSource.attributable
      ? explicitSource
      : sourceReference && idOf(trigger)
        ? { sourceId: 'CRISIS_AUTOPILOT_TRIGGER', reference: sourceReference, attributable: true }
        : normalizedSource(linkedClosure ?? {});
    const observedAt = optionalInstant(trigger.observedAt ?? trigger.at ?? linkedClosure?.observedAt);
    const validUntil = optionalInstant(trigger.validUntil ?? linkedClosure?.validUntil);
    const future = observedAt && Date.parse(observedAt) > Date.parse(asOf);
    const expired = validUntil && Date.parse(validUntil) <= Date.parse(asOf);
    const stale = /STALE|EXPIRED|HISTORICAL|UNAVAILABLE/.test(String(trigger.freshness ?? linkedClosure?.freshness ?? '').toUpperCase());
    if (!REPLAN_TRIGGER_SET.has(type) || !observedAt || !source.attributable || future || expired || stale) {
      rejectedTriggers.push({ triggerId: idOf(trigger), type, reason: !REPLAN_TRIGGER_SET.has(type) ? 'UNSUPPORTED_TRIGGER_TYPE' : !observedAt ? 'TRIGGER_TIME_REQUIRED' : !source.attributable ? 'ATTRIBUTABLE_TRIGGER_SOURCE_REQUIRED' : future ? 'FUTURE_TRIGGER_TIME_REJECTED' : expired ? 'TRIGGER_VALIDITY_EXPIRED' : 'STALE_TRIGGER_REJECTED' });
      continue;
    }
    qualifiedTriggers.push({ ...structuredClone(trigger), type, observedAt, source });
  }
  if (!qualifiedTriggers.length) return projectionEnvelope('vigia.autonomous-replanning.v1', 'NO_REPLAN_TRIGGER', { triggers: [], rejectedTriggers, execution: false, mutationExecuted: false });
  const oldPlan = replanning?.oldPlan;
  if (!oldPlan) return projectionEnvelope('vigia.autonomous-replanning.v1', 'WITHHELD_NO_OLD_PLAN', { triggers: qualifiedTriggers, execution: false, mutationExecuted: false }, 'An attributable current plan is required to show OLD PLAN → NEW PLAN.');
  let newPlan = replanning?.proposedPlan ? structuredClone(replanning.proposedPlan) : structuredClone(oldPlan);
  const reasons = [];
  const affectedClosures = closureIds(responseCapability, qualifiedTriggers);
  const assignmentInvalidationTriggers = qualifiedTriggers.filter((trigger) => ['ROAD_CLOSURE', 'RESOURCE_REJECTED_TASK', 'RESOURCE_UNAVAILABLE'].includes(trigger.type));
  if (assignmentInvalidationTriggers.length) {
    const impactedFacilities = new Set([
      ...assignmentInvalidationTriggers.flatMap((trigger) => trigger.affectedFacilityIds ?? [trigger.facilityId, trigger.resourceFacilityId]).filter(Boolean),
      ...rows(responseCapability?.roadContext?.closures).flatMap((closure) => closure.affectedFacilityIds ?? []).filter(Boolean),
    ].map(String));
    const recommendationByRequirement = new Map(rows(resourceOptimizer?.value?.recommendations).map((recommendation) => [recommendation.requirementId, recommendation]));
    newPlan.assignments = rows(newPlan.assignments).map((assignment) => {
      const requirementId = text(assignment.taskRequirementId ?? assignment.requirementId);
      const recommendation = recommendationByRequirement.get(requirementId);
      if (!impactedFacilities.has(String(assignment.facilityId)) || !recommendation || recommendation.facilityId === assignment.facilityId) return assignment;
      const triggerTypes = unique(assignmentInvalidationTriggers.filter((trigger) => (trigger.affectedFacilityIds ?? [trigger.facilityId, trigger.resourceFacilityId]).filter(Boolean).map(String).includes(String(assignment.facilityId))).map((trigger) => trigger.type));
      reasons.push(`${triggerTypes.join(' / ') || 'A governed resource constraint'} invalidated facility ${assignment.facilityId}; eligible routed proposal ${recommendation.facilityId} is available for human review.`);
      return { ...assignment, facilityId: recommendation.facilityId, routeEstimate: recommendation.eta, state: 'PROPOSED_REPLAN', execution: false };
    });
  }
  if (qualifiedTriggers.some((trigger) => ['ROAD_CLOSURE', 'WEATHER_CHANGED', 'FIELD_REPORT_CONTRADICTS_PLAN'].includes(trigger.type)) && oldPlan.evacuationCorridorId && evacuationCorridor?.value?.recommendedCorridor?.routeId && oldPlan.evacuationCorridorId !== evacuationCorridor.value.recommendedCorridor.routeId) {
    newPlan.evacuationCorridorId = evacuationCorridor.value.recommendedCorridor.routeId;
    reasons.push(`A governed route, weather, or contradictory field trigger affected the current corridor; ${newPlan.evacuationCorridorId} is the current eligible scenario route proposed for authority review.`);
  }
  for (const trigger of qualifiedTriggers.filter((item) => item.type === 'PRIORITY_CHANGED')) {
    const priorityState = text(trigger.newPriorityState ?? trigger.priorityState);
    if (priorityState && priorityState !== text(newPlan.priorityState)) {
      newPlan.priorityState = priorityState;
      reasons.push(`The attributable priority trigger proposes priority state ${priorityState} for human review.`);
    }
  }
  for (const trigger of qualifiedTriggers.filter((item) => item.type === 'WEATHER_CHANGED')) {
    const safetyConstraints = rows(trigger.proposedSafetyConstraints).map((item) => structuredClone(item));
    if (safetyConstraints.length) {
      newPlan.safetyConstraints = safetyConstraints;
      reasons.push('The attributable weather trigger supplied revised safety constraints for human review.');
    }
  }
  for (const trigger of qualifiedTriggers.filter((item) => item.type === 'AUTHORITY_DENIED')) {
    if (newPlan.protectionActionId && (!trigger.protectionActionId || String(trigger.protectionActionId) === String(newPlan.protectionActionId))) {
      newPlan.protectionActionId = null;
      newPlan.authorityState = 'DENIED_REPLAN_REQUIRED';
      reasons.push('The attributable authority denial removes the unapproved protection action from the proposed plan; no alternative action or authority is inferred.');
    }
  }
  for (const trigger of qualifiedTriggers.filter((item) => item.type === 'FIELD_REPORT_CONTRADICTS_PLAN')) {
    const affectedAssignments = new Set((trigger.affectedAssignmentIds ?? [trigger.assignmentId]).filter(Boolean).map(String));
    if (affectedAssignments.size) {
      newPlan.assignments = rows(newPlan.assignments).map((assignment) => affectedAssignments.has(String(idOf(assignment))) ? { ...assignment, state: 'PROPOSED_REPLAN_REVIEW', contradictionReference: trigger.source?.reference ?? null, execution: false } : assignment);
      reasons.push('An attributable field report contradicts one or more planned assignments; those assignments are proposed for review, not treated as executed or failed.');
    }
  }
  if (replanning?.proposedPlan) reasons.push(...unique(replanning.reasons ?? qualifiedTriggers.map((trigger) => `Replan trigger: ${trigger.type}`)));
  const changes = planDiff(oldPlan, newPlan);
  const value = {
    generatedAt: asOf,
    triggers: qualifiedTriggers,
    rejectedTriggers,
    trigger: qualifiedTriggers[0],
    oldPlan: structuredClone(oldPlan),
    newPlan,
    why: unique(reasons.length ? reasons : qualifiedTriggers.map((trigger) => `Replan trigger ${trigger.type} requires a new governed plan input.`)),
    whatChanged: changes,
    closureIds: affectedClosures,
    whatRequiresApproval: changes.map((change) => change.path),
    requiresApproval: changes.length > 0,
    approvalState: changes.length ? 'HUMAN_APPROVAL_REQUIRED' : 'NO_APPROVABLE_CHANGE',
    mutationExecuted: false,
    dispatchesExecuted: 0,
    execution: false,
    truthBoundary: 'Replanning produces a proposed diff. It does not mutate the canonical plan, dispatch resources, authorize evacuation or protection, or claim execution.',
  };
  return projectionEnvelope('vigia.autonomous-replanning.v1', changes.length ? 'NEW_PLAN_READY_FOR_APPROVAL' : 'TRIGGERED_BUT_NO_GOVERNED_ALTERNATIVE', { ...value, proposalHash: semanticHash('autonomous-replan-proposal', value) });
}

