import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { deriveGoldenScenarioEvidence, parseNodeTap } from "./anduril_integrity.mjs";

export async function runCertificationTestCohort({ root, artifactRoot, writeJson, writeText }) {
  const requiredTestFiles = [
    "apps/api/test/anduril-crisis-os-golden-scenarios.test.mjs",
    "apps/api/test/anduril-crisis-os-golden-operations.test.mjs",
    "apps/api/test/anduril-crisis-os-golden-planning.test.mjs",
    "apps/api/test/anduril-crisis-os-golden-recovery.test.mjs",
    "apps/api/test/command-intent-workflow.test.mjs",
    "apps/api/test/crisis-autopilot-coordinator.test.mjs",
    "apps/api/test/crisis-planning-canonical-integration.test.mjs",
    "apps/api/test/field-capacity-admission-ledger-binding.test.mjs",
    "apps/api/test/field-capacity-admission-route-scope.test.mjs",
    "apps/api/test/field-capacity-admission.test.mjs",
    "apps/api/test/fieldnet-capacity-golden-flow.test.mjs",
    "apps/api/test/operational-intelligence-service.test.mjs",
    "apps/api/test/operational-period-controlled-abort.test.mjs",
    "apps/api/test/protection-exercise-lifecycle.test.mjs",
    "apps/api/test/response-capability.test.mjs",
    "apps/api/test/response-capability-fieldnet-integrated-golden.test.mjs",
    "apps/api/test/response-capability-fieldnet-task-bridge.test.mjs",
    "apps/api/test/response-capability-reconciler.test.mjs",
    "apps/api/test/response-capability-routing-denominator.test.mjs",
    "apps/field-node/test/field-node-capacity-security.test.mjs",
    "apps/field-node/test/fieldnet-lite-http.test.mjs",
    "apps/field-node/test/fieldnet-lite-ui-http.test.mjs",
    "apps/field-node/test/fieldnet-lite.test.mjs",
    "apps/field-node/test/fieldnet-readiness.test.mjs",
    "packages/domain/test/crisis-autopilot.test.mjs",
    "packages/domain/test/crisis-autopilot-lifecycle.test.mjs",
    "packages/domain/test/crisis-planning-command-hardening.test.mjs",
    "packages/domain/test/crisis-planning.test.mjs",
    "packages/domain/test/crisis-planning-chronology.test.mjs",
    "packages/domain/test/fieldnet-capacity-report-provider.test.mjs",
    "packages/domain/test/fieldnet-lite-contracts.test.mjs",
    "packages/domain/test/intelligence/event-fabric-and-twin.test.mjs",
    "packages/domain/test/response-capability.test.mjs",
    "packages/domain/test/response-recommendation-validity.test.mjs",
  ];
  const additionalCertificationTestFiles = [
    "packages/domain/test/strategic-crisis-intelligence.test.mjs",
    "scripts/certification/anduril_integrity.test.mjs",
    "scripts/certification/anduril_optimizer_integrity.test.mjs",
    "scripts/certification/anduril_incident_truth.test.mjs",
    "scripts/certification/anduril_browser_integrity.test.mjs",
    "scripts/certification/anduril_action_integrity.test.mjs",
    "scripts/certification/anduril_release_integrity.test.mjs",
    "scripts/certification/anduril_feature_availability.test.mjs",
    "scripts/certification/anduril_isolated_capability_proof.test.mjs",
    "scripts/certification/anduril_action_handler_contract.test.mjs",
    "scripts/certification/anduril_response_retrieval_contract.test.mjs",
    "scripts/certification/anduril_response_gates.test.mjs",
    "scripts/certification/anduril_operations_map_analysis.test.mjs",
    "scripts/certification/anduril_gate_state.test.mjs",
    "scripts/certification/anduril_static_facility_audit.test.mjs",
    "scripts/visual-qa/certification_preflight.test.mjs",
    "scripts/visual-qa/cdp_drag_trace_contract.test.mjs",
  ];
  const testFileInventory = [...requiredTestFiles, ...additionalCertificationTestFiles].map((file) => ({
    file,
    requiredBy: requiredTestFiles.includes(file) ? "ANDURIL_AUDIT_COHORT" : "CERTIFICATION_INTEGRITY_CLOSURE",
    state: existsSync(path.join(root, file)) ? "INCLUDED" : "EXCLUDED",
    reason: existsSync(path.join(root, file)) ? null : "FILE_DOES_NOT_EXIST_IN_CURRENT_WORKTREE",
  }));
  const testFiles = testFileInventory.filter((item) => item.state === "INCLUDED").map((item) => item.file);
  const excludedTestFiles = testFileInventory.filter((item) => item.state === "EXCLUDED");
  const testRun = spawnSync(process.execPath, ["--test", "--test-concurrency=1", "--test-reporter=tap", ...testFiles], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, TMPDIR: path.join(root, ".tmp/test") },
    maxBuffer: 50_000_000,
  });
  const testTap = `${testRun.stdout ?? ""}${testRun.stderr ?? ""}`;
  await writeText("release/golden-scenarios.tap.txt", testTap);
  const tapResults = parseNodeTap(testTap);
  const tapComplete =
    Number.isInteger(tapResults.summary.tests) &&
    tapResults.summary.tests === tapResults.tests.length &&
    tapResults.summary.pass === tapResults.tests.filter((item) => item.state === "PASS").length &&
    tapResults.summary.fail === 0 &&
    tapResults.summary.cancelled === 0 &&
    tapResults.summary.skipped === 0 &&
    tapResults.summary.todo === 0;
  const testCohort = {
    schemaVersion: "vigia.anduril-certification-test-cohort.v1",
    generatedAt: new Date().toISOString(),
    requiredFileCount: requiredTestFiles.length,
    includedFileCount: testFiles.length,
    excludedFileCount: excludedTestFiles.length,
    files: testFileInventory,
    exitCode: testRun.status,
    signal: testRun.signal,
    spawnError: testRun.error ? String(testRun.error.message ?? testRun.error) : null,
    tapSummary: tapResults.summary,
    tapComplete,
    state: testRun.status === 0 && excludedTestFiles.length === 0 && tapComplete ? "PASS" : "FAIL",
  };
  await writeJson("release/test-cohort.json", testCohort);
  const tapDerivedGolden = deriveGoldenScenarioEvidence(testTap, {
    exitCode: testRun.status,
    expectedScenarioCount: 9,
  });
  const goldenScenarios = {
    schemaVersion: "vigia.anduril-crisis-os-golden-scenarios.v2",
    generatedAt: new Date().toISOString(),
    universe: "ISOLATED_TEST_FIXTURE",
    productionTruth: false,
    testFiles,
    exitCode: testRun.status,
    state: tapDerivedGolden.state,
    scenarios: tapDerivedGolden.scenarios,
    invariants: tapDerivedGolden.invariants,
    receipts: tapDerivedGolden.receipts,
    tapSummary: tapDerivedGolden.tapSummary,
    violations: tapDerivedGolden.violations,
    truthBoundary:
      "These deterministic fixtures certify software behavior and fail-closed boundaries only. They do not count as production incidents, observations, authority, dispatch, acknowledgements, postconditions, or outcomes.",
  };
  await writeJson("release/golden-scenarios.json", goldenScenarios);
  return {
    requiredTestFiles,
    additionalCertificationTestFiles,
    testFileInventory,
    testFiles,
    excludedTestFiles,
    testRun,
    testTap,
    tapResults,
    tapComplete,
    testCohort,
    tapDerivedGolden,
    goldenScenarios,
  };
}
