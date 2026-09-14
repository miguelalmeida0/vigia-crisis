import { semanticHash } from '../intelligence/shared.mjs';
import { occursAfterAsOf } from './as-of-projection.mjs';
import {
  OUTCOME_STATES, certifiedOutcome, object, rows, state, strategicId, text,
  truthSource, unavailable, visibleAt,
} from './strategic-helpers.mjs';

const MEMORY_DIMENSIONS = Object.freeze([
  ['terrain', ['terrainClass', 'terrain.class', 'terrain.kind']],
  ['weather', ['weatherRegime', 'weather.regime', 'weather.class']],
  ['thermal pattern', ['thermalPattern', 'thermal.pattern']],
  ['community layout', ['communityLayout', 'community.layout']],
  ['road access', ['roadAccessClass', 'roads.accessClass', 'roadAccess.class']],
  ['resource constraint', ['resourceConstraintClass', 'resources.constraintClass']],
  ['decision pattern', ['decisionPattern', 'decision.pattern']],
]);

function firstPath(value, paths) {
  for (const path of paths) {
    const candidate = path.split('.').reduce((current, key) => object(current)[key], value);
    if (text(candidate)) return text(candidate);
  }
  return null;
}

export function projectShadowMode(strategies, actualOutcome, asOf) {
  const supplied = rows(strategies), observedOutcome = certifiedOutcome(actualOutcome, asOf);
  const admitted = supplied.flatMap((strategy, index) => {
    const universe = state(strategy.universe ?? strategy.mode);
    const assumptions = rows(strategy.assumptions).map(text).filter(Boolean);
    const simulatedOutcome = object(strategy.simulatedOutcome ?? strategy.projectedOutcome);
    const simulationSource = truthSource(strategy.simulation ?? strategy);
    const simulatedAt = strategy.simulatedAt ?? strategy.generatedAt ?? strategy.recordedAt;
    const simulationAt = simulatedAt && Number.isFinite(Date.parse(simulatedAt)) ? new Date(simulatedAt).toISOString() : null;
    if (occursAfterAsOf(strategy, asOf) || !['EXERCISE', 'REPLAY'].includes(universe) || !assumptions.length || !Object.keys(simulatedOutcome).length || !simulationSource || !simulationAt || Date.parse(simulationAt) > Date.parse(asOf)) return [];
    const comparisonMetrics = observedOutcome ? Object.keys(simulatedOutcome).sort().flatMap((key) => {
      const simulated = simulatedOutcome[key], observed = observedOutcome[key];
      return Number.isFinite(Number(simulated)) && Number.isFinite(Number(observed))
        ? [{ metric: key, simulated: Number(simulated), observed: Number(observed), difference: Number(simulated) - Number(observed), causalInterpretation: false }]
        : [];
    }) : [];
    return [{
      strategyId: text(strategy.id ?? strategy.strategyId) ?? strategicId('shadow-strategy', { index, strategy }),
      label: text(strategy.label ?? strategy.title) ?? `Alternative strategy ${index + 1}`,
      universe, assumptions, simulationSource, simulatedAt: simulationAt,
      simulatedOutcome: structuredClone(simulatedOutcome), actualOutcome: observedOutcome,
      comparison: { metricCount: comparisonMetrics.length, metrics: comparisonMetrics, causalInterpretation: false },
      comparisonState: observedOutcome ? 'SIMULATED_VERSUS_OBSERVED_COMPARISON' : actualOutcome ? 'SIMULATION_ONLY_ACTUAL_OUTCOME_NOT_ADMITTED' : 'SIMULATION_ONLY',
      causalClaim: false, productionTruthMutation: false,
    }];
  });
  return admitted.length ? {
    schemaVersion: 'vigia.crisis-shadow-mode.v1', state: 'EXERCISE_OR_REPLAY_READY', generatedAt: asOf, strategies: admitted,
    counts: { supplied: supplied.length, admitted: admitted.length, excludedOrInvalid: supplied.length - admitted.length, observedOutcomeAdmitted: observedOutcome ? 1 : 0 },
    truthBoundary: 'Alternative strategies are isolated exercise or replay projections. They are not causal truth, production outcomes, authority, or execution.',
  } : {
    ...unavailable('vigia.crisis-shadow-mode.v1', 'No exercise/replay strategy with explicit assumptions and a simulated outcome was supplied.', 'Supply an isolated EXERCISE or REPLAY strategy, explicit assumptions, attributable simulation provenance/time, and a simulated outcome.'),
    counts: { supplied: supplied.length, admitted: 0, excludedOrInvalid: supplied.length, observedOutcomeAdmitted: observedOutcome ? 1 : 0 },
    truthBoundary: 'No missing simulation is treated as evidence, a production outcome, authority, or execution.',
  };
}

