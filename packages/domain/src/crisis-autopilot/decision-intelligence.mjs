import { immutable } from '../intelligence/shared.mjs';
import { collectionWorkLifecycle, isActiveWork, isGovernedCollectionWork, isUnobtainable, objectId, REGRET_STATES, requiredProjectionClock, stateOf, validInstant, workLastCheck, workNextCheck, workOwner, workSource } from './contracts.mjs';

const CONSEQUENCE_RANK = Object.freeze({ UNKNOWN: 0, COSMETIC: 1, CONTEXT: 2, SCIENTIFIC: 3, OPERATIONAL: 4, CRITICAL: 5, LIFE_SAFETY: 6 });
const REGRET_RANK = Object.freeze({ ACT_NOW: 0, PREPARE_NOW: 1, WATCH: 2, DEFER: 3 });
const UNKNOWN_RANK = Object.freeze({ UNKNOWN_BLOCKING_ACTION: 0, UNKNOWN_BEING_COLLECTED: 1, UNKNOWN_CURRENTLY_UNOBTAINABLE: 2, UNKNOWN: 3, UNKNOWN_BUT_ACCEPTABLE: 4, KNOWN: 5 });
const TERMINAL_DECISIONS = new Set(['SUPERSEDED', 'EXECUTED', 'VERIFIED', 'NOT_APPLICABLE']);

function byDecisionId(value = []) {
  if (!Array.isArray(value)) return new Map(Object.entries(value ?? {}));
  return new Map(value.map((item) => [String(item.decisionId ?? item.id), item]));
}

function minutesUntil(at, now) {
  const instant = validInstant(at);
  return instant ? (Date.parse(instant) - Date.parse(now)) / 60_000 : null;
}

function explicitHigh(value) {
  return ['HIGH', 'CRITICAL', 'SEVERE', 'LIFE_SAFETY'].includes(String(value ?? '').toUpperCase());
}

function regretFor(decision, context, asOf) {
  const factors = [], deadlineMinutes = minutesUntil(context.deadline ?? context.decisionDeadline, asOf);
  const consequence = String(context.consequenceClass ?? decision.consequenceClass ?? 'UNKNOWN').toUpperCase();
  if (deadlineMinutes !== null) factors.push({ code: deadlineMinutes <= 0 ? 'DEADLINE_REACHED' : 'DECISION_DEADLINE', value: validInstant(context.deadline ?? context.decisionDeadline), source: 'DECISION_CONTEXT' });
  if (consequence !== 'UNKNOWN') factors.push({ code: 'CONSEQUENCE_CLASS', value: consequence, source: 'DECISION_DEFINITION' });
  const declared = context.regretFactors ?? {};
  const declarations = [
    ['populationProximity', 'POPULATION_PROXIMITY'], ['infrastructureImportance', 'INFRASTRUCTURE_IMPORTANCE'],
    ['resourceLeadTime', 'RESOURCE_LEAD_TIME'], ['weatherChange', 'WEATHER_CHANGE'],
    ['uncertainty', 'UNCERTAINTY'], ['reversibility', 'REVERSIBILITY'],
    ['falsePositiveCost', 'FALSE_POSITIVE_COST'], ['falseNegativeCost', 'FALSE_NEGATIVE_COST'],
  ];
  for (const [key, code] of declarations) if (declared[key] !== undefined && declared[key] !== null) factors.push({ code, value: declared[key], source: 'DECLARED_DECISION_CONTEXT' });

  let state;
  if (deadlineMinutes !== null && deadlineMinutes <= 15) state = 'ACT_NOW';
  else if (context.protectionThresholdReached === true && decision.authorityRequirement) state = 'ACT_NOW';
  else if ((deadlineMinutes !== null && deadlineMinutes <= 60) || ['LIFE_SAFETY', 'CRITICAL'].includes(consequence) || explicitHigh(declared.falseNegativeCost) || declared.reversibility === 'IRREVERSIBLE') state = 'PREPARE_NOW';
  else if ((deadlineMinutes !== null && deadlineMinutes <= 240) || consequence === 'OPERATIONAL' || factors.length === 0) state = 'WATCH';
  else state = 'DEFER';
  if (!REGRET_STATES.includes(state)) throw new Error('crisis_autopilot_regret_state_invalid');
  const consequenceOfDelay = context.consequenceOfDelay ?? null;
  return {
    decisionId: String(decision.decisionId), state, deadline: validInstant(context.deadline ?? context.decisionDeadline),
    consequenceClass: consequence, consequenceOfDelay,
    factors, owner: context.owner ?? context.ownerId ?? null,
    why: consequenceOfDelay ?? (factors.length ? `Ordinal state follows ${factors.map((item) => item.code).join(', ')}.` : 'Insufficient explicit inputs to justify escalation or safe deferral; continue watching.'),
    qualification: consequenceOfDelay ? 'EXPLICIT_DECISION_CONTEXT' : factors.length ? 'ORDINAL_RULE_PROJECTION' : 'INPUTS_INCOMPLETE_SAFE_WATCH',
    probability: null, expectedLoss: null,
  };
}

