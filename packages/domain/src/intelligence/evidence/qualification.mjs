import { haversineKm } from '../../geo.mjs';
import { materialityRank, provenanceRank } from '../contracts/evidence-contract.mjs';
import { evidenceGraphIndexes } from './graph.mjs';
import { immutable, isoTime } from '../shared.mjs';

export const EVIDENCE_CLASSIFICATIONS = Object.freeze([
  'SUPPORTING', 'CONTRADICTING', 'IRRELEVANT', 'STALE', 'SPATIALLY_INCOMPATIBLE',
  'TEMPORALLY_INCOMPATIBLE', 'INSUFFICIENT_PROVENANCE', 'CAUSAL_DUPLICATE',
  'NO_OBSERVATION_OPPORTUNITY', 'SOURCE_EXCLUDED', 'FAMILY_NOT_ALLOWED'
]);

function point(location) {
  return location?.geometry?.type === 'Point' ? location.geometry.coordinates : null;
}

function spatiallyCompatible(claim, observation, contract) {
  if (contract.spatialCompatibility.mode === 'EXACT_REFERENCE') {
    return Boolean(claim.location.referenceId && claim.location.referenceId === observation.location.referenceId);
  }
  const claimPoint = point(claim.location), observationPoint = point(observation.location);
  return Boolean(claimPoint && observationPoint && haversineKm(claimPoint, observationPoint) * 1000 <= contract.spatialCompatibility.maxDistanceMeters);
}

function excludedEntry(context, classification, reason) {
  return { ...context, classification, reason };
}

function classifyOne({ evidence, claim, contract, indexes, evaluatedAt }) {
  const evidenceObservation = indexes.observationById.get(evidence.observationId);
  const lineage = indexes.lineageByObservationId.get(evidenceObservation.id);
  const observation = lineage.rootObservationIds.length === 1 ? indexes.observationById.get(lineage.rootObservationIds[0]) : evidenceObservation;
  const base = {
    evidenceId: evidence.id, observationId: evidenceObservation.id, causalObservationId: observation.id, observedAt: observation.observedAt,
    stance: evidence.stance, provenanceStrength: evidence.provenanceStrength,
    materiality: evidence.materiality, contradictionStatus: evidence.contradictionStatus,
    sourceFamilyId: lineage.sourceFamilyIds.length === 1 ? lineage.sourceFamilyIds[0] : null,
    familyClass: null,
    causalLineage: { causalKeys: [...lineage.causalKeys], rootObservationIds: [...lineage.rootObservationIds], sourceIds: [...lineage.sourceIds] }
  };
  if (evidence.claimId !== claim.id || evidence.stance === 'IRRELEVANT') return excludedEntry(base, 'IRRELEVANT', 'Evidence does not address this claim.');
  if (lineage.sourceFamilyIds.length !== 1 || lineage.rootObservationIds.length !== 1 || lineage.causalKeys.length !== 1) return excludedEntry(base, 'INSUFFICIENT_PROVENANCE', 'Composite or ambiguous causal lineage cannot act as an independent witness.');
  const family = indexes.familyById.get(lineage.sourceFamilyIds[0]); base.familyClass = family.familyClass;
  const sources = lineage.sourceIds.map((id) => indexes.sourceById.get(id));
  if (sources.some((item) => contract.sourceExclusions.sourceFamilyIds.includes(item.familyId))
    || sources.some((item) => contract.sourceExclusions.sourceIds.includes(item.id)
      || contract.sourceExclusions.sourceStatuses.includes(item.status))) {
    return excludedEntry(base, 'SOURCE_EXCLUDED', 'The contract excludes this source, source family, or source status.');
  }
  if (!contract.allowedFamilyClasses.includes(family.familyClass)) return excludedEntry(base, 'FAMILY_NOT_ALLOWED', 'The source-family class is not allowed by this contract.');
  if (observation.state === 'NOT_OBSERVED'
    || (contract.observationOpportunity.requiredForNegative && observation.state === 'OBSERVED_NEGATIVE' && observation.opportunity.state !== 'VALID')) {
    return excludedEntry(base, 'NO_OBSERVATION_OPPORTUNITY', 'Absence is not evidence without an attributable valid observation opportunity.');
  }
  if (observation.state === 'OBSERVED_UNDETERMINED') return excludedEntry(base, 'IRRELEVANT', 'The observation does not resolve a supporting or contradicting proposition.');
  const observedMs = Date.parse(observation.observedAt), evaluationMs = Date.parse(evaluatedAt);
  const earliest = Date.parse(claim.validTime.from) - contract.temporalCompatibility.leadToleranceMs;
  const latest = Date.parse(claim.validTime.to) + contract.temporalCompatibility.lagToleranceMs;
  if (observedMs > evaluationMs || observedMs < earliest || observedMs > latest) return excludedEntry(base, 'TEMPORALLY_INCOMPATIBLE', 'The observation is unavailable at evaluation time or outside the claim-compatible time window.');
  if (evaluationMs - observedMs > contract.freshness.maxAgeMs) return excludedEntry(base, 'STALE', 'The evidence exceeds the contract freshness window.');
  if (!spatiallyCompatible(claim, observation, contract)) return excludedEntry(base, 'SPATIALLY_INCOMPATIBLE', 'The observation does not satisfy the contract spatial relationship.');
  if (provenanceRank(evidence.provenanceStrength) < provenanceRank(contract.minimumProvenanceStrength)) return excludedEntry(base, 'INSUFFICIENT_PROVENANCE', 'The evidence provenance is weaker than the contract minimum.');
  return { ...base, classification: evidence.stance, reason: evidence.stance === 'SUPPORTING' ? 'Evidence qualifies as support.' : 'Evidence qualifies as a contradiction.' };
}

