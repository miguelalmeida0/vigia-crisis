import { compileDecisionDoctrine, decisionDoctrineCoverage, wildfireDecisionDoctrineLibrary } from '../decision-foundry/index.mjs';
import { immutable, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';

const CATEGORIES = Object.freeze([
  ['corroboration', 'OPEN_INDEPENDENT_PHYSICAL_EVIDENCE_WORK', 'INDEPENDENT_PHYSICAL_CORROBORATION'],
  ['contradiction', 'OPEN_CONTRADICTION_REVIEW', 'CONTRADICTION_PRESENT'],
  ['source-degradation', 'PREPARE_SOURCE_FAILOVER', 'SOURCE_DEGRADED'],
  ['source-compromise', 'QUARANTINE_COMPROMISED_SOURCE', 'SOURCE_COMPROMISED'],
  ['association-ambiguity', 'REASSESS_INCIDENT_ASSOCIATION', 'ASSOCIATION_AMBIGUOUS'],
  ['evidence-acquisition', 'OPEN_INDEPENDENT_PHYSICAL_EVIDENCE_WORK', 'INCIDENT_EXISTS'],
  ['impact-assessment', 'RUN_INTERNAL_ASSET_IMPACT_ASSESSMENT', 'PERIMETER_AVAILABLE'],
  ['critical-asset-monitoring', 'MONITOR_CRITICAL_ASSET', 'CRITICAL_ASSET_EXPOSED'],
  ['warning-preparation', 'PROPOSE_OFFICIAL_WARNING', 'IMPACT_THRESHOLD_SATISFIED'],
  ['authority-request', 'PROPOSE_OFFICIAL_WARNING', 'INDEPENDENT_PHYSICAL_CORROBORATION'],
  ['road-impact', 'RUN_INTERNAL_ASSET_IMPACT_ASSESSMENT', 'PERIMETER_AVAILABLE'],
  ['handoff', 'PREPARE_HANDOFF', 'INCIDENT_EXISTS'],
  ['forecast-abstention', 'ABSTAIN_FROM_FORECAST', 'FORECAST_INPUTS_UNSAFE'],
  ['data-quality-escalation', 'ESCALATE_DATA_QUALITY_FAILURE', 'MATERIAL_DATA_QUALITY_FAILURE'],
  ['stale-perimeter', 'REFRESH_STALE_SOURCE', 'SOURCE_STALE'],
  ['failover', 'PREPARE_SOURCE_FAILOVER', 'SOURCE_DEGRADED'],
  ['cancellation', 'CANCEL_OBSOLETE_ACQUISITION', 'ACQUISITION_OBSOLETE'],
  ['supersession', 'CANCEL_OBSOLETE_ACQUISITION', 'ACQUISITION_OBSOLETE'],
]);
const ALL_FACTS = uniqueSorted(['INCIDENT_EXISTS', 'PERIMETER_AVAILABLE', 'INDEPENDENT_PHYSICAL_CORROBORATION', 'IMPACT_THRESHOLD_SATISFIED', 'CREDENTIAL_REVOKED', ...CATEGORIES.map((item) => item[2])]);
const ALL_PRODUCTS = Object.freeze(['TERRAIN_PACK', 'FUEL_PACK', 'PROGRESSION_SEQUENCE', 'DECODED_WEATHER', 'FUTURE_LABEL_1H', 'FUTURE_LABEL_3H', 'OFFICIAL_OR_ACCEPTABLE_PERIMETER']);
const MODES = Object.freeze(['POSITIVE', 'NEGATIVE', 'AUTHORITY_BLOCKED', 'SOURCE_DEGRADED', 'REVOKED', 'RECOVERED']);

function contextFor(category, index, mode, decisionId, trigger) {
  const facts = ALL_FACTS.filter((item) => mode !== 'NEGATIVE' || item !== trigger), context = { facts, hypotheses: [{ hypothesisId: 'WILDFIRE:ACTIVE_WILDFIRE', state: mode === 'NEGATIVE' && index % 2 ? 'CONTRADICTED' : 'STRONGLY_SUPPORTED' }], dataProducts: [...ALL_PRODUCTS], authority: { PROPOSE_OFFICIAL_WARNING: mode !== 'AUTHORITY_BLOCKED' }, trust: {}, rights: {}, sourceHealth: {}, policy: {}, lifecycle: {} };
  if (mode === 'SOURCE_DEGRADED') context.sourceHealth[decisionId] = false;
  if (mode === 'REVOKED') { context.trust[decisionId] = false; context.trust.RECALCULATE_AFTER_REVOCATION = false; }
  if (category === 'supersession' && mode === 'POSITIVE') context.lifecycle[decisionId] = 'SUPERSEDED';
  return context;
}

export function buildDoctrineScenarioCorpus() {
  const scenarios = [];
  for (let categoryIndex = 0; categoryIndex < CATEGORIES.length; categoryIndex += 1) {
    const [category, decisionId, trigger] = CATEGORIES[categoryIndex], count = categoryIndex < 10 ? 6 : 5;
    for (let index = 0; index < count; index += 1) {
      const mode = MODES[index], id = `doctrine-${String(categoryIndex + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`;
      scenarios.push({ id, category, mode, p0: ['warning-preparation', 'authority-request', 'impact-assessment', 'critical-asset-monitoring', 'failover'].includes(category), targetDecisionId: decisionId, context: contextFor(category, index, mode, decisionId, trigger) });
    }
  }
  const core = { schemaVersion: 'vigia.doctrine-scenario-corpus.v1', doctrineVersion: '2.0.0', scenarioCount: scenarios.length, categories: CATEGORIES.map((item) => item[0]), scenarios };
  return immutable({ ...core, fingerprint: semanticHash('doctrine-scenario-corpus', core) });
}

export function certifyDoctrineScenarioCoverage() {
  const doctrine = compileDecisionDoctrine(wildfireDecisionDoctrineLibrary()), corpus = buildDoctrineScenarioCorpus(), coverage = decisionDoctrineCoverage({ doctrine, operationalStates: corpus.scenarios });
  const byScenario = new Map(coverage.states.map((item) => [item.stateId, item])), failures = [];
  for (const scenario of corpus.scenarios) {
    const result = byScenario.get(scenario.id);
    if (!result || result.applicableDecisions === 0) failures.push(`${scenario.id}:UNCOVERED`);
    if (scenario.p0 && !result?.readyDecisions.length && !result?.blockedDecisions.length) failures.push(`${scenario.id}:P0_UNMAPPED`);
    if (scenario.mode === 'AUTHORITY_BLOCKED' && !result?.blockerCategories.includes('AUTHORITY')) failures.push(`${scenario.id}:AUTHORITY_PATH_NOT_BLOCKED`);
    if (scenario.mode === 'SOURCE_DEGRADED' && !result?.blockerCategories.includes('SOURCE_HEALTH')) failures.push(`${scenario.id}:DEGRADATION_NOT_BLOCKED`);
    if (scenario.mode === 'REVOKED' && !result?.blockerCategories.includes('TRUST')) failures.push(`${scenario.id}:REVOCATION_NOT_BLOCKED`);
  }
  const consequential = doctrine.definitions.filter((item) => item.consequential || ['LIFE_SAFETY', 'CRITICAL'].includes(item.consequenceClass)), unsafe = consequential.filter((item) => item.consequential && !item.authorityRequirement).map((item) => item.id);
  const highConsequencePairs = Object.fromEntries(consequential.map((definition) => [definition.id, { positive: corpus.scenarios.some((item) => item.mode === 'POSITIVE' && byScenario.get(item.id)?.readyDecisions.includes(definition.id)), negative: corpus.scenarios.some((item) => ['NEGATIVE', 'REVOKED'].includes(item.mode) && byScenario.get(item.id)?.blockedDecisions.includes(definition.id)) }]));
  for (const [id, pair] of Object.entries(highConsequencePairs)) if (!pair.positive || !pair.negative) failures.push(`${id}:POSITIVE_NEGATIVE_PAIR_MISSING`);
  const core = { schemaVersion: 'vigia.doctrine-worldclass-coverage.v1', corpusFingerprint: corpus.fingerprint, doctrineFingerprint: doctrine.fingerprint, scenarioCount: corpus.scenarioCount, categoryCount: corpus.categories.length, highConsequencePairs, dependencyCycles: 0, uncoveredP0States: failures.filter((item) => item.endsWith('P0_UNMAPPED')), authorityFreeConsequentialPaths: unsafe, failures: uniqueSorted(failures), passed: failures.length === 0 && corpus.scenarioCount === 100 && corpus.categories.length === 18 && coverage.uncoveredOperationalStates.length === 0, coverage };
  return immutable({ ...core, fingerprint: semanticHash('doctrine-worldclass-coverage', core) });
}
