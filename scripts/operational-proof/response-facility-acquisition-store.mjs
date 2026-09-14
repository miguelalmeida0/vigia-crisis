import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  acquisitionSegments,
  archivePath,
  baselineArchivePath,
  collectionRoot,
  digest,
  evidencePath,
  fullQueryHash,
  root,
  runEvidenceRoot,
  segmentCacheRoot,
  sha256,
  validatePayload,
} from './response-facility-acquisition-config.mjs';

function segmentIdentity(segmentIndex) {
  const segment = acquisitionSegments[segmentIndex];
  const queryDigest = digest(segment.query);
  const safeGroup = segment.group.replaceAll(/[^a-z0-9-]/g, '-');
  return {
    segment,
    queryHash: `sha256:${queryDigest}`,
    cachePath: path.join(segmentCacheRoot, `${String(segmentIndex).padStart(2, '0')}-${safeGroup}-${queryDigest.slice(0, 16)}.json`),
  };
}

export async function readSegmentCache(segmentIndex) {
  const identity = segmentIdentity(segmentIndex);
  let cacheText;
  try {
    cacheText = await readFile(identity.cachePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const cache = JSON.parse(cacheText);
  if (cache?.schemaVersion !== 'vigia.response-facility-segment-cache.v1'
    || cache.segmentIndex !== segmentIndex
    || cache.group !== identity.segment.group
    || cache.query !== identity.segment.query
    || cache.queryHash !== identity.queryHash
    || cache.payloadSha256 !== sha256(`${JSON.stringify(cache.payload)}\n`)) {
    throw new Error(`response_facility_segment_cache_integrity_failed:${path.relative(root, identity.cachePath)}`);
  }
  validatePayload(cache.payload, `response_facility_segment_cache_invalid:${segmentIndex}`);
  return { cache, cacheText, cachePath: identity.cachePath };
}

export async function writeSegmentCache(segmentIndex, { endpoint, responseText, payload, retrievedAt }) {
  const identity = segmentIdentity(segmentIndex);
  const canonicalPayload = `${JSON.stringify(payload)}\n`;
  const cache = {
    schemaVersion: 'vigia.response-facility-segment-cache.v1',
    segmentIndex,
    group: identity.segment.group,
    bbox: identity.segment.bbox,
    query: identity.segment.query,
    queryHash: identity.queryHash,
    provider: 'OpenStreetMap contributors via Overpass API',
    license: 'ODbL 1.0; attribution required',
    endpoint,
    retrievedAt,
    sourceResponseSha256: sha256(responseText),
    payloadSha256: sha256(canonicalPayload),
    payload,
  };
  const cacheText = `${JSON.stringify(cache)}\n`;
  await mkdir(segmentCacheRoot, { recursive: true });
  try {
    await writeFile(identity.cachePath, cacheText, { flag: 'wx', mode: 0o600 });
    return { cache, cacheText, cachePath: identity.cachePath };
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = await readSegmentCache(segmentIndex);
    if (existing.cache.payloadSha256 !== cache.payloadSha256) {
      throw new Error(`response_facility_segment_cache_checksum_conflict:${path.relative(root, identity.cachePath)}`);
    }
    return existing;
  }
}

async function preserveEvidence(evidenceText, prefix) {
  await mkdir(runEvidenceRoot, { recursive: true });
  const evidenceDigest = digest(evidenceText);
  const immutablePath = path.join(runEvidenceRoot, `${prefix}-${evidenceDigest.slice(0, 20)}.json`);
  try {
    await writeFile(immutablePath, evidenceText, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (await readFile(immutablePath, 'utf8') !== evidenceText) {
      throw new Error('response_facility_evidence_checksum_conflict');
    }
  }
  return path.relative(root, immutablePath).replaceAll(path.sep, '/');
}

export async function writeEvidence(evidence) {
  await mkdir(collectionRoot, { recursive: true });
  try {
    const priorText = await readFile(evidencePath, 'utf8');
    await preserveEvidence(priorText, 'prior');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const evidenceText = `${JSON.stringify(evidence, null, 2)}\n`;
  const immutablePath = await preserveEvidence(evidenceText, evidence.state.toLowerCase());
  const temporaryPath = `${evidencePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, evidenceText, { flag: 'wx', mode: 0o600 });
  await rename(temporaryPath, evidencePath);
  return immutablePath;
}

export async function readExistingArchive() {
  try {
    const archiveText = await readFile(archivePath, 'utf8');
    const archivePayload = validatePayload(JSON.parse(archiveText), 'response_facility_existing_archive_invalid');
    if (archivePayload.vigiaAcquisition?.queryHash !== fullQueryHash
      || archivePayload.vigiaAcquisition?.baselineSha256 !== sha256(await readFile(baselineArchivePath, 'utf8'))
      || archivePayload.vigiaAcquisition?.segmentCount !== acquisitionSegments.length) {
      throw new Error('response_facility_existing_archive_identity_mismatch');
    }
    return archiveText;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
