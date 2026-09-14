import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readJson, writeJsonAtomic } from '../../shared/json-file.mjs';
import { stableStringify } from '../../../../../packages/domain/src/intelligence/shared.mjs';

export const truthPaths = (root) => {
  const runtime = path.join(root, 'data/runtime/authoritative-truth-network');
  const validation = path.join(root, 'data/validation/authoritative-truth-network');
  return {
    runtime, validation, raw: path.join(runtime, 'raw'), state: path.join(runtime, 'network-state.json'), campaigns: path.join(runtime, 'campaigns'),
    doctor: path.join(validation, 'provider-change-capabilities.json'), status: path.join(validation, 'network-status.json'), revisions: path.join(validation, 'authoritative-perimeter-revisions.json'),
    conflicts: path.join(validation, 'source-conflicts.json'), labels: path.join(validation, 'authoritative-labels.json'), scores: path.join(validation, 'official-forecast-scores.json'),
    latency: path.join(validation, 'truth-latency.json'), consumer: path.join(validation, 'operator-consumer-snapshot.json'), replay: path.join(validation, 'truth-network-replay.json'),
    performance: path.join(validation, 'truth-network-performance.json'), verification: path.join(validation, 'truth-network-verification.json'), demo: path.join(validation, 'authoritative-truth-demo.json'),
    report: path.join(validation, 'authoritative-truth-report.json'), gate: path.join(validation, 'authoritative-truth-gate.json')
  };
};

export const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
export const fingerprint = (kind, value) => `${kind}:${sha256(stableStringify(value))}`;
export function artifact(kind, core) { const stable = structuredClone(core); delete stable.generatedAt; return { ...core, fingerprint: fingerprint(kind, stable) }; }
export async function writeArtifact(file, kind, core) { const value = artifact(kind, core); await writeJsonAtomic(file, value); return value; }
export async function readArtifact(file, fallback = null) { return readJson(file, fallback); }

export function emptyNetworkState({ campaignId, now }) {
  return {
    schemaVersion: 'vigia.authoritative-truth-network-state.v1', campaignId, createdAt: now, updatedAt: now, running: false, shutdownClean: true,
    cursors: {}, providers: {}, providerPublications: [], rawObjects: [], pollObservations: [], revisions: [], revisionAdjudications: [], sequences: {}, conflicts: [], labels: [], forecastScores: [], decisionDeltas: [], internalEvents: [],
    selectedIncidents: [], metrics: { cycles: 0, providerRequests: 0, bytesDownloaded: 0, uniqueBytesStored: 0, rawDuplicates: 0, providerFailures: 0 }, checkpoints: []
  };
}

export async function readNetworkState(root, fallback = null) { return readJson(truthPaths(root).state, fallback); }
export async function writeNetworkState(root, state) {
  const value = { ...state, stateFingerprint: fingerprint('authoritative-truth-network-state', { ...state, updatedAt: undefined, stateFingerprint: undefined, performanceSamples: undefined }) }; state.stateFingerprint = value.stateFingerprint;
  await writeJsonAtomic(truthPaths(root).state, value); return value;
}

export async function persistRawObject(root, { body, providerId, sourceId, requestIdentity, responseMetadata, retrievedAt, authorityClass, rights }) {
  const paths = truthPaths(root), digest = sha256(body), id = `raw:${providerId}:${digest.slice(7)}`, binary = path.join(paths.raw, `${digest.slice(7)}.bin`), metadata = path.join(paths.raw, `${digest.slice(7)}.json`);
  await mkdir(paths.raw, { recursive: true, mode: 0o700 }); let duplicate = false;
  try { await writeFile(binary, body, { flag: 'wx', mode: 0o600 }); } catch (error) { if (error.code !== 'EEXIST') throw error; duplicate = true; }
  const existing = await readJson(metadata, null), core = existing ?? { schemaVersion: 'vigia.authoritative-raw-object.v1', id, providerId, sourceId, sha256: digest, byteLength: body.byteLength, binaryReference: path.relative(root, binary), requestIdentity, responseMetadata, firstRetrievedAt: retrievedAt, authorityClass, rights };
  if (!existing) await writeJsonAtomic(metadata, core); return { ...core, duplicate };
}

export async function rawBytes(root, reference) { return readFile(path.resolve(root, reference)); }
