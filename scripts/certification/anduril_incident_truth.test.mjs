import assert from "node:assert/strict";
import test from "node:test";
import { governedCanonicalIncidentCount, sweepCanonicalIncidentTruth } from "./anduril_integrity.mjs";
import { incident, truthNegativeCases } from "./anduril_incident_truth.fixtures.mjs";
test("canonical truth sweep certifies every record rather than a sample", () => {
  const records = Array.from({ length: 211 }, (_, index) => {
    const value = incident();
    value.incident.id = `incident:${index}`;
    value.operationalTruth.incidentId = value.incident.id;
    value.operationalTruth.priority.rank = index + 1;
    return value;
  });
  const result = sweepCanonicalIncidentTruth(records, { expectedCount: 211 });
  assert.equal(result.state, "PASS");
  assert.equal(result.checkedRecords, 211);
  assert.equal(result.uniqueIncidentIds, 211);
});
for (const [expectedCode, mutate] of truthNegativeCases) {
  test(`canonical truth sweep rejects negative fixture ${expectedCode}`, () => {
    const value = incident();
    mutate(value);
    const result = sweepCanonicalIncidentTruth([value], { expectedCount: 1 });
    assert.equal(result.state, "FAIL");
    assert.ok(result.violations.some((item) => item.code === expectedCode));
  });
}

test("canonical truth sweep rejects duplicate incident identity and priority rank fixtures", () => {
  const first = incident();
  const second = incident();
  const result = sweepCanonicalIncidentTruth([first, second], {
    expectedCount: 2,
  });
  assert.equal(result.state, "FAIL");
  assert.ok(result.violations.some((item) => item.code === "INCIDENT_ID_DUPLICATE"));
  assert.ok(result.violations.some((item) => item.code === "PRIORITY_RANK_DUPLICATE"));
});

test("canonical truth sweep rejects an active record without the full verified-current contract", () => {
  const value = incident({
    classification: "VERIFIED_CURRENT",
    countsAsActive: true,
  });
  const result = sweepCanonicalIncidentTruth([value], { expectedCount: 1 });
  assert.equal(result.state, "FAIL");
  assert.ok(result.violations.some((item) => item.code === "VERIFIED_CURRENT_NOT_VERIFIED"));
});

test("canonical truth sweep keeps verification independent when another admission axis prevents promotion", () => {
  const value = incident();
  value.operationalTruth.axes.verification.state = "VERIFIED";
  value.operationalTruth.axes.incidentCoverage = {
    state: "NOT_GEOLOCATED",
    coordinate: null,
  };
  const result = sweepCanonicalIncidentTruth([value], { expectedCount: 1 });
  assert.equal(result.state, "PASS");
});

test("canonical truth sweep rejects stale records labelled current and open records labelled historical", () => {
  const stale = incident({ classification: "NEEDS_REVALIDATION" });
  stale.operationalTruth.axes.freshness.state = "CURRENT";
  const historical = incident({ classification: "HISTORICAL_CLOSED" });
  historical.incident.id = "incident:historical";
  historical.operationalTruth.incidentId = historical.incident.id;
  const result = sweepCanonicalIncidentTruth([stale, historical], {
    expectedCount: 2,
  });
  assert.ok(result.violations.some((item) => item.code === "NEEDS_REVALIDATION_MARKED_CURRENT"));
  assert.ok(result.violations.some((item) => item.code === "HISTORICAL_CLOSED_LIFECYCLE_OPEN"));
});

test("canonical incident count is bound to the complete governed runtime projection", () => {
  const projection = {
    incidentCount: 1,
    incidents: [incident()],
    inventory: { total: 1, returned: 1, truncated: false },
  };
  const governed = governedCanonicalIncidentCount(projection, {
    projectionHash: "sha256:governed-projection",
  });
  assert.equal(governed.state, "PASS");
  assert.equal(governed.expectedCount, 1);
  assert.equal(
    sweepCanonicalIncidentTruth(projection.incidents, {
      expectedCount: governed.expectedCount,
    }).state,
    "PASS",
  );

  const truncated = governedCanonicalIncidentCount(
    { ...projection, inventory: { total: 2, returned: 1, truncated: true } },
    { projectionHash: "sha256:governed-projection" },
  );
  assert.equal(truncated.state, "FAIL");
  assert.equal(truncated.expectedCount, null);
  assert.ok(truncated.violations.some((item) => item.code === "CANONICAL_COUNT_PROJECTION_TRUNCATED"));
  assert.ok(sweepCanonicalIncidentTruth(projection.incidents).violations.some((item) => item.code === "CANONICAL_EXPECTED_RECORD_COUNT_INVALID"));
});