function decisionRows({ decisionPacket, decisions, decisionDefinitions, decisionContexts, asOf }) {
  const definitions = byDecisionId(decisionDefinitions), contexts = byDecisionId(decisionContexts);
  return (decisions ?? decisionPacket?.decisions?.results ?? []).map((decision) => {
    const definition = definitions.get(String(decision.decisionId)) ?? {};
    const context = { ...definition, ...(contexts.get(String(decision.decisionId)) ?? {}) };
    const consequenceClass = String(context.consequenceClass ?? decision.consequenceClass ?? 'UNKNOWN').toUpperCase();
    const humanDecisionRequired = context.humanDecisionRequired === true || decision.consequential === true || Boolean(decision.authorityRequirement) || decision.state === 'BLOCKED_BY_AUTHORITY';
    const regret = regretFor({ ...decision, consequenceClass }, context, asOf);
    return {
      decisionId: String(decision.decisionId), state: String(decision.state), consequenceClass,
      deadline: regret.deadline, whyNow: context.whyNow ?? regret.why,
      consequenceOfDelay: context.consequenceOfDelay ?? null,
      recommendedAction: context.recommendedAction ?? decision.actionsUnlocked?.[0] ?? null,
      actionsUnlocked: [...(decision.actionsUnlocked ?? [])], blockedActions: [...(decision.blockedActions ?? [])],
      blockers: [...(decision.blockers ?? [])], authorityRequirement: decision.authorityRequirement ?? context.authorityRequirement ?? null,
      owner: context.owner ?? context.ownerId ?? null, humanDecisionRequired,
      evidenceStrength: context.evidenceStrength ?? 'NOT_ASSESSED', uncertainty: context.uncertainty ?? 'NOT_ASSESSED',
      alternatives: [...(context.alternatives ?? [])], safetyConstraints: [...(context.safetyConstraints ?? [])],
      councilReviews: context.councilReviews && typeof context.councilReviews === 'object' ? context.councilReviews : null,
      regret,
    };
  }).sort((left, right) => REGRET_RANK[left.regret.state] - REGRET_RANK[right.regret.state]
    || (CONSEQUENCE_RANK[right.consequenceClass] ?? 0) - (CONSEQUENCE_RANK[left.consequenceClass] ?? 0)
    || (left.deadline ? Date.parse(left.deadline) : Number.MAX_SAFE_INTEGER) - (right.deadline ? Date.parse(right.deadline) : Number.MAX_SAFE_INTEGER)
    || left.decisionId.localeCompare(right.decisionId));
}

function collectionForUnknown(unknown, collectionWork, asOf) {
  const embedded = Array.isArray(unknown.currentAcquisitionWork)
    ? unknown.currentAcquisitionWork
    : unknown.currentAcquisitionWork
      ? [unknown.currentAcquisitionWork]
      : [];
  const linked = collectionWork.filter((item) => [item.evidenceNeedId, item.unknownId, item.requirementId].filter(Boolean).map(String).includes(String(unknown.id)));
  const candidates = [...new Map([...embedded, ...linked].filter(Boolean).map((item, index) => [objectId(item) ?? `unidentified:${index}`, item])).values()];
  const active = candidates.find((item) => isActiveWork(item, { asOf })) ?? null;
  if (active) return { work: active, active: true, lifecycle: collectionWorkLifecycle(active, { asOf }) };
  const governed = candidates.filter(isGovernedCollectionWork);
  const backing = governed.find((item) => !collectionWorkLifecycle(item, { asOf }).terminal) ?? governed[0] ?? null;
  return backing ? { work: backing, active: false, lifecycle: collectionWorkLifecycle(backing, { asOf }) } : { work: null, active: false, lifecycle: null };
}

