import { createHash } from 'node:crypto';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

export function checksumEvidence(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

export function createEvidenceEnvelope(input) {
  const capturedAt = String(input?.capturedAt ?? '');
  const capturedMs = Date.parse(capturedAt);
  if (!input?.id || !input?.requestId || !input?.observerId || !Number.isFinite(capturedMs)) throw new Error('invalid_evidence_envelope');
  const evidence = {
    id: String(input.id),
    requestId: String(input.requestId),
    observerId: String(input.observerId),
    observerRole: String(input.observerRole ?? 'field_inspector'),
    capturedAt,
    receivedAt: String(input.receivedAt ?? capturedAt),
    coordinate: input.coordinate ?? null,
    accuracyMeters: Number.isFinite(Number(input.accuracyMeters)) ? Number(input.accuracyMeters) : null,
    evidenceType: String(input.evidenceType ?? 'field_observation'),
    note: String(input.note ?? '').slice(0, 2000),
    attachments: (input.attachments ?? []).map((item) => ({
      id: String(item.id ?? ''), type: String(item.type ?? 'image'), name: String(item.name ?? 'evidence'), url: String(item.url ?? ''), size: Number(item.size ?? 0)
    })).slice(0, 12),
    observations: (input.observations ?? []).map(String).slice(0, 20),
    provenance: {
      device: String(input.provenance?.device ?? 'unknown'),
      clientVersion: String(input.provenance?.clientVersion ?? '4.0.0'),
      offlineCaptured: Boolean(input.provenance?.offlineCaptured),
      source: String(input.provenance?.source ?? 'field-capture'),
      locationSource: String(input.provenance?.locationSource ?? 'unknown')
    }
  };
  return { ...evidence, checksum: checksumEvidence(evidence), state: 'submitted', review: null };
}
