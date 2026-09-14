import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildAndurilReport } from "./anduril_report.mjs";
import { certificationGateSatisfied } from "./anduril_gate_state.mjs";
export async function finalizeCertification(s) {
  const {
    gates,
    rows,
    runtimeState,
    root,
    writeJson,
    selectedIncidentId,
    incidentRows,
    activeIncidentIds,
    testCohort,
    goldenScenarios,
    canonicalTruthSweep,
    reproducibilityProof,
    featureAvailability,
    p0FeatureGates, p0FeatureGateDetails,
    strategicIntelligenceProof,
    performanceProof,
    browserPerformance,
    quicklookP95Ms,
    incidentSwitchP95Ms,
    mapPointerP95Ms,
    mapDragFrameP95Ms,
    browserEvidenceIndex,
    browserDocumentValidation,
    validCoordinateIncidents,
    governedContext,
    responseByIncident,
    planningProjections,
    publicAutoVerificationViolations,
    thermalPerimeterViolations,
    strategicSubsystemStates,
    identity,
    detailAutopilot,
    reportPath,
  } = s;
  const failedGates = Object.entries(gates)
    .filter(([name, gate]) => !certificationGateSatisfied(name, gate))
    .map(([name, gate]) => ({ name, ...gate }));
  const certificationState = failedGates.length ? "FAIL" : "PASS";
  const externalBlockers = [
    {
      capability: "Live public-protection authority and dispatch",
      state: "EXTERNAL_AUTHORITY_REQUIRED",
      affectsProductionTruth: true,
      evidence: "No live send is claimed; only explicitly isolated exercise/replay workflows are present.",
    },
    {
      capability: "Live partner hospital/fire staffing feeds",
      state: "PARTNER_INTEGRATION_REQUIRED",
      affectsProductionTruth: true,
      evidence: "Dynamic capacity remains UNKNOWN unless an admitted attributable partner/dispatch/FieldNet report exists.",
    },
    {
      capability: "Live production action-to-outcome evidence",
      state: rows(runtimeState.outcomeClassifications).length ? "AVAILABLE" : "NO_LIVE_RECORDS",
      affectsProductionTruth: true,
      evidence: "Isolated exercise/replay evidence is not counted as production outcome truth.",
    },
  ];
  const gitStatus =
    spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 50_000_000,
    }).stdout ?? "";
  const staged =
    spawnSync("git", ["diff", "--cached", "--name-only"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 2_000_000,
    }).stdout ?? "";
  const changedFiles = gitStatus
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => ({ status: line.slice(0, 2), path: line.slice(3) }));
  await writeJson("release/changed-files.json", {
    schemaVersion: "vigia.anduril-crisis-os-changed-files.v1",
    generatedAt: new Date().toISOString(),
    dirtyPathCount: changedFiles.length,
    stagedPaths: staged.trim().split("\n").filter(Boolean),
    commitCreatedByCertification: false,
    runtimeResetByCertification: false,
    files: changedFiles,
  });
  const certification = {
    schemaVersion: "vigia.anduril-class-crisis-os-certification.v1",
    generatedAt: new Date().toISOString(),
    state: certificationState,
    selectedIncidentId,
    governedIncidentCount: incidentRows.length,
    verifiedCurrentCount: activeIncidentIds.length,
    goldenScenarioUniverse: "ISOLATED_TEST_FIXTURE",
    testCohort,
    goldenScenarios: {
      state: goldenScenarios.state,
      scenarios: goldenScenarios.scenarios,
      invariants: goldenScenarios.invariants,
      receipts: goldenScenarios.receipts,
      tapSummary: goldenScenarios.tapSummary,
    },
    canonicalTruthSweep,
    reproducibility: reproducibilityProof,
    gates: Object.entries(gates).map(([name, gate]) => ({ name, ...gate })),
    failedGates,
    featureAvailability,
    strategicIntelligence: strategicIntelligenceProof,
    externalBlockers,
    performance: {
      state: performanceProof.state,
      requiredRuns: performanceProof.requiredRuns,
      completedRuns: performanceProof.completedRuns,
      expectedSamples: performanceProof.expectedSamples,
      p50Ms: performanceProof.p50Ms,
      p95Ms: performanceProof.p95Ms,
      maxMs: performanceProof.maxMs,
      samples: performanceProof.samples,
      varianceMs2: performanceProof.varianceMs2,
      runs: performanceProof.runs.map((run) => ({
        run: run.run,
        state: run.state,
        p50Ms: run.p50Ms,
        p95Ms: run.p95Ms,
        maxMs: run.maxMs,
        successfulSamples: run.successfulSamples,
        expectedSamples: run.expectedSamples,
      })),
    },
    browserPerformance: {
      quicklookUsefulContent: browserPerformance.quicklookUsefulContent ?? null,
      incidentSwitchUsefulContent: browserPerformance.incidentSwitchUsefulContent ?? null,
      mapPointerToPaint: browserPerformance.mapPointerToPaint ?? null,
      mapDragFrameTime: browserPerformance.mapDragFrameTime ?? null,
      chromeTrace: browserPerformance.chromeTrace ?? null,
      quicklookP95Ms,
      incidentSwitchP95Ms,
      mapPointerToPaintP95Ms: mapPointerP95Ms,
      mapDragFrameP95Ms,
    },
    browserEvidence: {
      state: browserEvidenceIndex.state,
      acceptanceValidation: browserDocumentValidation,
      evidenceIndex: ".artifacts/anduril-class-crisis-os/browser/evidence-index.json",
      categoryCounts: browserEvidenceIndex.categoryCounts ?? {},
    },
    counts: {
      canonicalIncidents: incidentRows.length,
      verifiedCurrentIncidents: activeIncidentIds.length,
      validIncidentCoordinates: validCoordinateIncidents.length,
      governedTerrainRecords: rows(governedContext.incidents).length,
      responseCapabilityIncidentProjections: responseByIncident.size,
      planningRouteProjections: planningProjections.length,
      publicAutoVerificationViolations: publicAutoVerificationViolations.length,
      thermalPerimeterViolations: thermalPerimeterViolations.length,
      canonicalTruthRecordsChecked: canonicalTruthSweep.checkedRecords,
      canonicalTruthViolations: canonicalTruthSweep.violationCount,
      strategicProjectionCount: strategicIntelligenceProof.observedRouteProjections,
    },
    worktree: {
      dirtyPathCount: changedFiles.length,
      stagedPathCount: staged.trim().split("\n").filter(Boolean).length,
      commitCreated: false,
      runtimeReset: false,
    },
    truthBoundary:
      "PASS certifies implemented runtime contracts and isolated software safety properties only. It never converts a provider response, field observation, route estimate, exercise, replay, action, or task state into production truth or a successful real-world outcome.",
  };
  await writeJson("certification.json", certification);
  await writeJson("release/invariant-report.json", {
    schemaVersion: "vigia.anduril-class-crisis-os-invariant-report.v1",
    generatedAt: certification.generatedAt,
    state: certificationState,
    ...identity,
    invariants: certification.gates,
    failedInvariantNames: failedGates.map((item) => item.name),
    truthBoundary: certification.truthBoundary,
  });
  const gateLine = (name) => `${gates[name]?.state ?? "NOT_MEASURED"} — ${gates[name]?.evidence ?? "No evidence."}`;
  const featureLine = (name) => {
    const details = p0FeatureGateDetails[name] ?? {};
    const execution = details.operatorExecutionEvidence;
    return `${featureAvailability[name]?.state ?? "NOT_IMPLEMENTED_OR_INVALID"}; operator usability ${p0FeatureGates[name] === true ? "PASS" : "FAIL"}; visible surface ${details.operatorSurfaceEvidence === true};${execution === null ? " no execution receipt required" : ` receipt-backed execution ${execution === true}`} in the certified runtime contract.`;
  };
  const strategicStateLine = Object.entries(strategicSubsystemStates)
    .map(
      ([name, states]) =>
        `- ${name}: ${states.length ? states.map((item) => `${item.incidentId ?? "unbound"}=${item.state ?? "MISSING"} (${item.schemaVersion ?? "schema missing"})`).join("; ") : "MISSING"}`,
    )
    .join("\n");
  const report = buildAndurilReport({
    certificationState,
    failedGates,
    identity,
    gateLine,
    detailAutopilot,
    rows,
    featureLine,
    strategicStateLine,
    quicklookP95Ms,
    incidentSwitchP95Ms,
    mapPointerP95Ms,
    performanceProof,
    externalBlockers,
    changedFiles,
    staged,
  });
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, report);
  process.stdout.write(
    `${JSON.stringify({ state: certificationState, releaseIdentity: identity, selectedIncidentId, failedGates: failedGates.map((item) => item.name), featureAvailability, performance: certification.performance, report: path.relative(root, reportPath) }, null, 2)}\n`,
  );
  if (certificationState !== "PASS") process.exitCode = 1;
}
