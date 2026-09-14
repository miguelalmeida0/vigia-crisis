import { immutable, semanticHash, stableStringify } from '../../intelligence/shared.mjs';
import { rejectionFromError } from '../rejection.mjs';

export function adaptRecords({ adapter, records = [], receivedAt, context = {} }) {
  const events = [], rejections = [];
  records.forEach((rawPayload, recordIndex) => {
    const base = {
      adapterId: adapter.id, adapterVersion: adapter.version, recordIndex, receivedAt,
      providerEventId: rawPayload?.id ?? rawPayload?.identifier ?? null,
      rawPayload, rawPayloadHash: semanticHash('raw-payload', rawPayload)
    };
    try {
      const byteLength = Buffer.byteLength(stableStringify(rawPayload));
      if (byteLength > Number(adapter.maxPayloadBytes ?? 256 * 1024)) throw Object.assign(new Error('provider_payload_too_large'), { code: 'PAYLOAD_TOO_LARGE', details: [`payload_bytes:${byteLength}`] });
      events.push(adapter.adaptOne(rawPayload, { ...context, receivedAt, recordIndex, rawPayloadHash: base.rawPayloadHash }));
    }
    catch (error) { rejections.push(rejectionFromError(error, base)); }
  });
  return immutable({ schemaVersion: 'vigia.adapter-result.v1', adapter: { id: adapter.id, version: adapter.version }, events, rejections });
}
