export const priority = () => ({
  score: 75,
  rank: 1,
  whyRankedAboveNext: "Ranks above the next record using admitted factors.",
  factors: [{ code: "VERIFICATION_STAGE", value: "DETECTION_CANDIDATE" }],
  revision: "sha256:priority",
  algorithmVersion: "vigia.operational-priority.v4",
});

export const incident = (overrides = {}) => ({
  incident: { id: "incident:test" },
  operationalTruth: {
    schemaVersion: "vigia.operational-incident-truth.v1",
    incidentId: "incident:test",
    classification: "DETECTION_CANDIDATE",
    countsAsActive: false,
    lastObservedAt: "2026-09-04T12:00:00.000Z",
    axes: {
      sourceAvailability: { state: "RETAINED", evidenceRecords: 1 },
      incidentCoverage: { state: "GEOLOCATED", coordinate: [-8, 40] },
      freshness: { state: "CURRENT" },
      verification: { state: "NOT_VERIFIED" },
      scientificAdmission: { state: "OBSERVED_GEOMETRY_NOT_AVAILABLE" },
      lifecycle: { state: "OPEN" },
    },
    priority: priority(),
    ...overrides,
  },
});

export const truthNegativeCases = [
  [
    "ACTIVE_CLASSIFICATION_CONTRADICTION",
    (value) => {
      value.operationalTruth.countsAsActive = true;
    },
  ],
  [
    "TRUTH_INCIDENT_ID_MISMATCH",
    (value) => {
      value.operationalTruth.incidentId = "incident:other";
    },
  ],
  [
    "COUNTS_AS_ACTIVE_NOT_BOOLEAN",
    (value) => {
      value.operationalTruth.countsAsActive = "false";
    },
  ],
  [
    "CLASSIFICATION_INVALID",
    (value) => {
      value.operationalTruth.classification = "ACTIVE";
    },
  ],
  [
    "TRUTH_AXIS_STATE_MISSING",
    (value) => {
      delete value.operationalTruth.axes.scientificAdmission;
    },
  ],
  [
    "DETECTION_CANDIDATE_NOT_CURRENT",
    (value) => {
      value.operationalTruth.axes.freshness.state = "STALE";
    },
  ],
  [
    "CLASSIFICATION_INPUT_CONTRADICTION",
    (value) => {
      value.operationalTruth.axes.verification.state = "VERIFIED";
    },
  ],
  [
    "OPERATIONAL_TRUTH_SCHEMA_INVALID",
    (value) => {
      value.operationalTruth.schemaVersion = "legacy";
    },
  ],
  [
    "TRUTH_AXIS_STATE_INVALID",
    (value) => {
      value.operationalTruth.axes.sourceAvailability.state = "AVAILABLE";
    },
  ],
  [
    "RETAINED_SOURCE_EVIDENCE_COUNT_INVALID",
    (value) => {
      value.operationalTruth.axes.sourceAvailability.evidenceRecords = 0;
    },
  ],
  [
    "UNOBSERVED_SOURCE_EVIDENCE_COUNT_INVALID",
    (value) => {
      value.operationalTruth.axes.sourceAvailability.state = "NOT_OBSERVED";
    },
  ],
  [
    "GEOLOCATED_COORDINATE_INVALID",
    (value) => {
      value.operationalTruth.axes.incidentCoverage.coordinate = null;
    },
  ],
  [
    "OBSERVED_FRESHNESS_TIME_INVALID",
    (value) => {
      value.operationalTruth.lastObservedAt = "not-a-time";
    },
  ],
  [
    "UNOBSERVED_FRESHNESS_HAS_TIMESTAMP",
    (value) => {
      value.operationalTruth.axes.freshness.state = "NOT_OBSERVED";
    },
  ],
  [
    "PRIORITY_SCORE_INVALID",
    (value) => {
      value.operationalTruth.priority.score = "not-a-score";
    },
  ],
  [
    "PRIORITY_SCORE_OUT_OF_RANGE",
    (value) => {
      value.operationalTruth.priority.score = 101;
    },
  ],
  [
    "PRIORITY_RANK_INVALID",
    (value) => {
      value.operationalTruth.priority.rank = 0;
    },
  ],
  [
    "PRIORITY_RANK_SET_INCOMPLETE",
    (value) => {
      value.operationalTruth.priority.rank = 2;
    },
  ],
  [
    "PRIORITY_ALGORITHM_VERSION_INVALID",
    (value) => {
      value.operationalTruth.priority.algorithmVersion = "vigia.operational-priority.v3";
    },
  ],
  [
    "PRIORITY_RANK_EXPLANATION_MISSING",
    (value) => {
      value.operationalTruth.priority.whyRankedAboveNext = "";
    },
  ],
  [
    "PRIORITY_FACTORS_MISSING",
    (value) => {
      value.operationalTruth.priority.factors = [];
    },
  ],
  [
    "PRIORITY_REVISION_MISSING",
    (value) => {
      value.operationalTruth.priority.revision = null;
    },
  ],
  [
    "PRIORITY_ALGORITHM_VERSION_MISSING",
    (value) => {
      value.operationalTruth.priority.algorithmVersion = null;
    },
  ],
];
