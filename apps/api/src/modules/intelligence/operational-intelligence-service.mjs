import {
  adaptRecords, createIngestionRejection, createSourceHealthEvent, createSourceRegistry, validateCanonicalOperationalEvent
} from '../../../../../packages/domain/src/event-fabric/index.mjs';
import {
  createOperationalTwinReplay, projectOperationalTwin, twinIncident, verifyOperationalTwinReplay
} from '../../../../../packages/domain/src/operational-twin/index.mjs';
import { immutable, semanticHash } from '../../../../../packages/domain/src/intelligence/shared.mjs';

function instant(value) { return new Date(value).toISOString(); }
function failure(error) { return { state: 'FAILED', code: error?.code ?? 'PROJECTION_FAILED', message: String(error?.message ?? error) }; }

export class OperationalIntelligenceService {
  #journal; #sourceRegistry; #clock; #proofPlane; #adapters = new Map(); #maxObservedMs = -Infinity;
  #currentTwinCache = null; #currentTwinInflight = null;
  #acceptedEventHandler = null;
  #acceptedEventRetryIds = new Set();
  #metrics = { received: 0, accepted: 0, duplicates: 0, rejected: 0, lateEvents: 0, projectionFailures: 0, autopilotCoordinationFailures: 0, intelligenceRecalculations: 0, ambiguousAssociations: 0, sourceStaleTransitions: 0, replayRuns: 0, lastProjectionLatencyMs: null, lastReplayLatencyMs: null, lastSourceLatencyMs: null };
  constructor({ journal, sourceRegistry = createSourceRegistry([]), adapters = [], clock = () => new Date(), proofPlane = null, currentTwinCacheMs = 30_000, onAcceptedEvent = null, currentnessPolicy = {} } = {}) {
    if (!journal) throw new Error('operational_event_journal_required');
    this.#journal = journal; this.#sourceRegistry = sourceRegistry; this.#clock = clock; this.#proofPlane = proofPlane; this.currentTwinCacheMs = Math.max(0, Number(currentTwinCacheMs) || 0);
    this.currentnessPolicy = currentnessPolicy;
    this.setAcceptedEventHandler(onAcceptedEvent);
    for (const adapter of adapters) this.registerAdapter(adapter);
  }
  async initialize() { await this.#journal.initialize(); return this.status(); }
  registerAdapter(adapter) {
    if (!adapter?.id || typeof adapter.adaptOne !== 'function') throw new Error('valid_operational_adapter_required');
    if (this.#adapters.has(adapter.id)) throw new Error(`duplicate_operational_adapter:${adapter.id}`);
    this.#adapters.set(adapter.id, adapter); return this;
  }
  setAcceptedEventHandler(handler) {
    if (handler !== null && typeof handler !== 'function') throw new TypeError('operational_accepted_event_handler_invalid');
    this.#acceptedEventHandler = handler;
    return this;
  }
  async ingestRawProviderPayload(adapterId, rawPayload, options = {}) {
    await this.initialize();
    const adapter = this.#adapters.get(adapterId);
    if (!adapter) throw Object.assign(new Error(`operational_adapter_not_found:${adapterId}`), { code: 'ADAPTER_NOT_FOUND' });
    const receivedAt = instant(options.receivedAt ?? this.#clock()), records = Array.isArray(rawPayload) ? rawPayload : [rawPayload];
    const adapted = adaptRecords({ adapter, records, receivedAt, context: options.context ?? {} }), persistedRejections = [], ingestion = [];
    for (const rejection of adapted.rejections) { persistedRejections.push(await this.#journal.appendRejection(rejection, { recordedAt: receivedAt })); this.#metrics.received += 1; this.#metrics.rejected += 1; }
    for (const event of adapted.events) ingestion.push(await this.#assessAndPersist(event, { ...options, receivedAt }));
    const projection = await this.#safeProjection(options.projectedAt ?? this.#clock());
    return { schemaVersion: 'vigia.operational-ingestion-batch.v1', adapter: adapted.adapter, receivedAt, ingestion, rejections: persistedRejections, projection };
  }
  async ingestOperationalEvent(event, options = {}) {
    await this.initialize();
    const validation = validateCanonicalOperationalEvent(event), at = instant(options.receivedAt ?? this.#clock());
    if (!validation.valid) {
      this.#metrics.received += 1;
      const rejection = createIngestionRejection({
        adapterId: event?.provider?.adapterId ?? 'canonical-boundary', adapterVersion: event?.provider?.adapterVersion ?? 'unknown',
        providerEventId: event?.provider?.providerEventId, receivedAt: at, code: 'INVALID_OPERATIONAL_EVENT', reasons: validation.errors,
        rawPayloadHash: semanticHash('invalid-operational-event', event)
      });
      const persisted = await this.#journal.appendRejection(rejection, { recordedAt: at }); this.#metrics.rejected += 1;
      return { schemaVersion: 'vigia.operational-ingestion-result.v1', state: 'REJECTED', rejection: persisted, projection: null };
    }
    const persisted = await this.#assessAndPersist(event, { ...options, receivedAt: at });
    if (persisted.state === 'QUARANTINED') return { schemaVersion: 'vigia.operational-ingestion-result.v1', ...persisted, projection: null };
    const projection = options.project === false ? null : await this.#safeProjection(options.projectedAt ?? this.#clock());
    return { schemaVersion: 'vigia.operational-ingestion-result.v1', ...persisted, projection };
  }
  async ingestSourceHealth(input, options = {}) {
    const receivedAt = instant(options.receivedAt ?? this.#clock());
    const event = createSourceHealthEvent(input, { receivedAt });
    return this.ingestOperationalEvent(event, { ...options, receivedAt });
  }
  async getCurrentTwin(options = {}) {
    if (Object.prototype.hasOwnProperty.call(options, 'asOf')) return this.getTwinAsOf(options.asOf);
    await this.initialize();
    const version = this.#journal.status().lastSequence, now = Date.now();
    if (this.#currentTwinCache?.version === version && this.#currentTwinCache.expiresAt > now) return this.#currentTwinCache.value;
    if (this.#currentTwinInflight?.version === version) return this.#currentTwinInflight.promise;
    const projectedAt = this.#clock(), promise = this.getTwinAsOf(projectedAt).then((value) => {
      if (this.#journal.status().lastSequence === version) this.#currentTwinCache = { version, expiresAt: Date.now() + this.currentTwinCacheMs, value };
      return value;
    }).finally(() => { if (this.#currentTwinInflight?.promise === promise) this.#currentTwinInflight = null; });
    this.#currentTwinInflight = { version, promise };
    return promise;
  }
  async getTwinAsOf(asOf) {
    await this.initialize(); const recorded = await this.#journal.events(), events = this.#proofPlane ? this.#proofPlane.eventsForProjection(recorded, asOf) : recorded;
    return projectOperationalTwin({ events, sourceRegistry: this.#sourceRegistry, asOf: instant(asOf), currentnessPolicy: this.currentnessPolicy });
  }
  async getIncident(incidentId, options = {}) { return twinIncident(await this.getCurrentTwin(options), incidentId); }
  async getIncidentState(incidentId, options = {}) { return this.getIncident(incidentId, options); }
  async getEvent(eventId) { await this.initialize(); return (await this.#journal.events()).find((event) => event.id === eventId) ?? null; }
  async getOperationalEvents({ asOf = this.#clock() } = {}) {
    await this.initialize(); const maximum = Date.parse(instant(asOf));
    return (await this.#journal.events()).filter((event) => Date.parse(event.clocks.ingestedAt) <= maximum);
  }
  async getIncidentEvents(incidentId, options = {}) {
    const asOf = options.asOf ?? this.#clock(), twin = await this.getTwinAsOf(asOf), ids = new Set(twin.associations.filter((item) => item.incidentId === incidentId).map((item) => item.eventId));
    return (await this.#journal.events()).filter((event) => ids.has(event.id) && Date.parse(event.clocks.ingestedAt) <= Date.parse(asOf));
  }
  async getOperationalTimeline(incidentId, options = {}) { return (await this.getCurrentTwin(options)).transitions.filter((item) => item.incidentId === incidentId || item.entityId === incidentId); }
  async getEvidenceState(incidentId, options = {}) { return (await this.getIncident(incidentId, options))?.evaluation ?? null; }
  async getEvidenceDebt(incidentId, options = {}) { return (await this.getIncident(incidentId, options))?.evidenceDebt ?? []; }
  async getSourceHealth(options = {}) { return (await this.getCurrentTwin(options)).sourceHealth; }
  async retryAcceptedEventHandlers({ limit = 100 } = {}) {
    if (!this.#acceptedEventHandler || !this.#acceptedEventRetryIds.size) return { state: 'IDLE', considered: 0, completed: 0, pending: this.#acceptedEventRetryIds.size };
    await this.initialize();
    const byId = new Map((await this.#journal.events()).map((event) => [event.id, event])), ids = [...this.#acceptedEventRetryIds].sort().slice(0, Math.max(1, Number(limit) || 100));
    let completed = 0;
    for (const eventId of ids) {
      const event = byId.get(eventId);
      if (!event) continue;
      try { await this.#acceptedEventHandler(event); this.#acceptedEventRetryIds.delete(eventId); completed += 1; }
      catch { this.#metrics.autopilotCoordinationFailures += 1; }
    }
    return { state: this.#acceptedEventRetryIds.size ? 'RETRY_PENDING' : 'CAUGHT_UP', considered: ids.length, completed, pending: this.#acceptedEventRetryIds.size };
  }
  async createReplay(asOf = this.#clock()) {
    await this.initialize(); const started = performance.now(), recorded = await this.#journal.events();
    const events = this.#proofPlane ? this.#proofPlane.eventsForProjection(recorded, asOf) : recorded;
    const replay = createOperationalTwinReplay({ events, sourceRegistry: this.#sourceRegistry, asOf: instant(asOf), currentnessPolicy: this.currentnessPolicy });
    this.#metrics.replayRuns += 1; this.#metrics.lastReplayLatencyMs = Number((performance.now() - started).toFixed(3)); return replay;
  }
  async replayIncident(incidentId, asOf = this.#clock()) { const replay = await this.createReplay(asOf); return { replay, incident: twinIncident(replay.twin, incidentId) }; }
  async createTrustedReplay(asOf = this.#clock()) {
    const operational = await this.createReplay(asOf), proof = this.#proofPlane?.createReplay(asOf) ?? null;
    const core = { schemaVersion: 'vigia.trusted-operational-replay.v1', asOf: instant(asOf), operationalReplayHash: operational.replayHash, proofReplayHash: proof?.replayHash ?? null };
    return { ...core, replayHash: semanticHash('trusted-operational-replay', core), operational, proof };
  }
  async createTrustedReplaySummary(asOf = null) {
    await this.initialize(); const twin = asOf === null ? await this.getCurrentTwin() : await this.getTwinAsOf(asOf), projectedAt = twin.asOf;
    const eventManifest = typeof this.#journal.eventManifest === 'function' ? await this.#journal.eventManifest(projectedAt) : null;
    const inputEventIds = eventManifest?.inputEventIds ?? (await this.#journal.events()).filter((event) => Date.parse(event.clocks.ingestedAt) <= Date.parse(projectedAt)).map((event) => event.id).sort();
    const operationalManifest = { schemaVersion: 'vigia.operational-twin-replay.v1', asOf: projectedAt, sourceRegistryFingerprint: this.#sourceRegistry.fingerprint, inputEventIds, projectionHash: twin.projectionHash };
    const operationalReplayHash = semanticHash('operational-twin-replay', operationalManifest), proof = this.#proofPlane?.createReplay(projectedAt) ?? null;
    const core = { schemaVersion: 'vigia.trusted-operational-replay.v1', asOf: projectedAt, operationalReplayHash, proofReplayHash: proof?.replayHash ?? null };
    return immutable({ schemaVersion: 'vigia.trusted-operational-replay-summary.v1', asOf: projectedAt, replayHash: semanticHash('trusted-operational-replay', core), operational: { schemaVersion: operationalManifest.schemaVersion, replayHash: operationalReplayHash, projectionHash: twin.projectionHash, sourceRegistryFingerprint: this.#sourceRegistry.fingerprint, inputEventCount: inputEventIds.length, inputEventIdsHash: semanticHash('operational-replay-input-event-ids', inputEventIds) }, proof: proof ? { schemaVersion: proof.schemaVersion, replayHash: proof.replayHash } : null });
  }
  async verifyReplay(replay) {
    await this.initialize(); const recorded = await this.#journal.events(), events = this.#proofPlane ? this.#proofPlane.eventsForProjection(recorded, replay.asOf) : recorded;
    return verifyOperationalTwinReplay(replay, { events, sourceRegistry: this.#sourceRegistry });
  }
  async verifyTrustedReplay(replay) {
    if (replay?.schemaVersion !== 'vigia.trusted-operational-replay.v1') return { valid: false, reasons: ['TRUSTED_REPLAY_REQUIRED'] };
    const operational = await this.verifyReplay(replay.operational), proof = this.#proofPlane && replay.proof ? this.#proofPlane.verifyReplay(replay.proof) : { valid: replay.proof === null };
    const core = { schemaVersion: replay.schemaVersion, asOf: replay.asOf, operationalReplayHash: replay.operational?.replayHash, proofReplayHash: replay.proof?.replayHash ?? null };
    const reasons = [...(operational.valid ? [] : ['OPERATIONAL_REPLAY_INVALID']), ...(proof.valid ? [] : ['PROOF_REPLAY_INVALID']),
      ...(semanticHash('trusted-operational-replay', core) === replay.replayHash ? [] : ['TRUSTED_REPLAY_HASH_MISMATCH'])];
    return { valid: reasons.length === 0, reasons, operational, proof };
  }
  async rejectionLog() { await this.initialize(); return this.#journal.rejections(); }
  async quarantineLog() { return this.#proofPlane?.quarantineLog() ?? []; }
  status() { return { schemaVersion: 'vigia.operational-intelligence-status.v1', journal: this.#journal.status(), adapters: [...this.#adapters.keys()].sort(), sourceRegistryFingerprint: this.#sourceRegistry.fingerprint,
    proofPlane: this.#proofPlane?.status() ?? null, metrics: { ...this.#metrics, autopilotCoordinationRetriesPending: this.#acceptedEventRetryIds.size } }; }
  async #assessAndPersist(event, options = {}) {
    if (!this.#proofPlane) return this.#persistEvent(event, options.ingestedAt);
    const assessment = this.#proofPlane.assessOperationalEvent(event, { at: options.receivedAt ?? this.#clock(), softSignals: options.softSignals });
    if (assessment.state === 'QUARANTINED') { this.#metrics.received += 1; this.#metrics.rejected += 1; return assessment; }
    const persisted = await this.#persistEvent(assessment.event, options.ingestedAt);
    return { ...persisted, trust: assessment.trust };
  }
  async #persistEvent(event, ingestedAt) {
    this.#metrics.received += 1;
    try {
      const result = await this.#journal.appendEvent(event, { ingestedAt: ingestedAt ?? this.#clock() });
      if (result.state === 'ACCEPTED') {
        this.#metrics.accepted += 1;
        const observedMs = Date.parse(result.event.clocks.observedAt ?? result.event.clocks.occurredAt), receivedMs = Date.parse(result.event.clocks.receivedAt);
        if (Number.isFinite(observedMs) && observedMs < this.#maxObservedMs) this.#metrics.lateEvents += 1;
        if (Number.isFinite(observedMs)) this.#maxObservedMs = Math.max(this.#maxObservedMs, observedMs);
        if (Number.isFinite(observedMs) && Number.isFinite(receivedMs)) this.#metrics.lastSourceLatencyMs = receivedMs - observedMs;
        if (this.#acceptedEventHandler) {
          try { await this.#acceptedEventHandler(result.event); }
          catch { this.#metrics.autopilotCoordinationFailures += 1; this.#acceptedEventRetryIds.add(result.event.id); }
        }
      } else this.#metrics.duplicates += 1;
      return result;
    } catch (error) {
      const at = instant(this.#clock()), rejection = createIngestionRejection({
        adapterId: event?.provider?.adapterId, adapterVersion: event?.provider?.adapterVersion, providerEventId: event?.provider?.providerEventId,
        providerRevision:event?.provider?.providerRevision,receivedAt: at, code: error?.code ?? 'PERSISTENCE_REJECTED', reasons: error?.details ?? [String(error?.message ?? error)], rawPayloadHash: event?.provenance?.rawPayloadHash,conflict:error?.conflict??null
      });
      const persisted = await this.#journal.appendRejection(rejection, { recordedAt: at }); this.#metrics.rejected += 1;
      return { state: 'REJECTED', rejection: persisted };
    }
  }
  async #safeProjection(asOf) {
    const started = performance.now();
    try {
      const version = this.#journal.status().lastSequence, twin = await this.getTwinAsOf(asOf); if (this.#journal.status().lastSequence === version) this.#currentTwinCache = { version, expiresAt: Date.now() + this.currentTwinCacheMs, value: twin }; this.#metrics.intelligenceRecalculations += twin.incidents.length;
      this.#metrics.ambiguousAssociations = twin.failures.filter((item) => item.code === 'AMBIGUOUS_INCIDENT_ASSOCIATION').length;
      this.#metrics.sourceStaleTransitions = twin.transitions.filter((item) => item.entityType === 'SOURCE' && item.to === 'STALE').length;
      this.#metrics.lastProjectionLatencyMs = Number((performance.now() - started).toFixed(3));
      return { state: 'READY', projectionHash: twin.projectionHash, incidentCount: twin.incidents.length, transitionCount: twin.transitions.length };
    }
    catch (error) { this.#metrics.projectionFailures += 1; this.#metrics.lastProjectionLatencyMs = Number((performance.now() - started).toFixed(3)); return failure(error); }
  }
}
