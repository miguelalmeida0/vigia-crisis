import { open, stat, unlink } from 'node:fs/promises';
import { semanticHash } from '../../../../../packages/domain/src/intelligence/shared.mjs';
import { readJson, writeJsonAtomic } from '../../shared/json-file.mjs';

const EMPTY = Object.freeze({ schemaVersion: 'vigia.intelligence-repository.v1', version: 0, events: [], objects: [], lineage: [], packets: [], receipts: [], archive: [], decisionOutcomes: [], informationValueOutcomes: [] });
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const ordered = (rows, key) => [...rows].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
const same = (left, right) => left === right;
const hash = (kind, payload) => semanticHash(kind, payload);

function cursor(value) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
function decodeCursor(value) { try { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); } catch { throw new Error('intelligence_cursor_invalid'); } }

export class FileIntelligenceRepository {
  constructor({ filePath, clock = () => new Date(), lockTimeoutMs = 5_000, staleLockMs = 30_000 } = {}) {
    if (!filePath) throw new Error('intelligence_repository_path_required');
    this.filePath = filePath; this.lockPath = `${filePath}.lock`; this.clock = clock; this.lockTimeoutMs = lockTimeoutMs; this.staleLockMs = staleLockMs;
  }
  async initialize() { const state = await readJson(this.filePath, null); if (!state) await writeJsonAtomic(this.filePath, EMPTY); return this.status(); }
  async status() { const state = await this.readSnapshot(); return { adapter: 'FILE', state: 'READY', version: state.version, events: state.events.length, objects: state.objects.length }; }
  async readSnapshot() { const state = await readJson(this.filePath, EMPTY); if (state.schemaVersion !== EMPTY.schemaVersion) throw new Error('intelligence_repository_schema_invalid'); return structuredClone(state); }
  async transact(operation, { expectedVersion = null } = {}) {
    return this.#withLock(async () => {
      const prior = await this.readSnapshot();
      if (expectedVersion !== null && prior.version !== expectedVersion) throw Object.assign(new Error('intelligence_optimistic_conflict'), { code: 'OPTIMISTIC_CONFLICT' });
      const next = await operation(structuredClone(prior));
      if (!next || next.schemaVersion !== EMPTY.schemaVersion) throw new Error('intelligence_repository_state_invalid');
      next.version = prior.version + 1; await writeJsonAtomic(this.filePath, next); return structuredClone(next);
    });
  }
  async appendEvent(event) {
    if (!event?.id || !event.semanticIdentity || !event.type) throw new Error('intelligence_event_invalid');
    let outcome;
    await this.transact((state) => {
      const payloadHash = hash('intelligence-event-payload', event.payload ?? {}), prior = state.events.find((item) => item.id === event.id || item.semanticIdentity === event.semanticIdentity);
      if (prior) { if (!same(prior.payloadHash, payloadHash)) throw new Error('intelligence_event_identity_conflict'); outcome = { state: 'DUPLICATE', event: prior }; return state; }
      const row = { id: event.id, semanticIdentity: event.semanticIdentity, incidentId: event.incidentId ?? null, type: event.type, effectiveAt: new Date(event.effectiveAt).toISOString(), receivedAt: new Date(event.receivedAt).toISOString(), payload: structuredClone(event.payload ?? {}), payloadHash, rights: structuredClone(event.rights ?? {}), sequence: state.events.length + 1 };
      state.events.push(row); outcome = { state: 'ACCEPTED', event: row }; return state;
    });
    return structuredClone(outcome);
  }
  async putObject(kind, objectId, payload, options = {}) {
    if (!kind || !objectId || !payload?.schemaVersion) throw new Error('intelligence_object_invalid');
    let outcome;
    await this.transact((state) => { outcome = this.#putObjectState(state, kind, objectId, payload, options); return state; });
    return structuredClone(outcome);
  }
  async getObject(kind, objectId, { projectionVersion = null } = {}) { const state = await this.readSnapshot(); this.#assertVersion(state, projectionVersion); return structuredClone(state.objects.find((item) => item.kind === kind && item.objectId === objectId) ?? null); }
  async listObjects({ kind = null, incidentId = null, limit = 100, cursor: after = null, projectionVersion = null, rightsFilter = null } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error('intelligence_query_limit_invalid');
    const state = await this.readSnapshot(); this.#assertVersion(state, projectionVersion); const decoded = after ? decodeCursor(after) : null;
    if (decoded && decoded.version !== state.version) throw Object.assign(new Error('intelligence_cursor_projection_mismatch'), { code: 'CONSISTENCY_TOKEN_MISMATCH', currentVersion: state.version });
    let rows = state.objects.filter((item) => (!kind || item.kind === kind) && (!incidentId || item.incidentId === incidentId) && (!rightsFilter || rightsFilter(item.rights)));
    rows = rows.sort((a, b) => `${a.kind}\0${a.objectId}`.localeCompare(`${b.kind}\0${b.objectId}`));
    if (decoded) rows = rows.filter((item) => `${item.kind}\0${item.objectId}` > decoded.key);
    const page = rows.slice(0, limit), last = page.at(-1), nextCursor = rows.length > limit && last ? cursor({ key: `${last.kind}\0${last.objectId}`, version: state.version }) : null;
    return { schemaVersion: 'vigia.intelligence-object-page.v1', projectionVersion: state.version, consistencyToken: `projection:${state.version}`, results: structuredClone(page), nextCursor, partial: false };
  }
  async linkLineage(edge) { return this.transact((state) => { const exists = (kind, id) => state.objects.some((item) => item.kind === kind && item.objectId === id); if (!exists(edge.parentKind, edge.parentId) || !exists(edge.childKind, edge.childId)) throw new Error('intelligence_lineage_foreign_key'); const identity = [edge.parentKind, edge.parentId, edge.childKind, edge.childId, edge.relationship].join('|'); if (!state.lineage.some((item) => item.identity === identity)) state.lineage.push({ ...structuredClone(edge), identity }); return state; }); }
  async persistDecisionPacket(packet, options = {}) { let result; await this.transact((state) => { result = this.#putObjectState(state, 'DECISION_PACKET', packet.replayFingerprint, packet, { ...options, incidentId: packet.incident.id, knowledgeTime: packet.knowledgeTime, semanticIdentity: packet.replayFingerprint }); return state; }); return result.object; }
  async persistReceipt(receipt, options = {}) { let result; await this.transact((state) => { result = this.#putObjectState(state, 'RECEIPT', receipt.id, receipt, { ...options, incidentId: receipt.incidentId }); return state; }); return result.object; }
  async persistArchiveSnapshot(snapshot, options = {}) {
    let result; await this.transact((state) => {
      if (snapshot.previousSnapshotFingerprint && !state.objects.some((item) => item.kind === 'PROSPECTIVE_ARCHIVE_SNAPSHOT' && item.objectId === snapshot.previousSnapshotFingerprint)) throw new Error('prospective_archive_previous_snapshot_foreign_key');
      const archive = state.objects.filter((item) => item.kind === 'PROSPECTIVE_ARCHIVE_SNAPSHOT'), sequenceOwner = archive.find((item) => item.payload.manifestId === snapshot.manifestId && item.payload.sequence === snapshot.sequence && item.objectId !== snapshot.fingerprint), rawOwner = archive.find((item) => item.payload.manifestId === snapshot.manifestId && item.payload.providerId === snapshot.providerId && item.payload.productId === snapshot.productId && item.payload.rawObjectHash === snapshot.rawObjectHash && item.objectId !== snapshot.fingerprint);
      if (sequenceOwner) throw new Error('prospective_archive_sequence_conflict'); if (rawOwner) throw new Error('prospective_archive_raw_identity_conflict');
      result = this.#putObjectState(state, 'PROSPECTIVE_ARCHIVE_SNAPSHOT', snapshot.fingerprint, snapshot, { ...options, incidentId: snapshot.incidentId, knowledgeTime: snapshot.vigiaReceivedAt, semanticIdentity: snapshot.fingerprint }); return state;
    }); return result.object;
  }
  async persistDecisionOutcome(outcome, options = {}) { let result; await this.transact((state) => { if (!state.objects.some((item) => item.kind === 'DECISION_PACKET' && item.objectId === outcome.packetFingerprint)) throw new Error('decision_outcome_packet_foreign_key'); result = this.#putObjectState(state, 'DECISION_OUTCOME', outcome.id, outcome, { ...options, incidentId: outcome.incidentId, knowledgeTime: outcome.adjudicatedAt ?? outcome.decisionTime }); return state; }); return result.object; }
  async persistInformationValueOutcome(outcome, options = {}) { let result; await this.transact((state) => { const prior = state.objects.find((item) => item.kind === 'INFORMATION_VALUE_OUTCOME' && item.payload.acquisitionId === outcome.acquisitionId && item.objectId !== outcome.id); if (prior) throw new Error('information_value_acquisition_conflict'); result = this.#putObjectState(state, 'INFORMATION_VALUE_OUTCOME', outcome.id, outcome, { ...options, incidentId: outcome.incidentId }); return state; }); return result.object; }
  async semanticSnapshot() { const state = await this.readSnapshot(); return { version: state.version, events: ordered(state.events, 'id'), objects: state.objects.sort((a, b) => `${a.kind}:${a.objectId}`.localeCompare(`${b.kind}:${b.objectId}`)).map(({ updatedAt, projectionVersion, ...item }) => item), lineage: ordered(state.lineage, 'identity') }; }
  #putObjectState(state, kind, objectId, payload, options = {}) {
    const prior = state.objects.find((item) => item.kind === kind && item.objectId === objectId), payloadHash = hash('intelligence-object-payload', payload), semanticIdentity = options.semanticIdentity ?? `${kind}:${objectId}`, identityOwner = state.objects.find((item) => item.semanticIdentity === semanticIdentity && (item.kind !== kind || item.objectId !== objectId));
    if (identityOwner) throw new Error('intelligence_object_semantic_identity_conflict');
    if (prior && prior.payloadHash === payloadHash) return { state: 'DUPLICATE', object: prior };
    if (options.expectedRevision !== undefined && (prior?.revision ?? 0) !== options.expectedRevision) throw Object.assign(new Error('intelligence_object_revision_conflict'), { code: 'OPTIMISTIC_CONFLICT' });
    const row = { kind, objectId, incidentId: options.incidentId ?? prior?.incidentId ?? null, schemaVersion: payload.schemaVersion, semanticIdentity, revision: (prior?.revision ?? 0) + 1, knowledgeTime: options.knowledgeTime ?? null, projectionVersion: state.version + 1, payload: structuredClone(payload), payloadHash, rights: structuredClone(options.rights ?? prior?.rights ?? {}), updatedAt: this.clock().toISOString() };
    state.objects = [...state.objects.filter((item) => item.kind !== kind || item.objectId !== objectId), row]; return { state: prior ? 'UPDATED' : 'CREATED', object: row };
  }
  #assertVersion(state, requested) { if (requested !== null && Number(requested) !== state.version) throw Object.assign(new Error('intelligence_consistency_token_mismatch'), { code: 'CONSISTENCY_TOKEN_MISMATCH', currentVersion: state.version }); }
  async #withLock(operation) {
    const started = Date.now(); let handle;
    while (!handle) {
      try { handle = await open(this.lockPath, 'wx', 0o600); }
      catch (error) { if (error.code !== 'EEXIST') throw error; try { if (Date.now() - (await stat(this.lockPath)).mtimeMs > this.staleLockMs) await unlink(this.lockPath); } catch (nested) { if (nested.code !== 'ENOENT') throw nested; } if (Date.now() - started >= this.lockTimeoutMs) throw new Error('intelligence_repository_lock_timeout'); await wait(5); }
    }
    try { return await operation(); } finally { await handle.close(); await unlink(this.lockPath).catch((error) => { if (error.code !== 'ENOENT') throw error; }); }
  }
}
