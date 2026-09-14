import { appendFile, chmod, mkdir, open, readFile, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { commitOperationalEvent, operationalEventBindingHash, validateCanonicalOperationalEvent } from '../../../../../packages/domain/src/event-fabric/index.mjs';
import { immutable, semanticHash, stableStringify } from '../../../../../packages/domain/src/intelligence/shared.mjs';

const RECORD_SCHEMA = 'vigia.operational-event-journal-record.v1';
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
function checksum(record) { const { checksumSha256, ...core } = record; return semanticHash('journal-record', core); }
function providerKey(event) { return [event.provider.adapterId, event.provider.providerEventId, event.provider.providerRevision ?? '', event.action, event.targetEventId ?? ''].join('|'); }
function parseJournal(body) {
  const records = [], diagnostics = [];
  for (const [index, line] of body.split('\n').entries()) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      if (record.schemaVersion !== RECORD_SCHEMA || record.checksumSha256 !== checksum(record)) diagnostics.push({ line: index + 1, code: 'JOURNAL_CHECKSUM_OR_SCHEMA_INVALID' });
      else records.push(record);
    } catch { diagnostics.push({ line: index + 1, code: index === body.split('\n').length - 1 ? 'TORN_FINAL_RECORD' : 'INVALID_JOURNAL_RECORD' }); }
  }
  records.sort((left, right) => left.sequence - right.sequence);
  return { records, diagnostics };
}

