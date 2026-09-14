export const IDENTITY_FIELDS = Object.freeze(["releaseId", "codeStateHash", "operationalDataHash", "releaseStatementHash"]);

export const ANDURIL_BROWSER_SCHEMA = "vigia.anduril-class-browser-acceptance.v1";
export const GOLDEN_SCENARIO_RECEIPT_SCHEMA = "vigia.golden-scenario-transition-receipt.v1";
export const GOLDEN_SCENARIO_DIAGNOSTIC_PREFIX = "VIGIA_GOLDEN_SCENARIO_RECEIPT:";
export const CONSEQUENTIAL_ACTION_EVIDENCE_SCHEMA = "vigia.consequential-action-browser-evidence.v1";
export const CONTROLLED_ACTION_EXERCISE_SCHEMA = "vigia.controlled-eoc-browser-action-exercise.v1";
export const CONTROLLED_ACTION_EXERCISE_REQUIRED_KINDS = Object.freeze([
  "period-start",
  "period-assign-owner",
  "period-create-objective",
  "period-ack-objective",
  "period-record-tactic",
  "period-record-assignment",
  "period-record-resource",
  "period-record-authority",
  "period-link-protection",
  "period-record-action",
  "period-ack-item",
  "period-update-assignment",
  "period-update-action",
  "period-record-postcondition",
  "period-record-outcome",
  "period-record-lesson",
  "period-begin-handoff",
  "period-close",
  "protection-create",
  "protection-review",
  "protection-approve",
  "protection-reject",
  "protection-eligible",
  "protection-exercise-send",
  "protection-exercise-ack",
  "protection-exercise-update",
  "protection-supersede",
  "protection-exercise-cancel",
  "protection-expire",
  "command-intent-create",
  "response-recommendation-review",
  "planning-proposal-review",
  "planning-approved-apply",
]);
export const EXERCISE_TRANSPORT_ACTION_KINDS = Object.freeze([
  "protection-exercise-send",
  "protection-exercise-ack",
  "protection-exercise-update",
  "protection-supersede",
  "protection-exercise-cancel",
  "protection-expire",
]);
export const P0_OPERATOR_CAPABILITIES = Object.freeze([
  "crisisAutopilot",
  "valueOfInformation",
  "livingIncidentTwin",
  "decisionCompression",
  "regretRadar",
  "decisionHalfLife",
  "uncertaintyBudget",
  "sentinel",
  "fieldNetLite",
  "trustedObserver",
  "twoWayTasking",
  "dynamicExposureGraph",
  "crisisDependencyGraph",
  "modelDisagreement",
  "realityReconciliation",
  "commandByIntent",
  "operationalPeriodGenerator",
  "responseCapability",
  "resourceOptimizerOutput",
  "autonomousReplanning",
  "evacuationCorridor",
  "protectionTimeline",
  "capLifecycle",
  "multilingualComposer",
  "actionOutcomeLedger",
  "nearMiss",
  "prevention",
]);
const CONSEQUENTIAL_ACTION_PREFIXES = Object.freeze(["human-attention-", "period-", "protection-"]);
const CONSEQUENTIAL_ACTION_EXACT = Object.freeze([
  "command-context-initialize",
  "command-intent-create",
  "response-recommendation-review",
  "planning-proposal-review",
  "planning-approved-apply",
]);
export const actionKind = (value) => String(value ?? "").split(":", 1)[0];
export const consequentialAction = (value) => {
  const kind = actionKind(value);
  return (
    kind !== "protection-cap-draft" &&
    !kind.endsWith("-submit") &&
    (CONSEQUENTIAL_ACTION_EXACT.includes(kind) || CONSEQUENTIAL_ACTION_PREFIXES.some((prefix) => kind.startsWith(prefix)))
  );
};
export const GOLDEN_SCENARIO_CONTRACTS = Object.freeze({
  GOLDEN_1: Object.freeze({
    testName: /^golden 1:/i,
    minimumTransitions: 2,
    requiredClaims: Object.freeze(["COLLECTION_TASK_LINKED", "DECISION_REVISION_RECORDED", "AUTO_VERIFICATION_FALSE"]),
  }),
  GOLDEN_2: Object.freeze({
    testName: /^golden 2:/i,
    minimumTransitions: 3,
    requiredClaims: Object.freeze(["OFFLINE_CAPTURE_RETAINED", "TASK_ACKNOWLEDGEMENT_RECEIPT", "ADMISSION_PENDING", "REEVALUATION_TRIGGERED"]),
  }),
  GOLDEN_3: Object.freeze({
    testName: /^golden 3:/i,
    minimumTransitions: 2,
    requiredClaims: Object.freeze(["ROUTE_ORDER_CHANGED", "REPLAN_PROPOSED", "CONSEQUENTIAL_EXECUTION_FALSE"]),
  }),
  GOLDEN_4: Object.freeze({
    testName: /^golden 4:/i,
    minimumTransitions: 6,
    requiredClaims: Object.freeze([
      "CAP_DRAFT_VALIDATED",
      "EXERCISE_SEND_RECEIPT",
      "EXERCISE_ACKNOWLEDGEMENT_RECEIPT",
      "TRANSITION_RECEIPTS_PERSISTED",
      "LIVE_DISPATCH_REJECTED",
    ]),
  }),
  GOLDEN_5: Object.freeze({
    testName: /^golden 5:/i,
    minimumTransitions: 8,
    requiredClaims: Object.freeze([
      "ACTION_ACKNOWLEDGED",
      "POSTCONDITION_OBSERVED",
      "PARTIAL_OUTCOME_PERSISTED",
      "LESSON_PERSISTED",
      "PRODUCTION_OUTCOME_FALSE",
    ]),
  }),
  GOLDEN_6: Object.freeze({
    testName: /^golden 6:/i,
    minimumTransitions: 2,
    requiredClaims: Object.freeze(["PROVIDER_SILENCE_DETECTED", "ALTERNATIVE_SOURCE_TASK_PRESENT", "MATERIAL_HUMAN_ATTENTION_PRESENT"]),
  }),
  GOLDEN_7: Object.freeze({
    testName: /^golden 7:/i,
    minimumTransitions: 2,
    requiredClaims: Object.freeze(["SOURCE_CONFLICT_PRESERVED", "TARGETED_COLLECTION_PRESENT", "FAKE_CONSENSUS_FALSE"]),
  }),
  GOLDEN_PLANNING: Object.freeze({
    testName: /^golden planning:/i,
    minimumTransitions: 2,
    requiredClaims: Object.freeze(["COMMAND_INTENT_CONFIRMATION_REQUIRED", "AUTHORITY_REVIEW_REQUIRED", "DISPATCH_FALSE", "AUTOMATIC_MUTATION_FALSE"]),
  }),
  GOLDEN_RESPONSE_CAPACITY: Object.freeze({
    testName: /^golden response capacity: generated requirement completes the signed fieldnet roundtrip/i,
    service: /^ResponseCapabilityService \+ signed FieldNet task\/ack\/report\/completion \+ central sync\/admission\/review$/,
    minimumTransitions: 9,
    requiredClaims: Object.freeze([
      "CAPACITY_REQUIREMENT_CREATED",
      "SIGNED_FIELDNET_TASK_PERSISTED",
      "FIELDNET_TASK_ACKNOWLEDGED",
      "TYPED_CAPACITY_REPORT_PERSISTED",
      "LOCAL_COMPLETION_RECORDED",
      "CENTRAL_RECONCILIATION_RECORDED",
      "CAPACITY_ADMISSION_RECORDED",
      "SAME_REQUIREMENT_CLOSED",
      "OPTIMIZER_RECALCULATED",
      "REVIEW_RECEIPT_PERSISTED",
    ]),
  }),
});
export const INCIDENT_TRUTH_CLASSES = Object.freeze(["VERIFIED_CURRENT", "DETECTION_CANDIDATE", "NEEDS_REVALIDATION", "HISTORICAL_CLOSED"]);
export const INCIDENT_TRUTH_AXIS_STATES = Object.freeze({
  sourceAvailability: Object.freeze(["RETAINED", "NOT_OBSERVED"]),
  incidentCoverage: Object.freeze(["GEOLOCATED", "AREA_GEOMETRY", "NOT_GEOLOCATED"]),
  freshness: Object.freeze(["CURRENT", "STALE", "NOT_OBSERVED"]),
  verification: Object.freeze(["VERIFIED", "NOT_VERIFIED"]),
  scientificAdmission: Object.freeze(["OBSERVED_GEOMETRY_AVAILABLE", "OBSERVED_GEOMETRY_NOT_AVAILABLE"]),
});
export const REPRODUCIBILITY_LABELS = Object.freeze(["BUILD_R", "CERTIFY_R", "REBUILD_MANIFEST", "COLD_START_1", "COLD_START_2"]);
export const REPRODUCIBILITY_STABLE_ARTIFACT_PATHS = Object.freeze([
  ".artifacts/anduril-class-crisis-os/certification.json",
  "docs/handoffs/VIGIA_ANDURIL_CLASS_CRISIS_OS_MEGA_PATCH_REPORT.md",
  ".artifacts/anduril-class-crisis-os/browser/evidence-index.json",
  ".artifacts/anduril-class-crisis-os/performance/api-useful-content.json",
]);
export const FINAL_ARTIFACT_SEAL_SCHEMA = "vigia.anduril-final-artifact-seal.v1";
export const FINAL_ARTIFACT_SEAL_REQUIRED_PATHS = Object.freeze([
  "data/validation/release/current-release-manifest.json",
  "data/validation/release/release-source-manifest.json",
  "data/validation/release/release-statement.json",
  ".artifacts/anduril-class-crisis-os/certification.json",
  ".artifacts/anduril-class-crisis-os/release/reproducibility-ledger.json",
  ".artifacts/anduril-class-crisis-os/release/reproducibility-verification.json",
  ".artifacts/anduril-class-crisis-os/release/invariant-report.json",
  ".artifacts/anduril-class-crisis-os/browser/evidence-index.json",
  ".artifacts/anduril-class-crisis-os/performance/api-useful-content.json",
  "docs/handoffs/VIGIA_ANDURIL_CLASS_CRISIS_OS_MEGA_PATCH_REPORT.md",
]);
