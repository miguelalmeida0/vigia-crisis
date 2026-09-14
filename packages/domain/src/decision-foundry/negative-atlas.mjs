import { immutable, isoTime, requiredText, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';
import { NEGATIVE_LABELS } from './constants.mjs';

const requiredProof = Object.freeze(['coverage', 'providerHealthy', 'productAvailable', 'observationOpportunity', 'qualitySufficient', 'officialSourcesChecked', 'physicalSourcesChecked', 'labelDoctrineSatisfied', 'knowledgeTimeValid', 'rightsPermitUse']);
export function createNegativeAtlasEntry(input = {}) {
  const requested = NEGATIVE_LABELS.includes(input.label) ? input.label : 'UNKNOWN', proof = Object.fromEntries(requiredProof.map((key) => [key, input.proof?.[key] === true])), missingProof = requiredProof.filter((key) => !proof[key]);
  const positiveLabels = ['VALID_NO_WILDFIRE', 'VALID_NO_PHYSICAL_FIRE', 'REAL_FIRE_NOT_WILDFIRE', 'PRESCRIBED_OR_MANAGED_FIRE', 'AGRICULTURAL_BURN', 'INDUSTRIAL_THERMAL_EVENT', 'VOLCANIC_THERMAL_EVENT', 'AMBIGUOUS_THERMAL_EVENT'], label = positiveLabels.includes(requested) && missingProof.length ? 'UNKNOWN' : requested;
  const core = { schemaVersion: 'vigia.negative-opportunity-atlas-entry.v1', id: requiredText(input.id, 'negative_atlas_id_required'), geometry: structuredClone(input.geometry), timeWindow: { from: isoTime(input.timeWindow?.from, 'negative_atlas_from_required'), to: isoTime(input.timeWindow?.to, 'negative_atlas_to_required') }, sourceFamily: requiredText(input.sourceFamily, 'negative_atlas_source_family_required'), label, requestedLabel: requested, proof, physicalObservationIds: uniqueSorted(input.physicalObservationIds), officialCheckIds: uniqueSorted(input.officialCheckIds), persistentAnomalyIds: uniqueSorted(input.persistentAnomalyIds), prescribedFireCheckIds: uniqueSorted(input.prescribedFireCheckIds), knowledgeTimeCutoff: isoTime(input.knowledgeTimeCutoff, 'negative_atlas_cutoff_required'), reviewState: input.reviewState ?? 'AWAITING_CERTIFICATION', rejectionReasons: missingProof.map((key) => `MISSING_${key.toUpperCase()}`), hardNegativeCategory: input.hardNegativeCategory ?? null, rightsManifestId: input.rightsManifestId ?? null };
  return immutable({ ...core, certified: label !== 'UNKNOWN' && !['NO_OBSERVATION_OPPORTUNITY', 'SOURCE_UNAVAILABLE', 'QUALITY_INSUFFICIENT'].includes(label) && missingProof.length === 0, fingerprint: semanticHash('negative-atlas-entry', core) });
}

export function certifyNegativeAtlas(entries = []) {
  const rows = entries.map((entry) => entry.schemaVersion === 'vigia.negative-opportunity-atlas-entry.v1' ? entry : createNegativeAtlasEntry(entry)), counts = Object.fromEntries(NEGATIVE_LABELS.map((label) => [label, rows.filter((item) => item.label === label).length])), certified = rows.filter((item) => item.certified), hard = certified.filter((item) => item.hardNegativeCategory);
  const rejectionReasons = Object.fromEntries(uniqueSorted(rows.flatMap((item) => item.rejectionReasons)).map((reason) => [reason, rows.filter((item) => item.rejectionReasons.includes(reason)).length]));
  const core = { schemaVersion: 'vigia.negative-opportunity-atlas.v1', entries: rows, candidates: rows.length, certifiedNegatives: certified.length, unknowns: rows.filter((item) => item.label === 'UNKNOWN').length, validHardNegatives: hard.length, counts, rejectionReasons };
  return immutable({ ...core, fingerprint: semanticHash('negative-opportunity-atlas', core) });
}
