import { immutable, semanticHash } from '../intelligence/shared.mjs';
import {
  COMMAND_STAFF_ROLES,
  CRISIS_AUTOPILOT_ACTIONS_BY_TRIGGER,
  CRISIS_AUTOPILOT_TRIGGER_TYPES,
  collectionWorkLifecycle,
  incidentBinding,
  isActiveWork,
  objectId,
  requiredIncidentId,
  requiredProjectionClock,
  stateOf,
  validInstant,
  workLastCheck,
  workNextCheck,
  workOwner,
  workSource,
} from './contracts.mjs';
import { projectDecisionIntelligence } from './decision-intelligence.mjs';
import { projectDecisionCouncil } from './decision-council.mjs';
import { projectUnknownUnknownSentinel } from './sentinel.mjs';
import { projectStrategicCrisisIntelligence } from './strategic-intelligence.mjs';
import { projectValueOfInformation } from './value-of-information.mjs';
import { projectLivingIncidentTwin } from './living-incident-twin.mjs';

function scoped(rows, incidentId) {
  const canonicalIncidentId = String(incidentId).replace(/^incident:/, '');
  return (Array.isArray(rows) ? rows : []).filter(Boolean).filter((item) => {
    const binding = incidentBinding(item);
    return !binding || binding === canonicalIncidentId;
  });
}

function trigger(value, incidentId, asOf, index) {
  const type = String(value.type ?? value.triggerType ?? '').toUpperCase();
  if (!CRISIS_AUTOPILOT_TRIGGER_TYPES.includes(type)) throw new Error(`crisis_autopilot_trigger_type_invalid:${type || index}`);
  const observedAt = validInstant(value.observedAt ?? value.at);
  if (!observedAt) throw new Error(`crisis_autopilot_trigger_time_required:${type}`);
  if (Date.parse(observedAt) > Date.parse(asOf)) return null;
  const core = {
    triggerId: String(value.id ?? value.triggerId ?? semanticHash('crisis-autopilot-trigger-id', { incidentId, type, observedAt, sourceReference: value.sourceReference ?? value.sourceId ?? null })),
    type, incidentId, observedAt, sourceReference: value.sourceReference ?? value.sourceId ?? null,
    evidenceReferences: [...new Set((value.evidenceReferences ?? value.evidenceIds ?? []).map(String))].sort(),
    qualification: value.qualification ?? 'CANONICAL_CHANGE_SIGNAL',
  };
  return { ...core, fingerprint: semanticHash('crisis-autopilot-trigger', core) };
}

function derivedTriggers(sentinel, incidentId, asOf) {
  return sentinel.anomalies.flatMap((item) => {
    const type = item.type === 'ATTRIBUTABLE_SOURCE_CONFLICT' ? 'SOURCE_CONFLICT' : ['EXPECTED_PROVIDER_SILENT', 'PROVIDER_DEGRADED'].includes(item.type) ? 'PROVIDER_FAILURE' : item.type === 'PROTECTION_THRESHOLD_WITHOUT_AUTHORITY_ITEM' ? 'PROTECTION_THRESHOLD_REACHED' : null;
    const projected = type ? trigger({ id: `trigger:${item.anomalyId}`, type, observedAt: item.detectedAt, sourceReference: item.anomalyId, evidenceReferences: item.evidenceReferences, qualification: 'DERIVED_ANOMALY_TRIGGER' }, incidentId, asOf, 0) : null;
    return projected ? [projected] : [];
  });
}

