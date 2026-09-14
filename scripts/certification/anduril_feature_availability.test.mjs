import assert from "node:assert/strict";
import test from "node:test";

import { projectCrisisPlanning } from "../../packages/domain/src/crisis-planning/project-crisis-planning.mjs";
import { decisionCouncilContractViolations } from "./anduril_autopilot_analysis.mjs";
import { P0_OPERATOR_CAPABILITIES } from "./anduril_integrity.mjs";
import { strategicCapabilityState } from "./anduril_strategic_analysis.mjs";
import {
  assessFeatureAvailability,
  completeWithholdingLifecycle,
  FEATURE_STATES,
  hasReceiptBackedOperatorExercise,
  p0FeaturePass,
} from "./anduril_feature_availability.mjs";

const withheld = (schemaVersion) => ({
  schemaVersion,
  state: "WITHHELD_NO_GOVERNED_INPUTS",
  value: null,
  reason: "No governed input is admitted.",
  owner: "crisis-planning-projection",
  source: "CANONICAL_GOVERNED_INPUTS",
  checkedAt: "2026-09-04T12:00:00.000Z",
  terminalReason: "No governed input is admitted.",
  unlockCondition: "Admit attributable current inputs.",
});

test("empty objects and schema-only placeholders are invalid", () => {
  const result = assessFeatureAvailability({
    detailPlanning: {
      dynamicExposureGraph: {},
      crisisDependencyGraph: {
        schemaVersion: "vigia.crisis-dependency-graph.v1",
      },
      modelDisagreement: {
        schemaVersion: "vigia.model-disagreement-projection.v1",
        state: "AVAILABLE",
        value: {},
      },
      resourceOptimizer: {
        schemaVersion: "vigia.resource-swarm-optimizer.v1",
        state: "RECOMMENDATIONS_READY_FOR_APPROVAL",
        value: { recommendations: [] },
      },
    },
    selectedResponse: { resourceOptimizer: {} },
    latestExercise: {},
    runtimeState: {},
    detailAutopilot: {},
  });
  assert.equal(result.dynamicExposureGraph.state, FEATURE_STATES.invalid);
  assert.equal(result.crisisDependencyGraph.state, FEATURE_STATES.invalid);
  assert.equal(result.modelDisagreement.state, FEATURE_STATES.invalid);
  assert.equal(result.resourceOptimizerOutput.state, FEATURE_STATES.invalid);
  assert.equal(result.actionOutcomeLedger.state, FEATURE_STATES.invalid);
});

test("truthful withholding is implemented fail-closed, never usable availability", () => {
  const result = assessFeatureAvailability({
    detailPlanning: {
      dynamicExposureGraph: {
        schemaVersion: "vigia.dynamic-exposure-graph.v1",
        state: "AVAILABLE",
        nodes: [{ id: "node:1" }],
        edges: [],
      },
      crisisDependencyGraph: withheld("vigia.crisis-dependency-graph.v1"),
      resourceOptimizer: withheld("vigia.resource-swarm-optimizer.v1"),
    },
    latestExercise: { actions: [{ action: "RESOURCE_OPTIMIZER" }] },
    runtimeState: {},
  });
  assert.equal(result.dynamicExposureGraph.state, FEATURE_STATES.usable);
  assert.equal(result.crisisDependencyGraph.state, FEATURE_STATES.failClosed);
  assert.equal(result.resourceOptimizerOutput.state, FEATURE_STATES.failClosed);
  assert.equal(p0FeaturePass(result.crisisDependencyGraph), false);
  assert.equal(p0FeaturePass(result.resourceOptimizerOutput, { executable: true }), false);
  assert.equal(p0FeaturePass({ state: FEATURE_STATES.invalid }), false);
});

