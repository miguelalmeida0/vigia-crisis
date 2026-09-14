import assert from "node:assert/strict";
import test from "node:test";
import { goldenReceipt, validTap } from "./anduril_golden_integrity.fixtures.mjs";

import {
  ANDURIL_BROWSER_SCHEMA,
  CONSEQUENTIAL_ACTION_EVIDENCE_SCHEMA,
  CONTROLLED_ACTION_EXERCISE_SCHEMA,
  FINAL_ARTIFACT_SEAL_REQUIRED_PATHS,
  FINAL_ARTIFACT_SEAL_SCHEMA,
  GOLDEN_SCENARIO_CONTRACTS,
  REPRODUCIBILITY_LABELS,
  auditOptimizerCapacityCollectionPlans,
  createGoldenScenarioReceipt,
  deriveGoldenScenarioEvidence,
  governedCanonicalIncidentCount,
  encodeGoldenScenarioReceiptDiagnostic,
  parseNodeTap,
  sweepCanonicalIncidentTruth,
  validateBrowserAcceptanceDocument,
  validateConsequentialActionEvidence,
  validateFinalArtifactSeal,
  validateReproducibilityLedger,
} from "./anduril_integrity.mjs";

test("TAP parser and golden reporting are derived from observed test records", () => {
  const parsed = parseNodeTap(validTap);
  assert.equal(parsed.tests.length, 10);
  assert.equal(parsed.summary.pass, 10);
  const evidence = deriveGoldenScenarioEvidence(validTap, { exitCode: 0 });
  assert.equal(evidence.state, "PASS");
  assert.equal(evidence.scenarios.length, 9);
  assert.equal(evidence.scenarios[0].name, "golden 1: one");
  assert.equal(evidence.invariants.length, 1);
  assert.equal(evidence.receipts.length, 9);
  assert.ok(evidence.receipts.every((item) => item.validation.state === "PASS"));
});

test("TAP-derived golden reporting fails closed on a missing or failed scenario", () => {
  const missing = deriveGoldenScenarioEvidence(validTap.replace("# Subtest: golden 7: seven\nok 8 - golden 7: seven\n", ""), { exitCode: 0 });
  assert.equal(missing.state, "FAIL");
  assert.ok(missing.violations.some((item) => item.code === "GOLDEN_SCENARIO_COUNT_MISMATCH"));
  const failed = deriveGoldenScenarioEvidence(validTap.replace("ok 8 - golden 7: seven", "not ok 8 - golden 7: seven"), { exitCode: 1 });
  assert.equal(failed.state, "FAIL");
  assert.ok(failed.violations.some((item) => item.code === "GOLDEN_SCENARIO_FAILED"));
});

test("golden reporting rejects missing, forged, or claim-incomplete structured receipts even when TAP names pass", () => {
  const missing = deriveGoldenScenarioEvidence(validTap.replace(/^# VIGIA_GOLDEN_SCENARIO_RECEIPT:.*\n/m, ""), { exitCode: 0 });
  assert.equal(missing.state, "FAIL");
  assert.ok(missing.violations.some((item) => item.code === "GOLDEN_RECEIPT_MISSING"));

  const receipt = goldenReceipt("GOLDEN_1");
  const forged = {
    ...receipt,
    repository: { ...receipt.repository, afterRevision: "sha256:forged" },
  };
  const forgedTap = validTap.replace(encodeGoldenScenarioReceiptDiagnostic(receipt), encodeGoldenScenarioReceiptDiagnostic(forged));
  const forgedResult = deriveGoldenScenarioEvidence(forgedTap, { exitCode: 0 });
  assert.equal(forgedResult.state, "FAIL");
  assert.ok(forgedResult.violations.some((item) => item.code === "GOLDEN_RECEIPT_INVALID"));

  const incomplete = createGoldenScenarioReceipt({
    ...receipt,
    claims: receipt.claims.filter((item) => item.code !== "AUTO_VERIFICATION_FALSE"),
  });
  const incompleteTap = validTap.replace(encodeGoldenScenarioReceiptDiagnostic(receipt), encodeGoldenScenarioReceiptDiagnostic(incomplete));
  const incompleteResult = deriveGoldenScenarioEvidence(incompleteTap, {
    exitCode: 0,
  });
  assert.equal(incompleteResult.state, "FAIL");
  assert.ok(incompleteResult.violations.some((item) => item.code === "GOLDEN_RECEIPT_INVALID"));
});
