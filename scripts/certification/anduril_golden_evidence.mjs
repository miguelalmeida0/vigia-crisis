import { GOLDEN_SCENARIO_CONTRACTS } from "./anduril_integrity_shared.mjs";
import { parseGoldenScenarioReceiptDiagnostics, parseNodeTap } from "./anduril_golden_tap.mjs";
import { validateGoldenScenarioReceipt } from "./anduril_golden_receipt.mjs";

export function deriveGoldenScenarioEvidence(tapText, { exitCode = null, expectedScenarioCount = 9 } = {}) {
  const tap = parseNodeTap(tapText);
  const scenarios = tap.tests
    .filter((item) => /^golden (?:[1-7]:|planning:|response capacity:)/i.test(item.name))
    .map((item) => ({ ...item, evidence: `TAP:${item.name}` }));
  const invariants = tap.tests.filter((item) => /^invariant:/i.test(item.name)).map((item) => ({ ...item, evidence: `TAP:${item.name}` }));
  const publicObservationInvariant = invariants.find((item) => /public field observations remain unverified/i.test(item.name));
  const diagnostics = parseGoldenScenarioReceiptDiagnostics(tapText);
  const receiptValidations = diagnostics.receipts.map((receipt) => ({
    receipt,
    validation: validateGoldenScenarioReceipt(receipt),
  }));
  const receiptByScenario = new Map();
  for (const row of receiptValidations) {
    const existing = receiptByScenario.get(row.receipt?.scenarioId) ?? [];
    existing.push(row);
    receiptByScenario.set(row.receipt?.scenarioId, existing);
  }
  const duplicateScenarioNames = scenarios
    .filter((item, index) => scenarios.findIndex((candidate) => candidate.name === item.name) !== index)
    .map((item) => item.name);
  const violations = [];
  if (exitCode !== 0) violations.push({ code: "TEST_PROCESS_FAILED", exitCode });
  if (scenarios.length !== expectedScenarioCount)
    violations.push({
      code: "GOLDEN_SCENARIO_COUNT_MISMATCH",
      expected: expectedScenarioCount,
      actual: scenarios.length,
    });
  if (duplicateScenarioNames.length)
    violations.push({
      code: "DUPLICATE_GOLDEN_SCENARIO",
      names: [...new Set(duplicateScenarioNames)],
    });
  if (scenarios.some((item) => item.state !== "PASS"))
    violations.push({
      code: "GOLDEN_SCENARIO_FAILED",
      names: scenarios.filter((item) => item.state !== "PASS").map((item) => item.name),
    });
  if (!publicObservationInvariant || publicObservationInvariant.state !== "PASS") violations.push({ code: "PUBLIC_OBSERVATION_INVARIANT_NOT_PROVEN" });
  violations.push(...diagnostics.parseErrors);
  for (const [scenarioId, contract] of Object.entries(GOLDEN_SCENARIO_CONTRACTS)) {
    const matching = receiptByScenario.get(scenarioId) ?? [];
    const matchingTest = scenarios.find((item) => contract.testName.test(item.name));
    if (matching.length !== 1)
      violations.push({
        code: matching.length ? "GOLDEN_RECEIPT_DUPLICATE" : "GOLDEN_RECEIPT_MISSING",
        scenarioId,
        actual: matching.length,
      });
    else {
      if (matching[0].validation.state !== "PASS")
        violations.push({
          code: "GOLDEN_RECEIPT_INVALID",
          scenarioId,
          violations: matching[0].validation.violations,
        });
      if (!matchingTest || matchingTest.state !== "PASS" || matching[0].receipt.testName !== matchingTest.name)
        violations.push({
          code: "GOLDEN_RECEIPT_TAP_BINDING_INVALID",
          scenarioId,
          receiptTestName: matching[0].receipt.testName ?? null,
          tapTestName: matchingTest?.name ?? null,
        });
    }
  }
  for (const scenarioId of receiptByScenario.keys())
    if (!Object.hasOwn(GOLDEN_SCENARIO_CONTRACTS, scenarioId)) violations.push({ code: "GOLDEN_RECEIPT_UNEXPECTED", scenarioId });
  return {
    schemaVersion: "vigia.anduril-tap-derived-golden-scenarios.v2",
    state: violations.length ? "FAIL" : "PASS",
    exitCode,
    expectedScenarioCount,
    observedScenarioCount: scenarios.length,
    scenarios,
    invariants,
    receipts: receiptValidations.map(({ receipt, validation }) => ({
      ...receipt,
      validation,
    })),
    tapSummary: tap.summary,
    violations,
  };
}
