import { alertEvidenceVersion } from '../../../../../packages/domain/src/alert-domain.mjs';
import { createCoverageIntelligence } from '../../../../../packages/domain/src/coverage-intelligence.mjs';
import { armEvidenceWatch, createEvidenceClosurePlan, resolveEvidenceClosure, selectClosureOpportunity } from '../../../../../packages/domain/src/evidence-closure-plan.mjs';
import { createFireTruthState } from '../../../../../packages/domain/src/fire-truth-state.mjs';
import { decideNextBestEvidence, evidenceCandidates } from '../../../../../packages/domain/src/next-best-evidence.mjs';
import { createEvidenceRace, settleEvidenceRace } from '../../../../../packages/domain/src/evidence-race.mjs';

function families(event) { return [...new Set((event.physicalSourceProfile?.families ?? event.observations?.map((item) => item.sourceFamily) ?? []).map((item) => String(item ?? '').toLowerCase().replaceAll('-', '_')).filter(Boolean))]; }
function acceptable(current) {
  const priority = current.includes('viirs') ? ['sentinel3_slstr', 'field', 'drone', 'ground_sensor'] : current.includes('sentinel3_slstr') ? ['viirs', 'field', 'drone', 'ground_sensor'] : ['viirs', 'sentinel3_slstr', 'field', 'drone', 'ground_sensor'];
  return [...priority, ...current];
}
function sourceStates(live = {}) { return { viirs: live.sources?.firms ?? {}, sentinel3_slstr: live.sources?.sentinel3Pixels ?? live.sources?.sentinel3 ?? {}, sentinel2_msi: live.sources?.sentinel2 ?? {} }; }
function decision(plan, decisionType, reasonCode, payload = {}, actorId = 'vigia-evidence-closure-engine') {
  return { subjectType: plan.subjectType, subjectId: plan.subjectId, decisionType, evidenceVersion: plan.currentEvidenceVersion, actorId, reasonCode, payload, createdAt: plan.updatedAt };
}
function resultFor(plan, results = []) { return results.find((item) => String(item.opportunityId ?? item.opportunity_id) === String(plan.opportunity?.id)); }
function latencyStages(event, observationId, computedAt) {
  const observation = (event.observations ?? []).find((item) => item.id === observationId); if (!observation) return [];
  const repositoryAt = observation.latestAcquisition?.repositoryPersistedAt ?? observation.vigiaObservationPersistedAt;
  const points = [
    ['provider_observation_to_vigia_acquisition', observation.at ?? observation.observedAt, observation.vigiaAcquiredAt ?? observation.receivedAt],
    ['vigia_acquisition_to_parse', observation.vigiaAcquiredAt ?? observation.receivedAt, observation.vigiaParsedAt],
    ['parse_to_ingest', observation.vigiaParsedAt, observation.vigiaIngestedAt],
    ['ingest_to_repository', observation.vigiaIngestedAt, repositoryAt],
    ['repository_to_truth_recompute', repositoryAt, computedAt]
  ];
  return points.map(([stageName, fromAt, untilAt]) => { const durationMs = Date.parse(untilAt ?? '') - Date.parse(fromAt ?? ''), measured = Number.isFinite(durationMs) && durationMs >= 0; return { observationId, stageName, state: measured ? 'MEASURED' : 'PRESERVED_UNKNOWN', durationMs: measured ? durationMs : null, fromAt: Number.isFinite(Date.parse(fromAt ?? '')) ? new Date(fromAt).toISOString() : null, untilAt: Number.isFinite(Date.parse(untilAt ?? '')) ? new Date(untilAt).toISOString() : null, reason: measured ? null : 'Required ordered timestamps are unavailable or non-monotonic.' }; });
}

