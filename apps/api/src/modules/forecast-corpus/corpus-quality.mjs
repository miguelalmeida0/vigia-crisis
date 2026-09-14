import { readJson } from '../../shared/json-file.mjs';
import { CORPUS_SOURCES } from './source-portfolio.mjs';
import { DATA_RIGHTS } from '../reality-network/provider-portfolio.mjs';
import { writeCorpusDataCards, writeCorpusReport } from './reporting.mjs';

const countBy = (values) => Object.fromEntries([...new Set(values.filter(Boolean))].sort().map((value) => [value, values.filter((item) => item === value).length]));
const REGISTERED_RIGHTS = new Set(DATA_RIGHTS.map((item) => item.licenceId));
export async function generateCorpusQualityReport({ paths, products } = {}) {
  const state = await readJson(paths.acquisitionState, { products: {} }), providerState = await readJson(paths.providerState, { retrievals: {} }), raw = Object.values(state.products), retrievals = Object.values(providerState.retrievals ?? {}), examples = products.examples, incidents = products.incidents, validNegatives = products.negatives.filter((item) => item.classification === 'VALID_NEGATIVE'), hardNegatives = validNegatives.filter((item) => item.hardNegative), regions = countBy(incidents.map((item) => item.region)), seasons = countBy(incidents.map((item) => item.season)), perimeterStates = incidents.map((item) => item.perimeterStates.length), horizonCounts = Object.fromEntries([1, 3, 6, 12, 24].map((hours) => [hours, examples.filter((item) => item.horizonHours === hours).length]));
  const rawByProvider = {}; for (const item of raw) (rawByProvider[item.provider] ??= []).push(item);
  const measuredBlockers = [
    incidents.flatMap((item) => item.weatherRuns ?? []).some((run) => run.valuesDecoded === true) ? null : 'HRRR_GRIB_VALUES_NOT_DECODED_OR_MISSING_VALUE_CERTIFIED',
    validNegatives.length ? null : 'NO_VALID_NEGATIVE_OBSERVATION_OPPORTUNITIES',
    incidents.some((item) => item.region === 'portugal' && item.perimeterStates.length >= 3) ? null : 'PORTUGAL_ISSUE_TIME_PROGRESSION_NOT_ACQUIRED',
    incidents.some((item) => item.assetContext) ? null : 'VERSIONED_ASSET_CONTEXT_NOT_ACQUIRED',
    examples.some((item) => item.futureImpactLabels?.length) ? null : 'FUTURE_IMPACT_LABELS_NOT_ACQUIRED',
  ].filter(Boolean);
  const blockers = [...new Set([...products.readiness.failedGates, ...measuredBlockers, ...incidents.flatMap((item) => item.acquisitionBlockers ?? []), ...CORPUS_SOURCES.filter((item) => item.status !== 'READY').map((item) => `${item.id}:${item.status}:${item.blocker}`), ...CORPUS_SOURCES.filter((item) => !REGISTERED_RIGHTS.has(item.licenceId)).map((item) => `${item.id}:LICENCE_NOT_REGISTERED:${item.licenceId}`)])].sort();
  const report = {
    schemaVersion: 'vigia.forecast-corpus-quality-report.v1', decision: products.readiness.decision,
    sourceReadiness: CORPUS_SOURCES.map((item) => ({ source: item.id, status: item.status, period: item.archivePeriod, regions: item.regions, products: item.products, accessMethod: item.accessMethod, knowledgeTimeQuality: item.knowledgeTimeQuality, perimeterSequenceCapability: item.perimeterSequenceCapability, objectsRetrieved: (rawByProvider[item.id] ?? []).length, bytesRetrieved: (rawByProvider[item.id] ?? []).reduce((sum, row) => sum + Number(row.byteLength ?? 0), 0), licence: item.licenceId, licenceStatus: REGISTERED_RIGHTS.has(item.licenceId) ? 'REGISTERED' : 'NOT_REGISTERED', limitation: item.blocker })),
    regions, seasons, incidentsDiscovered: incidents.length, incidentsEligible: new Set(examples.map((item) => item.incidentId)).size, examplesEligible: examples.length,
    eligibilityRate: incidents.length ? new Set(examples.map((item) => item.incidentId)).size / incidents.length : 0,
    progressionStateCounts: { total: perimeterStates.reduce((sum, value) => sum + value, 0), incidentsWithAtLeastThree: perimeterStates.filter((value) => value >= 3).length, distribution: countBy(perimeterStates.map(String)) },
    weatherCompleteness: { incidentsWithRuns: incidents.filter((item) => item.weatherRuns.length).length, decodedOperationalRuns: incidents.flatMap((item) => item.weatherRuns).filter((run) => run.valuesDecoded).length },
    fuelTerrainCompleteness: { fuelPacks: incidents.filter((item) => item.fuelPack).length, terrainPacks: incidents.filter((item) => item.terrainPack).length },
    labelCompleteness: { futureLabelsInEligibleExamples: examples.length, rejectedForNoFutureLabel: products.rejections.filter((item) => item.reasons.includes('NO_FUTURE_LABEL')).length },
    negativeControls: { discoveredCandidates: products.negatives.length, valid: validNegatives.length, excluded: products.negatives.length - validNegatives.length }, hardNegatives: hardNegatives.length,
    knowledgeTimeViolations: products.leakage.violations.filter((item) => /FUTURE|WEATHER|RETROSPECTIVE/.test(item.code)).length, leakageViolations: products.leakage.violations.length,
    splitSizes: products.splits.counts, horizonCounts, licensingState: { exportAllowed: products.rights.allowed, blockers: products.rights.blockers, attributions: products.rights.attributions.length },
    downloadedVolume: retrievals.reduce((sum, item) => sum + Number(item.contentLength ?? 0), 0), storedVolume: raw.reduce((sum, item) => sum + Number(item.byteLength ?? 0), 0), duplicateSavings: Math.max(0, retrievals.reduce((sum, item) => sum + Number(item.contentLength ?? 0), 0) - raw.reduce((sum, item) => sum + Number(item.byteLength ?? 0), 0)), rawObjectCount: raw.length,
    baselineEvaluation: products.baselines, replay: products.replayVerification, crosswalk: { incidents: products.crosswalk.incidents.length, ambiguous: products.crosswalk.ambiguous.length },
    selection: { allDiscovered: incidents.length, progressionCandidates: incidents.filter((item) => item.perimeterStates.length >= 3).length, eligibleIncidents: new Set(examples.map((item) => item.incidentId)).size, retainedExamples: examples.length, heldOutExamples: examples.filter((item) => item.split !== 'development' && item.split !== 'calibration').length },
    knownBiases: ['Only the Western US source currently supplies captured multi-revision perimeters.', 'Large well-mapped WFIGS incidents are overrepresented in the acquired pilot.', 'Portugal records are official occurrence/final context without operational progression.', 'FIRMS standard archive observations are retrospective and not issue-time features.'],
    unresolvedBlockers: blockers, failedGates: products.readiness.failedGates, readinessDimensions: products.readiness.gates,
  };
  report.dataCards = await writeCorpusDataCards(paths, report); await writeCorpusReport(paths, report); return report;
}
