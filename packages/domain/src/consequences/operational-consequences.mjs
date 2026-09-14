import {extractCanonicalInputs} from './canonical-inputs.mjs';
import {buildOperationalRelationships} from './operational-relationships.mjs';
import {deriveConsequences} from './consequence-derivation.mjs';
import {orderOperationalPriorities} from './priority-ordering.mjs';
import {explainOperationalConsequence} from './explanation.mjs';

// Public entry point for the operational consequence engine.
//
//   CANONICAL FACTS -> OPERATIONAL RELATIONSHIPS -> CONSEQUENCE DERIVATION
//   -> MISSION IMPACT -> PRIORITY ORDERING -> EXPLANATION -> OPERATOR PROJECTION
//
// Deterministic throughout: the same canonical records produce the same
// consequences, in the same order, with the same identifiers. Nothing here
// contacts a source, calls a model, or writes. It derives, and every derivation
// is reconstructable from the persisted records named in its provenance.

export {extractCanonicalInputs} from './canonical-inputs.mjs';
export {buildOperationalRelationships} from './operational-relationships.mjs';
export {deriveConsequences} from './consequence-derivation.mjs';
export {orderOperationalPriorities, comparePriority, PRIORITY_TIERS, PRIORITY_FACTORS} from './priority-ordering.mjs';
export {explainOperationalConsequence, describeTrigger} from './explanation.mjs';
export {sharedRoadDependencies, describeSharedDependency, geometriesShareCorridor} from './shared-dependency.mjs';

/**
 * Derives every operational consequence for one incident from the canonical
 * records the product already holds, ordered most urgent first.
 *
 * `missions` must be the output of evaluateMission(); this engine reads mission
 * state, it never decides it.
 */
export function operationalConsequences({catalog = [], missions = [], reports = [], confirmations = [], restrictions = [], sourceValidUntil = null, at, incidentId, snapshotId = null, limit = 20}) {
  const startedAt = performance.now();
  const inputs = extractCanonicalInputs({catalog, missions, reports, confirmations, restrictions, sourceValidUntil, at});
  const relationships = buildOperationalRelationships(inputs);
  const derived = deriveConsequences(relationships, {incidentId, snapshotId, generatedAt: at});
  const ordered = orderOperationalPriorities(derived.filter((consequence) => consequence.state !== 'NO_OPERATIONAL_LINK'));

  const consequences = ordered.slice(0, limit).map((consequence) => ({...consequence, explanation: explainOperationalConsequence(consequence)}));

  return {
    schemaVersion: 'vigia.operational-consequences.v1',
    incidentId,
    snapshotId,
    knownAt: at,
    generatedAt: at,
    origin: 'DETERMINISTIC_DERIVATION',
    // No model produced any part of this result, and none can.
    modelUsed: false,
    total: ordered.length,
    returned: consequences.length,
    consequences,
    counts: {
      triggers: relationships.triggers.length,
      routesIndexed: inputs.routes.length,
      roadsIndexed: inputs.routesByRoad.size,
      missionsConsidered: inputs.missions.length
    },
    generationMs: Number((performance.now() - startedAt).toFixed(3))
  };
}
