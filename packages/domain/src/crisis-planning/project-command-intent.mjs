import { semanticHash } from '../intelligence/shared.mjs';
import { optionalInstant, stablePlanningId } from './contracts.mjs';
import { finite, idOf, projectionEnvelope, rows, text, unique } from './projection-helpers.mjs';
const INTENT_TYPES = new Set(['PROTECT_AREA', 'KEEP_ACCESS_OPEN', 'VERIFY_ROUTE', 'PREPARE_PROTECTION_DRAFT']);
const INTENT_BLUEPRINTS = Object.freeze({
  PROTECT_AREA: Object.freeze({
    assignments: Object.freeze([
      ['ASSESS_PROTECTION_READINESS', 'Assess governed protection readiness and unresolved authority needs.'],
      ['MAINTAIN_TARGET_WATCH', 'Maintain an attributable watch on the named target until the decision deadline.'],
      ['PREPARE_PROTECTION_OPTIONS', 'Prepare bounded protection options for human authority review.'],
    ]),
    resources: Object.freeze([
      ['CIVIL_PROTECTION', 'TEAMS', 'Review governed civil-protection capacity for the named target.'],
      ['FIRE_STATION', 'WILDFIRE_CREWS', 'Review governed wildfire-response capacity needed to preserve protection coverage.'],
    ]),
  }),
  KEEP_ACCESS_OPEN: Object.freeze({
    assignments: Object.freeze([
      ['MONITOR_ACCESS_STATE', 'Monitor attributable access and closure reports for the named route.'],
      ['PREPARE_ACCESS_CONTINGENCY', 'Prepare an alternative access option if the current route becomes ineligible.'],
    ]),
    resources: Object.freeze([
      ['POLICE', 'UNITS', 'Review governed traffic-control capacity; no deployment is implied.'],
      ['CIVIL_PROTECTION', 'TEAMS', 'Review governed route-support capacity for a contingency.'],
    ]),
  }),
  VERIFY_ROUTE: Object.freeze({
    assignments: Object.freeze([
      ['VERIFY_ROUTE_STATE', 'Obtain an attributable current route-state observation.'],
      ['REVIEW_ROUTE_EVIDENCE', 'Reconcile the route observation with current governed road context.'],
    ]),
    resources: Object.freeze([
      ['CIVIL_PROTECTION', 'TEAMS', 'Review a governed field-verification team only if remote sources cannot resolve the route.'],
    ]),
  }),
  PREPARE_PROTECTION_DRAFT: Object.freeze({
    assignments: Object.freeze([
      ['COMPOSE_PROTECTION_DRAFT', 'Complete the canonical protection-message fields from attributable information.'],
      ['VALIDATE_PROTECTION_DRAFT', 'Validate message structure, scope, timing, and truth boundaries.'],
      ['IDENTIFY_PROTECTION_AUTHORITY', 'Identify the authorized reviewer without granting authority.'],
    ]),
    resources: Object.freeze([
      ['CIVIL_PROTECTION', 'TEAMS', 'Review liaison capacity required to validate target and audience information.'],
    ]),
  }),
});
const PROTECTION_DRAFT_FIELDS = Object.freeze(['whatHappened', 'where', 'whoIsAffected', 'whatToDo', 'whatNotToDo', 'when', 'authority', 'nextUpdate']);
function commandIntentProtectionDraft(input, { intentId, intentType, statement, target, owner, deadline }) {
  if (!['PROTECT_AREA', 'PREPARE_PROTECTION_DRAFT'].includes(intentType)) return null;
  const supplied = input.protectionMessage && typeof input.protectionMessage === 'object' && !Array.isArray(input.protectionMessage) ? input.protectionMessage : {};
  const message = Object.fromEntries(PROTECTION_DRAFT_FIELDS.map((field) => [field, text(field === 'where' ? supplied[field] ?? target : supplied[field])]));
  const missingFields = PROTECTION_DRAFT_FIELDS.filter((field) => !message[field]);
  const sourceByField = Object.fromEntries(PROTECTION_DRAFT_FIELDS.map((field) => [field, message[field] ? (field === 'where' && !supplied[field] ? 'OPERATOR_CONFIRMED_TARGET' : 'OPERATOR_SUPPLIED_DRAFT') : null]));
  const draftLines = [
    'DRAFT — NOT APPROVED OR SENT',
    `Operator intent: ${statement}`,
    ...PROTECTION_DRAFT_FIELDS.map((field) => `${field}: ${message[field] ?? '[REQUIRED BEFORE REVIEW]'}`),
  ];
  return {
    draftId: stablePlanningId('command-intent-protection-draft', { intentId, target }),
    state: missingFields.length ? 'INCOMPLETE_REVIEW_DRAFT' : 'READY_FOR_MESSAGE_VALIDATION',
    target,
    owner,
    decisionDeadline: deadline,
    operatorIntent: statement,
    message,
    sourceByField,
    missingFields,
    draftText: draftLines.join('\n'),
    authorityState: 'NOT_GRANTED',
    validationState: 'NOT_VALIDATED',
    liveSend: false,
    deliveryState: 'NOT_SENT',
    truthBoundary: 'This bounded draft contains only the confirmed target and operator-supplied message fields. Missing facts remain explicit; it is not authority, an approved warning, delivery, or protective action.',
  };
}
export function projectCommandIntent(input, asOf) {
  if (!input) return projectionEnvelope('vigia.command-intent-proposal.v1', 'NO_INTENT', null, 'No operator command intent was supplied.');
  const intentId = idOf(input, stablePlanningId('command-intent', input));
  const statement = text(input.statement ?? input.intent);
  const intentType = text(input.intentType ?? input.type)?.toUpperCase() ?? null;
  const requestedBy = text(input.requestedBy ?? input.operatorId);
  const owner = text(input.owner ?? input.proposedOwner);
  const target = text(input.target ?? input.area ?? input.routeId);
  const deadline = optionalInstant(input.deadline);
  const periodStart = optionalInstant(input.periodStart);
  const periodEnd = optionalInstant(input.periodEnd);
  const confirmedBy = text(input.confirmation?.confirmedBy);
  const confirmedAt = optionalInstant(input.confirmation?.confirmedAt);
  const confirmation = input.confirmation?.state === 'CONFIRMED' && confirmedBy && confirmedAt && confirmedBy === requestedBy
    ? { state: 'CONFIRMED', confirmedBy, confirmedAt }
    : { state: 'REQUIRED', confirmedBy: null, confirmedAt: null };
  if (!statement || !requestedBy || !INTENT_TYPES.has(intentType) || !target) {
    return projectionEnvelope('vigia.command-intent-proposal.v1', 'NEEDS_STRUCTURED_INTENT', {
      intentId, statement, intentType, requestedBy, owner, target, deadline, periodStart, periodEnd,
      supportedIntentTypes: [...INTENT_TYPES],
      mutationsExecuted: false,
    }, 'A statement, requester, supported structured intent type, and target are required before compilation.');
  }
  const objective = {
    objectiveId: stablePlanningId('intent-objective', { intentId, target }),
    statement,
    target,
    owner,
    deadline,
    executionState: 'PROPOSED',
  };
  const accessIntent = intentType === 'VERIFY_ROUTE' || intentType === 'KEEP_ACCESS_OPEN';
  const collectionRequirements = [{
    requirementId: stablePlanningId('intent-collection-requirement', { intentId, target, intentType }),
    question: accessIntent
      ? `What is the current attributable access state for ${target}?`
      : `What attributable target, audience, exposure, and authority facts are available for protection planning at ${target}?`,
    target,
    owner,
    deadline,
    evidenceRequired: unique(input.requiredEvidence ?? (accessIntent
      ? ['ATTRIBUTABLE_CURRENT_ROAD_OBSERVATION']
      : ['ATTRIBUTABLE_CURRENT_TARGET_CONTEXT', 'CURRENT_AUTHORITY_SCOPE'])),
    state: 'PROPOSED',
    satisfactionState: 'NOT_EVALUATED',
  }];
  const blueprint = INTENT_BLUEPRINTS[intentType];
  const assignments = blueprint.assignments.map(([task, description], index) => ({
    assignmentId: stablePlanningId('intent-assignment', { intentId, task, target, index }),
    objective: statement,
    task,
    description,
    target,
    owner,
    deadline,
    state: 'PROPOSED',
    acknowledgementState: 'NOT_REQUESTED',
    execution: false,
  }));
  const suppliedResourceRequirements = rows(input.resourceRequirements);
  const resourceDefinitions = blueprint.resources.map(([requiredKind, requiredResourceType, purpose]) => ({ requiredKind, requiredResourceType, purpose }));
  for (const supplied of suppliedResourceRequirements) {
    const suppliedType = String(supplied.requiredResourceType ?? supplied.resourceType ?? '').toUpperCase();
    const suppliedKinds = unique(supplied.requiredFacilityKinds ?? [supplied.requiredKind ?? supplied.kind]);
    const matchingIndex = resourceDefinitions.findIndex((definition) => definition.requiredResourceType === suppliedType
      && (!suppliedKinds.length || suppliedKinds.includes(definition.requiredKind)));
    if (matchingIndex >= 0) resourceDefinitions[matchingIndex] = { ...resourceDefinitions[matchingIndex], ...structuredClone(supplied) };
    else resourceDefinitions.push({ ...structuredClone(supplied), requiredKind: suppliedKinds[0] ?? null, requiredResourceType: suppliedType || null, purpose: text(supplied.purpose) ?? 'Review the operator-specified governed resource requirement.' });
  }
  const resourceRecommendations = resourceDefinitions.map((definition, index) => {
    const requiredKind = text(definition.requiredKind ?? definition.kind)?.toUpperCase() ?? null;
    const requiredFacilityKinds = unique(definition.requiredFacilityKinds ?? [requiredKind]);
    const requiredResourceType = text(definition.requiredResourceType ?? definition.resourceType)?.toUpperCase() ?? null;
    const purpose = text(definition.purpose) ?? 'Review governed incident-relevant capacity.';
    const supplied = definition;
    const requiredQuantity = finite(supplied.requiredQuantity ?? supplied.quantity);
    return {
      requirementId: idOf(supplied, stablePlanningId('intent-resource-requirement', { intentId, requiredKind, requiredResourceType, index })),
      requiredKind,
      requiredFacilityKinds,
      requiredResourceType,
      requiredQuantity: requiredQuantity !== null && requiredQuantity > 0 ? requiredQuantity : null,
      quantityState: requiredQuantity !== null && requiredQuantity > 0 ? 'OPERATOR_SUPPLIED' : 'REQUIRED_BEFORE_OPTIMIZATION',
      minimumCrewSize: finite(supplied.minimumCrewSize),
      maxTravelTimeMinutes: finite(supplied.maxTravelTimeMinutes),
      stagingRequired: supplied.stagingRequired === true,
      requiredCapabilities: unique(supplied.requiredCapabilities ?? []),
      tradeOffs: unique(supplied.tradeOffs ?? []),
      purpose,
      target,
      owner,
      deadline,
      proposedAction: 'REVIEW_GOVERNED_CAPABILITY',
      recommendationState: 'PLANNING_NEED_ONLY',
      availabilityState: 'NOT_EVALUATED',
      commitmentState: 'NOT_EVALUATED',
      assignmentState: 'NOT_CREATED',
      dispatchState: 'NOT_DISPATCHED',
      execution: false,
    };
  });
  const protectionDraft = commandIntentProtectionDraft(input, { intentId, intentType, statement, target, owner, deadline });
  const watchConditions = [{ conditionId: stablePlanningId('intent-watch-condition', { intentId, target }), condition: text(input.watchCondition) ?? `${target} context materially changes`, owner, reviewAt: deadline, state: 'PROPOSED' }];
  const periodOrderValid = Boolean(periodStart && periodEnd && Date.parse(periodEnd) > Date.parse(periodStart));
  const missing = [
    !owner ? 'OWNER' : null,
    !deadline ? 'DEADLINE' : null,
    !periodStart ? 'PERIOD_START' : null,
    !periodEnd ? 'PERIOD_END' : null,
    periodStart && periodEnd && !periodOrderValid ? 'PERIOD_CHRONOLOGY' : null,
  ].filter(Boolean);
  const value = {
    intentId,
    statement,
    intentType,
    target,
    requestedBy,
    requestedAt: optionalInstant(input.requestedAt ?? input.confirmation?.confirmedAt) ?? asOf,
    periodStart,
    periodEnd,
    periodBoundarySource: periodStart && periodEnd ? 'OPERATOR_SUPPLIED_COMMAND_INTENT' : null,
    intent: { statement, intentType, target, requestedBy },
    objective,
    collectionRequirements,
    assignments,
    resourceRecommendations,
    protectionDraft,
    watchConditions,
    missing,
    confirmation,
    requiresHumanConfirmation: confirmation.state !== 'CONFIRMED',
    humanConfirmationRequired: confirmation.state !== 'CONFIRMED',
    proposedOnly: true,
    mutationExecuted: false,
    mutationsExecuted: false,
    consequentialExecution: false,
    truthBoundary: 'Compilation creates reviewable proposals only. It does not create canonical objectives, tasks, assignments, authority, warning delivery, or execution.',
  };
  return projectionEnvelope('vigia.command-intent-proposal.v1', missing.length ? 'BLOCKED_INCOMPLETE' : confirmation.state === 'CONFIRMED' ? 'CONFIRMED_FOR_COMPILATION' : 'READY_FOR_HUMAN_CONFIRMATION', { ...value, proposalHash: semanticHash('command-intent-proposal', value) });
}
