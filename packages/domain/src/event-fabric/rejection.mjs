import { immutable, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';

export function createIngestionRejection(input = {}) {
  const observation = {
    schemaVersion: 'vigia.operational-event-rejection.v1', adapterId: String(input.adapterId ?? 'unknown'),
    adapterVersion: String(input.adapterVersion ?? 'unknown'), recordIndex: Number.isInteger(input.recordIndex) ? input.recordIndex : null,
    providerEventId: input.providerEventId ? String(input.providerEventId) : null,
    providerRevision: input.providerRevision == null ? null : String(input.providerRevision),
    receivedAt: new Date(input.receivedAt).toISOString(), code: String(input.code ?? 'VALIDATION_FAILED'),
    reasons: uniqueSorted(input.reasons?.length ? input.reasons : ['unknown_ingestion_failure']),
    rawPayloadHash: String(input.rawPayloadHash ?? semanticHash('raw-payload', input.rawPayload ?? null)), retryable: Boolean(input.retryable),
    conflict: input.conflict ? structuredClone(input.conflict) : null
  };
  const semanticCore = {
    schemaVersion: observation.schemaVersion, adapterId: observation.adapterId, adapterVersion: observation.adapterVersion,
    providerEventId: observation.providerEventId, providerRevision: observation.providerRevision, code: observation.code,
    reasons: observation.reasons, rawPayloadHash: observation.rawPayloadHash, retryable: observation.retryable,
    conflict: observation.conflict
  };
  return immutable({ ...observation, semanticIdentity: semanticHash('ingestion-rejection-semantic-identity', semanticCore), id: semanticHash('ingestion-rejection', semanticCore) });
}

export function rejectionFromError(error, context = {}) {
  return createIngestionRejection({ ...context, code: error?.code ?? 'ADAPTER_ERROR', reasons: error?.details ?? [String(error?.message ?? error)] });
}
