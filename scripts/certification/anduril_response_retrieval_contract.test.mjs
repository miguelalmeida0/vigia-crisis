import assert from "node:assert/strict";
import test from "node:test";

import { auditResponseRetrievalContracts } from "./anduril_response_retrieval_contract.mjs";

const kinds = ["HOSPITAL", "FIRE_STATION"];
const facility = (id, state, rank) => ({
  id,
  retrievalRank: rank,
  candidateCohort: {
    straightLineRank: rank,
    routedRank: rank,
    decisionRank: rank,
    denominatorRankedCount: 1,
    operatorCohortRank: 1,
    selectedBecause: "Inside the governed retrieval cohort.",
    eligibility: state === "ROUTED" ? "ELIGIBLE_FOR_PLANNING_RECOMMENDATION" : "INELIGIBLE_FOR_PLANNING_RECOMMENDATION",
    eligibleForPlanningRecommendation: state === "ROUTED",
    exclusions: state === "ROUTED" ? [] : ["PROVIDER_DECLARED_UNREACHABLE"],
    exclusionReasons: state === "ROUTED" ? [] : ["PROVIDER_DECLARED_UNREACHABLE"],
  },
  reachability:
    state === "ROUTED"
      ? {
          state,
          travelTimeMinutes: 12,
          source: { provider: "governed-router" },
          checkedAt: "2026-09-04T12:00:00.000Z",
        }
      : {
          state,
          travelTimeMinutes: null,
          reason: "No traversable provider route was returned.",
          source: { provider: "governed-router" },
          checkedAt: "2026-09-04T12:00:00.000Z",
        },
});

const projection = () => ({
  incident: { id: "incident:test", truthState: "DETECTION_CANDIDATE" },
  facilities: {
    HOSPITAL: [facility("hospital:1", "ROUTED", 1)],
    FIRE_STATION: [facility("fire:1", "UNREACHABLE", 1)],
  },
  retrievalCoverage: {
    byKind: {
      HOSPITAL: { retrievedCount: 1, eligibleCount: 1, rankedCount: 1, returnedCount: 1, truncatedCount: 0, operatorTrimmedCount: 0, cohortPolicy: "EXHAUSTIVE_WITHIN_GOVERNED_MAX_DISTANCE" },
      FIRE_STATION: { retrievedCount: 1, eligibleCount: 1, rankedCount: 1, returnedCount: 1, truncatedCount: 0, operatorTrimmedCount: 0, cohortPolicy: "EXHAUSTIVE_WITHIN_GOVERNED_MAX_DISTANCE" },
    },
  },
  routing: {
    state: "AVAILABLE",
    eligibleCandidateCount: 2,
    resolvedCandidateCount: 2,
    stateCounts: { ROUTED: 1, UNREACHABLE: 1 },
    completionRule: "Every eligible candidate is routed or provider-declared unreachable.",
    source: { provider: "governed-router" },
    checkedAt: "2026-09-04T12:00:00.000Z",
  },
  sourceCoverage: {
    ROAD_ROUTING: {
      state: "AVAILABLE",
      eligibleCandidateCount: 2,
      resolvedCandidateCount: 2,
    },
  },
});

test("response retrieval contract admits explicit denominators, ranks, and resolved routing", () => {
  const result = auditResponseRetrievalContracts([projection()], kinds);
  assert.deepEqual(result.retrievalCoverageViolations, []);
  assert.deepEqual(result.routingResolutionViolations, []);
  assert.equal(result.summaries[0].unresolvedFacilities, 0);
});

test("available routing fails for unranked or unresolved eligible facilities", () => {
  const value = projection();
  delete value.facilities.HOSPITAL[0].retrievalRank;
  value.facilities.FIRE_STATION[0].reachability = {
    state: "DISTANCE_ONLY_FALLBACK",
    travelTimeMinutes: null,
  };
  const result = auditResponseRetrievalContracts([value], kinds);
  assert.ok(result.retrievalCoverageViolations.some((item) => item.reason === "RETRIEVAL_DENOMINATOR_OR_RANK_COUNT_INVALID"));
  assert.ok(result.routingResolutionViolations.some((item) => item.reason === "AVAILABLE_ROUTER_HAS_UNRESOLVED_ELIGIBLE_FACILITIES"));
});

test("provider-declared unreachable requires source, reason, and checked time", () => {
  const value = projection();
  value.routing.state = "DEGRADED";
  value.sourceCoverage.ROAD_ROUTING.state = "DEGRADED";
  delete value.facilities.FIRE_STATION[0].reachability.reason;
  const result = auditResponseRetrievalContracts([value], kinds);
  assert.ok(result.routingResolutionViolations.some((item) => item.reason === "UNREACHABLE_PROVIDER_DECLARATION_INCOMPLETE"));
});

test("hospital and fire retrieval cohorts cannot be silently truncated", () => {
  const value = projection();
  value.retrievalCoverage.byKind.HOSPITAL.retrievedCount = 2;
  value.retrievalCoverage.byKind.HOSPITAL.truncatedCount = 1;
  const result = auditResponseRetrievalContracts([value], kinds);
  assert.ok(result.retrievalCoverageViolations.some((item) => item.reason === "RETRIEVAL_DENOMINATOR_OR_RANK_COUNT_INVALID"));
});

test("an explicit operator trim preserves the exhaustive routed denominator", () => {
  const value = projection();
  value.retrievalCoverage.byKind.HOSPITAL = {
    retrievedCount: 3,
    eligibleCount: 3,
    rankedCount: 3,
    returnedCount: 1,
    truncatedCount: 0,
    operatorTrimmedCount: 2,
    cohortPolicy: "EXHAUSTIVE_WITHIN_GOVERNED_MAX_DISTANCE",
  };
  value.facilities.HOSPITAL[0].candidateCohort.denominatorRankedCount = 3;
  value.routing.eligibleCandidateCount = 4;
  value.routing.resolvedCandidateCount = 4;
  value.routing.stateCounts = { ROUTED: 3, UNREACHABLE: 1 };
  value.sourceCoverage.ROAD_ROUTING.eligibleCandidateCount = 4;
  value.sourceCoverage.ROAD_ROUTING.resolvedCandidateCount = 4;
  const result = auditResponseRetrievalContracts([value], kinds);
  assert.deepEqual(result.retrievalCoverageViolations, []);
  assert.deepEqual(result.routingResolutionViolations, []);
  assert.equal(result.summaries[0].eligibleFacilities, 4);
  assert.equal(result.summaries[0].returnedFacilities, 2);
});
