import { EXERCISE_TRANSPORT_ACTION_KINDS, nonempty } from "./anduril_integrity_shared.mjs";
import { responseReviewExecutionValid } from "./anduril_response_review_integrity.mjs";

export function validateActionExecutions({ visible, executions, exercise, captureStartedMs, captureCompletedMs }, violations) {
  const visibleKeys = new Set();
  const receiptIds = new Set();
  for (const action of visible) {
    const key = `${action.route ?? ""}\0${action.action ?? ""}`;
    if (!nonempty(action.route) || !nonempty(action.action) || !nonempty(action.workflowId) || action.knownHandler !== true)
      violations.push({
        code: "ACTION_EVIDENCE_VISIBLE_ACTION_INVALID",
        action,
      });
    if (visibleKeys.has(key))
      violations.push({
        code: "ACTION_EVIDENCE_VISIBLE_ACTION_DUPLICATE",
        route: action.route,
        action: action.action,
      });
    visibleKeys.add(key);
    const matching = executions.filter((execution) => execution?.route === action.route && execution?.uiAction === action.action);
    if (!matching.length) {
      violations.push({
        code: "ACTION_EVIDENCE_EXECUTION_MISSING",
        route: action.route,
        action: action.action,
        workflowId: action.workflowId,
        actual: 0,
      });
      continue;
    }
    for (const execution of matching) {
      const receipt = execution.receipt;
      const canonical = execution.canonical;
      const kind = String(execution.uiAction ?? "").split(":", 1)[0];
      const afterState = canonical?.afterState;
      const executionStartedMs = Date.parse(execution.startedAt ?? ""),
        executionCompletedMs = Date.parse(execution.completedAt ?? ""),
        receiptAtMs = Date.parse(receipt?.at ?? ""),
        refreshedAtMs = Date.parse(canonical?.refreshedAt ?? "");
      if (
        execution.state !== "PASS" ||
        !nonempty(execution.uiAction) ||
        !nonempty(execution.action) ||
        !Number.isFinite(execution.durationMs) ||
        execution.durationMs < 0 ||
        !Number.isFinite(executionStartedMs) ||
        !Number.isFinite(executionCompletedMs) ||
        executionCompletedMs < executionStartedMs ||
        (Number.isFinite(captureStartedMs) && executionStartedMs < captureStartedMs) ||
        (Number.isFinite(captureCompletedMs) && executionCompletedMs > captureCompletedMs)
      )
        violations.push({
          code: "ACTION_EVIDENCE_EXECUTION_INVALID",
          route: action.route,
          action: action.action,
        });
      if (
        !receipt ||
        !nonempty(receipt.schemaVersion) ||
        !nonempty(receipt.receiptId) ||
        !Number.isFinite(receiptAtMs) ||
        !Number.isFinite(executionStartedMs) ||
        !Number.isFinite(executionCompletedMs) ||
        receiptAtMs < executionStartedMs ||
        receiptAtMs > executionCompletedMs
      )
        violations.push({
          code: "ACTION_EVIDENCE_RECEIPT_INVALID",
          route: action.route,
          action: action.action,
        });
      else if (receiptIds.has(receipt.receiptId))
        violations.push({
          code: "ACTION_EVIDENCE_RECEIPT_REUSED",
          route: action.route,
          action: action.action,
          receiptId: receipt.receiptId,
        });
      else receiptIds.add(receipt.receiptId);
      if (
        !canonical ||
        !nonempty(canonical.beforeRevision) ||
        !nonempty(canonical.afterRevision) ||
        canonical.beforeRevision === canonical.afterRevision ||
        canonical.refreshCompleted !== true ||
        !Number.isFinite(refreshedAtMs) ||
        !Number.isFinite(executionStartedMs) ||
        !Number.isFinite(executionCompletedMs) ||
        refreshedAtMs < executionStartedMs ||
        refreshedAtMs > executionCompletedMs
      )
        violations.push({
          code: "ACTION_EVIDENCE_CANONICAL_REFRESH_INVALID",
          route: action.route,
          action: action.action,
        });
      const incidentBound =
        afterState &&
        nonempty(afterState.selectedIncidentId) &&
        afterState.selectedIncidentId === exercise?.incidentId &&
        afterState.incidentId === exercise?.incidentId;
      let meaningfulAfterState = incidentBound;
      if (kind === "response-recommendation-review")
        meaningfulAfterState = responseReviewExecutionValid({
          execution,
          receipt,
          afterState,
          incidentId: exercise?.incidentId,
        });
      else if (kind.startsWith("protection-"))
        meaningfulAfterState =
          meaningfulAfterState &&
          afterState.scope === "PROTECTION_WORKFLOW" &&
          afterState.workflowId === execution.workflowId &&
          nonempty(afterState.state) &&
          afterState.universe === "EXERCISE" &&
          afterState.productionTruth === false;
      else if (kind.startsWith("period-"))
        meaningfulAfterState =
          meaningfulAfterState &&
          afterState.scope === "OPERATIONAL_PERIOD" &&
          nonempty(afterState.periodId) &&
          nonempty(afterState.state) &&
          afterState.universe === "CONTROLLED_EOC_EXERCISE" &&
          afterState.counts &&
          typeof afterState.counts === "object";
      else if (kind === "command-context-initialize")
        meaningfulAfterState =
          meaningfulAfterState &&
          afterState.scope === "INCIDENT_COMMAND" &&
          receipt?.schemaVersion === "vigia.incident-command-import-receipt.v1" &&
          receipt?.incidentId === exercise?.incidentId;
      else if (kind === "command-intent-create" || kind.startsWith("planning-"))
        meaningfulAfterState =
          meaningfulAfterState && afterState.scope === "INCIDENT_COMMAND" && (Number.isInteger(afterState.version) || nonempty(afterState.lastEventId));
      else if (kind.startsWith("human-attention-"))
        meaningfulAfterState =
          meaningfulAfterState && afterState.scope === "HUMAN_ATTENTION" && afterState.attentionId === execution.workflowId && nonempty(afterState.state);
      if (!meaningfulAfterState)
        violations.push({
          code: "ACTION_EVIDENCE_CANONICAL_AFTER_STATE_INVALID",
          route: action.route,
          action: action.action,
          afterState: afterState ?? null,
        });
      if (EXERCISE_TRANSPORT_ACTION_KINDS.includes(kind)) {
        if (
          receipt?.schemaVersion !== "vigia.protection-exercise-receipt.v1" ||
          receipt.universe !== "EXERCISE" ||
          receipt.productionTruth !== false ||
          receipt.externalTransportInvoked !== false ||
          receipt.deliveryMode !== "ISOLATED_EXERCISE_REPOSITORY"
        )
          violations.push({
            code: "ACTION_EVIDENCE_EXERCISE_TRANSPORT_RECEIPT_INVALID",
            route: action.route,
            action: action.action,
            receipt: receipt ?? null,
          });
        if (
          kind !== "protection-expire" &&
          (!afterState?.delivery ||
            !nonempty(afterState.delivery.receiptId) ||
            afterState.delivery.deliveryMode !== "ISOLATED_EXERCISE_REPOSITORY" ||
            afterState.delivery.externalTransportInvoked !== false ||
            !nonempty(afterState.delivery.targetId))
        )
          violations.push({
            code: "ACTION_EVIDENCE_EXERCISE_DELIVERY_STATE_INVALID",
            route: action.route,
            action: action.action,
            afterState: afterState ?? null,
          });
      }
    }
  }
  for (const execution of executions) {
    if (
      !visible.some(
        (action) => action.disposition === "EXECUTED_CONTROLLED_EXERCISE" && action.route === execution?.route && action.action === execution?.uiAction,
      )
    )
      violations.push({
        code: "ACTION_EVIDENCE_EXECUTION_NOT_VISIBLE",
        route: execution?.route ?? null,
        action: execution?.action ?? null,
        uiAction: execution?.uiAction ?? null,
        workflowId: execution?.workflowId ?? null,
      });
  }
}
