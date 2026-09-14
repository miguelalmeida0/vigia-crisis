import { consequentialActionEvidence, distribution, identity } from "./anduril_action_integrity.fixtures.mjs";
import { ANDURIL_BROWSER_SCHEMA, P0_OPERATOR_CAPABILITIES } from "./anduril_integrity.mjs";
export * from "./anduril_action_integrity.fixtures.mjs";

export const browserRequired = ["freshSevenRouteScreenshots", "deadControlsZero", "consequentialActionsReceiptBacked"];
export const browserAcceptance = () => ({
  schemaVersion: ANDURIL_BROWSER_SCHEMA,
  generatedAt: "2026-09-04T12:03:00.000Z",
  state: "PASS",
  ...identity,
  freshSevenRouteScreenshots: true,
  deadControlsZero: true,
  consequentialActionsReceiptBacked: true,
  actionIntegrity: consequentialActionEvidence(),
  fieldNetRuntimeEvidence: {
    schemaVersion: "vigia.fieldnet-browser-runtime-evidence.v1",
    state: "PASS",
    origin: "http://127.0.0.1:4188",
    readinessStatus: 200,
    releaseStatus: 200,
    readiness: { ready: true, ...identity },
    release: { ...identity },
    identityMatches: true,
    surfaceClass: "DIRECT_FIELDNET_RUNTIME_READINESS_PLUS_REQUIRED_INTEGRATED_FIELDNET_TEST",
    ...identity,
  },
  fieldNetLiteBrowserExercise: {
    schemaVersion: "vigia.fieldnet-lite-browser-exercise.v1",
    state: "PASS",
    universe: "ISOLATED_BROWSER_EXERCISE",
    productionTruth: false,
    renderedFieldInterface: true,
    protectedSession: true,
    taskVisibleAndActionable: true,
    offlineQueueCount: 3,
    synchronizedReceiptCount: 3,
    offlineScreenshot: ".artifacts/final-white-vigia/interaction-evidence/fieldnet-lite-offline-queue.png",
    synchronizedScreenshot: ".artifacts/final-white-vigia/interaction-evidence/fieldnet-lite-synchronized.png",
    offlineScreenshotSha256: `sha256:${"c".repeat(64)}`,
    synchronizedScreenshotSha256: `sha256:${"d".repeat(64)}`,
    generatedAt: "2026-09-04T12:03:00.000Z",
    truthBoundary: "Isolated browser exercise only; not production truth.",
    ...identity,
  },
  operatorCapabilityEvidence: Object.fromEntries(
    P0_OPERATOR_CAPABILITIES.map((capability) => [
      capability,
      {
        state: "PASS",
        observations: [{ route: "operations", selector: `[data-capability="${capability}"]`, requiredText: capability, visibleCount: 1, textLength: 80, contentMatch: true, featureSpecificNode: true, matchedText: capability, projectedState: "ADMITTED" }],
      },
    ]),
  ),
  evidence: {
    visualQaSummary: ".artifacts/final-white-vigia/visual-qa-summary.json",
    routeScreenshots: Array.from({ length: 7 }, (_, index) => `.artifacts/final-white-vigia/${index + 1}/current.png`),
    interactionEvidenceDirectory: ".artifacts/final-white-vigia/interaction-evidence",
    consequentialActionEvidence: ".artifacts/final-white-vigia/interaction-evidence/consequential-actions.json",
    chromeTrace: ".artifacts/final-white-vigia/interaction-evidence/map-drag-chrome-trace.json",
  },
  performance: {
    quicklookUsefulContent: {
      ...distribution(Array.from({ length: 21 }, (_, index) => 10 + index)),
      cohort: {
        distinctIncidents: 3,
        distinctRoutes: 3,
        repeatedRunsPerRouteTarget: 7,
      },
    },
    incidentSwitchUsefulContent: {
      ...distribution(Array.from({ length: 21 }, (_, index) => 20 + index)),
      cohort: {
        distinctIncidents: 3,
        distinctRoutes: 3,
        repeatedRunsPerRouteTarget: 7,
      },
    },
    mapPointerToPaint: {
      ...distribution(Array.from({ length: 20 }, (_, index) => 4 + index / 10)),
      measurementSource: "CHROME_DEVTOOLS_PROTOCOL_TRACE_EVENTS",
    },
    mapDragFrameTime: {
      ...distribution(Array.from({ length: 20 }, (_, index) => 8 + index / 10)),
      measurementSource: "CHROME_DEVTOOLS_PROTOCOL_TRACE_EVENTS",
    },
    chromeTrace: {
      schemaVersion: "vigia.chrome-devtools-map-drag-trace.v1",
      source: "CHROME_DEVTOOLS_PROTOCOL",
      capturedAt: "2026-09-04T12:03:00.000Z",
      ...identity,
      path: ".artifacts/final-white-vigia/interaction-evidence/map-drag-chrome-trace.json",
      sha256: `sha256:${"b".repeat(64)}`,
      rawEventCount: 1_000,
      correlationState: "PASS",
      correlatedFrameSampleCount: 20,
      correlatedInputToPaintSampleCount: 20,
      routes: ["command-overview", "incidents", "incident-detail", "intelligence", "operations", "global-awareness"],
      routeCount: 6,
      trialsPerRoute: 3,
      trialCount: 18,
      hardwareSoftwarePath: distribution([1, 2, 3]).hardwareSoftwarePath,
    },
  },
});
