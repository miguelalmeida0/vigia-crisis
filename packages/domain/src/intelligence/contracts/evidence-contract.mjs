import { finiteNonNegative, immutable, requiredText, semanticHash, uniqueSorted } from '../shared.mjs';
import { SOURCE_FAMILY_CLASSES } from '../ontology/objects.mjs';

export const PROVENANCE_STRENGTHS = Object.freeze(['UNKNOWN', 'ASSERTED', 'ATTRIBUTED', 'VERIFIED', 'CHAIN_OF_CUSTODY']);
export const CONTRADICTION_MATERIALITY = Object.freeze(['MINOR', 'MATERIAL', 'CRITICAL']);
const REQUIREMENT_KINDS = Object.freeze(['FAMILY_CLASS_QUORUM', 'SOURCE_FAMILY_QUORUM']);

export function provenanceRank(value) {
  return PROVENANCE_STRENGTHS.indexOf(String(value ?? 'UNKNOWN').toUpperCase());
}

export function materialityRank(value) {
  return CONTRADICTION_MATERIALITY.indexOf(String(value ?? 'MINOR').toUpperCase());
}

function enumValue(value, allowed, code) {
  const normalized = String(value ?? '').toUpperCase();
  if (!allowed.includes(normalized)) throw new Error(code);
  return normalized;
}

function normalizeRequirement(input) {
  const kind = enumValue(input.kind, REQUIREMENT_KINDS, 'invalid_evidence_requirement_kind');
  const familyClasses = uniqueSorted(input.familyClasses?.map((item) => enumValue(item, SOURCE_FAMILY_CLASSES, 'invalid_requirement_family_class')));
  const sourceFamilyIds = uniqueSorted(input.sourceFamilyIds);
  if (kind === 'FAMILY_CLASS_QUORUM' && !familyClasses.length) throw new Error('requirement_family_class_required');
  if (kind === 'SOURCE_FAMILY_QUORUM' && !sourceFamilyIds.length) throw new Error('requirement_source_family_required');
  return {
    id: requiredText(input.id, 'evidence_requirement_id_required'), kind,
    minimum: finiteNonNegative(input.minimum, 'invalid_evidence_requirement_minimum'),
    familyClasses, sourceFamilyIds,
    reason: requiredText(input.reason, 'evidence_requirement_reason_required'),
    whyItMatters: requiredText(input.whyItMatters, 'evidence_requirement_importance_required')
  };
}

function normalizeStateRule(input) {
  const counts = Object.fromEntries(Object.entries(input.when?.minimumFamilyClassCounts ?? {}).map(([key, value]) => [enumValue(key, SOURCE_FAMILY_CLASSES, 'invalid_state_rule_family_class'), finiteNonNegative(value, 'invalid_state_rule_minimum')]));
  const maximumCounts = Object.fromEntries(Object.entries(input.when?.maximumFamilyClassCounts ?? {}).map(([key, value]) => [enumValue(key, SOURCE_FAMILY_CLASSES, 'invalid_state_rule_family_class'), finiteNonNegative(value, 'invalid_state_rule_maximum')]));
  return {
    state: requiredText(input.state, 'evidence_state_rule_state_required').toUpperCase(),
    when: {
      contractSatisfied: input.when?.contractSatisfied === undefined ? null : Boolean(input.when.contractSatisfied),
      minimumFamilyClassCounts: counts, maximumFamilyClassCounts: maximumCounts,
      minimumQualifyingEvidence: finiteNonNegative(input.when?.minimumQualifyingEvidence ?? 0, 'invalid_state_rule_evidence_minimum')
    }
  };
}

