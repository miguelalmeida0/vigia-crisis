import { auditOptimizerCapacityCollectionPlans } from "./anduril_integrity.mjs";
import { auditResponseRetrievalContracts } from "./anduril_response_retrieval_contract.mjs";

export function analyzeResponseCapability({ standaloneResponse, responseEmbedded, governedResponse, selectedIncidentId, activeIncidentIds, governedGeolocatedIncidentIds, governedStaticFacilityAudit, rows }) {
  const responseProjectionByIncident = new Map(
    [standaloneResponse, ...governedResponse.map((item) => item.result.body)]
      .filter((value) => value?.schemaVersion === "vigia.response-capability.v1" && value?.incident?.id)
      .map((value) => [value.incident.id, value]),
  );
  const responseProjections = [...responseProjectionByIncident.values()];
  const responseIncidentViolations = responseProjections.filter(
    (projection) => !governedGeolocatedIncidentIds.includes(projection.incident?.id),
  );
  const selectedResponse = responseProjections.find((projection) => projection.incident?.id === selectedIncidentId) ?? null;
  const facilities = selectedResponse ? Object.values(selectedResponse.facilities ?? {}).flatMap(rows) : [];
  const responseFacilityPopulation = responseProjections.flatMap((projection) =>
    Object.values(projection.facilities ?? {})
      .flatMap(rows)
      .map((facility) => ({ incidentId: projection.incident?.id, facility })),
  );
  const staticProvenanceViolations = responseFacilityPopulation.filter(
    ({ facility }) => !facility.provenance?.provider || !facility.provenance?.sourceRecordId || !facility.provenance?.archiveSha256,
  );
  const routeTruthViolations = responseFacilityPopulation.filter(({ facility }) => {
    const state = facility.reachability?.state;
    if (state === "ROUTED")
      return !Number.isFinite(facility.reachability?.travelTimeMinutes) || !facility.reachability?.method || !facility.reachability?.source;
    return facility.reachability?.travelTimeMinutes !== null;
  });
  const optimizerCapacityCollectionAudit = auditOptimizerCapacityCollectionPlans(responseProjections);
  const unknownCapacityWithoutPlan = optimizerCapacityCollectionAudit.violations;
  const forbiddenPiiPattern = /"(?:staffNames|doctorNames|nurseNames|firefighterNames|personalPhone|employeeId|individualSchedule)"\s*:/i;
  const piiLeaks = responseProjections.filter((projection) => forbiddenPiiPattern.test(JSON.stringify(projection)));
  const totalHeadcountPattern = /"(?:totalEmployees|employeeCount|totalHeadcount|staffTotal|workforceTotal)"\s*:/i;
  const totalHeadcountLeaks = responseProjections.filter((projection) => totalHeadcountPattern.test(JSON.stringify(projection)));
  const responseGapViolations = responseProjections.flatMap((projection) =>
    rows(projection.responseGaps).filter((gap) => !gap.code || !gap.why || !gap.impact || !gap.nextAction),
  );
  const unknownCapacityZeroViolations = responseProjections.flatMap((projection) =>
    Object.values(projection.facilities ?? {})
      .flatMap(rows)
      .filter(
        (facility) => facility.dynamicCapacity?.state === "UNKNOWN" && Object.values(facility.dynamicCapacity?.fields ?? {}).some((value) => value === 0),
      ),
  );
  const admittedCapacityProvenanceViolations = responseProjections.flatMap((projection) =>
    Object.values(projection.facilities ?? {})
      .flatMap(rows)
      .filter(
        (facility) =>
          facility.dynamicCapacity?.state !== "UNKNOWN" &&
          (!facility.dynamicCapacity?.lastUpdatedAt ||
            !facility.dynamicCapacity?.source?.name ||
            !facility.dynamicCapacity?.source?.reference ||
            !facility.dynamicCapacity?.source?.admissionReference),
      ),
  );
  const responseByIncident = new Map(responseProjections.map((projection) => [projection.incident?.id, projection]));
  const responseFacilityKinds = ["HOSPITAL", "FIRE_STATION", "EMS_BASE", "CIVIL_PROTECTION", "POLICE", "SHELTER", "WATER_POINT", "AIR_SUPPORT_BASE"];
  const responseFacilityClassViolations = responseProjections.flatMap((projection) =>
    responseFacilityKinds
      .filter((kind) => !Array.isArray(projection.facilities?.[kind]))
      .map((kind) => ({
        incidentId: projection.incident?.id,
        kind,
        reason: "FACILITY_CLASS_ARRAY_MISSING",
      })),
  );
  const responseRetrievalAudit = auditResponseRetrievalContracts(responseProjections, responseFacilityKinds);
  const responseCoverageSummaries = {
    selected: responseRetrievalAudit.summaries.filter((item) => item.incidentId === selectedIncidentId),
    verifiedCurrent: responseRetrievalAudit.summaries.filter((item) => activeIncidentIds.includes(item.incidentId)),
    governedGeolocated: governedStaticFacilityAudit?.summaries ?? [],
  };
  const responseSourceCoverageViolations = responseProjections.flatMap((projection) =>
    responseFacilityKinds
      .filter((kind) => !projection.sourceCoverage?.[kind] || projection.sourceCoverage[kind].state === "NOT_INCLUDED_IN_GOVERNED_ARCHIVE_QUERY")
      .map((kind) => ({
        incidentId: projection.incident?.id,
        kind,
        state: projection.sourceCoverage?.[kind]?.state ?? "MISSING",
      })),
  );
  const selectedResponseCoverageViolations =
    selectedIncidentId && (!selectedResponse || !rows(selectedResponse.facilities?.HOSPITAL).length || !rows(selectedResponse.facilities?.FIRE_STATION).length)
      ? [selectedIncidentId]
      : [];
  const requiredResponseIncidentIds = [...new Set(activeIncidentIds.filter(Boolean))];
  const nearestResponseCoverageViolations = requiredResponseIncidentIds.filter((incidentId) => {
    const projection = responseByIncident.get(incidentId);
    return !projection || !rows(projection.facilities?.HOSPITAL).length || !rows(projection.facilities?.FIRE_STATION).length;
  });
  const auditedIncidentIds = new Set((governedStaticFacilityAudit?.summaries ?? []).map((item) => item.incidentId));
  const governedResponseCoverageViolations = [
    ...(governedStaticFacilityAudit?.violations ?? []),
    ...governedGeolocatedIncidentIds.filter((incidentId) => !auditedIncidentIds.has(incidentId)).map((incidentId) => ({ incidentId, reason: "STATIC_FACILITY_AUDIT_MISSING" })),
  ];
  return {
    responseProjections,
    responseIncidentViolations,
    selectedResponse,
    facilities,
    responseFacilityPopulation,
    staticProvenanceViolations,
    routeTruthViolations,
    optimizerCapacityCollectionAudit,
    unknownCapacityWithoutPlan,
    piiLeaks,
    totalHeadcountLeaks,
    responseGapViolations,
    unknownCapacityZeroViolations,
    admittedCapacityProvenanceViolations,
    responseByIncident,
    responseFacilityKinds,
    responseFacilityClassViolations,
    responseSourceCoverageViolations,
    responseRetrievalAudit,
    responseCoverageSummaries,
    selectedResponseCoverageViolations,
    requiredResponseIncidentIds,
    nearestResponseCoverageViolations,
    governedResponseCoverageViolations,
  };
}
