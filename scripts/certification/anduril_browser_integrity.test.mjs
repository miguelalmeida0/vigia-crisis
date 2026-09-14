import assert from "node:assert/strict";
import test from "node:test";
import { validateBrowserAcceptanceDocument, validateConsequentialActionEvidence } from "./anduril_integrity.mjs";
import {
  browserAcceptance, browserRequired, consequentialActionEvidence, controlledActionKinds, distribution, identity,
} from "./anduril_browser_integrity.fixtures.mjs";
import { ACTION_HANDLER_SOURCE_PATHS } from "./anduril_action_handler_contract.mjs";
test("browser acceptance validates schema, full identity, freshness, paths, raw samples, and acceptance state", () => {
  const result = validateBrowserAcceptanceDocument(browserAcceptance(), {
    identity,
    releaseBuiltAt: "2026-09-04T12:00:00.000Z",
    now: new Date("2026-09-04T12:10:00.000Z"),
    requiredBooleans: browserRequired,
  });
  assert.equal(result.state, "PASS");
  assert.equal(result.actionIntegrity.state, "PASS");
});
const browserNegativeCases = [
  [
    "BROWSER_ACCEPTANCE_SCHEMA_INVALID",
    (value) => {
      value.schemaVersion = "legacy";
    },
  ],
  [
    "BROWSER_ACCEPTANCE_STATE_NOT_PASS",
    (value) => {
      value.state = "FAIL";
    },
  ],
  [
    "BROWSER_IDENTITY_MISMATCH",
    (value) => {
      value.operationalDataHash = "sha256:other";
    },
  ],
  [
    "BROWSER_IDENTITY_FIELD_MISSING",
    (value) => {
      delete value.releaseStatementHash;
    },
  ],
  [
    "BROWSER_CAPTURE_PREDATES_RELEASE",
    (value) => {
      value.generatedAt = "2026-09-04T11:00:00.000Z";
    },
  ],
  [
    "BROWSER_CAPTURE_STALE",
    (value) => {
      value.generatedAt = "2026-09-04T09:00:00.000Z";
    },
  ],
  [
    "BROWSER_REQUIRED_GATE_NOT_TRUE",
    (value) => {
      value.deadControlsZero = false;
    },
  ],
  [
    "BROWSER_CONSEQUENTIAL_ACTION_EVIDENCE_INVALID",
    (value) => {
      value.actionIntegrity.executions[0].canonical.refreshCompleted = false;
    },
  ],
  [
    "BROWSER_OPERATOR_CAPABILITY_EVIDENCE_INVALID",
    (value) => {
      value.operatorCapabilityEvidence.responseCapability = { state: "PASS", observations: [] };
    },
  ],
  [
    "BROWSER_OPERATOR_CAPABILITY_EVIDENCE_INVALID",
    (value) => {
      value.operatorCapabilityEvidence.dynamicExposureGraph.observations[0].projectedState = "WITHHELD_INSUFFICIENT_INPUT";
    },
  ],
  [
    "BROWSER_FIELDNET_RUNTIME_EVIDENCE_INVALID",
    (value) => {
      value.fieldNetRuntimeEvidence.readiness.ready = false;
    },
  ],
  [
    "BROWSER_FIELDNET_LITE_EXERCISE_INVALID",
    (value) => {
      value.fieldNetLiteBrowserExercise.synchronizedReceiptCount = 0;
    },
  ],
  [
    "BROWSER_CONSEQUENTIAL_ACTION_EVIDENCE_INVALID",
    (value) => {
      value.actionIntegrity.releaseId = "vigia-intelligence-fabric-other";
    },
  ],
  [
    "BROWSER_CONSEQUENTIAL_ACTION_EVIDENCE_PATH_MISSING",
    (value) => {
      delete value.evidence.consequentialActionEvidence;
    },
  ],
  [
    "BROWSER_ROUTE_SCREENSHOT_PATHS_INVALID",
    (value) => {
      value.evidence.routeScreenshots.pop();
    },
  ],
  [
    "BROWSER_PERFORMANCE_RAW_SAMPLES_INVALID",
    (value) => {
      value.performance.quicklookUsefulContent.rawSamplesMs.pop();
    },
  ],
  [
    "BROWSER_PERFORMANCE_DISTRIBUTION_MISMATCH",
    (value) => {
      value.performance.incidentSwitchUsefulContent.p95Ms = 1;
    },
  ],
  [
    "BROWSER_PERFORMANCE_COHORT_INSUFFICIENT",
    (value) => {
      value.performance.quicklookUsefulContent.cohort.distinctRoutes = 1;
    },
  ],
  [
    "BROWSER_PERFORMANCE_VARIANCE_MISMATCH",
    (value) => {
      value.performance.quicklookUsefulContent.varianceMs2 = 1;
    },
  ],
  [
    "BROWSER_PERFORMANCE_CACHE_STATE_INVALID",
    (value) => {
      value.performance.quicklookUsefulContent.cacheState = "UNKNOWN";
    },
  ],
  [
    "BROWSER_PERFORMANCE_PATH_MISSING",
    (value) => {
      value.performance.quicklookUsefulContent.hardwareSoftwarePath = null;
    },
  ],
  [
    "BROWSER_PERFORMANCE_THRESHOLD_FAILED",
    (value) => {
      value.performance.mapPointerToPaint = distribution([20, 21, 22]);
    },
  ],
  [
    "BROWSER_PERFORMANCE_HARDWARE_REQUIRED",
    (value) => {
      value.performance.mapPointerToPaint.hardwareSoftwarePath.renderer = "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))";
      value.performance.mapPointerToPaint.hardwareSoftwarePath.rendererClassification = "SOFTWARE";
    },
  ],
  [
    "BROWSER_PERFORMANCE_SOFTWARE_RENDERER_DETECTED",
    (value) => {
      value.performance.mapPointerToPaint.hardwareSoftwarePath.renderer = "ANGLE (Google, SwiftShader Device)";
      value.performance.mapPointerToPaint.hardwareSoftwarePath.renderers = ["ANGLE (Google, SwiftShader Device)"];
      value.performance.mapPointerToPaint.hardwareSoftwarePath.rendererClassification = "HARDWARE";
    },
  ],
  [
    "BROWSER_CHROME_TRACE_PATH_MISSING",
    (value) => {
      delete value.evidence.chromeTrace;
    },
  ],
  [
    "BROWSER_CHROME_TRACE_CONTRACT_INVALID",
    (value) => {
      value.performance.chromeTrace.source = "SYNTHETIC_RAF";
    },
  ],
  [
    "BROWSER_CHROME_TRACE_CORRELATION_INVALID",
    (value) => {
      value.performance.chromeTrace.correlationState = "FAIL";
    },
  ],
  [
    "BROWSER_PERFORMANCE_TRACE_SOURCE_INVALID",
    (value) => {
      value.performance.mapDragFrameTime.measurementSource = "INJECTED_RAF";
    },
  ],
  [
    "BROWSER_CHROME_TRACE_TRIAL_COUNT_INVALID",
    (value) => {
      value.performance.chromeTrace.trialsPerRoute = 1;
      value.performance.chromeTrace.trialCount = 6;
    },
  ],
  [
    "BROWSER_PERFORMANCE_HARDWARE_REQUIRED",
    (value) => {
      value.performance.chromeTrace.hardwareSoftwarePath.renderer = "SwiftShader Device";
      value.performance.chromeTrace.hardwareSoftwarePath.rendererClassification = "SOFTWARE";
    },
  ],
];

for (const [expectedCode, mutate] of browserNegativeCases) {
  test(`browser acceptance rejects negative fixture ${expectedCode}`, () => {
    const value = browserAcceptance();
    mutate(value);
    const result = validateBrowserAcceptanceDocument(value, {
      identity,
      releaseBuiltAt: "2026-09-04T12:00:00.000Z",
      now: new Date("2026-09-04T12:10:00.000Z"),
      requiredBooleans: browserRequired,
    });
    assert.equal(result.state, "FAIL");
    assert.ok(result.violations.some((item) => item.code === expectedCode));
  });
}
