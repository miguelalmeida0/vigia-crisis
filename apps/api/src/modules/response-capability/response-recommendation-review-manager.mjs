import { createResponseRecommendationReview } from '../../../../../packages/domain/src/response-capability/recommendation-review.mjs';

const rows = (value) => Array.isArray(value) ? value : [];
const MAX_DURABLE_REVIEWS = 10_000;

function recommendationReviewBinding(receipt, projection, current) {
  const sameVersion = String(current?.recommendationVersion ?? '') === String(receipt?.recommendationVersion ?? '');
  const sameHash = current?.recommendationHash === receipt?.recommendationHash;
  if (receipt?.projectionId === projection?.projectionId && sameVersion && sameHash) return 'CURRENT_PROJECTION_EXACT_BINDING';
  if (sameVersion && sameHash) return 'PRIOR_PROJECTION_SAME_SEMANTIC_RECOMMENDATION';
  return 'SUPERSEDED_BY_CURRENT_RECOMMENDATION_REVIEW_REQUIRED';
}

export class ResponseRecommendationReviewManager {
  #projections = new Map();

  constructor({ repository = null, clock = () => new Date(), maxProjections = 64 } = {}) {
    this.repository = repository;
    this.clock = clock;
    this.maxProjections = maxProjections;
  }

  decorateAndRemember(projection) {
    const snapshot = this.repository?.snapshotFields?.(['responseRecommendationReviewActions']) ?? this.repository?.snapshot?.() ?? {};
    const currentRecommendations = [...rows(projection.recommendations), ...rows(projection.resourceOptimizer?.recommendedStaging)];
    const currentById = new Map(currentRecommendations.map((item) => [item.recommendationId, item]));
    const actions = rows(snapshot.responseRecommendationReviewActions);
    const receiptsByReview = new Map(actions
      .filter((item) => item?.receipt?.incidentId === projection.incident.id
        && currentById.has(item.receipt.recommendationId))
      .map((item) => [item.receipt.receiptId, item]));
    const actionHistory = [...receiptsByReview.values()].slice(-100).map((item) => ({
      ...item.review,
      receipt: item.receipt,
      receiptId: item.receipt.receiptId,
      bindingState: recommendationReviewBinding(
        item.receipt,
        projection,
        currentById.get(item.receipt.recommendationId)
      )
    }));
    const actionIds = new Set(actions.map((item) => item?.idempotencyKey).filter(Boolean));
    const legacy = rows(snapshot.responseRecommendationReviews)
      .filter((item) => item.incidentId === projection.incident.id
        && !actionIds.has(item.idempotencyKey)
        && currentById.has(item.recommendationId))
      .map((item) => ({
        ...item,
        bindingState: recommendationReviewBinding(item, projection, currentById.get(item.recommendationId))
      }));
    const history = [...legacy, ...actionHistory].slice(-100);
    const decorated = Object.freeze({ ...projection, recommendationReviews: history });
    this.#projections.set(projection.projectionId, decorated);
    while (this.#projections.size > this.maxProjections) this.#projections.delete(this.#projections.keys().next().value);
    return decorated;
  }

  async review({ actor, incidentId, recommendationId, input }) {
    if (!this.repository?.mutate || !this.repository?.snapshot) throw Object.assign(new Error('response_recommendation_review_persistence_unavailable'), { statusCode: 503 });
    const projection = this.#projections.get(String(input?.projectionId));
    if (!projection) throw Object.assign(new Error('response_projection_not_current'), { statusCode: 409 });
    const before = this.repository.snapshot();
    const duplicate = rows(before.responseRecommendationReviewActions).find((item) => item.idempotencyKey === String(input?.idempotencyKey));
    if (duplicate) {
      const same = duplicate.receipt?.incidentId === String(incidentId)
        && duplicate.receipt?.projectionId === input.projectionId
        && duplicate.receipt?.recommendationId === recommendationId
        && duplicate.receipt?.recommendationHash === input.recommendationHash
        && duplicate.receipt?.disposition === String(input.disposition ?? '').toUpperCase();
      if (!same) throw Object.assign(new Error('response_recommendation_review_idempotency_conflict'), { statusCode: 409 });
      return this.#result(duplicate.review, duplicate.receipt, true);
    }
    if (rows(before.responseRecommendationReviewActions).length >= MAX_DURABLE_REVIEWS) {
      throw Object.assign(new Error('response_recommendation_review_ledger_capacity_reached'), { statusCode: 507 });
    }
    const created = createResponseRecommendationReview({
      incidentId, projection, recommendationId, input,
      actorId: actor.id, now: this.clock()
    });
    const action = {
      schemaVersion: 'vigia.response-recommendation-review-action.v1',
      idempotencyKey: created.review.idempotencyKey,
      review: created.review,
      receipt: created.receipt
    };
    await this.repository.mutate((state) => ({
      ...state,
      responseRecommendationReviews: [...rows(state.responseRecommendationReviews), created.review],
      responseRecommendationReviewActions: [...rows(state.responseRecommendationReviewActions), action],
      audit: [...rows(state.audit), {
        type: 'RESPONSE_RECOMMENDATION_REVIEW_RECORDED',
        at: created.review.recordedAt,
        actorId: created.review.actorId,
        incidentId: created.review.incidentId,
        projectionId: created.review.projectionId,
        recommendationId: created.review.recommendationId,
        receiptId: created.receipt.receiptId,
        truthEffect: 'REVIEW_STATE_ONLY'
      }]
    }));
    return this.#result(created.review, created.receipt, false);
  }

  #result(review, receipt, idempotent) {
    return Object.freeze({
      schemaVersion: 'vigia.response-recommendation-review-result.v1',
      state: idempotent ? 'ALREADY_RECORDED' : 'RECORDED',
      idempotent,
      review,
      receipt,
      truthBoundary: receipt.truthBoundary
    });
  }
}
