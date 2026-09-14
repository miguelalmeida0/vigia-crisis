import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EvidenceClosureService } from '../apps/api/src/modules/alerts/evidence-closure-service.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeFile = path.join(root, 'data/runtime/fire-event-observations.production.json');
const projectionFile = path.join(root, 'data/runtime/event-projections.production.json');
const baselineFile = path.join(root, 'data/validation/operations/live-operations-proof.json');
const outputFile = path.join(root, 'data/validation/operations/autonomous-evidence-operations-proof.json');
const [runtime, projection, baseline] = await Promise.all([runtimeFile, projectionFile, baselineFile].map(async (file) => JSON.parse(await readFile(file, 'utf8'))));

class MemoryStore {
  constructor() { this.plans = new Map(); this.decisions = []; this.coverages = new Map(); }
  async listPlans({ subjectType = null, subjectId = null, resolutionState = null, limit = 300 } = {}) { return [...this.plans.values()].filter((item) => (!subjectType || item.subjectType === subjectType) && (!subjectId || item.subjectId === subjectId) && (!resolutionState || item.resolutionState === resolutionState)).slice(0, limit); }
  async getPlan(id) { return this.plans.get(id) ?? null; }
  async persistReconciliation({ plan, coverage = null, decisions = [] }) { this.plans.set(plan.id, plan); if (coverage) this.coverages.set(plan.subjectId, coverage); for (const decision of decisions) if (!this.decisions.some((prior) => prior.subjectId === decision.subjectId && prior.decisionType === decision.decisionType && prior.reasonCode === decision.reasonCode)) this.decisions.push(decision); return plan; }
  async coverage(id) { return this.coverages.get(id) ?? null; }
  async decisionLedger({ subjectId = null } = {}) { return this.decisions.filter((item) => !subjectId || item.subjectId === subjectId); }
  async summary() { const plans = [...this.plans.values()]; return { plans: plans.length, open: plans.filter((item) => item.resolutionState === 'OPEN').length, closed: plans.filter((item) => item.resolutionState === 'CLOSED').length, preserved: plans.filter((item) => item.resolutionState === 'PRESERVED').length }; }
}

const observationsByEvent = new Map();
for (const observation of runtime.observations ?? []) {
  const eventId = runtime.observationEvents?.[observation.id]; if (!eventId) continue;
  if (!observationsByEvent.has(eventId)) observationsByEvent.set(eventId, []);
  observationsByEvent.get(eventId).push(observation);
}
const candidates = (projection.operatorEvents ?? []).filter((event) => event.coordinate?.length === 2 && (event.physicalSourceProfile?.families ?? []).includes('viirs'))
  .sort((left, right) => Date.parse(right.physicalState?.lastAt) - Date.parse(left.physicalState?.lastAt)).slice(0, 3);
if (candidates.length < 3) throw new Error('three_real_viirs_candidates_required');
const sentinel3Products = (runtime.observations ?? []).filter((item) => item.sourceFamily === 'sentinel3_slstr' && item.provenance?.rawSourceProductId);
if (!sentinel3Products.length) throw new Error('real_sentinel3_product_required');

