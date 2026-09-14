import { immutable, isoTime, requiredText, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';
import { HYPOTHESIS_STATES, WILDFIRE_HYPOTHESIS_TYPES } from './constants.mjs';

const token = (value, code) => { const text = requiredText(value, code); if (!/^[A-Z][A-Z0-9_:-]{0,127}$/.test(text)) throw new Error(code); return text; };
const boundedTokens = (values, code, limit = 64) => { if (!Array.isArray(values) || values.length > limit) throw new Error(`${code}_bounds`); return uniqueSorted(values.map((value) => token(value, code))); };

export function createHypothesisDefinition(input = {}) {
  const core = {
    schemaVersion: 'vigia.hypothesis-definition.v1', id: token(input.id, 'hypothesis_id_invalid'),
    type: token(input.type, 'hypothesis_type_invalid'), hazardDomain: token(input.hazardDomain ?? 'GENERAL', 'hypothesis_domain_invalid'),
    applicabilityFacts: boundedTokens(input.applicabilityFacts ?? [], 'hypothesis_applicability_invalid'),
    requiredEvidenceAll: boundedTokens(input.requiredEvidenceAll ?? [], 'hypothesis_required_all_invalid'),
    requiredEvidenceAny: boundedTokens(input.requiredEvidenceAny ?? [], 'hypothesis_required_any_invalid'),
    supportingEvidenceKinds: boundedTokens(input.supportingEvidenceKinds ?? [], 'hypothesis_support_invalid'),
    contradictingEvidenceKinds: boundedTokens(input.contradictingEvidenceKinds ?? [], 'hypothesis_contradiction_invalid'),
    excludingEvidenceKinds: boundedTokens(input.excludingEvidenceKinds ?? [], 'hypothesis_exclusion_invalid'),
    discriminatorRequirements: boundedTokens(input.discriminatorRequirements ?? [], 'hypothesis_discriminator_invalid'),
    eligibleSourceClasses: boundedTokens(input.eligibleSourceClasses ?? [], 'hypothesis_source_class_invalid'),
    policyConsequences: boundedTokens(input.policyConsequences ?? [], 'hypothesis_policy_consequence_invalid'),
    version: requiredText(input.version ?? '1.0.0', 'hypothesis_version_required'),
  };
  return immutable({ ...core, fingerprint: semanticHash('hypothesis-definition', core) });
}

export function createWildfireHypothesisDefinitions() {
  const define = (type, input) => createHypothesisDefinition({ id: `WILDFIRE:${type}`, type, hazardDomain: 'WILDFIRE', ...input });
  return immutable([
    define('ACTIVE_WILDFIRE', { requiredEvidenceAny: ['PHYSICAL_THERMAL_OBSERVATION', 'OFFICIAL_WILDFIRE_INCIDENT'], supportingEvidenceKinds: ['PHYSICAL_THERMAL_OBSERVATION', 'OFFICIAL_WILDFIRE_INCIDENT', 'PERIMETER_PROGRESSION'], contradictingEvidenceKinds: ['OFFICIAL_NON_WILDFIRE_CLASSIFICATION'], discriminatorRequirements: ['OFFICIAL_INCIDENT_CLASSIFICATION', 'INDEPENDENT_PHYSICAL_FAMILY'], eligibleSourceClasses: ['OFFICIAL', 'PHYSICAL'], policyConsequences: ['EVALUATE_WILDFIRE_RESPONSE'] }),
    define('PRESCRIBED_OR_MANAGED_FIRE', { requiredEvidenceAny: ['PRESCRIBED_FIRE_RECORD'], supportingEvidenceKinds: ['PRESCRIBED_FIRE_RECORD', 'PHYSICAL_THERMAL_OBSERVATION'], excludingEvidenceKinds: ['OFFICIAL_WILDFIRE_INCIDENT'], discriminatorRequirements: ['OFFICIAL_BURN_AUTHORIZATION'], eligibleSourceClasses: ['OFFICIAL'], policyConsequences: ['SUPPRESS_NO_FIRE_LABEL'] }),
    define('AGRICULTURAL_BURN', { requiredEvidenceAny: ['AGRICULTURAL_BURN_RECORD'], supportingEvidenceKinds: ['AGRICULTURAL_BURN_RECORD', 'PHYSICAL_THERMAL_OBSERVATION'], excludingEvidenceKinds: ['OFFICIAL_WILDFIRE_INCIDENT'], discriminatorRequirements: ['AGRICULTURAL_BURN_AUTHORIZATION'], eligibleSourceClasses: ['OFFICIAL', 'CONTEXT'], policyConsequences: ['SUPPRESS_NO_FIRE_LABEL'] }),
    define('INDUSTRIAL_THERMAL_SOURCE', { requiredEvidenceAny: ['PERSISTENT_INDUSTRIAL_CONTEXT'], supportingEvidenceKinds: ['PERSISTENT_INDUSTRIAL_CONTEXT', 'RECURRING_THERMAL_HISTORY'], excludingEvidenceKinds: ['OFFICIAL_WILDFIRE_INCIDENT', 'MOVING_PERIMETER_PROGRESSION'], discriminatorRequirements: ['NAMED_INDUSTRIAL_FACILITY', 'PERSISTENT_ANOMALY_HISTORY'], eligibleSourceClasses: ['CONTEXT', 'PHYSICAL'], policyConsequences: ['REQUIRE_HARD_NEGATIVE_REVIEW'] }),
    define('GAS_FLARE', { requiredEvidenceAny: ['GAS_FLARE_CONTEXT'], supportingEvidenceKinds: ['GAS_FLARE_CONTEXT', 'RECURRING_THERMAL_HISTORY'], contradictingEvidenceKinds: ['OFFICIAL_WILDFIRE_INCIDENT'], discriminatorRequirements: ['AUTHORITATIVE_FLARE_INVENTORY'], eligibleSourceClasses: ['CONTEXT'], policyConsequences: ['REQUIRE_HARD_NEGATIVE_REVIEW'] }),
    define('VOLCANIC_THERMAL_ACTIVITY', { requiredEvidenceAny: ['VOLCANIC_CONTEXT'], supportingEvidenceKinds: ['VOLCANIC_CONTEXT', 'PHYSICAL_THERMAL_OBSERVATION'], contradictingEvidenceKinds: ['OFFICIAL_WILDFIRE_INCIDENT'], discriminatorRequirements: ['VOLCANO_OBSERVATORY_STATUS'], eligibleSourceClasses: ['OFFICIAL', 'CONTEXT'], policyConsequences: ['ROUTE_VOLCANO_WORKFLOW'] }),
    define('SENSOR_OR_ALGORITHM_ARTEFACT', { requiredEvidenceAny: ['QUALITY_ARTEFACT_FLAG'], supportingEvidenceKinds: ['QUALITY_ARTEFACT_FLAG', 'VIEW_GEOMETRY_ARTEFACT'], excludingEvidenceKinds: ['INDEPENDENT_PHYSICAL_CORROBORATION', 'OFFICIAL_WILDFIRE_INCIDENT'], discriminatorRequirements: ['INDEPENDENT_PHYSICAL_FAMILY'], eligibleSourceClasses: ['PHYSICAL'], policyConsequences: ['QUARANTINE_OBSERVATION'] }),
    define('DUPLICATE_OR_REPUBLISHED_OBSERVATION', { requiredEvidenceAny: ['CAUSAL_DUPLICATE'], supportingEvidenceKinds: ['CAUSAL_DUPLICATE', 'REPUBLISHER_LINEAGE'], contradictingEvidenceKinds: ['INDEPENDENT_PHYSICAL_CORROBORATION'], discriminatorRequirements: ['ROOT_MEASUREMENT_IDENTITY'], eligibleSourceClasses: ['LINEAGE'], policyConsequences: ['REMOVE_DUPLICATE_WITNESS'] }),
    define('REPORT_WITHOUT_PHYSICAL_SUPPORT', { requiredEvidenceAll: ['PUBLIC_OR_OFFICIAL_REPORT'], supportingEvidenceKinds: ['PUBLIC_OR_OFFICIAL_REPORT'], excludingEvidenceKinds: ['PHYSICAL_THERMAL_OBSERVATION', 'INDEPENDENT_PHYSICAL_CORROBORATION'], discriminatorRequirements: ['PHYSICAL_OBSERVATION_OPPORTUNITY'], eligibleSourceClasses: ['REPORT', 'PHYSICAL'], policyConsequences: ['OPEN_PHYSICAL_EVIDENCE_WORK'] }),
    define('UNKNOWN_THERMAL_EVENT', { supportingEvidenceKinds: ['PHYSICAL_THERMAL_OBSERVATION', 'PUBLIC_OR_OFFICIAL_REPORT'], excludingEvidenceKinds: ['OFFICIAL_WILDFIRE_INCIDENT'], discriminatorRequirements: ['OFFICIAL_INCIDENT_CLASSIFICATION', 'PERSISTENT_ANOMALY_HISTORY', 'INDEPENDENT_PHYSICAL_FAMILY'], eligibleSourceClasses: ['OFFICIAL', 'PHYSICAL', 'CONTEXT'], policyConsequences: ['RETAIN_UNRESOLVED'] }),
  ]);
}

function usableFact(fact, cutoff) { return fact?.id && fact?.kind && Number.isFinite(Date.parse(fact.availableToVigiaAt)) && Date.parse(fact.availableToVigiaAt) <= Date.parse(cutoff) && fact.qualityState !== 'REJECTED' && fact.rightsState !== 'BLOCKED'; }
const byKinds = (facts, kinds) => facts.filter((fact) => kinds.includes(fact.kind));
export function evaluateHypotheses({ incidentId, hypotheses = [], evidenceFacts = [], knowledgeTime } = {}) {
  const cutoff = isoTime(knowledgeTime, 'hypothesis_knowledge_time_required'), eligibleById = new Map();
  for (const fact of evidenceFacts.filter((item) => usableFact(item, cutoff))) { const prior = eligibleById.get(fact.id); if (prior && semanticHash('hypothesis-evidence', prior) !== semanticHash('hypothesis-evidence', fact)) throw new Error('hypothesis_evidence_identity_conflict'); eligibleById.set(fact.id, fact); }
  const eligible = [...eligibleById.values()].sort((a, b) => a.id.localeCompare(b.id)), excluded = evidenceFacts.filter((fact) => !usableFact(fact, cutoff)).map((fact) => ({ evidenceId: fact?.id ?? null, reason: !Number.isFinite(Date.parse(fact?.availableToVigiaAt)) ? 'KNOWLEDGE_TIME_MISSING' : Date.parse(fact.availableToVigiaAt) > Date.parse(cutoff) ? 'FUTURE_AT_CUTOFF' : fact.rightsState === 'BLOCKED' ? 'RIGHTS_BLOCKED' : 'QUALITY_REJECTED' }));
  const kinds = new Set(eligible.map((fact) => fact.kind));
  const results = hypotheses.map((definition) => {
    const applicable = definition.applicabilityFacts.length === 0 || definition.applicabilityFacts.every((kind) => kinds.has(kind));
    const support = byKinds(eligible, definition.supportingEvidenceKinds), contradiction = byKinds(eligible, definition.contradictingEvidenceKinds), exclusion = byKinds(eligible, definition.excludingEvidenceKinds);
    const allSatisfied = definition.requiredEvidenceAll.every((kind) => kinds.has(kind)), anySatisfied = definition.requiredEvidenceAny.length === 0 || definition.requiredEvidenceAny.some((kind) => kinds.has(kind)), requirementsSatisfied = allSatisfied && anySatisfied;
    const unresolved = uniqueSorted(definition.discriminatorRequirements.filter((kind) => !kinds.has(kind)));
    const independentFamilies = new Set(support.map((fact) => fact.causalFamilyId).filter(Boolean)).size;
    let state = 'UNRESOLVED';
    if (!applicable) state = 'UNSUPPORTED'; else if (exclusion.length) state = 'EXCLUDED'; else if (contradiction.length && !requirementsSatisfied) state = 'CONTRADICTED'; else if (requirementsSatisfied && support.length && (independentFamilies >= 2 || support.some((fact) => fact.sourceClass === 'OFFICIAL'))) state = 'STRONGLY_SUPPORTED'; else if (requirementsSatisfied && support.length) state = 'SUPPORTED'; else if (support.length || contradiction.length) state = 'PLAUSIBLE';
    if (!HYPOTHESIS_STATES.includes(state)) throw new Error('hypothesis_state_invalid');
    const core = { schemaVersion: 'vigia.hypothesis-result.v1', hypothesisId: definition.id, type: definition.type, definitionFingerprint: definition.fingerprint, applicable, state, supportingEvidenceIds: support.map((fact) => fact.id), contradictingEvidenceIds: contradiction.map((fact) => fact.id), excludingEvidenceIds: exclusion.map((fact) => fact.id), unresolvedDiscriminators: unresolved, dataOpportunities: unresolved.map((requirement) => ({ requirement, eligibleSourceClasses: definition.eligibleSourceClasses })), policyConsequences: definition.policyConsequences, independentSupportingFamilies: independentFamilies };
    return { ...core, fingerprint: semanticHash('hypothesis-result', core) };
  }).sort((a, b) => a.hypothesisId.localeCompare(b.hypothesisId));
  const core = { schemaVersion: 'vigia.multi-hypothesis-graph.v1', incidentId: requiredText(incidentId, 'hypothesis_incident_required'), knowledgeTime: cutoff, results, excludedEvidence: excluded.sort((a, b) => String(a.evidenceId).localeCompare(String(b.evidenceId))) };
  return immutable({ ...core, fingerprint: semanticHash('multi-hypothesis-graph', core) });
}

export function assertWildfireHypothesisCoverage(definitions = []) { const actual = uniqueSorted(definitions.map((item) => item.type)); const missing = WILDFIRE_HYPOTHESIS_TYPES.filter((type) => !actual.includes(type)); if (missing.length) throw new Error(`wildfire_hypotheses_missing:${missing.join(',')}`); return true; }

export function deriveDiscriminators(graph, definitions = []) {
  const material = graph.results.filter((result) => !['EXCLUDED', 'UNSUPPORTED'].includes(result.state)), byRequirement = new Map();
  for (const result of material) { const definition = definitions.find((item) => item.id === result.hypothesisId); for (const requirement of result.unresolvedDiscriminators) { const row = byRequirement.get(requirement) ?? { requirement, hypothesesSeparated: [], eligibleSourceClasses: [], currentAvailability: 'MISSING' }; row.hypothesesSeparated.push(result.hypothesisId); row.eligibleSourceClasses.push(...(definition?.eligibleSourceClasses ?? [])); byRequirement.set(requirement, row); } }
  return immutable([...byRequirement.values()].map((row) => ({ ...row, hypothesesSeparated: uniqueSorted(row.hypothesesSeparated), eligibleSourceClasses: uniqueSorted(row.eligibleSourceClasses), decisionConsequence: 'RECOMPILE_DEPENDENT_DECISIONS' })).sort((a, b) => a.requirement.localeCompare(b.requirement)));
}