export function projectCrisisMemory(incident, historicalIncidents, asOf) {
  const current = object(incident), supplied = rows(historicalIncidents);
  const matches = supplied.flatMap((candidate, index) => {
    const historicalState = state(candidate.recordState ?? candidate.mode ?? candidate.universe), source = truthSource(candidate);
    if (occursAfterAsOf(candidate, asOf) || !visibleAt(candidate, asOf, candidate.closedAt ?? candidate.archivedAt) || !['HISTORICAL', 'HISTORICAL_CLOSED', 'CERTIFIED_REPLAY'].includes(historicalState) || !source) return [];
    const whySimilar = MEMORY_DIMENSIONS.flatMap(([dimension, paths]) => {
      const currentValue = firstPath(current, paths), historicalValue = firstPath(candidate, paths);
      return currentValue && historicalValue && currentValue.toUpperCase() === historicalValue.toUpperCase() ? [{ dimension, value: currentValue }] : [];
    });
    if (!whySimilar.length) return [];
    const certified = rows(candidate.outcomes ?? candidate.certifiedOutcomes).map((item) => certifiedOutcome(item, asOf)).filter(Boolean);
    const comparableDimensionCount = MEMORY_DIMENSIONS.filter(([, paths]) => firstPath(current, paths) && firstPath(candidate, paths)).length;
    const outcomeStates = Object.fromEntries([...OUTCOME_STATES].map((outcomeState) => [outcomeState, certified.filter((item) => item.state === outcomeState).length]));
    return [{
      memoryId: text(candidate.id ?? candidate.incidentId) ?? strategicId('crisis-memory', { index, candidate }),
      label: text(candidate.label ?? candidate.name) ?? 'Historical incident', source, whySimilar,
      similarityBasisCount: whySimilar.length, comparableDimensionCount,
      similarityRatio: comparableDimensionCount ? Number((whySimilar.length / comparableDimensionCount).toFixed(4)) : null,
      whatTheyDid: rows(candidate.actions).map((item) => text(item?.summary ?? item?.action ?? item)).filter(Boolean),
      whatWorked: certified.filter((item) => state(item.state ?? item.outcome) === 'SUCCESS').map((item) => text(item.summary ?? item.lesson)).filter(Boolean),
      whatFailed: certified.filter((item) => ['FAILED', 'PARTIAL'].includes(state(item.state ?? item.outcome))).map((item) => text(item.summary ?? item.lesson)).filter(Boolean),
      whatToWatch: rows(candidate.watchConditions ?? candidate.lessons).map((item) => text(item?.summary ?? item?.condition ?? item)).filter(Boolean),
      outcomeSummary: { certifiedOutcomeCount: certified.length, states: outcomeStates, latestObservedAt: certified.map((item) => item.observedAt).sort().at(-1) ?? null, evidenceReferences: certified.map((item) => item.source.reference).sort(), qualification: certified.length ? 'Only attributable outcomes observed by the projection clock are summarized.' : 'No attributable outcome was available at the projection clock.' },
      causalTransferClaimed: false,
    }];
  }).sort((left, right) => right.similarityBasisCount - left.similarityBasisCount || left.memoryId.localeCompare(right.memoryId));
  return matches.length ? {
    schemaVersion: 'vigia.global-crisis-memory.v1', state: 'COMPARABLE_RECORDS_AVAILABLE', generatedAt: asOf, matches,
    counts: { supplied: supplied.length, comparable: matches.length, excludedOrNotComparable: supplied.length - matches.length, certifiedOutcomes: matches.reduce((sum, item) => sum + item.outcomeSummary.certifiedOutcomeCount, 0) },
    truthBoundary: 'Similarity is an explainable categorical comparison over supplied historical records. Historical action/outcome association is not causal transfer to the current incident.',
  } : {
    ...unavailable('vigia.global-crisis-memory.v1', 'No attributable historical record shares an explicit comparison dimension with this incident.', 'Admit an attributable historical or certified-replay record with comparable terrain, weather, thermal, community, road, resource, or decision attributes.'),
    counts: { supplied: supplied.length, comparable: 0, excludedOrNotComparable: supplied.length, certifiedOutcomes: 0 },
    truthBoundary: 'No absent historical comparison is treated as causal evidence, transferred outcome truth, or a current recommendation.',
  };
}

