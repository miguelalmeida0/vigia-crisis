import assert from 'node:assert/strict';
import path from 'node:path';
import { OperatorStateRepository } from '../src/modules/interventions/operator-state-repository.mjs';
import { ResponseRecommendationReviewManager } from '../src/modules/response-capability/response-recommendation-review-manager.mjs';

export async function assertDurableRecommendationReview({ directory, response, incidentId, now, refreshProjection }) {
  const statePath = path.join(directory, 'operator-state.json');
  const operatorState = new OperatorStateRepository({ filePath: statePath, clock: () => now });
  await operatorState.initialize();
  const reviewManager = new ResponseRecommendationReviewManager({ repository: operatorState, clock: () => now });
  const reviewable = reviewManager.decorateAndRemember(response);
  const recommendation = reviewable.recommendations.find((item) => item.kind === 'FIRE_RESPONSE_REVIEW');
  const reviewed = await reviewManager.review({
    actor: { id: 'incident-commander:golden' }, incidentId,
    recommendationId: recommendation.recommendationId,
    input: {
      projectionId: reviewable.projectionId,
      recommendationVersion: recommendation.recommendationVersion,
      recommendationHash: recommendation.recommendationHash,
      disposition: 'ACKNOWLEDGED_FOR_REVIEW',
      idempotencyKey: 'golden-response-recommendation-review-1'
    }
  });
  assert.equal(reviewed.receipt.schemaVersion, 'vigia.response-recommendation-review-receipt.v1');
  assert.equal(reviewed.receipt.truthEffect, 'REVIEW_STATE_ONLY');
  assert.equal(reviewed.receipt.projectionId, response.projectionId);
  assert.equal(reviewed.receipt.recommendationHash, recommendation.recommendationHash);
  assert.equal(response.resourceOptimizer.dispatchClaimed, false);

  const reloadedState = new OperatorStateRepository({ filePath: statePath, clock: () => now });
  await reloadedState.initialize();
  assert.equal(reloadedState.snapshot().responseRecommendationReviews[0].recommendationId, recommendation.recommendationId);
  const reloadedManager = new ResponseRecommendationReviewManager({ repository: reloadedState, clock: () => now });
  const reloadedProjection = reloadedManager.decorateAndRemember(response);
  assert.equal(reloadedProjection.recommendationReviews[0].receiptId, reviewed.receipt.receiptId);
  assert.equal(reloadedProjection.recommendationReviews[0].bindingState, 'CURRENT_PROJECTION_EXACT_BINDING');

  const refreshedResponse = refreshProjection('2026-09-04T15:01:00.000Z');
  const refreshedRecommendation = refreshedResponse.recommendations.find((item) => item.kind === 'FIRE_RESPONSE_REVIEW');
  assert.equal(refreshedRecommendation.recommendationId, recommendation.recommendationId);
  assert.equal(refreshedRecommendation.recommendationHash, recommendation.recommendationHash);
  const refreshedWithHistory = reloadedManager.decorateAndRemember(refreshedResponse);
  assert.equal(refreshedWithHistory.recommendationReviews[0].receiptId, reviewed.receipt.receiptId);
  assert.equal(refreshedWithHistory.recommendationReviews[0].bindingState, 'PRIOR_PROJECTION_SAME_SEMANTIC_RECOMMENDATION');

  const changed = structuredClone(refreshedResponse);
  changed.projectionId = `${changed.projectionId}:changed`;
  changed.recommendations.find((item) => item.recommendationId === recommendation.recommendationId).recommendationHash = 'response-recommendation:sha256:changed';
  const superseded = reloadedManager.decorateAndRemember(changed).recommendationReviews;
  assert.equal(superseded.length, 1);
  assert.equal(superseded[0].receiptId, reviewed.receipt.receiptId);
  assert.equal(superseded[0].bindingState, 'SUPERSEDED_BY_CURRENT_RECOMMENDATION_REVIEW_REQUIRED');
  await assert.rejects(() => reviewManager.review({
    actor: { id: 'incident-commander:golden' }, incidentId,
    recommendationId: recommendation.recommendationId,
    input: {
      projectionId: reviewable.projectionId,
      recommendationVersion: recommendation.recommendationVersion,
      recommendationHash: 'sha256:stale-recommendation',
      disposition: 'ACKNOWLEDGED_FOR_REVIEW',
      idempotencyKey: 'golden-response-recommendation-review-stale'
    }
  }), /response_recommendation_hash_mismatch/);
}
