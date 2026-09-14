const rows = (value) => (Array.isArray(value) ? value : []);
const FAIL_CLOSED_STATE = "IMPLEMENTED_FAIL_CLOSED";

const contracts = Object.freeze({
  valueOfInformation: Object.freeze({ testFile: "packages/domain/test/crisis-autopilot.test.mjs", scenarioId: "GOLDEN_1", claims: Object.freeze(["COLLECTION_TASK_LINKED", "DECISION_REVISION_RECORDED"]) }),
  decisionHalfLife: Object.freeze({ testFile: "packages/domain/test/crisis-autopilot-lifecycle.test.mjs", scenarioId: "GOLDEN_1", claims: Object.freeze(["DECISION_REVISION_RECORDED"]) }),
  sentinel: Object.freeze({ testFile: "packages/domain/test/crisis-autopilot-lifecycle.test.mjs", scenarioId: "GOLDEN_6", claims: Object.freeze(["PROVIDER_SILENCE_DETECTED", "ALTERNATIVE_SOURCE_TASK_PRESENT"]) }),
  modelDisagreement: Object.freeze({ testFile: "packages/domain/test/crisis-planning.test.mjs", scenarioId: "GOLDEN_7", claims: Object.freeze(["SOURCE_CONFLICT_PRESERVED", "FAKE_CONSENSUS_FALSE"]) }),
  realityReconciliation: Object.freeze({ testFile: "packages/domain/test/crisis-planning-chronology.test.mjs", scenarioId: "GOLDEN_7", claims: Object.freeze(["SOURCE_CONFLICT_PRESERVED", "TARGETED_COLLECTION_PRESENT"]) }),
  commandByIntent: Object.freeze({ testFile: "apps/api/test/command-intent-workflow.test.mjs", scenarioId: "GOLDEN_PLANNING", claims: Object.freeze(["COMMAND_INTENT_CONFIRMATION_REQUIRED", "AUTOMATIC_MUTATION_FALSE"]) }),
  operationalPeriodGenerator: Object.freeze({ testFile: "packages/domain/test/crisis-planning-command-hardening.test.mjs", scenarioId: "GOLDEN_PLANNING", claims: Object.freeze(["COMMAND_INTENT_CONFIRMATION_REQUIRED", "AUTHORITY_REVIEW_REQUIRED"]) }),
  resourceOptimizerOutput: Object.freeze({ testFile: "apps/api/test/response-capability-fieldnet-integrated-golden.test.mjs", scenarioId: "GOLDEN_RESPONSE_CAPACITY", claims: Object.freeze(["OPTIMIZER_RECALCULATED", "REVIEW_RECEIPT_PERSISTED"]) }),
  autonomousReplanning: Object.freeze({ testFile: "packages/domain/test/crisis-planning.test.mjs", scenarioId: "GOLDEN_3", claims: Object.freeze(["REPLAN_PROPOSED", "CONSEQUENTIAL_EXECUTION_FALSE"]) }),
  evacuationCorridor: Object.freeze({ testFile: "packages/domain/test/crisis-planning.test.mjs", scenarioId: "GOLDEN_PLANNING", claims: Object.freeze(["AUTHORITY_REVIEW_REQUIRED", "DISPATCH_FALSE"]) }),
  protectionTimeline: Object.freeze({ testFile: "packages/domain/test/crisis-planning.test.mjs", scenarioId: "GOLDEN_PLANNING", claims: Object.freeze(["AUTHORITY_REVIEW_REQUIRED", "AUTOMATIC_MUTATION_FALSE"]) }),
  capLifecycle: Object.freeze({ testFile: "apps/api/test/protection-exercise-lifecycle.test.mjs", scenarioId: "GOLDEN_4", claims: Object.freeze(["CAP_DRAFT_VALIDATED", "EXERCISE_SEND_RECEIPT", "LIVE_DISPATCH_REJECTED"]) }),
  multilingualComposer: Object.freeze({ testFile: "apps/api/test/protection-exercise-lifecycle.test.mjs", scenarioId: "GOLDEN_4", claims: Object.freeze(["CAP_DRAFT_VALIDATED", "TRANSITION_RECEIPTS_PERSISTED"]) }),
  nearMiss: Object.freeze({ testFile: "apps/api/test/anduril-crisis-os-golden-recovery.test.mjs", scenarioId: "GOLDEN_5", claims: Object.freeze(["LESSON_PERSISTED", "PRODUCTION_OUTCOME_FALSE"]) }),
  prevention: Object.freeze({ testFile: "apps/api/test/anduril-crisis-os-golden-recovery.test.mjs", scenarioId: "GOLDEN_5", claims: Object.freeze(["POSTCONDITION_OBSERVED", "LESSON_PERSISTED", "PRODUCTION_OUTCOME_FALSE"]) }),
});

/** Certifies fail-closed software in an isolated universe without admitting it as production truth. */
export function isolatedCapabilityProof({ name, feature, operatorSurfaceEvidence = false, testCohort, goldenScenarios } = {}) {
  const contract = contracts[name];
  const testFile = rows(testCohort?.files).find((item) => item?.file === contract?.testFile);
  const receipt = rows(goldenScenarios?.receipts).find((item) => item?.scenarioId === contract?.scenarioId);
  const claims = new Map(rows(receipt?.claims).map((item) => [item?.code, item]));
  const claimsProven = Boolean(contract?.claims.every((code) => {
    const claim = claims.get(code);
    return claim?.state === "PROVEN" && rows(claim?.evidenceReferences).length > 0;
  }));
  const pass = Boolean(
    contract && feature?.state === FAIL_CLOSED_STATE && operatorSurfaceEvidence === true &&
    testCohort?.state === "PASS" && testFile?.state === "INCLUDED" &&
    goldenScenarios?.state === "PASS" && goldenScenarios?.universe === "ISOLATED_TEST_FIXTURE" &&
    goldenScenarios?.productionTruth === false && receipt?.validation?.state === "PASS" &&
    receipt?.universe === "ISOLATED_TEST_FIXTURE" && receipt?.productionTruth === false && claimsProven
  );
  return {
    schemaVersion: "vigia.isolated-operator-capability-proof.v1",
    state: pass ? "PASS" : "FAIL",
    capability: name ?? null,
    currentProductionState: feature?.state ?? "NOT_IMPLEMENTED_OR_INVALID",
    universe: "ISOLATED_TEST_FIXTURE",
    productionTruth: false,
    operatorSurfaceEvidence: operatorSurfaceEvidence === true,
    testFile: contract?.testFile ?? null,
    testFileState: testFile?.state ?? null,
    scenarioId: contract?.scenarioId ?? null,
    receiptId: receipt?.receiptId ?? null,
    requiredClaims: contract?.claims ?? [],
    claimsProven,
    truthBoundary: "This proof certifies fail-closed software behavior and an operator-visible control surface only. It does not admit fixture content, authority, dispatch, observations, recommendations, or outcomes into production truth.",
  };
}
