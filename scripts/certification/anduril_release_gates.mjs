export function createReleaseGates({
  runtimeProof,
  status,
  runtimeIdentityError,
  reproducibilityProof,
  testCohort,
  additionalCertificationTestFiles,
  goldenScenarios,
  canonicalTruthSweep,
}) {
  return {
    releaseIdentity: runtimeProof
      ? status(true, "API, FieldNet, Operator, deployment identity, and manifest share one exact identity quartet.")
      : status(false, runtimeIdentityError ?? "Runtime identity proof unavailable."),
    releaseReproducibility: status(
      reproducibilityProof.state === "PASS",
      reproducibilityProof.state === "PASS"
        ? "One exact release identity survived build, certification/report generation, manifest rebuild, and two distinct cold starts."
        : "The required build/certify/rebuild/two-cold-start reproducibility ledger is incomplete or contradictory.",
      reproducibilityProof,
    ),
    expandedTestCohort: status(
      testCohort.state === "PASS",
      `${testCohort.includedFileCount}/${testCohort.requiredFileCount + additionalCertificationTestFiles.length} required and certification-integrity test files ran; ${testCohort.excludedFileCount} excluded.`,
      testCohort,
    ),
    goldenScenarios: status(
      goldenScenarios.state === "PASS",
      `${goldenScenarios.scenarios.length} isolated deterministic scenarios with ${goldenScenarios.receipts.length} structured service/repository transition receipts; productionTruth=false.`,
      {
        exitCode: goldenScenarios.exitCode,
        receipts: goldenScenarios.receipts.map((receipt) => ({
          scenarioId: receipt.scenarioId,
          receiptId: receipt.receiptId,
          fingerprint: receipt.fingerprint,
          validation: receipt.validation,
        })),
      },
    ),
    canonicalTruthInvariantSweep: status(
      canonicalTruthSweep.state === "PASS",
      `${canonicalTruthSweep.checkedRecords}/${canonicalTruthSweep.expectedRecords} canonical records were checked against the complete active/freshness/verification/identity/priority truth contract; ${canonicalTruthSweep.violationCount} violations.`,
      canonicalTruthSweep,
    ),
  };
}
