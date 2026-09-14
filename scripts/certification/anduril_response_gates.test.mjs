import assert from "node:assert/strict";
import test from "node:test";

import { createResponseGates } from "./anduril_response_gates.mjs";

const status = (pass, evidence, details = null) => ({ state: pass ? "PASS" : "FAIL", evidence, details });
const base = () => ({
  status,
  rows: (value) => (Array.isArray(value) ? value : []),
  goldenScenarios: { state: "PASS" },
  selectedIncidentId: "incident:selected",
  selectedResponse: {
    incident: { id: "incident:selected" },
    routing: { state: "AVAILABLE" },
    facilities: { HOSPITAL: [{ id: "hospital:1" }], FIRE_STATION: [{ id: "fire:1" }] },
  },
  selectedResponseCoverageViolations: [],
  requiredResponseIncidentIds: [],
  nearestResponseCoverageViolations: [],
  governedGeolocatedIncidentIds: ["incident:selected", "incident:other"],
  governedStaticFacilityAudit: { state: "PASS", auditMethod: "DIRECT_LOCAL_GOVERNED_ARCHIVE_QUERY_NO_ROUTING_OR_PUBLIC_PROVIDER_CALLS" },
  governedResponseCoverageViolations: [],
  responseFacilityClassViolations: [],
  responseSourceCoverageViolations: [],
  responseRetrievalAudit: { retrievalCoverageViolations: [], routingResolutionViolations: [] },
  responseCoverageSummaries: { selected: [], verifiedCurrent: [], governedGeolocated: [] },
  responseProjections: [{ incident: { id: "incident:selected" } }],
  coverageMapViolations: [],
  routeCoverageSceneViolations: [],
  surgeProjectionViolations: [],
  responseIncidentViolations: [],
  responseEmbedded: [{ value: { incident: { id: "incident:selected" } } }],
  responseFacilityPopulation: [{ incidentId: "incident:selected", facility: { id: "hospital:1" } }],
  staticProvenanceViolations: [],
  routeTruthViolations: [],
  optimizerCapacityCollectionAudit: { state: "PASS" },
  unknownCapacityZeroViolations: [],
  unknownCapacityWithoutPlan: [],
  responseGapViolations: [],
  admittedCapacityProvenanceViolations: [],
  piiLeaks: [],
  totalHeadcountLeaks: [],
});

test("zero VERIFIED_CURRENT is explicit N/A while non-vacuous software proof remains separate", () => {
  const gates = createResponseGates(base());
  assert.equal(gates.verifiedCurrentResponseCoverage.state, "NOT_APPLICABLE");
  assert.equal(gates.verifiedCurrentResponseCoverage.details.cohortState, "NOT_APPLICABLE_ZERO_VERIFIED_CURRENT_COHORT");
  assert.equal(gates.verifiedCurrentResponseCoverage.details.measuredPercentage, null);
  assert.equal(gates.responseSoftwareCapability.state, "PASS");
});

test("software capability cannot pass without a governed denominator and selected routed proof", () => {
  const noDenominator = base();
  noDenominator.governedGeolocatedIncidentIds = [];
  assert.equal(createResponseGates(noDenominator).responseSoftwareCapability.state, "FAIL");

  const noRoute = base();
  noRoute.selectedResponse.routing.state = "DEGRADED";
  assert.equal(createResponseGates(noRoute).responseSoftwareCapability.state, "FAIL");

  const noStaticAudit = base();
  noStaticAudit.governedStaticFacilityAudit.state = "FAIL";
  assert.equal(createResponseGates(noStaticAudit).responseSoftwareCapability.state, "FAIL");

  const noSelection = base();
  noSelection.selectedIncidentId = null;
  noSelection.selectedResponse = null;
  assert.equal(createResponseGates(noSelection).selectedResponseCapability.state, "FAIL");
});

test("a measured VERIFIED_CURRENT cohort fails when any required incident lacks coverage", () => {
  const state = base();
  state.requiredResponseIncidentIds = ["incident:selected", "incident:missing"];
  state.nearestResponseCoverageViolations = ["incident:missing"];
  const gate = createResponseGates(state).verifiedCurrentResponseCoverage;
  assert.equal(gate.state, "FAIL");
  assert.equal(gate.details.cohortState, "MEASURED");
  assert.equal(gate.details.measuredPercentage, 50);
});
