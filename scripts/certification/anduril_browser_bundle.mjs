import path from "node:path";

export async function copyAndIndexBrowserEvidence({
  copySpecs,
  copyEvidenceFile,
  browserAcceptance,
  root,
  bundleRoot,
  browserDocumentValidation,
  visualSummary,
  responsiveRows,
}) {
  const entries = [];
  for (const spec of copySpecs)
    entries.push(
      await copyEvidenceFile({
        ...spec,
        capturedAt: browserAcceptance.generatedAt,
      }),
    );
  const evidenceViolations = entries
    .filter((item) => !item.fresh || !item.hashMatchesSource)
    .map((item) => ({
      code: !item.fresh ? "BROWSER_EVIDENCE_FILE_STALE" : "BROWSER_EVIDENCE_HASH_MISMATCH",
      path: item.path,
    }));
  const categoryCounts = Object.fromEntries(
    [...new Set(entries.map((item) => item.category))].map((category) => [category, entries.filter((item) => item.category === category).length]),
  );
  if (categoryCounts.SEVEN_ROUTE_SCREENSHOT !== 7)
    evidenceViolations.push({
      code: "BROWSER_SEVEN_ROUTE_COPY_COUNT_INVALID",
      actual: categoryCounts.SEVEN_ROUTE_SCREENSHOT ?? 0,
    });
  if ((categoryCounts.RESPONSIVE_SCREENSHOT ?? 0) < 21)
    evidenceViolations.push({
      code: "BROWSER_RESPONSIVE_COPY_COUNT_INVALID",
      actual: categoryCounts.RESPONSIVE_SCREENSHOT ?? 0,
    });
  if (!(categoryCounts.INTERACTION_EVIDENCE > 0))
    evidenceViolations.push({
      code: "BROWSER_INTERACTION_COPY_COUNT_INVALID",
      actual: categoryCounts.INTERACTION_EVIDENCE ?? 0,
    });
  if (categoryCounts.CONSEQUENTIAL_ACTION_EVIDENCE !== 1)
    evidenceViolations.push({
      code: "BROWSER_CONSEQUENTIAL_ACTION_COPY_COUNT_INVALID",
      actual: categoryCounts.CONSEQUENTIAL_ACTION_EVIDENCE ?? 0,
    });
  if (categoryCounts.CHROME_TRACE !== 1)
    evidenceViolations.push({
      code: "BROWSER_CHROME_TRACE_COPY_COUNT_INVALID",
      actual: categoryCounts.CHROME_TRACE ?? 0,
    });
  if (categoryCounts.FIELDNET !== 1 || categoryCounts.FIELDNET_TEST_COHORT !== 1 || categoryCounts.FIELDNET_TEST_COHORT_INDEX !== 1)
    evidenceViolations.push({
      code: "BROWSER_FIELDNET_COPY_COUNT_INVALID",
      runtime: categoryCounts.FIELDNET ?? 0,
      cohort: categoryCounts.FIELDNET_TEST_COHORT ?? 0,
      cohortIndex: categoryCounts.FIELDNET_TEST_COHORT_INDEX ?? 0,
    });
  const browserEvidenceIndex = {
    schemaVersion: "vigia.anduril-browser-evidence-index.v1",
    generatedAt: new Date().toISOString(),
    acceptanceGeneratedAt: browserAcceptance.generatedAt,
    bundleRoot: path.relative(root, bundleRoot),
    state: evidenceViolations.length ? "FAIL" : "PASS",
    acceptanceValidation: browserDocumentValidation,
    visualQaSchemaVersion: visualSummary.schemaVersion,
    visualQaGates: visualSummary.gates,
    responsiveMatrixCases: responsiveRows.length,
    categoryCounts,
    entries,
    violations: evidenceViolations,
  };
  return browserEvidenceIndex;
}