const store = new MemoryStore(); let now = new Date('2026-08-13T10:00:00Z'); const clock = () => new Date(now);
const service = new EvidenceClosureService({ store, clock }); const executionMs = []; const replay = [];
for (const source of candidates) {
  const viirs = (observationsByEvent.get(source.id) ?? []).filter((item) => item.sourceFamily === 'viirs').sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  if (!viirs?.provenance?.rawSourceProductId) throw new Error(`attributable_viirs_product_required:${source.id}`);
  now = new Date(Math.max(Date.parse(viirs.at), Date.parse('2026-08-13T10:00:00Z')) + 60_000);
  const expiresAt = new Date(now.getTime() + 12 * 3_600_000).toISOString();
  const opportunity = { id: `controlled-watch:${source.id}:sentinel3`, eventId: source.id, sourceFamily: 'sentinel3_slstr', platform: 'Copernicus Sentinel-3 SLSTR', opportunityType: 'UNKNOWN', authority: 'VIGIA_SOURCE_STATUS_ONLY', coverageAssumptions: { eventCoordinate: source.coordinate, providerProductAvailable: true, referenceProductId: sentinel3Products[0].provenance.rawSourceProductId }, qualityDependencies: { requiresEventSpecificPassPrediction: true, requiresUsableCoverage: true, requiresAttributableObservation: true }, blockerReason: 'No event-specific orbital prediction or authoritative swath geometry is available.', calculationVersion: 'vigia.observation-opportunity.v2', canCloseEvidenceNeed: false, createdAt: now.toISOString(), expiresAt };
  const event = { ...source, actionNeed: { kind: 'investigate_thermal_candidate', needsRouting: true, reason: 'VIIRS physical candidate requires independent corroboration.' }, physicalState: { ...source.physicalState, freshness: 'current', lastAt: viirs.at }, physicalSourceProfile: { ...source.physicalSourceProfile, families: ['viirs'], familyCount: 1 }, observations: [viirs], observationPlan: { opportunitiesV2: [opportunity], opportunityResults: [] } };
  let started = performance.now(); const armed = await service.reconcileEvent(event, { sources: { firms: { state: 'current' }, sentinel3Pixels: { state: 'current', latestProduct: { id: sentinel3Products[0].provenance.rawSourceProductId } } } }); executionMs.push(performance.now() - started);
  now = new Date(Date.parse(armed.plan.expiresAt) + 1); started = performance.now(); const preserved = await service.reconcileEvent(event, { sources: { firms: { state: 'current' }, sentinel3Pixels: { state: 'current' } } }); executionMs.push(performance.now() - started);
  replay.push({ eventId: source.id, viirsObservationId: viirs.id, viirsProductId: viirs.provenance.rawSourceProductId, preferredNextFamily: armed.plan.preferredNextFamily, opportunityType: armed.plan.opportunity.opportunityType, watchStateBeforeExpiry: armed.plan.sourceWatch.state, resultState: preserved.plan.resultState, resolutionState: preserved.plan.resolutionState, closedWithoutEvidence: preserved.plan.resolutionState === 'CLOSED', coveragePercentClaims: preserved.coverage.forecasts.filter((item) => item.coveragePercent !== null).length });
}
const plans = [...store.plans.values()], decisions = store.decisions, sortedMs = executionMs.slice().sort((a, b) => a - b);
const payload = {
  schemaVersion: 'vigia.autonomous-evidence-operations-proof.v1', generatedAt: new Date().toISOString(), mode: 'CONTROLLED_REPLAY_OF_REAL_PROVIDER_OBSERVATIONS', productionInjection: false,
  sources: { runtimeFile: path.relative(root, runtimeFile), projectionFile: path.relative(root, projectionFile), baselineFile: path.relative(root, baselineFile), realViirsEventIds: candidates.map((item) => item.id), realSentinel3ProductId: sentinel3Products[0].provenance.rawSourceProductId },
  before: { evidenceClosurePlans: 0, armedIndependentWatches: 0, closureResults: baseline.databaseEvidence?.opportunity_results ?? 0, decisionLedgerRecords: 0, truthfulTerritoryForecastHorizons: 0 },
  after: { evidenceClosurePlans: plans.length, armedIndependentWatches: replay.filter((item) => item.watchStateBeforeExpiry === 'ARMED').length, closureResults: plans.filter((item) => item.resultState).length, unknownClosed: plans.filter((item) => item.resolutionState === 'CLOSED').length, unknownPreserved: plans.filter((item) => item.resolutionState === 'PRESERVED').length, decisionLedgerRecords: decisions.length, truthfulTerritoryForecastHorizons: [...store.coverages.values()].reduce((sum, item) => sum + item.forecasts.length, 0), inventedCoveragePercentClaims: replay.reduce((sum, item) => sum + item.coveragePercentClaims, 0) },
  replay, resultStates: Object.fromEntries([...new Set(plans.map((item) => item.resultState))].map((state) => [state, plans.filter((item) => item.resultState === state).length])), decisionTypes: Object.fromEntries([...new Set(decisions.map((item) => item.decisionType))].map((type) => [type, decisions.filter((item) => item.decisionType === type).length])),
  controlledReplayExecutionLatency: { samples: executionMs.length, medianMs: Number(sortedMs[Math.floor(sortedMs.length / 2)].toFixed(3)), p95Ms: Number(sortedMs[Math.min(sortedMs.length - 1, Math.ceil(sortedMs.length * 0.95) - 1)].toFixed(3)), qualification: 'Local in-memory controlled-replay execution latency; not provider acquisition latency.' },
  verdict: { lifecycleExercised: ['UNKNOWN_IDENTIFIED', 'PLAN_CREATED', 'OPPORTUNITY_SELECTED', 'WATCH_ARMED', 'DOMAIN_RECOMPUTED', 'UNKNOWN_PRESERVED'], expiryNeverClosedUnknown: replay.every((item) => !item.closedWithoutEvidence), independentSentinel3FollowupSelectedForEveryViirsCandidate: replay.every((item) => item.preferredNextFamily === 'sentinel3_slstr'), noInventedCoveragePercentages: replay.every((item) => item.coveragePercentClaims === 0) },
  limitations: ['The available Sentinel-3 evidence has no event-specific orbital prediction or authoritative swath geometry for these VIIRS candidates, so the engine arms an UNKNOWN watch and preserves the unknown on expiry.', 'PostGIS persistence and DB-loss recovery remain unexecuted while Docker Desktop is stopped after host ENOSPC and VM I/O errors.']
};
payload.evidenceHash = `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
await mkdir(path.dirname(outputFile), { recursive: true }); await writeFile(outputFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ outputFile: path.relative(root, outputFile), evidenceHash: payload.evidenceHash, before: payload.before, after: payload.after, verdict: payload.verdict }, null, 2));
