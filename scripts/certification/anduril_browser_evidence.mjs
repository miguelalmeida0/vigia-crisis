import { buildBrowserCopySpecs } from "./anduril_browser_copy_specs.mjs";
import { copyAndIndexBrowserEvidence } from "./anduril_browser_bundle.mjs";
import { validateInteractionTrace } from "./anduril_interaction_trace.mjs";
import { validateVisualEvidence } from "./anduril_visual_evidence.mjs";

export async function ingestBrowserEvidence(state) {
  const { browserDocumentValidation, browserAcceptance, browserMetricPass, writeJson } = state;
  let browserEvidenceIndex = {
    schemaVersion: "vigia.anduril-browser-evidence-index.v1",
    generatedAt: new Date().toISOString(),
    state: "FAIL",
    acceptanceValidation: browserDocumentValidation,
    entries: [],
    violations: [],
  };
  if (browserDocumentValidation.state === "PASS") {
    try {
      const visual = await validateVisualEvidence(state);
      const interaction = await validateInteractionTrace(state);
      const specs = await buildBrowserCopySpecs({
        ...state,
        ...visual,
        ...interaction,
      });
      browserEvidenceIndex = await copyAndIndexBrowserEvidence({
        ...state,
        ...visual,
        ...interaction,
        ...specs,
      });
    } catch (error) {
      browserEvidenceIndex.violations.push({
        code: "BROWSER_EVIDENCE_INGESTION_FAILED",
        error: String(error?.message ?? error),
      });
    }
  } else {
    browserEvidenceIndex.violations.push(...browserDocumentValidation.violations);
  }
  await writeJson("browser/evidence-index.json", browserEvidenceIndex);
  const browserPass = browserDocumentValidation.state === "PASS" && browserEvidenceIndex.state === "PASS" && browserMetricPass;
  return { browserEvidenceIndex, browserPass };
}
