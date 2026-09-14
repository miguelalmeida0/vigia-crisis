import path from "node:path";

export async function buildBrowserCopySpecs(state) {
  const {
    interactionDirectory,
    recursiveFiles,
    artifactRoot,
    readJson,
    identity,
    browserAcceptance,
    browserAcceptancePath,
    visualSummaryPath,
    consequentialActionEvidencePath,
    chromeTracePath,
    summaryRoutePaths,
    routeNames,
    responsiveScreenshots,
    repositoryEvidencePath,
    root,
  } = state;
  const allInteractionFiles = await recursiveFiles(interactionDirectory);
  const interactionByName = new Map(allInteractionFiles.map((value) => [path.basename(value), value]));
  const requiredInteractionNames = [
    ...["command-overview", "incidents", "incident-detail", "intelligence", "operations", "global-awareness"].map((route) => `map-drag-${route}-after.png`),
    "command-quicklook.png",
    "incidents-saved-filter-new-candidates.png",
    "detail-incident-transition-a-b-c.png",
    "intelligence-after-view-on-map.png",
    "operations-prioritized-queue.png",
    "operations-selected-action-inspector.png",
    "reports-summary.png",
    "reports-outcomes.png",
    "reports-performance.png",
    "reports-quality.png",
    "global-after-filter.png",
    "global-fit-results.png",
    "state-labels-200-percent-text-spacing.png",
    "mobile-quicklook-bottom-sheet.png",
  ];
  const missingInteractionEvidence = requiredInteractionNames.filter((name) => !interactionByName.has(name));
  if (missingInteractionEvidence.length) throw new Error(`browser_interaction_evidence_incomplete:${missingInteractionEvidence.join(",")}`);
  const interactionFiles = requiredInteractionNames.map((name) => interactionByName.get(name));
  const fieldnetReadinessPath = path.join(artifactRoot, "fieldnet/runtime-readiness.json");
  const fieldnetReadiness = await readJson(fieldnetReadinessPath);
  if (
    !fieldnetReadiness ||
    fieldnetReadiness.schemaVersion !== "vigia.anduril-fieldnet-runtime-proof.v1" ||
    fieldnetReadiness.readiness?.ready !== true ||
    !["releaseId", "codeStateHash", "operationalDataHash", "releaseStatementHash"].every((key) => fieldnetReadiness[key] === identity[key])
  )
    throw new Error("browser_fieldnet_readiness_evidence_invalid");
  const captureKey = `${browserAcceptance.generatedAt.replace(/[^0-9]/g, "").slice(0, 14)}-${identity.releaseId.split("-").at(-1)}`;
  const bundleRoot = path.join(artifactRoot, "browser/evidence", captureKey);
  const copySpecs = [
    {
      source: browserAcceptancePath,
      destination: path.join(bundleRoot, "acceptance.json"),
      category: "ACCEPTANCE",
    },
    {
      source: visualSummaryPath,
      destination: path.join(bundleRoot, "visual-qa-summary.json"),
      category: "VISUAL_QA_SUMMARY",
    },
    {
      source: consequentialActionEvidencePath,
      destination: path.join(bundleRoot, "interactions/consequential-actions.json"),
      category: "CONSEQUENTIAL_ACTION_EVIDENCE",
    },
    {
      source: chromeTracePath,
      destination: path.join(bundleRoot, "performance/map-drag-chrome-trace.json"),
      category: "CHROME_TRACE",
    },
    {
      source: fieldnetReadinessPath,
      destination: path.join(bundleRoot, "fieldnet/runtime-readiness.json"),
      category: "FIELDNET",
    },
    {
      source: path.join(artifactRoot, "release/golden-scenarios.tap.txt"),
      destination: path.join(bundleRoot, "fieldnet/expanded-certification-cohort.tap.txt"),
      category: "FIELDNET_TEST_COHORT",
    },
    {
      source: path.join(artifactRoot, "release/test-cohort.json"),
      destination: path.join(bundleRoot, "fieldnet/test-cohort.json"),
      category: "FIELDNET_TEST_COHORT_INDEX",
    },
    ...summaryRoutePaths.map((source, index) => ({
      source,
      destination: path.join(bundleRoot, "routes", `${String(index + 1).padStart(2, "0")}-${routeNames[index]}.png`),
      category: "SEVEN_ROUTE_SCREENSHOT",
    })),
    ...responsiveScreenshots.map((source) => ({
      source,
      destination: path.join(
        bundleRoot,
        "responsive",
        path.relative(path.dirname(visualSummaryPath), repositoryEvidencePath(source)).replace(/^\.\.(?:\/|\\)/, ""),
      ),
      category: "RESPONSIVE_SCREENSHOT",
    })),
    ...interactionFiles.map((source) => ({
      source,
      destination: path.join(bundleRoot, "interactions", path.relative(interactionDirectory, source)),
      category: "INTERACTION_EVIDENCE",
    })),
  ];
  return { fieldnetReadinessPath, fieldnetReadiness, bundleRoot, copySpecs };
}
