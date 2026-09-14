import { readFile, rename, stat, writeFile } from 'node:fs/promises';

import {
  acquisitionSegments,
  archivePath,
  archiveReference,
  contextPath,
  evidencePath,
  facilityKind,
  facilityKinds,
  fullQueryHash,
  query,
  root,
  sha256,
  validatePayload,
} from './response-facility-acquisition-config.mjs';
import { acquireResponseFacilityArchive } from './response-facility-acquisition-runner.mjs';
import { readSegmentCache, writeEvidence } from './response-facility-acquisition-store.mjs';

async function sourceRetrievalCompletedAt() {
  const retrievedAt = [];
  for (const segmentIndex of acquisitionSegments.keys()) {
    const cached = await readSegmentCache(segmentIndex);
    if (!cached) return null;
    const timestamp = cached.cache.retrievedAt;
    if (typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp))) {
      throw new Error(`response_facility_segment_retrieval_timestamp_invalid:${segmentIndex}`);
    }
    retrievedAt.push(timestamp);
  }
  return retrievedAt.sort().at(-1) ?? null;
}

const acquisition = await acquireResponseFacilityArchive();
const archiveText = acquisition.archiveText;
const payload = validatePayload(JSON.parse(archiveText), 'response_facility_overpass_payload_invalid');
const counts = Object.fromEntries(facilityKinds.map((facilityType) => [facilityType, 0]));
for (const element of payload.elements) {
  const facilityType = facilityKind(element.tags);
  const longitude = Number(element.lon ?? element.center?.lon);
  const latitude = Number(element.lat ?? element.center?.lat);
  if (facilityType && Number.isFinite(longitude) && Number.isFinite(latitude)) counts[facilityType] += 1;
}

// The archive may be registered again after a governed-context rebuild. Preserve
// the acquisition time proven by the integrity-checked segment caches instead
// of misrepresenting the registration run as a new provider retrieval.
const retrievedAt = await sourceRetrievalCompletedAt() ?? new Date().toISOString();
const archive = {
  purpose: 'RESPONSE_FACILITIES',
  path: archiveReference,
  bytes: (await stat(archivePath)).size,
  sha256: sha256(archiveText),
  queryHash: fullQueryHash,
  query,
  retrievedAt,
  provider: 'OpenStreetMap contributors via Overpass API',
  license: 'ODbL 1.0; attribution required',
  truthBoundary: 'Static mapped context only; no live staffing, capacity, availability, dispatch, authority, or outcome is inferred.',
};
const context = JSON.parse(await readFile(contextPath, 'utf8'));
if (!context?.sources?.openStreetMap || !Array.isArray(context.sources.openStreetMap.archives)) {
  throw new Error('governed_context_openstreetmap_metadata_invalid');
}
const prior = context.sources.openStreetMap.archives.find((entry) => entry.path === archiveReference);
if (prior && prior.sha256 !== archive.sha256) {
  throw new Error('response_facility_archive_registered_checksum_conflict');
}
context.sources.openStreetMap.queries = {
  ...(context.sources.openStreetMap.queries ?? {}),
  responseFacilities: query,
};
context.sources.openStreetMap.responseFacilitiesRetrievedAt = retrievedAt;
context.sources.openStreetMap.archives = prior
  ? context.sources.openStreetMap.archives.map((entry) => entry.path === archiveReference
    ? { ...entry, retrievedAt }
    : entry)
  : [...context.sources.openStreetMap.archives, archive];
