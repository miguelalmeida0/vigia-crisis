import { nonempty } from "./anduril_integrity_shared.mjs";

const dispositions = new Set(["ACKNOWLEDGED_FOR_REVIEW", "DEFERRED", "DECLINED"]);

const decodeActionRecommendationId = (uiAction) => {
  const encoded = String(uiAction ?? "").split(":").slice(1).join(":");
  try {
    return decodeURIComponent(encoded);
  } catch {
    return "";
  }
};

export function responseReviewExecutionValid({ execution, receipt, afterState, incidentId }) {
  const actionRecommendationId = decodeActionRecommendationId(execution?.uiAction);
  const sameBinding =
    nonempty(incidentId) &&
    execution?.workflowId === actionRecommendationId &&
    afterState?.selectedIncidentId === incidentId &&
    afterState?.incidentId === incidentId &&
    receipt?.incidentId === incidentId &&
    nonempty(afterState?.projectionId) &&
    afterState.projectionId === receipt?.projectionId &&
    nonempty(actionRecommendationId) &&
    afterState?.recommendationId === actionRecommendationId &&
    afterState.recommendationId === receipt?.recommendationId &&
    nonempty(String(afterState?.recommendationVersion ?? "")) &&
    String(afterState.recommendationVersion) === String(receipt?.recommendationVersion) &&
    nonempty(afterState?.recommendationHash) &&
    afterState.recommendationHash === receipt?.recommendationHash &&
    nonempty(afterState?.receiptId) &&
    afterState.receiptId === receipt?.receiptId &&
    dispositions.has(afterState?.disposition) &&
    afterState.disposition === receipt?.disposition;

  return (
    sameBinding &&
    execution?.action === "REVIEW_RESPONSE_RECOMMENDATION" &&
    receipt?.schemaVersion === "vigia.response-recommendation-review-receipt.v1" &&
    receipt?.truthEffect === "REVIEW_STATE_ONLY" &&
    afterState?.scope === "RESPONSE_RECOMMENDATION_REVIEW" &&
    afterState?.truthEffect === "REVIEW_STATE_ONLY"
  );
}
