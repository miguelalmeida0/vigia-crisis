import { bboxIou, centroidDistanceKm } from './geometry.mjs';

const time = (value) => value ? Date.parse(value) : NaN;
const text = (value) => String(value ?? '').trim();

export function classifySnapshot(prior, current, { providerPublicationChanged = false } = {}) {
  if (!current.geometryQuality?.valid) return 'SCHEMA_CHANGED';
  if (!prior) return 'NEW_PROVIDER_PUBLICATION_NO_GEOMETRY_CHANGE';
  if (prior.normalizedGeometryHash !== current.normalizedGeometryHash) return 'GEOMETRY_CHANGED';
  if (prior.status !== current.status) return 'STATUS_CHANGED';
  if (prior.metadataHash !== current.metadataHash) return 'INCIDENT_METADATA_CHANGED';
  return providerPublicationChanged ? 'NEW_PROVIDER_PUBLICATION_NO_GEOMETRY_CHANGE' : 'NO_PROVIDER_CHANGE';
}

export function classifyRevision(prior, current, hints = {}) {
  if (!current.geometryQuality?.valid) return { classification: 'INVALID_GEOMETRY', acceptedForSequence: false, acceptedForLabel: false, reason: current.geometryQuality?.reason ?? 'GEOMETRY_QUALITY_UNAVAILABLE' };
  if (prior && current.providerFeatureId === prior.providerFeatureId && current.incidentId !== prior.incidentId) return { classification: 'INCIDENT_REASSOCIATION', acceptedForSequence: true, acceptedForLabel: false, reason: 'STABLE_FEATURE_CHANGED_INCIDENT_ID' };
  if (prior && Number.isFinite(time(prior.clocks.providerPublishedAt)) && Number.isFinite(time(current.clocks.providerPublishedAt)) && time(current.clocks.providerPublishedAt) < time(prior.clocks.providerPublishedAt)) return { classification: 'CLOCK_ANOMALY', acceptedForSequence: true, acceptedForLabel: false, reason: 'PROVIDER_PUBLICATION_MOVED_BACKWARD' };
  if (prior?.normalizedGeometryHash === current.normalizedGeometryHash) return { classification: 'DUPLICATE', acceptedForSequence: false, acceptedForLabel: false, reason: 'NORMALIZED_GEOMETRY_IDENTICAL' };
  if (hints.removed) return { classification: 'PERIMETER_RETRACTION', acceptedForSequence: true, acceptedForLabel: false, reason: 'PROVIDER_FEATURE_REMOVED' };
  if (hints.mergeOf?.length) return { classification: 'MERGE', acceptedForSequence: true, acceptedForLabel: false, reason: 'PROVIDER_RELATIONSHIP_MERGE' };
  if (hints.splitFrom) return { classification: 'SPLIT', acceptedForSequence: true, acceptedForLabel: false, reason: 'PROVIDER_RELATIONSHIP_SPLIT' };
  if (/correct|revis|adjust/i.test(text(hints.providerChangeReason))) return { classification: 'CORRECTION', acceptedForSequence: true, acceptedForLabel: false, reason: 'PROVIDER_CORRECTION_SIGNAL' };
  if (!prior) return { classification: 'UNKNOWN_CHANGE', acceptedForSequence: true, acceptedForLabel: false, reason: 'NO_PRIOR_GEOMETRY' };
  const before = Number(prior.areaSquareKm), after = Number(current.areaSquareKm), ratio = before > 0 && after >= 0 ? after / before : null, overlap = bboxIou(prior.bbox, current.bbox), displacement = centroidDistanceKm(prior.centroid, current.centroid);
  if (ratio !== null && ratio >= 1.02) return { classification: 'NORMAL_PROGRESSION', acceptedForSequence: true, acceptedForLabel: true, reason: 'AREA_INCREASE_WITH_VALID_GEOMETRY', diagnostics: { areaRatio: ratio, bboxIou: overlap, centroidDisplacementKm: displacement } };
  if (ratio !== null && ratio >= 0.8 && ratio < 1.02 && overlap >= 0.75) return { classification: 'GEOMETRY_REFINEMENT', acceptedForSequence: true, acceptedForLabel: true, reason: 'HIGH_OVERLAP_BOUNDED_AREA_CHANGE', diagnostics: { areaRatio: ratio, bboxIou: overlap, centroidDisplacementKm: displacement } };
  if (ratio !== null && ratio < 0.8) return { classification: 'UNKNOWN_CHANGE', acceptedForSequence: true, acceptedForLabel: false, reason: 'LARGE_RETRACTION_REQUIRES_REVIEW', diagnostics: { areaRatio: ratio, bboxIou: overlap, centroidDisplacementKm: displacement } };
  return { classification: 'UNKNOWN_CHANGE', acceptedForSequence: true, acceptedForLabel: false, reason: 'CHANGE_NOT_SAFELY_CLASSIFIED', diagnostics: { areaRatio: ratio, bboxIou: overlap, centroidDisplacementKm: displacement } };
}

export function removedRevision(prior, at) {
  return { ...prior, revisionId: null, clocks: { providerObservedAt: null, providerPublishedAt: null, providerModifiedAt: null, retrievedAt: at, availableToVigiaAt: at, canonicalIngestedAt: at, projectionUpdatedAt: at, chronologyBasis: 'RETRIEVAL_TIME_ONLY' }, removed: true, normalizedGeometryHash: null, geometry: null, geometryQuality: { valid: true, quality: 'REMOVED_BY_PROVIDER' } };
}
