import { immutable, requiredText, semanticHash } from '../intelligence/shared.mjs';
import { REGION_STATES } from './constants.mjs';

const dimensions = Object.freeze(['authoritativeIncidentIdentity', 'progressionSequence', 'issueTimeWeather', 'fuelTerrainContext', 'futureLabels', 'knowledgeTimeSemantics', 'rights', 'physicalObservations', 'negativeOpportunities']);
export function adjudicateRegion(input = {}) {
  const values = Object.fromEntries(dimensions.map((key) => [key, input[key] ?? 'MISSING'])), failures = dimensions.filter((key) => !['READY', 'AVAILABLE', 'ADEQUATE'].includes(values[key])); let state = 'QUALIFIED';
  if (values.rights === 'BLOCKED') state = 'RIGHTS_BLOCKED'; else if (values.progressionSequence === 'FINAL_ONLY' || values.futureLabels === 'FINAL_ONLY') state = 'FINAL_ONLY'; else if (values.knowledgeTimeSemantics === 'INSUFFICIENT_TIMESTAMPS') state = 'INSUFFICIENT_TIMESTAMPS'; else if (input.partnerRequired === true) state = 'PARTNER_REQUIRED'; else if (failures.length && failures.length <= 3) state = 'CONDITIONALLY_QUALIFIED'; else if (failures.length) state = 'UNUSABLE';
  if (!REGION_STATES.includes(state)) throw new Error('region_adjudication_state_invalid');
  const core = { schemaVersion: 'vigia.region-feasibility.v1', regionId: requiredText(input.regionId, 'region_id_required'), state, dimensions: values, expectedIncidentCount: Number(input.expectedIncidentCount ?? 0), engineeringCost: input.engineeringCost ?? 'UNKNOWN', externalDependency: input.externalDependency ?? null, failures, evidenceReferences: [...new Set(input.evidenceReferences ?? [])].sort() };
  return immutable({ ...core, fingerprint: semanticHash('region-feasibility', core) });
}

export function selectSecondRegion(rows = []) {
  const rank = { QUALIFIED: 6, CONDITIONALLY_QUALIFIED: 5, PARTNER_REQUIRED: 4, FINAL_ONLY: 3, INSUFFICIENT_TIMESTAMPS: 2, RIGHTS_BLOCKED: 1, UNUSABLE: 0 }, cost = { LOW: 3, MEDIUM: 2, HIGH: 1, UNKNOWN: 0 };
  const ordered = [...rows].sort((a, b) => rank[b.state] - rank[a.state] || b.expectedIncidentCount - a.expectedIncidentCount || (cost[b.engineeringCost] ?? 0) - (cost[a.engineeringCost] ?? 0) || a.regionId.localeCompare(b.regionId));
  const core = { schemaVersion: 'vigia.second-region-selection.v1', selectedRegionId: ordered[0]?.regionId ?? null, candidates: ordered, doctrine: ['progression availability', 'weather availability', 'fuel/terrain availability', 'rights', 'knowledge-time quality', 'expected incident count', 'negative-control potential', 'engineering cost', 'external dependency'] };
  return immutable({ ...core, fingerprint: semanticHash('second-region-selection', core) });
}
