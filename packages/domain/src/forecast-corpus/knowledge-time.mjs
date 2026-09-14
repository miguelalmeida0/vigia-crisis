import { immutable, isoTime, requiredText, semanticHash } from '../intelligence/shared.mjs';
import { ARRIVAL_TIME_BASES } from './constants.mjs';

const optionalTime = (value, code) => value == null ? null : isoTime(value, code);
export function createKnowledgeTimeRecord(value = {}) {
  const arrivalTimeBasis = requiredText(value.arrivalTimeBasis, 'arrival_basis_required');
  if (!ARRIVAL_TIME_BASES.includes(arrivalTimeBasis)) throw new Error('arrival_basis_invalid');
  const availableToVigiaAt = isoTime(value.availableToVigiaAt, 'available_time_required');
  const providerPublishedAt = optionalTime(value.providerPublishedAt, 'provider_publication_time_invalid');
  if (arrivalTimeBasis === 'PROVIDER_PUBLISHED' && providerPublishedAt !== availableToVigiaAt) throw new Error('provider_publication_arrival_mismatch');
  if (arrivalTimeBasis === 'DOCUMENTED_LATENCY_MODEL' && !value.arrivalModelVersion) throw new Error('arrival_model_version_required');
  const core = {
    physicalOccurredAt: optionalTime(value.physicalOccurredAt, 'physical_time_invalid'),
    observedAt: optionalTime(value.observedAt, 'observed_time_invalid'),
    providerPublishedAt,
    providerModifiedAt: optionalTime(value.providerModifiedAt, 'provider_modified_time_invalid'),
    retrievedAt: isoTime(value.retrievedAt, 'retrieval_time_required'), availableToVigiaAt,
    canonicalIngestedAt: isoTime(value.canonicalIngestedAt, 'canonical_ingest_time_required'),
    labelPublishedAt: optionalTime(value.labelPublishedAt, 'label_publication_time_invalid'),
    arrivalTimeBasis, arrivalModelVersion: value.arrivalModelVersion ?? null,
  };
  if (Date.parse(core.retrievedAt) < Date.parse(core.availableToVigiaAt) && arrivalTimeBasis === 'OBSERVED') throw new Error('observed_arrival_after_retrieval');
  return immutable({ ...core, clockHash: semanticHash('knowledge-time-record', core) });
}
export function availableAtCutoff(record, cutoff) {
  return Date.parse(record.availableToVigiaAt) <= Date.parse(isoTime(cutoff));
}
export function assertFeatureAvailable(record, cutoff) {
  if (!availableAtCutoff(record, cutoff)) throw new Error('future_information_not_available');
  if (record.labelPublishedAt && Date.parse(record.labelPublishedAt) <= Date.parse(cutoff)) throw new Error('retrospective_label_in_feature_set');
  return true;
}
