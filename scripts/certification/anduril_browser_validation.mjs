import path from "node:path";
import { validateBrowserAcceptanceDocument } from "./anduril_integrity.mjs";
import { inspectActionHandlerSources } from "./anduril_action_handler_contract.mjs";

export async function validateBrowserRun({ artifactRoot, readJson, numberAt, sha256File, root, identity, manifest, browserRequired: suppliedBrowserRequired }) {
  const browserAcceptancePath = path.join(artifactRoot, "browser/acceptance.json");
  const browserAcceptance = await readJson(browserAcceptancePath);
  const browserRequired = [
    "freshSevenRouteScreenshots",
    "deadControlsZero",
    "consequentialActionsReceiptBacked",
    "toastOnlyMutationsZero",
    "genericInspectZero",
    "mapListQuicklookMismatchZero",
    "thermalPixelsAsPerimeterZero",
    "terrainMissingForValidCoveredCoordinatesZero",
    "statusLabelLayoutDefectsZero",
    "mapRemountsZero",
    "styleReloadsZero",
    "keyboardPass",
    "responsivePass",
  ];
  const browserPerformance = browserAcceptance?.performance ?? {};
  const quicklookP95Ms = numberAt(browserPerformance.quicklookUsefulContent?.p95Ms, browserAcceptance?.quicklookUsefulContentP95Ms);
  const incidentSwitchP95Ms = numberAt(browserPerformance.incidentSwitchUsefulContent?.p95Ms, browserAcceptance?.incidentSwitchUsefulContentP95Ms);
  const mapPointerP95Ms = numberAt(browserPerformance.mapPointerToPaint?.p95Ms, browserAcceptance?.mapPointerToPaintP95Ms);
  const mapDragFrameP95Ms = numberAt(browserPerformance.mapDragFrameTime?.p95Ms);
  const operatorActionHandlerContract = await inspectActionHandlerSources(root);
  const browserDocumentValidation = validateBrowserAcceptanceDocument(browserAcceptance, {
    identity,
    releaseBuiltAt: manifest.buildTimestamp,
    now: new Date(),
    maximumAgeMs: 2 * 60 * 60 * 1000,
    requiredBooleans: browserRequired,
    handlerSourceSha256: operatorActionHandlerContract.sourceSha256,
    handlerSources: operatorActionHandlerContract.sources,
  });
  const browserIdentityMatches = browserDocumentValidation.identityMatches === true;
  const browserMetricPass =
    quicklookP95Ms !== null &&
    quicklookP95Ms < 500 &&
    incidentSwitchP95Ms !== null &&
    incidentSwitchP95Ms < 750 &&
    mapPointerP95Ms !== null &&
    mapPointerP95Ms < 20 &&
    mapDragFrameP95Ms !== null;
  return {
    browserAcceptancePath,
    browserAcceptance,
    browserRequired,
    browserPerformance,
    quicklookP95Ms,
    incidentSwitchP95Ms,
    mapPointerP95Ms,
    mapDragFrameP95Ms,
    operatorActionHandlerContract,
    browserDocumentValidation,
    browserIdentityMatches,
    browserMetricPass,
  };
}
