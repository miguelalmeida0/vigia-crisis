import { semanticHash } from '../intelligence/shared.mjs';
import { normalizedSource, optionalInstant, stablePlanningId } from './contracts.mjs';
import { idOf, projectionEnvelope, rows, text, unique } from './projection-helpers.mjs';

function ownedDeadlineItem(item, kind, index) {
  const owner = text(item.owner ?? item.ownerId);
  const deadline = optionalInstant(item.deadline ?? item.dueAt);
  return {
    ...structuredClone(item),
    [`${kind.toLowerCase()}Id`]: idOf(item, stablePlanningId(`operational-period-${kind.toLowerCase()}`, { index, item })),
    owner,
    deadline,
    state: 'PROPOSED',
    execution: false,
    lifecycleComplete: Boolean(owner && deadline),
  };
}

export function projectOperationalPeriod(input, commandIntent, asOf) {
  if (!input && commandIntent.state === 'NO_INTENT') return projectionEnvelope('vigia.operational-period-proposal.v1', 'NO_PROPOSAL_INPUT', null, 'No governed operational-period proposal input is available.');
  const source = input ?? {};
  const objectives = rows(source.objectives).map((item, index) => ownedDeadlineItem(item, 'OBJECTIVE', index));
  if (!objectives.length && commandIntent.value?.objective) objectives.push(ownedDeadlineItem(commandIntent.value.objective, 'OBJECTIVE', 0));
  const tactics = rows(source.tactics).map((item, index) => ownedDeadlineItem(item, 'TACTIC', index));
  const assignments = rows(source.assignments).map((item, index) => ownedDeadlineItem(item, 'ASSIGNMENT', index));
  if (!assignments.length) assignments.push(...rows(commandIntent.value?.assignments).map((item, index) => ownedDeadlineItem(item, 'ASSIGNMENT', index)));
  const resourceNeeds = rows(source.resourceNeeds).map((item, index) => ownedDeadlineItem(item, 'RESOURCE_NEED', index));
  if (!resourceNeeds.length) resourceNeeds.push(...rows(commandIntent.value?.resourceRecommendations).map((item, index) => ownedDeadlineItem(item, 'RESOURCE_NEED', index)));
  const decisionGates = rows(source.decisionGates).map((item, index) => ownedDeadlineItem(item, 'DECISION_GATE', index));
  const communications = rows(source.communications).map((item, index) => ({ ...structuredClone(item), communicationId: idOf(item, stablePlanningId('operational-period-communication', { index, item })), source: normalizedSource(item), state: 'PROPOSED' }));
  const safetyConstraints = rows(source.safetyConstraints).map((item, index) => ({ constraintId: idOf(item, stablePlanningId('operational-period-safety', { index, item })), constraint: text(item.constraint ?? item.description ?? item), authority: text(item.authority), state: 'PROPOSED' }));
  const periodStart = optionalInstant(source.periodStart ?? source.startsAt ?? commandIntent.value?.periodStart);
  const periodEnd = optionalInstant(source.periodEnd ?? source.endsAt ?? commandIntent.value?.periodEnd);
  const periodBoundarySource = source.periodStart || source.startsAt || source.periodEnd || source.endsAt
    ? 'GOVERNED_OPERATIONAL_PERIOD_INPUT'
    : commandIntent.value?.periodBoundarySource ?? null;
  const periodOrderValid = Boolean(periodStart && periodEnd && Date.parse(periodEnd) > Date.parse(periodStart));
  const periodOpenAtProjection = Boolean(periodEnd && Date.parse(periodEnd) > Date.parse(asOf));
  const ownedItems = [...objectives, ...tactics, ...assignments, ...resourceNeeds, ...decisionGates];
  const missing = [
    !periodStart ? 'PERIOD_START' : null,
    !periodEnd ? 'PERIOD_END' : null,
    periodStart && periodEnd && !periodOrderValid ? 'PERIOD_CHRONOLOGY' : null,
    periodEnd && !periodOpenAtProjection ? 'PERIOD_ALREADY_ENDED' : null,
    !objectives.length ? 'OBJECTIVE' : null,
    ...ownedItems.flatMap((item) => [!item.owner ? `${item.objectiveId ?? item.tacticId ?? item.assignmentId ?? item.resource_needId ?? item.decision_gateId}:OWNER` : null, !item.deadline ? `${item.objectiveId ?? item.tacticId ?? item.assignmentId ?? item.resource_needId ?? item.decision_gateId}:DEADLINE` : null]),
  ].filter(Boolean);
  const value = {
    operationalPeriodId: idOf(source, stablePlanningId('operational-period-proposal', { periodStart, periodEnd, asOf })),
    generatedAt: asOf,
    periodStart,
    periodEnd,
    periodBoundarySource,
    objectives,
    tactics,
    assignments,
    resourceNeeds,
    communications,
    safetyConstraints,
    decisionGates,
    intentCollectionRequirements: structuredClone(rows(commandIntent.value?.collectionRequirements)),
    intentWatchConditions: structuredClone(rows(commandIntent.value?.watchConditions)),
    protectionDraft: commandIntent.value?.protectionDraft ? structuredClone(commandIntent.value.protectionDraft) : null,
    owners: unique(ownedItems.map((item) => item.owner)),
    deadlines: unique(ownedItems.map((item) => item.deadline)),
    missing,
    approvalState: 'HUMAN_APPROVAL_REQUIRED',
    approvalRequired: true,
    humanApprovalRequired: true,
    mutationExecuted: false,
    assignmentsCreated: false,
    resourcesDispatched: false,
    truthBoundary: 'This is a proposed operational period. No objective, tactic, assignment, resource request, acknowledgement, or execution is claimed until persisted by the governed command workflow.',
  };
  return projectionEnvelope('vigia.operational-period-proposal.v1', missing.length ? 'BLOCKED_INCOMPLETE' : 'READY_FOR_HUMAN_APPROVAL', { ...value, proposalHash: semanticHash('operational-period-proposal', value) });
}
