import { deriveContractEvidenceDebt } from '../debt/derive-evidence-debt.mjs';
import { assertEvidenceContractIntegrity } from '../contracts/evidence-contract.mjs';
import { qualifyEvidence, isBlockingContradiction } from '../evidence/qualification.mjs';
import { explainEvidenceTransition } from './transition.mjs';
import { immutable, isoTime, semanticHash } from '../shared.mjs';

function independentFamilies(supporting) {
  const families = new Map();
  for (const item of supporting) {
    if (!families.has(item.sourceFamilyId)) families.set(item.sourceFamilyId, { sourceFamilyId: item.sourceFamilyId, familyClass: item.familyClass, evidenceIds: [], causalLineages: [] });
    const family = families.get(item.sourceFamilyId);
    family.evidenceIds.push(item.evidenceId); family.causalLineages.push(...item.causalLineage.causalKeys);
  }
  return [...families.values()].map((item) => ({ ...item, evidenceIds: [...new Set(item.evidenceIds)].sort(), causalLineages: [...new Set(item.causalLineages)].sort() }))
    .sort((left, right) => left.sourceFamilyId.localeCompare(right.sourceFamilyId));
}

function requirementResult(requirement, families) {
  const matching = families.filter((family) => requirement.kind === 'FAMILY_CLASS_QUORUM'
    ? requirement.familyClasses.includes(family.familyClass) : requirement.sourceFamilyIds.includes(family.sourceFamilyId));
  const satisfied = matching.length >= requirement.minimum;
  return {
    id: requirement.id, kind: requirement.kind, satisfied,
    expected: { minimum: requirement.minimum, familyClasses: requirement.familyClasses, sourceFamilyIds: requirement.sourceFamilyIds },
    actual: { count: matching.length, sourceFamilyIds: matching.map((item) => item.sourceFamilyId) },
    reason: satisfied ? `Requirement satisfied by ${matching.length} independent source families.` : `${requirement.minimum - matching.length} additional qualifying independent source family or families required.`,
    whyItMatters: requirement.whyItMatters
  };
}

function globalRequirements(contract, families, supporting) {
  return [
    {
      id: 'contract.minimum-independent-families', kind: 'INDEPENDENT_FAMILY_QUORUM',
      satisfied: families.length >= contract.minimumIndependentFamilies,
      expected: { minimum: contract.minimumIndependentFamilies, familyClasses: contract.allowedFamilyClasses, sourceFamilyIds: [] },
      actual: { count: families.length, sourceFamilyIds: families.map((item) => item.sourceFamilyId) },
      reason: families.length >= contract.minimumIndependentFamilies ? 'Minimum independent-family quorum is satisfied.' : `${contract.minimumIndependentFamilies - families.length} additional independent source family or families required.`,
      whyItMatters: 'Independent causal families reduce correlated-source failure and duplicate-witness inflation.'
    },
    {
      id: 'contract.minimum-qualifying-evidence', kind: 'QUALIFYING_EVIDENCE_QUORUM',
      satisfied: supporting.length >= contract.minimumQualifyingEvidence,
      expected: { minimum: contract.minimumQualifyingEvidence, familyClasses: contract.allowedFamilyClasses, sourceFamilyIds: [] },
      actual: { count: supporting.length, evidenceIds: supporting.map((item) => item.evidenceId) },
      reason: supporting.length >= contract.minimumQualifyingEvidence ? 'Minimum qualifying-evidence quorum is satisfied.' : `${contract.minimumQualifyingEvidence - supporting.length} additional qualifying causal evidence item or items required.`,
      whyItMatters: 'The contract requires a minimum attributable evidence base before the claim can satisfy doctrine.'
    }
  ];
}

function ruleMatches(rule, context) {
  if (rule.when.contractSatisfied !== null && rule.when.contractSatisfied !== context.satisfied) return false;
  if (context.supportingCount < rule.when.minimumQualifyingEvidence) return false;
  for (const [familyClass, minimum] of Object.entries(rule.when.minimumFamilyClassCounts)) if ((context.familyClassCounts[familyClass] ?? 0) < minimum) return false;
  for (const [familyClass, maximum] of Object.entries(rule.when.maximumFamilyClassCounts)) if ((context.familyClassCounts[familyClass] ?? 0) > maximum) return false;
  return true;
}

