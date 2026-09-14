import { immutable, isoTime, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';
import { policyReference } from './policy/policy-model.mjs';

export const ACQUISITION_REQUEST_STATES = Object.freeze(['ACTIVE', 'BACKOFF', 'COMPLETED', 'CANCELLED', 'SUPERSEDED']);

export function createAcquisitionRequest({ incidentId, need, sourceId, policy, at, actionId, kind = 'EVIDENCE_ACQUISITION', status = 'ACTIVE', retryAt = null, supersedes = [] } = {}) {
  if (!incidentId || !need?.id || !sourceId || !actionId || !ACQUISITION_REQUEST_STATES.includes(status)) throw new Error('invalid_acquisition_request');
  const identity = { incidentId: String(incidentId), needId: need.id, sourceId: String(sourceId), policy: policyReference(policy), kind: String(kind) };
  const id = semanticHash('acquisition-request', identity), updatedAt = isoTime(at, 'acquisition_request_time_required');
  return immutable({ schemaVersion: 'vigia.acquisition-request.v1', ...identity, id, idempotencyKey: id, actionId, status,
    retryAt: retryAt ? isoTime(retryAt, 'invalid_acquisition_retry_time') : null, supersedes: uniqueSorted(supersedes), updatedAt });
}

export function transitionAcquisitionRequest(request, status, { at, actionId, retryAt = null, supersededBy = null } = {}) {
  if (!request?.id || !ACQUISITION_REQUEST_STATES.includes(status)) throw new Error('invalid_acquisition_request_transition');
  return immutable({ ...request, status, actionId: actionId ?? request.actionId, retryAt: retryAt ? isoTime(retryAt, 'invalid_acquisition_retry_time') : null,
    supersededBy: supersededBy ?? request.supersededBy ?? null, updatedAt: isoTime(at, 'acquisition_request_time_required') });
}
