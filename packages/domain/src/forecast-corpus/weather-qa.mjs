import { isoTime, semanticHash } from '../intelligence/shared.mjs';
import { WEATHER_RUN_TYPES } from './constants.mjs';

const REQUIRED = Object.freeze(['wind_u_10m', 'wind_v_10m', 'temperature_2m', 'relative_humidity_2m']);
export function validateWeatherRun(run = {}, { informationCutoff, domainBbox } = {}) {
  const failures = [], issueTime = isoTime(run.issueTime, 'weather_issue_time_required');
  const cutoff = isoTime(informationCutoff, 'weather_cutoff_required');
  if (!WEATHER_RUN_TYPES.includes(run.runType)) failures.push('WEATHER_RUN_TYPE_INVALID');
  if (Date.parse(issueTime) > Date.parse(cutoff)) failures.push('FUTURE_WEATHER_RUN');
  if (!run.availableToVigiaAt || Date.parse(run.availableToVigiaAt) > Date.parse(cutoff)) failures.push('WEATHER_NOT_AVAILABLE_AT_ISSUE_TIME');
  if (['ANALYSIS', 'RETROSPECTIVE_REANALYSIS'].includes(run.runType)) failures.push('NON_OPERATIONAL_WEATHER_FEATURE');
  if (!run.model || !run.runId || !run.member || !run.grid?.id || !run.grid?.resolution || !run.archiveIdentity || !run.retrievedAt || !run.availabilityBasis) failures.push('WEATHER_IDENTITY_INCOMPLETE');
  if (!Array.isArray(run.coverage?.bbox) || run.coverage.bbox.length !== 4) failures.push('WEATHER_COVERAGE_INVALID');
  else if (domainBbox && (run.coverage.bbox[0] > domainBbox[0] || run.coverage.bbox[1] > domainBbox[1] || run.coverage.bbox[2] < domainBbox[2] || run.coverage.bbox[3] < domainBbox[3])) failures.push('WEATHER_DOMAIN_NOT_COVERED');
  const fields = run.fields ?? [], names = new Set(fields.map((field) => field.variable));
  for (const name of REQUIRED) if (!names.has(name)) failures.push(`WEATHER_VARIABLE_MISSING:${name}`);
  for (const field of fields) {
    if (!Number.isFinite(Number(field.forecastStepHours)) || Number(field.forecastStepHours) < 0) failures.push('WEATHER_STEP_INVALID');
    if (!field.validTime || !field.level || !field.units || !field.contentHash) failures.push('WEATHER_FIELD_METADATA_INCOMPLETE');
    if (Date.parse(field.validTime) < Date.parse(issueTime)) failures.push('WEATHER_VALID_BEFORE_ISSUE');
  }
  if (run.valuesDecoded !== true) failures.push('WEATHER_VALUES_NOT_DECODED');
  if (!Number.isFinite(Number(run.missingValues))) failures.push('WEATHER_MISSING_VALUE_QA_UNAVAILABLE');
  const core = { schemaVersion: 'vigia.corpus-weather-qa.v1', runId: run.runId ?? null, issueTime, runType: run.runType ?? null, fields: fields.length, failures: [...new Set(failures)].sort() };
  return { ...core, passed: core.failures.length === 0, operationalFeatureEligible: core.failures.length === 0, reportHash: semanticHash('corpus-weather-qa', core) };
}