function backingWorkNextStep({ active, lifecycle }, state) {
  if (active) return 'CONTINUE_GOVERNED_COLLECTION';
  if (!lifecycle) return state === 'UNKNOWN_CURRENTLY_UNOBTAINABLE'
    ? 'REVIEW_TERMINAL_REASON_OR_EXTERNAL_DEPENDENCY'
    : state === 'UNKNOWN_BUT_ACCEPTABLE'
      ? 'MONITOR_INVALIDATING_CONDITION'
      : state === 'KNOWN'
        ? null
        : 'CREATE_OR_UPDATE_INFORMATION_REQUIREMENT';
  if (lifecycle.classification === 'BLOCKED_GOVERNED_PLAN') return 'REVIEW_BLOCKED_GOVERNED_COLLECTION';
  if (lifecycle.classification === 'SCHEDULE_DUE_REVIEW') return 'REVIEW_DUE_COLLECTION_LIFECYCLE';
  if (lifecycle.terminal) return 'REVIEW_COMPLETED_COLLECTION_WITHOUT_REQUIREMENT_SATISFACTION';
  return 'REVIEW_GOVERNED_COLLECTION_PLAN';
}

function uncertaintyRow(unknown, collectionWork, index, asOf) {
  const backing = collectionForUnknown(unknown, collectionWork, asOf), work = backing.work;
  const unavailable = isUnobtainable(unknown) || (!work && (unknown.terminalReason || unknown.exhausted === true));
  let state = 'UNKNOWN';
  if (unknown.known === true || String(unknown.state).toUpperCase() === 'KNOWN') state = 'KNOWN';
  else if (backing.active) state = 'UNKNOWN_BEING_COLLECTED';
  else if (unavailable) state = 'UNKNOWN_CURRENTLY_UNOBTAINABLE';
  else if (unknown.acceptableForCurrentDecision === true) state = 'UNKNOWN_BUT_ACCEPTABLE';
  else if (unknown.classification === 'DECISION_BLOCKING') state = 'UNKNOWN_BLOCKING_ACTION';
  return {
    id: String(unknown.id ?? `unknown:${index}`), state, question: unknown.whatIsUnknown ?? unknown.requirement ?? null,
    decisionImpact: unknown.classification ?? 'UNPRIORITIZED', decisionIds: [...(unknown.decisionIds ?? [])],
    owner: workOwner(work ?? unknown), source: workSource(work ?? unknown), freshness: unknown.freshness ?? 'UNKNOWN',
    lastCheckedAt: work ? workLastCheck(work) : workLastCheck(unknown),
    nextCheckAt: work ? workNextCheck(work) : workNextCheck(unknown),
    nextStep: backingWorkNextStep(backing, state),
    unlockCondition: unknown.strongerClaimBlocked ?? unknown.unlockCondition ?? null,
    terminalReason: unavailable ? unknown.terminalReason ?? unknown.reason ?? unknown.escalationReason ?? null : null,
    backingWorkId: objectId(work ?? {}),
    backingWorkState: work ? stateOf(work) : null,
    backingWorkLifecycle: backing.lifecycle,
    activeCollection: backing.active,
  };
}

