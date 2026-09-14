export function analyzeResponseCoverage({ responseProjections, rows }) {
  const coverageMapViolations = responseProjections.flatMap((projection) => {
    const map = projection.resourceCoverageMap;
    if (!map)
      return [
        {
          incidentId: projection.incident?.id,
          reason: "RESOURCE_COVERAGE_MAP_MISSING",
        },
      ];
    const features = rows(map.routeFeatures?.features);
    const violations = features
      .filter(
        (feature) =>
          feature?.geometry?.type !== "LineString" ||
          !rows(feature.geometry?.coordinates).every(
            (coordinate) => Array.isArray(coordinate) && coordinate.length >= 2 && coordinate.slice(0, 2).every(Number.isFinite),
          ) ||
          !feature.properties?.facilityId ||
          feature.properties?.dispatchClaimed !== false,
      )
      .map((feature) => ({
        incidentId: projection.incident?.id,
        featureId: feature?.id,
        reason: "ROUTED_COVERAGE_FEATURE_INVALID",
      }));
    if (
      map.geometryPolicy !== "ROUTED_ROAD_LINES_ONLY" ||
      map.serviceArea?.geometry !== null ||
      /Polygon|MultiPolygon|Circle/.test(JSON.stringify(map.routeFeatures ?? {}))
    )
      violations.push({
        incidentId: projection.incident?.id,
        reason: "DECORATIVE_OR_UNGOVERNED_SERVICE_AREA_GEOMETRY",
      });
    if (map.state === "ROUTED_PATH_COVERAGE_AVAILABLE" && !features.length)
      violations.push({
        incidentId: projection.incident?.id,
        reason: "AVAILABLE_COVERAGE_HAS_NO_ROUTE_FEATURE",
      });
    if (map.state !== "ROUTED_PATH_COVERAGE_AVAILABLE" && !(map.serviceArea?.reason && map.serviceArea?.unlockCondition))
      violations.push({
        incidentId: projection.incident?.id,
        reason: "WITHHELD_COVERAGE_LIFECYCLE_INCOMPLETE",
      });
    const surface = map.responseCoverageSurface;
    const samples = rows(surface?.features?.features);
    if (!surface || surface.geometryPolicy !== "ROUTED_POINT_SAMPLES_NO_INTERPOLATED_AREA")
      violations.push({
        incidentId: projection.incident?.id,
        reason: "ROAD_NETWORK_SAMPLE_SURFACE_CONTRACT_MISSING",
      });
    if (features.length && surface?.state !== "ROAD_NETWORK_SAMPLE_SURFACE_AVAILABLE")
      violations.push({
        incidentId: projection.incident?.id,
        reason: "ROUTED_PATHS_EXIST_BUT_REGIONAL_SAMPLE_SURFACE_WITHHELD",
        state: surface?.state,
        detail: surface?.reason,
      });
    if (surface?.state === "ROAD_NETWORK_SAMPLE_SURFACE_AVAILABLE" && !samples.length)
      violations.push({
        incidentId: projection.incident?.id,
        reason: "AVAILABLE_SAMPLE_SURFACE_HAS_NO_POINTS",
      });
    for (const sample of samples) {
      if (
        sample?.geometry?.type !== "Point" ||
        !Array.isArray(sample.geometry.coordinates) ||
        !sample.geometry.coordinates.slice(0, 2).every(Number.isFinite) ||
        !sample.properties?.coverageState ||
        !sample.properties?.explanation ||
        !sample.properties?.capabilityByKind
      ) {
        violations.push({
          incidentId: projection.incident?.id,
          featureId: sample?.id,
          reason: "RESPONSE_COVERAGE_SAMPLE_NOT_EXPLAINABLE",
        });
      }
    }
    if (/\"type\":\"(?:Polygon|MultiPolygon|Circle)\"/.test(JSON.stringify(surface?.features ?? {})))
      violations.push({
        incidentId: projection.incident?.id,
        reason: "SAMPLE_SURFACE_CONTAINS_INTERPOLATED_OR_DECORATIVE_AREA",
      });
    return violations;
  });
  const surgeProjectionViolations = responseProjections.flatMap((projection) =>
    [
      ["medicalSurge", projection.medicalSurge],
      ["fireResponseSurge", projection.fireResponseSurge],
    ].flatMap(([name, surge]) => {
      if (!surge)
        return [
          {
            incidentId: projection.incident?.id,
            name,
            reason: "SURGE_PROJECTION_MISSING",
          },
        ];
      if (String(surge.state).startsWith("WITHHELD"))
        return surge.reason && surge.unlockCondition && rows(surge.requiredInputs).length && surge.executionClaimed === false
          ? []
          : [
              {
                incidentId: projection.incident?.id,
                name,
                reason: "WITHHELD_SURGE_LIFECYCLE_INCOMPLETE",
              },
            ];
      if (
        surge.state !== "ADMITTED_SCENARIO_RANGES" ||
        !surge.admissionReference ||
        !surge.source?.name ||
        !surge.source?.reference ||
        !surge.updatedAt ||
        !surge.validUntil ||
        Date.parse(surge.validUntil) <= Date.parse(surge.generatedAt) ||
        surge.deterministic !== false ||
        surge.executionClaimed !== false
      )
        return [
          {
            incidentId: projection.incident?.id,
            name,
            reason: "ADMITTED_SURGE_TRUTH_BOUNDARY_INVALID",
          },
        ];
      if (
        name === "medicalSurge" &&
        (rows(surge.scenarios).length !== 3 ||
          rows(surge.scenarios).some(
            (scenario) =>
              !Number.isFinite(scenario?.range?.min) ||
              !Number.isFinite(scenario?.range?.max) ||
              scenario.range.max < scenario.range.min ||
              !rows(scenario.assumptions).length ||
              !scenario.confidence?.state ||
              !rows(scenario.invalidatedBy).length,
          ) ||
          surge.exactCasualtyPrediction !== false)
      )
        return [
          {
            incidentId: projection.incident?.id,
            name,
            reason: "MEDICAL_SURGE_RANGE_CONTRACT_INVALID",
          },
        ];
      if (
        name === "fireResponseSurge" &&
        (rows(surge.resources).length !== 7 ||
          rows(surge.resources).some((resource) =>
            ["required", "available", "enRoute", "committed", "gap"].some(
              (field) => !Number.isFinite(resource?.[field]?.min) || !Number.isFinite(resource?.[field]?.max) || resource[field].max < resource[field].min,
            ),
          ) ||
          !rows(surge.assumptions).length ||
          !surge.confidence?.state ||
          !rows(surge.invalidatedBy).length ||
          surge.dispatchClaimed !== false)
      )
        return [
          {
            incidentId: projection.incident?.id,
            name,
            reason: "FIRE_SURGE_RANGE_CONTRACT_INVALID",
          },
        ];
      return [];
    }),
  );
  return { coverageMapViolations, surgeProjectionViolations };
}
