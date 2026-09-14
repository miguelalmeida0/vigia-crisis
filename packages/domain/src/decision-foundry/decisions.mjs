import { immutable, requiredText, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';
import { DECISION_STATES } from './constants.mjs';

export function createDecisionDefinition(input = {}) {
  const core = { schemaVersion: 'vigia.decision-definition.v2', id: requiredText(input.id, 'decision_id_required'), policyReference: structuredClone(input.policyReference ?? null), requiredFacts: uniqueSorted(input.requiredFacts), requiredEvidenceStates: structuredClone(input.requiredEvidenceStates ?? []), requiredDataProducts: uniqueSorted(input.requiredDataProducts), requiredDecisions: uniqueSorted(input.requiredDecisions), authorityRequirement: structuredClone(input.authorityRequirement ?? null), actionsUnlocked: uniqueSorted(input.actionsUnlocked), consequential: input.consequential === true, consequenceClass: input.consequenceClass ?? 'OPERATIONAL', deadlineSemantics: structuredClone(input.deadlineSemantics ?? { type: 'NONE' }), version: requiredText(input.version ?? '1.0.0', 'decision_version_required') };
  return immutable({ ...core, fingerprint: semanticHash('decision-definition', core) });
}

export function evaluateDecisionDependencies({ definitions = [], facts = [], hypotheses = [], dataProducts = [], authority = {}, trust = {}, rights = {}, sourceHealth = {}, policy = {}, lifecycle = {} } = {}) {
  const factSet = new Set(facts.map((item) => typeof item === 'string' ? item : item.kind)), productSet = new Set(dataProducts.map((item) => typeof item === 'string' ? item : item.kind ?? item.productId)), hypothesisMap = new Map(hypotheses.map((item) => [item.hypothesisId, item])), evaluated = new Map();
  const results = definitions.map((definition) => {
    const blockers = [], lifecycleState = lifecycle[definition.id];
    for (const fact of definition.requiredFacts) if (!factSet.has(fact)) blockers.push({ category: 'EVIDENCE', code: 'REQUIRED_FACT_MISSING', reference: fact });
    for (const requirement of definition.requiredEvidenceStates) if (!requirement.states?.includes(hypothesisMap.get(requirement.hypothesisId)?.state)) blockers.push({ category: 'EVIDENCE', code: 'HYPOTHESIS_STATE_UNSATISFIED', reference: requirement.hypothesisId, expected: requirement.states, actual: hypothesisMap.get(requirement.hypothesisId)?.state ?? null });
    for (const product of definition.requiredDataProducts) if (!productSet.has(product)) blockers.push({ category: 'DATA', code: 'DATA_PRODUCT_MISSING', reference: product });
    for (const dependency of definition.requiredDecisions ?? []) if (evaluated.get(dependency)?.state !== 'READY') blockers.push({ category: 'POLICY', code: 'DECISION_DEPENDENCY_UNSATISFIED', reference: dependency });
    if (rights[definition.id] === false) blockers.push({ category: 'RIGHTS', code: 'DECISION_RIGHTS_BLOCKED' });
    if (trust[definition.id] === false) blockers.push({ category: 'TRUST', code: 'DECISION_TRUST_BLOCKED' });
    if (sourceHealth[definition.id] === false) blockers.push({ category: 'SOURCE_HEALTH', code: 'REQUIRED_SOURCE_DEGRADED' });
    if (policy[definition.id] === false) blockers.push({ category: 'POLICY', code: 'POLICY_CONDITION_UNSATISFIED' });
    if (definition.authorityRequirement && authority[definition.authorityRequirement.capability] !== true) blockers.push({ category: 'AUTHORITY', code: 'CAPABILITY_REQUIRED', reference: definition.authorityRequirement.capability });
    const precedence = ['TRUST', 'RIGHTS', 'POLICY', 'SOURCE_HEALTH', 'DATA', 'EVIDENCE', 'AUTHORITY'], first = precedence.find((category) => blockers.some((item) => item.category === category));
    let state = lifecycleState ?? (first ? `BLOCKED_BY_${first}` : 'READY');
    if (!DECISION_STATES.includes(state)) throw new Error('decision_state_invalid');
    if (definition.consequential && state === 'READY' && !definition.authorityRequirement) state = 'BLOCKED_BY_AUTHORITY';
    const core = { schemaVersion: 'vigia.decision-dependency-result.v1', decisionId: definition.id, definitionFingerprint: definition.fingerprint, policyReference: definition.policyReference, state, blockers, actionsUnlocked: state === 'READY' ? definition.actionsUnlocked : [], blockedActions: state === 'READY' ? [] : definition.actionsUnlocked, authorityRequirement: definition.authorityRequirement, consequential: definition.consequential };
    const result = { ...core, fingerprint: semanticHash('decision-dependency-result', core) }; evaluated.set(definition.id, result); return result;
  });
  const core = { schemaVersion: 'vigia.decision-dependency-graph.v1', results, edges: results.flatMap((result) => result.blockers.map((blocker) => ({ source: blocker.reference ?? blocker.code, target: result.decisionId, relationship: blocker.code }))).sort((a, b) => `${a.source}:${a.target}`.localeCompare(`${b.source}:${b.target}`)) };
  return immutable({ ...core, fingerprint: semanticHash('decision-dependency-graph', core) });
}
