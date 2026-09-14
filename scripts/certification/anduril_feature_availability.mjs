const rows = (value) => (Array.isArray(value) ? value : []);
const record = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : null);
const nonemptyRecord = (value) => Boolean(record(value) && Object.keys(value).length);
const text = (value) => typeof value === "string" && value.trim().length > 0;
const withheldState = (value) =>
  /^(?:NO_|WITHHELD|UNAVAILABLE|INSUFFICIENT|UNKNOWN|BLOCKED|INCOMPLETE|REQUIRED|INVALID|NOT_APPLICABLE)/u.test(String(value ?? "").toUpperCase());

export const FEATURE_STATES = Object.freeze({
  usable: "USABLE_ADMITTED",
  failClosed: "IMPLEMENTED_FAIL_CLOSED",
  invalid: "NOT_IMPLEMENTED_OR_INVALID",
});

export function completeWithholdingLifecycle(section) {
  return (
    withheldState(section?.state) &&
    text(section?.reason) &&
    (text(section?.unlockCondition) || rows(section?.requiredInputs).length > 0 || text(section?.terminalReason)) &&
    (text(section?.owner) || text(section?.source) || nonemptyRecord(section?.resolutionLifecycle))
  );
}

function classifiedFeature(section, schemaVersion, admits = nonemptyRecord) {
  if (!record(section) || section.schemaVersion !== schemaVersion || !text(section.state)) {
    return {
      state: FEATURE_STATES.invalid,
      schemaVersion: section?.schemaVersion ?? null,
    };
  }
  if (withheldState(section.state)) {
    return {
      state: completeWithholdingLifecycle(section) ? FEATURE_STATES.failClosed : FEATURE_STATES.invalid,
      schemaVersion,
      reason: section.reason ?? null,
      unlockCondition: section.unlockCondition ?? null,
    };
  }
  return {
    state: admits(record(section.value) ?? section) ? FEATURE_STATES.usable : FEATURE_STATES.invalid,
    schemaVersion,
  };
}

function preferUsable(...features) {
  return features.find((item) => item.state === FEATURE_STATES.usable) ?? features.find((item) => item.state === FEATURE_STATES.failClosed) ?? features[0];
}

function contentFeature(admitted, evidence = null) {
  return {
    state: admitted ? FEATURE_STATES.usable : FEATURE_STATES.invalid,
    evidence,
  };
}

export function p0FeaturePass(feature, { executable = false, operatorEvidence = false } = {}) {
  return feature?.state === FEATURE_STATES.usable && (!executable || operatorEvidence === true);
}

export function hasReceiptBackedOperatorExercise(actionEvidence, patterns) {
  if (actionEvidence?.state !== "PASS") return false;
  return rows(actionEvidence?.executions).some((execution) => {
    const action = String(execution?.uiAction ?? "").toUpperCase();
    return (
      execution?.state === "PASS" &&
      text(execution?.receipt?.receiptId) &&
      execution?.canonical?.refreshCompleted === true &&
      patterns.some((pattern) => action.includes(pattern))
    );
  });
}