export function createEvidenceContract(input = {}) {
  const requirements = (input.requirements ?? []).map(normalizeRequirement).sort((left, right) => left.id.localeCompare(right.id));
  if (new Set(requirements.map((item) => item.id)).size !== requirements.length) throw new Error('duplicate_evidence_requirement_id');
  const allowedFamilyClasses = uniqueSorted((input.allowedFamilyClasses ?? SOURCE_FAMILY_CLASSES).map((item) => enumValue(item, SOURCE_FAMILY_CLASSES, 'invalid_allowed_family_class')));
  const maxAgeMs = finiteNonNegative(input.freshness?.maxAgeMs, 'invalid_contract_freshness');
  const spatialMode = String(input.spatialCompatibility?.mode ?? 'POINT_DISTANCE').toUpperCase();
  if (!['POINT_DISTANCE', 'EXACT_REFERENCE'].includes(spatialMode)) throw new Error('invalid_spatial_compatibility_mode');
  const core = {
    schemaVersion: 'vigia.evidence-contract.v1', id: requiredText(input.id, 'evidence_contract_id_required'),
    version: requiredText(input.version, 'evidence_contract_version_required'),
    claimType: requiredText(input.claimType, 'evidence_contract_claim_type_required'),
    requirements, allowedFamilyClasses,
    minimumIndependentFamilies: finiteNonNegative(input.minimumIndependentFamilies ?? 0, 'invalid_contract_family_minimum'),
    minimumQualifyingEvidence: finiteNonNegative(input.minimumQualifyingEvidence ?? 0, 'invalid_contract_evidence_minimum'),
    freshness: { maxAgeMs },
    temporalCompatibility: {
      leadToleranceMs: finiteNonNegative(input.temporalCompatibility?.leadToleranceMs ?? 0, 'invalid_temporal_lead_tolerance'),
      lagToleranceMs: finiteNonNegative(input.temporalCompatibility?.lagToleranceMs ?? 0, 'invalid_temporal_lag_tolerance')
    },
    spatialCompatibility: {
      mode: spatialMode,
      maxDistanceMeters: spatialMode === 'POINT_DISTANCE' ? finiteNonNegative(input.spatialCompatibility?.maxDistanceMeters, 'invalid_spatial_distance') : null
    },
    minimumProvenanceStrength: enumValue(input.minimumProvenanceStrength ?? 'ATTRIBUTED', PROVENANCE_STRENGTHS, 'invalid_contract_provenance_strength'),
    contradictions: {
      blocking: {
        minimumProvenanceStrength: enumValue(input.contradictions?.blocking?.minimumProvenanceStrength ?? 'VERIFIED', PROVENANCE_STRENGTHS, 'invalid_contradiction_provenance'),
        minimumMateriality: enumValue(input.contradictions?.blocking?.minimumMateriality ?? 'MATERIAL', CONTRADICTION_MATERIALITY, 'invalid_contradiction_materiality'),
        familyClasses: uniqueSorted((input.contradictions?.blocking?.familyClasses ?? []).map((item) => enumValue(item, SOURCE_FAMILY_CLASSES, 'invalid_contradiction_family_class')))
      },
      permittedSourceFamilyIds: uniqueSorted(input.contradictions?.permittedSourceFamilyIds)
    },
    sourceExclusions: {
      sourceIds: uniqueSorted(input.sourceExclusions?.sourceIds),
      sourceFamilyIds: uniqueSorted(input.sourceExclusions?.sourceFamilyIds),
      sourceStatuses: uniqueSorted(input.sourceExclusions?.sourceStatuses ?? ['COMPROMISED', 'EXCLUDED', 'DISALLOWED']).map((item) => item.toUpperCase())
    },
    observationOpportunity: { requiredForNegative: input.observationOpportunity?.requiredForNegative !== false },
    stateRules: (input.stateRules ?? []).map(normalizeStateRule),
    doctrine: String(input.doctrine ?? ''), metadata: structuredClone(input.metadata ?? {})
  };
  return immutable({ ...core, fingerprint: semanticHash('evidence-contract', core) });
}

export function assertEvidenceContractIntegrity(contract) {
  const { fingerprint, ...core } = contract;
  if (fingerprint !== semanticHash('evidence-contract', core)) throw new Error(`evidence_contract_fingerprint_mismatch:${contract.id}@${contract.version}`);
  return true;
}

export function resolveEvidenceContract(contracts = [], reference = {}) {
  const matches = contracts.filter((item) => item.id === reference.id && item.version === reference.version);
  if (new Set(matches.map((item) => item.fingerprint)).size > 1) throw new Error(`evidence_contract_version_conflict:${reference.id}@${reference.version}`);
  const match = matches[0];
  if (!match) throw new Error(`evidence_contract_version_not_found:${reference.id}@${reference.version}`);
  assertEvidenceContractIntegrity(match);
  return match;
}