function halfLifeItem(recommendation, asOf, index) {
  const support = recommendation.supportingEvidence ?? [];
  const staleSupport = support.filter((item) => ['STALE', 'EXPIRED', 'UNAVAILABLE'].includes(String(item.freshness ?? item.state).toUpperCase()));
  const instants = [
    ['EVIDENCE_VALIDITY_EXPIRES', recommendation.evidenceValidUntil],
    ['SOURCE_UPDATE_EXPECTED', recommendation.nextSourceUpdateAt],
    ['WEATHER_RUN_EXPECTED', recommendation.nextWeatherRunAt],
    ['DECISION_DEADLINE', recommendation.decisionDeadline],
    ...support.map((item) => ['SUPPORTING_EVIDENCE_EXPIRES', item.validUntil]),
  ].map(([condition, value]) => ({ condition, at: validInstant(value) })).filter((item) => item.at).sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.condition.localeCompare(b.condition));
  const next = instants[0] ?? null;
  const id = String(recommendation.id ?? recommendation.recommendationId ?? `recommendation:${index}`);
  let state = 'VALID', reason = null;
  if (staleSupport.length) { state = 'EXPIRED'; reason = 'SUPPORTING_EVIDENCE_NOT_CURRENT'; }
  else if (next && Date.parse(next.at) <= Date.parse(asOf)) { state = 'EXPIRED'; reason = next.condition; }
  else if (!next || !(recommendation.invalidatingConditions ?? []).length) { state = 'WITHHELD_NO_VALIDITY_WINDOW'; reason = !next ? 'VALID_UNTIL_UNKNOWN' : 'INVALIDATING_CONDITION_UNKNOWN'; }
  return {
    recommendationId: id, decisionId: recommendation.decisionId ?? null, state,
    recommendation: state === 'WITHHELD_NO_VALIDITY_WINDOW' ? null : recommendation.recommendation ?? recommendation.action ?? null,
    validUntil: next?.at ?? null, nextInvalidatingCondition: next?.condition ?? recommendation.invalidatingConditions?.[0] ?? null,
    invalidatingConditions: [...(recommendation.invalidatingConditions ?? [])],
    nextSourceUpdateAt: validInstant(recommendation.nextSourceUpdateAt), nextWeatherRunAt: validInstant(recommendation.nextWeatherRunAt),
    freshnessRequirement: recommendation.freshnessRequirement ?? null, supportingEvidenceIds: support.map((item) => String(item.id ?? item.evidenceId ?? '')).filter(Boolean).sort(),
    reason, qualification: state === 'VALID' ? 'EXPLICIT_BOUNDED_VALIDITY' : state === 'EXPIRED' ? 'AUTOMATIC_EXPIRY' : 'RECOMMENDATION_CONTENT_WITHHELD',
  };
}

