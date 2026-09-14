import { execFile } from 'node:child_process';
import { unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import path from 'node:path';
import { readJson, writeJsonAtomic } from '../../shared/json-file.mjs';
import { fingerprint, truthPaths } from './contracts.mjs';

const execute = promisify(execFile), scorer = fileURLToPath(new URL('./score_geometry.py', import.meta.url));
const incidentToken = (value) => String(value ?? '').replace(/^incident:/, '').split(':').at(-1);
const time = (value) => Date.parse(value ?? '');
const geometryOf = (horizon) => horizon?.geometry ?? horizon?.perimeter ?? horizon?.forecastPerimeter ?? horizon?.contour?.geometry ?? null;

async function geometryScore(projectRoot, predicted, observed, id) {
  const file = path.join(truthPaths(projectRoot).runtime, 'scratch', `${id.replaceAll(/[^a-zA-Z0-9]/g, '_')}.json`); await writeJsonAtomic(file, { predicted, observed });
  try { const { stdout } = await execute(path.join(projectRoot, '.venv/bin/python'), [scorer, file], { timeout: 30_000, maxBuffer: 4 * 1024 * 1024, env: { PATH: process.env.PATH, PYTHONNOUSERSITE: '1' } }); return JSON.parse(stdout); } finally { await unlink(file).catch(() => {}); }
}

export function forecastIntegrity(forecast, label) {
  const failures = [];
  if (!forecast.forecastId || !forecast.outputHash || !forecast.inputManifestHash || !forecast.model?.fingerprint || !forecast.replayFingerprint) failures.push('FORECAST_FINGERPRINT_INCOMPLETE');
  if (forecast.inputChronologyComplete === false) failures.push('INPUT_CHRONOLOGY_INCOMPLETE');
  if (!(time(forecast.issuedAt) >= time(label.issueAvailableToVigiaAt) && time(forecast.issuedAt) < time(label.laterTruthAvailableToVigiaAt))) failures.push('FORECAST_OUTSIDE_LABEL_KNOWLEDGE_WINDOW');
  if (time(forecast.informationCutoff) > time(label.issueAvailableToVigiaAt)) failures.push('FORECAST_FUTURE_DATA_LEAKAGE');
  if (forecast.weatherRunAvailableAt && time(forecast.weatherRunAvailableAt) > time(forecast.issuedAt)) failures.push('WEATHER_RUN_NOT_KNOWABLE_AT_ISSUE');
  if (forecast.geometryValid === false) failures.push('FORECAST_GEOMETRY_INVALID');
  if (forecast.incidentId && incidentToken(forecast.incidentId) !== incidentToken(label.incidentId)) failures.push('INCIDENT_IDENTITY_MISMATCH');
  if (forecast.model?.applicable === false) failures.push('MODEL_OUTSIDE_APPLICABLE_DOMAIN');
  if (label.authorityClass && label.authorityClass !== 'AUTHORITATIVE_OPERATIONAL_PERIMETER') failures.push('LABEL_AUTHORITY_INSUFFICIENT');
  if (label.issueRevisionInvalidated === true) failures.push('ISSUE_PERIMETER_CORRECTION_INVALIDATED_MEANING');
  return failures;
}

export async function scoreOfficialForecasts(state, { projectRoot, clock = () => new Date() } = {}) {
  const store = await readJson(path.join(projectRoot, 'data/runtime/forecasting/forecast-store.json'), { forecasts: [] }), byRevision = new Map(state.revisions.map((item) => [item.revisionId, item])), results = [];
  for (const label of state.labels) {
    const issue = byRevision.get(label.issueRevisionId), truth = byRevision.get(label.laterRevisionId); if (!issue || !truth) continue;
    const candidates = (store.forecasts ?? []).filter((forecast) => incidentToken(forecast.incidentId) === incidentToken(label.incidentId) && time(forecast.issuedAt) < time(label.laterTruthAvailableToVigiaAt));
    const baselineMetrics = await geometryScore(projectRoot, issue.geometry, truth.geometry, `${label.labelId}-no-growth`), baselines = { NO_GROWTH: { state: 'SCORED', metrics: baselineMetrics }, RECENT_GROWTH: { state: 'UNAVAILABLE_INPUTS' }, OBSERVATION_KINEMATIC: { state: 'UNAVAILABLE_INPUTS' }, WIND_ALIGNED: { state: 'UNAVAILABLE_INPUTS' }, PHYSICAL_BASELINE: { state: 'UNAVAILABLE_INPUTS' }, HYBRID: { state: 'NOT_AUTHORIZED_FOR_PROMOTION' } };
    if (!candidates.length) { const core = { schemaVersion: 'vigia.official-forecast-score.v1', labelId: label.labelId, incidentId: label.incidentId, horizon: label.horizon, state: 'NO_MATCHING_FORECAST', forecastId: null, integrityFailures: [], metrics: null, baselines, scoredAt: clock().toISOString(), futureEvidenceUsed: false }; results.push({ ...core, scoreId: fingerprint('official-forecast-score', core) }); continue; }
    for (const forecast of candidates) {
      const failures = forecastIntegrity(forecast, label), horizon = (forecast.horizons ?? []).find((item) => Number(item.hours) === Number(label.targetMinutes) / 60), predicted = geometryOf(horizon); let metrics = null, scoreState;
      if (failures.length) scoreState = 'INVALID_FOR_OFFICIAL_EVALUATION'; else if (forecast.state === 'ABSTAINED') scoreState = 'ABSTENTION_EVALUATED'; else if (!predicted) scoreState = 'FORECAST_GEOMETRY_UNAVAILABLE'; else { metrics = await geometryScore(projectRoot, predicted, truth.geometry, `${label.labelId}-${forecast.forecastId}`); scoreState = 'SCORED'; }
      const core = { schemaVersion: 'vigia.official-forecast-score.v1', labelId: label.labelId, incidentId: label.incidentId, horizon: label.horizon, state: scoreState, forecastId: forecast.forecastId, forecastOutputHash: forecast.outputHash, inputManifestHash: forecast.inputManifestHash, model: forecast.model, integrityFailures: failures, metrics: metrics ? { ...metrics, arrivalTimeErrorMinutes: null, credibleContourCoverage: null, falseSafeResult: metrics.underpredictionAreaSquareKm > 0, abstentionCorrectness: null } : { iou: null, areaErrorSquareKm: null, centroidDisplacementKm: null, boundaryHausdorffDistanceKm: null, underpredictionAreaSquareKm: null, overpredictionAreaSquareKm: null, arrivalTimeErrorMinutes: null, credibleContourCoverage: null, falseSafeResult: null, abstentionCorrectness: forecast.state === 'ABSTAINED' ? 'ABSTAINED_WITHOUT_FALSE_SKILL_CLAIM' : null }, baselines, scoredAt: clock().toISOString(), futureEvidenceUsed: false }; results.push({ ...core, scoreId: fingerprint('official-forecast-score', core) });
    }
  }
  state.forecastScores = [...new Map([...state.forecastScores, ...results].map((item) => [item.scoreId, item])).values()]; return { labelsEvaluated: new Set(results.map((item) => item.labelId)).size, forecastsScored: results.filter((item) => item.state === 'SCORED').length, forecastComparisons: results.length, evaluationExecuted: state.labels.length > 0 && results.length > 0, results };
}
