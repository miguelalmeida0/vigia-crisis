export function buildAndurilReport({
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
}) {
  return `# VIGIA Anduril-class Crisis OS mega-patch report

## 1. Executive verdict

${certificationState}. ${failedGates.length} required certification gate${failedGates.length === 1 ? "" : "s"} did not pass. This report does not treat isolated fixtures, exercises, proposals, provider responses, or replay as production truth.

## 2. Release identity

- Release: ${identity.releaseId}
- Code state: ${identity.codeStateHash}
- Operational data: ${identity.operationalDataHash}
- Release statement: ${identity.releaseStatementHash}
- Runtime coherence: ${gateLine("releaseIdentity")}
- Reproducibility: ${gateLine("releaseReproducibility")}

## 3. Crisis Autopilot

${gateLine("canonicalTruthInvariantSweep")} ${gateLine("canonicalAutopilotSections")} ${gateLine("canonicalPlanningSections")} ${gateLine("activeWorkHasLifecycle")}

## 4. Collection effectiveness

${gateLine("unknownHasPlanOrTerminalReason")} Golden scenarios are explicitly isolated and do not count provider responses as satisfied production information requirements.

## 5. Value-of-Information

${detailAutopilot?.valueOfInformation ? `Runtime state ${detailAutopilot.valueOfInformation.state}; ${detailAutopilot.valueOfInformation.candidateCount ?? 0} ranked candidates; ranking doctrine ${detailAutopilot.valueOfInformation.rankingDoctrine?.ordering ?? "not exposed"}.` : "NOT IMPLEMENTED OR NOT EXPOSED on the selected runtime projection."}

## 6. Living Incident Twin

${gateLine("livingTwinCrossRouteIdentity")} The twin is as-of capable: ${detailAutopilot?.livingTwin?.asOfCapable === true}.

## 7. Regret Radar

${detailAutopilot?.regretRadar ? `${rows(detailAutopilot.regretRadar.items).length} transparent ordinal decision records; no probability/expected-loss claim is admitted.` : "NOT IMPLEMENTED OR NOT EXPOSED."}

## 8. Decision Half-Life

${gateLine("recommendationValidity")}

## 9. Unknown-Unknown Sentinel

${gateLine("sentinelTruthBoundary")}

## 10. AI Command Staff

${gateLine("commandStaffBounded")} ${featureLine("commandByIntent")}

## 11. FieldNet Lite

${gateLine("fieldNetAuthoritativeReadiness")} ${gateLine("expandedTestCohort")} ${gateLine("goldenScenarios")} ${gateLine("acknowledgementReceiptZeroViolations")} ${gateLine("responseRecommendationReview")} FieldNet Lite: ${featureLine("fieldNetLite")} Trusted Observer: ${featureLine("trustedObserver")} Two-way tasking/roundtrip: ${featureLine("twoWayTasking")} Public-report boundary: ${gateLine("publicReportAutoVerificationZero")}

## 12. Field tasking

The isolated golden suite verifies safe-zone, owner, deadline, acknowledgement receipt, completion evidence, offline capture, provenance, and non-admission boundaries. It does not claim a real task was dispatched.

## 13. Exposure graph

${featureLine("dynamicExposureGraph")} ${gateLine("planningOperationalUsefulness")} ${gateLine("selectedResponseCapability")} ${gateLine("terrainCoverage")} ${gateLine("thermalPerimeterSeparation")}

## 14. Dependency graph

${featureLine("crisisDependencyGraph")} Model disagreement: ${featureLine("modelDisagreement")} Reality reconciliation: ${featureLine("realityReconciliation")} Planning truth boundaries: ${gateLine("planningTruthBoundaries")}

## 15. Operations

${gateLine("assignmentOwnerZeroViolations")} ${gateLine("acknowledgementReceiptZeroViolations")} Operational-period generator: ${featureLine("operationalPeriodGenerator")}

## 16. Resource planning

${featureLine("responseCapability")} ${featureLine("resourceOptimizerOutput")} ${gateLine("selectedResponseCapability")} ${gateLine("governedGeolocatedResponseCoverage")} ${gateLine("responseSoftwareCapability")} ${gateLine("verifiedCurrentResponseCoverage")} ${gateLine("responseFacilityClassContract")} ${gateLine("responseRetrievalDenominatorAndRank")} ${gateLine("responseIncidentIdentity")} ${gateLine("staticFacilityProvenance")} ${gateLine("routedResourceCoverageMap")} ${gateLine("responseSurgeTruthBoundaries")} ${gateLine("operationalReachabilityTruth")} ${gateLine("dynamicCapacityUnknownNotZero")} ${gateLine("responseGapExplanation")} ${gateLine("liveCapacityProvenance")} ${gateLine("fieldPiiLeakZero")} ${gateLine("responseRecommendationReview")} ${gateLine("acknowledgementReceiptZeroViolations")} Two-way FieldNet roundtrip: ${featureLine("twoWayTasking")} Optimizer inputs and recommendation review state are not reported as an assignment or dispatch.

## 17. Autonomous replanning

${featureLine("autonomousReplanning")}

## 18. Evacuation planning

${featureLine("evacuationCorridor")} Route estimates remain planning context, never an evacuation order.

## 19. Protection/CAP

${gateLine("liveWarningAuthority")} CAP lifecycle: ${featureLine("capLifecycle")} Protection timeline: ${featureLine("protectionTimeline")} Multilingual composer: ${featureLine("multilingualComposer")}

## 20. Outcomes

${gateLine("actionSuccessRequiresPostcondition")} ${gateLine("replayProductionSeparation")} Action-to-outcome ledger: ${featureLine("actionOutcomeLedger")}

## 21. Near misses

${featureLine("nearMiss")} Exercise after-action findings remain exercise evidence, not production near-miss truth.

## 22. Prevention

${featureLine("prevention")} ${gateLine("strategicP1Systems")}

Strategic subsystem states for every selected-incident projection:

${strategicStateLine}

## 23. Browser QA

${gateLine("browserInteractionAndVisual")} Quicklook p95 ${quicklookP95Ms ?? "not measured"} ms; incident-switch p95 ${incidentSwitchP95Ms ?? "not measured"} ms; hardware-map pointer-to-paint p95 ${mapPointerP95Ms ?? "not measured"} ms. Exact copied artifacts and SHA-256 hashes are recorded in .artifacts/anduril-class-crisis-os/browser/evidence-index.json.

## 24. Performance

${gateLine("apiPerformance")} Three-run aggregate: p50 ${performanceProof.p50Ms} ms; p95 ${performanceProof.p95Ms} ms; max ${performanceProof.maxMs} ms; ${performanceProof.samples}/${performanceProof.expectedSamples} samples; variance ${performanceProof.varianceMs2} ms²; ${performanceProof.cacheState}; ${performanceProof.hardwarePath}. Per-run states: ${performanceProof.runs.map((run) => `run ${run.run} ${run.state} (p50 ${run.p50Ms}, p95 ${run.p95Ms}, max ${run.maxMs}, ${run.successfulSamples}/${run.expectedSamples} samples)`).join("; ")}.

## 25. External blockers

${externalBlockers.map((item) => `- ${item.capability}: ${item.state}. ${item.evidence}`).join("\n")}

Internal failed gates are not reclassified as external blockers:

${failedGates.map((item) => `- ${item.name}: ${item.state}. ${item.evidence}`).join("\n") || "- None."}

## 26. Exact changed files

${changedFiles.length} dirty paths are enumerated in \`.artifacts/anduril-class-crisis-os/release/changed-files.json\`. Exact current dirty-path ledger:

${changedFiles.map((item) => `- \`${item.status} ${item.path}\``).join("\n") || "- None."}

Generated evidence is under \`.artifacts/anduril-class-crisis-os/\`.

## 27. Git staged/commit/reset state

Staged paths: ${staged.trim().split("\n").filter(Boolean).length}. Certification created no commit and performed no runtime-data reset.
`;
}
