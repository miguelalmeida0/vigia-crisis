import { immutable, isoTime, requiredText, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';

const LIMITS = Object.freeze({
  maxIncidents: 100,
  maxDays: 366,
  maxRegionAreaKm2: 2_000_000,
  maxProviderObjects: 1_000,
  maxBytes: 512 * 1024 * 1024,
  maxConcurrency: 4,
  maxRuntimeSeconds: 600,
  maxRetries: 3,
  maxLocalStorageBytes: 2 * 1024 * 1024 * 1024,
});
const positiveInteger = (value, name) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > LIMITS[name]) throw new Error(`corpus_budget_invalid:${name}`);
  return number;
};
function region(value) {
  const bbox = value.bbox?.map(Number);
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(Number.isFinite)) throw new Error('corpus_region_bbox_invalid');
  if (bbox[0] >= bbox[2] || bbox[1] >= bbox[3] || bbox[0] < -180 || bbox[2] > 180 || bbox[1] < -90 || bbox[3] > 90) throw new Error('corpus_region_bbox_invalid');
  return { id: requiredText(value.id, 'corpus_region_id_required'), jurisdiction: requiredText(value.jurisdiction, 'corpus_jurisdiction_required'), bbox, estimatedAreaKm2: positiveInteger(value.estimatedAreaKm2, 'maxRegionAreaKm2') };
}
export function createCorpusAcquisitionManifest(input = {}) {
  const from = isoTime(input.from, 'corpus_from_required'), to = isoTime(input.to, 'corpus_to_required');
  const days = Math.ceil((Date.parse(to) - Date.parse(from)) / 86_400_000);
  if (days < 0 || days > LIMITS.maxDays) throw new Error('corpus_time_window_unbounded');
  const regions = (input.regions ?? []).map(region).sort((a, b) => a.id.localeCompare(b.id));
  if (!regions.length || regions.length > 4) throw new Error('corpus_regions_invalid');
  const providers = uniqueSorted(input.providers);
  if (!providers.length || providers.length > 12) throw new Error('corpus_providers_invalid');
  const budgets = Object.fromEntries(Object.keys(LIMITS).map((name) => [name, positiveInteger(input.budgets?.[name], name)]));
  if (days > budgets.maxDays) throw new Error('corpus_time_window_exceeds_manifest_budget');
  if (regions.some((item) => item.estimatedAreaKm2 > budgets.maxRegionAreaKm2)) throw new Error('corpus_region_exceeds_manifest_budget');
  if ((input.incidentSelectionRules?.incidentIds?.length ?? 0) > budgets.maxIncidents) throw new Error('corpus_incident_selection_exceeds_manifest_budget');
  const core = {
    schemaVersion: 'vigia.forecast-corpus-acquisition-manifest.v1', regions, from, to,
    seasons: uniqueSorted(input.seasons), providers, products: uniqueSorted(input.products),
    incidentSelectionRules: structuredClone(input.incidentSelectionRules ?? {}), budgets,
    storageTarget: requiredText(input.storageTarget, 'corpus_storage_target_required'),
    licences: uniqueSorted(input.licences), expectedOutputs: uniqueSorted(input.expectedOutputs),
    codeVersion: requiredText(input.codeVersion, 'corpus_code_version_required'),
  };
  const fingerprint = semanticHash('forecast-corpus-acquisition-manifest', core);
  return immutable({ ...core, integrity: { method: 'SHA-256', fingerprint } });
}
export function verifyCorpusAcquisitionManifest(value) {
  const recreated = createCorpusAcquisitionManifest(value);
  if (recreated.integrity.fingerprint !== value.integrity?.fingerprint) throw new Error('corpus_manifest_integrity_mismatch');
  return recreated;
}
export const CORPUS_ACQUISITION_LIMITS = LIMITS;
