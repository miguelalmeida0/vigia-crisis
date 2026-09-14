import { immutable, semanticHash } from '../intelligence/shared.mjs';

export const RESPONSE_RECOMMENDATION_REVIEW_DISPOSITIONS = Object.freeze([
  'ACKNOWLEDGED_FOR_REVIEW', 'DEFERRED', 'DECLINED'
]);

const text = (value, code, max = 240) => {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized.length > max) throw Object.assign(new Error(code), { statusCode: 400 });
  return normalized;
};

export function bindResponseRecommendation(recommendation) {
  const semanticRecommendation = { ...recommendation };
  delete semanticRecommendation.recommendationVersion;
  delete semanticRecommendation.recommendationHash;
  const semanticIdentity = semanticHash('response-recommendation-version', semanticRecommendation);
  const recommendationVersion = Number.parseInt(semanticIdentity.slice(-12), 16);
  const recommendationHash = semanticHash('response-recommendation', { ...semanticRecommendation, recommendationVersion });
  return immutable({ ...recommendation, recommendationVersion, recommendationHash });
}

export function buildResponseProjectionId(projection) {
  return semanticHash('response-capability-projection', {
    schemaVersion: projection.schemaVersion,
    generatedAt: projection.generatedAt,
    incident: projection.incident,
    retrievalCoverage: projection.retrievalCoverage,
    routing: projection.routing,
    optimizerInputs: projection.optimizerInputs,
    resourceOptimizer: projection.resourceOptimizer,
    recommendations: projection.recommendations,
    informationRequirements: projection.informationRequirements
  });
}

export function createResponseRecommendationReview({ incidentId, projection, recommendationId, input, actorId, now }) {
  const projectionId = text(input?.projectionId, 'response_projection_id_required');
  if (projection?.projectionId !== projectionId || projection?.incident?.id !== String(incidentId)) throw Object.assign(new Error('response_projection_binding_mismatch'), { statusCode: 409 });
  const recommendation = projection.recommendations?.find((item) => item.recommendationId === recommendationId)
    ?? projection.resourceOptimizer?.recommendedStaging?.find((item) => item.recommendationId === recommendationId);
  if (!recommendation) throw Object.assign(new Error('response_recommendation_not_found'), { statusCode: 404 });
  const validUntil = Date.parse(recommendation.validUntil ?? '');
  if (!Number.isFinite(validUntil)) throw Object.assign(new Error('response_recommendation_validity_unavailable'), { statusCode: 409 });
  if (validUntil <= Date.parse(now)) throw Object.assign(new Error('response_recommendation_expired'), { statusCode: 409 });
  const recommendationVersion = Number(input?.recommendationVersion);
  if (!Number.isSafeInteger(recommendationVersion) || recommendationVersion !== recommendation.recommendationVersion) throw Object.assign(new Error('response_recommendation_version_mismatch'), { statusCode: 409 });
  const recommendationHash = text(input?.recommendationHash, 'response_recommendation_hash_required');
  if (recommendationHash !== recommendation.recommendationHash) throw Object.assign(new Error('response_recommendation_hash_mismatch'), { statusCode: 409 });
  const disposition = String(input?.disposition ?? '').toUpperCase();
  if (!RESPONSE_RECOMMENDATION_REVIEW_DISPOSITIONS.includes(disposition)) throw Object.assign(new Error('response_recommendation_review_disposition_invalid'), { statusCode: 400 });
  const idempotencyKey = text(input?.idempotencyKey, 'response_recommendation_review_idempotency_key_required', 160);
  const recordedAt = new Date(now).toISOString();
  const review = immutable({
    schemaVersion: 'vigia.response-recommendation-review.v1',
    incidentId: String(incidentId), projectionId, recommendationId,
    recommendationVersion, recommendationHash, disposition,
    note: input?.note == null || input.note === '' ? null : text(input.note, 'response_recommendation_review_note_invalid', 500),
    actorId: text(actorId, 'response_recommendation_review_actor_required', 160),
    recordedAt, idempotencyKey,
    truthEffect: 'REVIEW_STATE_ONLY'
  });
  const receipt = immutable({
    ...review,
    schemaVersion: 'vigia.response-recommendation-review-receipt.v1',
    receiptId: semanticHash('response-recommendation-review-receipt', review).slice(0, 57),
    truthBoundary: 'This receipt proves review acknowledgement or disposition only. It does not dispatch, assign, reserve, authorize, prove arrival, or prove an outcome.'
  });
  return { review, receipt };
}
