export function analyzeOperationsAndMaps({
  incidentRoutes,
  section,
  rows,
  latestExercise,
  runtimeState,
  selectedResponse,
  selectedIncidentId,
  incidentRows,
  governedContext,
  iso,
  objectRows,
}) {
  const responseItems = rows(section(incidentRoutes.operations?.body, "responseOperations")?.items);
  const assignmentOwnerViolations = responseItems.filter(
    (item) => ["ASSIGNMENT", "PERSISTED_ACTION", "INCIDENT_ORDER"].includes(item.operationType) && !item.owner?.label,
  );
  const exerciseAssignmentViolations = rows(latestExercise?.assignments).filter((item) => !item.assignee);
  const acknowledgementViolations = rows(latestExercise?.acknowledgements).filter(
    (item) => !item.acknowledgementId || !item.targetType || !item.targetId || !iso(item.at),
  );
  const protectionWorkflows = rows(runtimeState.protectionWorkflows);
  const unauthorizedLiveSends = protectionWorkflows.filter(
    (item) => item.universe === "LIVE_PRODUCTION" && item.state === "DISPATCHED" && !(item.approval?.state === "APPROVED" && item.dispatch?.receipt),
  );
  const exerciseSendViolations = protectionWorkflows.filter((item) => item.universe !== "LIVE_PRODUCTION" && item.dispatch?.externalSendEnabled === true);
  const allPeriodOutcomes = rows(runtimeState.operationalPeriods).flatMap((period) => rows(period.outcomes).map((outcome) => ({ period, outcome })));
  const successWithoutPostcondition = allPeriodOutcomes.filter(
    ({ period, outcome }) =>
      outcome.classification === "SUCCESS" &&
      !rows(period.postconditions).some(
        (postcondition) => postcondition.postconditionId === outcome.postconditionId && postcondition.actionId === outcome.actionId,
      ),
  );
  const replayProductionLeaks = rows(runtimeState.certifiedActionOutcomeChains).filter(
    (chain) => /REPLAY|EXERCISE/.test(String(chain.universe ?? "").toUpperCase()) && (chain.productionTruth !== false || chain.externalSendEnabled !== false),
  );
  const scenesByRoute = ["detail", "intelligence", "operations"].map((name) => ({
    name,
    scene: section(incidentRoutes[name]?.body, "mapScene"),
  }));
  const scenes = scenesByRoute.map((item) => item.scene).filter(Boolean);
  const expectedResponseRouteKinds = [
    ...new Set(
      rows(selectedResponse?.resourceCoverageMap?.routeFeatures?.features)
        .map((feature) => feature?.properties?.facilityKind)
        .filter(Boolean),
    ),
  ];
  const expectedResponseFacilityKinds = [
    ...new Set(
      rows(selectedResponse?.resourceCoverageMap?.facilityFeatures?.features)
        .map((feature) => feature?.properties?.facilityKind)
        .filter(Boolean),
    ),
  ];
  const expectedResponseCoverageSamples = rows(selectedResponse?.resourceCoverageMap?.responseCoverageSurface?.features?.features);
  const selectedResponseFacilityCount = Object.values(selectedResponse?.facilities ?? {}).flatMap(rows).length;
  const routeCoverageSceneViolations = scenesByRoute.flatMap(({ name, scene }) => {
    const routeFeatures = rows(scene?.layers?.responseCoverageRoutes?.value);
    const facilityFeatures = rows(scene?.layers?.responseFacilities?.value);
    const coverageSamples = rows(scene?.layers?.responseCoverageSurface?.value);
    const actualRouteKinds = new Set(routeFeatures.map((feature) => feature?.properties?.facilityKind).filter(Boolean));
    const actualFacilityKinds = new Set(facilityFeatures.map((feature) => feature?.properties?.facilityKind).filter(Boolean));
    const missingRouteKinds = expectedResponseRouteKinds.filter((kind) => !actualRouteKinds.has(kind));
    const missingFacilityKinds = expectedResponseFacilityKinds.filter((kind) => !actualFacilityKinds.has(kind));
    return !selectedResponse ||
      selectedResponseFacilityCount < 1 ||
      expectedResponseFacilityKinds.length < 1 ||
      (expectedResponseRouteKinds.length > 0 && !routeFeatures.length) ||
      (expectedResponseCoverageSamples.length > 0 && !coverageSamples.length) ||
      !facilityFeatures.length ||
      missingRouteKinds.length ||
      missingFacilityKinds.length
      ? [
          {
            route: name,
            reason: "RESPONSE_COVERAGE_MAP_LAYERS_MISSING_OR_CLASS_TRUNCATED",
            missingRouteKinds,
            missingFacilityKinds,
            expectedCoverageSamples: expectedResponseCoverageSamples.length,
            actualCoverageSamples: coverageSamples.length,
            selectedResponseFacilityCount,
          },
        ]
      : [];
  });
  const mapMismatches = scenes.filter(
    (scene) =>
      scene.selectedIncidentId !== selectedIncidentId ||
      scene.focusIncidentId !== selectedIncidentId ||
      (scene.selectionAssociation?.incidentId && scene.selectionAssociation.incidentId !== selectedIncidentId),
  );
  const thermalPerimeterViolations = scenesByRoute.flatMap(({ name, scene }) =>
    rows(scene?.layers?.thermalSupport?.value)
      .filter((feature) => feature?.properties?.authoritativePerimeter === true || /OFFICIAL.?PERIMETER/i.test(String(feature?.properties?.kind ?? "")))
      .map((feature) => ({ route: name, feature })),
  );
  const observedGeometryAdmissionViolations = scenesByRoute.flatMap(({ name, scene }) =>
    rows(scene?.layers?.observedGeometry?.value)
      .filter((feature) => feature?.properties?.authoritativePerimeter !== true && !/OFFICIAL.?PERIMETER/i.test(String(feature?.properties?.kind ?? "")))
      .map((feature) => ({ route: name, feature })),
  );
  const selectedTerrainViolations = scenesByRoute.filter(
    ({ name, scene }) =>
      ["detail", "intelligence"].includes(name) &&
      selectedIncidentId &&
      (!rows(scene?.layers?.terrain?.value).length || scene?.layers?.terrain?.state !== "READY"),
  );
  const validCoordinateIncidents = incidentRows.filter(
    (item) => Array.isArray(item?.incident?.coordinate) && item.incident.coordinate.length === 2 && item.incident.coordinate.every(Number.isFinite),
  );
  const governedContextByIncident = new Map(rows(governedContext.incidents).map((item) => [item.incidentId, item]));
  const terrainCoverageViolations = validCoordinateIncidents.filter((item) => {
    const context = governedContextByIncident.get(item.incident.id);
    const terrain = context?.terrain;
    return (
      !terrain ||
      terrain.state !== "AVAILABLE" ||
      !terrain.geometry ||
      !terrain.provider ||
      !terrain.sourceOwner ||
      !terrain.product ||
      !Number.isFinite(terrain.resolutionM) ||
      !terrain.retrievedAt ||
      !terrain.license ||
      !terrain.decisionBoundary
    );
  });
  const runtimePublicFieldObjects = objectRows(runtimeState).filter((item) => !Array.isArray(item) && item?.observerClass === "PUBLIC");
  const publicAutoVerificationViolations = runtimePublicFieldObjects.filter((item) =>
    ["VERIFIED_CURRENT", "AUTO_VERIFIED", "VERIFIED_INCIDENT_TRUTH"].includes(
      String(item.reportState ?? item.admissionState ?? item.operationalTruth?.classification ?? "").toUpperCase(),
    ),
  );
  return {
    responseItems,
    assignmentOwnerViolations,
    exerciseAssignmentViolations,
    acknowledgementViolations,
    protectionWorkflows,
    unauthorizedLiveSends,
    exerciseSendViolations,
    allPeriodOutcomes,
    successWithoutPostcondition,
    replayProductionLeaks,
    scenesByRoute,
    scenes,
    expectedResponseRouteKinds,
    expectedResponseFacilityKinds,
    expectedResponseCoverageSamples,
    routeCoverageSceneViolations,
    mapMismatches,
    thermalPerimeterViolations,
    observedGeometryAdmissionViolations,
    selectedTerrainViolations,
    validCoordinateIncidents,
    governedContextByIncident,
    terrainCoverageViolations,
    runtimePublicFieldObjects,
    publicAutoVerificationViolations,
  };
}