test("P1 NO_* states certify implemented boundaries but never usable capability", () => {
  for (const state of ["NO_GOVERNED_INPUT", "NO_RECORDS", "NO_SUPPORTED_RECOMMENDATION", "NO_STRUCTURED_POLICY_INPUT", "NO_ADMITTED_MAPPINGS", "NO_REPORTS"])
    assert.equal(strategicCapabilityState(state), "IMPLEMENTED_FAIL_CLOSED", state);
  assert.equal(strategicCapabilityState("COMPARABLE_RECORDS_AVAILABLE"), "USABLE_ADMITTED");
  assert.equal(strategicCapabilityState(null), "NOT_IMPLEMENTED_OR_INVALID");
});

test("certification rejects council recommendation unless the complete review tuple is admitted", () => {
  const complete = (reviewerRole, content = "Review complete") => ({ state: "COMPLETE", reviewerRole, reviewedAt: "2026-09-04T11:58:00Z", content }), item = { decisionId: "decision:one", proposal: { state: "PRESENT", content: "Prepare draft" }, counterargument: complete("RED_TEAM"), evidenceReview: complete("INTELLIGENCE_OFFICER"), authorityReview: complete("PROTECTION_OFFICER"), safetyReview: complete("SAFETY_OFFICER"), consequenceOfDelay: complete("PLANNING_OFFICER"), alternatives: complete("OPERATIONS_OFFICER", ["Continue monitoring"]), validityReview: { state: "VALID", validUntil: "2026-09-04T12:30:00Z", invalidatingCondition: "NEW_EVIDENCE" }, missingReviews: [], finalRecommendation: "Prepare draft", finalRecommendationState: "ADVISORY_VALID_WITHIN_WINDOW", humanDecisionRequired: true, advisoryOnly: true, canMutateCanonicalTruth: false, canApproveAuthority: false, canClaimExecution: false };
  const projection = { incidentId: "incident:one", generatedAt: "2026-09-04T12:00:00Z", decisionCompression: { decisionsNow: [{ decisionId: "decision:one" }] }, decisionCouncil: { schemaVersion: "vigia.adversarial-decision-council.v2", requiredTuple: ["PROPOSAL", "COUNTERARGUMENT", "EVIDENCE_REVIEW", "AUTHORITY_REVIEW", "SAFETY_REVIEW", "CONSEQUENCE_OF_DELAY", "ALTERNATIVES", "FINAL_RECOMMENDATION"], items: [item] } };
  assert.deepEqual(decisionCouncilContractViolations([projection]), []);
  const incomplete = structuredClone(projection); incomplete.decisionCouncil.items[0].safetyReview.state = "MISSING_OR_INVALID";
  assert.ok(decisionCouncilContractViolations([incomplete]).some((value) => value.code === "DECISION_COUNCIL_ADMISSION_OR_BOUNDARY_INVALID"));
  incomplete.decisionCouncil.items[0].finalRecommendation = null;
  incomplete.decisionCouncil.items[0].finalRecommendationState = "WITHHELD_INCOMPLETE_COUNCIL_TUPLE";
  assert.deepEqual(decisionCouncilContractViolations([incomplete]), []);
});

test("executable P0 requires admitted content and an operator-exercised instance", () => {
  const planning = {
    resourceOptimizer: {
      schemaVersion: "vigia.resource-swarm-optimizer.v1",
      state: "RECOMMENDATIONS_READY_FOR_APPROVAL",
      recommendations: [{ requirementId: "requirement:1" }],
    },
  };
  const assessed = assessFeatureAvailability({ detailPlanning: planning });
  assert.equal(assessed.resourceOptimizerOutput.state, FEATURE_STATES.usable);
  assert.equal(p0FeaturePass(assessed.resourceOptimizerOutput, { executable: true }), false);

  const actionEvidence = {
    state: "PASS",
    executions: [
      {
        state: "PASS",
        uiAction: "planning-proposal-review:RESOURCE_RECOMMENDATION",
        receipt: { receiptId: "receipt:1" },
        canonical: { refreshCompleted: true },
      },
    ],
  };
  const operatorEvidence = hasReceiptBackedOperatorExercise(actionEvidence, ["RESOURCE_RECOMMENDATION"]);
  assert.equal(operatorEvidence, true);
  assert.equal(
    p0FeaturePass(assessed.resourceOptimizerOutput, {
      executable: true,
      operatorEvidence,
    }),
    true,
  );

  const staleEvidence = structuredClone(actionEvidence);
  staleEvidence.executions[0].canonical.refreshCompleted = false;
  assert.equal(hasReceiptBackedOperatorExercise(staleEvidence, ["RESOURCE_RECOMMENDATION"]), false);
});

