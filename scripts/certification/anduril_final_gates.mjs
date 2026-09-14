export function createFinalGates(s) {
  const {
    status,
    assignmentOwnerViolations,
    exerciseAssignmentViolations,
    latestExercise,
    acknowledgementViolations,
    rows,
    unauthorizedLiveSends,
    exerciseSendViolations,
    successWithoutPostcondition,
    replayProductionLeaks,
    scenes,
    mapMismatches,
    p0FeatureGates,
    p0FeatureGateDetails,
    browserAcceptance,
    browserPass,
    quicklookP95Ms,
    incidentSwitchP95Ms,
    mapPointerP95Ms,
    browserRequired,
    browserIdentityMatches,
    browserDocumentValidation,
    browserEvidenceIndex,
    browserPerformance,
    notRun,
    performanceProof,
  } = s;
  const responseReviewExecutions = rows(browserAcceptance?.actionIntegrity?.executions).filter(
    (item) => item?.uiAction?.startsWith("response-recommendation-review:"),
  );
  return {
    assignmentOwnerZeroViolations: status(
      assignmentOwnerViolations.length === 0 && exerciseAssignmentViolations.length === 0,
      `${assignmentOwnerViolations.length} runtime response items and ${exerciseAssignmentViolations.length} exercise assignments lack owner/assignee.`,
    ),
    acknowledgementReceiptZeroViolations: status(
      Boolean(latestExercise) && acknowledgementViolations.length === 0 && rows(latestExercise?.acknowledgements).length > 0,
      `${acknowledgementViolations.length} persisted exercise acknowledgements lack receipt identity/target/time.`,
    ),
    liveWarningAuthority: status(
      unauthorizedLiveSends.length === 0 && exerciseSendViolations.length === 0,
      `${unauthorizedLiveSends.length} unauthorized live sends; ${exerciseSendViolations.length} exercise/replay workflows with external send enabled.`,
    ),
    actionSuccessRequiresPostcondition: status(
      successWithoutPostcondition.length === 0,
      `${successWithoutPostcondition.length} SUCCESS outcomes lack a linked observed postcondition.`,
    ),
    replayProductionSeparation: status(
      replayProductionLeaks.length === 0,
      `${replayProductionLeaks.length} certified replay chains leak into production truth.`,
    ),
    mapIncidentAtomicity: status(
      scenes.length === 3 && mapMismatches.length === 0,
      `${mapMismatches.length} map/list/selected-incident mismatches across ${scenes.length}/3 selected-incident map routes.`,
      mapMismatches,
    ),
    p0FeatureObjects: status(Object.values(p0FeatureGates).every(Boolean), `P0 feature object availability: ${JSON.stringify(p0FeatureGates)}.`, {
      pass: p0FeatureGates,
      classifications: p0FeatureGateDetails,
    }),
    responseRecommendationReview: status(
      browserDocumentValidation?.actionIntegrity?.state === "PASS" && responseReviewExecutions.length > 0,
      `${responseReviewExecutions.length} exact recommendation review action executed with a version/hash-bound receipt, canonical refresh, durable after-state, and truthEffect=REVIEW_STATE_ONLY; no dispatch or assignment is inferred.`,
      responseReviewExecutions,
    ),
    browserInteractionAndVisual: browserAcceptance
      ? status(
          browserPass,
          browserPass
            ? `Fresh seven-route browser, interaction, consequential-action receipt/canonical-refresh, FieldNet, map-lifecycle, keyboard, and responsive evidence passed schema, identity, freshness, path, copy, and SHA-256 checks; Quicklook p95 ${quicklookP95Ms} ms, incident-switch p95 ${incidentSwitchP95Ms} ms, map pointer-to-paint p95 ${mapPointerP95Ms} ms.`
            : "Browser acceptance exists but schema, full identity quartet, consequential-action receipt/canonical-refresh proof, freshness, raw measurement integrity, artifact paths/hashes, evidence completeness, or a required acceptance boolean failed.",
          {
            required: Object.fromEntries(browserRequired.map((key) => [key, browserAcceptance[key]])),
            identityMatches: browserIdentityMatches,
            documentValidation: browserDocumentValidation,
            evidenceIndex: browserEvidenceIndex,
            quicklookP95Ms,
            incidentSwitchP95Ms,
            mapPointerP95Ms,
            performance: browserPerformance,
          },
        )
      : notRun("Fresh browser acceptance artifact is not present."),
    apiPerformance: status(
      performanceProof.state === "PASS",
      `${performanceProof.completedRuns}/${performanceProof.requiredRuns} warm useful-content runs completed; aggregate p95 ${performanceProof.p95Ms} ms across ${performanceProof.samples}/${performanceProof.expectedSamples} successful samples; target <300 ms and every route/run <1000 ms.`,
      {
        runs: performanceProof.runs.map((run) => ({
          run: run.run,
          state: run.state,
          samples: run.successfulSamples,
          expectedSamples: run.expectedSamples,
          p50Ms: run.p50Ms,
          p95Ms: run.p95Ms,
          maxMs: run.maxMs,
          varianceMs2: run.varianceMs2,
          routes: run.routes,
        })),
        aggregateRoutes: performanceProof.routes,
        missingRouteRuns: performanceProof.missingRouteRuns,
      },
    ),
  };
}
