import { ANDURIL_BROWSER_SCHEMA, CONSEQUENTIAL_ACTION_EVIDENCE_SCHEMA, CONTROLLED_ACTION_EXERCISE_SCHEMA } from "./anduril_integrity.mjs";
import { ACTION_HANDLER_CONTRACT, ACTION_HANDLER_SOURCE_PATHS } from "./anduril_action_handler_contract.mjs";
import { responseReviewFixture } from "./anduril_action_integrity_response_fixture.mjs";

export const identity = Object.freeze({
  releaseId: "vigia-intelligence-fabric-test",
  codeStateHash: "sha256:code",
  operationalDataHash: "sha256:data",
  releaseStatementHash: "sha256:statement",
});
export const distribution = (values) => ({
  samples: values.length,
  rawSamplesMs: values,
  p50Ms: values[Math.ceil(values.length * 0.5) - 1],
  p95Ms: values[Math.ceil(values.length * 0.95) - 1],
  maxMs: values.at(-1),
  varianceMs2: Number(
    (values.reduce((sum, value) => sum + (value - values.reduce((total, item) => total + item, 0) / values.length) ** 2, 0) / values.length).toFixed(2),
  ),
  cacheState: "WARM_CANONICAL_BROWSER_SESSION",
  hardwareSoftwarePath: {
    browser: "Test Chrome",
    renderer: "ANGLE (Apple, Metal)",
    renderers: ["ANGLE (Apple, Metal)"],
    rendererClassification: "HARDWARE",
    hardwareAccelerationRequired: true,
    browserMode: "HEADLESS_LOCAL_CHROME",
  },
});
export const controlledActionKinds = Object.freeze([
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
export const uiActionForKind = (kind) =>
  kind === "response-recommendation-review"
    ? `${kind}:${encodeURIComponent("recommendation:test")}`
    : kind.startsWith("planning-")
      ? `${kind}:OPERATIONAL_PERIOD`
      : kind.startsWith("protection-") && kind !== "protection-create"
        ? `${kind}:protect:test`
        : kind;
export const actionExecution = (kind, index) => {
  const uiAction = uiActionForKind(kind),
    receiptId = `receipt:test-action-${index}`;
  const responseReview = kind === "response-recommendation-review";
  const responseFixture = responseReview ? responseReviewFixture(receiptId) : null;
  const exerciseTransport = [
    "protection-exercise-send",
    "protection-exercise-ack",
    "protection-exercise-update",
    "protection-supersede",
    "protection-exercise-cancel",
    "protection-expire",
  ].includes(kind);
  const workflowId = responseFixture?.workflowId ?? (uiAction.startsWith("protection-") ? "protect:test" : uiAction);
  const afterState = responseReview
    ? responseFixture.afterState
    : kind.startsWith("protection-")
    ? {
        scope: "PROTECTION_WORKFLOW",
        selectedIncidentId: "incident:test",
        incidentId: "incident:test",
        workflowId,
        state: kind === "protection-expire" ? "EXPIRED" : "ACKNOWLEDGED",
        universe: "EXERCISE",
        productionTruth: false,
        ...(kind === "protection-expire"
          ? {}
          : {
              delivery: {
                receiptId: `delivery:${index}`,
                deliveryMode: "ISOLATED_EXERCISE_REPOSITORY",
                externalTransportInvoked: false,
                targetId: "exercise-inbox:test",
              },
            }),
      }
    : kind.startsWith("period-")
      ? {
          scope: "OPERATIONAL_PERIOD",
          selectedIncidentId: "incident:test",
          incidentId: "incident:test",
          periodId: "period:test",
          state: kind === "period-close" ? "CLOSED" : "ACTIVE",
          universe: "CONTROLLED_EOC_EXERCISE",
          counts: { objectives: 1, actions: 1, outcomes: 1 },
        }
      : {
          scope: "INCIDENT_COMMAND",
          selectedIncidentId: "incident:test",
          incidentId: "incident:test",
          version: index + 1,
          lastEventId: `event:test:${index}`,
        };
  return {
    route: "operations",
    uiAction,
    action: responseFixture?.action ?? kind.toUpperCase().replaceAll("-", "_"),
    workflowId,
    state: "PASS",
    startedAt: "2026-09-04T12:04:00.000Z",
    completedAt: "2026-09-04T12:04:01.000Z",
    durationMs: 1_000,
    receipt: {
      schemaVersion: responseFixture
        ? responseFixture.receipt.schemaVersion
        : exerciseTransport
          ? "vigia.protection-exercise-receipt.v1"
          : "vigia.governed-mutation-receipt.v1",
      receiptId,
      at: "2026-09-04T12:04:00.500Z",
      ...(responseFixture?.receipt ?? {}),
      ...(exerciseTransport
        ? {
            universe: "EXERCISE",
            productionTruth: false,
            externalTransportInvoked: false,
            deliveryMode: "ISOLATED_EXERCISE_REPOSITORY",
          }
        : {}),
    },
    canonical: {
      beforeRevision: `sha256:canonical-before-${index}`,
      afterRevision: `sha256:canonical-after-${index}`,
      afterState,
      refreshedAt: "2026-09-04T12:04:01.000Z",
      refreshCompleted: true,
    },
  };
};
export const consequentialActionEvidence = () => {
  const executions = controlledActionKinds.map(actionExecution);
  const visibleActionInventory = executions.map((execution) => ({
    route: execution.route,
    action: execution.uiAction,
    workflowId: execution.workflowId,
    enabled: true,
    knownHandler: true,
    observedInControlledExercise: true,
  }));
  return {
    schemaVersion: CONSEQUENTIAL_ACTION_EVIDENCE_SCHEMA,
    generatedAt: "2026-09-04T12:03:00.000Z",
    completedAt: "2026-09-04T12:05:00.000Z",
    ...identity,
    universe: "CANONICAL_OPERATOR_RUNTIME",
    handlerInventory: {
      contract: ACTION_HANDLER_CONTRACT,
      sources: ACTION_HANDLER_SOURCE_PATHS.map((sourcePath, index) => ({
        path: sourcePath,
        sha256: `sha256:${String(index + 1).repeat(64)}`,
      })),
      sourceSha256: `sha256:${"a".repeat(64)}`,
      visibleActionCount: visibleActionInventory.length,
      knownHandlerCount: visibleActionInventory.length,
    },
    visibleActionInventory,
    visibleConsequentialActions: visibleActionInventory.map((item) => ({
      ...structuredClone(item),
      disposition: "EXECUTED_CONTROLLED_EXERCISE",
      safetyBoundary: null,
    })),
    executions,
    controlledExercise: {
      schemaVersion: CONTROLLED_ACTION_EXERCISE_SCHEMA,
      pass: true,
      startedAt: "2026-09-04T12:03:30.000Z",
      completedAt: "2026-09-04T12:04:30.000Z",
      namespace: "VQA-CONTROLLED-EOC-TEST",
      incidentId: "incident:test",
      universe: "CONTROLLED_EOC_EXERCISE",
      productionTruth: false,
      externalSendAttempted: false,
      exerciseTransport: "ISOLATED_VIGIA_EXERCISE_INBOX_ONLY",
      workflowIds: ["protect:primary", "protect:cancel", "protect:reject", "protect:expire"],
      steps: executions.map((execution) => ({
        action: execution.uiAction,
        pass: true,
        execution: structuredClone(execution),
      })),
      failures: [],
    },
    unknownActions: [],
    unhandledVisibleActions: [],
  };
};