test("real projector direct shapes classify as governed withholding, not availability", () => {
  const projection = projectCrisisPlanning({
    incident: { id: "incident:feature-contract", coordinate: [-8, 40] },
    generatedAt: "2026-09-04T12:00:00.000Z",
  });
  const result = assessFeatureAvailability({
    detailPlanning: projection,
    runtimeState: {},
  });
  for (const key of [
    "dynamicExposureGraph",
    "crisisDependencyGraph",
    "modelDisagreement",
    "realityReconciliation",
    "commandByIntent",
    "operationalPeriodGenerator",
    "resourceOptimizerOutput",
    "autonomousReplanning",
    "evacuationCorridor",
    "protectionTimeline",
    "capLifecycle",
    "multilingualComposer",
  ]) {
    assert.equal(result[key].state, FEATURE_STATES.failClosed, key);
  }
});

test("withholding without complete lifecycle is invalid", () => {
  const section = withheld("vigia.dynamic-exposure-graph.v1");
  delete section.owner;
  delete section.source;
  assert.equal(completeWithholdingLifecycle(section), false);
  const result = assessFeatureAvailability({
    detailPlanning: { dynamicExposureGraph: section },
    runtimeState: {},
  });
  assert.equal(result.dynamicExposureGraph.state, FEATURE_STATES.invalid);
});

test("response and FieldNet capabilities require non-vacuous governed proof", () => {
  const absent = assessFeatureAvailability({
    selectedResponse: { schemaVersion: "vigia.response-capability.v1", facilities: {} },
    runtimeProof: { fieldnetReadiness: { ready: true } },
    testCohort: { state: "PASS", files: [] },
    goldenScenarios: { state: "PASS" },
  });
  assert.equal(absent.responseCapability.state, FEATURE_STATES.invalid);
  assert.equal(absent.fieldNetLite.state, FEATURE_STATES.invalid);
  assert.equal(absent.trustedObserver.state, FEATURE_STATES.invalid);
  assert.equal(absent.twoWayTasking.state, FEATURE_STATES.invalid);

  const admitted = assessFeatureAvailability({
    selectedResponse: {
      schemaVersion: "vigia.response-capability.v1",
      projectionId: "response:one",
      retrievalCoverage: { schemaVersion: "vigia.response-facility-retrieval-coverage.v1" },
      facilities: { HOSPITAL: [{ id: "hospital:1" }], FIRE_STATION: [{ id: "fire:1" }] },
    },
    runtimeProof: { fieldnetReadiness: { ready: true } },
    testCohort: {
      state: "PASS",
      files: [
        { file: "packages/domain/test/fieldnet-lite-contracts.test.mjs", state: "INCLUDED" },
        { file: "apps/api/test/response-capability-fieldnet-integrated-golden.test.mjs", state: "INCLUDED" },
      ],
    },
    goldenScenarios: { state: "PASS" },
  });
  assert.equal(admitted.responseCapability.state, FEATURE_STATES.usable);
  assert.equal(admitted.fieldNetLite.state, FEATURE_STATES.usable);
  assert.equal(admitted.trustedObserver.state, FEATURE_STATES.usable);
  assert.equal(admitted.twoWayTasking.state, FEATURE_STATES.usable);
});

test("every runtime feature classification is a governed operator P0", () => {
  const classified = Object.keys(assessFeatureAvailability({})).sort();
  assert.deepEqual(classified, [...P0_OPERATOR_CAPABILITIES].sort());
});
