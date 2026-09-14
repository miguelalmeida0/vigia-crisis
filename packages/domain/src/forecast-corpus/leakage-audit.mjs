import { immutable, semanticHash } from '../intelligence/shared.mjs';

const violation = (code, row, detail) => ({ code, rowId: row.id ?? null, detail: String(detail ?? '') });
function isolated(rows, key, code, violations) {
  const seen = new Map();
  for (const row of rows) for (const value of [row[key]].flat().filter(Boolean)) { const prior = seen.get(value); if (prior && prior !== row.split) violations.push(violation(code, row, `${value}:${prior}->${row.split}`)); else seen.set(value, row.split); }
}
export function auditCorpusLeakage(rows = [], negatives = []) {
  const violations = [];
  isolated(rows, 'incidentId', 'INCIDENT_SPLIT_LEAKAGE', violations);
  for (const [key, code] of [['upstreamObservationIds', 'UPSTREAM_OBSERVATION_SPLIT_LEAKAGE'], ['physicalPixelIds', 'PHYSICAL_PIXEL_SPLIT_LEAKAGE'], ['providerRepublicationIds', 'PROVIDER_REPUBLICATION_SPLIT_LEAKAGE'], ['geometryDuplicateGroupIds', 'NEAR_DUPLICATE_GEOMETRY_SPLIT_LEAKAGE'], ['persistentAnomalySiteIds', 'PERSISTENT_ANOMALY_SPLIT_LEAKAGE']]) isolated(rows, key, code, violations);
  for (const row of rows) {
    const cutoff = Date.parse(row.informationCutoff);
    for (const feature of row.features ?? []) {
      if (!Number.isFinite(Date.parse(feature.availableToVigiaAt)) || Date.parse(feature.availableToVigiaAt) > cutoff) violations.push(violation('FUTURE_INFORMATION_LEAKAGE', row, feature.id));
      if (['FINAL_PERIMETER', 'RETROSPECTIVE_MTBS', 'FINAL_BURNED_AREA_STATISTIC', 'FUTURE_ASSET_OUTCOME'].includes(feature.kind) || feature.role === 'TARGET_LABEL') violations.push(violation('RETROSPECTIVE_LABEL_AS_FEATURE', row, feature.id));
      if (feature.processingMode === 'STANDARD' && row.operationalMode === 'NRT') violations.push(violation('REVISED_SCIENCE_PRODUCT_IN_NRT', row, feature.id));
      if (Number.isFinite(Number(row.issueRevision)) && Number(feature.revision) > Number(row.issueRevision)) violations.push(violation('LATER_PERIMETER_REVISION_LEAKED_BACKWARD', row, feature.id));
      if (feature.observationTimeBasis === 'PROVIDER_MODIFIED') violations.push(violation('PROVIDER_MODIFICATION_AS_OBSERVATION', row, feature.id));
    }
    for (const weather of row.weatherRuns ?? []) {
      if (Date.parse(weather.issueTime) > cutoff) violations.push(violation('FUTURE_WEATHER_RUN', row, weather.runId));
      if (!weather.availableToVigiaAt || Date.parse(weather.availableToVigiaAt) > cutoff) violations.push(violation('FUTURE_WEATHER_AVAILABILITY', row, weather.runId));
      if (['ANALYSIS', 'RETROSPECTIVE_REANALYSIS'].includes(weather.runType)) violations.push(violation('NON_OPERATIONAL_WEATHER_FEATURE', row, weather.runId));
    }
    if (row.causalFamilies?.includes('VIIRS') && row.causalFamilies?.includes('FEDS_AS_INDEPENDENT')) violations.push(violation('FEDS_INFLATES_VIIRS', row, row.incidentId));
    if (row.assetContext?.absenceMeansZero === true) violations.push(violation('MISSING_ASSET_BECOMES_ZERO', row, row.incidentId));
    if (row.label?.availableToVigiaAt && Date.parse(row.label.availableToVigiaAt) <= cutoff) violations.push(violation('FUTURE_LABEL_LEAKED_BACKWARD', row, row.label.id));
  }
  for (const negative of negatives) {
    if (negative.classification === 'VALID_NEGATIVE' && negative.checks?.providerHealthy !== true) violations.push(violation('PROVIDER_DOWNTIME_AS_NEGATIVE', negative, negative.id));
    if (negative.classification === 'VALID_NEGATIVE' && negative.checks?.observationOpportunity !== true) violations.push(violation('EMPTY_RESPONSE_AS_NEGATIVE', negative, negative.id));
    if (negative.outcome === 'WILDFIRE_NEGATIVE' && negative.prescribedFireState === 'CONFIRMED') violations.push(violation('PRESCRIBED_FIRE_AS_NO_FIRE', negative, negative.id));
  }
  const ordered = violations.sort((a, b) => `${a.code}:${a.rowId}`.localeCompare(`${b.code}:${b.rowId}`));
  const core = { schemaVersion: 'vigia.corpus-leakage-audit.v1', passed: !ordered.length, rowsInspected: rows.length, negativesInspected: negatives.length, violations: ordered };
  return immutable({ ...core, fingerprint: semanticHash('corpus-leakage-audit', core) });
}
