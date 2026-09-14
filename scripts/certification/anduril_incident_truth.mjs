import { INCIDENT_TRUTH_AXIS_STATES, INCIDENT_TRUTH_CLASSES, finiteIso, nonempty, rows } from "./anduril_integrity_shared.mjs";

function truthViolation(output, recordIndex, incidentId, code, detail = null) {
  output.push({ recordIndex, incidentId: incidentId ?? null, code, detail });
}

export function governedCanonicalIncidentCount(projection, { projectionHash = null } = {}) {
  const incidents = rows(projection?.incidents),
    inventory = projection?.inventory;
  const incidentCount = Number(projection?.incidentCount),
    total = Number(inventory?.total),
    returned = Number(inventory?.returned);
  const violations = [];
  if (!nonempty(projectionHash)) violations.push({ code: "CANONICAL_COUNT_PROJECTION_HASH_MISSING" });
  if (!Number.isInteger(incidentCount) || incidentCount < 0)
    violations.push({
      code: "CANONICAL_COUNT_INCIDENT_COUNT_INVALID",
      actual: projection?.incidentCount ?? null,
    });
  if (!Number.isInteger(total) || total < 0)
    violations.push({
      code: "CANONICAL_COUNT_INVENTORY_TOTAL_INVALID",
      actual: inventory?.total ?? null,
    });
  if (!Number.isInteger(returned) || returned < 0)
    violations.push({
      code: "CANONICAL_COUNT_INVENTORY_RETURNED_INVALID",
      actual: inventory?.returned ?? null,
    });
  if (Number.isInteger(incidentCount) && Number.isInteger(total) && incidentCount !== total)
    violations.push({
      code: "CANONICAL_COUNT_CONTRACT_MISMATCH",
      incidentCount,
      total,
    });
  if (Number.isInteger(returned) && returned !== incidents.length)
    violations.push({
      code: "CANONICAL_COUNT_RETURNED_MISMATCH",
      returned,
      actual: incidents.length,
    });
  if (inventory?.truncated !== false)
    violations.push({
      code: "CANONICAL_COUNT_PROJECTION_TRUNCATED",
      actual: inventory?.truncated ?? null,
    });
  if (Number.isInteger(total) && total !== incidents.length)
    violations.push({
      code: "CANONICAL_COUNT_ROWS_MISMATCH",
      expected: total,
      actual: incidents.length,
    });
  return {
    schemaVersion: "vigia.governed-canonical-incident-count.v1",
    state: violations.length ? "FAIL" : "PASS",
    source: "GET /api/v10/operator/incidents data.canonicalIncidents.value.inventory.total",
    projectionHash,
    expectedCount: violations.length ? null : total,
    incidentCount: Number.isInteger(incidentCount) ? incidentCount : null,
    inventory: {
      total: Number.isInteger(total) ? total : null,
      returned: Number.isInteger(returned) ? returned : null,
      truncated: inventory?.truncated ?? null,
    },
    observedRows: incidents.length,
    violations,
  };
}

