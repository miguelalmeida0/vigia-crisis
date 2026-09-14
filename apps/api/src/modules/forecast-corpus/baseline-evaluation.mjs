import { noGrowthPersistence, observationKinematicProgression, recentGrowthPersistence, windAlignedProgression, aggregateSpreadEvaluation, polygonAreaKm2 } from '../../../../../packages/domain/src/forecasting/index.mjs';
import { assessBaselineSafety } from '../../../../../packages/domain/src/decision-foundry/index.mjs';
import { validateCorpusGeometry } from '../../../../../packages/domain/src/forecast-corpus/index.mjs';

const builders = Object.freeze([
  ['NO_GROWTH_PERSISTENCE', (input) => noGrowthPersistence(input)],
  ['RECENT_GROWTH_PERSISTENCE', (input) => recentGrowthPersistence(input)],
  ['WIND_ALIGNED_PROGRESSION', (input) => windAlignedProgression(input)],
  ['OBSERVATION_KINEMATIC_PROGRESSION', (input) => observationKinematicProgression(input)],
]);
function polygonForBaseline(geometry) {
  if (geometry?.type !== 'MultiPolygon') return geometry;
  const area = (ring = []) => Math.abs(ring.slice(0, -1).reduce((sum, point, index) => { const next = ring[index + 1] ?? ring[0]; return sum + point[0] * next[1] - next[0] * point[1]; }, 0) / 2);
  const polygon = [...(geometry.coordinates ?? [])].sort((left, right) => area(right[0]) - area(left[0]))[0];
  if (!polygon) throw new Error('forecast_multipolygon_empty');
  return { type: 'Polygon', coordinates: polygon };
}
export function evaluateCorpusBaselines(examples = []) {
  if (!examples.length) return { schemaVersion: 'vigia.corpus-baseline-evaluation.v1', state: 'UNMEASURED', caseCount: 0, models: {} };
  const models = {};
  for (const [modelId, build] of builders) {
    const cases = [], abstentions = [];
    for (const example of examples) {
      const history = example.features, initial = polygonForBaseline(history.at(-1).geometry), prior = history.at(-2), elapsed = prior ? (Date.parse(history.at(-1).observedAt) - Date.parse(prior.observedAt)) / 3_600_000 : null, currentArea = polygonAreaKm2(initial), previousArea = prior ? polygonAreaKm2(polygonForBaseline(prior.geometry)) : null, areaGrowthKm2PerHour = prior && elapsed > 0 ? Math.max(0, currentArea - previousArea) / elapsed : 0, boundaryVelocityKmH = Math.sqrt(areaGrowthKm2PerHour / Math.PI), ratio = previousArea > 0 ? currentArea / previousArea : null, revisionClassification = !prior ? 'NEW_OBSERVATION' : !Number.isFinite(elapsed) || elapsed < .25 ? 'GEOMETRY_REFINEMENT' : ratio < .2 || ratio > 8 ? 'CORRECTION' : 'NORMAL_PROGRESSION', geometryValid = validateCorpusGeometry({ geometry: history.at(-1).geometry }).passed && (!prior || validateCorpusGeometry({ geometry: prior.geometry }).passed), safety = assessBaselineSafety({ currentAreaKm2: currentArea, previousAreaKm2: previousArea, deltaHours: elapsed, horizonHours: example.horizonHours, boundaryVelocityKmH, revisionClassification, geometryValid });
      if (modelId !== 'NO_GROWTH_PERSISTENCE' && !safety.passed) { abstentions.push({ exampleId: example.id, horizonHours: example.horizonHours, reasons: safety.failures }); continue; }
      const member = build({ issuedAt: example.issuedAt, initialPerimeter: initial, horizonsHours: [example.horizonHours], areaGrowthKm2PerHour, boundaryVelocityKmH: Math.sqrt(areaGrowthKm2PerHour / Math.PI), sourceIds: example.upstreamObservationIds });
      cases.push({ forecastHorizon: member.horizons[0], observedPerimeter: polygonForBaseline(example.label.geometry) });
    }
    const evaluation = aggregateSpreadEvaluation(cases); models[modelId] = { ...evaluation, applicability: { evaluatedCases: cases.length, abstainedCases: abstentions.length, abstentions }, stabilityState: Object.values(evaluation.horizons).every((item) => Number.isFinite(item.meanAbsoluteAreaErrorKm2) && item.meanAbsoluteAreaErrorKm2 <= 10_000) ? 'BOUNDED' : 'UNSTABLE' };
  }
  return { schemaVersion: 'vigia.corpus-baseline-evaluation.v1', state: 'MEASURED', caseCount: examples.length, models };
}
