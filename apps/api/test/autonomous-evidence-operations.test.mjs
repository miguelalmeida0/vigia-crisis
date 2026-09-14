import test from 'node:test';
import assert from 'node:assert/strict';
import { EvidenceClosureService } from '../src/modules/alerts/evidence-closure-service.mjs';

class MemoryStore {
  constructor() { this.plans = new Map(); this.decisions = []; this.coverages = new Map(); }
  async listPlans({ subjectType = null, subjectId = null, resolutionState = null, limit = 300 } = {}) { return [...this.plans.values()].filter((item) => (!subjectType || item.subjectType === subjectType) && (!subjectId || item.subjectId === subjectId) && (!resolutionState || item.resolutionState === resolutionState)).slice(0, limit); }
  async getPlan(id) { return this.plans.get(id) ?? null; }
  async persistReconciliation({ plan, coverage = null, decisions = [] }) { this.plans.set(plan.id, plan); this.decisions.push(...decisions.filter((item) => !this.decisions.some((prior) => prior.decisionType === item.decisionType && prior.subjectId === item.subjectId && prior.reasonCode === item.reasonCode))); if (coverage) this.coverages.set(plan.subjectId, coverage); return plan; }
  async coverage(id) { return this.coverages.get(id) ?? null; }
  async decisionLedger({ subjectId = null } = {}) { return this.decisions.filter((item) => !subjectId || item.subjectId === subjectId); }
  async summary() { const plans = [...this.plans.values()]; return { plans: plans.length, open: plans.filter((item) => item.resolutionState === 'OPEN').length, closed: plans.filter((item) => item.resolutionState === 'CLOSED').length, preserved: plans.filter((item) => item.resolutionState === 'PRESERVED').length }; }
}

const opportunity = { id: 'opportunity-sentinel3', eventId: 'event-viirs', sourceFamily: 'sentinel3_slstr', platform: 'Sentinel-3 SLSTR', opportunityType: 'PREDICTED_ORBITAL_PASS', authority: 'TLE:S3A:authoritative-snapshot', windowStart: '2026-08-13T10:20:00Z', windowEnd: '2026-08-13T10:30:00Z', expiresAt: '2026-08-13T10:30:00Z', createdAt: '2026-08-13T10:00:00Z', calculationVersion: 'orbital-v1', coverageAssumptions: { orbitSource: 'TLE:S3A:2026-08-13', uncertainty: { seconds: 30 } }, canCloseEvidenceNeed: true };
function event(families, results = []) { return { id: 'event-viirs', label: 'VIIRS physical candidate', coordinate: [-8, 40], physicalFirst: true, physicalOperationalState: families.length > 1 ? 'CURRENT_MULTISOURCE_PHYSICAL_FIRE' : 'NEW_PHYSICAL_CANDIDATE', physicalState: { freshness: 'current', lastAt: '2026-08-13T10:24:00Z' }, physicalSourceProfile: { families, familyCount: families.length }, actionNeed: { kind: 'investigate_thermal_candidate', needsRouting: families.length < 2, reason: 'Independent confirmation required.' }, observations: families.map((sourceFamily, index) => ({ id: `observation-${sourceFamily}`, sourceFamily, type: 'thermal', at: `2026-08-13T10:2${index + 3}:00Z` })), observationPlan: { opportunitiesV2: [opportunity], opportunityResults: results } }; }

test('autonomous closure creates one plan, arms Sentinel-3, then closes on attributable corroboration', async () => {
  const store = new MemoryStore(); let time = new Date('2026-08-13T10:00:00Z'); const service = new EvidenceClosureService({ store, clock: () => new Date(time) });
  const first = await service.reconcileEvent(event(['viirs']), { sources: { firms: { state: 'current' }, sentinel3Pixels: { state: 'current' } } });
  assert.equal(first.plan.preferredNextFamily, 'sentinel3_slstr'); assert.equal(first.plan.lifecycleState, 'WATCH_ARMED'); assert.equal(store.plans.size, 1);
  time = new Date('2026-08-13T10:25:00Z');
  const result = { opportunityId: opportunity.id, resultState: 'CORROBORATED', attributableObservationId: 'observation-sentinel3_slstr', reasonCode: 'INDEPENDENT_SOURCE_MATCHED_GOVERNED_WINDOW' };
  const second = await service.reconcileEvent(event(['viirs', 'sentinel3_slstr'], [result]), { sources: { firms: { state: 'current' }, sentinel3Pixels: { state: 'current' } } });
  assert.equal(second.plan.resolutionState, 'CLOSED'); assert.equal(second.plan.resultState, 'CORROBORATED'); assert.equal(store.plans.size, 1);
  const types = store.decisions.map((item) => item.decisionType); for (const type of ['EVIDENCE_PLAN_CREATED', 'OPPORTUNITY_SELECTED', 'WATCH_ARMED', 'EVIDENCE_ASSOCIATED', 'UNKNOWN_CLOSED', 'COVERAGE_GAP_IDENTIFIED']) assert.ok(types.includes(type), type);
});

test('qualified prevention review is the only path that closes an expert-review plan', async () => {
  const store = new MemoryStore(); const service = new EvidenceClosureService({ store, clock: () => new Date('2026-08-13T10:00:00Z') });
  const plan = await service.createPreventionPlan({ subjectId: 'prevention-review-queue:t1', evidenceVersion: 'review-v1', acknowledgeDueAt: '2026-08-13T11:00:00Z', escalateAt: '2026-08-13T14:00:00Z' });
  await assert.rejects(() => service.applyPreventionReview(plan.id, { reviewId: 'r1', evidenceVersion: 'review-v2', accepted: true }, { id: 'operator', role: 'OPERATOR', authentication: { authenticated: true } }), /prevention_reviewer_required/);
  const closed = await service.applyPreventionReview(plan.id, { reviewId: 'r1', evidenceVersion: 'review-v2', accepted: true }, { id: 'reviewer', role: 'PREVENTION_REVIEWER', authentication: { authenticated: true } });
  assert.equal(closed.resolutionState, 'CLOSED'); assert.equal(closed.resultState, 'CORROBORATED');
});

test('decision ledger persistence serializes each subject before dedupe and chain-head lookup', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../src/modules/alerts/postgres-evidence-operations-store.mjs', import.meta.url), 'utf8'));
  const lock = source.indexOf('pg_advisory_xact_lock'), dedupe = source.indexOf("SELECT 1 FROM incident_decision_ledger"), head = source.indexOf('ORDER BY sequence DESC');
  assert.ok(lock > 0 && lock < dedupe && dedupe < head); assert.match(source, /SELECT id,sequence,subject_type/);
});
