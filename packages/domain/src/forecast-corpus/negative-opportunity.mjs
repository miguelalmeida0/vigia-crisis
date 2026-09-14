import { immutable, isoTime, requiredText, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';
import { NEGATIVE_OUTCOMES } from './constants.mjs';

export function createCorpusNegativeOpportunity(value = {}) {
  const outcome = requiredText(value.outcome, 'negative_outcome_required');
  if (!NEGATIVE_OUTCOMES.includes(outcome)) throw new Error('negative_outcome_invalid');
  const checks = value.checks ?? {}, failures = [];
  if (checks.sourceCoverage !== true) failures.push('SOURCE_COVERAGE_UNPROVEN');
  if (checks.providerHealthy !== true) failures.push('PROVIDER_UNHEALTHY');
  if (checks.observationOpportunity !== true) failures.push('NO_OBSERVATION_OPPORTUNITY');
  if (checks.qualityAdequate !== true) failures.push('QUALITY_INADEQUATE');
  if (checks.officialIncidentChecked !== true) failures.push('OFFICIAL_INCIDENT_NOT_CHECKED');
  if (checks.physicalFireChecked !== true) failures.push('PHYSICAL_FIRE_NOT_CHECKED');
  if (outcome === 'WILDFIRE_NEGATIVE' && value.prescribedFireState === 'UNKNOWN') failures.push('PRESCRIBED_FIRE_UNRESOLVED');
  if (outcome !== 'WILDFIRE_NEGATIVE') failures.push(`NOT_STRONG_WILDFIRE_NEGATIVE:${outcome}`);
  const core = {
    schemaVersion: 'vigia.corpus-negative-opportunity.v1', id: requiredText(value.id, 'negative_id_required'),
    region: requiredText(value.region, 'negative_region_required'), season: requiredText(value.season, 'negative_season_required'),
    window: { from: isoTime(value.window?.from), to: isoTime(value.window?.to) }, geometry: structuredClone(value.geometry),
    outcome, category: requiredText(value.category, 'negative_category_required'), hardNegative: Boolean(value.hardNegative),
    sourceOpportunityIds: uniqueSorted(value.sourceOpportunityIds), officialCheckIds: uniqueSorted(value.officialCheckIds),
    physicalCheckIds: uniqueSorted(value.physicalCheckIds), prescribedFireState: value.prescribedFireState ?? 'UNKNOWN',
    checks: structuredClone(checks), invalidationConditions: uniqueSorted(value.invalidationConditions), failures: uniqueSorted(failures),
  };
  return immutable({ ...core, classification: failures.length ? 'EXCLUDED_CONTROL' : 'VALID_NEGATIVE', fingerprint: semanticHash('corpus-negative-opportunity', core) });
}
export function createThermalAnomalyRegistry(entries = [], version = '1.0.0') {
  const normalized = entries.map((entry) => ({ id: requiredText(entry.id, 'anomaly_id_required'), geometry: structuredClone(entry.geometry), category: requiredText(entry.category, 'anomaly_category_required'), source: requiredText(entry.source, 'anomaly_source_required'), observationIds: uniqueSorted(entry.observationIds), evidenceIds: uniqueSorted(entry.evidenceIds), effectiveFrom: isoTime(entry.effectiveFrom), effectiveTo: entry.effectiveTo ? isoTime(entry.effectiveTo) : null, qualityClass: requiredText(entry.qualityClass, 'anomaly_quality_required'), reviewState: requiredText(entry.reviewState, 'anomaly_review_required'), licenceId: requiredText(entry.licenceId, 'anomaly_licence_required') })).sort((a, b) => a.id.localeCompare(b.id));
  const core = { schemaVersion: 'vigia.persistent-thermal-anomaly-registry.v1', version, entries: normalized };
  return immutable({ ...core, fingerprint: semanticHash('thermal-anomaly-registry', core) });
}
