import { ANDURIL_BROWSER_SCHEMA, IDENTITY_FIELDS, finiteIso, nonempty, percentile, rows, sameIdentity, variance } from "./anduril_integrity_shared.mjs";
import { validateConsequentialActionEvidence } from "./anduril_action_integrity.mjs";

function validateHardwarePath(name, hardwareSoftwarePath, { requireHardware = false } = {}, violations) {
  if (!hardwareSoftwarePath || typeof hardwareSoftwarePath !== "object" || !Object.keys(hardwareSoftwarePath).length) {
    violations.push({ code: "BROWSER_PERFORMANCE_PATH_MISSING", metric: name });
    return;
  }
  const classification = hardwareSoftwarePath.rendererClassification;
  const rendererValues = [hardwareSoftwarePath.renderer, ...rows(hardwareSoftwarePath.renderers)].filter(nonempty);
  const softwareRenderer = rendererValues.find((value) => /swiftshader|software|llvmpipe|softpipe|microsoft basic render|mesa offscreen/iu.test(String(value)));
  if (!["HARDWARE", "SOFTWARE", "UNAVAILABLE"].includes(classification))
    violations.push({
      code: "BROWSER_PERFORMANCE_RENDERER_CLASSIFICATION_INVALID",
      metric: name,
      actual: classification ?? null,
    });
  if (softwareRenderer)
    violations.push({
      code: "BROWSER_PERFORMANCE_SOFTWARE_RENDERER_DETECTED",
      metric: name,
      renderer: softwareRenderer,
    });
  if (requireHardware && hardwareSoftwarePath.hardwareAccelerationRequired !== true)
    violations.push({
      code: "BROWSER_PERFORMANCE_HARDWARE_REQUIREMENT_MISSING",
      metric: name,
    });
  if (requireHardware && (classification !== "HARDWARE" || softwareRenderer))
    violations.push({
      code: "BROWSER_PERFORMANCE_HARDWARE_REQUIRED",
      metric: name,
      rendererClassification: classification ?? null,
      renderer: hardwareSoftwarePath.renderer ?? null,
    });
}

export function validateDistribution(name, distribution, { minimumSamples, thresholdMs, requireHardware = false }, violations) {
  const samples = Number(distribution?.samples);
  const raw = rows(distribution?.rawSamplesMs);
  if (!Number.isInteger(samples) || samples < minimumSamples)
    violations.push({
      code: "BROWSER_PERFORMANCE_SAMPLES_INSUFFICIENT",
      metric: name,
      minimumSamples,
      samples,
    });
  if (raw.length !== samples || raw.some((value) => !Number.isFinite(value) || value < 0))
    violations.push({
      code: "BROWSER_PERFORMANCE_RAW_SAMPLES_INVALID",
      metric: name,
      declaredSamples: samples,
      rawSamples: raw.length,
    });
  for (const [field, fraction] of [
    ["p50Ms", 0.5],
    ["p95Ms", 0.95],
    ["maxMs", 1],
  ]) {
    const recomputed = percentile(raw, fraction);
    if (recomputed === null || Number(distribution?.[field]) !== recomputed)
      violations.push({
        code: "BROWSER_PERFORMANCE_DISTRIBUTION_MISMATCH",
        metric: name,
        field,
        declared: distribution?.[field] ?? null,
        recomputed,
      });
  }
  const recomputedVariance = variance(raw);
  if (recomputedVariance === null || Number(distribution?.varianceMs2) !== recomputedVariance)
    violations.push({
      code: "BROWSER_PERFORMANCE_VARIANCE_MISMATCH",
      metric: name,
      declared: distribution?.varianceMs2 ?? null,
      recomputed: recomputedVariance,
    });
  if (distribution?.cacheState !== "WARM_CANONICAL_BROWSER_SESSION")
    violations.push({
      code: "BROWSER_PERFORMANCE_CACHE_STATE_INVALID",
      metric: name,
      actual: distribution?.cacheState ?? null,
    });
  validateHardwarePath(name, distribution?.hardwareSoftwarePath, { requireHardware }, violations);
  if (Number.isFinite(thresholdMs) && !(Number(distribution?.p95Ms) < thresholdMs))
    violations.push({
      code: "BROWSER_PERFORMANCE_THRESHOLD_FAILED",
      metric: name,
      p95Ms: distribution?.p95Ms ?? null,
      thresholdMs,
    });
}

