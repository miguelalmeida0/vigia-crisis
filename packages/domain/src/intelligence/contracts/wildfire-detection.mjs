import { createEvidenceContract } from './evidence-contract.mjs';

export function createWildfireDetectionContract({ version = '1', requiredPhysicalFamilies = 2, requireOfficialFamily = true } = {}) {
  const requirements = [
    {
      id: 'wildfire.independent-physical-corroboration', kind: 'FAMILY_CLASS_QUORUM', familyClasses: ['PHYSICAL'], minimum: requiredPhysicalFamilies,
      reason: 'Independent physical observation families are required to corroborate a wildfire-presence claim.',
      whyItMatters: 'A single sensor family can share blind spots, processing errors, and upstream measurements.'
    }
  ];
  if (requireOfficialFamily) requirements.push({
    id: 'wildfire.official-corroboration', kind: 'FAMILY_CLASS_QUORUM', familyClasses: ['OFFICIAL'], minimum: 1,
    reason: 'An attributable official warning or equivalent official operational observation is required.',
    whyItMatters: 'Physical detections and official operational status answer different parts of the claim.'
  });
  const minimum = requiredPhysicalFamilies + Number(requireOfficialFamily);
  return createEvidenceContract({
    id: 'wildfire-detection', version, claimType: 'wildfire.presence', requirements,
    allowedFamilyClasses: ['REPORT', 'PHYSICAL', 'OFFICIAL'], minimumIndependentFamilies: minimum,
    minimumQualifyingEvidence: minimum, freshness: { maxAgeMs: 90 * 60_000 },
    temporalCompatibility: { leadToleranceMs: 30 * 60_000, lagToleranceMs: 60 * 60_000 },
    spatialCompatibility: { mode: 'POINT_DISTANCE', maxDistanceMeters: 5_000 },
    minimumProvenanceStrength: 'ATTRIBUTED',
    contradictions: { blocking: { minimumProvenanceStrength: 'VERIFIED', minimumMateriality: 'MATERIAL', familyClasses: ['PHYSICAL', 'OFFICIAL'] } },
    observationOpportunity: { requiredForNegative: true },
    stateRules: [
      { state: 'CORROBORATED', when: { contractSatisfied: true } },
      { state: 'MULTI_FAMILY_PHYSICAL_SUPPORT', when: { minimumFamilyClassCounts: { PHYSICAL: 2 } } },
      { state: 'SINGLE_FAMILY_PHYSICAL', when: { minimumFamilyClassCounts: { PHYSICAL: 1 } } },
      { state: 'REPORT_ONLY', when: { minimumFamilyClassCounts: { REPORT: 1 }, maximumFamilyClassCounts: { PHYSICAL: 0, OFFICIAL: 0 } } }
    ],
    doctrine: 'Wildfire detection doctrine v1: causal physical corroboration remains distinct from official operational corroboration.'
  });
}

export const WILDFIRE_DETECTION_CONTRACT_V1 = createWildfireDetectionContract();
