import { readJson, writeJsonAtomic } from '../../shared/json-file.mjs';

export class GeoIntegrityProofRepository {
  constructor({ filePath, writer = writeJsonAtomic, clock = () => new Date() } = {}) { Object.assign(this, { filePath, writer, clock }); this.proofs = []; this.chain = Promise.resolve(); this.status = { state: 'initializing', lastPersistedAt: null, lastError: null }; }
  async initialize() { const value = await readJson(this.filePath, { proofs: [] }); this.proofs = Array.isArray(value?.proofs) ? value.proofs : []; this.status.state = 'ready'; return this.snapshot(); }
  async record(value) {
    const proof = { ...structuredClone(value), persistedAt: this.clock().toISOString() };
    const operation = this.chain.then(async () => {
      const next = [proof, ...this.proofs.filter((item) => item.key !== proof.key)].slice(0, 2_000);
      try { await this.writer(this.filePath, { version: 1, proofs: next }); this.proofs = next; this.status = { state: 'ready', lastPersistedAt: proof.persistedAt, lastError: null }; return proof; }
      catch (error) { this.status = { ...this.status, state: 'failed', lastError: String(error.message ?? error) }; throw error; }
    });
    this.chain = operation.catch(() => undefined); return operation;
  }
  snapshot() { return { count: this.proofs.length, proofs: structuredClone(this.proofs), persistence: structuredClone(this.status) }; }
}