export class AppendOnlyOperationalEventJournal {
  #filePath; #lockPath; #clock; #chain = Promise.resolve(); #records = []; #diagnostics = []; #initialized = false; #knownSize = 0; #eventById = new Map(); #eventByProviderKey = new Map(); #rejectionById = new Map();
  constructor({ filePath, clock = () => new Date(), lockTimeoutMs = 5_000, staleLockMs = 30_000 } = {}) {
    if (!filePath) throw new Error('operational_event_journal_path_required');
    this.#filePath = filePath; this.#lockPath = `${filePath}.lock`; this.#clock = clock;
    this.lockTimeoutMs = lockTimeoutMs; this.staleLockMs = staleLockMs;
  }
  async initialize() {
    if (this.#initialized) return this.status();
    await mkdir(path.dirname(this.#filePath), { recursive: true, mode: 0o700 }); await chmod(path.dirname(this.#filePath), 0o700);
    const handle = await open(this.#filePath, 'a', 0o600); await handle.close(); await chmod(this.#filePath, 0o600);
    await this.#reload(); this.#initialized = true; return this.status();
  }
  status() {
    return immutable({
      schemaVersion: 'vigia.operational-event-journal-status.v1', state: this.#initialized ? 'READY' : 'INITIALIZING',
      recordCount: this.#records.length, eventCount: this.#records.filter((item) => item.kind === 'EVENT').length,
      rejectionCount: this.#records.filter((item) => item.kind === 'REJECTION').length,
      lastSequence: this.#records.at(-1)?.sequence ?? 0, diagnostics: this.#diagnostics
    });
  }
  async appendEvent(event, { ingestedAt = this.#clock() } = {}) {
    return this.#enqueue(async () => this.#withLock(async () => {
      await this.#refresh();
      const validation = validateCanonicalOperationalEvent(event);
      if (!validation.valid) throw Object.assign(new Error(`invalid_operational_event:${validation.errors.join('|')}`), { code: 'INVALID_OPERATIONAL_EVENT', details: validation.errors });
      const duplicate = this.#eventById.get(event.id);
      if (duplicate) {
        const acceptedBindingHash=operationalEventBindingHash(duplicate.value),attemptedBindingHash=operationalEventBindingHash(event);
        if (acceptedBindingHash !== attemptedBindingHash) throw Object.assign(new Error('operational_event_identity_conflict'), { code: 'EVENT_IDENTITY_CONFLICT', details:[duplicate.value.id,acceptedBindingHash,attemptedBindingHash],conflict:{acceptedEventId:duplicate.value.id,acceptedBindingHash,attemptedEventId:event.id,attemptedBindingHash} });
        return immutable({ state: 'DUPLICATE', event: duplicate.value, sequence: duplicate.sequence, persisted: true });
      }
      const providerConflict = this.#eventByProviderKey.get(providerKey(event));
      if (providerConflict) {
        const acceptedBindingHash=operationalEventBindingHash(providerConflict.value),attemptedBindingHash=operationalEventBindingHash(event);
        throw Object.assign(new Error('provider_event_identity_conflict'), { code: 'PROVIDER_EVENT_IDENTITY_CONFLICT', details: [providerConflict.value.id,event.id,acceptedBindingHash,attemptedBindingHash],conflict:{acceptedEventId:providerConflict.value.id,acceptedBindingHash,attemptedEventId:event.id,attemptedBindingHash} });
      }
      const committed = commitOperationalEvent(event, ingestedAt), record = this.#record('EVENT', committed, ingestedAt);
      await this.#append(record); this.#records.push(record); this.#eventById.set(committed.id, record); this.#eventByProviderKey.set(providerKey(committed), record);
      return immutable({ state: 'ACCEPTED', event: committed, sequence: record.sequence, persisted: true });
    }));
  }
  async appendRejection(rejection, { recordedAt = this.#clock() } = {}) {
    return this.#enqueue(async () => this.#withLock(async () => {
      await this.#refresh();
      const duplicate = this.#rejectionById.get(rejection.id);
      if (duplicate) return immutable({ state: 'DUPLICATE_REJECTION', rejection: duplicate.value, sequence: duplicate.sequence, persisted: true });
      const record = this.#record('REJECTION', rejection, recordedAt); await this.#append(record); this.#records.push(record); this.#rejectionById.set(rejection.id, record);
      return immutable({ state: 'REJECTED', rejection, sequence: record.sequence, persisted: true });
    }));
  }
  async records() { await this.initialize(); return immutable(this.#records); }
  async events() { await this.initialize(); return immutable(this.#records.filter((item) => item.kind === 'EVENT').map((item) => ({ ...item.value, journalSequence: item.sequence }))); }
  async eventManifest(asOf = this.#clock()) {
    await this.initialize(); await this.#refresh(); const projectedAt = new Date(asOf).toISOString(), maximum = Date.parse(projectedAt);
    const inputEventIds = this.#records.filter((item) => item.kind === 'EVENT' && Date.parse(item.value?.clocks?.ingestedAt) <= maximum).map((item) => item.value.id).sort();
    return immutable({ schemaVersion: 'vigia.operational-event-manifest.v1', asOf: projectedAt, inputEventIds, eventCount: inputEventIds.length, lastSequence: this.#records.at(-1)?.sequence ?? 0 });
  }
  async rejections() { await this.initialize(); return immutable(this.#records.filter((item) => item.kind === 'REJECTION').map((item) => ({ ...item.value, journalSequence: item.sequence }))); }
  #record(kind, value, at) {
    const record = { schemaVersion: RECORD_SCHEMA, sequence: (this.#records.at(-1)?.sequence ?? 0) + 1, kind, recordedAt: new Date(at).toISOString(), value: structuredClone(value) };
    return { ...record, checksumSha256: checksum(record) };
  }
  async #append(record) {
    const line = `${stableStringify(record)}\n`, handle = await open(this.#filePath, 'a', 0o600);
    try { await handle.write(line, null, 'utf8'); await handle.sync(); this.#knownSize += Buffer.byteLength(line); } finally { await handle.close(); }
  }
  async #reload() {
    let body = '';
    try { body = await readFile(this.#filePath, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (body && !body.endsWith('\n')) { await appendFile(this.#filePath, '\n', { encoding: 'utf8', mode: 0o600 }); body += '\n'; }
    const parsed = parseJournal(body); this.#records = parsed.records; this.#diagnostics = parsed.diagnostics; this.#knownSize = Buffer.byteLength(body);
    this.#eventById = new Map(this.#records.filter((item) => item.kind === 'EVENT').map((item) => [item.value.id, item]));
    this.#eventByProviderKey = new Map(this.#records.filter((item) => item.kind === 'EVENT').map((item) => [providerKey(item.value), item]));
    this.#rejectionById = new Map(this.#records.filter((item) => item.kind === 'REJECTION').map((item) => [item.value.id, item]));
  }
  async #refresh() { if ((await stat(this.#filePath)).size !== this.#knownSize) await this.#reload(); }
  async #withLock(operation) {
    const startedAt = Date.now(); let handle;
    while (!handle) {
      try { handle = await open(this.#lockPath, 'wx', 0o600); await handle.writeFile(JSON.stringify({ pid: process.pid, at: this.#clock().toISOString() })); }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        try { if (Date.now() - (await stat(this.#lockPath)).mtimeMs > this.staleLockMs) await unlink(this.#lockPath); } catch (nested) { if (nested.code !== 'ENOENT') throw nested; }
        if (Date.now() - startedAt >= this.lockTimeoutMs) throw Object.assign(new Error('operational_event_journal_lock_timeout'), { code: 'JOURNAL_LOCK_TIMEOUT' });
        await wait(5);
      }
    }
    try { return await operation(); } finally { await handle.close(); try { await unlink(this.#lockPath); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
  }
  #enqueue(operation) { const result = this.#chain.then(operation); this.#chain = result.catch(() => undefined); return result; }
}
