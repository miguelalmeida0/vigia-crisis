import { assessFeatureAvailability } from "./anduril_feature_availability.mjs";

export async function writeCertificationProofs(state) {
  const {
    detailPlanning,
    selectedResponse,
    latestExercise,
    runtimeState,
    detailAutopilot,
    testCohort,
    writeJson,
    selectedIncidentId,
    portfolios,
    section,
    incidentRoutes,
    bindings,
    runtimeProof,
    goldenScenarios,
    activeIncidentIds,
    standaloneResponse,
    responseEmbedded,
    planningEmbedded,
    planningMissingSections,
    planningWithheldLifecycleViolations,
    planningBoundaryViolations,
    validCoordinateIncidents,
    governedContext,
    terrainCoverageViolations,
    selectedTerrainViolations,
    thermalPerimeterViolations,
    observedGeometryAdmissionViolations,
    protectionWorkflows,
    unauthorizedLiveSends,
    exerciseSendViolations,
    successWithoutPostcondition,
    replayProductionLeaks,
    rows,
  } = state;
  const featureAvailability = assessFeatureAvailability({
    detailPlanning,
    selectedResponse,
    latestExercise,
    runtimeState,
    detailAutopilot,
    runtimeProof,
    testCohort,
    goldenScenarios,
  });
  await writeJson("autopilot/runtime-selected-projection.json", {
    schemaVersion: "vigia.anduril-autopilot-runtime-proof.v1",
    selectedIncidentId,
    projection: detailAutopilot,
    portfolios,
  });
  await writeJson("collection/runtime-selected-collection.json", {
    schemaVersion: "vigia.anduril-collection-runtime-proof.v1",
    selectedIncidentId,
    informationCollection: section(incidentRoutes.intelligence?.body, "informationCollection"),
    valueOfInformation: detailAutopilot?.valueOfInformation,
  });
  await writeJson("twin/runtime-selected-living-twin.json", {
    schemaVersion: "vigia.anduril-living-twin-runtime-proof.v1",
    selectedIncidentId,
    bindings,
    livingTwin: detailAutopilot?.livingTwin,
  });
  await writeJson("decisions/runtime-selected-decision-intelligence.json", {
    schemaVersion: "vigia.anduril-decision-runtime-proof.v1",
    selectedIncidentId,
    decisionCompression: detailAutopilot?.decisionCompression,
    regretRadar: detailAutopilot?.regretRadar,
    decisionHalfLife: detailAutopilot?.decisionHalfLife,
    uncertaintyBudget: detailAutopilot?.uncertaintyBudget,
    commandStaff: detailAutopilot?.commandStaff,
    decisionCouncil: detailAutopilot?.decisionCouncil,
  });
  await writeJson("fieldnet/runtime-readiness.json", {
    schemaVersion: "vigia.anduril-fieldnet-runtime-proof.v1",
    readiness: runtimeProof?.fieldnetReadiness ?? null,
    release: runtimeProof?.fieldnet ?? null,
    goldenScenarioState: goldenScenarios.state,
  });
  await writeJson("exposure/runtime-response-capability.json", {
    schemaVersion: "vigia.anduril-response-capability-runtime-proof.v1",
    selectedIncidentId,
    activeIncidentIds,
    standaloneResponse,
    embedded: responseEmbedded,
    featureAvailability: {
      dynamicExposureGraph: featureAvailability.dynamicExposureGraph,
      crisisDependencyGraph: featureAvailability.crisisDependencyGraph,
    },
  });
  await writeJson("exposure/runtime-planning.json", {
    schemaVersion: "vigia.anduril-crisis-planning-runtime-proof.v1",
    selectedIncidentId,
    embedded: planningEmbedded,
    missingSections: planningMissingSections,
    withheldLifecycleViolations: planningWithheldLifecycleViolations,
    boundaryViolations: planningBoundaryViolations,
  });
  await writeJson("exposure/terrain-and-geometry-truth.json", {
    schemaVersion: "vigia.anduril-terrain-geometry-runtime-proof.v1",
    validCoordinateIncidents: validCoordinateIncidents.length,
    governedTerrainRecords: rows(governedContext.incidents).length,
    terrainCoverageViolations,
    selectedTerrainViolations,
    thermalPerimeterViolations,
    observedGeometryAdmissionViolations,
  });
  await writeJson("operations/runtime-selected-operations.json", {
    schemaVersion: "vigia.anduril-operations-runtime-proof.v1",
    selectedIncidentId,
    responseOperations: section(incidentRoutes.operations?.body, "responseOperations"),
    operationalPeriod: section(incidentRoutes.operations?.body, "operationalPeriod"),
    crisisPlanning: planningEmbedded.find((item) => item.name === "operations") ?? null,
    latestExercise,
    featureAvailability: {
      resourceOptimizerOutput: featureAvailability.resourceOptimizerOutput,
      autonomousReplanning: featureAvailability.autonomousReplanning,
      evacuationCorridor: featureAvailability.evacuationCorridor,
    },
  });
  await writeJson("protection/runtime-protection.json", {
    schemaVersion: "vigia.anduril-protection-runtime-proof.v1",
    selectedIncidentId,
    workflows: protectionWorkflows,
    featureAvailability: {
      capLifecycle: featureAvailability.capLifecycle,
      multilingualComposer: featureAvailability.multilingualComposer,
      protectionTimeline: featureAvailability.protectionTimeline,
    },
    unauthorizedLiveSends,
    exerciseSendViolations,
  });
  await writeJson("outcomes/runtime-outcomes.json", {
    schemaVersion: "vigia.anduril-outcome-runtime-proof.v1",
    latestExercise,
    certifiedReplay: runtimeState.certifiedActionOutcomeChains ?? [],
    successWithoutPostcondition,
    replayProductionLeaks,
  });
  await writeJson("prevention/runtime-learning.json", {
    schemaVersion: "vigia.anduril-prevention-runtime-proof.v1",
    featureAvailability: {
      nearMiss: featureAvailability.nearMiss,
      prevention: featureAvailability.prevention,
    },
    preventionFindings: runtimeState.preventionFindings ?? [],
    preventionReviews: runtimeState.preventionReviews ?? [],
  });
  return { featureAvailability };
}