function activeWorkProjection(item, category, asOf) {
  const id = objectId(item);
  return {
    activityId: `autopilot-active:${id}`, category, state: stateOf(item),
    summary: item.title ?? item.objective ?? item.question ?? item.requirement ?? item.missingQuantity ?? `${category} ${id}`,
    owner: workOwner(item), source: workSource(item), lastCheckedAt: workLastCheck(item), nextCheckAt: workNextCheck(item),
    unlockCondition: item.unlockCondition ?? item.strongerClaim ?? item.expectedPostcondition ?? null,
    backingObjectIds: [id].filter(Boolean), lifecycleComplete: Boolean(workOwner(item) && (workSource(item) || category === 'ASSIGNMENT') && workNextCheck(item)),
    lifecycle: collectionWorkLifecycle(item, { asOf }),
    truthEffect: 'WORK_LIFECYCLE_ONLY',
  };
}

function doingNow(collectionWork, assignments, asOf) {
  const rows = [
    ...collectionWork.filter((item) => isActiveWork(item, { asOf })).map((item) => activeWorkProjection(item, 'COLLECTION', asOf)),
    ...assignments.filter((item) => isActiveWork(item, { asOf })).map((item) => activeWorkProjection(item, 'ASSIGNMENT', asOf)),
  ];
  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.category}:${row.summary}:${row.owner ?? 'UNOWNED'}:${row.source ?? 'UNSOURCED'}`;
    const prior = grouped.get(key);
    if (!prior) grouped.set(key, row);
    else grouped.set(key, { ...prior, backingObjectIds: [...new Set([...prior.backingObjectIds, ...row.backingObjectIds])].sort(), nextCheckAt: [prior.nextCheckAt, row.nextCheckAt].filter(Boolean).sort()[0] ?? null, lastCheckedAt: [prior.lastCheckedAt, row.lastCheckedAt].filter(Boolean).sort().at(-1) ?? null, lifecycleComplete: prior.lifecycleComplete && row.lifecycleComplete });
  }
  return [...grouped.values()].sort((left, right) => (left.nextCheckAt ? Date.parse(left.nextCheckAt) : Number.MAX_SAFE_INTEGER) - (right.nextCheckAt ? Date.parse(right.nextCheckAt) : Number.MAX_SAFE_INTEGER) || left.activityId.localeCompare(right.activityId));
}

function proposedAction(actionType, cause, extras = {}) {
  const core = { actionType, causeType: cause.type ?? cause.state, causeId: cause.triggerId ?? cause.id ?? cause.anomalyId ?? null, incidentId: cause.incidentId, executionState: 'PROPOSED', requiresHumanApproval: actionType.includes('PROTECTION') || actionType.includes('AUTHORITY') || actionType.includes('ASSIGNMENT'), canonicalTruthMutation: false, consequentialExecution: false, ...extras };
  return { ...core, proposalId: semanticHash('crisis-autopilot-proposal', core) };
}

function nextActions({ triggers, valueOfInformation, uncertaintyBudget, sentinel, decisionCompression, incidentId }) {
  const proposals = [];
  for (const item of triggers) for (const actionType of CRISIS_AUTOPILOT_ACTIONS_BY_TRIGGER[item.type] ?? []) proposals.push(proposedAction(actionType, item));
  const best = valueOfInformation.bestNextCollectionAction;
  if (best?.state === 'READY_TO_SCHEDULE') proposals.push(proposedAction('CREATE_OR_UPDATE_COLLECTION_TASK', { type: 'VALUE_OF_INFORMATION', id: best.candidateId, incidentId }, { candidateId: best.candidateId, question: best.question, expectedDecisionImpact: best.expectedDecisionImpact }));
  for (const item of uncertaintyBudget.items.filter((row) => row.state === 'UNKNOWN_BLOCKING_ACTION')) {
    if (!item.backingWorkId) {
      proposals.push(proposedAction('CREATE_OR_UPDATE_INFORMATION_REQUIREMENT', { type: item.state, id: item.id, incidentId }, { unknownId: item.id, unlockCondition: item.unlockCondition }));
      continue;
    }
    // A blocked or overdue governed plan is intentionally excluded from
    // doingNow: it is not active machine work.  It still requires an explicit
    // lifecycle decision, otherwise an unresolved requirement disappears
    // from both Autopilot queues and becomes passive waiting.  Project the
    // truthfully derived review step without mutating truth or claiming that
    // collection, authority, or consequential execution occurred.
    if (item.nextStep) {
      proposals.push(proposedAction(item.nextStep, { type: item.state, id: item.id, incidentId }, {
        unknownId: item.id,
        backingWorkId: item.backingWorkId,
        backingWorkState: item.backingWorkState,
        owner: item.owner,
        source: item.source,
        lastCheckedAt: item.lastCheckedAt,
        nextCheckAt: item.nextCheckAt,
        unlockCondition: item.unlockCondition,
      }));
    }
  }
  for (const item of sentinel.anomalies.filter((row) => !row.currentWork)) proposals.push(proposedAction(item.whatVigiaIsDoingNext, { ...item, incidentId }));
  for (const item of decisionCompression.blockedAuthorityItems) proposals.push(proposedAction('CREATE_OR_UPDATE_AUTHORITY_REVIEW_ITEM', { type: 'BLOCKED_BY_AUTHORITY', id: item.decisionId, incidentId }, { decisionId: item.decisionId, authorityRequirement: item.authorityRequirement }));
  return [...new Map(proposals.map((item) => [item.proposalId, item])).values()].sort((left, right) => left.actionType.localeCompare(right.actionType) || left.proposalId.localeCompare(right.proposalId));
}

function advisory(role, content = null) {
  const base = { role, state: content ? 'ADVISORY' : 'ABSTAINED', summary: content?.summary ?? null, proposedAction: content?.proposedAction ?? null, basedOn: content?.basedOn ?? [], reason: content ? null : 'No governed input supports a role-specific advisory.', canMutateCanonicalTruth: false, canApproveAuthority: false, canClaimExecution: false, advisoryOnly: true };
  return base;
}

function commandStaff({ valueOfInformation, decisionCompression, regretRadar, sentinel, doing, resources, protection }) {
  const topDecision = decisionCompression.decisionsNow[0], topRegret = regretRadar.items[0], topAnomaly = sentinel.anomalies[0], best = valueOfInformation.bestNextCollectionAction;
  const rows = [
    advisory('INTELLIGENCE_OFFICER', best ? { summary: best.why, proposedAction: best.state === 'ACTIVE' ? 'MONITOR_ACTIVE_COLLECTION' : 'REVIEW_NEXT_COLLECTION_ACTION', basedOn: [best.candidateId] } : null),
    advisory('OPERATIONS_OFFICER', doing[0] ? { summary: `${doing.length} governed activities are active; the next check is ${doing[0].nextCheckAt ?? 'not recorded'}.`, proposedAction: 'REVIEW_ACTIVE_LIFECYCLES', basedOn: doing.flatMap((item) => item.backingObjectIds) } : null),
    advisory('PLANNING_OFFICER', topDecision ? { summary: topDecision.whyNow, proposedAction: 'REVIEW_DECISION_QUEUE', basedOn: [topDecision.decisionId] } : null),
    advisory('LOGISTICS_OFFICER', resources.some((item) => item.gap === true || item.state === 'GAP') ? { summary: 'A governed resource gap record is present.', proposedAction: 'REVIEW_RESOURCE_GAP', basedOn: resources.filter((item) => item.gap === true || item.state === 'GAP').map(objectId).filter(Boolean) } : null),
    advisory('SAFETY_OFFICER', topAnomaly ? { summary: topAnomaly.reason, proposedAction: topAnomaly.whatVigiaIsDoingNext, basedOn: [topAnomaly.anomalyId] } : null),
    advisory('PROTECTION_OFFICER', decisionCompression.blockedAuthorityItems[0] ? { summary: 'A protection or consequential decision is authority-bound.', proposedAction: 'REVIEW_AUTHORITY_REQUIREMENT', basedOn: [decisionCompression.blockedAuthorityItems[0].decisionId] } : null),
    advisory('PUBLIC_INFORMATION_OFFICER', protection?.alertDraft ? { summary: 'A governed protection draft exists; this advisory does not authorize or send it.', proposedAction: 'REVIEW_DRAFT_WITH_AUTHORITY', basedOn: [objectId(protection.alertDraft)].filter(Boolean) } : null),
    advisory('RED_TEAM', topRegret ? { summary: topRegret.consequenceOfDelay ?? topRegret.why, proposedAction: 'CHALLENGE_ASSUMPTIONS_AND_DELAY_COST', basedOn: [topRegret.decisionId] } : null),
  ];
  if (rows.some((item) => !COMMAND_STAFF_ROLES.includes(item.role))) throw new Error('crisis_autopilot_command_staff_role_invalid');
  return { schemaVersion: 'vigia.ai-command-staff-projection.v1', advisories: rows, safetyBoundary: 'Deterministic advisory roles may summarize, challenge, rank, propose, or abstain. They cannot mutate truth, approve authority, claim execution, or fabricate outcomes.' };
}

export function projectCrisisAutopilot(input = {}) {
  const incident = input.incident ?? input.incidentTwin?.incident ?? {}, incidentId = requiredIncidentId(incident), asOf = requiredProjectionClock(input.asOf ?? input.generatedAt);
  const informationRequirements = scoped(input.informationRequirements ?? input.evidenceNeeds, incidentId);
  const nestedCollectionTasks = informationRequirements.flatMap((requirement) => (requirement.collectionTasks ?? []).map((item) => ({
    ...item,
    incidentId: item.incidentId ?? requirement.incidentId ?? incidentId,
    evidenceNeedId: item.evidenceNeedId ?? requirement.id,
    requirementId: item.requirementId ?? requirement.id,
    requirement: item.requirement ?? requirement.question ?? requirement.missingQuantity ?? null,
    ownerPolicy: item.ownerPolicy ?? requirement.ownerPolicy ?? null,
    lastCheckedAt: item.lastCheckedAt ?? item.lastAttempt ?? requirement.currentAssessment?.lastCheckedAt ?? null,
    nextCheckAt: item.nextCheckAt ?? item.nextAttempt ?? requirement.currentAssessment?.nextCheckAt ?? null,
    unlockCondition: item.unlockCondition ?? requirement.satisfactionRule ?? null,
  })));
  const scopedCollectionWork = scoped([...(input.evidenceRequests ?? []), ...nestedCollectionTasks, ...(input.collectionTasks ?? []), ...(input.decisionPacket?.acquisitionPlan?.items ?? [])], incidentId);
  const collectionById = new Map();
  for (const [index, item] of scopedCollectionWork.entries()) { const key = objectId(item) ?? semanticHash('unidentified-collection-work', { index, item }); if (!collectionById.has(key)) collectionById.set(key, item); }
  const collectionWork = [...collectionById.values()];
  const assignments = scoped(input.assignments, incidentId), resources = scoped(input.resources, incidentId);
  const intelligence = input.intelligence ?? {}, decisionPacket = input.decisionPacket ?? null;
  const valueOfInformation = projectValueOfInformation({ decisionPacket, rankedCandidates: input.rankedCandidates, candidateAcquisitions: input.candidateAcquisitions, collectionWork, asOf });
  const decisionIntelligence = projectDecisionIntelligence({ decisionPacket, decisions: input.decisions, decisionDefinitions: input.decisionDefinitions, decisionContexts: input.decisionContexts, unknowns: intelligence.unknowns ?? input.unknowns, knowns: input.knowns, collectionWork, watchConditions: input.watchConditions, recommendations: input.recommendations, asOf, displayTargets: input.displayTargets });
  const sentinel = projectUnknownUnknownSentinel({ incident, intelligence, sourceStates: input.sourceStates, assignments, requiredContext: input.requiredContext, protection: input.protection, resolutionWork: collectionWork, asOf });
  const suppliedTriggers = input.triggers ?? [], explicit = suppliedTriggers.map((item, index) => trigger(item, incidentId, asOf, index)).filter(Boolean), triggers = [...new Map([...explicit, ...derivedTriggers(sentinel, incidentId, asOf)].map((item) => [item.fingerprint, item])).values()].sort((left, right) => Date.parse(left.observedAt) - Date.parse(right.observedAt) || left.type.localeCompare(right.type) || left.triggerId.localeCompare(right.triggerId));
  const active = doingNow(collectionWork, assignments, asOf), proposed = nextActions({ triggers, valueOfInformation, uncertaintyBudget: decisionIntelligence.uncertaintyBudget, sentinel, decisionCompression: decisionIntelligence.decisionCompression, incidentId });
  const twin = projectLivingIncidentTwin({ incident, incidentTwin: input.incidentTwin, intelligence, decisionPacket, informationRequirements, collectionWork, assignments, resources, protection: input.protection, postconditions: input.postconditions ?? [], outcomes: input.outcomes ?? [], nearMisses: input.nearMisses ?? [], preventionRecommendations: input.preventionRecommendations ?? [], contexts: input.contexts ?? {}, asOf });
  const strategicIntelligence = projectStrategicCrisisIntelligence({
    asOf,
    incident: { ...incident, ...input.incidentTwin },
    shadowStrategies: input.shadowStrategies,
    actualOutcome: input.actualOutcome,
    historicalIncidents: input.historicalIncidents,
    nearMisses: input.nearMisses,
    regionalRiskContext: input.regionalRiskContext,
    policies: input.policies,
    terminologyMappings: input.terminologyMappings,
    publicReports: input.publicReports,
  });
  const staff = commandStaff({ valueOfInformation, decisionCompression: decisionIntelligence.decisionCompression, regretRadar: decisionIntelligence.regretRadar, sentinel, doing: active, resources, protection: input.protection });
  const council = projectDecisionCouncil({ decisions: decisionIntelligence.decisions, decisionCompression: decisionIntelligence.decisionCompression, decisionHalfLife: decisionIntelligence.decisionHalfLife, asOf });
  const core = {
    schemaVersion: 'vigia.crisis-autopilot-projection.v1', incidentId, generatedAt: asOf,
    bindings: twin.bindings, livingTwin: twin,
    autopilot: {
      schemaVersion: 'vigia.crisis-autopilot-state.v1', triggers, doingNow: active, nextActions: proposed,
      counts: { triggers: triggers.length, futureTriggersExcluded: suppliedTriggers.length - explicit.length, activeGroupedActivities: active.length, backingActiveObjects: active.reduce((sum, item) => sum + item.backingObjectIds.length, 0), lifecycleMetadataIncomplete: active.filter((item) => !item.lifecycleComplete).length, proposedActions: proposed.length },
      mutationsExecuted: false, consequentialActionsExecuted: false,
      truthBoundary: 'Doing now contains only active backing lifecycle records. Next actions are proposals until a canonical service persists them; protection, assignment, and authority actions require governed human approval.',
    },
    valueOfInformation,
    decisionCompression: decisionIntelligence.decisionCompression,
    regretRadar: decisionIntelligence.regretRadar,
    decisionHalfLife: decisionIntelligence.decisionHalfLife,
    uncertaintyBudget: decisionIntelligence.uncertaintyBudget,
    sentinel,
    commandStaff: staff,
    decisionCouncil: council,
    strategicIntelligence,
    truthBoundary: {
      unknownIsNotNegative: true, unavailableIsNotZero: true, contextIsNotEvidence: true,
      forecastIsNotAuthority: true, actionIsNotSuccess: true, anomalyIsNotTruth: true,
      automaticTruthMutation: false, automaticAuthorityApproval: false, automaticConsequentialExecution: false,
    },
  };
  return immutable({ ...core, projectionHash: semanticHash('crisis-autopilot-projection', core) });
}
