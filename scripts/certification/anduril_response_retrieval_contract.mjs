const rows = (value) => (Array.isArray(value) ? value : []);
const nonnegativeInteger = (value) => Number.isInteger(value) && value >= 0;
const text = (value) => typeof value === "string" && value.trim().length > 0;
const exhaustiveKinds = new Set(["HOSPITAL", "FIRE_STATION"]);

function validateFacilityRank(incidentId, kind, facility, coverage) {
  const violations = [];
  const cohort = facility?.candidateCohort;
  if (!Number.isInteger(facility?.retrievalRank) || facility.retrievalRank < 1) {
    violations.push({
      incidentId,
      kind,
      facilityId: facility?.id,
      reason: "RETRIEVAL_RANK_MISSING",
    });
  }
  if (
    !cohort ||
    !Number.isInteger(cohort.straightLineRank) ||
    !Number.isInteger(cohort.routedRank) ||
    !Number.isInteger(cohort.decisionRank) ||
    !Number.isInteger(cohort.denominatorRankedCount) ||
    cohort.denominatorRankedCount !== coverage?.rankedCount ||
    !Number.isInteger(cohort.operatorCohortRank) ||
    cohort.operatorCohortRank < 1 ||
    cohort.operatorCohortRank > coverage?.returnedCount ||
    !text(cohort.selectedBecause) ||
    !text(cohort.eligibility) ||
    !Array.isArray(cohort.exclusions) ||
    !Array.isArray(cohort.exclusionReasons) ||
    cohort.eligibleForPlanningRecommendation !== (cohort.eligibility === "ELIGIBLE_FOR_PLANNING_RECOMMENDATION")
  ) {
    violations.push({
      incidentId,
      kind,
      facilityId: facility?.id,
      reason: "CANDIDATE_COHORT_EXPLANATION_INCOMPLETE",
    });
  }
  return violations;
}

function validateUnreachable(incidentId, facility) {
  const reachability = facility?.reachability;
  if (
    reachability?.state !== "UNREACHABLE" ||
    !text(reachability.reason) ||
    !text(reachability.checkedAt) ||
    !text(reachability.source?.provider ?? reachability.source?.name ?? reachability.source)
  ) {
    return [
      {
        incidentId,
        facilityId: facility?.id,
        reason: "UNREACHABLE_PROVIDER_DECLARATION_INCOMPLETE",
      },
    ];
  }
  return [];
}

