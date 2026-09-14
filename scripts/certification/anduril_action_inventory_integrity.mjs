import { ACTION_HANDLER_CONTRACT, ACTION_HANDLER_SOURCE_PATHS } from "./anduril_action_handler_contract.mjs";
import { CONSEQUENTIAL_ACTION_EVIDENCE_SCHEMA, consequentialAction, finiteIso, nonempty, rows, sameIdentity } from "./anduril_integrity_shared.mjs";

export function validateActionInventory(evidence, options, violations) {
  const { identity, generatedAt, handlerSourceSha256, handlerSources } = options;
  if (evidence.schemaVersion !== CONSEQUENTIAL_ACTION_EVIDENCE_SCHEMA)
    violations.push({
      code: "ACTION_EVIDENCE_SCHEMA_INVALID",
      actual: evidence.schemaVersion ?? null,
    });
  if (!finiteIso(evidence.generatedAt))
    violations.push({
      code: "ACTION_EVIDENCE_TIME_INVALID",
      actual: evidence.generatedAt ?? null,
    });
  if (identity && !sameIdentity(evidence, identity)) violations.push({ code: "ACTION_EVIDENCE_IDENTITY_MISMATCH" });
  if (generatedAt && evidence.generatedAt !== generatedAt)
    violations.push({
      code: "ACTION_EVIDENCE_CAPTURE_TIME_MISMATCH",
      expected: generatedAt,
      actual: evidence.generatedAt ?? null,
    });
  if (evidence.universe !== "CANONICAL_OPERATOR_RUNTIME")
    violations.push({
      code: "ACTION_EVIDENCE_UNIVERSE_INVALID",
      actual: evidence.universe ?? null,
    });
  const captureStartedMs = Date.parse(evidence.generatedAt ?? ""),
    captureCompletedMs = Date.parse(evidence.completedAt ?? "");
  if (!Number.isFinite(captureStartedMs) || !Number.isFinite(captureCompletedMs) || captureCompletedMs < captureStartedMs)
    violations.push({
      code: "ACTION_EVIDENCE_CAPTURE_WINDOW_INVALID",
      generatedAt: evidence.generatedAt ?? null,
      completedAt: evidence.completedAt ?? null,
    });
  const visible = rows(evidence.visibleConsequentialActions).filter((item) => item?.enabled === true);
  const executions = rows(evidence.executions);
  const visibleInventory = rows(evidence.visibleActionInventory);
  const handlerInventory = evidence.handlerInventory;
  const inventoryKeys = new Set();
  for (const item of visibleInventory) {
    const key = `${item?.route ?? ""}\0${item?.action ?? ""}`;
    if (!nonempty(item?.route) || !nonempty(item?.action) || inventoryKeys.has(key))
      violations.push({
        code: "ACTION_EVIDENCE_HANDLER_INVENTORY_ITEM_INVALID",
        item,
      });
    inventoryKeys.add(key);
  }
  const observedKnownHandlers = visibleInventory.filter((item) => item?.knownHandler === true).length;
  const inventorySources = rows(handlerInventory?.sources);
  const inventorySourcePaths = inventorySources.map((item) => item?.path);
  const validSourceRecords = inventorySources.every(
    (item) => ACTION_HANDLER_SOURCE_PATHS.includes(item?.path) && /^sha256:[a-f0-9]{64}$/u.test(String(item?.sha256 ?? "")),
  );
  if (
    !handlerInventory ||
    handlerInventory.contract !== ACTION_HANDLER_CONTRACT ||
    inventorySources.length !== ACTION_HANDLER_SOURCE_PATHS.length ||
    inventorySourcePaths.some((item, index) => item !== ACTION_HANDLER_SOURCE_PATHS[index]) ||
    !validSourceRecords ||
    !/^sha256:[a-f0-9]{64}$/u.test(String(handlerInventory.sourceSha256 ?? "")) ||
    handlerInventory.visibleActionCount !== visibleInventory.length ||
    handlerInventory.knownHandlerCount !== observedKnownHandlers
  )
    violations.push({
      code: "ACTION_EVIDENCE_HANDLER_INVENTORY_INVALID",
      handlerInventory: handlerInventory ?? null,
      observedVisibleActionCount: visibleInventory.length,
      observedKnownHandlerCount: observedKnownHandlers,
    });
  if (handlerSourceSha256 && handlerInventory?.sourceSha256 !== handlerSourceSha256)
    violations.push({
      code: "ACTION_EVIDENCE_HANDLER_SOURCE_MISMATCH",
      expected: handlerSourceSha256,
      actual: handlerInventory?.sourceSha256 ?? null,
    });
  if (handlerSources && JSON.stringify(inventorySources) !== JSON.stringify(handlerSources))
    violations.push({
      code: "ACTION_EVIDENCE_HANDLER_SOURCES_MISMATCH",
      expected: handlerSources,
      actual: inventorySources,
    });
  const expectedConsequential = visibleInventory.filter((item) => item?.enabled === true && consequentialAction(item?.action));
  const disabledWithoutReason = visibleInventory.filter(
    (item) => item?.enabled !== true && consequentialAction(item?.action) && !rows(item?.disabledReasons).some(nonempty),
  );
  if (disabledWithoutReason.length)
    violations.push({
      code: "ACTION_EVIDENCE_DISABLED_ACTION_REASON_MISSING",
      actions: disabledWithoutReason,
    });
  const visibleKeyList = visible.map((item) => `${item?.route ?? ""}\0${item?.action ?? ""}`);
  const visibleKeySet = new Set(visibleKeyList);
  for (const expected of expectedConsequential)
    if (!visibleKeySet.has(`${expected?.route ?? ""}\0${expected?.action ?? ""}`))
      violations.push({
        code: "ACTION_EVIDENCE_CONSEQUENTIAL_ACTION_SILENTLY_EXCLUDED",
        route: expected?.route ?? null,
        action: expected?.action ?? null,
      });
  for (const action of visible) {
    const inventoryItem = visibleInventory.find(
      (item) => item?.route === action?.route && item?.action === action?.action && item?.enabled === true && item?.knownHandler === true,
    );
    if (!inventoryItem || !consequentialAction(action?.action))
      violations.push({
        code: "ACTION_EVIDENCE_VISIBLE_ACTION_NOT_IN_HANDLER_INVENTORY",
        route: action?.route ?? null,
        action: action?.action ?? null,
      });
    if (action?.disposition === "EXECUTED_CONTROLLED_EXERCISE") {
      if (action?.observedInControlledExercise !== true || inventoryItem?.observedInControlledExercise !== true)
        violations.push({
          code: "ACTION_EVIDENCE_EXECUTED_ACTION_OUTSIDE_CONTROLLED_EXERCISE",
          route: action?.route ?? null,
          action: action?.action ?? null,
        });
    } else
      violations.push({
        code: "ACTION_EVIDENCE_ENABLED_ACTION_NOT_EXECUTED",
        route: action?.route ?? null,
        action: action?.action ?? null,
      });
  }
  if (!visible.length) violations.push({ code: "ACTION_EVIDENCE_VISIBLE_COHORT_EMPTY" });
  if (rows(evidence.unknownActions).length)
    violations.push({
      code: "ACTION_EVIDENCE_UNKNOWN_ACTIONS",
      actions: evidence.unknownActions,
    });
  if (rows(evidence.unhandledVisibleActions).length)
    violations.push({
      code: "ACTION_EVIDENCE_UNHANDLED_VISIBLE_ACTIONS",
      actions: evidence.unhandledVisibleActions,
    });

  return { visible, executions, captureStartedMs, captureCompletedMs };
}
