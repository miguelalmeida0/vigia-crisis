export function responseReviewFixture(receiptId) {
  return {
    workflowId: "recommendation:test",
    action: "REVIEW_RESPONSE_RECOMMENDATION",
    receipt: {
      schemaVersion: "vigia.response-recommendation-review-receipt.v1",
      incidentId: "incident:test",
      projectionId: "projection:test",
      recommendationId: "recommendation:test",
      recommendationVersion: 3,
      recommendationHash: "sha256:recommendation-test",
      disposition: "DEFERRED",
      truthEffect: "REVIEW_STATE_ONLY",
    },
    afterState: {
      scope: "RESPONSE_RECOMMENDATION_REVIEW",
      selectedIncidentId: "incident:test",
      incidentId: "incident:test",
      projectionId: "projection:test",
      recommendationId: "recommendation:test",
      recommendationVersion: 3,
      recommendationHash: "sha256:recommendation-test",
      receiptId,
      disposition: "DEFERRED",
      truthEffect: "REVIEW_STATE_ONLY",
    },
  };
}
