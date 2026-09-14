const list = (value) => (Array.isArray(value) ? value : []);
const REQUIRED_COUNCIL_REVIEWS = ["counterargument", "evidenceReview", "authorityReview", "safetyReview", "consequenceOfDelay", "alternatives"];
const REQUIRED_COUNCIL_TUPLE = ["PROPOSAL", "COUNTERARGUMENT", "EVIDENCE_REVIEW", "AUTHORITY_REVIEW", "SAFETY_REVIEW", "CONSEQUENCE_OF_DELAY", "ALTERNATIVES", "FINAL_RECOMMENDATION"];
const COUNCIL_ROLES = new Set(["INTELLIGENCE_OFFICER", "OPERATIONS_OFFICER", "PLANNING_OFFICER", "LOGISTICS_OFFICER", "SAFETY_OFFICER", "PROTECTION_OFFICER", "PUBLIC_INFORMATION_OFFICER", "RED_TEAM"]);

export function decisionCouncilContractViolations(projections = []) {
  return projections.flatMap((projection) => {
    const council = projection?.decisionCouncil, violations = [], projectionAt = Date.parse(projection?.generatedAt);
    const expectedDecisionIds = new Set(list(projection?.decisionCompression?.decisionsNow).map((item) => item?.decisionId));
    if (council?.schemaVersion !== "vigia.adversarial-decision-council.v2" || JSON.stringify(council?.requiredTuple) !== JSON.stringify(REQUIRED_COUNCIL_TUPLE) || list(council?.items).some((item) => !expectedDecisionIds.has(item?.decisionId)) || expectedDecisionIds.size !== list(council?.items).length)
      violations.push({ incidentId: projection?.incidentId ?? null, code: "DECISION_COUNCIL_CONTRACT_INVALID" });
    for (const item of list(council?.items)) {
      const complete = REQUIRED_COUNCIL_REVIEWS.every((key) => { const review = item?.[key], content = review?.content, reviewedAt = Date.parse(review?.reviewedAt); return review?.state === "COMPLETE" && COUNCIL_ROLES.has(review?.reviewerRole) && Number.isFinite(projectionAt) && Number.isFinite(reviewedAt) && reviewedAt <= projectionAt && (key === "alternatives" ? list(content).length > 0 : typeof content === "string" && content.trim()); });
      const admitted = item?.finalRecommendationState === "ADVISORY_VALID_WITHIN_WINDOW";
      if ((admitted && (!item.finalRecommendation || item.proposal?.state !== "PRESENT" || item.validityReview?.state !== "VALID" || !(Date.parse(item.validityReview?.validUntil) > projectionAt) || !item.validityReview?.invalidatingCondition || !complete || list(item.missingReviews).length || item?.humanDecisionRequired !== true)) || (!admitted && item?.finalRecommendation !== null) || item?.advisoryOnly !== true || item?.canMutateCanonicalTruth !== false || item?.canApproveAuthority !== false || item?.canClaimExecution !== false)
        violations.push({ incidentId: projection?.incidentId ?? null, decisionId: item?.decisionId ?? null, code: "DECISION_COUNCIL_ADMISSION_OR_BOUNDARY_INVALID" });
    }
    return violations;
  });
}

export function analyzeAutopilotTruth({ planningEmbedded, directAutopilots, portfolios, allProjections, selectedIncidentId, incidentRows, rows }) {
  const planningProjections = planningEmbedded.map((item) => item.value).filter(Boolean);
  const detailPlanning = planningEmbedded.find((item) => item.name === "detail")?.value ?? null;
  const autopilotRuntimeComplete =
    directAutopilots.length === 3 && portfolios.every((item) => item.value?.schemaVersion === "vigia.crisis-autopilot-portfolio.v2");
  const unknownViolations = directAutopilots.flatMap((projection) =>
    rows(projection?.uncertaintyBudget?.items).filter((item) => {
      if (["KNOWN", "UNKNOWN_BUT_ACCEPTABLE"].includes(item.state)) return false;
      if (item.state === "UNKNOWN_CURRENTLY_UNOBTAINABLE") return !item.terminalReason;
      return !(item.backingWorkId || (item.owner && item.source && item.nextCheckAt));
    }),
  );
  const activeLifecycleViolations = directAutopilots.flatMap((projection) =>
    rows(projection?.autopilot?.doingNow).filter((item) => !item.backingObjectIds?.length || !item.lifecycleComplete),
  );
  const criticalDecisionViolations = directAutopilots.flatMap((projection) =>
    rows(projection?.decisionCompression?.decisionsNow).filter(
      (item) => ["LIFE_SAFETY", "CRITICAL"].includes(item.consequenceClass) && !item.consequenceOfDelay,
    ),
  );
  const missedHumanDecisions = directAutopilots.flatMap((projection) => rows(projection?.decisionCompression?.missedRequiredHumanDecisions));
  const recommendationViolations = directAutopilots.flatMap((projection) =>
    rows(projection?.decisionHalfLife?.items).filter((item) => item.state === "VALID" && (!item.validUntil || !item.nextInvalidatingCondition)),
  );
  const withheldRecommendationLeaks = directAutopilots.flatMap((projection) =>
    rows(projection?.decisionHalfLife?.items).filter((item) => item.state === "WITHHELD_NO_VALIDITY_WINDOW" && item.recommendation !== null),
  );
  const anomalyViolations = allProjections.flatMap((projection) =>
    rows(projection?.sentinel?.anomalies).filter(
      (item) => !item.reason || !rows(item.mayAffect).length || !item.whatVigiaIsDoingNext || item.truthEffect !== "NONE",
    ),
  );
  const staffViolations = directAutopilots.flatMap((projection) =>
    rows(projection?.commandStaff?.advisories).filter(
      (item) => item.canMutateCanonicalTruth !== false || item.canApproveAuthority !== false || item.canClaimExecution !== false,
    ),
  );
  const councilViolations = decisionCouncilContractViolations(directAutopilots);
  const bindings = directAutopilots.map((projection) => ({
    incidentId: projection.incidentId,
    canonicalIncidentId: projection.bindings?.canonicalIncidentId,
    twinIncidentId: projection.livingTwin?.incidentId,
  }));
  const bindingViolations = bindings.filter(
    (item) =>
      !selectedIncidentId ||
      item.incidentId !== selectedIncidentId ||
      item.canonicalIncidentId !== selectedIncidentId ||
      item.twinIncidentId !== selectedIncidentId,
  );
  const priorityViolations = incidentRows.filter((item) => {
    const priority = item?.operationalTruth?.priority ?? {};
    const high =
      Number(priority.score) >= 70 ||
      Number(priority.rank) <= 3 ||
      ["P0", "P1", "HIGH", "CRITICAL", "VERIFY_NOW"].includes(String(priority.band ?? priority.state ?? "").toUpperCase());
    return high && !(priority.whyRankedAboveNext && rows(priority.factors).length && priority.revision);
  });
  return {
    planningProjections,
    detailPlanning,
    autopilotRuntimeComplete,
    unknownViolations,
    activeLifecycleViolations,
    criticalDecisionViolations,
    missedHumanDecisions,
    recommendationViolations,
    withheldRecommendationLeaks,
    anomalyViolations,
    staffViolations,
    councilViolations,
    bindings,
    bindingViolations,
    priorityViolations,
  };
}
