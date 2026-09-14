export const strategicCapabilityState = (state) => !String(state ?? "").trim() ? "NOT_IMPLEMENTED_OR_INVALID" : /^(?:NO_|WITHHELD|UNAVAILABLE|INSUFFICIENT|UNKNOWN|BLOCKED|INCOMPLETE)/u.test(String(state).toUpperCase()) ? "IMPLEMENTED_FAIL_CLOSED" : "USABLE_ADMITTED";

export async function analyzeStrategicIntelligence({ directAutopilots, portfolios, selectedIncidentId, iso, rows, writeJson }) {
  const allProjections = [...directAutopilots, ...portfolios.map((item) => item.value).filter(Boolean)];
  const strategicSchemaByKey = {
    crisisShadowMode: "vigia.crisis-shadow-mode.v1",
    globalCrisisMemory: "vigia.global-crisis-memory.v1",
    nearMissIntelligence: "vigia.near-miss-intelligence.v1",
    preventionTwin: "vigia.prevention-twin.v1",
    resilienceCampaigns: "vigia.autonomous-resilience-campaigns.v1",
    policyToCode: "vigia.policy-to-code.v1",
    interagencySemanticTranslator: "vigia.interagency-semantic-translator.v1",
    publicSafetyMesh: "vigia.public-safety-mesh.v1",
  };
  const strategicStatesByKey = {
    crisisShadowMode: ["EXERCISE_OR_REPLAY_READY", "NO_GOVERNED_INPUT"],
    globalCrisisMemory: ["COMPARABLE_RECORDS_AVAILABLE", "NO_GOVERNED_INPUT"],
    nearMissIntelligence: ["RECORDS_AVAILABLE", "NO_RECORDS"],
    preventionTwin: ["GOVERNED_CONTEXT_AVAILABLE", "NO_GOVERNED_INPUT"],
    resilienceCampaigns: ["PLANNING_RECOMMENDATIONS_AVAILABLE", "NO_SUPPORTED_RECOMMENDATION"],
    policyToCode: ["DRAFTS_REQUIRE_HUMAN_REVIEW", "NO_STRUCTURED_POLICY_INPUT"],
    interagencySemanticTranslator: ["MAPPINGS_AVAILABLE", "NO_ADMITTED_MAPPINGS"],
    publicSafetyMesh: ["REPORTS_REQUIRE_ADMISSION", "NO_REPORTS"],
  };
  const strategicProjections = directAutopilots.map((projection) => projection?.strategicIntelligence).filter(Boolean);
  const strategicViolations = [];
  for (const projection of strategicProjections) {
    const incidentId = projection.incidentId ?? null;
    if (projection.schemaVersion !== "vigia.strategic-crisis-intelligence.v1")
      strategicViolations.push({
        incidentId,
        code: "STRATEGIC_SCHEMA_INVALID",
        actual: projection.schemaVersion ?? null,
      });
    if (incidentId !== selectedIncidentId)
      strategicViolations.push({
        incidentId,
        code: "STRATEGIC_INCIDENT_BINDING_INVALID",
        expected: selectedIncidentId,
      });
    if (!iso(projection.generatedAt))
      strategicViolations.push({
        incidentId,
        code: "STRATEGIC_GENERATED_AT_INVALID",
        actual: projection.generatedAt ?? null,
      });
    if (!String(projection.safetyBoundary ?? "").trim())
      strategicViolations.push({
        incidentId,
        code: "STRATEGIC_SAFETY_BOUNDARY_MISSING",
      });
    for (const [key, schemaVersion] of Object.entries(strategicSchemaByKey)) {
      const value = projection[key];
      if (value?.schemaVersion !== schemaVersion)
        strategicViolations.push({
          incidentId,
          subsystem: key,
          code: "STRATEGIC_SUBSYSTEM_SCHEMA_INVALID",
          expected: schemaVersion,
          actual: value?.schemaVersion ?? null,
        });
      if (!String(value?.state ?? "").trim())
        strategicViolations.push({
          incidentId,
          subsystem: key,
          code: "STRATEGIC_SUBSYSTEM_STATE_MISSING",
        });
      else if (!strategicStatesByKey[key].includes(value.state))
        strategicViolations.push({
          incidentId,
          subsystem: key,
          code: "STRATEGIC_SUBSYSTEM_STATE_INVALID",
          expected: strategicStatesByKey[key],
          actual: value.state,
        });
      if (!String(value?.truthBoundary ?? "").trim())
        strategicViolations.push({
          incidentId,
          subsystem: key,
          code: "STRATEGIC_SUBSYSTEM_TRUTH_BOUNDARY_MISSING",
        });
    }
    for (const strategy of rows(projection.crisisShadowMode?.strategies))
      if (!["EXERCISE", "REPLAY"].includes(strategy.universe) || strategy.causalClaim !== false || strategy.productionTruthMutation !== false)
        strategicViolations.push({
          incidentId,
          subsystem: "crisisShadowMode",
          code: "SHADOW_MODE_TRUTH_OR_UNIVERSE_VIOLATION",
          strategyId: strategy.strategyId ?? null,
        });
    for (const memory of rows(projection.globalCrisisMemory?.matches))
      if (memory.causalTransferClaimed !== false || !String(memory.source?.name ?? "").trim() || !String(memory.source?.reference ?? "").trim())
        strategicViolations.push({
          incidentId,
          subsystem: "globalCrisisMemory",
          code: "CRISIS_MEMORY_CAUSAL_OR_SOURCE_VIOLATION",
          memoryId: memory.memoryId ?? null,
        });
    for (const nearMiss of rows(projection.nearMissIntelligence?.items))
      if (nearMiss.universe !== "LIVE_PRODUCTION" && nearMiss.productionTruth !== false)
        strategicViolations.push({
          incidentId,
          subsystem: "nearMissIntelligence",
          code: "NON_PRODUCTION_NEAR_MISS_TRUTH_VIOLATION",
          nearMissId: nearMiss.nearMissId ?? null,
        });
    for (const observation of rows(projection.publicSafetyMesh?.observations))
      if (
        observation.createsVerifiedIncident !== false ||
        observation.grantsAuthority !== false ||
        observation.trustClass !== "PUBLIC_UNVERIFIED" ||
        observation.reporterClass !== "PUBLIC" ||
        !["REJECTED_INVALID_METADATA", "DUPLICATE_REVIEW", "HUMAN_OR_CROSS_SOURCE_REVIEW_REQUIRED"].includes(observation.admissionState)
      )
        strategicViolations.push({
          incidentId,
          subsystem: "publicSafetyMesh",
          code: "PUBLIC_REPORT_VERIFICATION_OR_AUTHORITY_VIOLATION",
          reportId: observation.reportId ?? null,
        });
    for (const draft of rows(projection.policyToCode?.drafts))
      if (draft.active !== false || draft.reviewState !== "HUMAN_REVIEW_REQUIRED" || rows(draft.gates).some((gate) => gate.state !== "DRAFT_INACTIVE"))
        strategicViolations.push({
          incidentId,
          subsystem: "policyToCode",
          code: "POLICY_DRAFT_ACTIVATION_OR_REVIEW_VIOLATION",
          policyDraftId: draft.policyDraftId ?? null,
        });
    for (const mapping of rows(projection.interagencySemanticTranslator?.mappings))
      if (!String(mapping.originalTerm ?? "").trim() || !String(mapping.source?.name ?? "").trim() || !String(mapping.source?.reference ?? "").trim())
        strategicViolations.push({
          incidentId,
          subsystem: "interagencySemanticTranslator",
          code: "TRANSLATION_ORIGINAL_OR_SOURCE_MISSING",
          mappingId: mapping.mappingId ?? null,
        });
    for (const recommendation of rows(projection.resilienceCampaigns?.recommendations))
      if (recommendation.humanReviewRequired !== true || recommendation.authorityGranted !== false || recommendation.executionClaimed !== false)
        strategicViolations.push({
          incidentId,
          subsystem: "resilienceCampaigns",
          code: "RESILIENCE_CAMPAIGN_AUTHORITY_OR_EXECUTION_VIOLATION",
          recommendationId: recommendation.recommendationId ?? null,
        });
  }
  const strategicSubsystemStates = Object.fromEntries(
    Object.keys(strategicSchemaByKey).map((key) => [
      key,
      strategicProjections.map((projection) => ({
        incidentId: projection.incidentId ?? null,
        state: projection[key]?.state ?? null,
        capabilityState: strategicCapabilityState(projection[key]?.state),
        schemaVersion: projection[key]?.schemaVersion ?? null,
      })),
    ]),
  );
  const subsystemCapabilityRows = Object.values(strategicSubsystemStates).flat();
  const strategicIntelligenceProof = {
    schemaVersion: "vigia.anduril-strategic-intelligence-certification.v1",
    generatedAt: new Date().toISOString(),
    expectedRouteProjections: 3,
    observedRouteProjections: strategicProjections.length,
    state: strategicProjections.length === 3 && strategicViolations.length === 0 ? "PASS" : "FAIL",
    subsystemStates: strategicSubsystemStates,
    capabilityAccounting: { usableAdmitted: subsystemCapabilityRows.filter((item) => item.capabilityState === "USABLE_ADMITTED").length, implementedFailClosed: subsystemCapabilityRows.filter((item) => item.capabilityState === "IMPLEMENTED_FAIL_CLOSED").length, notImplementedOrInvalid: subsystemCapabilityRows.filter((item) => item.capabilityState === "NOT_IMPLEMENTED_OR_INVALID").length, rule: "Fail-closed NO_*/WITHHELD states prove a boundary implementation only and never count as a usable capability." },
    violations: strategicViolations,
    safetyBoundary:
      "Strategic projections may inform review but cannot mutate production truth, grant authority, activate policy, execute a campaign, dispatch resources, or transfer causal claims.",
  };
  await writeJson("prevention/strategic-intelligence.json", strategicIntelligenceProof);
  return {
    allProjections,
    strategicSchemaByKey,
    strategicStatesByKey,
    strategicProjections,
    strategicViolations,
    strategicSubsystemStates,
    strategicIntelligenceProof,
  };
}
