import assert from "node:assert/strict";
import test from "node:test";

import { FEATURE_STATES, p0FeaturePass } from "./anduril_feature_availability.mjs";
import { isolatedCapabilityProof } from "./anduril_isolated_capability_proof.mjs";

const feature = { state: FEATURE_STATES.failClosed, schemaVersion: "vigia.value-of-information-projection.v1" };
const testCohort = {
  state: "PASS",
  files: [{ file: "packages/domain/test/crisis-autopilot.test.mjs", state: "INCLUDED" }],
};
const goldenScenarios = {
  state: "PASS",
  universe: "ISOLATED_TEST_FIXTURE",
  productionTruth: false,
  receipts: [{
    scenarioId: "GOLDEN_1",
    receiptId: "golden-receipt:golden_1:test",
    universe: "ISOLATED_TEST_FIXTURE",
    productionTruth: false,
    validation: { state: "PASS", violations: [] },
    claims: [
      { code: "COLLECTION_TASK_LINKED", state: "PROVEN", evidenceReferences: ["receipt:collection"] },
      { code: "DECISION_REVISION_RECORDED", state: "PROVEN", evidenceReferences: ["receipt:decision"] },
    ],
  }],
};

test("isolated capability proof requires fail-closed state, visible UI, test inclusion, and validated non-production receipt claims", () => {
  const input = { name: "valueOfInformation", feature, operatorSurfaceEvidence: true, testCohort, goldenScenarios };
  const proof = isolatedCapabilityProof(input);
  assert.equal(proof.state, "PASS");
  assert.equal(proof.productionTruth, false);
  assert.equal(proof.currentProductionState, FEATURE_STATES.failClosed);
  assert.equal(p0FeaturePass(feature, { executable: true, operatorEvidence: true }), false);
  assert.equal(isolatedCapabilityProof({ ...input, operatorSurfaceEvidence: false }).state, "FAIL");
  assert.equal(isolatedCapabilityProof({ ...input, feature: { state: FEATURE_STATES.invalid } }).state, "FAIL");
  assert.equal(isolatedCapabilityProof({ ...input, goldenScenarios: { ...goldenScenarios, productionTruth: true } }).state, "FAIL");
  const missingClaim = structuredClone(goldenScenarios);
  missingClaim.receipts[0].claims[0].evidenceReferences = [];
  assert.equal(isolatedCapabilityProof({ ...input, goldenScenarios: missingClaim }).state, "FAIL");
});
