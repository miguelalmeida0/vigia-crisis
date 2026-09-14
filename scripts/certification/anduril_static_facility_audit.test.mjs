import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { auditGovernedStaticFacilityCoverage } from "./anduril_static_facility_audit.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const incident = (id, coordinate) => ({
  incident: { id, coordinate },
  operationalTruth: { axes: { incidentCoverage: { state: "GEOLOCATED", coordinate } } },
});

test("static response coverage audits the local governed archive without routing providers", async () => {
  const result = await auditGovernedStaticFacilityCoverage({
    root,
    incidentRows: [incident("incident:north", [-8.61, 41.15]), incident("incident:south", [-8.0, 38.7])],
  });
  assert.equal(result.state, "PASS", JSON.stringify(result.violations));
  assert.equal(result.auditMethod, "DIRECT_LOCAL_GOVERNED_ARCHIVE_QUERY_NO_ROUTING_OR_PUBLIC_PROVIDER_CALLS");
  assert.equal(result.incidentCount, 2);
  for (const row of result.summaries)
    for (const kind of ["HOSPITAL", "FIRE_STATION"]) {
      assert.ok(row.byKind[kind].withinDistanceCount > 0);
      assert.ok(row.byKind[kind].returnedCandidateCount > 0);
      assert.equal(row.byKind[kind].provenanceValid, true);
    }
});

test("static response coverage fails closed outside governed archive coverage", async () => {
  const result = await auditGovernedStaticFacilityCoverage({
    root,
    incidentRows: [incident("incident:outside", [0, 0])],
  });
  assert.equal(result.state, "FAIL");
  assert.equal(result.violations.length, 2);
});