export function sweepCanonicalIncidentTruth(records, { expectedCount = null } = {}) {
  const incidents = rows(records);
  const violations = [];
  const identities = new Set();
  const priorityRanks = new Set();
  const counts = Object.fromEntries(INCIDENT_TRUTH_CLASSES.map((classification) => [classification, 0]));
  incidents.forEach((record, recordIndex) => {
    const incidentId = record?.incident?.id;
    const truth = record?.operationalTruth;
    const classification = truth?.classification;
    const axes = truth?.axes ?? {};
    if (!nonempty(incidentId)) truthViolation(violations, recordIndex, incidentId, "INCIDENT_ID_MISSING");
    else if (identities.has(incidentId)) truthViolation(violations, recordIndex, incidentId, "INCIDENT_ID_DUPLICATE");
    else identities.add(incidentId);
    if (!truth || typeof truth !== "object") {
      truthViolation(violations, recordIndex, incidentId, "OPERATIONAL_TRUTH_MISSING");
      return;
    }
    if (nonempty(truth.schemaVersion) && truth.schemaVersion !== "vigia.operational-incident-truth.v1")
      truthViolation(violations, recordIndex, incidentId, "OPERATIONAL_TRUTH_SCHEMA_INVALID", truth.schemaVersion);
    if (truth.incidentId !== incidentId) truthViolation(violations, recordIndex, incidentId, "TRUTH_INCIDENT_ID_MISMATCH", truth.incidentId);
    if (!INCIDENT_TRUTH_CLASSES.includes(classification)) truthViolation(violations, recordIndex, incidentId, "CLASSIFICATION_INVALID", classification);
    else counts[classification] += 1;
    if (typeof truth.countsAsActive !== "boolean") truthViolation(violations, recordIndex, incidentId, "COUNTS_AS_ACTIVE_NOT_BOOLEAN", truth.countsAsActive);
    if (truth.countsAsActive !== (classification === "VERIFIED_CURRENT"))
      truthViolation(violations, recordIndex, incidentId, "ACTIVE_CLASSIFICATION_CONTRADICTION", { classification, countsAsActive: truth.countsAsActive });
    for (const axis of ["sourceAvailability", "incidentCoverage", "freshness", "verification", "scientificAdmission", "lifecycle"]) {
      if (!nonempty(axes?.[axis]?.state)) truthViolation(violations, recordIndex, incidentId, "TRUTH_AXIS_STATE_MISSING", axis);
    }
    for (const [axis, allowedStates] of Object.entries(INCIDENT_TRUTH_AXIS_STATES)) {
      const state = axes?.[axis]?.state;
      if (nonempty(state) && !allowedStates.includes(state))
        truthViolation(violations, recordIndex, incidentId, "TRUTH_AXIS_STATE_INVALID", { axis, state, allowedStates });
    }
    const freshness = axes?.freshness?.state;
    const verification = axes?.verification?.state;
    const source = axes?.sourceAvailability?.state;
    const coverage = axes?.incidentCoverage?.state;
    const lifecycle = axes?.lifecycle?.state;
    const closed = ["CLOSED", "RESOLVED", "CONTAINED", "EXTINGUISHED"].includes(String(lifecycle ?? "").toUpperCase());
    const current = freshness === "CURRENT";
    const governedLocation = ["GEOLOCATED", "AREA_GEOMETRY"].includes(coverage);
    const expectedClassification = closed
      ? "HISTORICAL_CLOSED"
      : current && verification === "VERIFIED" && source === "RETAINED" && governedLocation
        ? "VERIFIED_CURRENT"
        : current
          ? "DETECTION_CANDIDATE"
          : "NEEDS_REVALIDATION";
    if (classification !== expectedClassification)
      truthViolation(violations, recordIndex, incidentId, "CLASSIFICATION_INPUT_CONTRADICTION", {
        classification,
        expectedClassification,
        source,
        coverage,
        freshness,
        verification,
        lifecycle,
      });
    const sourceEvidenceFactor = rows(truth?.priority?.factors).find((item) => item?.code === "SOURCE_EVIDENCE");
    const evidenceRecords = Number(
      axes?.sourceAvailability && Object.hasOwn(axes.sourceAvailability, "evidenceRecords")
        ? axes.sourceAvailability.evidenceRecords
        : sourceEvidenceFactor?.value,
    );
    if (source === "RETAINED" && (!Number.isInteger(evidenceRecords) || evidenceRecords < 1))
      truthViolation(violations, recordIndex, incidentId, "RETAINED_SOURCE_EVIDENCE_COUNT_INVALID", axes?.sourceAvailability?.evidenceRecords ?? null);
    if (source === "NOT_OBSERVED" && evidenceRecords !== 0)
      truthViolation(violations, recordIndex, incidentId, "UNOBSERVED_SOURCE_EVIDENCE_COUNT_INVALID", axes?.sourceAvailability?.evidenceRecords ?? null);
    const coordinate =
      axes?.incidentCoverage && Object.hasOwn(axes.incidentCoverage, "coordinate") ? axes.incidentCoverage.coordinate : record?.incident?.coordinate;
    if (coverage === "GEOLOCATED" && !(Array.isArray(coordinate) && coordinate.length === 2 && coordinate.every(Number.isFinite)))
      truthViolation(violations, recordIndex, incidentId, "GEOLOCATED_COORDINATE_INVALID", coordinate ?? null);
    if (["CURRENT", "STALE"].includes(freshness) && !finiteIso(truth.lastObservedAt))
      truthViolation(violations, recordIndex, incidentId, "OBSERVED_FRESHNESS_TIME_INVALID", truth.lastObservedAt ?? null);
    if (freshness === "NOT_OBSERVED" && truth.lastObservedAt !== null)
      truthViolation(violations, recordIndex, incidentId, "UNOBSERVED_FRESHNESS_HAS_TIMESTAMP", truth.lastObservedAt);
    if (classification === "VERIFIED_CURRENT") {
      if (freshness !== "CURRENT") truthViolation(violations, recordIndex, incidentId, "VERIFIED_CURRENT_NOT_CURRENT", freshness);
      if (verification !== "VERIFIED") truthViolation(violations, recordIndex, incidentId, "VERIFIED_CURRENT_NOT_VERIFIED", verification);
      if (source !== "RETAINED") truthViolation(violations, recordIndex, incidentId, "VERIFIED_CURRENT_SOURCE_NOT_RETAINED", source);
      if (!["GEOLOCATED", "AREA_GEOMETRY"].includes(coverage))
        truthViolation(violations, recordIndex, incidentId, "VERIFIED_CURRENT_LOCATION_NOT_GOVERNED", coverage);
      if (closed) truthViolation(violations, recordIndex, incidentId, "VERIFIED_CURRENT_LIFECYCLE_CLOSED", lifecycle);
      if (!finiteIso(truth.lastObservedAt))
        truthViolation(violations, recordIndex, incidentId, "VERIFIED_CURRENT_OBSERVATION_TIME_INVALID", truth.lastObservedAt);
    }
    if (classification === "DETECTION_CANDIDATE") {
      if (freshness !== "CURRENT") truthViolation(violations, recordIndex, incidentId, "DETECTION_CANDIDATE_NOT_CURRENT", freshness);
      if (closed) truthViolation(violations, recordIndex, incidentId, "DETECTION_CANDIDATE_LIFECYCLE_CLOSED", lifecycle);
    }
    if (classification === "NEEDS_REVALIDATION" && freshness === "CURRENT")
      truthViolation(violations, recordIndex, incidentId, "NEEDS_REVALIDATION_MARKED_CURRENT");
    if (classification === "HISTORICAL_CLOSED" && !closed) truthViolation(violations, recordIndex, incidentId, "HISTORICAL_CLOSED_LIFECYCLE_OPEN", lifecycle);
    const priority = truth.priority;
    if (!priority || typeof priority !== "object") truthViolation(violations, recordIndex, incidentId, "PRIORITY_MISSING");
    else {
      if (!Number.isFinite(Number(priority.score))) truthViolation(violations, recordIndex, incidentId, "PRIORITY_SCORE_INVALID", priority.score);
      else if (Number(priority.score) < 0 || Number(priority.score) > 100)
        truthViolation(violations, recordIndex, incidentId, "PRIORITY_SCORE_OUT_OF_RANGE", priority.score);
      if (!Number.isInteger(Number(priority.rank)) || Number(priority.rank) < 1)
        truthViolation(violations, recordIndex, incidentId, "PRIORITY_RANK_INVALID", priority.rank);
      else if (priorityRanks.has(Number(priority.rank))) truthViolation(violations, recordIndex, incidentId, "PRIORITY_RANK_DUPLICATE", Number(priority.rank));
      else priorityRanks.add(Number(priority.rank));
      if (!nonempty(priority.whyRankedAboveNext)) truthViolation(violations, recordIndex, incidentId, "PRIORITY_RANK_EXPLANATION_MISSING");
      if (!rows(priority.factors).length) truthViolation(violations, recordIndex, incidentId, "PRIORITY_FACTORS_MISSING");
      if (!nonempty(priority.revision)) truthViolation(violations, recordIndex, incidentId, "PRIORITY_REVISION_MISSING");
      if (!nonempty(priority.algorithmVersion)) truthViolation(violations, recordIndex, incidentId, "PRIORITY_ALGORITHM_VERSION_MISSING");
      else if (priority.algorithmVersion !== "vigia.operational-priority.v4")
        truthViolation(violations, recordIndex, incidentId, "PRIORITY_ALGORITHM_VERSION_INVALID", priority.algorithmVersion);
    }
  });
  if (!Number.isInteger(expectedCount) || expectedCount < 0) truthViolation(violations, null, null, "CANONICAL_EXPECTED_RECORD_COUNT_INVALID", expectedCount);
  else if (incidents.length !== expectedCount)
    truthViolation(violations, null, null, "CANONICAL_RECORD_COUNT_MISMATCH", {
      expected: expectedCount,
      actual: incidents.length,
    });
  const missingPriorityRanks = Array.from({ length: incidents.length }, (_, index) => index + 1).filter((rank) => !priorityRanks.has(rank));
  if (missingPriorityRanks.length) truthViolation(violations, null, null, "PRIORITY_RANK_SET_INCOMPLETE", missingPriorityRanks);
  return {
    schemaVersion: "vigia.anduril-canonical-truth-sweep.v1",
    state: violations.length ? "FAIL" : "PASS",
    expectedRecords: expectedCount,
    checkedRecords: incidents.length,
    uniqueIncidentIds: identities.size,
    counts,
    violationCount: violations.length,
    violations,
  };
}