function evidenceState({ contract, families, supporting, excluded, satisfied, blockingContradictions, targetedEvidenceCount }) {
  if (blockingContradictions.length) return 'CONTRADICTED';
  const familyClassCounts = Object.fromEntries([...new Set(families.map((item) => item.familyClass))].map((familyClass) => [familyClass, families.filter((item) => item.familyClass === familyClass).length]));
  const context = { satisfied, supportingCount: supporting.length, familyClassCounts };
  const configured = contract.stateRules.find((rule) => ruleMatches(rule, context));
  if (configured) return configured.state;
  if (!supporting.length && excluded.length && excluded.every((item) => item.classification === 'STALE')) return 'STALE';
  if (!supporting.length && targetedEvidenceCount === 0) return 'UNSUPPORTED';
  return 'INSUFFICIENT';
}

export function evaluateEvidenceContract({ claim, contract, evidenceGraph, evaluationTime, previousEvaluation = null }) {
  const evaluatedAt = isoTime(evaluationTime, 'evaluation_time_required');
  assertEvidenceContractIntegrity(contract);
  if (claim.claimType !== contract.claimType) throw new Error('claim_type_contract_mismatch');
  if (claim.contract.id !== contract.id || claim.contract.version !== contract.version) throw new Error('claim_contract_version_mismatch');
  if (evidenceGraph.schemaVersion !== 'vigia.evidence-graph.v1') throw new Error('canonical_evidence_graph_required');
  const qualified = qualifyEvidence({ claim, contract, evidenceGraph, evaluationTime: evaluatedAt });
  const families = independentFamilies(qualified.supporting);
  const requirementResults = [...contract.requirements.map((item) => requirementResult(item, families)), ...globalRequirements(contract, families, qualified.supporting)];
  const contradictions = qualified.contradicting.map((item) => ({
    evidenceId: item.evidenceId, observationId: item.observationId, claimId: claim.id,
    contradicts: claim.proposition, reason: item.reason, observedAt: item.observedAt,
    materiality: item.materiality, provenanceStrength: item.provenanceStrength,
    sourceFamilyId: item.sourceFamilyId, unresolved: item.contradictionStatus !== 'RESOLVED',
    blocking: isBlockingContradiction(item, contract), causalLineage: item.causalLineage
  })).sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
  const blockingContradictions = contradictions.filter((item) => item.blocking);
  const requirementsSatisfied = requirementResults.every((item) => item.satisfied);
  const satisfied = requirementsSatisfied && !blockingContradictions.length;
  const contradictionNeeds = blockingContradictions.map((item) => ({
    id: `contradiction.${item.evidenceId}`, kind: 'BLOCKING_CONTRADICTION', satisfied: false,
    expected: { minimum: 0, familyClasses: [], sourceFamilyIds: [item.sourceFamilyId] }, actual: { count: 1, evidenceIds: [item.evidenceId] },
    reason: `Blocking contradiction ${item.evidenceId} must be resolved or superseded by attributable evidence.`,
    whyItMatters: 'Operational disagreement must remain explicit and cannot be averaged into corroboration.'
  }));
  const satisfiedRequirements = requirementResults.filter((item) => item.satisfied);
  const unmetRequirements = [...requirementResults.filter((item) => !item.satisfied), ...contradictionNeeds].sort((left, right) => left.id.localeCompare(right.id));
  const targetedEvidenceCount = evidenceGraph.evidence.filter((item) => item.claimId === claim.id).length;
  const state = evidenceState({ contract, families, supporting: qualified.supporting, excluded: qualified.excluded, satisfied, blockingContradictions, targetedEvidenceCount });
  const evidenceDebt = deriveContractEvidenceDebt({ claim, contract, unmetRequirements, qualifyingEvidence: qualified.supporting, evaluatedAt });
  const core = {
    schemaVersion: 'vigia.intelligence-evaluation.v1', state, satisfied, requirementsSatisfied,
    satisfiedRequirements, unmetRequirements,
    supportingEvidence: qualified.supporting, qualifyingEvidence: qualified.supporting,
    excludedEvidence: qualified.excluded, independentFamilies: families, contradictions, evidenceDebt,
    contract: { id: contract.id, version: contract.version, fingerprint: contract.fingerprint }, evaluatedAt
  };
  const evaluationId = semanticHash('intelligence-evaluation', { claim, evidenceGraph, contractFingerprint: contract.fingerprint, evaluatedAt });
  const transitionExplanation = explainEvidenceTransition(previousEvaluation, core);
  return immutable({ ...core, evaluationId, transitionExplanation });
}