context.sources.openStreetMap.featureCounts = {
  ...(context.sources.openStreetMap.featureCounts ?? {}),
  responseFacilitiesByKind: counts,
};
const temporaryPath = `${contextPath}.response-facilities-${process.pid}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(context, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
await rename(temporaryPath, contextPath);

const { GovernedResponseFacilityRepository } = await import('../../apps/api/src/modules/response-capability/governed-facility-repository.mjs');
const repository = new GovernedResponseFacilityRepository({ projectRoot: root });
const repositoryStatus = await repository.initialize();
for (const facilityType of facilityKinds) {
  if (counts[facilityType] <= 0) throw new Error(`response_facility_class_not_present:${facilityType}`);
  if (repositoryStatus.counts?.[facilityType] !== counts[facilityType]) {
    throw new Error(`response_facility_repository_count_mismatch:${facilityType}:${counts[facilityType]}:${repositoryStatus.counts?.[facilityType]}`);
  }
}
if (repositoryStatus.state !== 'READY'
  || repositoryStatus.source?.archivePath !== archiveReference
  || repositoryStatus.source?.archiveSha256 !== archive.sha256
  || repositoryStatus.source?.purpose !== 'RESPONSE_FACILITIES') {
  throw new Error('response_facility_repository_source_validation_failed');
}
const repositoryProjection = repository.nearest([-8.472136, 41.060385], {
  limitPerKind: 1,
  maximumDistanceKm: 250,
});
const sourceCoverage = Object.fromEntries(facilityKinds.map((facilityType) => [facilityType, {
  state: repositoryProjection.sourceCoverage[facilityType]?.state ?? 'UNKNOWN',
  sourceRecordCount: repositoryProjection.sourceCoverage[facilityType]?.sourceRecordCount ?? 0,
  returnedCandidateCount: repositoryProjection.sourceCoverage[facilityType]?.returnedCandidateCount ?? 0,
}]));
if (Object.values(sourceCoverage).some((entry) => entry.state !== 'GOVERNED_ARCHIVE_AVAILABLE')) {
  throw new Error('response_facility_repository_class_coverage_validation_failed');
}
const projectedFacilities = Object.values(repositoryProjection.byKind).flat();
if (projectedFacilities.some((facility) => Object.hasOwn(facility, 'dynamicCapacity'))) {
  throw new Error('response_facility_acquisition_inferred_dynamic_capacity');
}
let priorAcquisitionEvidence = {};
try {
  const candidate = JSON.parse(await readFile(evidencePath, 'utf8'));
  if (candidate.queryHash === fullQueryHash && candidate.archiveSha256 === archive.sha256) {
    priorAcquisitionEvidence = candidate;
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const completionEvidence = {
  ...priorAcquisitionEvidence,
  schemaVersion: 'vigia.response-facility-acquisition-evidence.v3',
  state: 'READY',
  queryHash: fullQueryHash,
  archive: archiveReference,
  archiveSha256: archive.sha256,
  archiveBytes: archive.bytes,
  counts,
  allFacilityClassesPresent: true,
  repositoryValidation: {
    state: repositoryStatus.state,
    source: repositoryStatus.source,
    counts: repositoryStatus.counts,
    sourceCoverage,
    projectedFacilityCount: projectedFacilities.length,
    projectedDynamicCapacityFieldCount: 0,
  },
  existingArchiveReused: acquisition.archiveReused || Boolean(prior),
  truthBoundary: archive.truthBoundary,
  checkedAt: new Date().toISOString(),
};
const immutableCompletionEvidence = await writeEvidence(completionEvidence);
process.stdout.write(`${JSON.stringify({
  state: 'READY',
  archive: prior ?? archive,
  counts,
  allFacilityClassesPresent: Object.values(counts).every((count) => count > 0),
  plannedSegmentCount: acquisitionSegments.length,
  cachedSegmentCount: acquisition.attempts.filter((attempt) => attempt.state === 'CACHE_HIT').length,
  fetchedSegmentCount: acquisition.attempts.filter((attempt) => attempt.state === 'RECEIVED').length,
  existingArchiveReused: acquisition.archiveReused || Boolean(prior),
  repositoryValidation: completionEvidence.repositoryValidation,
  immutableEvidence: immutableCompletionEvidence,
  truthBoundary: archive.truthBoundary,
}, null, 2)}\n`);
