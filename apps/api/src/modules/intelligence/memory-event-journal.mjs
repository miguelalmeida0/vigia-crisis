import { commitOperationalEvent, operationalEventBindingHash } from '../../../../../packages/domain/src/event-fabric/index.mjs';
import { immutable } from '../../../../../packages/domain/src/intelligence/shared.mjs';

export class MemoryOperationalEventJournal {
  #clock; #records = []; #chain = Promise.resolve(); #eventById = new Map(); #eventByProviderKey = new Map(); #rejectionById = new Map();
  constructor({ clock = () => new Date() } = {}) { this.#clock = clock; }
  async initialize() { return this.status(); }
  status() { return immutable({ state: 'READY', recordCount: this.#records.length, eventCount: this.#records.filter((item) => item.kind === 'EVENT').length, rejectionCount: this.#records.filter((item) => item.kind === 'REJECTION').length, lastSequence: this.#records.length, diagnostics: [] }); }
  async appendEvent(event, { ingestedAt = this.#clock() } = {}) { return this.#enqueue(() => {
    const prior = this.#eventById.get(event.id);
    if (prior) {
      const acceptedBindingHash=operationalEventBindingHash(prior.value),attemptedBindingHash=operationalEventBindingHash(event);
      if (acceptedBindingHash !== attemptedBindingHash) throw Object.assign(new Error('operational_event_identity_conflict'), { code: 'EVENT_IDENTITY_CONFLICT', details:[prior.value.id,acceptedBindingHash,attemptedBindingHash],conflict:{acceptedEventId:prior.value.id,acceptedBindingHash,attemptedEventId:event.id,attemptedBindingHash} });
      return immutable({ state: 'DUPLICATE', event: prior.value, sequence: prior.sequence, persisted: true });
    }
    const key = [event.provider.adapterId, event.provider.providerEventId, event.provider.providerRevision ?? '', event.action, event.targetEventId ?? ''].join('|'), conflict = this.#eventByProviderKey.get(key);
    if (conflict) {
      const acceptedBindingHash=operationalEventBindingHash(conflict.value),attemptedBindingHash=operationalEventBindingHash(event);
      throw Object.assign(new Error('provider_event_identity_conflict'), { code: 'PROVIDER_EVENT_IDENTITY_CONFLICT', details:[conflict.value.id,event.id,acceptedBindingHash,attemptedBindingHash],conflict:{acceptedEventId:conflict.value.id,acceptedBindingHash,attemptedEventId:event.id,attemptedBindingHash} });
    }
    const committed = commitOperationalEvent(event, ingestedAt), sequence = this.#records.length + 1;
    const record = { sequence, kind: 'EVENT', recordedAt: new Date(ingestedAt).toISOString(), value: committed }; this.#records.push(record); this.#eventById.set(committed.id, record); this.#eventByProviderKey.set(key, record);
    return immutable({ state: 'ACCEPTED', event: committed, sequence, persisted: true });
  }); }
  async appendRejection(rejection, { recordedAt = this.#clock() } = {}) { return this.#enqueue(() => {
    const prior = this.#rejectionById.get(rejection.id);
    if (prior) return immutable({ state: 'DUPLICATE_REJECTION', rejection: prior.value, sequence: prior.sequence, persisted: true });
    const sequence = this.#records.length + 1, record = { sequence, kind: 'REJECTION', recordedAt: new Date(recordedAt).toISOString(), value: rejection }; this.#records.push(record); this.#rejectionById.set(rejection.id, record);
    return immutable({ state: 'REJECTED', rejection, sequence, persisted: true });
  }); }
  async records() { return immutable(this.#records); }
  async events() { return immutable(this.#records.filter((item) => item.kind === 'EVENT').map((item) => ({ ...item.value, journalSequence: item.sequence }))); }
  async eventManifest(asOf = this.#clock()) { const projectedAt = new Date(asOf).toISOString(), maximum = Date.parse(projectedAt), inputEventIds = this.#records.filter((item) => item.kind === 'EVENT' && Date.parse(item.value?.clocks?.ingestedAt) <= maximum).map((item) => item.value.id).sort(); return immutable({ schemaVersion: 'vigia.operational-event-manifest.v1', asOf: projectedAt, inputEventIds, eventCount: inputEventIds.length, lastSequence: this.#records.length }); }
  async rejections() { return immutable(this.#records.filter((item) => item.kind === 'REJECTION').map((item) => ({ ...item.value, journalSequence: item.sequence }))); }
  #enqueue(operation) { const result = this.#chain.then(operation); this.#chain = result.catch(() => undefined); return result; }
}
