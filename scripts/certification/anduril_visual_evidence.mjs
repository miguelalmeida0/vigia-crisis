import path from "node:path";
import { releaseIdentityOf } from "../release/runtime_identity_binding.mjs";

export async function validateVisualEvidence({ browserAcceptance, repositoryEvidencePath, readJson, identity, root, rows }) {
  const visualSummaryPath = repositoryEvidencePath(browserAcceptance.evidence.visualQaSummary);
  const visualSummary = await readJson(visualSummaryPath);
  if (!visualSummary) throw new Error("browser_visual_summary_unreadable");
  const visualIdentity = releaseIdentityOf(visualSummary);
  if (!["releaseId", "codeStateHash", "operationalDataHash", "releaseStatementHash"].every((key) => visualIdentity[key] === identity[key]))
    throw new Error("browser_visual_summary_identity_mismatch");
  if (visualSummary.schemaVersion !== "vigia.final-white-visual-qa.v1")
    throw new Error(`browser_visual_summary_schema_invalid:${visualSummary.schemaVersion ?? "missing"}`);
  if (visualSummary.generatedAt !== browserAcceptance.generatedAt) throw new Error("browser_visual_summary_capture_time_mismatch");
  const routeNames = ["command-overview", "incidents", "incident-detail", "intelligence", "operations", "reports-analytics", "global-awareness"];
  const visualRoutes = Object.keys(visualSummary.routes ?? {});
  if (routeNames.some((name) => !visualRoutes.includes(name)) || visualRoutes.length !== routeNames.length)
    throw new Error(`browser_visual_summary_route_set_invalid:${visualRoutes.join(",")}`);
  const requiredVisualGates = [
    "freshRuntimeScreenshots",
    "sevenPrimaryRoutes",
    "noRouteNumbers",
    "removedPrimaryRoutesAbsent",
    "horizontalOverflow",
    "semantics",
    "interactions",
    "consequentialActionReceipts",
    "pageErrors",
    "unexpectedHttpFailures",
  ];
  if (
    !visualSummary.gates ||
    requiredVisualGates.some((key) => visualSummary.gates[key] !== true) ||
    Object.values(visualSummary.gates).some((value) => value !== true)
  )
    throw new Error("browser_visual_summary_gate_not_pass");
  const acceptedRoutePaths = browserAcceptance.evidence.routeScreenshots.map((value) => path.relative(root, repositoryEvidencePath(value)));
  if (new Set(acceptedRoutePaths).size !== routeNames.length || acceptedRoutePaths.some((value) => path.extname(value).toLowerCase() !== ".png"))
    throw new Error("browser_route_artifact_paths_invalid");
  const summaryRoutePaths = routeNames.map((name) => path.relative(root, repositoryEvidencePath(visualSummary.routes[name]?.artifacts?.current)));
  if (acceptedRoutePaths.some((value, index) => value !== summaryRoutePaths[index])) throw new Error("browser_route_artifact_reference_mismatch");
  const responsiveRows = rows(visualSummary.responsiveMatrix);
  const responsiveViewportKeys = ["1672x941", "1600x1000", "1440x900", "1280x800", "1024x768", "768x1024", "430x932", "390x844", "320x568"];
  const responsiveKeys = new Set(responsiveRows.map((item) => `${item.viewport?.width}x${item.viewport?.height}:${item.route}`));
  const missingResponsiveCases = responsiveViewportKeys.flatMap((viewport) =>
    routeNames.filter((route) => !responsiveKeys.has(`${viewport}:${route}`)).map((route) => `${viewport}:${route}`),
  );
  if (missingResponsiveCases.length || responsiveRows.length !== responsiveViewportKeys.length * routeNames.length)
    throw new Error(`browser_responsive_matrix_incomplete:${missingResponsiveCases.join(",")}`);
  const responsiveScreenshots = responsiveRows.map((item) => item.screenshot).filter(Boolean);
  if (
    responsiveScreenshots.length < 21 ||
    new Set(responsiveScreenshots.map((value) => path.relative(root, repositoryEvidencePath(value)))).size !== responsiveScreenshots.length
  )
    throw new Error(`browser_responsive_screenshot_set_incomplete:${responsiveScreenshots.length}`);
  return {
    visualSummaryPath,
    visualSummary,
    routeNames,
    summaryRoutePaths,
    responsiveRows,
    responsiveScreenshots,
  };
}
