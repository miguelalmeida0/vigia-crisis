import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { semanticHash } from '../../../../../packages/domain/src/intelligence/shared.mjs';
import { readJson, writeJsonAtomic } from '../../shared/json-file.mjs';

const safeId = (value) => String(value).replace(/[^a-z0-9._-]+/gi, '_').slice(0, 160);
export class CorpusRunStore {
  constructor({ directory, clock = () => new Date() } = {}) { if (!directory) throw new Error('corpus_run_directory_required'); this.directory = directory; this.clock = clock; }
  file(runId) { return path.join(this.directory, `${safeId(runId)}.json`); }
  async create(manifest) {
    await mkdir(this.directory, { recursive: true });
    const runId = semanticHash('corpus-acquisition-run', manifest.integrity.fingerprint).split(':').at(-1).slice(0, 24), prior = await this.read(runId);
    if (prior) return prior;
    const now = this.clock().toISOString(), state = { schemaVersion: 'vigia.corpus-acquisition-run.v1', runId, manifestFingerprint: manifest.integrity.fingerprint, state: 'PLANNED', createdAt: now, updatedAt: now, cursor: { stage: 'WFIGS', pageOffset: 0 }, completedStages: [], outputs: {}, failures: [], metrics: { requests: 0, downloadedBytes: 0, uniqueStoredBytes: 0, duplicates: 0, objects: 0 } };
    await writeJsonAtomic(this.file(runId), state); return state;
  }
  async read(runId) { const value = await readJson(this.file(runId), null); return value?.runId === runId ? value : null; }
  async update(runId, operation) {
    const prior = await this.read(runId); if (!prior) throw new Error('corpus_run_not_found');
    const next = operation(structuredClone(prior)); next.updatedAt = this.clock().toISOString();
    await writeJsonAtomic(this.file(runId), next); return structuredClone(next);
  }
}