export class EvidenceClosureService {
  constructor({ store, clock = () => new Date() } = {}) { this.store = store; this.clock = clock; }
  async reconcileEvent(event, live = {}) {
    if (!event?.id) return null;
    const currentFamilies = families(event), unknownCode = String(event.actionNeed?.kind ?? 'independent_physical_confirmation');
    const evidenceVersion = alertEvidenceVersion(event);
    const priorPlans = await this.store.listPlans({ subjectType: 'EVENT', subjectId: String(event.id), limit: 100 });
    const existing = priorPlans.find((plan) => plan.unknownCode === unknownCode && plan.currentEvidenceVersion === evidenceVersion)
      ?? priorPlans.find((plan) => plan.unknownCode === unknownCode && plan.resolutionState === 'OPEN') ?? null;
    const hasUnknown = event.actionNeed?.needsRouting === true || currentFamilies.length < 2;
    if (!existing && !hasUnknown) return null;
    const now = this.clock();
    let plan = existing ?? createEvidenceClosurePlan({
      subjectType: 'EVENT', subjectId: event.id, unknownCode,
      unknownDescription: event.actionNeed?.reason ?? 'Independent physical corroboration is not yet attributable.',
      closureContract: { type: 'INDEPENDENT_PHYSICAL_CORROBORATION', closeOn: ['CORROBORATED'], preserveOn: ['VALID_OPPORTUNITY_NO_SIGNAL', 'QUALITY_UNUSABLE', 'NO_COVERAGE', 'AMBIGUOUS', 'SOURCE_FAILURE', 'EXPIRED', 'STILL_UNKNOWN'] },
      acceptableEvidenceFamilies: acceptable(currentFamilies), currentEvidenceFamilies: currentFamilies,
      currentEvidenceVersion: evidenceVersion, deadlineAt: new Date(now.getTime() + 60 * 60_000), expiresAt: new Date(now.getTime() + 12 * 3_600_000)
    }, { now });
    const decisions = [];
    if (!existing) decisions.push(decision(plan, 'EVIDENCE_PLAN_CREATED', 'INDEPENDENT_CORROBORATION_REQUIRED', { preferredNextFamily: plan.preferredNextFamily }));
    const opportunities = event.observationPlan?.opportunitiesV2 ?? [];
    if (!plan.opportunity) {
      const opportunity = selectClosureOpportunity(plan, opportunities, { at: now });
      if (opportunity) {
        plan = armEvidenceWatch(plan, opportunity, { at: now });
        decisions.push(decision(plan, 'OPPORTUNITY_SELECTED', opportunity.opportunityType, { opportunityId: opportunity.id, authority: opportunity.authority }));
        decisions.push(decision(plan, 'WATCH_ARMED', 'INDEPENDENT_SOURCE_WATCH', { watchId: plan.sourceWatch.id, sourceFamily: plan.sourceWatch.sourceFamily, watchUntil: plan.sourceWatch.watchUntil }));
      }
    }
    const result = resultFor(plan, event.observationPlan?.opportunityResults ?? []);
    if (result && plan.resolutionState === 'OPEN') {
      plan = resolveEvidenceClosure(plan, { result, event, evidenceVersion, at: now });
      if (result.attributableObservationId ?? result.attributable_observation_id) decisions.push(decision(plan, 'EVIDENCE_ASSOCIATED', result.reasonCode ?? result.reason_code, { opportunityId: plan.opportunity?.id, observationId: result.attributableObservationId ?? result.attributable_observation_id }));
      decisions.push(decision(plan, plan.resolutionState === 'CLOSED' ? 'UNKNOWN_CLOSED' : 'UNKNOWN_PRESERVED', plan.resultReason, { resultState: plan.resultState }));
    } else if (plan.resolutionState === 'OPEN' && Date.parse(plan.expiresAt) <= now.getTime()) {
      plan = resolveEvidenceClosure(plan, { result: { resultState: 'EXPIRED', reasonCode: 'PLAN_EXPIRED_WITHOUT_ATTRIBUTABLE_EVIDENCE' }, event, evidenceVersion, at: now });
      decisions.push(decision(plan, 'UNKNOWN_PRESERVED', plan.resultReason, { resultState: 'EXPIRED' }));
    }
    const coverage = createCoverageIntelligence({ subject: { type: 'EVENT', id: event.id, label: event.label, coordinate: event.coordinate, assets: event.territoryContext?.assets ?? [] }, opportunities, sourceStates: sourceStates(live), now });
    for (const gap of coverage.gaps) decisions.push(decision(plan, 'COVERAGE_GAP_IDENTIFIED', `${gap.sourceFamily}:${gap.reasonCode}`, { gapId: gap.id, horizon: gap.horizon }));
    const unknowns = currentFamilies.length < 2 ? [{ code: 'INDEPENDENT_PHYSICAL_CORROBORATION' }] : [];
    const nextBestEvidence = decideNextBestEvidence({ eventId: event.id, unknowns, currentEvidenceFamilies: currentFamilies, candidates: evidenceCandidates({ event, opportunities }), now });
    let truthState = createFireTruthState({ event, closurePlan: plan, coverage, nextBestEvidence, sourceStates: sourceStates(live), now });
    let evidenceRace = createEvidenceRace({ eventId: event.id, truthStateId: truthState.id, decision: nextBestEvidence, createdAt: plan.createdAt });
    const attributableObservationId = result?.attributableObservationId ?? result?.attributable_observation_id ?? null;
    if (attributableObservationId && plan.resolutionState === 'CLOSED') evidenceRace = settleEvidenceRace(evidenceRace, { sourceFamily: plan.preferredNextFamily, opportunityId: plan.opportunity?.id, attributableObservationId, outcome: plan.resultState, settledAt: now });
    truthState = createFireTruthState({ event, closurePlan: plan, coverage, nextBestEvidence, evidenceRace, sourceStates: sourceStates(live), now });
    decisions.push(decision(plan, 'FIRE_TRUTH_STATE_RECOMPUTED', truthState.physicalTruth.confirmationState, { truthStateId: truthState.id, unknownCount: truthState.unknowns.length }));
    decisions.push(decision(plan, evidenceRace.state === 'SETTLED' ? 'EVIDENCE_RACE_SETTLED' : 'EVIDENCE_RACE_ARMED', evidenceRace.state, { raceId: evidenceRace.id, winnerPathId: evidenceRace.winnerPathId }));
    if (plan.resolutionState === 'CLOSED') decisions.push(decision(plan, 'ALERT_MATERIAL_UPDATE', 'INDEPENDENT_PHYSICAL_CORROBORATION_ADDED', { truthStateId: truthState.id, from: 'SINGLE_SOURCE_PHYSICAL_EVIDENCE', to: truthState.physicalTruth.confirmationState }));
    const stages = latencyStages(event, attributableObservationId, truthState.computedAt);
    await this.store.persistReconciliation({ plan, coverage, autopilot: { truthState, nextBestEvidence, evidenceRace, latencyStages: stages }, decisions });
    return { plan, coverage, truthState, nextBestEvidence, evidenceRace, latencyStages: stages, nextEvidence: nextBestEvidence.selected?.sourceFamily ?? plan.preferredNextFamily, watch: plan.sourceWatch, result: plan.resultState };
  }
  async createPreventionPlan(alert) {
    if (!alert?.subjectId || !alert?.evidenceVersion) return null;
    const prior = (await this.store.listPlans({ subjectType: 'PREVENTION_REVIEW_QUEUE', subjectId: alert.subjectId, resolutionState: 'OPEN', limit: 1 }))[0];
    if (prior) return prior;
    const plan = createEvidenceClosurePlan({ subjectType: 'PREVENTION_REVIEW_QUEUE', subjectId: alert.subjectId, unknownCode: 'qualified_prevention_review', unknownDescription: 'A qualified reviewer must accept or reject the prevention evidence package.', closureContract: { type: 'QUALIFIED_EXPERT_REVIEW', closeOn: ['CORROBORATED'], preserveOn: ['AMBIGUOUS', 'STILL_UNKNOWN', 'EXPIRED'] }, acceptableEvidenceFamilies: ['domain_expert_review'], currentEvidenceFamilies: [], currentEvidenceVersion: alert.evidenceVersion, deadlineAt: alert.acknowledgeDueAt, expiresAt: alert.escalateAt }, { now: this.clock() });
    await this.store.persistReconciliation({ plan, decisions: [decision(plan, 'EVIDENCE_PLAN_CREATED', 'QUALIFIED_PREVENTION_REVIEW_REQUIRED')] });
    return plan;
  }
  async recordAlertDecision(alert, { created = false, materialChange = false } = {}) {
    if (!alert?.subjectId || (!created && !materialChange)) return null;
    const plans = await this.store.listPlans({ subjectId: String(alert.subjectId), limit: 1 });
    const plan = plans[0]; if (!plan) return null;
    const decisionType = created ? 'ALERT_OPENED' : 'ALERT_UPDATED';
    await this.store.persistReconciliation({ plan, decisions: [decision(plan, decisionType, alert.reasonCode, { alertId: alert.id, alertType: alert.alertType, lifecycleState: alert.lifecycleState })] });
    return decisionType;
  }
  async applyPreventionReview(planId, review = {}, actor = {}) {
    if (actor?.authentication?.authenticated !== true) throw new Error('forbidden');
    const role = String(actor.actorRole ?? actor.role ?? '').toUpperCase().replaceAll('-', '_');
    if (!['PREVENTION_REVIEWER', 'PREVENTION_REVIEW'].includes(role)) throw new Error('prevention_reviewer_required');
    const current = await this.store.getPlan(planId); if (!current) throw new Error('evidence_closure_plan_not_found');
    if (current.closureContract.type !== 'QUALIFIED_EXPERT_REVIEW') throw new Error('qualified_review_not_applicable');
    if (!review.reviewId || !review.evidenceVersion) throw new Error('attributable_review_required');
    const accepted = review.accepted === true, result = { resultState: accepted ? 'CORROBORATED' : 'AMBIGUOUS', reasonCode: accepted ? 'QUALIFIED_REVIEW_ACCEPTED' : 'QUALIFIED_REVIEW_REJECTED', reviewId: review.reviewId, actorRole: 'PREVENTION_REVIEWER' };
    const plan = resolveEvidenceClosure(current, { result, evidenceVersion: review.evidenceVersion, at: this.clock() });
    const decisionType = accepted ? 'PREVENTION_REVIEW_ACCEPTED' : 'PREVENTION_REVIEW_REJECTED';
    await this.store.persistReconciliation({ plan, decisions: [decision(plan, decisionType, result.reasonCode, { reviewId: review.reviewId }, String(actor.id)) , decision(plan, accepted ? 'UNKNOWN_CLOSED' : 'UNKNOWN_PRESERVED', result.reasonCode, { resultState: plan.resultState }, String(actor.id))] });
    return plan;
  }
  async plans(options = {}) { return { plans: await this.store.listPlans(options) }; }
  async coverage(subjectId) { return this.store.coverage(subjectId); }
  async ledger(options = {}) { return { decisions: await this.store.decisionLedger(options) }; }
  async truthStates(options = {}) { return { truthStates: await this.store.truthStates(options) }; }
  async races(options = {}) { return { evidenceRaces: await this.store.evidenceRaces(options) }; }
  async latency(options = {}) { return { latency: await this.store.latencyMetrics(options) }; }
  async status() { const summary=await this.store.summary(),closed=Number(summary.closed??0),preserved=Number(summary.preserved??0),acceptedOutcomes=closed+preserved;return{...summary,rates:{unknownClosure:{numerator:closed,denominator:acceptedOutcomes,value:acceptedOutcomes?Number((closed/acceptedOutcomes).toFixed(4)):null},unknownPreservation:{numerator:preserved,denominator:acceptedOutcomes,value:acceptedOutcomes?Number((preserved/acceptedOutcomes).toFixed(4)):null}},qualification:'Rates use accepted terminal evidence outcomes only. Open plans are backlog, not failed outcomes; closure requires contract-satisfying attributable evidence and preservation is not certainty.'}; }
}
