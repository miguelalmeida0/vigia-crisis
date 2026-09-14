import { immutable, semanticHash } from '../intelligence/shared.mjs';
import { FORECAST_CORPUS_HORIZONS } from './constants.mjs';

const gate = (id, value, required, pass) => ({ id, value, required, pass });
export function assessCorpusReadiness({ discoveredIncidents = [], examples = [], negatives = [], leakageAudit, rightsAssessment, replayVerification } = {}) {
  const incidentIds = new Set(examples.map((item) => item.incidentId)), regions = new Set(examples.map((item) => item.region)), seasons = new Set(examples.map((item) => item.season));
  const validNegatives = negatives.filter((item) => item.classification === 'VALID_NEGATIVE'), validHardNegatives = validNegatives.filter((item) => item.hardNegative), horizonCounts = Object.fromEntries(FORECAST_CORPUS_HORIZONS.map((hours) => [hours, examples.filter((item) => item.horizonHours === hours).length])), splitCounts = Object.fromEntries(['development', 'calibration', 'held-out-test', 'geographic-stress-test', 'seasonal-stress-test'].map((split) => [split, examples.filter((item) => item.split === split).length]));
  const incidentSplits = new Map(); let splitIsolation = true;
  for (const example of examples) { const prior = incidentSplits.get(example.incidentId); if (prior && prior !== example.split) splitIsolation = false; incidentSplits.set(example.incidentId, example.split); }
  const complete = (predicate) => examples.length > 0 && examples.every(predicate);
  const gates = [
    gate('TWO_REGIONS', regions.size, 2, regions.size >= 2), gate('TWO_SEASONS', seasons.size, 2, seasons.size >= 2),
    gate('ONE_HUNDRED_INCIDENTS', incidentIds.size, 100, incidentIds.size >= 100), gate('ONE_HUNDRED_NEGATIVES', validNegatives.length, 100, validNegatives.length >= 100),
    gate('PROMOTION_MINIMUM_NEGATIVES', validNegatives.length, 20, validNegatives.length >= 20),
    gate('TWENTY_FIVE_HARD_NEGATIVES', validHardNegatives.length, 25, validHardNegatives.length >= 25),
    gate('PROGRESSION_COMPLETENESS', incidentIds.size, 100, incidentIds.size >= 100),
    gate('WEATHER_COMPLETENESS', examples.filter((item) => item.weatherRuns?.length).length, 'ALL_ELIGIBLE_EXAMPLES', complete((item) => item.weatherRuns?.length > 0)),
    gate('FUEL_COMPLETENESS', examples.filter((item) => item.fuelPack).length, 'ALL_ELIGIBLE_EXAMPLES', complete((item) => Boolean(item.fuelPack))),
    gate('TERRAIN_COMPLETENESS', examples.filter((item) => item.terrainPack).length, 'ALL_ELIGIBLE_EXAMPLES', complete((item) => Boolean(item.terrainPack))),
    gate('FUTURE_LABEL_COMPLETENESS', examples.filter((item) => item.label).length, 'ALL_ELIGIBLE_EXAMPLES', complete((item) => Boolean(item.label))),
    gate('BRONZE_SILVER_LINEAGE_COMPLETENESS', examples.filter((item) => item.provenanceComplete).length, 'ALL_ELIGIBLE_EXAMPLES', complete((item) => item.provenanceComplete === true)),
    gate('DEVELOPMENT_SPLIT_NONEMPTY', splitCounts.development, 1, splitCounts.development > 0),
    gate('CALIBRATION_SPLIT_NONEMPTY', splitCounts.calibration, 1, splitCounts.calibration > 0),
    gate('HELD_OUT_TEST_SPLIT_NONEMPTY', splitCounts['held-out-test'], 1, splitCounts['held-out-test'] > 0),
    gate('INCIDENT_SPLIT_ISOLATION', splitIsolation, true, splitIsolation),
    ...FORECAST_CORPUS_HORIZONS.map((hours) => gate(`HORIZON_${hours}H`, horizonCounts[hours], 1, horizonCounts[hours] > 0)),
    gate('KNOWLEDGE_TIME_LEAKAGE_ZERO', leakageAudit?.violations?.length ?? null, 0, leakageAudit?.passed === true),
    gate('DATA_RIGHTS_EXPORTABLE', rightsAssessment?.allowed ?? false, true, rightsAssessment?.allowed === true),
    gate('REPLAY_IDENTICAL', replayVerification?.identical ?? false, true, replayVerification?.identical === true && replayVerification?.reversedOrderingStable === true),
  ];
  const failedGates = gates.filter((item) => !item.pass).map((item) => item.id), decision = failedGates.length ? 'CORPUS_NOT_READY' : 'CORPUS_READY_FOR_FORECAST_EVALUATION';
  const core = { schemaVersion: 'vigia.forecast-corpus-readiness.v1', decision, counts: { discoveredIncidents: discoveredIncidents.length, eligibleIncidents: incidentIds.size, examples: examples.length, validNegatives: validNegatives.length, hardNegatives: validHardNegatives.length, regions: regions.size, seasons: seasons.size, horizonCounts, splitCounts }, gates, failedGates };
  return immutable({ ...core, decisionHash: semanticHash('forecast-corpus-readiness', core) });
}
