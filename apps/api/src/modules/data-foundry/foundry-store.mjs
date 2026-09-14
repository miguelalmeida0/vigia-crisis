import { semanticHash } from '../../../../../packages/domain/src/intelligence/shared.mjs';
import { readJson, writeJsonAtomic } from '../../shared/json-file.mjs';

const EMPTY = Object.freeze({ schemaVersion: 'vigia.data-foundry-state.v1', sequence: 0, lastEventHash: null, events: [], tasks: [], blockedProviders: {} });
export class DataFoundryStore {
  constructor({ filePath, clock = () => new Date() } = {}) { if (!filePath) throw new Error('data_foundry_store_path_required'); this.filePath = filePath; this.clock = clock; }
  async read() { const value = await readJson(this.filePath, EMPTY); return structuredClone(value); }
  async write(value) { await writeJsonAtomic(this.filePath, value); return structuredClone(value); }
  async transact(operation) { const prior = await this.read(), next = await operation(structuredClone(prior)); if (!next || next.schemaVersion !== EMPTY.schemaVersion) throw new Error('data_foundry_state_invalid'); return this.write(next); }
  async recordEvent(type, payload = {}, at = this.clock().toISOString()) {
    return this.transact((state) => { const sequence = state.sequence + 1, core = { sequence, type, payload: structuredClone(payload), at: new Date(at).toISOString(), previousHash: state.lastEventHash }, eventHash = semanticHash('data-foundry-event', core), event = { ...core, eventHash }; return { ...state, sequence, lastEventHash: eventHash, events: [...state.events, event] }; });
  }
  async putTask(task) { return this.transact((state) => ({ ...state, tasks: [...state.tasks.filter((item) => item.taskId !== task.taskId), structuredClone(task)].sort((a, b) => a.taskId.localeCompare(b.taskId)) })); }
  async recordBlockedProvider(provider, detail) { return this.transact((state) => ({ ...state, blockedProviders: { ...state.blockedProviders, [provider]: { provider, ...structuredClone(detail) } } })); }
  static verifyEventChain(state) { let prior = null; for (const event of state.events ?? []) { const { eventHash, ...core } = event; if (core.previousHash !== prior || semanticHash('data-foundry-event', core) !== eventHash) return false; prior = eventHash; } return prior === state.lastEventHash; }
}