function markCausalDuplicates(entries) {
  const groups = new Map();
  for (const entry of entries.filter((item) => ['SUPPORTING', 'CONTRADICTING'].includes(item.classification))) {
    const key = `${entry.sourceFamilyId}|${entry.classification}|${entry.causalLineage.causalKeys.join('+')}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  for (const group of groups.values()) {
    group.sort((left, right) => provenanceRank(right.provenanceStrength) - provenanceRank(left.provenanceStrength)
      || Date.parse(right.observedAt) - Date.parse(left.observedAt) || left.evidenceId.localeCompare(right.evidenceId));
    const representative = group[0];
    for (const duplicate of group.slice(1)) {
      duplicate.classification = 'CAUSAL_DUPLICATE'; duplicate.duplicateOf = representative.evidenceId;
      duplicate.reason = 'This evidence shares the same underlying causal observation and cannot inflate quorum.';
    }
  }
}

export function qualifyEvidence({ claim, contract, evidenceGraph, evaluationTime }) {
  const evaluatedAt = isoTime(evaluationTime, 'evaluation_time_required');
  const indexes = evidenceGraphIndexes(evidenceGraph);
  const classifications = evidenceGraph.evidence.map((evidence) => classifyOne({ evidence, claim, contract, indexes, evaluatedAt }));
  markCausalDuplicates(classifications);
  classifications.sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
  return immutable({
    classifications,
    supporting: classifications.filter((item) => item.classification === 'SUPPORTING'),
    contradicting: classifications.filter((item) => item.classification === 'CONTRADICTING'),
    excluded: classifications.filter((item) => !['SUPPORTING', 'CONTRADICTING'].includes(item.classification)),
    evaluatedAt
  });
}

export function isBlockingContradiction(entry, contract) {
  const blocking = contract.contradictions.blocking;
  return entry.contradictionStatus !== 'RESOLVED'
    && !contract.contradictions.permittedSourceFamilyIds.includes(entry.sourceFamilyId)
    && (!blocking.familyClasses.length || blocking.familyClasses.includes(entry.familyClass))
    && provenanceRank(entry.provenanceStrength) >= provenanceRank(blocking.minimumProvenanceStrength)
    && materialityRank(entry.materiality) >= materialityRank(blocking.minimumMateriality);
}
