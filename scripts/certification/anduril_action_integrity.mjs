import { consequentialAction } from "./anduril_integrity_shared.mjs";
import { validateActionInventory } from "./anduril_action_inventory_integrity.mjs";
import { validateControlledExercise } from "./anduril_controlled_exercise_integrity.mjs";
import { validateActionExecutions } from "./anduril_action_execution_integrity.mjs";

export function validateConsequentialActionEvidence(evidence, options = {}) {
  const violations = [];
  if (!evidence || typeof evidence !== "object") {
    return { state: "FAIL", violations: [{ code: "ACTION_EVIDENCE_MISSING" }] };
  }
  const context = validateActionInventory(
    evidence,
    {
      identity: options.identity ?? null,
      generatedAt: options.generatedAt ?? null,
      handlerSourceSha256: options.handlerSourceSha256 ?? null,
      handlerSources: options.handlerSources ?? null,
    },
    violations,
  );
  context.exercise = validateControlledExercise(evidence, context.executions, context.captureStartedMs, context.captureCompletedMs, violations);
  validateActionExecutions(context, violations);
  return {
    schemaVersion: "vigia.consequential-action-evidence-validation.v1",
    state: violations.length ? "FAIL" : "PASS",
    visibleEnabledCount: context.visible.length,
    executedCount: context.visible.filter((item) => item.disposition === "EXECUTED_CONTROLLED_EXERCISE").length,
    disabledConsequentialCount: (evidence.visibleActionInventory ?? []).filter((item) => item?.enabled !== true && consequentialAction(item?.action)).length,
    executionCount: context.executions.length,
    violations,
  };
}
