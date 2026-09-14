import { immutable, semanticHash } from '../intelligence/shared.mjs';

export const WORLDCLASS_SLOS = Object.freeze({
  interactiveIncidentRead: { percentile: 0.95, targetMs: 250, objective: 0.995, windowDays: 28 }, decisionPacketCompilation: { percentile: 0.95, targetMs: 1_000, objective: 0.99, windowDays: 28 }, operationalEventIngestion: { percentile: 0.99, targetMs: 500, objective: 0.995, windowDays: 28 }, projectionLatency: { percentile: 0.99, targetMs: 2_000, objective: 0.99, windowDays: 28 }, providerIngestion: { percentile: 0.95, targetMs: 60_000, objective: 0.98, windowDays: 28 }, bulkCorpusProcessing: { percentile: 0.95, targetMs: 300_000, objective: 0.95, windowDays: 28 }, failover: { percentile: 1, targetMs: 300_000, objective: 1, windowDays: 90 }, replay: { percentile: 0.95, targetMs: 30_000, objective: 0.99, windowDays: 28 },
});
export function evaluateErrorBudgets(observations = {}) {
  const services = Object.fromEntries(Object.entries(WORLDCLASS_SLOS).map(([id, slo]) => { const rows = observations[id] ?? [], good = rows.filter((row) => row.success === true && Number(row.durationMs) <= slo.targetMs).length, allowedBad = rows.length * (1 - slo.objective), consumedBad = rows.length - good, remaining = Math.max(0, allowedBad - consumedBad), exhausted = rows.length > 0 && consumedBad > allowedBad; return [id, { ...slo, observations: rows.length, good, consumedBad, allowedBad, remaining, state: exhausted ? 'EXHAUSTED' : rows.length ? 'WITHIN_BUDGET' : 'NO_DATA' }]; }));
  const freezeNonRemediationChanges = Object.values(services).some((item) => item.state === 'EXHAUSTED'), core = { schemaVersion: 'vigia.error-budget-report.v1', services, freezeNonRemediationChanges, freezePolicy: 'Any exhausted service budget blocks non-remediation release promotion.' };
  return immutable({ ...core, fingerprint: semanticHash('error-budget-report', core) });
}
