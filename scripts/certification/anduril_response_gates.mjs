export function createResponseGates(s) {
  const {
    status,
    goldenScenarios,
    selectedResponseCoverageViolations,
    selectedResponse,
    rows,
    requiredResponseIncidentIds,
    nearestResponseCoverageViolations,
    governedGeolocatedIncidentIds,
    governedStaticFacilityAudit,
    governedResponseCoverageViolations,
    responseFacilityClassViolations,
    responseSourceCoverageViolations,
    responseRetrievalAudit,
    responseCoverageSummaries,
    responseProjections,
    coverageMapViolations,
    routeCoverageSceneViolations,
    surgeProjectionViolations,
    responseIncidentViolations,
    responseEmbedded,
    selectedIncidentId,
    responseFacilityPopulation,
    staticProvenanceViolations,
    routeTruthViolations,
    optimizerCapacityCollectionAudit,
    unknownCapacityZeroViolations,
    unknownCapacityWithoutPlan,
    responseGapViolations,
    admittedCapacityProvenanceViolations,
    piiLeaks,
    totalHeadcountLeaks,
  } = s;
  const activeCohortMeasured = requiredResponseIncidentIds.length > 0;
  const activeCohortState = activeCohortMeasured ? "MEASURED" : "NOT_APPLICABLE_ZERO_VERIFIED_CURRENT_COHORT";
  const selectedRoutingViolations = responseRetrievalAudit.routingResolutionViolations.filter(
    (item) => item.incidentId === selectedIncidentId,
  );
  return {
    selectedResponseCapability: status(
      Boolean(selectedIncidentId) &&
        selectedResponse?.incident?.id === selectedIncidentId &&
        rows(selectedResponse?.facilities?.HOSPITAL).length > 0 &&
        rows(selectedResponse?.facilities?.FIRE_STATION).length > 0 &&
        selectedResponseCoverageViolations.length === 0,
      selectedResponse
        ? `${rows(selectedResponse.facilities?.HOSPITAL).length} hospital and ${rows(selectedResponse.facilities?.FIRE_STATION).length} fire-station candidates for the selected geolocated incident; selected coverage is reported separately from VERIFIED_CURRENT cohort coverage.`
        : "Selected-incident response capability unavailable.",
      selectedResponseCoverageViolations,
    ),
    verifiedCurrentResponseCoverage: activeCohortMeasured
      ? status(
          nearestResponseCoverageViolations.length === 0,
          `${requiredResponseIncidentIds.length - nearestResponseCoverageViolations.length}/${requiredResponseIncidentIds.length} VERIFIED_CURRENT geolocated incidents have hospital and fire-station candidates.`,
          {
            cohortState: activeCohortState,
            measuredPercentage:
              ((requiredResponseIncidentIds.length - nearestResponseCoverageViolations.length) / requiredResponseIncidentIds.length) * 100,
            violations: nearestResponseCoverageViolations,
            activeSubset: responseCoverageSummaries.verifiedCurrent,
            selectedSubset: responseCoverageSummaries.selected,
          },
        )
      : {
          state: "NOT_APPLICABLE",
          evidence:
            "NOT_APPLICABLE_ZERO_VERIFIED_CURRENT_COHORT: no production response-coverage percentage is computed and no incident is promoted. Software capability is certified separately against the governed geolocated denominator and selected/isolated routed proof.",
          details: {
            cohortState: activeCohortState,
            measuredPercentage: null,
            violations: [],
            activeSubset: responseCoverageSummaries.verifiedCurrent,
            selectedSubset: responseCoverageSummaries.selected,
          },
        },
    governedGeolocatedResponseCoverage: status(
      governedGeolocatedIncidentIds.length > 0 && governedStaticFacilityAudit?.state === "PASS" && governedResponseCoverageViolations.length === 0,
      `${governedGeolocatedIncidentIds.length - governedResponseCoverageViolations.length}/${governedGeolocatedIncidentIds.length} distinct governed geolocated incidents have local-archive hospital and fire-station candidates within the governed distance bound. This static audit makes no routed/current-capacity claim; VERIFIED_CURRENT is separately disclosed.`,
      {
        denominatorIncidentIds: governedGeolocatedIncidentIds,
        violations: governedResponseCoverageViolations,
        governedGeolocatedSubset: responseCoverageSummaries.governedGeolocated,
        auditMethod: governedStaticFacilityAudit?.auditMethod ?? null,
        truthBoundary: governedStaticFacilityAudit?.truthBoundary ?? null,
        activeSubset: responseCoverageSummaries.verifiedCurrent,
      },
    ),
    responseSoftwareCapability: status(
      governedGeolocatedIncidentIds.length > 0 &&
        governedStaticFacilityAudit?.state === "PASS" &&
        governedResponseCoverageViolations.length === 0 &&
        responseRetrievalAudit.retrievalCoverageViolations.length === 0 &&
        selectedResponse?.routing?.state === "AVAILABLE" &&
        selectedRoutingViolations.length === 0 &&
        goldenScenarios?.state === "PASS",
      `${governedGeolocatedIncidentIds.length} distinct governed geolocated records form the static retrieval denominator; selected routing is ${selectedResponse?.routing?.state ?? "MISSING"} with ${selectedRoutingViolations.length} contract violations; isolated integrated golden proof is ${goldenScenarios?.state ?? "MISSING"}. This does not imply a nonzero VERIFIED_CURRENT production cohort.`,
      {
        governedGeolocatedIncidentCount: governedGeolocatedIncidentIds.length,
        selectedIncidentId,
        selectedRoutingState: selectedResponse?.routing?.state ?? null,
        selectedRoutingViolations,
        isolatedGoldenState: goldenScenarios?.state ?? null,
        productionVerifiedCurrentCohort: activeCohortState,
      },
    ),
    responseFacilityClassContract: status(
      responseProjections.length > 0 && responseFacilityClassViolations.length === 0 && responseSourceCoverageViolations.length === 0,
      `${responseFacilityClassViolations.length} missing class arrays and ${responseSourceCoverageViolations.length} facility classes lack a governed all-class acquisition scope.`,
      {
        classViolations: responseFacilityClassViolations,
        sourceCoverageViolations: responseSourceCoverageViolations,
      },
    ),
    responseRetrievalDenominatorAndRank: status(
      responseProjections.length > 0 && responseRetrievalAudit.retrievalCoverageViolations.length === 0,
      `${responseRetrievalAudit.retrievalCoverageViolations.length} response retrieval denominator, rank, or candidate-cohort explanation violations.`,
      {
        violations: responseRetrievalAudit.retrievalCoverageViolations,
        selectedSubset: responseCoverageSummaries.selected,
        activeSubset: responseCoverageSummaries.verifiedCurrent,
        governedGeolocatedSubset: responseCoverageSummaries.governedGeolocated,
      },
    ),
    routedResourceCoverageMap: status(
      responseProjections.length > 0 && coverageMapViolations.length === 0 && routeCoverageSceneViolations.length === 0,
      `${coverageMapViolations.length} response coverage projection violations; ${routeCoverageSceneViolations.length} selected-incident route maps lack routed path, sampled road-network surface, or facility layers.`,
      {
        projectionViolations: coverageMapViolations,
        routeViolations: routeCoverageSceneViolations,
      },
    ),
    responseSurgeTruthBoundaries: status(
      responseProjections.length > 0 && surgeProjectionViolations.length === 0,
      `${surgeProjectionViolations.length} medical/fire surge projections violate withheld or admitted range contracts.`,
      surgeProjectionViolations,
    ),
    responseIncidentIdentity: status(
      responseIncidentViolations.length === 0 && responseEmbedded.every((item) => item.value?.incident?.id === selectedIncidentId),
      `${responseIncidentViolations.length} response incident mismatches; embedded sections checked on Detail, Intelligence, and Operations.`,
    ),
    staticFacilityProvenance: status(
      responseFacilityPopulation.length > 0 && staticProvenanceViolations.length === 0 && governedStaticFacilityAudit?.state === "PASS",
      `${staticProvenanceViolations.length}/${responseFacilityPopulation.length} selected routed facility projections lack governed archive provenance; the all-coordinate static denominator is independently checked by the local governed-facility audit.`,
      staticProvenanceViolations.slice(0, 20).map(({ incidentId, facility }) => ({
        incidentId,
        facilityId: facility.id,
      })),
    ),
    operationalReachabilityTruth: status(
      responseFacilityPopulation.length > 0 && routeTruthViolations.length === 0 && responseRetrievalAudit.routingResolutionViolations.length === 0,
      `${routeTruthViolations.length}/${responseFacilityPopulation.length} facility projections conflate distance and routed travel time; ${responseRetrievalAudit.routingResolutionViolations.length} routing completion/source violations. AVAILABLE requires every eligible facility to be ROUTED or provider-declared UNREACHABLE.`,
      {
        facilityViolations: routeTruthViolations.slice(0, 20).map(({ incidentId, facility }) => ({
          incidentId,
          facilityId: facility.id,
        })),
        routingViolations: responseRetrievalAudit.routingResolutionViolations,
        selectedSubset: responseCoverageSummaries.selected,
        activeSubset: responseCoverageSummaries.verifiedCurrent,
      },
    ),
    dynamicCapacityUnknownNotZero: status(
      responseProjections.length > 0 && optimizerCapacityCollectionAudit.state === "PASS" && unknownCapacityZeroViolations.length === 0,
      `${unknownCapacityWithoutPlan.length} optimizer candidates with capacityKnown=false lack collection plans regardless of provider report state; ${unknownCapacityZeroViolations.length} unknown capacities are silently represented as zero.`,
      {
        collectionPlanAudit: optimizerCapacityCollectionAudit,
        representedAsZero: unknownCapacityZeroViolations.map((item) => item.id),
      },
    ),
    responseGapExplanation: status(
      responseProjections.length > 0 && responseGapViolations.length === 0,
      `${responseGapViolations.length} response gaps lack code, why, impact, or next action.`,
      responseGapViolations,
    ),
    liveCapacityProvenance: status(
      responseProjections.length > 0 && admittedCapacityProvenanceViolations.length === 0,
      `${admittedCapacityProvenanceViolations.length} non-UNKNOWN dynamic capacity records lack admitted attributable provenance.`,
      admittedCapacityProvenanceViolations.map((item) => item.id),
    ),
    fieldPiiLeakZero: status(
      piiLeaks.length === 0 && totalHeadcountLeaks.length === 0,
      `${piiLeaks.length} response projections contain forbidden personal staffing fields; ${totalHeadcountLeaks.length} conflate total headcount with current availability.`,
    ),
  };
}
