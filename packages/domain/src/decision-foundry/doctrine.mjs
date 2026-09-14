import { immutable, requiredText, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';
import { createDecisionDefinition, evaluateDecisionDependencies } from './decisions.mjs';

export const WILDFIRE_POLICY_REFERENCES = Object.freeze([
  'MISSING_INDEPENDENT_CORROBORATION', 'INTERNAL_IMPACT_GUARD', 'FORECAST_INPUT_COMPLETENESS',
  'CONSEQUENTIAL_WARNING_GUARD', 'SOURCE_FRESHNESS', 'CONTRADICTION_REVIEW', 'ASSET_MONITORING',
  'INCIDENT_ASSOCIATION', 'HANDOFF_READINESS', 'SOURCE_FAILOVER', 'SOURCE_INTEGRITY',
  'REVOCATION_RECALCULATION', 'DATA_QUALITY_ESCALATION', 'FORECAST_ABSTENTION',
  'ACQUISITION_LIFECYCLE', 'AUDIT_MATERIALIZATION',
]);

export const WILDFIRE_CAPABILITIES = Object.freeze(['PROPOSE_OFFICIAL_WARNING']);

const policy = (id) => ({ id, version: '1.0.0' });
const doctrine = (id, policyId, input = {}) => ({ id, version: '1.0.0', policyReference: policy(policyId), consequenceClass: 'OPERATIONAL', deadlineSemantics: { type: 'INCIDENT_RELATIVE' }, ...input });

export function wildfireDecisionDoctrineLibrary() {
  return immutable({
    schemaVersion: 'vigia.decision-doctrine-library.v1', id: 'VIGIA_WILDFIRE_OPERATIONS', version: '2.0.0',
    policies: WILDFIRE_POLICY_REFERENCES, capabilities: WILDFIRE_CAPABILITIES,
    decisions: [
      doctrine('OPEN_INDEPENDENT_PHYSICAL_EVIDENCE_WORK', 'MISSING_INDEPENDENT_CORROBORATION', { requiredFacts: ['INCIDENT_EXISTS'], requiredEvidenceStates: [{ hypothesisId: 'WILDFIRE:ACTIVE_WILDFIRE', states: ['PLAUSIBLE', 'SUPPORTED', 'STRONGLY_SUPPORTED'] }], actionsUnlocked: ['ACQUIRE_INDEPENDENT_PHYSICAL_EVIDENCE'], consequenceClass: 'CRITICAL' }),
      doctrine('RUN_INTERNAL_ASSET_IMPACT_ASSESSMENT', 'INTERNAL_IMPACT_GUARD', { requiredFacts: ['INCIDENT_EXISTS', 'PERIMETER_AVAILABLE'], requiredEvidenceStates: [{ hypothesisId: 'WILDFIRE:ACTIVE_WILDFIRE', states: ['SUPPORTED', 'STRONGLY_SUPPORTED'] }], requiredDataProducts: ['TERRAIN_PACK', 'FUEL_PACK'], actionsUnlocked: ['COMPUTE_INTERNAL_IMPACT_CONTEXT'], consequenceClass: 'CRITICAL' }),
      doctrine('MATERIALIZE_FORECAST_EVALUATION_PACKAGE_1H', 'FORECAST_INPUT_COMPLETENESS', { requiredFacts: ['INCIDENT_EXISTS'], requiredDataProducts: ['PROGRESSION_SEQUENCE', 'DECODED_WEATHER', 'FUEL_PACK', 'TERRAIN_PACK', 'FUTURE_LABEL_1H'], actionsUnlocked: ['BUILD_FORECAST_INPUT_PACKAGE_1H'], consequenceClass: 'SCIENTIFIC' }),
      doctrine('MATERIALIZE_FORECAST_EVALUATION_PACKAGE_3H', 'FORECAST_INPUT_COMPLETENESS', { requiredFacts: ['INCIDENT_EXISTS'], requiredDataProducts: ['PROGRESSION_SEQUENCE', 'DECODED_WEATHER', 'FUEL_PACK', 'TERRAIN_PACK', 'FUTURE_LABEL_3H'], actionsUnlocked: ['BUILD_FORECAST_INPUT_PACKAGE_3H'], consequenceClass: 'SCIENTIFIC' }),
      doctrine('REFRESH_STALE_SOURCE', 'SOURCE_FRESHNESS', { requiredFacts: ['INCIDENT_EXISTS', 'SOURCE_STALE'], actionsUnlocked: ['REFRESH_STALE_SOURCE'] }),
      doctrine('OPEN_CONTRADICTION_REVIEW', 'CONTRADICTION_REVIEW', { requiredFacts: ['INCIDENT_EXISTS', 'CONTRADICTION_PRESENT'], actionsUnlocked: ['OPEN_CONTRADICTION_REVIEW'], consequenceClass: 'CRITICAL' }),
      doctrine('MONITOR_CRITICAL_ASSET', 'ASSET_MONITORING', { requiredFacts: ['INCIDENT_EXISTS', 'CRITICAL_ASSET_EXPOSED'], requiredDataProducts: ['OFFICIAL_OR_ACCEPTABLE_PERIMETER'], actionsUnlocked: ['MONITOR_CRITICAL_ASSET'], consequenceClass: 'CRITICAL' }),
      doctrine('REASSESS_INCIDENT_ASSOCIATION', 'INCIDENT_ASSOCIATION', { requiredFacts: ['INCIDENT_EXISTS', 'ASSOCIATION_AMBIGUOUS'], actionsUnlocked: ['REASSESS_INCIDENT_ASSOCIATION'] }),
      doctrine('PREPARE_HANDOFF', 'HANDOFF_READINESS', { requiredFacts: ['INCIDENT_EXISTS'], requiredDataProducts: ['OFFICIAL_OR_ACCEPTABLE_PERIMETER'], actionsUnlocked: ['PREPARE_HANDOFF'] }),
      doctrine('PREPARE_SOURCE_FAILOVER', 'SOURCE_FAILOVER', { requiredFacts: ['INCIDENT_EXISTS', 'SOURCE_DEGRADED'], actionsUnlocked: ['PREPARE_SOURCE_FAILOVER'], consequenceClass: 'CRITICAL' }),
      doctrine('QUARANTINE_COMPROMISED_SOURCE', 'SOURCE_INTEGRITY', { requiredFacts: ['INCIDENT_EXISTS', 'SOURCE_COMPROMISED'], actionsUnlocked: ['QUARANTINE_COMPROMISED_SOURCE'], consequenceClass: 'CRITICAL' }),
      doctrine('RECALCULATE_AFTER_REVOCATION', 'REVOCATION_RECALCULATION', { requiredFacts: ['INCIDENT_EXISTS', 'CREDENTIAL_REVOKED'], actionsUnlocked: ['RECALCULATE_AFTER_REVOCATION'], consequenceClass: 'CRITICAL' }),
      doctrine('ESCALATE_DATA_QUALITY_FAILURE', 'DATA_QUALITY_ESCALATION', { requiredFacts: ['INCIDENT_EXISTS', 'MATERIAL_DATA_QUALITY_FAILURE'], actionsUnlocked: ['ESCALATE_DATA_QUALITY_FAILURE'], consequenceClass: 'CRITICAL' }),
      doctrine('ABSTAIN_FROM_FORECAST', 'FORECAST_ABSTENTION', { requiredFacts: ['INCIDENT_EXISTS', 'FORECAST_INPUTS_UNSAFE'], actionsUnlocked: ['ABSTAIN_FROM_FORECAST'], consequenceClass: 'CRITICAL' }),
      doctrine('REQUEST_FORECAST_INPUT', 'FORECAST_INPUT_COMPLETENESS', { requiredFacts: ['INCIDENT_EXISTS'], actionsUnlocked: ['REQUEST_FORECAST_INPUT'], consequenceClass: 'SCIENTIFIC' }),
      doctrine('CANCEL_OBSOLETE_ACQUISITION', 'ACQUISITION_LIFECYCLE', { requiredFacts: ['INCIDENT_EXISTS', 'ACQUISITION_OBSOLETE'], actionsUnlocked: ['CANCEL_OBSOLETE_ACQUISITION'] }),
      doctrine('MATERIALIZE_AUDIT_PACKET', 'AUDIT_MATERIALIZATION', { requiredFacts: ['INCIDENT_EXISTS'], actionsUnlocked: ['MATERIALIZE_AUDIT_PACKET'] }),
      doctrine('PROPOSE_OFFICIAL_WARNING', 'CONSEQUENTIAL_WARNING_GUARD', { requiredFacts: ['INCIDENT_EXISTS', 'INDEPENDENT_PHYSICAL_CORROBORATION', 'IMPACT_THRESHOLD_SATISFIED'], requiredEvidenceStates: [{ hypothesisId: 'WILDFIRE:ACTIVE_WILDFIRE', states: ['STRONGLY_SUPPORTED'] }], requiredDataProducts: ['OFFICIAL_OR_ACCEPTABLE_PERIMETER'], requiredDecisions: ['RUN_INTERNAL_ASSET_IMPACT_ASSESSMENT'], authorityRequirement: { capability: 'PROPOSE_OFFICIAL_WARNING' }, actionsUnlocked: ['PROPOSE_OFFICIAL_WARNING'], consequential: true, consequenceClass: 'LIFE_SAFETY' }),
    ],
  });
}

function topological(definitions) {
  const byId = new Map(definitions.map((item) => [item.id, item])), visiting = new Set(), complete = new Set(), ordered = [];
  const visit = (id) => {
    if (visiting.has(id)) throw new Error(`decision_doctrine_cycle:${id}`);
    if (complete.has(id)) return;
    const item = byId.get(id); if (!item) throw new Error(`decision_doctrine_dependency_unknown:${id}`);
    visiting.add(id); for (const dependency of item.requiredDecisions ?? []) visit(dependency);
    visiting.delete(id); complete.add(id); ordered.push(item);
  };
  for (const id of [...byId.keys()].sort()) visit(id);
  return ordered;
}

export function compileDecisionDoctrine(library = wildfireDecisionDoctrineLibrary()) {
  requiredText(library.id, 'decision_doctrine_id_required'); requiredText(library.version, 'decision_doctrine_version_required');
  const policies = new Set(library.policies ?? []), capabilities = new Set(library.capabilities ?? []), ids = new Set();
  const definitions = (library.decisions ?? []).map((entry) => {
    if (ids.has(entry.id)) throw new Error(`decision_doctrine_duplicate:${entry.id}`); ids.add(entry.id);
    if (!policies.has(entry.policyReference?.id)) throw new Error(`decision_doctrine_policy_unknown:${entry.id}`);
    if (entry.authorityRequirement && !capabilities.has(entry.authorityRequirement.capability)) throw new Error(`decision_doctrine_capability_unknown:${entry.id}`);
    if (entry.consequential && !entry.authorityRequirement) throw new Error(`decision_doctrine_unsafe_escalation:${entry.id}`);
    return createDecisionDefinition(entry);
  });
  const ordered = topological(definitions), core = { schemaVersion: 'vigia.compiled-decision-doctrine.v1', libraryId: library.id, libraryVersion: library.version, definitions: ordered };
  return immutable({ ...core, fingerprint: semanticHash('compiled-decision-doctrine', core) });
}

export function decisionDoctrineCoverage({ doctrine = compileDecisionDoctrine(), operationalStates = [] } = {}) {
  const states = operationalStates.map((state) => {
    const graph = evaluateDecisionDependencies({ definitions: doctrine.definitions, ...state.context });
    const applicable = graph.results.filter((item) => item.state !== 'NOT_APPLICABLE');
    return { stateId: state.id, applicableDecisions: applicable.length, readyDecisions: applicable.filter((item) => item.state === 'READY').map((item) => item.decisionId), blockedDecisions: applicable.filter((item) => item.state.startsWith('BLOCKED')).map((item) => item.decisionId), blockerCategories: uniqueSorted(applicable.flatMap((item) => item.blockers.map((blocker) => blocker.category))), unreachableDecisions: applicable.filter((item) => item.blockers.some((blocker) => blocker.code === 'DECISION_DEPENDENCY_UNSATISFIED')).map((item) => item.decisionId) };
  });
  const core = { schemaVersion: 'vigia.decision-doctrine-coverage.v1', doctrineFingerprint: doctrine.fingerprint, supportedOperationalStates: states.length, states, uncoveredOperationalStates: states.filter((item) => item.applicableDecisions === 0).map((item) => item.stateId) };
  return immutable({ ...core, fingerprint: semanticHash('decision-doctrine-coverage', core) });
}