export function validateInteractionCohort(name, distribution, violations) {
  const cohort = distribution?.cohort;
  if (!cohort || Number(cohort.distinctIncidents) < 3 || Number(cohort.distinctRoutes) < 2 || Number(cohort.repeatedRunsPerRouteTarget) < 3) {
    violations.push({
      code: "BROWSER_PERFORMANCE_COHORT_INSUFFICIENT",
      metric: name,
      cohort: cohort ?? null,
    });
  }
}

export function validateChromeTraceMetadata(trace, evidencePath, identity, violations) {
  const requiredRoutes = ["command-overview", "incidents", "incident-detail", "intelligence", "operations", "global-awareness"];
  if (!trace || typeof trace !== "object") {
    violations.push({ code: "BROWSER_CHROME_TRACE_METADATA_MISSING" });
    return;
  }
  if (trace.schemaVersion !== "vigia.chrome-devtools-map-drag-trace.v1" || trace.source !== "CHROME_DEVTOOLS_PROTOCOL")
    violations.push({
      code: "BROWSER_CHROME_TRACE_CONTRACT_INVALID",
      schemaVersion: trace.schemaVersion ?? null,
      source: trace.source ?? null,
    });
  if (!sameIdentity(trace, identity)) violations.push({ code: "BROWSER_CHROME_TRACE_IDENTITY_MISMATCH" });
  if (!nonempty(evidencePath) || trace.path !== evidencePath)
    violations.push({
      code: "BROWSER_CHROME_TRACE_PATH_INVALID",
      metadataPath: trace.path ?? null,
      evidencePath: evidencePath ?? null,
    });
  if (!/^sha256:[a-f0-9]{64}$/u.test(String(trace.sha256 ?? "")))
    violations.push({
      code: "BROWSER_CHROME_TRACE_HASH_INVALID",
      actual: trace.sha256 ?? null,
    });
  if (!Number.isInteger(trace.rawEventCount) || trace.rawEventCount <= 0)
    violations.push({
      code: "BROWSER_CHROME_TRACE_EVENTS_MISSING",
      rawEventCount: trace.rawEventCount ?? null,
    });
  if (trace.correlationState !== "PASS" || Number(trace.correlatedFrameSampleCount) < 20 || Number(trace.correlatedInputToPaintSampleCount) < 20)
    violations.push({
      code: "BROWSER_CHROME_TRACE_CORRELATION_INVALID",
      correlationState: trace.correlationState ?? null,
      correlatedFrameSampleCount: trace.correlatedFrameSampleCount ?? null,
      correlatedInputToPaintSampleCount: trace.correlatedInputToPaintSampleCount ?? null,
    });
  const routes = rows(trace.routes);
  if (routes.length !== requiredRoutes.length || requiredRoutes.some((route) => !routes.includes(route)) || new Set(routes).size !== requiredRoutes.length)
    violations.push({ code: "BROWSER_CHROME_TRACE_ROUTE_SET_INVALID", routes });
  if (!Number.isInteger(trace.trialsPerRoute) || trace.trialsPerRoute < 3 || trace.trialCount !== requiredRoutes.length * trace.trialsPerRoute)
    violations.push({
      code: "BROWSER_CHROME_TRACE_TRIAL_COUNT_INVALID",
      trialsPerRoute: trace.trialsPerRoute ?? null,
      trialCount: trace.trialCount ?? null,
    });
  validateHardwarePath("chromeTrace", trace.hardwareSoftwarePath, { requireHardware: true }, violations);
}
