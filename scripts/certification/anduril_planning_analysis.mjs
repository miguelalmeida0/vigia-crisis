export function analyzePlanning({ planningProjections, selectedIncidentId, rows, withheldLifecycleComplete, withheldState, portfolios }) {
  const planningKeys = [
    "dynamicExposureGraph",
    "crisisDependencyGraph",
    "modelDisagreement",
    "realityReconciliation",
    "commandIntent",
    "operationalPeriodProposal",
    "resourceOptimizer",
    "autonomousReplanning",
    "evacuationCorridor",
    "protectionTimeline",
    "capProtection",
    "multilingualProtectionComposer",
  ];
  const planningBindings = planningProjections.map((projection) => ({
    incidentId: projection.incidentId,
  }));
  const planningMissingSections = planningProjections.flatMap((projection) =>
    planningKeys.filter((key) => !projection[key]).map((key) => ({ incidentId: projection.incidentId, key })),
  );
  const planningWithheldLifecycleViolations = planningProjections.flatMap((projection) =>
    planningKeys
      .filter((key) => projection[key] && !withheldLifecycleComplete(projection[key]))
      .map((key) => ({
        incidentId: projection.incidentId,
        key,
        value: projection[key],
      })),
  );
  const planningBoundaryViolations = planningProjections.flatMap((projection) =>
    [
      projection.commandIntent &&
      !withheldState(projection.commandIntent) &&
      (projection.commandIntent.humanConfirmationRequired !== true || projection.commandIntent.mutationsExecuted !== false)
        ? { incidentId: projection.incidentId, key: "commandIntent" }
        : null,
      projection.operationalPeriodProposal &&
      !withheldState(projection.operationalPeriodProposal) &&
      projection.operationalPeriodProposal.humanApprovalRequired !== true
        ? {
            incidentId: projection.incidentId,
            key: "operationalPeriodProposal",
          }
        : null,
      projection.resourceOptimizer &&
      !withheldState(projection.resourceOptimizer) &&
      (projection.resourceOptimizer.dispatchClaimed !== false || projection.resourceOptimizer.requiresHumanApproval !== true)
        ? { incidentId: projection.incidentId, key: "resourceOptimizer" }
        : null,
      projection.autonomousReplanning && !withheldState(projection.autonomousReplanning) && projection.autonomousReplanning.requiresApproval !== true
        ? { incidentId: projection.incidentId, key: "autonomousReplanning" }
        : null,
      projection.evacuationCorridor &&
      !withheldState(projection.evacuationCorridor) &&
      (projection.evacuationCorridor.planningOnly !== true || projection.evacuationCorridor.officialOrder === true)
        ? { incidentId: projection.incidentId, key: "evacuationCorridor" }
        : null,
      projection.protectionTimeline && !withheldState(projection.protectionTimeline) && projection.protectionTimeline.deterministic === true
        ? { incidentId: projection.incidentId, key: "protectionTimeline" }
        : null,
      projection.capProtection && !withheldState(projection.capProtection) && projection.capProtection.liveSendEnabled !== false
        ? { incidentId: projection.incidentId, key: "capProtection" }
        : null,
    ].filter(Boolean),
  );
  const exposureEdgesByProjection = planningProjections.map((projection) => ({
    incidentId: projection.incidentId,
    edges: rows(projection?.dynamicExposureGraph?.edges),
    basis: projection?.dynamicExposureGraph?.basis,
  }));
  const exposureEdges = exposureEdgesByProjection.flatMap((item) => item.edges);
  const exposureProjectionMissing = exposureEdgesByProjection.filter((item) => item.edges.length === 0).map((item) => item.incidentId);
  const exposureEdgeViolations = exposureEdgesByProjection.flatMap((projection) =>
    projection.edges
      .filter(
        (edge) =>
          !edge.from ||
          !edge.to ||
          !edge.exposureBasis ||
          !edge.confidence ||
          !edge.updatedAt ||
          (projection.basis === "POINT_PROXIMITY" && (edge.perimeterUsed !== false || edge.exposureState !== "PRELIMINARY_CONTEXT_ONLY")),
      )
      .map((edge) => ({ incidentId: projection.incidentId, edge })),
  );
  const dependencyEdgeViolations = planningProjections.flatMap((projection) =>
    rows(projection?.crisisDependencyGraph?.edges)
      .filter((edge) => !["OBSERVED", "SCENARIO"].includes(edge.basis) || (edge.basis === "SCENARIO" && (edge.observed !== false || edge.probability !== null)))
      .map((edge) => ({ incidentId: projection.incidentId, edge })),
  );
  const disagreementViolations = planningProjections.flatMap((projection) =>
    rows(projection?.modelDisagreement?.disagreements)
      .filter((item) => item.valuesAveraged !== false || rows(item.claims).length < 2 || rows(item.sources).length < 2 || !item.resolutionPlan)
      .map((item) => ({ incidentId: projection.incidentId, item })),
  );
  const reconciliationViolations = planningProjections.flatMap((projection) =>
    rows(projection?.realityReconciliation?.items)
      .filter((item) => item.state === "RECONCILED" && (!item.expected || !item.observed || !item.delta || !item.why || !item.decisionConsequence))
      .map((item) => ({ incidentId: projection.incidentId, item })),
  );
  const humanPercent = portfolios[0]?.value?.decisionCompression?.machineToHumanConversionPercent;
  const humanCounts = portfolios[0]?.value?.decisionCompression?.counts ?? {};
  const humanCompressionPass =
    humanPercent === null ? Number(humanCounts.machineWork ?? 0) + Number(humanCounts.requiredHumanDecisions ?? 0) === 0 : Number(humanPercent) < 5;
  return {
    planningKeys,
    planningBindings,
    planningMissingSections,
    planningWithheldLifecycleViolations,
    planningBoundaryViolations,
    exposureEdgesByProjection,
    exposureEdges,
    exposureProjectionMissing,
    exposureEdgeViolations,
    dependencyEdgeViolations,
    disagreementViolations,
    reconciliationViolations,
    humanPercent,
    humanCounts,
    humanCompressionPass,
  };
}
