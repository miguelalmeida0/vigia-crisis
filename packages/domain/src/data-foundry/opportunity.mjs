import { immutable, semanticHash } from '../intelligence/shared.mjs';
import { OPPORTUNITY_OUTCOMES } from './constants.mjs';

export function createObservationOpportunity(input = {}) {
  let outcome = input.outcome ?? 'UNKNOWN';
  const proof = { covered: input.coverage === true, productAvailable: input.productAvailability === true, providerHealthy: input.providerHealth === true, qualitySufficient: input.quality === true, retrievalSucceeded: input.retrievalSuccess === true, officialSourcesChecked: input.officialSourcesChecked === true, physicalSourcesChecked: input.physicalSourcesChecked === true };
  const qualifies = Object.values(proof).every(Boolean);
  if (outcome === 'OBSERVED_NEGATIVE' && !qualifies) outcome = 'UNKNOWN';
  if (!OPPORTUNITY_OUTCOMES.includes(outcome)) throw new Error('observation_opportunity_outcome_invalid');
  const core = { schemaVersion: 'vigia.observation-opportunity.v1', id: input.id, sourceId: input.sourceId, window: structuredClone(input.window), geometry: structuredClone(input.geometry), outcome, proof, noObservationReason: input.noObservationReason ?? null, originalObservationIds: [...new Set(input.originalObservationIds ?? [])].sort(), createdAt: new Date(input.createdAt ?? Date.now()).toISOString() };
  return immutable({ ...core, validNegative: outcome === 'OBSERVED_NEGATIVE' && qualifies, fingerprint: semanticHash('observation-opportunity', core) });
}

export function createHardNegative(input = {}) {
  const labels = ['NO_FIRE', 'REAL_FIRE_NOT_WILDFIRE', 'AMBIGUOUS_THERMAL_EVENT', 'NO_VALID_OBSERVATION'];
  if (!labels.includes(input.label)) throw new Error('hard_negative_label_invalid');
  const core = { schemaVersion: 'vigia.hard-negative.v1', id: input.id, category: input.category, label: input.label, geometry: structuredClone(input.geometry), effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo ?? null, sourceFamily: input.sourceFamily, observationHistory: [...new Set(input.observationHistory ?? [])].sort(), labelEvidence: [...new Set(input.labelEvidence ?? [])].sort(), reviewState: input.reviewState ?? 'UNREVIEWED', knownUncertainty: input.knownUncertainty ?? null };
  return immutable({ ...core, fingerprint: semanticHash('hard-negative', core) });
}
