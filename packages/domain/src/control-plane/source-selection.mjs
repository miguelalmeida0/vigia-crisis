import { immutable, semanticHash } from '../intelligence/shared.mjs';
import { provenanceRank } from '../intelligence/contracts/evidence-contract.mjs';

function intersects(left = [], right = []) { const values = new Set(right); return left.some((value) => values.has(value)); }
function requiredCapability(need) { return need.eligibility?.applicability?.requirementKind ?? need.missingQuantity; }
function numberOr(value, fallback) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function coordinate(value) { return value?.geometry?.coordinates ?? value?.coordinate ?? value?.coordinates ?? null; }
function spatiallyApplicable(source, geometry) {
  if (!geometry) return true;
  const point = coordinate(geometry), bbox = source.geographicApplicability?.bbox;
  if (!point || !Array.isArray(bbox) || bbox.length !== 4) return false;
  return point[0] >= bbox[0] && point[0] <= bbox[2] && point[1] >= bbox[1] && point[1] <= bbox[3];
}
function temporallyApplicable(source, timeWindow) {
  if (!timeWindow) return true;
  const availableFrom = source.metadata?.availableFrom, availableUntil = source.metadata?.availableUntil;
  return (!availableUntil || availableUntil >= timeWindow.from) && (!availableFrom || availableFrom <= timeWindow.to);
}
function compareRank(left, right) {
  for (let index = 0; index < left.rank.length; index += 1) if (left.rank[index] !== right.rank[index]) return left.rank[index] - right.rank[index];
  return left.sourceId.localeCompare(right.sourceId);
}

function assess(source, need, existingFamilyIds) {
  const eligibility = need.eligibility ?? {}, reasons = [];
  const familyClasses = eligibility.requiredSourceFamilyClasses ?? [], familyIds = eligibility.requiredSourceFamilyIds ?? [];
  const prohibited = eligibility.prohibitedCausalLineages ?? [], capabilities = source.capabilities ?? [];
  if (!(eligibility.sourceHealth?.requiredStatuses ?? ['ACTIVE']).includes(source.status)) reasons.push(`SOURCE_${source.status}`);
  if (familyClasses.length && !familyClasses.includes(source.familyClass)) reasons.push('FAMILY_CLASS_INELIGIBLE');
  if (familyIds.length && !familyIds.includes(source.familyId)) reasons.push('FAMILY_ID_INELIGIBLE');
  if (existingFamilyIds.has(source.familyId)) reasons.push('NOT_INDEPENDENT_FAMILY');
  if (intersects(source.upstreamLineage, prohibited) || prohibited.includes(source.sourceId) || prohibited.includes(source.familyId)) reasons.push('PROHIBITED_CAUSAL_LINEAGE');
  const capability = requiredCapability(need);
  if (capabilities.length && !capabilities.includes(capability) && !capabilities.includes('*')) reasons.push('CAPABILITY_MISMATCH');
  if (!spatiallyApplicable(source, eligibility.geometry)) reasons.push(source.geographicApplicability ? 'SPATIALLY_INCOMPATIBLE' : 'GEOGRAPHIC_APPLICABILITY_UNKNOWN');
  if (!temporallyApplicable(source, eligibility.timeWindow)) reasons.push('TEMPORALLY_INCOMPATIBLE');
  if (provenanceRank(source.metadata?.provenanceStrength) < provenanceRank(eligibility.minimumProvenanceStrength)) reasons.push('INSUFFICIENT_PROVENANCE_CAPABILITY');
  if (source.metadata?.observationOpportunity === false) reasons.push('NO_OBSERVATION_OPPORTUNITY');
  const rank = [
    numberOr(source.metadata?.priority, 100), numberOr(source.latencyMs, numberOr(source.metadata?.expectedLatencyMs, Number.MAX_SAFE_INTEGER)),
    -numberOr(source.metadata?.reliability, 0), numberOr(source.metadata?.cost, Number.MAX_SAFE_INTEGER)
  ];
  return { sourceId: source.sourceId, familyId: source.familyId, eligible: reasons.length === 0, exclusionReasons: reasons.sort(), rank };
}

export function selectEvidenceSource({ need, sources = [], existingFamilyIds = [], requireUniqueBest = true } = {}) {
  if (!need?.id || !need.eligibility) throw new Error('eligible_evidence_need_required');
  const assessed = sources.map((source) => assess(source, need, new Set(existingFamilyIds)))
    .sort(compareRank);
  const eligible = assessed.filter((item) => item.eligible), selected = eligible[0] ?? null;
  const tied = selected ? eligible.filter((item) => item.rank.every((value, index) => value === selected.rank[index])) : [];
  const state = !selected ? 'NO_ELIGIBLE_SOURCE' : requireUniqueBest && tied.length > 1 ? 'AMBIGUOUS_BEST_SOURCE' : 'SELECTED';
  const core = { schemaVersion: 'vigia.evidence-source-selection.v1', needId: need.id, state, selectedSourceId: state === 'SELECTED' ? selected.sourceId : null,
    candidates: assessed, ambiguousSourceIds: state === 'AMBIGUOUS_BEST_SOURCE' ? tied.map((item) => item.sourceId).sort() : [] };
  return immutable({ ...core, fingerprint: semanticHash('evidence-source-selection', core) });
}
