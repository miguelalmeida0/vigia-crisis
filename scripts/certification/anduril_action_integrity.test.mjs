import assert from "node:assert/strict";
import test from "node:test";
import { validateBrowserAcceptanceDocument, validateConsequentialActionEvidence } from "./anduril_integrity.mjs";
import {
  browserAcceptance,
  browserRequired,
  consequentialActionEvidence,
  controlledActionKinds,
  distribution,
  identity,
} from "./anduril_browser_integrity.fixtures.mjs";
import { ACTION_HANDLER_SOURCE_PATHS } from "./anduril_action_handler_contract.mjs";

test("consequential action evidence requires one receipt-backed canonical transition for every enabled visible action", () => {
  const valid = validateConsequentialActionEvidence(consequentialActionEvidence());
  assert.equal(valid.state, "PASS");
  assert.equal(valid.visibleEnabledCount, controlledActionKinds.length);
  assert.equal(valid.executionCount, controlledActionKinds.length);
  assert.equal(
    validateConsequentialActionEvidence(consequentialActionEvidence(), {
      handlerSourceSha256: `sha256:${"a".repeat(64)}`,
    }).state,
    "PASS",
  );

  const expectedHandlerSources = consequentialActionEvidence().handlerInventory.sources;
  assert.equal(
    validateConsequentialActionEvidence(consequentialActionEvidence(), {
      handlerSources: expectedHandlerSources,
    }).state,
    "PASS",
  );

  const movedHandler = consequentialActionEvidence();
  movedHandler.handlerInventory.sources[1].path = "apps/operator-console/src/movedController.js";
  assert.ok(validateConsequentialActionEvidence(movedHandler).violations.some((item) => item.code === "ACTION_EVIDENCE_HANDLER_INVENTORY_INVALID"));

  const unboundHandlerSource = consequentialActionEvidence();
  unboundHandlerSource.handlerInventory.sources.pop();
  assert.ok(
    validateConsequentialActionEvidence(unboundHandlerSource, {
      handlerSources: expectedHandlerSources,
    }).violations.some((item) => item.code === "ACTION_EVIDENCE_HANDLER_SOURCES_MISMATCH"),
  );

  assert.deepEqual(
    consequentialActionEvidence().handlerInventory.sources.map((item) => item.path),
    ACTION_HANDLER_SOURCE_PATHS,
  );

  const staleHandlerSource = consequentialActionEvidence();
  assert.ok(
    validateConsequentialActionEvidence(staleHandlerSource, {
      handlerSourceSha256: `sha256:${"b".repeat(64)}`,
    }).violations.some((item) => item.code === "ACTION_EVIDENCE_HANDLER_SOURCE_MISMATCH"),
  );

  const missing = consequentialActionEvidence();
  missing.executions = [];
  assert.ok(validateConsequentialActionEvidence(missing).violations.some((item) => item.code === "ACTION_EVIDENCE_EXECUTION_MISSING"));

  const stale = consequentialActionEvidence();
  stale.executions[0].canonical.afterRevision = stale.executions[0].canonical.beforeRevision;
  assert.ok(validateConsequentialActionEvidence(stale).violations.some((item) => item.code === "ACTION_EVIDENCE_CANONICAL_REFRESH_INVALID"));

  const noAfterState = consequentialActionEvidence();
  noAfterState.executions[0].canonical.afterState = null;
  assert.ok(validateConsequentialActionEvidence(noAfterState).violations.some((item) => item.code === "ACTION_EVIDENCE_CANONICAL_AFTER_STATE_INVALID"));

  const responseReviewTruthEffectChanged = consequentialActionEvidence();
  const responseReview = responseReviewTruthEffectChanged.executions.find((item) => item.uiAction.startsWith("response-recommendation-review:"));
  responseReview.canonical.afterState.truthEffect = "OPERATIONAL_TRUTH_CHANGED";
  assert.ok(
    validateConsequentialActionEvidence(responseReviewTruthEffectChanged).violations.some(
      (item) => item.code === "ACTION_EVIDENCE_CANONICAL_AFTER_STATE_INVALID",
    ),
  );

  const responseReviewBindingChanged = consequentialActionEvidence();
  const misboundResponseReview = responseReviewBindingChanged.executions.find((item) => item.uiAction.startsWith("response-recommendation-review:"));
  misboundResponseReview.receipt.recommendationHash = "sha256:different-recommendation";
  assert.ok(
    validateConsequentialActionEvidence(responseReviewBindingChanged).violations.some(
      (item) => item.code === "ACTION_EVIDENCE_CANONICAL_AFTER_STATE_INVALID",
    ),
  );

  const safetyBound = consequentialActionEvidence();
  const liveAction = {
    route: "operations",
    action: "protection-approve:preexisting-live-work",
    workflowId: "protect:preexisting-live-work",
    enabled: true,
    knownHandler: true,
    observedInControlledExercise: false,
    surfaces: ["operations:canonical-route"],
  };
  safetyBound.visibleActionInventory.push(liveAction);
  safetyBound.handlerInventory.visibleActionCount += 1;
  safetyBound.handlerInventory.knownHandlerCount += 1;
  safetyBound.visibleConsequentialActions.push({
    ...liveAction,
    disposition: "FAIL_CLOSED_SAFETY_BOUNDARY",
    safetyBoundary: {
      state: "ENFORCED",
      targetScope: "PREEXISTING_CANONICAL_RUNTIME_OUTSIDE_RUN_BOUND_EXERCISE",
      reason: "The certification driver refuses to mutate pre-existing live work.",
      mutationAttempted: false,
      externalEffectAttempted: false,
      evidenceSurfaces: liveAction.surfaces,
    },
  });
  const safetyResult = validateConsequentialActionEvidence(safetyBound);
  assert.equal(safetyResult.state, "FAIL");
  assert.ok(safetyResult.violations.some((item) => item.code === "ACTION_EVIDENCE_ENABLED_ACTION_NOT_EXECUTED"));

  const disabledWithReason = consequentialActionEvidence();
  disabledWithReason.visibleActionInventory.push({
    route: "operations",
    action: "protection-approve:unavailable",
    enabled: false,
    knownHandler: true,
    disabledReasons: ["No authorized protection workflow is selected."],
  });
  disabledWithReason.handlerInventory.visibleActionCount += 1;
  disabledWithReason.handlerInventory.knownHandlerCount += 1;
  assert.equal(validateConsequentialActionEvidence(disabledWithReason).state, "PASS");

  const disabledWithoutReason = structuredClone(disabledWithReason);
  disabledWithoutReason.visibleActionInventory.at(-1).disabledReasons = [];
  assert.ok(
    validateConsequentialActionEvidence(disabledWithoutReason).violations.some((item) => item.code === "ACTION_EVIDENCE_DISABLED_ACTION_REASON_MISSING"),
  );

  const silentlyExcluded = structuredClone(safetyBound);
  silentlyExcluded.visibleConsequentialActions.pop();
  assert.ok(
    validateConsequentialActionEvidence(silentlyExcluded).violations.some((item) => item.code === "ACTION_EVIDENCE_CONSEQUENTIAL_ACTION_SILENTLY_EXCLUDED"),
  );

  const missingDisposition = structuredClone(safetyBound);
  delete missingDisposition.visibleConsequentialActions.at(-1).disposition;
  assert.ok(validateConsequentialActionEvidence(missingDisposition).violations.some((item) => item.code === "ACTION_EVIDENCE_ENABLED_ACTION_NOT_EXECUTED"));

  const noReceipt = consequentialActionEvidence();
  noReceipt.executions[0].receipt = null;
  assert.ok(validateConsequentialActionEvidence(noReceipt).violations.some((item) => item.code === "ACTION_EVIDENCE_RECEIPT_INVALID"));

  const unknown = consequentialActionEvidence();
  unknown.unknownActions = ["unknown-action"];
  assert.ok(validateConsequentialActionEvidence(unknown).violations.some((item) => item.code === "ACTION_EVIDENCE_UNKNOWN_ACTIONS"));

  const reusedReceipt = consequentialActionEvidence();
  reusedReceipt.visibleConsequentialActions.push({
    route: "operations",
    action: "period-start",
    workflowId: "period-start",
    enabled: true,
    knownHandler: true,
    observedInControlledExercise: true,
  });
  reusedReceipt.executions.push({
    ...structuredClone(reusedReceipt.executions[0]),
    uiAction: "period-start",
    action: "START_PERIOD",
  });
  assert.ok(validateConsequentialActionEvidence(reusedReceipt).violations.some((item) => item.code === "ACTION_EVIDENCE_RECEIPT_REUSED"));

  const invalidWindow = consequentialActionEvidence();
  invalidWindow.completedAt = "2026-09-04T12:02:00.000Z";
  assert.ok(validateConsequentialActionEvidence(invalidWindow).violations.some((item) => item.code === "ACTION_EVIDENCE_CAPTURE_WINDOW_INVALID"));

  const receiptOutsideExecution = consequentialActionEvidence();
  receiptOutsideExecution.executions[0].receipt.at = "2026-09-04T12:03:59.000Z";
  assert.ok(validateConsequentialActionEvidence(receiptOutsideExecution).violations.some((item) => item.code === "ACTION_EVIDENCE_RECEIPT_INVALID"));

  const liveTransportLeak = consequentialActionEvidence();
  const exerciseSend = liveTransportLeak.executions.find((item) => item.uiAction.startsWith("protection-exercise-send:"));
  exerciseSend.receipt.externalTransportInvoked = true;
  assert.ok(
    validateConsequentialActionEvidence(liveTransportLeak).violations.some((item) => item.code === "ACTION_EVIDENCE_EXERCISE_TRANSPORT_RECEIPT_INVALID"),
  );

  const unsafeExercise = consequentialActionEvidence();
  unsafeExercise.controlledExercise.externalSendAttempted = true;
  assert.ok(validateConsequentialActionEvidence(unsafeExercise).violations.some((item) => item.code === "ACTION_EVIDENCE_CONTROLLED_EXERCISE_INVALID"));

  const missingLifecycle = consequentialActionEvidence();
  missingLifecycle.controlledExercise.steps = missingLifecycle.controlledExercise.steps.filter((item) => !item.action.startsWith("protection-exercise-ack:"));
  assert.ok(
    validateConsequentialActionEvidence(missingLifecycle).violations.some((item) => item.code === "ACTION_EVIDENCE_CONTROLLED_EXERCISE_COVERAGE_MISSING"),
  );

  const unboundExerciseReceipt = consequentialActionEvidence();
  unboundExerciseReceipt.controlledExercise.steps[0].execution.receipt.receiptId = "receipt:not-in-runtime-telemetry";
  assert.ok(
    validateConsequentialActionEvidence(unboundExerciseReceipt).violations.some((item) => item.code === "ACTION_EVIDENCE_CONTROLLED_EXERCISE_RECEIPT_UNBOUND"),
  );

  const outsideControlledExercise = consequentialActionEvidence();
  outsideControlledExercise.visibleConsequentialActions[0].observedInControlledExercise = false;
  assert.ok(
    validateConsequentialActionEvidence(outsideControlledExercise).violations.some(
      (item) => item.code === "ACTION_EVIDENCE_EXECUTED_ACTION_OUTSIDE_CONTROLLED_EXERCISE",
    ),
  );
});