export function auditResponseRetrievalContracts(projections, facilityKinds) {
  const retrievalCoverageViolations = [];
  const routingResolutionViolations = [];
  const summaries = [];

  for (const projection of projections) {
    const incidentId = projection.incident?.id ?? null;
    const facilities = facilityKinds.flatMap((kind) =>
      rows(projection.facilities?.[kind]).map((facility) => ({
        kind,
        facility,
      })),
    );
    for (const kind of facilityKinds) {
      const kindFacilities = facilities.filter((item) => item.kind === kind).map((item) => item.facility);
      const coverage = projection.retrievalCoverage?.byKind?.[kind];
      const ranked = kindFacilities.filter((facility) => Number.isInteger(facility?.retrievalRank));
      if (
        !coverage ||
        !nonnegativeInteger(coverage.retrievedCount) ||
        !nonnegativeInteger(coverage.eligibleCount) ||
        !nonnegativeInteger(coverage.rankedCount) ||
        !nonnegativeInteger(coverage.returnedCount) ||
        !nonnegativeInteger(coverage.truncatedCount) ||
        !nonnegativeInteger(coverage.operatorTrimmedCount) ||
        coverage.retrievedCount !== coverage.eligibleCount + coverage.truncatedCount ||
        coverage.rankedCount !== coverage.eligibleCount ||
        coverage.returnedCount !== kindFacilities.length ||
        coverage.operatorTrimmedCount !== coverage.eligibleCount - coverage.returnedCount ||
        ranked.length !== kindFacilities.length ||
        (exhaustiveKinds.has(kind) &&
          (coverage.truncatedCount !== 0 || coverage.cohortPolicy !== "EXHAUSTIVE_WITHIN_GOVERNED_MAX_DISTANCE"))
      ) {
        retrievalCoverageViolations.push({
          incidentId,
          kind,
          reason: "RETRIEVAL_DENOMINATOR_OR_RANK_COUNT_INVALID",
          coverage: coverage ?? null,
          returnedCount: kindFacilities.length,
        });
      }
      const ranks = ranked.map((facility) => facility.retrievalRank);
      if (new Set(ranks).size !== ranks.length) {
        retrievalCoverageViolations.push({
          incidentId,
          kind,
          reason: "RETRIEVAL_RANK_DUPLICATE",
          ranks,
        });
      }
      for (const facility of kindFacilities) {
        retrievalCoverageViolations.push(...validateFacilityRank(incidentId, kind, facility, coverage));
      }
    }

    const routing = projection.routing;
    const routingSource = projection.sourceCoverage?.ROAD_ROUTING;
    const eligibleCandidateCount = facilityKinds.reduce(
      (count, kind) => count + Number(projection.retrievalCoverage?.byKind?.[kind]?.eligibleCount ?? 0),
      0,
    );
    const stateCounts = routing?.stateCounts ?? {};
    const resolvedCandidateCount = Number(stateCounts.ROUTED ?? 0) + Number(stateCounts.UNREACHABLE ?? 0);
    const returnedUnresolved = facilities.filter(
      ({ facility }) => !["ROUTED", "UNREACHABLE"].includes(facility?.reachability?.state),
    );
    for (const { facility } of facilities.filter(({ facility }) => facility?.reachability?.state === "UNREACHABLE")) {
      routingResolutionViolations.push(...validateUnreachable(incidentId, facility));
    }
    if (
      !routing ||
      !["AVAILABLE", "DEGRADED"].includes(routing.state) ||
      !nonnegativeInteger(routing.eligibleCandidateCount) ||
      !nonnegativeInteger(routing.resolvedCandidateCount) ||
      routing.eligibleCandidateCount !== eligibleCandidateCount ||
      routing.resolvedCandidateCount !== resolvedCandidateCount ||
      !routing.stateCounts ||
      Object.values(routing.stateCounts ?? {}).some((count) => !nonnegativeInteger(count)) ||
      Object.values(routing.stateCounts ?? {}).reduce((sum, count) => sum + Number(count), 0) !== eligibleCandidateCount ||
      !text(routing.completionRule) ||
      !text(routing.checkedAt) ||
      !text(routing.source?.provider ?? routing.source?.name ?? routing.source)
    ) {
      routingResolutionViolations.push({
        incidentId,
        reason: "ROUTING_COMPLETION_CONTRACT_INVALID",
        routing: routing ?? null,
        expectedEligibleCandidateCount: eligibleCandidateCount,
      });
    }
    if (routing?.state === "AVAILABLE") {
      if (routing.resolvedCandidateCount !== routing.eligibleCandidateCount || returnedUnresolved.length > 0) {
        routingResolutionViolations.push({
          incidentId,
          reason: "AVAILABLE_ROUTER_HAS_UNRESOLVED_ELIGIBLE_FACILITIES",
          returnedUnresolvedFacilityIds: returnedUnresolved.map(({ facility }) => facility?.id ?? null),
        });
      }
    }
    if (
      !routingSource ||
      routingSource.state !== routing?.state ||
      routingSource.eligibleCandidateCount !== routing?.eligibleCandidateCount ||
      routingSource.resolvedCandidateCount !== routing?.resolvedCandidateCount
    ) {
      routingResolutionViolations.push({
        incidentId,
        reason: "ROAD_ROUTING_SOURCE_COVERAGE_MISMATCH",
      });
    }
    summaries.push({
      incidentId,
      truthState: projection.incident?.truthState ?? null,
      eligibleFacilities: eligibleCandidateCount,
      returnedFacilities: facilities.length,
      routedFacilities: stateCounts.ROUTED ?? 0,
      unreachableFacilities: stateCounts.UNREACHABLE ?? 0,
      unresolvedFacilities: eligibleCandidateCount - resolvedCandidateCount,
      routingState: routing?.state ?? "MISSING",
    });
  }

  return {
    retrievalCoverageViolations,
    routingResolutionViolations,
    summaries,
  };
}
