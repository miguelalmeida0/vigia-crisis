import { semanticHash } from '../intelligence/shared.mjs';
import { rows, state, strategicId, text, truthSource, visibleAt } from './strategic-helpers.mjs';

const CANONICAL_TERMS = new Set([
  'INCIDENT', 'OBSERVATION', 'SOURCE', 'EVIDENCE', 'INFORMATION_REQUIREMENT',
  'COLLECTION_TASK', 'DECISION_POINT', 'RECOMMENDATION', 'ASSIGNMENT',
  'RESOURCE', 'AUTHORITY', 'PROTECTION_ACTION', 'ALERT_DRAFT', 'ACKNOWLEDGEMENT',
  'EXPECTED_POSTCONDITION', 'OBSERVED_POSTCONDITION', 'OUTCOME',
  'FIELD_OBSERVATION', 'NEAR_MISS', 'PREVENTION_RECOMMENDATION',
]);

const TERM_CANDIDATES = Object.freeze({
  occurrence: ['INCIDENT'], incident: ['INCIDENT'], event: ['INCIDENT', 'OBSERVATION'], observation: ['OBSERVATION'],
  activation: ['PROTECTION_ACTION', 'ASSIGNMENT'], dispatch: ['ASSIGNMENT'], assignment: ['ASSIGNMENT'],
  warning: ['ALERT_DRAFT'], alert: ['ALERT_DRAFT'], resource: ['RESOURCE'], source: ['SOURCE'], evidence: ['EVIDENCE'],
});

function normalizedCode(value) {
  return text(value)?.toUpperCase().replace(/[^A-Z0-9]+/gu, '_').replace(/^_+|_+$/gu, '') ?? null;
}

function extractedPolicyRules(original) {
  return original.split(/(?<=[.!?;])\s+/u).map((clause) => clause.trim()).filter(Boolean).flatMap((clause) => {
    const approval = clause.match(/\b([A-Za-z][A-Za-z -]{0,60}?)\s+must\s+approve\b/iu);
    const authority = /\b(authority|authori[sz](?:e|ed|ation)|permission)\b/iu.test(clause);
    const evidence = /\b(evidence|confirmation|verified|verification|proof)\b/iu.test(clause);
    const escalation = /\b(escalat(?:e|es|ed|ion))\b/iu.test(clause);
    const expiry = /\b(expir(?:e|es|ed|y)|valid\s+until|end\s+of)\b/iu.test(clause);
    const withhold = /\b(do\s+not|must\s+not|never|unless)\b/iu.test(clause);
    if (!approval && !authority && !evidence && !escalation && !expiry && !withhold) return [];
    return [{ sourceClause: clause, approvalGate: approval ? `${normalizedCode(approval[1])}_APPROVAL` : null, authorityConstraint: authority ? 'EXPLICIT_AUTHORITY_REVIEW_REQUIRED' : null, requiredEvidence: evidence ? ['SOURCE_CLAUSE_EVIDENCE_REQUIREMENT_REQUIRES_MAPPING'] : [], escalation: escalation ? 'SOURCE_CLAUSE_ESCALATION_REQUIRES_MAPPING' : null, expiry: expiry ? 'SOURCE_CLAUSE_EXPIRY_REQUIRES_MAPPING' : null, safeDefault: withhold ? 'WITHHOLD_UNTIL_REVIEWED_CONDITIONS_PASS' : null, extractionMethod: 'DETERMINISTIC_CONSERVATIVE_TEXT_CANDIDATE' }];
  });
}

