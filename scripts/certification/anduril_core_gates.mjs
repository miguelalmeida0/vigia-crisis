import { createReleaseGates } from "./anduril_release_gates.mjs";

export function createCoreGates(s) {
  const {
    runtimeProof,
    status,
    goldenScenarios,
    portfolios,
    directAutopilots,
    planningProjections,
    planningMissingSections,
    planningBindings,
    selectedIncidentId,
    planningEmbedded,
    planningWithheldLifecycleViolations,
    planningBoundaryViolations,
    exposureProjectionMissing,
    exposureEdges,
    exposureEdgeViolations,
    dependencyEdgeViolations,
    disagreementViolations,
    reconciliationViolations,
    bindings,
    bindingViolations,
    autopilotRuntimeComplete,
    activeLifecycleViolations,
    unknownViolations,
    priorityViolations,
    criticalDecisionViolations,
    recommendationViolations,
    withheldRecommendationLeaks,
    humanCompressionPass,
    humanPercent,
    humanCounts,
    missedHumanDecisions,
    anomalyViolations,
    staffViolations,
    councilViolations,
    rows,
    strategicIntelligenceProof,
    strategicViolations,
    publicAutoVerificationViolations,
    validCoordinateIncidents,
    terrainCoverageViolations,
    selectedTerrainViolations,
    governedContext,
    thermalPerimeterViolations,
    observedGeometryAdmissionViolations,
  } = s;
  return {
    ...createReleaseGates(s),
    canonicalAutopilotSections: status(
      portfolios.every((item) => item.value?.schemaVersion === "vigia.crisis-autopilot-portfolio.v2") &&
        directAutopilots.length === 3 &&
        directAutopilots.every((item) => item.schemaVersion === "vigia.crisis-autopilot-projection.v1"),
      "Command, Detail, Intelligence, Operations, Reports, and Global expose the expected single/portfolio contracts.",
      {
        portfolios: portfolios.map((item) => ({
          name: item.name,
          state: item.state,
          schemaVersion: item.value?.schemaVersion,
        })),
        directSchemas: directAutopilots.map((item) => item.schemaVersion),
      },
    ),
    canonicalPlanningSections: status(
      planningProjections.length === 3 &&
        planningProjections.every((item) => item.schemaVersion === "vigia.crisis-planning-projection.v1") &&
        planningMissingSections.length === 0 &&
        planningBindings.every((item) => item.incidentId === selectedIncidentId),
      "Detail, Intelligence, and Operations expose the complete selected-incident crisis-planning contract.",
      {
        embedded: planningEmbedded.map((item) => ({
          name: item.name,
          state: item.state,
          schemaVersion: item.value?.schemaVersion,
          incidentId: item.value?.incidentId,
        })),
        missingSections: planningMissingSections,
        bindings: planningBindings,
      },
    ),
    planningTruthBoundaries: status(
      planningProjections.length === 3 && planningWithheldLifecycleViolations.length === 0 && planningBoundaryViolations.length === 0,
      `${planningProjections.length}/3 route planning projections checked; ${planningWithheldLifecycleViolations.length} withheld planning sections lack reason plus unlock/required-input metadata; ${planningBoundaryViolations.length} admitted planning sections violate approval/authority boundaries.`,
      {
        withheldLifecycleViolations: planningWithheldLifecycleViolations,
        boundaryViolations: planningBoundaryViolations,
      },
    ),
    planningOperationalUsefulness: status(
      planningProjections.length === 3 &&
        exposureProjectionMissing.length === 0 &&
        exposureEdges.length > 0 &&
        exposureEdgeViolations.length === 0 &&
        dependencyEdgeViolations.length === 0 &&
        disagreementViolations.length === 0 &&
        reconciliationViolations.length === 0,
      `${exposureEdges.length} selected-incident exposure edges across ${planningProjections.length}/3 route projections; ${exposureProjectionMissing.length} routes lack the governed exposure graph; ${exposureEdgeViolations.length} exposure-contract violations; ${dependencyEdgeViolations.length} dependency truth-boundary violations; ${disagreementViolations.length} disagreement violations; ${reconciliationViolations.length} reconciliation violations.`,
      {
        exposureProjectionMissing,
        exposureEdgeViolations,
        dependencyEdgeViolations,
        disagreementViolations,
        reconciliationViolations,
      },
    ),
    livingTwinCrossRouteIdentity: status(
      directAutopilots.length === 3 && bindingViolations.length === 0,
      `${bindings.length}/3 selected-incident bindings checked; ${bindingViolations.length} violations.`,
      bindings,
    ),
    activeWorkHasLifecycle: status(
      autopilotRuntimeComplete && activeLifecycleViolations.length === 0,
      `${directAutopilots.length}/3 incident autopilot projections checked; ${activeLifecycleViolations.length} active activities lack backing identity or complete owner/source/next-check lifecycle.`,
      activeLifecycleViolations.slice(0, 20),
    ),
    unknownHasPlanOrTerminalReason: status(
      autopilotRuntimeComplete && unknownViolations.length === 0,
      `${directAutopilots.length}/3 incident autopilot projections checked; ${unknownViolations.length} unknowns lack active collection or terminal reason.`,
      unknownViolations.slice(0, 20),
    ),
    highPriorityHasWhyRanked: status(
      priorityViolations.length === 0,
      `${priorityViolations.length} high-priority incidents lack factors/revision/comparison rationale.`,
      priorityViolations.slice(0, 20).map((item) => item?.incident?.id),
    ),
    highImpactDecisionHasDelayConsequence: status(
      autopilotRuntimeComplete && criticalDecisionViolations.length === 0,
      `${criticalDecisionViolations.length} life-safety/critical decisions lack consequence of delay.`,
      criticalDecisionViolations,
    ),
    recommendationValidity: status(
      autopilotRuntimeComplete && recommendationViolations.length === 0 && withheldRecommendationLeaks.length === 0,
      `${recommendationViolations.length} admitted recommendations lack bounded validity; ${withheldRecommendationLeaks.length} withheld recommendations leaked content.`,
    ),
    machineToHumanCompression: status(humanCompressionPass, `Portfolio machine-to-human conversion is ${humanPercent ?? "not applicable"}%.`, humanCounts),
    missedRequiredHumanDecisionZero: status(
      autopilotRuntimeComplete && missedHumanDecisions.length === 0,
      `${missedHumanDecisions.length} required critical human decisions were omitted.`,
      missedHumanDecisions,
    ),
    sentinelTruthBoundary: status(
      autopilotRuntimeComplete && anomalyViolations.length === 0,
      `${anomalyViolations.length} anomaly records violate indicator-only semantics.`,
      anomalyViolations.slice(0, 20),
    ),
    commandStaffBounded: status(
      autopilotRuntimeComplete && staffViolations.length === 0 && directAutopilots.every((item) => rows(item.commandStaff?.advisories).length === 8),
      `${staffViolations.length} advisory authority/truth/execution violations.`,
      staffViolations,
    ),
    adversarialDecisionCouncilBounded: status(
      autopilotRuntimeComplete && councilViolations.length === 0,
      `${councilViolations.length} council records violate complete-review admission or truth/authority/execution boundaries.`,
      councilViolations,
    ),
    strategicP1Systems: status(
      strategicIntelligenceProof.state === "PASS",
      `${strategicIntelligenceProof.observedRouteProjections}/${strategicIntelligenceProof.expectedRouteProjections} projections expose governed contracts; ${strategicIntelligenceProof.capabilityAccounting?.usableAdmitted ?? 0} usable and ${strategicIntelligenceProof.capabilityAccounting?.implementedFailClosed ?? 0} implemented fail-closed boundaries; ${strategicViolations.length} integrity violations.`,
      strategicIntelligenceProof,
    ),
    publicReportAutoVerificationZero: status(
      publicAutoVerificationViolations.length === 0 && goldenScenarios.state === "PASS",
      `${publicAutoVerificationViolations.length} runtime public-observer records claim auto-verification; the isolated public-observer invariant is ${goldenScenarios.state}.`,
      publicAutoVerificationViolations,
    ),
    fieldNetAuthoritativeReadiness: status(
      runtimeProof?.fieldnetReadiness?.ready === true,
      runtimeProof?.fieldnetReadiness?.ready === true ? "Authoritative FieldNet readiness is true." : "Authoritative FieldNet readiness is unavailable or false.",
    ),
    terrainCoverage: status(
      validCoordinateIncidents.length > 0 &&
        terrainCoverageViolations.length === 0 &&
        selectedTerrainViolations.length === 0 &&
        Number(governedContext.coverage?.terrainAvailable) === validCoordinateIncidents.length &&
        Number(governedContext.coverage?.terrainUnavailable) === 0,
      `${validCoordinateIncidents.length - terrainCoverageViolations.length}/${validCoordinateIncidents.length} valid canonical coordinates have governed terrain records; ${selectedTerrainViolations.length} selected map routes lack terrain.`,
      {
        coverage: governedContext.coverage,
        violationIncidentIds: terrainCoverageViolations.slice(0, 20).map((item) => item.incident.id),
        selectedRouteViolations: selectedTerrainViolations.map((item) => item.name),
      },
    ),
    thermalPerimeterSeparation: status(
      thermalPerimeterViolations.length === 0 && observedGeometryAdmissionViolations.length === 0,
      `${thermalPerimeterViolations.length} thermal features are marked as authoritative perimeter; ${observedGeometryAdmissionViolations.length} observed-geometry features lack authoritative admission.`,
      { thermalPerimeterViolations, observedGeometryAdmissionViolations },
    ),
  };
}
