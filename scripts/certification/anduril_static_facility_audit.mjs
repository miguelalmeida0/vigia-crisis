import { GovernedResponseFacilityRepository } from "../../apps/api/src/modules/response-capability/governed-facility-repository.mjs";

const REQUIRED_KINDS = Object.freeze(["HOSPITAL", "FIRE_STATION"]);

function coordinateOf(item) {
  const coverage = item?.operationalTruth?.axes?.incidentCoverage;
  const coordinate = coverage?.coordinate ?? item?.incident?.coordinate;
  return Array.isArray(coordinate) && coordinate.length === 2 && coordinate.every(Number.isFinite) ? coordinate : null;
}

export async function auditGovernedStaticFacilityCoverage({ root, incidentRows }) {
  const repository = new GovernedResponseFacilityRepository({ projectRoot: root });
  const repositoryStatus = await repository.initialize();
  const summaries = [];
  const violations = [];
  for (const item of incidentRows) {
    const incidentId = item?.incident?.id;
    const coordinate = coordinateOf(item);
    if (!incidentId || !coordinate) continue;
    const projection = repository.nearest(coordinate, { limitPerKind: 1, maximumDistanceKm: 150 });
    const byKind = {};
    for (const kind of REQUIRED_KINDS) {
      const retrieval = projection.retrieval?.byKind?.[kind];
      const facilities = projection.byKind?.[kind] ?? [];
      const source = projection.sourceCoverage?.[kind];
      const provenanceValid = facilities.every(
        (facility) =>
          facility?.provenance?.provider &&
          facility?.provenance?.sourceRecordId &&
          /^sha256:[a-f0-9]{64}$/.test(facility?.provenance?.archiveSha256 ?? ""),
      );
      byKind[kind] = {
        governedSourceRecordCount: retrieval?.governedSourceRecordCount ?? 0,
        withinDistanceCount: retrieval?.withinDistanceCount ?? 0,
        returnedCandidateCount: retrieval?.returnedCandidateCount ?? 0,
        sourceState: source?.state ?? "MISSING",
        provenanceValid,
      };
      if (
        !projection.covered ||
        retrieval?.withinDistanceCount < 1 ||
        retrieval?.returnedCandidateCount < 1 ||
        source?.state !== "GOVERNED_ARCHIVE_AVAILABLE" ||
        !provenanceValid
      )
        violations.push({ incidentId, kind, ...byKind[kind] });
    }
    summaries.push({ incidentId, coordinate, covered: projection.covered, byKind });
  }
  return {
    schemaVersion: "vigia.governed-static-response-facility-audit.v1",
    state: summaries.length > 0 && violations.length === 0 ? "PASS" : "FAIL",
    auditMethod: "DIRECT_LOCAL_GOVERNED_ARCHIVE_QUERY_NO_ROUTING_OR_PUBLIC_PROVIDER_CALLS",
    repositoryStatus,
    requiredKinds: [...REQUIRED_KINDS],
    incidentCount: summaries.length,
    summaries,
    violations,
    truthBoundary:
      "This local archive audit proves static governed hospital and fire-station candidate coverage only. It does not prove road reachability, current capacity, dispatch, availability, arrival, or a nonzero VERIFIED_CURRENT production cohort.",
  };
}