export function projectNearMisses(values, asOf) {
  const supplied = rows(values), visible = supplied.filter((value) => visibleAt(value, asOf, value.recordedAt ?? value.observedAt));
  const fingerprints = new Set();
  const items = visible.map((value, index) => {
    const source = truthSource(value), recordedAt = value.recordedAt ?? value.observedAt;
    const recordedIso = recordedAt && Number.isFinite(Date.parse(recordedAt)) ? new Date(recordedAt).toISOString() : null;
    const required = { whatAlmostHappened: text(value.whatAlmostHappened), whatPreventedEscalation: text(value.whatPreventedEscalation), uncertaintyThatMattered: text(value.uncertaintyThatMattered), actionThatMattered: text(value.actionThatMattered) };
    const evidenceReferences = [...new Set(rows(value.evidenceReferences).map(text).filter(Boolean))].sort();
    const preventionEvidenceReferences = [...new Set(rows(value.preventionEvidenceReferences).map(text).filter(Boolean))].sort();
    const actionReceiptId = text(value.actionReceiptId ?? value.actionReceipt?.receiptId), outcomeId = text(value.outcomeId ?? value.outcome?.outcomeId ?? value.outcome?.id);
    const complete = source && recordedIso && Object.values(required).every(Boolean), substantiatedChain = Boolean(complete && evidenceReferences.length && preventionEvidenceReferences.length && actionReceiptId && outcomeId);
    const fingerprint = semanticHash('near-miss-learning-record', { source, recordedAt: recordedIso, ...required, evidenceReferences, preventionEvidenceReferences, actionReceiptId, outcomeId });
    const duplicate = fingerprints.has(fingerprint); fingerprints.add(fingerprint);
    const universe = state(value.universe ?? value.mode), certifiedProduction = substantiatedChain && universe === 'LIVE_PRODUCTION' && state(value.certification?.state ?? value.certificationState) === 'CERTIFIED';
    return { nearMissId: text(value.id ?? value.nearMissId) ?? strategicId('near-miss', { index, value }), state: duplicate ? 'DUPLICATE_RECORD' : complete ? 'RECORDED_NEAR_MISS' : 'INCOMPLETE_RECORD', recordedAt: recordedIso, source, ...required, evidenceReferences, preventionEvidenceReferences, actionReceiptId, outcomeId, evidenceState: substantiatedChain ? 'ATTRIBUTABLE_ACTION_OUTCOME_CHAIN' : 'NARRATIVE_REVIEW_REQUIRED', universe, productionTruth: certifiedProduction, learningFingerprint: fingerprint, reason: duplicate ? 'An equivalent attributable learning record already exists in this projection.' : complete ? substantiatedChain ? null : 'The narrative is complete, but production learning requires escalation evidence, prevention evidence, an action receipt, and an outcome.' : 'A near miss requires attributable provenance, a valid record time, and all four learning fields.' };
  });
  return {
    schemaVersion: 'vigia.near-miss-intelligence.v1', state: items.length ? 'RECORDS_AVAILABLE' : 'NO_RECORDS', generatedAt: asOf, items,
    counts: { supplied: supplied.length, excludedFuture: supplied.length - visible.length, recorded: items.filter((item) => item.state === 'RECORDED_NEAR_MISS').length, certifiedProduction: items.filter((item) => item.productionTruth).length, incomplete: items.filter((item) => item.state === 'INCOMPLETE_RECORD').length, duplicates: items.filter((item) => item.state === 'DUPLICATE_RECORD').length },
    reason: items.length ? null : 'No attributable near-miss record is visible at the projection clock.',
    unlockCondition: items.length ? null : 'Admit an attributable near-miss record with what almost happened, what prevented escalation, the uncertainty, and the action that mattered.',
    owner: 'VIGIA_LEARNING_REVIEW', source: 'CANONICAL_INCIDENT_LEARNING_RECORDS',
    truthBoundary: 'A near miss is retained only as the supplied attributable record. Exercise/replay near misses never enter production counts.',
  };
}