export function projectPolicyToCode(policies, asOf) {
  const supplied = rows(policies), visible = supplied.filter((policy) => visibleAt(policy, asOf, policy.receivedAt ?? policy.effectiveAt));
  const drafts = visible.flatMap((policy) => {
    const original = text(policy.originalText ?? policy.text), reference = text(policy.reference ?? policy.id);
    const structured = rows(policy.rules), rules = structured.length ? structured.map((rule) => ({ ...rule, extractionMethod: 'SUPPLIED_STRUCTURED_RULE' })) : original ? extractedPolicyRules(original) : [];
    if (!original || !reference || !rules.length) return [];
    return [{
      policyDraftId: strategicId('policy-draft', { reference, rules }), sourceReference: reference, originalText: original,
      sourceTextHash: semanticHash('policy-source-text', { reference, original }),
      compilationMethod: structured.length ? 'GOVERNED_STRUCTURED_INPUT' : 'DETERMINISTIC_CANDIDATE_EXTRACTION',
      gates: rules.map((rule, ruleIndex) => ({
        gateId: text(rule.id) ?? strategicId('policy-gate', { reference, ruleIndex, rule }),
        approvalGate: text(rule.approvalGate), authorityConstraint: text(rule.authorityConstraint),
        requiredEvidence: rows(rule.requiredEvidence).map(text).filter(Boolean), escalation: text(rule.escalation),
        expiry: text(rule.expiry), safeDefault: text(rule.safeDefault), sourceClause: text(rule.sourceClause),
        extractionMethod: rule.extractionMethod,
        validation: { missingFields: ['approvalGate', 'authorityConstraint', 'requiredEvidence', 'escalation', 'expiry', 'safeDefault'].filter((key) => key === 'requiredEvidence' ? !rows(rule[key]).length : !text(rule[key])), humanConfirmationRequired: true, executable: false },
        state: 'DRAFT_INACTIVE',
      })),
      reviewState: 'HUMAN_REVIEW_REQUIRED', active: false,
    }];
  });
  return { schemaVersion: 'vigia.policy-to-code.v1', generatedAt: asOf, state: drafts.length ? 'DRAFTS_REQUIRE_HUMAN_REVIEW' : 'NO_STRUCTURED_POLICY_INPUT', drafts, counts: { supplied: supplied.length, excludedFuture: supplied.length - visible.length, drafts: drafts.length, gates: drafts.reduce((sum, draft) => sum + draft.gates.length, 0), executable: 0 }, truthBoundary: 'Compiled controls remain inactive drafts. Importing or parsing policy text never activates authority, approval, escalation, or execution rules.' };
}

export function projectSemanticTranslator(mappings, asOf) {
  const supplied = rows(mappings), visible = supplied.filter((mapping) => visibleAt(mapping, asOf, mapping.receivedAt ?? mapping.publishedAt));
  const prepared = visible.map((mapping, index) => {
    const canonicalTerm = state(mapping.canonicalTerm), originalTerm = text(mapping.originalTerm ?? mapping.term);
    const source = truthSource(mapping), normalizedOriginalTerm = originalTerm?.toLocaleLowerCase('en-US') ?? null;
    return { mapping, index, canonicalTerm, originalTerm, normalizedOriginalTerm, source, agency: text(mapping.agency), candidateCanonicalTerms: normalizedOriginalTerm ? TERM_CANDIDATES[normalizedOriginalTerm] ?? [] : [] };
  });
  const conflicts = new Set(), byTerm = new Map();
  for (const item of prepared.filter((entry) => entry.originalTerm && entry.source && CANONICAL_TERMS.has(entry.canonicalTerm))) {
    const key = `${item.agency ?? 'UNSPECIFIED'}:${item.normalizedOriginalTerm}`, values = byTerm.get(key) ?? new Set();
    values.add(item.canonicalTerm); byTerm.set(key, values); if (values.size > 1) conflicts.add(key);
  }
  const items = prepared.map(({ mapping, index, canonicalTerm, originalTerm, normalizedOriginalTerm, source, agency, candidateCanonicalTerms }) => {
    const key = `${agency ?? 'UNSPECIFIED'}:${normalizedOriginalTerm}`, conflict = conflicts.has(key);
    const admitted = Boolean(originalTerm && source && CANONICAL_TERMS.has(canonicalTerm) && !conflict);
    return { mappingId: text(mapping.id) ?? strategicId('semantic-mapping', { index, mapping }), agency, originalTerm, normalizedOriginalTerm, canonicalTerm: admitted ? canonicalTerm : null, candidateCanonicalTerms: admitted ? [canonicalTerm] : candidateCanonicalTerms, source, state: conflict ? 'CONFLICT_REVIEW' : admitted ? 'MAPPING_ADMITTED' : 'REVIEW_REQUIRED', mappingMethod: admitted ? 'EXPLICIT_GOVERNED_MAPPING' : candidateCanonicalTerms.length ? 'CONTROLLED_LEXICON_CANDIDATE' : 'NO_SUPPORTED_CANDIDATE', reason: conflict ? 'The same agency term has conflicting explicit canonical mappings.' : admitted ? null : 'A supported explicit canonical term, original term, and attributable mapping source are required before admission.' };
  });
  return { schemaVersion: 'vigia.interagency-semantic-translator.v1', generatedAt: asOf, state: items.some((item) => item.state === 'MAPPING_ADMITTED') ? 'MAPPINGS_AVAILABLE' : 'NO_ADMITTED_MAPPINGS', mappings: items, counts: { supplied: supplied.length, excludedFuture: supplied.length - visible.length, admitted: items.filter((item) => item.state === 'MAPPING_ADMITTED').length, candidates: items.filter((item) => item.mappingMethod === 'CONTROLLED_LEXICON_CANDIDATE').length, conflicts: items.filter((item) => item.state === 'CONFLICT_REVIEW').length }, truthBoundary: 'Translation preserves every original term and source. It maps vocabulary only; it does not merge records, authority, or truth states.' };
}
