import { CONTROLLED_ACTION_EXERCISE_SCHEMA, CONTROLLED_ACTION_EXERCISE_REQUIRED_KINDS, nonempty, rows } from "./anduril_integrity_shared.mjs";

export function validateControlledExercise(evidence, executions, captureStartedMs, captureCompletedMs, violations) {
  const exercise = evidence.controlledExercise;
  const exerciseSteps = rows(exercise?.steps);
  const exercisedKinds = new Set(exerciseSteps.filter((step) => step?.pass === true).map((step) => String(step.action ?? "").split(":", 1)[0]));
  const exerciseStartedMs = Date.parse(exercise?.startedAt ?? ""),
    exerciseCompletedMs = Date.parse(exercise?.completedAt ?? "");
  const workflowIds = rows(exercise?.workflowIds).filter(nonempty);
  if (
    !exercise ||
    exercise.schemaVersion !== CONTROLLED_ACTION_EXERCISE_SCHEMA ||
    exercise.pass !== true ||
    exercise.universe !== "CONTROLLED_EOC_EXERCISE" ||
    exercise.productionTruth !== false ||
    exercise.externalSendAttempted !== false ||
    exercise.exerciseTransport !== "ISOLATED_VIGIA_EXERCISE_INBOX_ONLY" ||
    !nonempty(exercise.namespace) ||
    !nonempty(exercise.incidentId) ||
    workflowIds.length < 4 ||
    new Set(workflowIds).size !== workflowIds.length ||
    rows(exercise.failures).length ||
    !Number.isFinite(exerciseStartedMs) ||
    !Number.isFinite(exerciseCompletedMs) ||
    exerciseCompletedMs < exerciseStartedMs ||
    (Number.isFinite(captureStartedMs) && exerciseStartedMs < captureStartedMs) ||
    (Number.isFinite(captureCompletedMs) && exerciseCompletedMs > captureCompletedMs) ||
    exerciseSteps.some((step) => !step || step.pass !== true)
  ) {
    violations.push({ code: "ACTION_EVIDENCE_CONTROLLED_EXERCISE_INVALID" });
  }
  const missingExerciseKinds = CONTROLLED_ACTION_EXERCISE_REQUIRED_KINDS.filter((kind) => !exercisedKinds.has(kind));
  if (missingExerciseKinds.length)
    violations.push({
      code: "ACTION_EVIDENCE_CONTROLLED_EXERCISE_COVERAGE_MISSING",
      actionKinds: missingExerciseKinds,
    });
  for (const step of exerciseSteps) {
    if (step?.mutation === false) {
      if (String(step?.action ?? "").split(":", 1)[0] !== "protection-cap-draft")
        violations.push({
          code: "ACTION_EVIDENCE_CONTROLLED_EXERCISE_MUTATION_MISCLASSIFIED",
          action: step?.action ?? null,
        });
      continue;
    }
    const receiptId = step?.execution?.receipt?.receiptId;
    if (
      !nonempty(step?.action) ||
      !nonempty(receiptId) ||
      !executions.some((execution) => execution?.route === "operations" && execution?.uiAction === step.action && execution?.receipt?.receiptId === receiptId)
    ) {
      violations.push({
        code: "ACTION_EVIDENCE_CONTROLLED_EXERCISE_RECEIPT_UNBOUND",
        action: step?.action ?? null,
        receiptId: receiptId ?? null,
      });
    }
  }

  return exercise;
}
