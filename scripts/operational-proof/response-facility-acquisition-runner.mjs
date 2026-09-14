import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  acquisitionSegments,
  archivePath,
  archiveReference,
  baselineArchivePath,
  endpoints,
  facilityKind,
  fullQueryHash,
  paceEndpoint,
  pinnedFetch,
  rawRoot,
  root,
  sha256,
  validatePayload,
} from './response-facility-acquisition-config.mjs';
import {
  readExistingArchive,
  readSegmentCache,
  writeEvidence,
  writeSegmentCache,
} from './response-facility-acquisition-store.mjs';

export async function acquireResponseFacilityArchive() {
  const reusedArchiveText = await readExistingArchive();
  if (reusedArchiveText) {
    return { archiveText: reusedArchiveText, archiveReused: true, attempts: [], segmentEvidence: [] };
  }

  const baselineText = await readFile(baselineArchivePath, 'utf8');
  const baseline = validatePayload(JSON.parse(baselineText), 'response_facility_baseline_archive_invalid');
  const attempts = [];
  const segmentEvidence = [];
  const segments = [];

  for (const [segmentIndex, segment] of acquisitionSegments.entries()) {
    const cached = await readSegmentCache(segmentIndex);
    if (cached) {
      segments.push(cached.cache.payload);
      attempts.push({
        segmentIndex,
        group: segment.group,
        bbox: segment.bbox,
        state: 'CACHE_HIT',
        cache: path.relative(root, cached.cachePath).replaceAll(path.sep, '/'),
        cacheSha256: sha256(cached.cacheText),
        elementCount: cached.cache.payload.elements.length,
        retrievedAt: cached.cache.retrievedAt,
      });
      segmentEvidence.push({
        segmentIndex,
        group: segment.group,
        queryHash: cached.cache.queryHash,
        cache: path.relative(root, cached.cachePath).replaceAll(path.sep, '/'),
        cacheSha256: sha256(cached.cacheText),
        elementCount: cached.cache.payload.elements.length,
      });
      continue;
    }

    let completed = false;
    let lastFailure = 'not_attempted';
    for (const endpoint of endpoints) {
      await paceEndpoint(endpoint);
      const startedAt = new Date().toISOString();
      const startedMs = Date.now();
      try {
        const response = await pinnedFetch(endpoint, {
          method: 'POST',
          body: new URLSearchParams({ data: segment.query }),
          headers: {
            accept: 'application/json',
            'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'user-agent': 'VIGIA-response-facility-acquisition/1.2',
          },
          signal: AbortSignal.timeout(75_000),
        });
        const responseText = await response.text();
        attempts.push({
          segmentIndex,
          group: segment.group,
          bbox: segment.bbox,
          endpoint,
          startedAt,
          durationMs: Date.now() - startedMs,
          status: response.status,
          state: response.ok ? 'RECEIVED' : 'HTTP_ERROR',
        });
        if (!response.ok) {
          lastFailure = `${endpoint}:${response.status}:${responseText.slice(0, 160)}`;
          continue;
        }
        const payload = validatePayload(JSON.parse(responseText), `${endpoint}:invalid_payload`);
        const saved = await writeSegmentCache(segmentIndex, {
          endpoint,
          responseText,
          payload,
          retrievedAt: new Date().toISOString(),
        });
        segments.push(saved.cache.payload);
        segmentEvidence.push({
          segmentIndex,
          group: segment.group,
          queryHash: saved.cache.queryHash,
          cache: path.relative(root, saved.cachePath).replaceAll(path.sep, '/'),
          cacheSha256: sha256(saved.cacheText),
          elementCount: saved.cache.payload.elements.length,
        });
        completed = true;
        break;
      } catch (error) {
        lastFailure = `${endpoint}:${error?.name ?? 'Error'}:${error?.message ?? String(error)}`;
        attempts.push({
          segmentIndex,
          group: segment.group,
          bbox: segment.bbox,
          endpoint,
          startedAt,
          durationMs: Date.now() - startedMs,
          status: null,
          state: 'TRANSPORT_ERROR',
          reason: lastFailure,
        });
      }
    }
    if (!completed) {
      const failure = {
        schemaVersion: 'vigia.response-facility-acquisition-evidence.v2',
        state: 'FAILED',
        queryHash: fullQueryHash,
        baseline: {
          path: path.relative(root, baselineArchivePath),
          sha256: sha256(baselineText),
          elementCount: baseline.elements.length,
        },
        plannedSegmentCount: acquisitionSegments.length,
        completedSegmentCount: segmentEvidence.length,
        segmentEvidence,
        attempts,
        failedSegment: segmentIndex,
        failedGroup: segment.group,
        reason: lastFailure,
        checkedAt: new Date().toISOString(),
      };
      const immutableEvidence = await writeEvidence(failure);
      throw new Error(`response_facility_overpass_failed:${lastFailure}:evidence=${immutableEvidence}`);
    }
  }

  const rawAcquiredElements = segments.flatMap((segment) => segment.elements);
  const retainedAcquiredElements = rawAcquiredElements.filter((element) => facilityKind(element.tags));
  const byIdentity = new Map();
  for (const element of [...baseline.elements, ...retainedAcquiredElements]) {
    byIdentity.set(`${element.type}:${element.id}`, element);
  }
  const combined = `${JSON.stringify({
    version: baseline.version ?? 0.6,
    generator: 'VIGIA governed response-facility acquisition 1.2',
    osm3s: baseline.osm3s ?? null,
    vigiaAcquisition: {
      queryHash: fullQueryHash,
      baselineSha256: sha256(baselineText),
      segmentCount: acquisitionSegments.length,
      segmentQueryHashes: segmentEvidence.map((entry) => entry.queryHash),
      truthBoundary: 'Mapped facility identity and location are static context only. No live staffing, capacity, availability, dispatch, authority, or outcome is inferred.',
    },
    elements: [...byIdentity.values()],
  })}\n`;
  await mkdir(rawRoot, { recursive: true });
  try {
    await writeFile(archivePath, combined, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (await readFile(archivePath, 'utf8') !== combined) {
      throw new Error('response_facility_archive_checksum_conflict');
    }
  }

  const success = {
    schemaVersion: 'vigia.response-facility-acquisition-evidence.v2',
    state: 'READY',
    queryHash: fullQueryHash,
    archive: archiveReference,
    archiveSha256: sha256(combined),
    baseline: {
      path: path.relative(root, baselineArchivePath),
      sha256: sha256(baselineText),
      elementCount: baseline.elements.length,
    },
    plannedSegmentCount: acquisitionSegments.length,
    completedSegmentCount: segmentEvidence.length,
    rawAcquiredElementCount: rawAcquiredElements.length,
    locallyClassifiedElementCount: retainedAcquiredElements.length,
    combinedElementCount: byIdentity.size,
    segmentEvidence,
    attempts,
    checkedAt: new Date().toISOString(),
  };
  success.immutableEvidence = await writeEvidence(success);
  return { archiveText: combined, archiveReused: false, attempts, segmentEvidence };
}