export function assessFeatureAvailability({ detailPlanning, selectedResponse, latestExercise, runtimeState, detailAutopilot, runtimeProof, testCohort, goldenScenarios }) {
  const resourceOptimizer = preferUsable(
    classifiedFeature(detailPlanning?.resourceOptimizer, "vigia.resource-swarm-optimizer.v1", (value) => rows(value?.recommendations).length > 0),
    classifiedFeature(selectedResponse?.resourceOptimizer, "vigia.resource-swarm-optimizer.v1", (value) => rows(value?.recommendations).length > 0),
  );
  const testIncluded = (path) => testCohort?.state === "PASS" && rows(testCohort?.files).some((item) => item?.file === path && item?.state === "INCLUDED");
  const fieldNetContracts = testIncluded("packages/domain/test/fieldnet-lite-contracts.test.mjs");
  const integratedFieldNetContract = testIncluded("apps/api/test/response-capability-fieldnet-integrated-golden.test.mjs");

  return {
    crisisAutopilot: contentFeature(
      detailAutopilot?.schemaVersion === "vigia.crisis-autopilot-projection.v1" &&
        rows([...(detailAutopilot?.autopilot?.triggers ?? []), ...(detailAutopilot?.autopilot?.doingNow ?? []), ...(detailAutopilot?.autopilot?.nextActions ?? [])]).length > 0,
      detailAutopilot?.projectionHash ?? null,
    ),
    valueOfInformation: classifiedFeature(
      detailAutopilot?.valueOfInformation,
      "vigia.value-of-information-projection.v1",
      (value) => Number(value?.candidateCount) > 0 && Boolean(value?.bestNextCollectionAction ?? value?.highestValueBlockedCandidate),
    ),
    livingIncidentTwin: contentFeature(
      detailAutopilot?.livingTwin?.schemaVersion === "vigia.living-incident-twin-projection.v1" &&
        detailAutopilot?.livingTwin?.asOfCapable === true &&
        ["identity", "truth", "location"].every((key) => detailAutopilot?.livingTwin?.[key]?.state === "AVAILABLE"),
      detailAutopilot?.livingTwin?.projectionHash ?? null,
    ),
    decisionCompression: contentFeature(
      detailAutopilot?.decisionCompression?.schemaVersion === "vigia.decision-compression.v1" &&
        Number(detailAutopilot?.decisionCompression?.counts?.machineWork ?? 0) + Number(detailAutopilot?.decisionCompression?.counts?.requiredHumanDecisions ?? 0) > 0,
    ),
    regretRadar: contentFeature(
      detailAutopilot?.regretRadar?.schemaVersion === "vigia.regret-radar.v1" && rows(detailAutopilot?.regretRadar?.items).length > 0,
    ),
    decisionHalfLife: classifiedFeature(
      detailAutopilot?.decisionHalfLife,
      "vigia.decision-half-life.v1",
      (value) => rows(value?.items).length > 0,
    ),
    uncertaintyBudget: contentFeature(
      detailAutopilot?.uncertaintyBudget?.schemaVersion === "vigia.uncertainty-budget.v1" && rows(detailAutopilot?.uncertaintyBudget?.items).length > 0,
    ),
    sentinel: classifiedFeature(
      detailAutopilot?.sentinel,
      "vigia.unknown-unknown-sentinel.v1",
      (value) => rows(value?.anomalies).length > 0,
    ),
    fieldNetLite: contentFeature(
      runtimeProof?.fieldnetReadiness?.ready === true && fieldNetContracts && integratedFieldNetContract && goldenScenarios?.state === "PASS",
    ),
    trustedObserver: contentFeature(integratedFieldNetContract && goldenScenarios?.state === "PASS"),
    twoWayTasking: contentFeature(integratedFieldNetContract && goldenScenarios?.state === "PASS"),
    responseCapability: contentFeature(
      selectedResponse?.schemaVersion === "vigia.response-capability.v1" &&
        selectedResponse?.retrievalCoverage?.schemaVersion === "vigia.response-facility-retrieval-coverage.v1" &&
        rows(selectedResponse?.facilities?.HOSPITAL).length > 0 &&
        rows(selectedResponse?.facilities?.FIRE_STATION).length > 0,
      selectedResponse?.projectionId ?? null,
    ),
    dynamicExposureGraph: classifiedFeature(
      detailPlanning?.dynamicExposureGraph,
      "vigia.dynamic-exposure-graph.v1",
      (value) => rows(value?.nodes).length > 0 || rows(value?.edges).length > 0,
    ),
    crisisDependencyGraph: classifiedFeature(
      detailPlanning?.crisisDependencyGraph,
      "vigia.crisis-dependency-graph.v1",
      (value) => rows(value?.nodes).length > 0 || rows(value?.edges).length > 0,
    ),
    modelDisagreement: classifiedFeature(
      detailPlanning?.modelDisagreement,
      "vigia.model-disagreement-projection.v1",
      (value) => rows(value?.disagreements).length > 0,
    ),
    realityReconciliation: classifiedFeature(
      detailPlanning?.realityReconciliation,
      "vigia.reality-reconciliation.v1",
      (value) => rows(value?.items).length > 0,
    ),
    commandByIntent: classifiedFeature(
      detailPlanning?.commandIntent,
      "vigia.command-intent-proposal.v1",
      (value) => text(value?.intent?.statement) && text(value?.intent?.target) && text(value?.intent?.requestedBy),
    ),
    operationalPeriodGenerator: classifiedFeature(
      detailPlanning?.operationalPeriodProposal,
      "vigia.operational-period-proposal.v1",
      (value) => text(value?.periodStart) && text(value?.periodEnd) && rows(value?.owners).length > 0,
    ),
    resourceOptimizerOutput: resourceOptimizer,
    autonomousReplanning: classifiedFeature(
      detailPlanning?.autonomousReplanning,
      "vigia.autonomous-replanning.v1",
      (value) => rows(value?.whatChanged).length > 0 && nonemptyRecord(value?.oldPlan) && nonemptyRecord(value?.newPlan),
    ),
    evacuationCorridor: classifiedFeature(
      detailPlanning?.evacuationCorridor,
      "vigia.evacuation-corridor-planning.v1",
      (value) => text(value?.recommendedCorridor?.routeId) && text(value?.decisionDeadline),
    ),
    protectionTimeline: classifiedFeature(
      detailPlanning?.protectionTimeline,
      "vigia.protection-bubble-timeline.v1",
      (value) => rows(value?.windows).some((window) => window?.state === "SCENARIO_AVAILABLE"),
    ),
    capLifecycle: classifiedFeature(
      detailPlanning?.capProtection,
      "vigia.cap-protection-lifecycle.v1",
      (value) => text(value?.protectionId) && text(value?.currentState),
    ),
    multilingualComposer: classifiedFeature(
      detailPlanning?.multilingualProtectionComposer,
      "vigia.multilingual-protection-composer.v1",
      (value) => rows(value?.readyLanguages).length > 0 && nonemptyRecord(value?.canonicalMessage),
    ),
    actionOutcomeLedger: contentFeature(
      rows(latestExercise?.actions).length > 0 && rows(latestExercise?.postconditions).length > 0 && rows(latestExercise?.outcomes).length > 0,
      latestExercise?.exerciseId ?? latestExercise?.periodId ?? null,
    ),
    nearMiss: classifiedFeature(
      detailAutopilot?.strategicIntelligence?.nearMissIntelligence,
      "vigia.near-miss-intelligence.v1",
      (value) => rows(value?.items).some((item) => item?.state === "RECORDED_NEAR_MISS"),
    ),
    prevention: preferUsable(
      classifiedFeature(
        detailAutopilot?.strategicIntelligence?.preventionTwin,
        "vigia.prevention-twin.v1",
        (value) => rows(value?.axes).some((item) => nonemptyRecord(item?.source)),
      ),
      classifiedFeature(
        detailAutopilot?.strategicIntelligence?.resilienceCampaigns,
        "vigia.autonomous-resilience-campaigns.v1",
        (value) => rows(value?.recommendations).length > 0,
      ),
    ),
  };
}