export function projectDecisionIntelligence({ decisionPacket = null, decisions = null, decisionDefinitions = [], decisionContexts = [], unknowns = [], knowns = [], collectionWork = [], watchConditions = [], recommendations = [], asOf, displayTargets = {} } = {}) {
  asOf = requiredProjectionClock(asOf);
  const projectedDecisions = decisionRows({ decisionPacket, decisions, decisionDefinitions, decisionContexts, asOf });
  const active = projectedDecisions.filter((item) => !TERMINAL_DECISIONS.has(item.state));
  const requiredHuman = active.filter((item) => item.humanDecisionRequired);
  const criticalHuman = requiredHuman.filter((item) => ['LIFE_SAFETY', 'CRITICAL'].includes(item.consequenceClass));
  const decisionTarget = Math.max(1, Number(displayTargets.decisionsNow ?? 3));
  const decisionsNow = [...criticalHuman, ...requiredHuman.filter((item) => !criticalHuman.includes(item)).slice(0, Math.max(0, decisionTarget - criticalHuman.length))];
  const authorityTarget = Math.max(1, Number(displayTargets.blockedAuthority ?? 2));
  const allAuthority = active.filter((item) => item.state === 'BLOCKED_BY_AUTHORITY');
  const criticalAuthority = allAuthority.filter((item) => ['LIFE_SAFETY', 'CRITICAL'].includes(item.consequenceClass));
  const blockedAuthorityItems = [...criticalAuthority, ...allAuthority.filter((item) => !criticalAuthority.includes(item)).slice(0, Math.max(0, authorityTarget - criticalAuthority.length))];
  const machineDecisionWork = active.filter((item) => !item.humanDecisionRequired && (item.state === 'READY' || item.actionsUnlocked.length));
  const machineCollectionWork = collectionWork.filter((item) => isActiveWork(item, { asOf })).map((item) => ({ id: objectId(item), type: 'COLLECTION', state: stateOf(item), owner: workOwner(item), source: workSource(item), lastCheckedAt: workLastCheck(item), nextCheckAt: workNextCheck(item), lifecycle: collectionWorkLifecycle(item, { asOf }) }));
  const machineWork = [...machineDecisionWork.map((item) => ({ id: item.decisionId, type: 'DECISION_POLICY', state: item.state, owner: item.owner, source: 'DECISION_FOUNDRY', nextCheckAt: item.deadline })), ...machineCollectionWork];
  const shown = new Set(decisionsNow.map((item) => item.decisionId)), missedRequiredHumanDecisions = requiredHuman.filter((item) => !shown.has(item.decisionId) && ['LIFE_SAFETY', 'CRITICAL'].includes(item.consequenceClass)).map((item) => item.decisionId);
  const denominator = machineWork.length + requiredHuman.length;
  const uncertaintyItems = [...knowns.map((item, index) => uncertaintyRow({ ...item, known: true }, collectionWork, index, asOf)), ...unknowns.map((item, index) => uncertaintyRow(item, collectionWork, index, asOf))].sort((left, right) => UNKNOWN_RANK[left.state] - UNKNOWN_RANK[right.state] || left.id.localeCompare(right.id));
  const halfLifeItems = recommendations.map((item, index) => halfLifeItem(item, asOf, index)).sort((left, right) => (left.validUntil ? Date.parse(left.validUntil) : Number.MAX_SAFE_INTEGER) - (right.validUntil ? Date.parse(right.validUntil) : Number.MAX_SAFE_INTEGER) || left.recommendationId.localeCompare(right.recommendationId));
  return immutable({
    decisions: active,
    decisionCompression: {
      schemaVersion: 'vigia.decision-compression.v1', decisionsNow,
      watchConditions: [...watchConditions].slice(0, Math.max(1, Number(displayTargets.watchConditions ?? 5))),
      blockedAuthorityItems, machineWork,
      counts: { machineWork: machineWork.length, requiredHumanDecisions: requiredHuman.length, decisionsShown: decisionsNow.length, watchConditions: watchConditions.length, blockedAuthorityItems: allAuthority.length },
      configuredDisplayTargets: { decisionsNow: decisionTarget, watchConditions: Math.max(1, Number(displayTargets.watchConditions ?? 5)), blockedAuthorityItems: authorityTarget },
      criticalItemsMayExceedDisplayTarget: true,
      machineToHumanConversionPercent: denominator ? Math.round((requiredHuman.length / denominator) * 10_000) / 100 : null,
      machineToHumanConversionFormula: 'requiredHumanDecisions / (machineWork + requiredHumanDecisions)',
      missedRequiredHumanDecisions,
      qualification: 'Only consequential, authority-bound, or explicitly human decisions enter human attention. Critical required-human decisions are never truncated to satisfy a display target.',
    },
    regretRadar: { schemaVersion: 'vigia.regret-radar.v1', items: active.map((item) => item.regret), qualification: 'Ordinal transparent rules only. No probability, expected-loss estimate, or outcome claim is computed.' },
    decisionHalfLife: {
      schemaVersion: 'vigia.decision-half-life.v1',
      state: halfLifeItems.length ? 'VALIDITY_WINDOWS_AVAILABLE' : 'NO_RECOMMENDATION_TO_TIMEBOX',
      items: halfLifeItems,
      expiredRecommendationIds: halfLifeItems.filter((item) => item.state === 'EXPIRED').map((item) => item.recommendationId),
      withheldRecommendationIds: halfLifeItems.filter((item) => item.state === 'WITHHELD_NO_VALIDITY_WINDOW').map((item) => item.recommendationId),
      reason: halfLifeItems.length ? null : 'No attributable recommendation is present, so VIGIA has no validity window to compute.',
      unlockCondition: halfLifeItems.length ? null : 'Admit an attributable recommendation with explicit validity or invalidating conditions.',
      owner: 'VIGIA_DECISION_VALIDITY_PROJECTOR',
      source: 'CANONICAL_RECOMMENDATION_AND_EVIDENCE_LIFECYCLE',
      qualification: 'A recommendation is current only while an explicit evidence/source/weather/deadline window remains valid and its supporting evidence is not stale.',
    },
    uncertaintyBudget: { schemaVersion: 'vigia.uncertainty-budget.v1', items: uncertaintyItems, counts: Object.fromEntries(['KNOWN', 'UNKNOWN', 'UNKNOWN_BUT_ACCEPTABLE', 'UNKNOWN_BLOCKING_ACTION', 'UNKNOWN_BEING_COLLECTED', 'UNKNOWN_CURRENTLY_UNOBTAINABLE'].map((state) => [state, uncertaintyItems.filter((item) => item.state === state).length])), qualification: 'Unknown is never converted to negative, absent, or zero. Collection and terminal unavailability require backing lifecycle state or an explicit terminal reason.' },
  });
}
