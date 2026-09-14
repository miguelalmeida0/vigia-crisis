import { validateConsequentialActionEvidence } from "./anduril_integrity.mjs";

export async function validateInteractionTrace({
  browserAcceptance,
  repositoryEvidencePath,
  readJson,
  identity,
  operatorActionHandlerSourceSha256,
  browserPerformance,
  sha256File,
  rows,
}) {
  const interactionDirectory = repositoryEvidencePath(browserAcceptance.evidence.interactionEvidenceDirectory);
  const consequentialActionEvidencePath = repositoryEvidencePath(browserAcceptance.evidence.consequentialActionEvidence);
  const consequentialActionEvidence = await readJson(consequentialActionEvidencePath);
  if (!consequentialActionEvidence) throw new Error("browser_consequential_action_evidence_unreadable");
  const consequentialActionValidation = validateConsequentialActionEvidence(consequentialActionEvidence, {
    identity,
    generatedAt: browserAcceptance.generatedAt,
    handlerSourceSha256: operatorActionHandlerSourceSha256,
  });
  if (consequentialActionValidation.state !== "PASS")
    throw new Error(`browser_consequential_action_evidence_invalid:${JSON.stringify(consequentialActionValidation.violations)}`);
  if (consequentialActionEvidence.generatedAt !== browserAcceptance.generatedAt) throw new Error("browser_consequential_action_capture_time_mismatch");
  if (!["releaseId", "codeStateHash", "operationalDataHash", "releaseStatementHash"].every((key) => consequentialActionEvidence[key] === identity[key]))
    throw new Error("browser_consequential_action_identity_mismatch");
  if (JSON.stringify(consequentialActionEvidence) !== JSON.stringify(browserAcceptance.actionIntegrity))
    throw new Error("browser_consequential_action_inline_evidence_mismatch");
  const chromeTracePath = repositoryEvidencePath(browserAcceptance.evidence.chromeTrace);
  const chromeTrace = await readJson(chromeTracePath);
  const chromeTraceMetadata = chromeTrace?.vigiaMetadata;
  const chromeTraceEvents = rows(chromeTrace?.traceEvents);
  if (
    !chromeTrace ||
    !chromeTraceMetadata ||
    chromeTraceMetadata.schemaVersion !== "vigia.chrome-devtools-map-drag-trace.v1" ||
    chromeTraceMetadata.source !== "CHROME_DEVTOOLS_PROTOCOL"
  )
    throw new Error("browser_chrome_trace_contract_invalid");
  if (!["releaseId", "codeStateHash", "operationalDataHash", "releaseStatementHash"].every((key) => chromeTraceMetadata[key] === identity[key]))
    throw new Error("browser_chrome_trace_identity_mismatch");
  if (!chromeTraceEvents.length || chromeTraceMetadata.rawEventCount !== chromeTraceEvents.length)
    throw new Error(`browser_chrome_trace_event_count_invalid:${chromeTraceEvents.length}:${chromeTraceMetadata.rawEventCount ?? "missing"}`);
  if ((await sha256File(chromeTracePath)) !== browserPerformance.chromeTrace?.sha256) throw new Error("browser_chrome_trace_hash_mismatch");
  const traceRoutes = ["command-overview", "incidents", "incident-detail", "intelligence", "operations", "global-awareness"];
  const traceTrials = rows(chromeTraceMetadata.trials);
  if (
    chromeTraceMetadata.trialsPerRoute < 3 ||
    traceTrials.length !== traceRoutes.length * chromeTraceMetadata.trialsPerRoute ||
    traceRoutes.some((route) => traceTrials.filter((trial) => trial.route === route).length !== chromeTraceMetadata.trialsPerRoute)
  )
    throw new Error("browser_chrome_trace_trial_coverage_invalid");
  if (
    traceTrials.some(
      (trial) =>
        !String(trial.traceMarker ?? "").startsWith(`vigia-map-drag:${trial.route}:trial-`) ||
        trial.nativeDrag !== true ||
        trial.instancePreserved !== true ||
        trial.styleReloadDelta !== 0 ||
        trial.destroyDelta !== 0 ||
        Number(trial.continuousPointerMoves) < 24 ||
        !rows(trial.frameIntervalsMs).length ||
        !rows(trial.pointerToPostRenderMs).length,
    )
  )
    throw new Error("browser_chrome_trace_trial_evidence_invalid");
  const traceRenderers = [chromeTraceMetadata.hardwareSoftwarePath?.renderer, ...rows(chromeTraceMetadata.hardwareSoftwarePath?.renderers)].filter(Boolean);
  const softwareRenderer = traceRenderers.find((value) => /swiftshader|software|llvmpipe|softpipe|microsoft basic render|mesa offscreen/iu.test(String(value)));
  if (
    chromeTraceMetadata.hardwareSoftwarePath?.hardwareAccelerationRequired !== true ||
    chromeTraceMetadata.hardwareSoftwarePath?.rendererClassification !== "HARDWARE" ||
    softwareRenderer
  )
    throw new Error(
      `browser_chrome_trace_hardware_path_invalid:${chromeTraceMetadata.hardwareSoftwarePath?.rendererClassification ?? "missing"}:${softwareRenderer ?? "none"}`,
    );
  return {
    interactionDirectory,
    consequentialActionEvidencePath,
    consequentialActionEvidence,
    chromeTracePath,
    chromeTrace,
    chromeTraceMetadata,
    chromeTraceEvents,
  };
}
