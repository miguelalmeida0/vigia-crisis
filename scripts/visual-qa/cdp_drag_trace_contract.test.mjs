import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("canonical VQA captures a real streamed Chrome trace across every map route and repeated continuous drags", async () => {
  const source = await read("scripts/visual-qa/final_white_capture.py");
  for (const token of [
    "context.new_cdp_session(page)",
    "Tracing.start",
    "Tracing.end",
    "Tracing.tracingComplete",
    "ReturnAsStream",
    '"streamCompression": "gzip"',
    "IO.read",
    "IO.close",
    "CHROME_DEVTOOLS_PROTOCOL",
    "CDP_DRAG_ROUTES = [",
    '"intelligence", "operations", "global-awareness"',
    "CDP_DRAG_TRIALS_PER_ROUTE = 3",
    "steps = 48",
    "correlate_trace_trial",
    "CHROME_DEVTOOLS_PROTOCOL_TRACE_EVENTS",
    "inputToPaintMs",
    "frameIntervalsMs",
  ])
    assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), token);
  assert.match(source, /deadline = time\.monotonic\(\) \+ 180/, "trace certification must allow Docker to flush the complete ReturnAsStream handle");
  assert.match(source, /gzip\.decompress\(b""\.join\(chunks\)\)/, "compressed CDP streams must be restored before trace validation");
  assert.match(source, /event\.get\("ph"\) in \{"b", "B"\}/, "Chrome async User Timing begin events must define real trace windows");
  assert.match(source, /event\.get\("ph"\) in \{"e", "E"\}/, "Chrome async User Timing end events must define real trace windows");
  assert.doesNotMatch(source, /schemaVersion["']\s*:\s*["']vigia\.chrome-drag-trace\.v1/);
});

test("runtime rAF telemetry remains diagnostic and certification uses correlated trace events", async () => {
  const [mapSource, telemetrySource] = await Promise.all([
    read("apps/operator-console/src/mapRuntime.js"),
    read("apps/operator-console/src/mapPerformance.js"),
  ]);
  assert.match(mapSource, /requestAnimationFrame\(postRenderAt => requestAnimationFrame\(\(\) =>/);
  assert.match(mapSource, /mapPointerToPostRenderSamples/);
  assert.match(telemetrySource, /vigia\.map-drag-raf-telemetry\.v1/);
  assert.doesNotMatch(telemetrySource, /vigia\.chrome-drag-trace\.v1/);
  const capture = await read("scripts/visual-qa/final_white_capture.py");
  assert.match(capture, /trial\.get\("traceCorrelation", \{\}\)\.get\("inputToPaintMs", \[\]\)/);
  assert.match(capture, /frame_performance\["measurementSource"\] = "CHROME_DEVTOOLS_PROTOCOL_TRACE_EVENTS"/);
});

test("certification requires hardware CDP evidence and copies the raw trace as a distinct artifact", async () => {
  const [browserIntegrity, performanceIntegrity, certifier, interactionTrace, browserBundle, browserCopySpecs, dockerRunner] = await Promise.all([
    read("scripts/certification/anduril_browser_integrity.mjs"),
    read("scripts/certification/anduril_browser_performance_integrity.mjs"),
    read("scripts/certify_anduril_crisis_os.mjs"),
    read("scripts/certification/anduril_interaction_trace.mjs"),
    read("scripts/certification/anduril_browser_bundle.mjs"),
    read("scripts/certification/anduril_browser_copy_specs.mjs"),
    read("scripts/visual-qa/runner_docker.mjs"),
  ]);
  const integrity = `${browserIntegrity}\n${performanceIntegrity}`;
  for (const token of ["BROWSER_PERFORMANCE_HARDWARE_REQUIRED", "vigia.chrome-devtools-map-drag-trace.v1", "CHROME_DEVTOOLS_PROTOCOL", "mapDragFrameTime"])
    assert.match(integrity, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const certificationSources = `${certifier}\n${interactionTrace}\n${browserBundle}\n${browserCopySpecs}`;
  for (const token of [
    "browser_chrome_trace_hash_mismatch",
    "browser_chrome_trace_trial_coverage_invalid",
    'category: "CHROME_TRACE"',
    "BROWSER_CHROME_TRACE_COPY_COUNT_INVALID",
  ])
    assert.match(certificationSources, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(dockerRunner, /andurilBrowserOutput.*:\/workspace\/\.artifacts\/anduril-class-crisis-os\/browser:rw/s, "Docker certification must mount the Anduril browser evidence destination writable");
});
