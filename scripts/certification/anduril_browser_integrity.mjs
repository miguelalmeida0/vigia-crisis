import { ANDURIL_BROWSER_SCHEMA, IDENTITY_FIELDS, P0_OPERATOR_CAPABILITIES, finiteIso, nonempty, rows, sameIdentity } from "./anduril_integrity_shared.mjs";
import { validateConsequentialActionEvidence } from "./anduril_action_integrity.mjs";
import { validateChromeTraceMetadata, validateDistribution, validateInteractionCohort } from "./anduril_browser_performance_integrity.mjs";

function validateFieldNetRuntimeEvidence(evidence, identity, violations) {
  const validIdentity = IDENTITY_FIELDS.every(
    (field) => nonempty(evidence?.[field]) && evidence[field] === identity?.[field],
  );
  const readinessIdentity = IDENTITY_FIELDS.every(
    (field) => evidence?.readiness?.[field] === identity?.[field],
  );
  const releaseIdentity = IDENTITY_FIELDS.every(
    (field) => evidence?.release?.[field] === identity?.[field],
  );
  if (
    evidence?.schemaVersion !== "vigia.fieldnet-browser-runtime-evidence.v1" ||
    evidence?.state !== "PASS" ||
    evidence?.readinessStatus !== 200 ||
    evidence?.releaseStatus !== 200 ||
    evidence?.readiness?.ready !== true ||
    evidence?.identityMatches !== true ||
    evidence?.surfaceClass !== "DIRECT_FIELDNET_RUNTIME_READINESS_PLUS_REQUIRED_INTEGRATED_FIELDNET_TEST" ||
    !validIdentity ||
    !readinessIdentity ||
    !releaseIdentity
  )
    violations.push({
      code: "BROWSER_FIELDNET_RUNTIME_EVIDENCE_INVALID",
      evidence: evidence ?? null,
    });
}
function validateFieldNetLiteBrowserExercise(evidence, identity, violations) {
  const identityMatches = IDENTITY_FIELDS.every(
    (field) => nonempty(evidence?.[field]) && evidence[field] === identity?.[field],
  );
  if (
    evidence?.schemaVersion !== "vigia.fieldnet-lite-browser-exercise.v1" ||
    evidence?.state !== "PASS" ||
    evidence?.universe !== "ISOLATED_BROWSER_EXERCISE" ||
    evidence?.productionTruth !== false ||
    evidence?.renderedFieldInterface !== true ||
    evidence?.protectedSession !== true ||
    evidence?.taskVisibleAndActionable !== true ||
    !Number.isInteger(evidence?.offlineQueueCount) ||
    evidence.offlineQueueCount < 3 ||
    !Number.isInteger(evidence?.synchronizedReceiptCount) ||
    evidence.synchronizedReceiptCount < 3 ||
    !nonempty(evidence?.offlineScreenshot) ||
    !nonempty(evidence?.synchronizedScreenshot) ||
    !/^sha256:[a-f0-9]{64}$/.test(evidence?.offlineScreenshotSha256 ?? "") ||
    !/^sha256:[a-f0-9]{64}$/.test(evidence?.synchronizedScreenshotSha256 ?? "") ||
    !finiteIso(evidence?.generatedAt) ||
    !nonempty(evidence?.truthBoundary) ||
    !identityMatches
  )
    violations.push({ code: "BROWSER_FIELDNET_LITE_EXERCISE_INVALID", evidence: evidence ?? null });
}
export function validateBrowserAcceptanceDocument(
  document,
  {
    identity,
    releaseBuiltAt,
    now = new Date(),
    maximumAgeMs = 2 * 60 * 60 * 1000,
    requiredBooleans = [],
    handlerSourceSha256 = null,
    handlerSources = null,
  } = {},
) {
  const violations = [];
  if (!document || typeof document !== "object")
    return {
      state: "FAIL",
      violations: [{ code: "BROWSER_ACCEPTANCE_MISSING" }],
    };
  if (document.schemaVersion !== ANDURIL_BROWSER_SCHEMA)
    violations.push({
      code: "BROWSER_ACCEPTANCE_SCHEMA_INVALID",
      expected: ANDURIL_BROWSER_SCHEMA,
      actual: document.schemaVersion ?? null,
    });
  if (document.state !== "PASS")
    violations.push({
      code: "BROWSER_ACCEPTANCE_STATE_NOT_PASS",
      actual: document.state ?? null,
    });
  for (const field of IDENTITY_FIELDS) {
    if (!nonempty(document[field])) violations.push({ code: "BROWSER_IDENTITY_FIELD_MISSING", field });
    else if (document[field] !== identity?.[field])
      violations.push({
        code: "BROWSER_IDENTITY_MISMATCH",
        field,
        expected: identity?.[field] ?? null,
        actual: document[field],
      });
  }
  const capturedAtMs = Date.parse(document.generatedAt ?? "");
  const builtAtMs = Date.parse(releaseBuiltAt ?? "");
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now ?? "");
  if (!Number.isFinite(capturedAtMs))
    violations.push({
      code: "BROWSER_CAPTURE_TIME_INVALID",
      value: document.generatedAt ?? null,
    });
  else {
    if (Number.isFinite(builtAtMs) && capturedAtMs < builtAtMs)
      violations.push({
        code: "BROWSER_CAPTURE_PREDATES_RELEASE",
        capturedAt: document.generatedAt,
        releaseBuiltAt,
      });
    if (Number.isFinite(nowMs) && capturedAtMs > nowMs + 5 * 60 * 1000)
      violations.push({
        code: "BROWSER_CAPTURE_TIME_IN_FUTURE",
        capturedAt: document.generatedAt,
      });
    if (Number.isFinite(nowMs) && nowMs - capturedAtMs > maximumAgeMs)
      violations.push({
        code: "BROWSER_CAPTURE_STALE",
        capturedAt: document.generatedAt,
        maximumAgeMs,
      });
  }
  for (const key of requiredBooleans)
    if (document[key] !== true)
      violations.push({
        code: "BROWSER_REQUIRED_GATE_NOT_TRUE",
        key,
        actual: document[key] ?? null,
      });
  const actionIntegrity = validateConsequentialActionEvidence(document.actionIntegrity, {
    identity,
    generatedAt: document.generatedAt,
    handlerSourceSha256,
    handlerSources,
  });
  if (actionIntegrity.state !== "PASS")
    violations.push({
      code: "BROWSER_CONSEQUENTIAL_ACTION_EVIDENCE_INVALID",
      violations: actionIntegrity.violations,
    });
  const capabilityEvidence = document.operatorCapabilityEvidence;
  for (const capability of P0_OPERATOR_CAPABILITIES) {
    const evidence = capabilityEvidence?.[capability];
    const observations = rows(evidence?.observations);
    if (
      !["PASS", "FAIL"].includes(evidence?.state) ||
      observations.some(
        (item) =>
          !nonempty(item?.route) ||
          !nonempty(item?.selector) ||
          !nonempty(item?.requiredText) ||
          !Number.isInteger(item?.visibleCount) ||
          item.visibleCount < 1 ||
          item.textLength < 20 ||
          item.contentMatch !== true ||
          item.featureSpecificNode !== true ||
          !nonempty(item.matchedText) ||
          !nonempty(item.projectedState) ||
          (evidence?.state === "PASS" && /(?:^|_)(?:WITHHELD|UNAVAILABLE|NOT_AVAILABLE|NOT_APPLICABLE|ABSTAINED|INVALID)(?:_|$)/i.test(item.projectedState)),
      ) ||
      (evidence?.state === "PASS" && observations.length === 0)
    )
      violations.push({ code: "BROWSER_OPERATOR_CAPABILITY_EVIDENCE_INVALID", capability, evidence: evidence ?? null });
  }
  validateFieldNetRuntimeEvidence(document.fieldNetRuntimeEvidence, identity, violations);
  validateFieldNetLiteBrowserExercise(document.fieldNetLiteBrowserExercise, identity, violations);
  const evidence = document.evidence;
  if (!evidence || typeof evidence !== "object") violations.push({ code: "BROWSER_EVIDENCE_INDEX_MISSING" });
  else {
    if (!nonempty(evidence.visualQaSummary)) violations.push({ code: "BROWSER_VISUAL_SUMMARY_PATH_MISSING" });
    const screenshots = rows(evidence.routeScreenshots);
    if (screenshots.length !== 7 || new Set(screenshots).size !== 7 || screenshots.some((item) => !nonempty(item)))
      violations.push({
        code: "BROWSER_ROUTE_SCREENSHOT_PATHS_INVALID",
        count: screenshots.length,
        unique: new Set(screenshots).size,
      });
    if (!nonempty(evidence.interactionEvidenceDirectory)) violations.push({ code: "BROWSER_INTERACTION_EVIDENCE_PATH_MISSING" });
    if (!nonempty(evidence.consequentialActionEvidence))
      violations.push({
        code: "BROWSER_CONSEQUENTIAL_ACTION_EVIDENCE_PATH_MISSING",
      });
    if (!nonempty(evidence.chromeTrace)) violations.push({ code: "BROWSER_CHROME_TRACE_PATH_MISSING" });
  }
  validateDistribution("quicklookUsefulContent", document.performance?.quicklookUsefulContent, { minimumSamples: 20, thresholdMs: 500 }, violations);
  validateInteractionCohort("quicklookUsefulContent", document.performance?.quicklookUsefulContent, violations);
  validateDistribution("incidentSwitchUsefulContent", document.performance?.incidentSwitchUsefulContent, { minimumSamples: 20, thresholdMs: 750 }, violations);
  validateInteractionCohort("incidentSwitchUsefulContent", document.performance?.incidentSwitchUsefulContent, violations);
  validateDistribution(
    "mapPointerToPaint",
    document.performance?.mapPointerToPaint,
    { minimumSamples: 20, thresholdMs: 20, requireHardware: true },
    violations,
  );
  validateDistribution(
    "mapDragFrameTime",
    document.performance?.mapDragFrameTime,
    { minimumSamples: 20, thresholdMs: 20.01, requireHardware: true },
    violations,
  );
  for (const metric of ["mapPointerToPaint", "mapDragFrameTime"])
    if (document.performance?.[metric]?.measurementSource !== "CHROME_DEVTOOLS_PROTOCOL_TRACE_EVENTS")
      violations.push({
        code: "BROWSER_PERFORMANCE_TRACE_SOURCE_INVALID",
        metric,
        actual: document.performance?.[metric]?.measurementSource ?? null,
      });
  validateChromeTraceMetadata(document.performance?.chromeTrace, evidence?.chromeTrace, identity, violations);
  return {
    schemaVersion: "vigia.anduril-browser-acceptance-ingestion.v1",
    state: violations.length ? "FAIL" : "PASS",
    capturedAt: finiteIso(document.generatedAt) ? new Date(document.generatedAt).toISOString() : null,
    ageMs: Number.isFinite(capturedAtMs) && Number.isFinite(nowMs) ? nowMs - capturedAtMs : null,
    identityMatches: sameIdentity(document, identity),
    actionIntegrity,
    violations,
  };
}
