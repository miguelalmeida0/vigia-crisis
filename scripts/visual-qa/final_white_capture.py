#!/usr/bin/env python3
"""Fresh canonical visual evidence for the seven-route final white VIGIA console."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import base64
import gzip
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
import re
import select
import shutil
import subprocess
import sys
import time
import urllib.parse

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout


ROOT = Path(os.environ.get("VIGIA_VQA_ROOT", Path(__file__).resolve().parents[2])).resolve()
REFERENCE_ROOT = ROOT / "VIGIA_FINAL_WHITE_FRONTEND_HANDOFF_2026-09-01"
OUTPUT_ROOT = ROOT / ".artifacts" / "final-white-vigia"
VIEWPORT = {"width": 1672, "height": 941}
OPERATOR_TIMEZONE = os.environ.get("VIGIA_VQA_TIMEZONE", "Europe/Berlin")
RESPONSIVE = [(1672, 941), (1600, 1000), (1440, 900), (1280, 800), (1024, 768), (768, 1024), (430, 932), (390, 844), (320, 568)]
ROUTES = [
    ("01-command-overview", "command-overview", "01_COMMAND_OVERVIEW_VISUAL_BASE.png"),
    ("02-incidents", "incidents", "02_INCIDENTS_VISUAL_BASE.png"),
    ("03-incident-detail", "incident-detail", "03_INCIDENT_DETAIL_VISUAL_BASE.png"),
    ("04-intelligence", "intelligence", "04_INTELLIGENCE_FINAL_TARGET.png"),
    ("05-operations", "operations", "05_OPERATIONS_VISUAL_BASE.png"),
    ("06-reports-analytics", "reports-analytics", "06_REPORTS_ANALYTICS_VISUAL_BASE.png"),
    ("07-global-awareness", "global-awareness", "07_GLOBAL_AWARENESS_VISUAL_BASE.png"),
]
LANDMARKS = {
    "command-overview": {"metrics": ".overview-metrics", "primary": ".overview-primary", "health": ".system-health"},
    "incidents": {"filters": ".incidents-toolbar", "inventory": ".incident-inventory", "context": ".incidents-side"},
    "incident-detail": {"switcher": ".incident-context-switcher", "brief": ".incident-executive-brief", "map": ".incident-detail-map", "resolution": ".incident-resolution"},
    "intelligence": {"switcher": ".incident-context-switcher", "primary": ".intelligence-primary", "map": ".intelligence-map", "brief": ".intelligence-reading", "watch": ".intelligence-watch", "artifacts": ".supporting-artifacts"},
    "operations": {"switcher": ".incident-context-switcher", "lanes": ".operation-lanes", "actions": ".operations-action-queue", "inspector": ".operation-inspector"},
    "reports-analytics": {"controls": ".report-controls", "tabs": ".report-tabs", "panel": ".report-controlled-panel"},
    "global-awareness": {"filters": ".global-filters", "map": ".global-map", "rail": ".global-rail"},
}

CONSEQUENTIAL_ACTION_EVIDENCE_SCHEMA = "vigia.consequential-action-browser-evidence.v1"
CONTROLLED_ACTION_EXERCISE_SCHEMA = "vigia.controlled-eoc-browser-action-exercise.v1"
CONTROLLED_ACTION_EXERCISE_REQUIRED_KINDS = {
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
    "protection-exercise-send",
    "protection-exercise-ack",
    "protection-create",
    "protection-review",
    "protection-approve",
    "protection-reject",
    "protection-eligible",
    "protection-exercise-update",
    "protection-supersede",
    "protection-exercise-cancel",
    "protection-expire",
    "period-record-postcondition",
    "period-record-outcome",
    "period-record-lesson",
    "period-begin-handoff",
    "period-close",
    "command-intent-create",
    "response-recommendation-review",
    "planning-proposal-review",
    "planning-approved-apply",
}
EXERCISE_TRANSPORT_ACTION_KINDS = {
    "protection-exercise-send",
    "protection-exercise-ack",
    "protection-exercise-update",
    "protection-supersede",
    "protection-exercise-cancel",
    "protection-expire",
}
CONSEQUENTIAL_ACTION_PREFIXES = (
    "human-attention-",
    "period-",
    "protection-",
)
CONSEQUENTIAL_ACTION_EXACT = {
    "command-context-initialize",
    "command-intent-create",
    "response-recommendation-review",
    "planning-proposal-review",
    "planning-approved-apply",
}
NON_MUTATING_ACTION_KINDS = {
    "protection-cap-draft",
}
ACTION_HANDLER_CONTRACT = "vigia.operator-action-handler-sources.v2"
ACTION_HANDLER_SOURCE_PATHS = (
    "apps/operator-console/src/app.js",
    "apps/operator-console/src/appActionController.js",
    "apps/operator-console/src/responseCapabilityActions.js",
)


def load_capture_module():
    path = ROOT / "scripts" / "visual-qa" / "capture.py"
    spec = importlib.util.spec_from_file_location("vigia_visual_qa_base", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("visual_qa_base_module_unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def action_kind(action: str | None) -> str:
    return str(action or "").split(":", 1)[0]


def action_handler_contract() -> dict:
    aggregate = hashlib.sha256()
    handlers: set[str] = set()
    sources: list[dict] = []
    for source_path in ACTION_HANDLER_SOURCE_PATHS:
        source = (ROOT / source_path).read_bytes()
        sources.append({"path": source_path, "sha256": f"sha256:{hashlib.sha256(source).hexdigest()}"})
        aggregate.update(source_path.encode("utf-8"))
        aggregate.update(b"\0")
        aggregate.update(source)
        aggregate.update(b"\0")
        handlers.update(re.findall(rb"\bcase\s*['\"]([^'\"]+)['\"]\s*:", source))
        for handler_list in re.findall(rb"\[((?:\s*['\"][^'\"]+['\"]\s*,?)+)\]\.includes\(kind\)", source):
            handlers.update(re.findall(rb"['\"]([^'\"]+)['\"]", handler_list))
    return {
        "contract": ACTION_HANDLER_CONTRACT,
        "sources": sources,
        "sourceSha256": f"sha256:{aggregate.hexdigest()}",
        "handlerKinds": {item.decode("utf-8") for item in handlers},
    }


def known_action_handlers() -> set[str]:
    return action_handler_contract()["handlerKinds"]


def is_consequential_action(action: str | None) -> bool:
    kind = action_kind(action)
    if kind in NON_MUTATING_ACTION_KINDS or kind.endswith("-submit"):
        return False
    return kind in CONSEQUENTIAL_ACTION_EXACT or kind.startswith(CONSEQUENTIAL_ACTION_PREFIXES)


def response_review_execution_valid(action: str, execution: dict, incident_id: str) -> bool:
    receipt = execution.get("receipt") if isinstance(execution.get("receipt"), dict) else {}
    after_state = execution.get("canonical", {}).get("afterState") if isinstance(execution.get("canonical", {}).get("afterState"), dict) else {}
    try:
        recommendation_id = urllib.parse.unquote(action.split(":", 1)[1])
    except (IndexError, ValueError):
        recommendation_id = ""
    receipt_binding = (
        after_state.get("projectionId") == receipt.get("projectionId")
        and str(after_state.get("recommendationVersion")) == str(receipt.get("recommendationVersion"))
        and after_state.get("recommendationHash") == receipt.get("recommendationHash")
        and after_state.get("receiptId") == receipt.get("receiptId")
        and after_state.get("disposition") == receipt.get("disposition")
        and after_state.get("truthEffect") == "REVIEW_STATE_ONLY"
    )
    binding_state = after_state.get("bindingState")
    current_binding = (
        binding_state == "CURRENT_PROJECTION_EXACT_BINDING"
        and after_state.get("currentProjectionId") == receipt.get("projectionId")
        and str(after_state.get("currentRecommendationVersion")) == str(receipt.get("recommendationVersion"))
        and after_state.get("currentRecommendationHash") == receipt.get("recommendationHash")
        and after_state.get("requiresRereview") is False
    )
    prior_binding = (
        binding_state in {
            "PRIOR_PROJECTION_SAME_SEMANTIC_RECOMMENDATION",
            "SUPERSEDED_BY_CURRENT_RECOMMENDATION_REVIEW_REQUIRED",
        }
        and after_state.get("currentProjectionId")
        and after_state.get("currentRecommendationVersion") is not None
        and after_state.get("currentRecommendationHash")
        and (
            after_state.get("currentProjectionId") != receipt.get("projectionId")
            or str(after_state.get("currentRecommendationVersion")) != str(receipt.get("recommendationVersion"))
            or after_state.get("currentRecommendationHash") != receipt.get("recommendationHash")
        )
        and after_state.get("requiresRereview") is True
    )
    return bool(
        incident_id
        and execution.get("action") == "REVIEW_RESPONSE_RECOMMENDATION"
        and execution.get("workflowId") == recommendation_id
        and receipt.get("schemaVersion") == "vigia.response-recommendation-review-receipt.v1"
        and receipt.get("incidentId") == incident_id
        and receipt.get("projectionId")
        and receipt.get("recommendationId") == recommendation_id
        and receipt.get("recommendationVersion") is not None
        and receipt.get("recommendationHash")
        and receipt.get("disposition") in {"ACKNOWLEDGED_FOR_REVIEW", "DEFERRED", "DECLINED"}
        and receipt.get("truthEffect") == "REVIEW_STATE_ONLY"
        and after_state.get("scope") == "RESPONSE_RECOMMENDATION_REVIEW"
        and after_state.get("selectedIncidentId") == incident_id
        and after_state.get("incidentId") == incident_id
        and after_state.get("recommendationId") == receipt.get("recommendationId")
        and receipt_binding
        and (current_binding or prior_binding)
    )


def visible_action_inventory(summary: dict) -> list[dict]:
    handlers = known_action_handlers()
    observed: dict[tuple[str, str], dict] = {}
    route_documents = [
        {"route": route, **item.get("dom", {})}
        for route, item in summary.get("routes", {}).items()
    ]
    route_documents.extend(summary.get("responsiveMatrix", []))
    action_surfaces = summary.get("interactions", {}).get("consequentialActionSurfaces", {})
    if isinstance(action_surfaces, dict):
        route_documents.extend(action_surfaces.get("surfaces", []))
    for document in route_documents:
        route = str(document.get("route") or "")
        for control in document.get("actions", []):
            action = str(control.get("action") or "")
            if not route or not action:
                continue
            key = (route, action)
            row = observed.setdefault(key, {
                "route": route,
                "action": action,
                "actionKind": action_kind(action),
                "workflowId": action,
                "enabled": False,
                "knownHandler": action_kind(action) in handlers,
                "observedInControlledExercise": False,
                "labels": [],
                "disabledReasons": [],
                "viewports": [],
                "surfaces": [],
            })
            row["enabled"] = row["enabled"] or control.get("disabled") is not True
            row["observedInControlledExercise"] = row["observedInControlledExercise"] or str(document.get("name") or "").startswith("controlled-exercise:")
            label = str(control.get("label") or "").strip()
            if label and label not in row["labels"]:
                row["labels"].append(label)
            disabled_reason = str(control.get("disabledReason") or "").strip()
            if disabled_reason and disabled_reason not in row["disabledReasons"]:
                row["disabledReasons"].append(disabled_reason)
            viewport = document.get("viewport")
            if isinstance(viewport, dict):
                viewport_key = f"{viewport.get('width')}x{viewport.get('height')}"
                if viewport_key not in row["viewports"]:
                    row["viewports"].append(viewport_key)
            surface = str(document.get("name") or route).strip()
            if surface and surface not in row["surfaces"]:
                row["surfaces"].append(surface)
    return sorted(observed.values(), key=lambda item: (item["route"], item["action"]))


def validate_consequential_action_evidence(evidence: dict) -> dict:
    violations: list[dict] = []
    visible = [item for item in evidence.get("visibleConsequentialActions", []) if item.get("enabled") is True]
    executions = evidence.get("executions", []) if isinstance(evidence.get("executions"), list) else []
    if evidence.get("schemaVersion") != CONSEQUENTIAL_ACTION_EVIDENCE_SCHEMA:
        violations.append({"code": "ACTION_EVIDENCE_SCHEMA_INVALID"})
    if evidence.get("universe") != "CANONICAL_OPERATOR_RUNTIME":
        violations.append({"code": "ACTION_EVIDENCE_UNIVERSE_INVALID"})
    try:
        generated_at = datetime.fromisoformat(str(evidence["generatedAt"]).replace("Z", "+00:00"))
        completed_at = datetime.fromisoformat(str(evidence["completedAt"]).replace("Z", "+00:00"))
        if completed_at < generated_at:
            raise ValueError("capture_completion_precedes_start")
    except (KeyError, TypeError, ValueError):
        generated_at = completed_at = None
        violations.append({"code": "ACTION_EVIDENCE_CAPTURE_WINDOW_INVALID"})
    if not visible:
        violations.append({"code": "ACTION_EVIDENCE_VISIBLE_COHORT_EMPTY"})
    if evidence.get("unknownActions"):
        violations.append({"code": "ACTION_EVIDENCE_UNKNOWN_ACTIONS", "actions": evidence.get("unknownActions")})
    if evidence.get("unhandledVisibleActions"):
        violations.append({"code": "ACTION_EVIDENCE_UNHANDLED_VISIBLE_ACTIONS", "actions": evidence.get("unhandledVisibleActions")})
    visible_inventory = evidence.get("visibleActionInventory") if isinstance(evidence.get("visibleActionInventory"), list) else []
    handler_inventory = evidence.get("handlerInventory") if isinstance(evidence.get("handlerInventory"), dict) else {}
    inventory_keys: set[tuple[str, str]] = set()
    for item in visible_inventory:
        key = (item.get("route"), item.get("action")) if isinstance(item, dict) else (None, None)
        if not key[0] or not key[1] or key in inventory_keys:
            violations.append({"code": "ACTION_EVIDENCE_HANDLER_INVENTORY_ITEM_INVALID", "item": item})
        inventory_keys.add(key)
    observed_known_handlers = sum(1 for item in visible_inventory if isinstance(item, dict) and item.get("knownHandler") is True)
    inventory_sources = handler_inventory.get("sources") if isinstance(handler_inventory.get("sources"), list) else []
    inventory_source_paths = [item.get("path") if isinstance(item, dict) else None for item in inventory_sources]
    valid_source_records = all(
        isinstance(item, dict)
        and item.get("path") in ACTION_HANDLER_SOURCE_PATHS
        and re.fullmatch(r"sha256:[a-f0-9]{64}", str(item.get("sha256") or "")) is not None
        for item in inventory_sources
    )
    if (
        handler_inventory.get("contract") != ACTION_HANDLER_CONTRACT
        or inventory_source_paths != list(ACTION_HANDLER_SOURCE_PATHS)
        or not valid_source_records
        or re.fullmatch(r"sha256:[a-f0-9]{64}", str(handler_inventory.get("sourceSha256") or "")) is None
        or handler_inventory.get("visibleActionCount") != len(visible_inventory)
        or handler_inventory.get("knownHandlerCount") != observed_known_handlers
    ):
        violations.append({"code": "ACTION_EVIDENCE_HANDLER_INVENTORY_INVALID", "handlerInventory": handler_inventory or None, "observedVisibleActionCount": len(visible_inventory), "observedKnownHandlerCount": observed_known_handlers})
    expected_consequential = [item for item in visible_inventory if item.get("enabled") is True and is_consequential_action(item.get("action"))]
    disabled_without_reason = [
        item for item in visible_inventory
        if item.get("enabled") is not True
        and is_consequential_action(item.get("action"))
        and not item.get("disabledReasons")
    ]
    if disabled_without_reason:
        violations.append({"code": "ACTION_EVIDENCE_DISABLED_ACTION_REASON_MISSING", "actions": disabled_without_reason})
    visible_keys_list = {(item.get("route"), item.get("action")) for item in visible}
    for expected in expected_consequential:
        if (expected.get("route"), expected.get("action")) not in visible_keys_list:
            violations.append({"code": "ACTION_EVIDENCE_CONSEQUENTIAL_ACTION_SILENTLY_EXCLUDED", "route": expected.get("route"), "action": expected.get("action")})
    for item in visible:
        inventory_match = any(
            isinstance(inventory_item, dict)
            and inventory_item.get("route") == item.get("route")
            and inventory_item.get("action") == item.get("action")
            and inventory_item.get("enabled") is True
            and inventory_item.get("knownHandler") is True
            for inventory_item in visible_inventory
        )
        if inventory_match is not True or not is_consequential_action(item.get("action")):
            violations.append({"code": "ACTION_EVIDENCE_VISIBLE_ACTION_NOT_IN_HANDLER_INVENTORY", "route": item.get("route"), "action": item.get("action")})
        if item.get("disposition") == "EXECUTED_CONTROLLED_EXERCISE":
            if item.get("observedInControlledExercise") is not True:
                violations.append({"code": "ACTION_EVIDENCE_EXECUTED_ACTION_OUTSIDE_CONTROLLED_EXERCISE", "route": item.get("route"), "action": item.get("action")})
        else:
            violations.append({"code": "ACTION_EVIDENCE_ENABLED_ACTION_NOT_EXECUTED", "route": item.get("route"), "action": item.get("action")})
    exercise = evidence.get("controlledExercise") if isinstance(evidence.get("controlledExercise"), dict) else {}
    exercise_incident_ids = exercise.get("incidentIds") if isinstance(exercise.get("incidentIds"), list) else []
    exercise_incident_ids = [item for item in exercise_incident_ids if isinstance(item, str) and item.strip()]
    if not exercise_incident_ids and exercise.get("incidentId"):
        exercise_incident_ids = [exercise.get("incidentId")]
    exercise_steps = exercise.get("steps") if isinstance(exercise.get("steps"), list) else []
    exercised_kinds = {action_kind(step.get("action")) for step in exercise_steps if isinstance(step, dict) and step.get("pass") is True}
    workflow_ids = [item for item in exercise.get("workflowIds", []) if isinstance(item, str) and item.strip()] if isinstance(exercise.get("workflowIds"), list) else []
    try:
        exercise_started = datetime.fromisoformat(str(exercise["startedAt"]).replace("Z", "+00:00"))
        exercise_completed = datetime.fromisoformat(str(exercise["completedAt"]).replace("Z", "+00:00"))
        exercise_time_valid = (
            exercise_completed >= exercise_started
            and (generated_at is None or exercise_started >= generated_at)
            and (completed_at is None or exercise_completed <= completed_at)
        )
    except (KeyError, TypeError, ValueError):
        exercise_time_valid = False
    if (
        exercise.get("schemaVersion") != CONTROLLED_ACTION_EXERCISE_SCHEMA
        or exercise.get("pass") is not True
        or exercise.get("universe") != "CONTROLLED_EOC_EXERCISE"
        or exercise.get("productionTruth") is not False
        or exercise.get("externalSendAttempted") is not False
        or exercise.get("exerciseTransport") != "ISOLATED_VIGIA_EXERCISE_INBOX_ONLY"
        or not exercise.get("namespace")
        or not exercise.get("incidentId")
        or exercise.get("incidentId") not in exercise_incident_ids
        or len(exercise_incident_ids) != len(set(exercise_incident_ids))
        or len(workflow_ids) < 4
        or len(workflow_ids) != len(set(workflow_ids))
        or exercise.get("failures")
        or not exercise_time_valid
        or any(not isinstance(step, dict) or step.get("pass") is not True for step in exercise_steps)
    ):
        violations.append({"code": "ACTION_EVIDENCE_CONTROLLED_EXERCISE_INVALID"})
    missing_exercise_kinds = sorted(CONTROLLED_ACTION_EXERCISE_REQUIRED_KINDS - exercised_kinds)
    if missing_exercise_kinds:
        violations.append({"code": "ACTION_EVIDENCE_CONTROLLED_EXERCISE_COVERAGE_MISSING", "actionKinds": missing_exercise_kinds})
    for step in exercise_steps:
        if not isinstance(step, dict):
            continue
        if step.get("mutation") is False:
            if action_kind(step.get("action")) != "protection-cap-draft":
                violations.append({"code": "ACTION_EVIDENCE_CONTROLLED_EXERCISE_MUTATION_MISCLASSIFIED", "action": step.get("action")})
            continue
        step_execution = step.get("execution") if isinstance(step.get("execution"), dict) else {}
        receipt_id = step_execution.get("receipt", {}).get("receiptId") if isinstance(step_execution.get("receipt"), dict) else None
        if not step.get("action") or not receipt_id or not any(
            execution.get("route") == "operations"
            and execution.get("uiAction") == step.get("action")
            and isinstance(execution.get("receipt"), dict)
            and execution["receipt"].get("receiptId") == receipt_id
            for execution in executions
        ):
            violations.append({"code": "ACTION_EVIDENCE_CONTROLLED_EXERCISE_RECEIPT_UNBOUND", "action": step.get("action"), "receiptId": receipt_id})
    visible_keys = {(item.get("route"), item.get("action")) for item in visible}
    receipt_ids: set[str] = set()
    for action in visible:
        matching = [item for item in executions if item.get("route") == action.get("route") and item.get("uiAction") == action.get("action")]
        if not matching:
            violations.append({"code": "ACTION_EVIDENCE_EXECUTION_MISSING", "route": action.get("route"), "action": action.get("action"), "actual": 0})
            continue
        for execution in matching:
            receipt = execution.get("receipt") if isinstance(execution.get("receipt"), dict) else {}
            canonical = execution.get("canonical") if isinstance(execution.get("canonical"), dict) else {}
            kind = action_kind(execution.get("uiAction"))
            after_state = canonical.get("afterState") if isinstance(canonical.get("afterState"), dict) else {}
            try:
                execution_started = datetime.fromisoformat(str(execution["startedAt"]).replace("Z", "+00:00"))
                execution_completed = datetime.fromisoformat(str(execution["completedAt"]).replace("Z", "+00:00"))
                valid_duration = (
                    execution.get("state") == "PASS"
                    and bool(execution.get("uiAction"))
                    and bool(execution.get("action"))
                    and isinstance(execution.get("durationMs"), (int, float))
                    and execution.get("durationMs") >= 0
                    and execution_completed >= execution_started
                    and (generated_at is None or execution_started >= generated_at)
                    and (completed_at is None or execution_completed <= completed_at)
                )
            except (KeyError, TypeError, ValueError):
                execution_started = execution_completed = None
                valid_duration = False
            if not valid_duration:
                violations.append({"code": "ACTION_EVIDENCE_EXECUTION_INVALID", "route": action.get("route"), "action": action.get("action")})
            try:
                receipt_at = datetime.fromisoformat(str(receipt["at"]).replace("Z", "+00:00"))
                receipt_valid = (
                    bool(receipt.get("schemaVersion"))
                    and bool(receipt.get("receiptId"))
                    and execution_started is not None
                    and execution_completed is not None
                    and execution_started <= receipt_at <= execution_completed
                )
            except (KeyError, TypeError, ValueError):
                receipt_at = None
                receipt_valid = False
            if not receipt_valid:
                violations.append({"code": "ACTION_EVIDENCE_RECEIPT_INVALID", "route": action.get("route"), "action": action.get("action")})
            elif receipt["receiptId"] in receipt_ids:
                violations.append({"code": "ACTION_EVIDENCE_RECEIPT_REUSED", "route": action.get("route"), "action": action.get("action"), "receiptId": receipt["receiptId"]})
            else:
                receipt_ids.add(receipt["receiptId"])
            try:
                refreshed_at = datetime.fromisoformat(str(canonical["refreshedAt"]).replace("Z", "+00:00"))
                refresh_time_valid = execution_started is not None and execution_completed is not None and execution_started <= refreshed_at <= execution_completed
            except (KeyError, TypeError, ValueError):
                refresh_time_valid = False
            if not canonical.get("beforeRevision") or not canonical.get("afterRevision") or canonical.get("beforeRevision") == canonical.get("afterRevision") or canonical.get("refreshCompleted") is not True or not refresh_time_valid:
                violations.append({"code": "ACTION_EVIDENCE_CANONICAL_REFRESH_INVALID", "route": action.get("route"), "action": action.get("action")})
            meaningful_after_state = (
                bool(after_state.get("selectedIncidentId"))
                and after_state.get("selectedIncidentId") == exercise.get("incidentId")
                and after_state.get("incidentId") == exercise.get("incidentId")
            )
            if kind == "response-recommendation-review":
                response_incident_id = receipt.get("incidentId") if isinstance(receipt.get("incidentId"), str) else ""
                meaningful_after_state = response_review_execution_valid(
                    execution.get("uiAction", ""), execution, response_incident_id
                ) and response_incident_id in exercise_incident_ids
            elif kind.startswith("protection-"):
                meaningful_after_state = (
                    meaningful_after_state
                    and after_state.get("scope") == "PROTECTION_WORKFLOW"
                    and after_state.get("workflowId") == execution.get("workflowId")
                    and bool(after_state.get("state"))
                    and after_state.get("universe") == "EXERCISE"
                    and after_state.get("productionTruth") is False
                )
            elif kind.startswith("period-"):
                meaningful_after_state = (
                    meaningful_after_state
                    and after_state.get("scope") == "OPERATIONAL_PERIOD"
                    and bool(after_state.get("periodId"))
                    and bool(after_state.get("state"))
                    and after_state.get("universe") == "CONTROLLED_EOC_EXERCISE"
                    and isinstance(after_state.get("counts"), dict)
                )
            elif kind == "command-context-initialize":
                meaningful_after_state = (
                    meaningful_after_state
                    and after_state.get("scope") == "INCIDENT_COMMAND"
                    and receipt.get("schemaVersion") == "vigia.incident-command-import-receipt.v1"
                    and receipt.get("incidentId") == exercise.get("incidentId")
                )
            elif kind == "command-intent-create" or kind.startswith("planning-"):
                meaningful_after_state = (
                    meaningful_after_state
                    and after_state.get("scope") == "INCIDENT_COMMAND"
                    and (isinstance(after_state.get("version"), int) or bool(after_state.get("lastEventId")))
                )
            elif kind.startswith("human-attention-"):
                meaningful_after_state = (
                    meaningful_after_state
                    and after_state.get("scope") == "HUMAN_ATTENTION"
                    and after_state.get("attentionId") == execution.get("workflowId")
                    and bool(after_state.get("state"))
                )
            if not meaningful_after_state:
                violations.append({"code": "ACTION_EVIDENCE_CANONICAL_AFTER_STATE_INVALID", "route": action.get("route"), "action": action.get("action"), "afterState": after_state or None})
            if kind in EXERCISE_TRANSPORT_ACTION_KINDS:
                if (
                    receipt.get("schemaVersion") != "vigia.protection-exercise-receipt.v1"
                    or receipt.get("universe") != "EXERCISE"
                    or receipt.get("productionTruth") is not False
                    or receipt.get("externalTransportInvoked") is not False
                    or receipt.get("deliveryMode") != "ISOLATED_EXERCISE_REPOSITORY"
                ):
                    violations.append({"code": "ACTION_EVIDENCE_EXERCISE_TRANSPORT_RECEIPT_INVALID", "route": action.get("route"), "action": action.get("action"), "receipt": receipt or None})
                delivery = after_state.get("delivery") if isinstance(after_state.get("delivery"), dict) else {}
                if kind != "protection-expire" and (
                    not delivery.get("receiptId")
                    or delivery.get("deliveryMode") != "ISOLATED_EXERCISE_REPOSITORY"
                    or delivery.get("externalTransportInvoked") is not False
                    or not delivery.get("targetId")
                ):
                    violations.append({"code": "ACTION_EVIDENCE_EXERCISE_DELIVERY_STATE_INVALID", "route": action.get("route"), "action": action.get("action"), "afterState": after_state or None})
    executed_visible_keys = {(item.get("route"), item.get("action")) for item in visible if item.get("disposition") == "EXECUTED_CONTROLLED_EXERCISE"}
    for execution in executions:
        if (execution.get("route"), execution.get("uiAction")) not in executed_visible_keys:
            violations.append({"code": "ACTION_EVIDENCE_EXECUTION_NOT_VISIBLE", "route": execution.get("route"), "uiAction": execution.get("uiAction"), "action": execution.get("action")})
    return {
        "schemaVersion": "vigia.consequential-action-evidence-validation.v1",
        "state": "FAIL" if violations else "PASS",
        "visibleEnabledCount": len(visible),
        "executedCount": sum(1 for item in visible if item.get("disposition") == "EXECUTED_CONTROLLED_EXERCISE"),
        "safetyDispositionCount": sum(1 for item in visible if item.get("disposition") == "FAIL_CLOSED_SAFETY_BOUNDARY"),
        "executionCount": len(executions),
        "violations": violations,
    }


def settle(page, route: str, wait_map: bool = True) -> None:
    page.wait_for_function(
        "route => document.body.dataset.vigiaRoute === route && ['ready','degraded','error'].includes(document.body.dataset.vigiaAppState)",
        arg=route,
        timeout=35_000,
    )
    page.wait_for_function(
        "route => { const main=document.querySelector(`main[data-vigia-route=\"${route}\"]`); const state=main?.dataset.routeProjectionState; return Boolean(main) && !['LOADING','NOT_REQUESTED'].includes(state||'NOT_REQUESTED'); }",
        arg=route,
        timeout=35_000,
    )
    if wait_map and page.locator("[data-map-state]").count():
        try:
            page.wait_for_function("() => [...document.querySelectorAll('[data-map-state]')].every(node => node.dataset.mapState !== 'LOADING')", timeout=25_000)
        except PlaywrightTimeout:
            pass
    page.evaluate("async () => { await document.fonts.ready; scrollTo(0, 0); }")
    page.wait_for_timeout(350)


def map_capture_is_fully_live(states: list[dict]) -> bool:
    return bool(states) and all(
        row.get("state") == "LIVE"
        and row.get("loaded") == row.get("total")
        and row.get("failed") == 0
        and row.get("failureClass") == ""
        and row.get("retryState") == "IDLE"
        for row in states
    )


def map_capture_is_settled(states: list[dict]) -> bool:
    terminal_states = {"LIVE", "DEGRADED_PARTIAL", "STALE_LAST_GOOD", "STRUCTURED_FALLBACK", "UNAVAILABLE"}
    return bool(states) and all(row.get("state") in terminal_states for row in states)


def navigate_route(page, route: str, query: str = "") -> None:
    fragment = f"#/{route}{query}"
    page.evaluate("""target => {
      const link=!target.query?document.querySelector(`[data-route="${target.route}"]`):null;
      if(link)link.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
      else { history.pushState({vigiaRoute:true},'',`${location.pathname}${location.search}${target.fragment}`); dispatchEvent(new PopStateEvent('popstate',{state:history.state})); }
    }""", {"route": route, "query": query, "fragment": fragment})


def image_artifacts(target: Path, current: Path, overlay: Path, difference: Path, masked_difference: Path, map_mask: dict | None = None) -> dict:
    ref = Image.open(target).convert("RGB")
    actual = Image.open(current).convert("RGB")
    if ref.size != (1672, 941) or actual.size != ref.size:
        raise RuntimeError(f"visual_dimensions_invalid:{target.name}:{ref.size}:{actual.size}")
    Image.blend(ref, actual, 0.5).save(overlay)
    ref_array = np.asarray(ref, dtype=np.int16)
    actual_array = np.asarray(actual, dtype=np.int16)
    delta = np.abs(ref_array - actual_array)
    Image.fromarray(np.minimum(delta * 4, 255).astype(np.uint8)).save(difference)
    changed = np.max(delta, axis=2) > 12
    structural_delta = delta.copy()
    masked_pixels = 0
    if map_mask:
        interior = map_mask.get("interior")
        if interior:
            x0, y0, x1, y1 = interior
            volatile = np.zeros(changed.shape, dtype=bool)
            volatile[max(0, y0):min(changed.shape[0], y1), max(0, x0):min(changed.shape[1], x1)] = True
            for x0, y0, x1, y1 in map_mask.get("preservedUi", []):
                volatile[max(0, y0):min(changed.shape[0], y1), max(0, x0):min(changed.shape[1], x1)] = False
            structural_delta[volatile] = 0
            masked_pixels = int(volatile.sum())
    structural_changed = np.max(structural_delta, axis=2) > 12
    Image.fromarray(np.minimum(structural_delta * 4, 255).astype(np.uint8)).save(masked_difference)
    points = np.argwhere(changed)
    bbox = None
    if points.size:
        y0, x0 = points.min(axis=0).tolist()
        y1, x1 = points.max(axis=0).tolist()
        bbox = {"x": int(x0), "y": int(y0), "width": int(x1 - x0 + 1), "height": int(y1 - y0 + 1)}
    return {
        "targetSha256": sha256(target),
        "currentSha256": sha256(current),
        "dimensions": {"width": ref.width, "height": ref.height},
        "pixelDifference": {
            "thresholdPerChannel": 12,
            "changedPixels": int(changed.sum()),
            "changedPixelRatio": float(changed.mean()),
            "meanAbsoluteError": float(delta.mean()),
            "rootMeanSquareError": float(np.sqrt(np.mean(np.square(delta.astype(np.float64))))),
            "changedBoundingBox": bbox,
        },
        "maskedStructuralDifference": {
            "policy": "Only volatile basemap and thermal raster pixels inside the rendered tile grid are excluded. Runtime controls, status, legends, labels, markers, and map chrome are explicitly preserved.",
            "maskedPixels": masked_pixels,
            "changedPixels": int(structural_changed.sum()),
            "changedPixelRatio": float(structural_changed.mean()),
            "meanAbsoluteError": float(structural_delta.mean()),
        },
    }


def map_mask_report(page) -> dict | None:
    return page.evaluate("""() => {
      const grid=document.querySelector('.maplibregl-canvas'); if(!grid)return null;
      const box=node=>{const r=node.getBoundingClientRect();return [Math.floor(r.left),Math.floor(r.top),Math.ceil(r.right),Math.ceil(r.bottom)]};
      const preserved=[...document.querySelectorAll('.canonical-map__controls,.canonical-map__tools,.canonical-map__zoom,.canonical-map__legend,.tile-map__marker,.tile-map__source,.tile-map__north,.tile-map__wind-callout,.tile-map__scale')].filter(node=>{const r=node.getBoundingClientRect();return r.width>0&&r.height>0}).map(box);
      return {interior:box(grid),preservedUi:preserved};
    }""")


def map_transport_report(page) -> list[dict]:
    return page.locator('[data-map-state]').evaluate_all("""maps => maps.map(map => ({
      state:map.dataset.mapState,owner:map.closest('[data-map-scene-owner]')?.dataset.mapSceneOwner,sceneType:map.dataset.mapSceneType,
      sceneIdentity:map.dataset.mapSceneIdentity,bbox:map.dataset.mapBbox,center:map.dataset.mapCenter,zoom:Number.isFinite(Number(map.dataset.mapZoom))?Number(map.dataset.mapZoom):null,requestedZoom:Number.isFinite(Number(map.dataset.mapRequestedZoom))?Number(map.dataset.mapRequestedZoom):null,
      declaredLayers:(map.dataset.mapDeclaredLayers||'').split(',').filter(Boolean),visibleLayers:(map.dataset.mapVisibleLayers||'').split(',').filter(Boolean),
      layerTruth:(()=>{try{return JSON.parse(map.dataset.mapLayerTruth||'{}')}catch{return {parseError:true}}})(),
      renderedFeatures:(()=>{try{return JSON.parse(map.dataset.mapConfig||'{}')?.features?.features?.map(feature=>({layer:feature?.properties?.layer||null,authoritative:feature?.properties?.authoritative===true,geometryType:feature?.geometry?.type||null}))||[]}catch{return []}})(),
      loaded:Number.isFinite(Number(map.dataset.mapLoadedTileCount))?Number(map.dataset.mapLoadedTileCount):null,failed:Number.isFinite(Number(map.dataset.mapFailedTileCount))?Number(map.dataset.mapFailedTileCount):null,total:Number.isFinite(Number(map.dataset.mapTotalTileCount))?Number(map.dataset.mapTotalTileCount):null,failureClass:map.dataset.mapFailureClass,
      retryState:map.dataset.mapRetryState,retryCount:Number.isFinite(Number(map.dataset.mapRetryCount))?Number(map.dataset.mapRetryCount):null,sourceState:map.dataset.mapSourceState,lastGoodAt:map.dataset.mapLastGoodAt||null,
      assets:[...map.querySelectorAll('img[data-map-source]')].map(image=>{const url=new URL(image.dataset.mapSource,location.origin);const parts=url.pathname.split('/');return {requestPath:url.pathname,kind:image.dataset.basemapLayer||image.dataset.mapOverlay||'unknown',z:Number(parts.at(-3)),x:Number(parts.at(-2)),y:Number(parts.at(-1)),state:image.dataset.mapImageState||'pending',httpStatus:Number(image.dataset.mapHttpStatus)||null,timeout:image.dataset.mapTimeout==='true',mime:image.dataset.mapMime||null,bytes:Number(image.dataset.mapBytes)||null,cache:image.dataset.mapCacheState||null,durationMs:Number(image.dataset.mapDurationMs)||null,lastGoodAvailable:image.dataset.mapLastGoodAvailable==='true',failureClass:image.dataset.mapFailureClass||null}})
    }))""")


def dom_report(page) -> dict:
    return page.evaluate("""() => {
      const html=document.documentElement, main=document.querySelector('main');
      const visible=node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'};
      const capabilityContracts={
        crisisAutopilot:['[data-vqa="crisis.autopilot"]','VIGIA is doing now'],valueOfInformation:['[data-vqa="crisis.value-of-information"]','Best next collection action'],livingIncidentTwin:['[data-vqa="crisis.living-twin-axis"]','Projection time'],decisionCompression:['[data-vqa="crisis.decision-row"]','Decision deadline'],regretRadar:['[data-vqa="crisis.decision-row"]','Recommended next action'],decisionHalfLife:['[data-vqa="crisis.decision-row"]','Valid until'],uncertaintyBudget:['[data-vqa="crisis.uncertainty-item"]','Decision impact'],sentinel:['[data-vqa="crisis.global-sentinel"]','Unknown-unknown sentinel'],
        dynamicExposureGraph:['[data-vqa="crisis.exposure-node"],[data-vqa="crisis.exposure-edge"]','point proximity'],crisisDependencyGraph:['[data-vqa="crisis.dependency-edge"]','Activation condition'],modelDisagreement:['[data-vqa="crisis.model-disagreement"]','values not averaged'],realityReconciliation:['[data-vqa="crisis.reality-reconciliation"]','expected-versus-observed'],
        commandByIntent:['[data-vqa="operations.command-intent"]','Command intent'],operationalPeriodGenerator:['[data-vqa="crisis.planning-proposal"][data-proposal-type="OPERATIONAL_PERIOD"]','Operational period'],responseCapability:['[data-vqa="crisis.response-facility"]','Current capacity'],resourceOptimizerOutput:['[data-vqa="crisis.planning-proposal"][data-proposal-type="RESOURCE_RECOMMENDATION"]','Resource optimizer'],autonomousReplanning:['[data-vqa="crisis.planning-proposal"][data-proposal-type="AUTONOMOUS_REPLAN"]','Autonomous replan'],evacuationCorridor:['[data-vqa="crisis.evacuation-corridor"]','no order issued'],protectionTimeline:['[data-vqa="crisis.protection-timeline"]','Protection timeline'],capLifecycle:['[data-vqa="crisis.protection-message"]','live send'],multilingualComposer:['[data-vqa="crisis.protection-message"]','Only canonical or attributable supplied text'],
        actionOutcomeLedger:['[data-vqa="crisis.outcome-learning"]','Action → expected condition → observed condition → outcome → lesson'],nearMiss:['[data-vqa="crisis.near-miss"]','Near miss'],prevention:['[data-vqa="crisis.prevention"]','Prevention opportunity']
      };
      const capabilities=Object.fromEntries(Object.entries(capabilityContracts).map(([name,[selector,requiredText]])=>{const nodes=[...document.querySelectorAll(selector)].filter(visible),content=nodes.map(node=>(node.textContent||'').trim()).join(' ').slice(0,4000),matchingNode=nodes.flatMap(node=>[node,...node.querySelectorAll('h2,h3,small,strong,p,dt,dd')]).find(node=>(node.textContent||'').trim().toLocaleLowerCase().includes(requiredText.toLocaleLowerCase())),datasetState=Object.entries(nodes[0]?.dataset??{}).find(([key])=>/(state|classification)$/i.test(key))?.[1],projectedState=(datasetState||matchingNode?.closest('article,section')?.querySelector('.vigia-state-label span')?.textContent||nodes[0]?.querySelector('.vigia-state-label span')?.textContent||'VISIBLE_FEATURE_CONTENT').trim(),contentMatch=Boolean(matchingNode||(nodes.length&&datasetState&&content.length>=20));return[name,{selector,requiredText,visibleCount:nodes.length,textLength:content.length,contentMatch,featureSpecificNode:Boolean(nodes.length&&nodes.every(node=>node.dataset.vqa)),matchedText:(matchingNode?.textContent||content).trim().slice(0,500),projectedState,content}]}));
      const controls=[...document.querySelectorAll('button,a[href],input,select,textarea,summary')].filter(visible);
      const unnamed=controls.filter(node=>!((node.getAttribute('aria-label')||node.getAttribute('title')||node.textContent||node.getAttribute('placeholder')||'').trim()));
      const ids=[...document.querySelectorAll('[id]')].map(node=>node.id);
      return {viewport:{width:innerWidth,height:innerHeight},route:document.body.dataset.vigiaRoute,appState:document.body.dataset.vigiaAppState,
        document:{clientWidth:html.clientWidth,scrollWidth:html.scrollWidth,clientHeight:html.clientHeight,scrollHeight:html.scrollHeight},
        main:{clientWidth:main?.clientWidth??null,scrollWidth:main?.scrollWidth??null,clientHeight:main?.clientHeight??null,scrollHeight:main?.scrollHeight??null},
        capabilities,
        horizontalOverflowPx:Math.max(0,html.scrollWidth-html.clientWidth),semantics:{mainCount:document.querySelectorAll('main').length,h1Count:document.querySelectorAll('h1').length,primaryNavLinks:document.querySelectorAll('.sidebar__nav--primary a').length,unnamedControlCount:unnamed.length,duplicateIds:[...new Set(ids.filter((id,index)=>ids.indexOf(id)!==index))]},
        routeNumbers:[...document.querySelectorAll('.sidebar__nav--primary a,.topbar h1')].filter(node=>/^\\s*0?\\d+[.\\s]/.test(node.textContent||'')).map(node=>node.textContent.trim()),
        actions:controls.filter(node=>node.dataset.action).map(node=>({action:node.dataset.action,label:(node.getAttribute('aria-label')||node.textContent||node.getAttribute('title')||'').trim().replace(/\\s+/g,' ').slice(0,240),disabled:Boolean(node.disabled||node.getAttribute('aria-disabled')==='true'),disabledReason:(node.dataset.disabledReason||node.getAttribute('aria-description')||node.getAttribute('title')||'').trim().replace(/\\s+/g,' ').slice(0,500)})),
        genericInspectControls:controls.filter(node=>(node.textContent||'').trim().toLowerCase()==='inspect').map(node=>node.outerHTML.slice(0,240)),
        removedPrimaryRoutes:[...document.querySelectorAll('.sidebar__nav--primary a')].filter(node=>/Evidence|Authority|Control Plane/.test(node.textContent||'')).map(node=>node.textContent.trim())};
    }""")


def geometry_report(page, route: str) -> dict:
    selectors = {"sidebar": ".sidebar", "topbar": ".topbar", "main": "main", **LANDMARKS[route]}
    return page.evaluate("""selectors => Object.fromEntries(Object.entries(selectors).map(([name,selector])=>{
      const node=document.querySelector(selector),r=node?.getBoundingClientRect();
      return [name,{selector,present:Boolean(node),box:r?{x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height),right:Math.round(r.right),bottom:Math.round(r.bottom)}:null}];
    }))""", selectors)


def style_report(page, route: str) -> dict:
    selectors = {"body": "body", "sidebar": ".sidebar", "topbar": ".topbar", "main": "main", **LANDMARKS[route]}
    return page.evaluate("""selectors => ({tokens:{canvas:getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim(),surface:getComputedStyle(document.documentElement).getPropertyValue('--surface').trim(),text:getComputedStyle(document.documentElement).getPropertyValue('--text').trim(),signal:getComputedStyle(document.documentElement).getPropertyValue('--vigia-red').trim(),sidebar:getComputedStyle(document.documentElement).getPropertyValue('--sidebar').trim()},nodes:Object.fromEntries(Object.entries(selectors).map(([name,selector])=>{const node=document.querySelector(selector);if(!node)return[name,null];const s=getComputedStyle(node);return[name,{selector,display:s.display,backgroundColor:s.backgroundColor,color:s.color,borderColor:s.borderColor,borderRadius:s.borderRadius,boxShadow:s.boxShadow,fontFamily:s.fontFamily,fontSize:s.fontSize,fontWeight:s.fontWeight,overflow:s.overflow}]}))})""", selectors)


def interactions(page, origin: str, output: Path) -> dict:
    result = {}
    evidence = output / "interaction-evidence"
    evidence.mkdir(parents=True, exist_ok=True)

    def screenshot(name: str) -> None:
        page.screenshot(path=str(evidence / name), full_page=False, animations="disabled")

    def drag_map(route: str) -> dict:
        page.set_viewport_size(VIEWPORT)
        navigate_route(page, route)
        settle(page, route)
        map_node = page.locator(".tile-map").first
        map_node.scroll_into_view_if_needed()
        page.wait_for_timeout(100)
        before = {
            "center": map_node.get_attribute("data-map-center"),
            "instance": map_node.get_attribute("data-map-instance-id"),
            "mounts": map_node.get_attribute("data-map-mount-count"),
            "destroys": map_node.get_attribute("data-map-destroy-count"),
            "styleReloads": map_node.get_attribute("data-map-style-reload-count"),
        }
        screenshot(f"map-drag-{route}-before.png")
        box = map_node.bounding_box()
        if box is None:
            return {"pass": False, "before": before, "after": None}
        start = {"x": min(box["x"] + box["width"] * .58, VIEWPORT["width"] - 100), "y": min(box["y"] + box["height"] * .42, VIEWPORT["height"] - 100)}
        page.mouse.move(start["x"], start["y"])
        page.mouse.down()
        page.mouse.move(start["x"] - 170, start["y"] - 35, steps=12)
        page.mouse.up()
        page.wait_for_timeout(800)
        after = {
            "center": map_node.get_attribute("data-map-center"),
            "instance": map_node.get_attribute("data-map-instance-id"),
            "mounts": map_node.get_attribute("data-map-mount-count"),
            "destroys": map_node.get_attribute("data-map-destroy-count"),
            "styleReloads": map_node.get_attribute("data-map-style-reload-count"),
            "reason": map_node.get_attribute("data-map-camera-change-reason"),
        }
        screenshot(f"map-drag-{route}-after.png")
        return {
            "pass": before["center"] != after["center"] and before["instance"] == after["instance"] and after["destroys"] == "0" and after["styleReloads"] == "0" and after["reason"] in {"native-moveend", "programmatic-moveend"},
            "before": before,
            "after": after,
        }

    page.set_viewport_size({"width": 390, "height": 844})
    navigate_route(page, "command-overview")
    settle(page, "command-overview", False)
    menu = page.locator('.topbar__menu[data-action="toggle-nav"]')
    menu.focus(); menu.press("Enter"); page.wait_for_timeout(100)
    result["keyboardDrawerOpen"] = page.locator("body.nav-open").count() == 1
    page.keyboard.press("Escape"); page.wait_for_timeout(100)
    result["keyboardDrawerEscapeClose"] = page.locator("body.nav-open").count() == 0
    page.set_viewport_size(VIEWPORT)
    navigate_route(page, "command-overview"); settle(page, "command-overview")
    screenshot("command-ready.png")
    command_values_before = page.locator(".overview-metrics").inner_text()
    page.get_by_role("button", name="Refresh canonical projections").click()
    refreshed_metrics = page.locator(".overview-metrics")
    result["warmRefreshRetainsContent"] = refreshed_metrics.is_visible() and bool(refreshed_metrics.inner_text().strip()) and "Refreshing" in page.locator(".topbar").inner_text()
    screenshot("command-warm-refresh.png")
    settle(page, "command-overview")
    command_priority = page.locator('.priority-items [data-action^="focus-incident:"]').first
    command_id = (command_priority.get_attribute("data-action") or "").split(":", 1)[-1] if command_priority.count() else ""
    if command_id:
        command_priority.click(); page.wait_for_function("id => document.querySelector('.tile-map')?.dataset.mapSelectedIncident === id", arg=command_id, timeout=10_000)
    result["commandPrioritySelectsIncident"] = bool(command_id) and page.locator(f'.tile-map[data-map-selected-incident="{command_id}"][data-map-focus-incident="{command_id}"]').count() == 1

    # Exercise a real provider interruption after a last-good map exists, then
    # prove the scoped retry recovers without reloading the application.
    page.route("**/backend/api/v1/basemap/**", lambda route: route.abort("failed"))
    retry = page.locator('[data-action="map-recover"]').first
    retry.evaluate("node => { node.hidden=false; }"); retry.click()
    page.wait_for_function("() => ['STALE_LAST_GOOD','DEGRADED_PARTIAL','STRUCTURED_FALLBACK'].includes(document.querySelector('.tile-map')?.dataset.mapState)", timeout=30_000)
    degraded_state = page.locator('.tile-map').get_attribute('data-map-state')
    page.unroute("**/backend/api/v1/basemap/**")
    page.locator('[data-action="map-recover"]').first.click()
    page.wait_for_function("() => document.querySelector('.tile-map')?.dataset.mapState === 'LIVE'", timeout=30_000)
    result["mapProviderFailureVisible"] = degraded_state in {"STALE_LAST_GOOD", "DEGRADED_PARTIAL", "STRUCTURED_FALLBACK"}
    screenshot("command-provider-degraded-last-good.png")
    result["mapProviderRecoveryWithoutReload"] = page.locator('.tile-map[data-map-state="LIVE"][data-map-retry-count="2"]').count() == 1
    screenshot("command-provider-recovered.png")

    navigate_route(page, "incidents"); settle(page, "incidents")
    selected_chain = []
    selected_c = ""
    selected_label = ""
    for row_index in range(3):
        row = page.locator('.incident-table__row').nth(row_index)
        action = row.get_attribute("data-action") or ""
        incident_id = action.split(":", 1)[-1] if ":" in action else ""
        selected_c = incident_id
        selected_label = row.locator('.incident-identity strong').inner_text().strip()
        row.focus(); row.press("Enter")
        page.wait_for_function("id => document.querySelector('.tile-map')?.dataset.mapSelectedIncident === id", arg=incident_id, timeout=10_000)
        selected_chain.append(page.locator(f'.incident-table__row[data-action="focus-incident:{incident_id}"][aria-selected="true"]').count() == 1 and page.locator(f'.tile-map[data-map-selected-incident="{incident_id}"][data-map-focus-incident="{incident_id}"]').count() == 1)
    result["incidentKeyboardSelection"] = all(selected_chain) and len(selected_chain) == 3
    result["incidentMapSelectionABC"] = all(selected_chain) and page.locator(f'.tile-map[data-map-selected-incident="{selected_c}"]').count() == 1
    result["incidentControls"] = page.locator('.incidents-toolbar input,.incidents-toolbar [role="combobox"]').count() == 4
    page.get_by_role("button", name="Incident page 2", exact=True).click(); page.wait_for_timeout(120)
    result["incidentPagination"] = page.locator('.pagination [aria-current="page"]').inner_text().strip() == "2"
    page.get_by_role("button", name="Incident page 1", exact=True).click(); page.wait_for_timeout(120)
    search_value = page.locator('.incident-table__row').first.locator('.incident-identity strong').inner_text().strip()
    search = page.locator('[data-input="incident-search"]'); search.fill(search_value); page.wait_for_timeout(120)
    result["incidentSearchFilter"] = 0 < page.locator('.incident-table__row').count() <= 7
    search.fill("zzzz-no-canonical-match"); page.wait_for_function("value => document.querySelectorAll('.incident-table__row').length === 0 && document.querySelector('.incident-inventory')?.textContent?.includes(value)", arg="zzzz-no-canonical-match", timeout=5_000)
    result["incidentNoMatchTruth"] = page.locator('.incident-table__row').count() == 0 and "zzzz-no-canonical-match" in page.locator('.incident-inventory').inner_text()
    screenshot("incidents-no-match.png")
    search.fill(""); page.wait_for_timeout(120)
    screenshot("incidents-after-clear.png")

    navigate_route(page, "incident-detail"); settle(page, "incident-detail", False)
    page.wait_for_function("""expected => {
      const map=document.querySelector('.tile-map'),label=document.querySelector('.selected-incident-card h2')?.textContent?.trim();
      return map?.dataset.mapSelectedIncident===expected.id && map?.dataset.mapFocusIncident===expected.id && label===expected.label;
    }""", arg={"id":selected_c,"label":selected_label}, timeout=35_000)
    result["incidentDetailCarriesSelectionC"] = page.locator(f'.tile-map[data-map-selected-incident="{selected_c}"][data-map-focus-incident="{selected_c}"]').count() == 1 and page.locator('.selected-incident-card h2').inner_text().strip() == selected_label
    page.get_by_role("button", name="Evidence").click(); page.wait_for_timeout(100)
    result["incidentContextualEvidence"] = page.locator('.incident-assessment h2').inner_text() == "Evidence in context"
    navigate_route(page, "intelligence"); settle(page, "intelligence", False)
    page.wait_for_function("""id => {
      const map=document.querySelector('.tile-map');return map?.dataset.mapSelectedIncident===id && map?.dataset.mapFocusIncident===id;
    }""", arg=selected_c, timeout=35_000)
    result["intelligenceCarriesSelectionC"] = page.locator(f'.tile-map[data-map-selected-incident="{selected_c}"][data-map-focus-incident="{selected_c}"]').count() == 1
    navigate_route(page, "operations"); settle(page, "operations", False)
    page.wait_for_function("label => document.querySelector('.operations-context')?.textContent?.includes(label)", arg=selected_label, timeout=35_000)
    result["operationsCarriesSelectionC"] = selected_label in page.locator('.operations-context').inner_text()
    operation_select = page.get_by_role("combobox", name="Incident")
    operation_select.click(); page.wait_for_timeout(100)
    result["operationsIncidentSelector"] = operation_select.get_attribute("aria-expanded") == "true" and page.get_by_placeholder("Search name or locality").count() == 1
    screenshot("operations-incident-selector-open.png")
    page.keyboard.press("Escape")
    page.locator('.operation-lane', has_text="Waiting on Reality").click(); page.wait_for_timeout(100)
    result["operationsLaneFilter"] = page.locator('.operation-lane[aria-pressed="true"] strong').inner_text() == "Waiting on Reality"
    navigate_route(page, "reports-analytics"); settle(page, "reports-analytics", False)
    report_panels = []
    for tab_name, slug in [("Decision Summary", "summary"), ("Outcomes", "outcomes"), ("System Performance", "performance"), ("Situation Quality", "quality")]:
        page.get_by_role("tab", name=tab_name).click(); page.wait_for_timeout(100)
        panel = page.locator(f"#report-panel-{slug}")
        report_panels.append(panel.inner_text())
        screenshot(f"reports-{slug}.png")
    result["reportsSectionControl"] = page.get_by_role("tab", name="Situation Quality").get_attribute("aria-selected") == "true" and len(set(report_panels)) == 4
    navigate_route(page, "global-awareness"); settle(page, "global-awareness")
    result["globalFilters"] = page.locator('.global-filters [role="combobox"]').count() == 5
    world_map = page.locator('.tile-map').first
    world_scene = world_map.get_attribute('data-map-scene-identity') or ''
    initial_center = [float(value) for value in (world_map.get_attribute('data-map-center') or '').split(',') if value]
    initial_zoom = float(world_map.get_attribute('data-map-zoom') or 'nan')
    result["globalWorldCamera"] = world_scene == "GLOBAL_AWARENESS:world" and initial_zoom <= 2 and len(initial_center) == 2 and abs(initial_center[0]) < .01 and -5 < initial_center[1] < 35
    page.locator('[data-action="map-zoom-in"]').click(); page.wait_for_timeout(1_000)
    zoomed_zoom = float(world_map.get_attribute('data-map-zoom') or 'nan')
    result["globalZoomControl"] = zoomed_zoom > initial_zoom
    page.locator('[data-action="map-reset-world"]').click(); page.wait_for_timeout(1_000)
    reset_center = [float(value) for value in (page.locator('.tile-map').get_attribute('data-map-center') or '').split(',') if value]
    reset_zoom = float(page.locator('.tile-map').get_attribute('data-map-zoom') or 'nan')
    result["globalWorldReset"] = len(reset_center) == 2 and abs(reset_center[0]) < .01 and -5 < reset_center[1] < 35 and reset_zoom <= 2 and "?" not in page.url.split("#", 1)[-1]
    global_document_before = page.evaluate("() => ({timeOrigin:performance.timeOrigin,navigationEntries:performance.getEntriesByType('navigation').length,identity:document.querySelector('#app')?.dataset.documentIdentity,mounts:document.querySelector('#app')?.dataset.applicationMountCount})")
    global_map_before = world_map.evaluate("node => ({instance:node.dataset.mapInstanceId,mounts:node.dataset.mapMountCount,destroys:node.dataset.mapDestroyCount,styleReloads:node.dataset.mapStyleReloadCount,center:node.dataset.mapCenter})")
    screenshot("global-before-filter.png")
    status_select = page.get_by_role("combobox", name="Status")
    status_select.click(); page.wait_for_timeout(100); screenshot("global-dropdown-open.png")
    page.get_by_role("option", name="Open").first.click(); page.wait_for_timeout(180)
    screenshot("global-after-filter.png")
    global_document_after = page.evaluate("() => ({timeOrigin:performance.timeOrigin,navigationEntries:performance.getEntriesByType('navigation').length,identity:document.querySelector('#app')?.dataset.documentIdentity,mounts:document.querySelector('#app')?.dataset.applicationMountCount})")
    global_map_after = world_map.evaluate("node => ({instance:node.dataset.mapInstanceId,mounts:node.dataset.mapMountCount,destroys:node.dataset.mapDestroyCount,styleReloads:node.dataset.mapStyleReloadCount,center:node.dataset.mapCenter})")
    result["globalFilterNoDocumentNavigation"] = global_document_before == global_document_after and "#/global-awareness?status=OPEN" in page.url
    result["globalFilterNoMapRemount"] = global_map_before["instance"] == global_map_after["instance"] and global_map_after["mounts"] == "1" and global_map_after["destroys"] == "0" and global_map_after["styleReloads"] == "0" and global_map_before["center"] == global_map_after["center"]
    result["mapDrag"] = {route: drag_map(route) for route in ["command-overview", "incidents", "incident-detail", "intelligence", "operations", "global-awareness"]}
    result["allMapRoutesDragWithoutRemount"] = all(item["pass"] for item in result["mapDrag"].values())

    page.set_viewport_size({"width": 836, "height": 941})
    navigate_route(page, "reports-analytics", "?view=outcomes"); settle(page, "reports-analytics", False)
    page.add_style_tag(content="html{font-size:200%!important} .vigia-state-label{letter-spacing:.12em!important;word-spacing:.16em!important}")
    screenshot("state-labels-200-percent-text-spacing.png")
    result["stateLabelsAt200Percent"] = page.locator('.vigia-state-label').evaluate_all("nodes => nodes.length > 0 && nodes.every(node => getComputedStyle(node).whiteSpace === 'nowrap' && node.scrollHeight <= node.getBoundingClientRect().height + 1)")
    page.set_viewport_size({"width": 1672, "height": 941})
    page.add_style_tag(content="html{font-size:400%!important} .vigia-state-label{letter-spacing:.12em!important;word-spacing:.16em!important}")
    screenshot("state-labels-400-percent-text-spacing.png")
    result["stateLabelsAt400Percent"] = page.locator('.vigia-state-label').evaluate_all("nodes => nodes.length > 0 && nodes.every(node => getComputedStyle(node).whiteSpace === 'nowrap' && node.scrollHeight <= node.getBoundingClientRect().height + 1)")
    navigate_route(page, "evidence"); page.wait_for_function("() => document.body.dataset.vigiaRoute === 'intelligence'", timeout=10_000)
    result["evidenceAlias"] = page.evaluate("document.body.dataset.vigiaRoute") == "intelligence"
    navigate_route(page, "control-plane"); page.wait_for_function("() => document.body.dataset.vigiaRoute === 'operations'", timeout=10_000)
    result["controlPlaneAlias"] = page.evaluate("document.body.dataset.vigiaRoute") == "operations"
    return result


def executive_interactions(page, origin: str, output: Path, identity: dict, captured_response_incident_ids: list[str] | None = None) -> dict:
    result = {}
    evidence = output / "interaction-evidence"
    evidence.mkdir(parents=True, exist_ok=True)

    def screenshot(name: str, full_page: bool = False) -> None:
        page.screenshot(path=str(evidence / name), full_page=full_page, animations="disabled")

    def action_surface(name: str, route: str) -> dict:
        actions = page.locator('[data-action]').evaluate_all("""nodes => nodes.filter(node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'}).map(node=>({action:node.dataset.action,label:(node.getAttribute('aria-label')||node.textContent||node.getAttribute('title')||'').trim().replace(/\\s+/g,' ').slice(0,240),disabled:Boolean(node.disabled||node.getAttribute('aria-disabled')==='true'),disabledReason:(node.dataset.disabledReason||node.getAttribute('aria-description')||node.getAttribute('title')||'').trim().replace(/\\s+/g,' ').slice(0,500)}))""")
        return {"name": name, "route": route, "viewport": page.viewport_size, "actions": actions}

    def controlled_action_exercise(action_surfaces: list[dict]) -> dict:
        """Exercise consequential controls only inside explicit, persisted truth boundaries."""
        started_at = datetime.now(timezone.utc)
        release_token = re.sub(r"[^a-zA-Z0-9]+", "-", str(identity.get("releaseId") or "unbound"))[-18:].strip("-")
        namespace = f"VQA-CONTROLLED-EOC-{release_token}-{started_at.strftime('%Y%m%dT%H%M%SZ')}"
        controller = f"Exercise Controller {namespace}"
        steps: list[dict] = []
        failures: list[dict] = []
        workflow_ids: list[str] = []
        recovered_periods: list[dict] = []
        period_id: str | None = None
        incident_id = ""
        primary_incident_id = ""
        exercised_incident_ids: list[str] = []
        response_review_coverage: list[dict] = []

        def wait_for_operator_hydration_idle() -> dict:
            """Start consequential proof only after canonical hydration settles."""
            idle_handle = page.wait_for_function(
                """() => {
                  const app=document.querySelector('#app');
                  const runtime=window.__VIGIA_APP_RUNTIME__;
                  const idle=app?.dataset.vigiaGlobalRefreshPending==='false'
                    && app?.dataset.vigiaIncidentLoadPending==='false'
                    && runtime?.hydrationIdle===true;
                  return idle ? {
                    at:new Date().toISOString(),
                    globalRefreshPending:app.dataset.vigiaGlobalRefreshPending,
                    incidentLoadPending:app.dataset.vigiaIncidentLoadPending,
                    hydrationIdle:true,
                    resourceState:document.body.dataset.vigiaResourceState||null,
                    route:document.body.dataset.vigiaRoute||null
                  } : false;
                }""",
                timeout=60_000,
            )
            proof = idle_handle.json_value()
            if proof.get("globalRefreshPending") != "false" or proof.get("incidentLoadPending") != "false" or proof.get("hydrationIdle") is not True:
                raise RuntimeError(f"operator_hydration_idle_contract_invalid:{json.dumps(proof, sort_keys=True)}")
            return proof

        def local_datetime(hours: float) -> str:
            # datetime-local has no offset. Generate its wall-clock value in
            # the exact timezone assigned to the browser context so parsing it
            # cannot silently shift a future deadline into the past.
            return (datetime.now(ZoneInfo(OPERATOR_TIMEZONE)) + timedelta(hours=hours)).replace(second=0, microsecond=0).strftime("%Y-%m-%dT%H:%M")

        def exact_locator(action: str):
            return page.locator(f'[data-action={json.dumps(action)}]:visible:not([disabled]):not([aria-disabled="true"])')

        def admitted_operator_fetch(path: str, method: str = "GET", payload: dict | None = None, timeout_ms: int = 12_000) -> dict:
            """Use the admitted document transport for Operator boundary calls.

            Playwright's APIRequestContext shares cookies with the page, but it
            is not a browser navigation context and therefore does not emit the
            Sec-Fetch-Site/Origin metadata required by the Operator boundary.
            Running fetch in the admitted document proves the same-origin
            contract without weakening that boundary for the certifier.
            """
            return page.evaluate(
                """async ({path, method, payload, timeoutMs}) => {
                  const controller = new AbortController();
                  const timer = setTimeout(() => controller.abort(), timeoutMs);
                  try {
                    const hasPayload = payload !== null;
                    const response = await fetch(path, {
                      method,
                      credentials: 'same-origin',
                      cache: 'no-store',
                      headers: {
                        accept: 'application/json',
                        ...(hasPayload ? {
                          'content-type': 'application/json',
                          'x-vigia-operator-intent': 'operator-console'
                        } : {})
                      },
                      body: hasPayload ? JSON.stringify(payload) : undefined,
                      signal: controller.signal
                    });
                    const text = await response.text();
                    let body = null;
                    if (text) {
                      try { body = JSON.parse(text); }
                      catch { body = {text}; }
                    }
                    return {ok: response.ok, status: response.status, body};
                  } finally {
                    clearTimeout(timer);
                  }
                }""",
                {"path": path, "method": method, "payload": payload, "timeoutMs": timeout_ms},
            )

        def period_portfolio() -> dict:
            response = admitted_operator_fetch("/backend/api/v10/operator/operational-periods")
            payload = response.get("body") if response.get("ok") else None
            if not response.get("ok") or not isinstance(payload, dict):
                raise RuntimeError(f"operational_period_preflight_failed:{response.get('status')}")
            return payload

        def abort_owned_vqa_period(target_period_id: str, target_namespace: str, reason: str) -> dict:
            response = admitted_operator_fetch(
                f"/backend/api/v10/operator/operational-periods/{urllib.parse.quote(target_period_id, safe='')}/abort-controlled-exercise",
                "POST",
                {"namespace": target_namespace, "reason": reason},
                30_000,
            )
            payload = response.get("body")
            if not response.get("ok"):
                raise RuntimeError(f"controlled_exercise_abort_failed:{response.get('status')}:{json.dumps(payload, sort_keys=True)}")
            if not isinstance(payload, dict) or payload.get("state") != "ABORTED" or payload.get("universe") != "CONTROLLED_EOC_EXERCISE":
                raise RuntimeError(f"controlled_exercise_abort_contract_invalid:{json.dumps(payload, sort_keys=True)}")
            return payload

        def open_period_controls() -> None:
            details = page.locator(".operations-period-workflow")
            if details.count():
                details.evaluate("node => node.open=true")
                page.wait_for_timeout(40)

        def locate_action(action: str):
            locator = exact_locator(action)
            if not locator.count() and action.startswith("period-"):
                open_period_controls()
                locator = exact_locator(action)
            if not locator.count():
                raise RuntimeError(f"visible_enabled_action_missing:{action}")
            return locator.first

        def record_target_surface(action: str, label: str) -> None:
            deadline = time.monotonic() + 5
            control = None
            while time.monotonic() < deadline:
                try:
                    node = locate_action(action)
                except RuntimeError as error:
                    if not str(error).startswith("visible_enabled_action_missing:"):
                        raise
                    page.wait_for_timeout(50)
                    continue
                control = node.evaluate("""node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return{action:node.dataset.action,label:(node.getAttribute('aria-label')||node.textContent||node.getAttribute('title')||'').trim().replace(/\\s+/g,' ').slice(0,240),disabled:Boolean(node.disabled||node.getAttribute('aria-disabled')==='true'),visible:node.isConnected&&r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'}}""")
                if control.get("action") == action and not control.get("disabled") and control.get("visible"):
                    action_surfaces.append({"name": f"controlled-exercise:{label}", "route": "operations", "viewport": page.viewport_size, "actions": [control]})
                    return
                page.wait_for_timeout(50)
            raise RuntimeError(f"action_surface_not_operable:{action}:{json.dumps(control, sort_keys=True)}")

        def close_overlay() -> None:
            overlay = page.locator(".vigia-overlay:visible").first
            if not overlay.count():
                return
            # Prefer the close control inside the panel.  The full-viewport
            # scrim is intentionally behind the panel, so its bounding box can
            # resolve to a point intercepted by dialog content in Playwright.
            close = overlay.locator(".vigia-overlay__panel [data-dialog-close]:visible").last
            try:
                if close.count():
                    close.click(timeout=2_000)
                else:
                    page.keyboard.press("Escape")
                overlay.wait_for(state="detached", timeout=2_000)
            except Exception:
                # Escape is the product's governed keyboard dismissal path and
                # is also safe while unwinding a failed controlled exercise.
                try:
                    page.keyboard.press("Escape")
                    overlay.wait_for(state="detached", timeout=2_000)
                except Exception:
                    pass
            page.wait_for_timeout(40)

        def fill_form(fields: dict[str, str] | None = None, radios: dict[str, str] | None = None, radio_prefixes: dict[str, str] | None = None, required_prefilled_fields: tuple[str, ...] = ()) -> str:
            form = page.locator(".vigia-overlay .domain-action-form")
            form.wait_for(state="visible", timeout=5_000)
            for field_id, field_value in (fields or {}).items():
                field = form.locator(f'[data-domain-field={json.dumps(field_id)}]:not([type="radio"])').first
                if not field.count():
                    raise RuntimeError(f"domain_field_missing:{field_id}")
                field.fill(str(field_value))
            for field_id, field_value in (radios or {}).items():
                option = form.locator(f'[data-domain-field={json.dumps(field_id)}][value={json.dumps(field_value)}]').first
                if not option.count():
                    raise RuntimeError(f"domain_radio_missing:{field_id}:{field_value}")
                option.check()
            for field_id, value_prefix in (radio_prefixes or {}).items():
                options = form.locator(f'[data-domain-field={json.dumps(field_id)}]')
                matched = None
                for index in range(options.count()):
                    if str(options.nth(index).get_attribute("value") or "").startswith(value_prefix):
                        matched = options.nth(index)
                        break
                if matched is None:
                    raise RuntimeError(f"domain_radio_prefix_missing:{field_id}:{value_prefix}")
                matched.check()
            for field_id in required_prefilled_fields:
                field = form.locator(f'[data-domain-field={json.dumps(field_id)}]:not([type="radio"])').first
                if not field.count():
                    raise RuntimeError(f"domain_prefilled_field_missing:{field_id}")
                if not str(field.input_value() or "").strip():
                    raise RuntimeError(f"domain_prefilled_field_empty:{field_id}")
            if form.evaluate("form => form.checkValidity()") is not True:
                invalid_fields = form.locator(":invalid").evaluate_all("nodes => nodes.map(node => ({field:node.dataset.domainField??node.name??node.type,value:node.value,min:node.min??null,validationMessage:node.validationMessage}))")
                raise RuntimeError(f"domain_form_native_validity_failed:{json.dumps(invalid_fields, sort_keys=True)}")
            submit = form.locator('[data-action$="-submit"], [data-action*="-submit:"]').first
            if not submit.count():
                raise RuntimeError("domain_form_submit_missing")
            submit_action = str(submit.get_attribute("data-action") or "")
            submit.click()
            return submit_action

        def refreshed_state_valid(action: str, execution: dict) -> bool:
            kind = action_kind(action)
            after_state = execution.get("canonical", {}).get("afterState")
            if not isinstance(after_state, dict):
                return False
            bound = (
                bool(after_state.get("selectedIncidentId"))
                and after_state.get("selectedIncidentId") == incident_id
                and after_state.get("incidentId") == incident_id
            )
            if kind == "response-recommendation-review":
                return response_review_execution_valid(action, execution, incident_id)
            if kind.startswith("protection-"):
                return bool(
                    bound
                    and after_state.get("scope") == "PROTECTION_WORKFLOW"
                    and after_state.get("workflowId") == execution.get("workflowId")
                    and after_state.get("state")
                    and after_state.get("universe") == "EXERCISE"
                    and after_state.get("productionTruth") is False
                )
            if kind.startswith("period-"):
                return bool(
                    bound
                    and after_state.get("scope") == "OPERATIONAL_PERIOD"
                    and after_state.get("periodId")
                    and after_state.get("state")
                    and after_state.get("universe") == "CONTROLLED_EOC_EXERCISE"
                    and isinstance(after_state.get("counts"), dict)
                )
            if kind == "command-context-initialize":
                receipt = execution.get("receipt") if isinstance(execution.get("receipt"), dict) else {}
                return bool(
                    bound
                    and after_state.get("scope") == "INCIDENT_COMMAND"
                    and receipt.get("schemaVersion") == "vigia.incident-command-import-receipt.v1"
                    and receipt.get("incidentId") == incident_id
                )
            if kind == "command-intent-create" or kind.startswith("planning-"):
                return bool(bound and after_state.get("scope") == "INCIDENT_COMMAND" and (isinstance(after_state.get("version"), int) or after_state.get("lastEventId")))
            if kind.startswith("human-attention-"):
                return bool(bound and after_state.get("scope") == "HUMAN_ATTENTION" and after_state.get("attentionId") == execution.get("workflowId") and after_state.get("state"))
            return False

        def exercise_transport_receipt_valid(action: str, execution: dict) -> bool:
            kind = action_kind(action)
            if kind not in EXERCISE_TRANSPORT_ACTION_KINDS:
                return True
            receipt = execution.get("receipt") if isinstance(execution.get("receipt"), dict) else {}
            after_state = execution.get("canonical", {}).get("afterState") if isinstance(execution.get("canonical", {}).get("afterState"), dict) else {}
            receipt_valid = (
                receipt.get("schemaVersion") == "vigia.protection-exercise-receipt.v1"
                and receipt.get("universe") == "EXERCISE"
                and receipt.get("productionTruth") is False
                and receipt.get("externalTransportInvoked") is False
                and receipt.get("deliveryMode") == "ISOLATED_EXERCISE_REPOSITORY"
            )
            if kind == "protection-expire":
                return receipt_valid
            delivery = after_state.get("delivery") if isinstance(after_state.get("delivery"), dict) else {}
            return bool(
                receipt_valid
                and delivery.get("receiptId")
                and delivery.get("deliveryMode") == "ISOLATED_EXERCISE_REPOSITORY"
                and delivery.get("externalTransportInvoked") is False
                and delivery.get("targetId")
            )

        def perform_mutation(action: str, *, label: str | None = None, form: bool = False, fields: dict[str, str] | None = None, radios: dict[str, str] | None = None, radio_prefixes: dict[str, str] | None = None, required_prefilled_fields: tuple[str, ...] = ()) -> dict:
            record_target_surface(action, label or action_kind(action))
            before_count = int(page.evaluate("() => window.__VIGIA_EXECUTIVE_UX_RUNTIME__?.actions?.length ?? 0"))
            submit_action = None
            locate_action(action).click()
            if form:
                submit_action = fill_form(fields, radios, radio_prefixes, required_prefilled_fields)
            page.wait_for_function("target => (window.__VIGIA_EXECUTIVE_UX_RUNTIME__?.actions ?? []).slice(target.count).some(item => item.uiAction === target.action && ['PASS','FAIL'].includes(item.state))", arg={"count": before_count, "action": action}, timeout=60_000)
            execution = page.evaluate("target => structuredClone((window.__VIGIA_EXECUTIVE_UX_RUNTIME__.actions ?? []).slice(target.count).findLast(item => item.uiAction === target.action))", {"count": before_count, "action": action})
            valid = (
                execution.get("uiAction") == action
                and execution.get("route") == "operations"
                and execution.get("state") == "PASS"
                and isinstance(execution.get("receipt"), dict)
                and bool(execution["receipt"].get("schemaVersion"))
                and bool(execution["receipt"].get("receiptId"))
                and bool(execution["receipt"].get("at"))
                and execution.get("canonical", {}).get("refreshCompleted") is True
                and execution.get("canonical", {}).get("beforeRevision") != execution.get("canonical", {}).get("afterRevision")
                and refreshed_state_valid(action, execution)
                and exercise_transport_receipt_valid(action, execution)
            )
            step = {"action": action, "submitAction": submit_action, "pass": valid, "execution": execution}
            steps.append(step)
            screenshot(f"controlled-action-{len(steps):02d}-{re.sub(r'[^a-zA-Z0-9_-]+', '-', action)[:110]}.png")
            if not valid:
                raise RuntimeError(f"receipt_or_canonical_refresh_invalid:{action}:{json.dumps(execution, sort_keys=True)}")
            return execution

        def exercise_cap_draft(workflow_id: str) -> None:
            encoded = urllib.parse.quote(workflow_id, safe="")
            action = f"protection-cap-draft:{encoded}"
            record_target_surface(action, "cap-draft-local-validation")
            locate_action(action).click()
            fill_form(
                {
                    "sender": controller,
                    "headline": f"{namespace} isolated exercise notice",
                    "instruction": "Controlled exercise only. No public or field action is authorized."
                },
                {"urgency": "Expected", "severity": "Severe", "certainty": "Possible"}
            )
            page.get_by_role("heading", name="Validated CAP draft").wait_for(state="visible", timeout=12_000)
            steps.append({"action": action, "pass": True, "mutation": False, "truthBoundary": "LOCAL_CAP_VALIDATION_ONLY_NO_SEND"})
            screenshot(f"controlled-action-{len(steps):02d}-cap-local-validation.png")
            close_overlay()

        def select_lane(lane: str) -> None:
            page.locator(f'[data-action="operations-tab:{lane}"]').click()
            page.wait_for_timeout(120)

        def select_context_incident(target_incident_id: str) -> None:
            nonlocal incident_id
            if target_incident_id == incident_id:
                return
            trigger = page.get_by_role("combobox", name="Incident context")
            trigger.click()
            # Incident-context actions carry the canonical incident id verbatim;
            # only recommendation/workflow suffixes use encodeURIComponent.
            action = f"select-context-incident:{target_incident_id}"
            option = exact_locator(action)
            if not option.count():
                search = page.get_by_placeholder("Search name, locality, or official ID")
                if search.count():
                    search.fill(target_incident_id)
                    page.wait_for_timeout(120)
                option = exact_locator(action)
            if not option.count():
                page.keyboard.press("Escape")
                raise RuntimeError(f"captured_response_incident_not_selectable:{target_incident_id}")
            option.first.click()
            page.wait_for_function(
                "incidentId => document.querySelector('.tile-map')?.dataset.mapSelectedIncident === incidentId",
                arg=target_incident_id,
                timeout=35_000,
            )
            wait_for_operator_hydration_idle()
            incident_id = target_incident_id

        def review_response_recommendations(target_incident_id: str) -> None:
            select_context_incident(target_incident_id)
            select_lane("response")
            response_review_actions = page.locator(
                '[data-action^="response-recommendation-review:"]:visible:not([disabled]):not([aria-disabled="true"])'
            ).evaluate_all("nodes => nodes.map(node => node.dataset.action)")
            receipt_count = page.locator('[data-response-review-receipt]:visible').count()
            if not response_review_actions and not receipt_count:
                raise RuntimeError(f"current_response_recommendation_review_or_receipt_missing:{target_incident_id}")
            reviewed_actions: list[str] = []
            for response_review_action in dict.fromkeys(str(item) for item in response_review_actions):
                perform_mutation(
                    response_review_action,
                    label="response-recommendation-review",
                    form=True,
                    fields={
                        "note": f"{namespace} deliberate review deferral; review state only, with no assignment or dispatch."
                    },
                    radios={"disposition": "DEFERRED"},
                )
                reviewed_actions.append(response_review_action)
            if target_incident_id not in exercised_incident_ids:
                exercised_incident_ids.append(target_incident_id)
            response_review_coverage.append({
                "incidentId": target_incident_id,
                "reviewedActions": reviewed_actions,
                "existingReceiptCount": receipt_count,
                "state": "PASS",
            })

        def select_workflow(workflow_id: str) -> None:
            action = f"select-operation:{workflow_id}"
            locator = exact_locator(action)
            if not locator.count():
                raise RuntimeError(f"exercise_workflow_queue_row_missing:{workflow_id}")
            locator.first.click()
            page.wait_for_function("workflowId => document.querySelector('.operation-inspector')?.dataset.operationId === workflowId", arg=workflow_id, timeout=5_000)

        def create_exercise_workflow(branch: str, *, expiry_hours: float = 5, expiry_at: str | None = None) -> str:
            select_lane("protect")
            expiry_value = expiry_at or local_datetime(expiry_hours)
            creation = perform_mutation(
                "protection-create",
                label=f"protection-create-{branch}",
                form=True,
                fields={
                    "areaDesc": f"{namespace} isolated {branch} exercise area",
                    "geocode": f"EXERCISE:{namespace}:{branch}",
                    "exposureAssessment": f"Exercise-controller supplied scenario condition for {namespace}; productionTruth=false.",
                    "protectionThreshold": f"Exercise threshold {namespace}:{branch}; not a live threshold.",
                    "recommendation": f"Exercise-only protection workflow {namespace}:{branch}; do not issue public instructions.",
                    "authorityRequirement": f"Named exercise controller approval {namespace}",
                    "authorityOwner": controller,
                    "authorityValidUntil": expiry_value,
                    "expiresAt": expiry_value,
                    "expectedPostcondition": f"Exercise inbox receipt retained for {namespace}:{branch}; no production effect.",
                    "provenanceRefs": f"exercise-controller:{namespace},exercise-scenario:{branch}"
                },
                radios={"universe": "EXERCISE"}
            )
            workflow_id = str(creation.get("workflowId") or "")
            if not workflow_id:
                raise RuntimeError(f"created_exercise_workflow_identity_missing:{branch}")
            workflow_ids.append(workflow_id)
            select_workflow(workflow_id)
            return workflow_id

        def review_and_approve(workflow_id: str) -> str:
            encoded = urllib.parse.quote(workflow_id, safe="")
            perform_mutation(f"protection-review:{encoded}")
            perform_mutation(f"protection-approve:{encoded}")
            perform_mutation(f"protection-eligible:{encoded}")
            return encoded

        def send_exercise(workflow_id: str, branch: str) -> str:
            encoded = urllib.parse.quote(workflow_id, safe="")
            perform_mutation(
                f"protection-exercise-send:{encoded}",
                form=True,
                fields={
                    "exerciseTargetId": f"exercise-inbox:{namespace}:{branch}",
                    "exerciseTargetLabel": f"Isolated VIGIA exercise inbox {namespace}",
                    "sender": controller,
                    "headline": f"{namespace} {branch} exercise message",
                    "instruction": "Exercise controller instruction only. No public or operational dispatch action."
                },
                radios={"urgency": "Expected", "severity": "Severe", "certainty": "Possible"}
            )
            return encoded

        try:
            page.set_viewport_size(VIEWPORT)
            navigate_route(page, "operations")
            settle(page, "operations", False)
            hydration_idle_proof = wait_for_operator_hydration_idle()
            context_trigger = page.get_by_role("combobox", name="Incident context")
            context_trigger.click()
            selected_option = page.locator('[data-vigia-select="incident-context"] [role="option"][aria-selected="true"]').first
            selected_action = str(selected_option.get_attribute("data-action") or "") if selected_option.count() else ""
            page.keyboard.press("Escape")
            incident_id = urllib.parse.unquote(selected_action.split(":", 1)[1]) if selected_action.startswith("select-context-incident:") else ""
            if not incident_id:
                raise RuntimeError("canonical_selected_incident_identity_missing")
            primary_incident_id = incident_id
            exercised_incident_ids.append(primary_incident_id)
            active_period = period_portfolio().get("current")
            if isinstance(active_period, dict):
                active_namespace = str(active_period.get("shift") or "")
                if active_period.get("universe") == "CONTROLLED_EOC_EXERCISE" and active_namespace.startswith("VQA-CONTROLLED-EOC-"):
                    recovered = abort_owned_vqa_period(
                        str(active_period.get("periodId") or ""),
                        active_namespace,
                        "A prior VQA browser certification run was interrupted before completing its controlled exercise.",
                    )
                    recovered_periods.append({
                        "periodId": recovered.get("periodId"),
                        "namespace": active_namespace,
                        "state": recovered.get("state"),
                        "receiptId": recovered.get("receipt", {}).get("receiptId") if isinstance(recovered.get("receipt"), dict) else None,
                    })
                    page.reload(wait_until="domcontentloaded", timeout=40_000)
                    settle(page, "operations", False)
                else:
                    raise RuntimeError(f"active_foreign_or_live_period_no_mutation_permitted:{active_period.get('periodId')}:{active_period.get('universe')}:{active_namespace}")
            if not exact_locator("period-start").count():
                period_summary = page.locator(".operations-period-context").inner_text() if page.locator(".operations-period-context").count() else "missing"
                raise RuntimeError(f"active_period_preexists_no_mutation_permitted:{period_summary}")

            # Retained interrupted exercise workflows remain governed records.
            # When one has genuinely reached expiry, certify its explicit
            # terminal transition before opening the new operational period.
            select_lane("protect")
            retained_expiry_actions = page.locator(
                '[data-action^="protection-expire:"]:visible:not([disabled]):not([aria-disabled="true"])'
            ).evaluate_all("nodes => nodes.map(node => node.dataset.action)")
            for retained_expiry_action in dict.fromkeys(str(item) for item in retained_expiry_actions):
                retained_workflow_id = urllib.parse.unquote(retained_expiry_action.split(":", 1)[1])
                if retained_workflow_id and retained_workflow_id not in workflow_ids:
                    workflow_ids.append(retained_workflow_id)
                select_workflow(retained_workflow_id)
                perform_mutation(
                    retained_expiry_action,
                    label="retained-exercise-expiry",
                    form=True,
                    fields={"reason": "A retained isolated VQA exercise workflow reached its governed expiry; productionTruth=false."},
                )

            start_execution = perform_mutation(
                "period-start",
                form=True,
                fields={
                    "shift": namespace,
                    "commander": controller,
                    "owner": controller,
                    "endsAt": local_datetime(6),
                    "participantType": "HUMAN_ROLE_PLAY",
                    "facilitator": controller,
                    "roles": f"Incident Commander = {controller}\nExercise Controller = {controller}",
                    "authorityMatrix": f"Incident Commander | Approve isolated exercise actions | {namespace}\nExercise Controller | Supply exercise observations | {namespace}"
                },
                radios={"mode": "EXERCISE"}
            )
            period_id = str(start_execution.get("canonical", {}).get("afterState", {}).get("periodId") or "")
            if not period_id:
                raise RuntimeError("controlled_exercise_period_identity_missing_after_start")
            perform_mutation("period-assign-owner", form=True, fields={"owner": controller})
            perform_mutation("period-create-objective", form=True, fields={"statement": f"Exercise the governed decision lifecycle for {namespace} without production effects.", "owner": controller, "dueAt": local_datetime(3)})
            perform_mutation("period-ack-objective", form=True, fields={"note": f"Exercise objective acknowledged by {controller}."})
            perform_mutation("period-record-tactic", form=True, fields={"statement": f"Use only the isolated VIGIA exercise inbox for {namespace}.", "owner": controller})
            perform_mutation("period-record-assignment", form=True, fields={"assignee": controller, "resourceIds": f"exercise-resource:{namespace}", "dueAt": local_datetime(3)})
            perform_mutation("period-record-resource", form=True, fields={"resource": f"SIMULATED EXERCISE RESOURCE {namespace}", "assigned": "1", "available": "0"}, radios={"state": "EXERCISE_ASSIGNED"})
            perform_mutation("period-record-authority", form=True, fields={"statement": f"Approve isolated exercise actions for {namespace}; no live authority is asserted.", "owner": controller, "authority": controller, "dueAt": local_datetime(4)}, radios={"state": "APPROVED"})

            # Use a deadline one whole minute beyond the form's native minimum,
            # assert form.checkValidity(), persist a genuine short-lived
            # EXERCISE draft, and let wall-clock time elapse before asking the
            # backend to record expiry. This exercises rather than bypasses
            # both browser and service guards.
            expire_deadline_local = local_datetime(2 / 60)
            expire_id = create_exercise_workflow("expire", expiry_at=expire_deadline_local)
            expire_encoded = urllib.parse.quote(expire_id, safe="")

            primary_id = create_exercise_workflow("primary")
            primary_encoded = review_and_approve(primary_id)
            exercise_cap_draft(primary_id)
            send_exercise(primary_id, "primary")
            perform_mutation(f"protection-exercise-ack:{primary_encoded}", form=True, fields={"source": controller}, required_prefilled_fields=("receiptId",))
            perform_mutation("period-link-protection", form=True, fields={"owner": controller, "dueAt": local_datetime(4)}, radios={"workflowId": primary_id})
            select_lane("protect")
            select_workflow(primary_id)
            perform_mutation(
                f"protection-exercise-update:{primary_encoded}",
                form=True,
                fields={
                    "exerciseTargetId": f"exercise-inbox:{namespace}:primary",
                    "exerciseTargetLabel": f"Isolated VIGIA exercise inbox {namespace}",
                    "sender": controller,
                    "headline": f"{namespace} controlled update",
                    "instruction": "Controlled exercise update only; no public or field action."
                },
                radios={"urgency": "Expected", "severity": "Severe", "certainty": "Possible"},
                required_prefilled_fields=("references",)
            )
            perform_mutation(f"protection-exercise-ack:{primary_encoded}", form=True, fields={"source": controller}, required_prefilled_fields=("receiptId",))
            perform_mutation(
                f"protection-supersede:{primary_encoded}",
                form=True,
                fields={
                    "exerciseTargetId": f"exercise-inbox:{namespace}:primary",
                    "exerciseTargetLabel": f"Isolated VIGIA exercise inbox {namespace}",
                    "replacementReference": f"exercise-replacement:{namespace}",
                    "reason": f"Exercise branch coverage for {namespace}; productionTruth=false."
                },
                required_prefilled_fields=("references",)
            )

            cancel_id = create_exercise_workflow("cancel")
            cancel_encoded = review_and_approve(cancel_id)
            send_exercise(cancel_id, "cancel")
            perform_mutation(
                f"protection-exercise-cancel:{cancel_encoded}",
                form=True,
                fields={
                    "exerciseTargetId": f"exercise-inbox:{namespace}:cancel",
                    "exerciseTargetLabel": f"Isolated VIGIA exercise inbox {namespace}",
                    "sender": controller,
                    "reason": f"Exercise-controller cancellation for {namespace}; no public effect."
                },
                required_prefilled_fields=("references",)
            )

            reject_id = create_exercise_workflow("reject")
            reject_encoded = urllib.parse.quote(reject_id, safe="")
            perform_mutation(f"protection-review:{reject_encoded}")
            perform_mutation(f"protection-reject:{reject_encoded}", form=True, fields={"reason": f"Exercise authority rejection for {namespace}."})

            expire_deadline_ms = page.evaluate("value => new Date(value).getTime()", expire_deadline_local)
            if not isinstance(expire_deadline_ms, (int, float)):
                raise RuntimeError(f"exercise_expiry_deadline_invalid:{expire_deadline_local}")
            while (time.time() * 1000) <= expire_deadline_ms + 1_000:
                page.wait_for_timeout(min(1_000, max(50, int(expire_deadline_ms + 1_001 - (time.time() * 1000)))))
            # A lane round-trip causes a fresh render at the elapsed wall-clock
            # time, making the server-permitted expiry action observable.
            select_lane("response")
            select_lane("protect")
            select_workflow(expire_id)
            perform_mutation(f"protection-expire:{expire_encoded}", form=True, fields={"reason": f"Exercise lifecycle expiry branch for {namespace}."})

            perform_mutation(
                "period-record-action",
                form=True,
                fields={
                    "statement": f"Record the isolated exercise inbox lifecycle for {namespace}.",
                    "owner": controller,
                    "source": f"EXERCISE_CONTROLLER:{namespace}",
                    "dueAt": local_datetime(3),
                    "expectedPostcondition": f"A target-bound exercise acknowledgement is retained for {namespace}; productionTruth=false.",
                    "completionCriteria": f"Exercise delivery and acknowledgement receipts exist for {namespace}; no live dispatch."
                }
            )
            perform_mutation("period-ack-item", label="ack-assignment", form=True, fields={"role": "Exercise Controller", "note": f"Assignment acknowledged in {namespace}."}, radio_prefixes={"target": "ASSIGNMENT|"})
            perform_mutation("period-ack-item", label="ack-action", form=True, fields={"role": "Exercise Controller", "note": f"Action acknowledged in {namespace}."}, radio_prefixes={"target": "ACTION|"})
            perform_mutation("period-update-assignment", form=True, fields={"reason": f"Controlled exercise assignment completed for {namespace}."}, radios={"state": "COMPLETED"})
            perform_mutation("period-update-action", form=True, fields={"reason": f"Controlled exercise action completed for {namespace}; outcome not implied."}, radios={"state": "COMPLETED"})
            perform_mutation(
                "period-record-postcondition",
                form=True,
                fields={
                    "statement": f"Exercise controller observed the isolated inbox receipt and acknowledgement for {namespace}; productionTruth=false.",
                    "observedState": "CONTROLLED_EXERCISE_RECEIPTS_RETAINED_NO_PRODUCTION_EFFECT",
                    "source": f"EXERCISE_CONTROLLER:{namespace}",
                    "observedAt": local_datetime(0)
                }
            )
            perform_mutation(
                "period-record-outcome",
                form=True,
                fields={"statement": f"Exercise workflow evidence is internally complete for {namespace}; no causal or production outcome is claimed.", "evidenceIds": f"exercise-controller:{namespace}"},
                radios={"classification": "INCONCLUSIVE", "causalClaim": "NOT_ESTABLISHED"}
            )
            perform_mutation("period-record-lesson", form=True, fields={"statement": f"Retain isolated delivery receipt checks in every {namespace} exercise review.", "owner": controller, "dueAt": local_datetime(5)})
            perform_mutation("period-begin-handoff", form=True, fields={"from": controller, "to": f"Incoming Exercise Controller {namespace}"})
            perform_mutation("period-close", form=True, fields={"summary": f"{namespace} completed as a CONTROLLED_EOC_EXERCISE. All observations were exercise-controller supplied; productionTruth=false; no external send or dispatch occurred."})
            period_id = None

            response_incident_targets = [primary_incident_id]
            for captured_incident_id in captured_response_incident_ids or []:
                if captured_incident_id and captured_incident_id not in response_incident_targets:
                    response_incident_targets.append(captured_incident_id)
            for response_incident_id in response_incident_targets:
                review_response_recommendations(response_incident_id)
            select_context_incident(primary_incident_id)
            # Recommendation review leaves Operations on the Response lane.
            # Command context and planning controls are owned by Verification
            # operations, so restore that lane before certifying them.
            select_lane("resolution")

            if page.locator('[data-action="command-context-initialize"]:visible:not([disabled])').count():
                perform_mutation(
                    "command-context-initialize",
                    form=True,
                    radios={"exerciseBoundary": "INITIALIZE_SHADOW_CONTEXT"},
                )

            planning_apply_actions_before = set(page.locator('[data-action^="planning-approved-apply:"]:visible:not([disabled])').evaluate_all("nodes => nodes.map(node => node.dataset.action)"))
            perform_mutation(
                "command-intent-create",
                form=True,
                fields={"statement": f"Prepare a planning-only operational period for {namespace}; do not assign, dispatch, warn, or claim execution.", "target": f"planning-target:{namespace}", "owner": controller, "periodStart": local_datetime(1), "periodEnd": local_datetime(3), "deadline": local_datetime(4)},
                radios={"intentType": "PREPARE_PROTECTION_DRAFT"}
            )
            review_actions = page.locator('[data-action^="planning-proposal-review:"]:visible:not([disabled])').evaluate_all("nodes => nodes.map(node => node.dataset.action)")
            if not any(action == "planning-proposal-review:OPERATIONAL_PERIOD" for action in review_actions):
                raise RuntimeError(f"operational_period_planning_proposal_not_reviewable:{review_actions}")
            for review_action in review_actions:
                proposal_type = review_action.split(":", 1)[1]
                perform_mutation(review_action, form=True, fields={"reason": f"{namespace} planning-only review for {proposal_type}; no dispatch or execution."}, radios={"decision": "APPROVE_FOR_PLANNING"})
            apply_actions_after = set(page.locator('[data-action^="planning-approved-apply:"]:visible:not([disabled])').evaluate_all("nodes => nodes.map(node => node.dataset.action)"))
            run_apply_actions = sorted(apply_actions_after - planning_apply_actions_before)
            if len(run_apply_actions) != len(review_actions):
                raise RuntimeError(f"run_bound_approved_planning_application_controls_incomplete:reviewed={sorted(review_actions)}:before={sorted(planning_apply_actions_before)}:after={sorted(apply_actions_after)}:new={run_apply_actions}")
            for apply_action in run_apply_actions:
                perform_mutation(
                    apply_action,
                    form=True,
                    radio_prefixes={"applicationBoundary": "APPLY_REVIEWED_"},
                )

            select_lane("resolution")
            attention_action = None
            queue_rows = page.locator(".operation-queue-row")
            for index in range(queue_rows.count()):
                queue_rows.nth(index).click()
                page.wait_for_timeout(40)
                candidates = page.locator('[data-action^="human-attention-"]:visible:not([disabled])')
                if candidates.count():
                    attention_action = str(candidates.first.get_attribute("data-action") or "")
                    break
            if attention_action:
                suffix = attention_action.split(":", 1)[1]
                if attention_action.startswith("human-attention-assume:"):
                    perform_mutation(attention_action)
                perform_mutation(f"human-attention-reassign:{suffix}", form=True, fields={"owner": controller})
                perform_mutation(f"human-attention-escalate:{suffix}", form=True, fields={"reason": f"Controlled work-state escalation exercise {namespace}; incident truth unchanged."})
                perform_mutation(f"human-attention-release:{suffix}")
                if not attention_action.startswith("human-attention-assume:"):
                    perform_mutation(f"human-attention-assume:{suffix}")
                    perform_mutation(f"human-attention-release:{suffix}")

            completed_at = datetime.now(timezone.utc)
            result = {
                "schemaVersion": "vigia.controlled-eoc-browser-action-exercise.v1",
                "pass": True,
                "startedAt": started_at.isoformat().replace("+00:00", "Z"),
                "completedAt": completed_at.isoformat().replace("+00:00", "Z"),
                "namespace": namespace,
                "incidentId": primary_incident_id,
                "incidentIds": exercised_incident_ids,
                "responseReviewCoverage": response_review_coverage,
                "universe": "CONTROLLED_EOC_EXERCISE",
                "productionTruth": False,
                "externalSendAttempted": False,
                "exerciseTransport": "ISOLATED_VIGIA_EXERCISE_INBOX_ONLY",
                "exerciseObservationSource": f"EXERCISE_CONTROLLER:{namespace}",
                "hydrationIdleProof": hydration_idle_proof,
                "workflowIds": workflow_ids,
                "recoveredInterruptedPeriods": recovered_periods,
                "steps": steps,
                "failures": failures,
            }
            (evidence / "controlled-action-exercise.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
            return result
        except Exception as error:
            close_overlay()
            failures.append({"code": "CONTROLLED_ACTION_EXERCISE_FAILED", "error": str(error), "stepCount": len(steps)})
            if period_id:
                try:
                    aborted = abort_owned_vqa_period(
                        period_id,
                        namespace,
                        "The current VQA browser certification run failed before completing its controlled exercise.",
                    )
                    failures.append({
                        "code": "CONTROLLED_ACTION_EXERCISE_ABORTED_SAFELY",
                        "periodId": aborted.get("periodId"),
                        "state": aborted.get("state"),
                        "receiptId": aborted.get("receipt", {}).get("receiptId") if isinstance(aborted.get("receipt"), dict) else None,
                    })
                except Exception as abort_error:
                    failures.append({"code": "CONTROLLED_ACTION_EXERCISE_ABORT_FAILED", "error": str(abort_error), "periodId": period_id})
            screenshot("controlled-action-exercise-failure.png", True)
            result = {
                "schemaVersion": "vigia.controlled-eoc-browser-action-exercise.v1",
                "pass": False,
                "startedAt": started_at.isoformat().replace("+00:00", "Z"),
                "completedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "namespace": namespace,
                "incidentId": primary_incident_id or incident_id or None,
                "incidentIds": exercised_incident_ids,
                "responseReviewCoverage": response_review_coverage,
                "universe": "CONTROLLED_EOC_EXERCISE",
                "productionTruth": False,
                "externalSendAttempted": False,
                "exerciseTransport": "ISOLATED_VIGIA_EXERCISE_INBOX_ONLY",
                "hydrationIdleProof": locals().get("hydration_idle_proof"),
                "workflowIds": workflow_ids,
                "recoveredInterruptedPeriods": recovered_periods,
                "steps": steps,
                "failures": failures,
            }
            (evidence / "controlled-action-exercise.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
            return result

    page.evaluate("""() => {
      const runtime=window.__VIGIA_EXECUTIVE_UX_RUNTIME__;
      if(!runtime)throw new Error('executive_runtime_telemetry_unavailable');
      runtime.actions=[];runtime.unknownActions=[];
    }""")

    def map_snapshot(node) -> dict:
        return node.evaluate("node => ({instance:node.dataset.mapInstanceId,mounts:node.dataset.mapMountCount,destroys:node.dataset.mapDestroyCount,styleReloads:node.dataset.mapStyleReloadCount,sourceUpdates:node.dataset.mapSourceUpdateCount,center:node.dataset.mapCenter,zoom:node.dataset.mapZoom,pointerToFirstPaintMs:Number.isFinite(Number(node.dataset.mapPointerToFirstPaintMs))?Number(node.dataset.mapPointerToFirstPaintMs):null,nativeDrag:node.dataset.mapNativeDrag,routeRendersDuringDrag:Number(node.dataset.mapRouteRendersDuringDrag||0),renderer:node.dataset.mapRenderer,engine:node.dataset.mapEngine,engineVersion:node.dataset.mapEngineVersion})")

    def drag_map(route: str) -> dict:
        page.set_viewport_size(VIEWPORT); navigate_route(page, route)
        try:
            settle(page, route)
        except PlaywrightTimeout as error:
            diagnostic = page.evaluate("""expected => ({expected,href:location.href,route:document.body.dataset.vigiaRoute||null,appState:document.body.dataset.vigiaAppState||null,mainState:document.querySelector('main')?.dataset.routeProjectionState||null,mapState:document.querySelector('[data-map-state]')?.dataset.mapState||null})""", route)
            raise RuntimeError(f"map_drag_route_settle_failed:{json.dumps(diagnostic, sort_keys=True)}") from error
        node = page.locator(".tile-map").first
        if not node.count(): return {"pass": False, "reason": "map_missing"}
        node.scroll_into_view_if_needed(); page.wait_for_timeout(100)
        before = map_snapshot(node); box = node.bounding_box()
        if box is None: return {"pass": False, "reason": "map_box_missing", "before": before}
        page.mouse.move(min(box["x"] + box["width"] * .58, VIEWPORT["width"] - 100), min(box["y"] + box["height"] * .42, VIEWPORT["height"] - 100))
        page.mouse.down(); page.mouse.move(min(box["x"] + box["width"] * .58, VIEWPORT["width"] - 100) - 170, min(box["y"] + box["height"] * .42, VIEWPORT["height"] - 100) - 35, steps=12); page.mouse.up(); page.wait_for_timeout(700)
        after = map_snapshot(node); screenshot(f"map-drag-{route}-after.png")
        return {"pass": before["center"] != after["center"] and before["instance"] == after["instance"] and after["destroys"] == "0" and after["styleReloads"] == "0", "before": before, "after": after}

    page.set_viewport_size({"width": 390, "height": 844}); navigate_route(page, "command-overview"); settle(page, "command-overview", False)
    menu = page.locator('.topbar__menu[data-action="toggle-nav"]'); menu.focus(); menu.press("Enter"); page.wait_for_timeout(100)
    result["keyboardDrawerOpen"] = page.locator("body.nav-open").count() == 1
    page.keyboard.press("Escape"); page.wait_for_timeout(100)
    result["keyboardDrawerEscapeClose"] = page.locator("body.nav-open").count() == 0

    page.set_viewport_size(VIEWPORT); navigate_route(page, "command-overview"); settle(page, "command-overview")
    screenshot("command-marker-before.png")
    command_values_before = page.locator(".overview-metrics").inner_text()
    page.get_by_role("button", name="Refresh canonical projections").click()
    refreshed_metrics = page.locator(".overview-metrics")
    result["warmRefreshRetainsContent"] = refreshed_metrics.is_visible() and bool(refreshed_metrics.inner_text().strip()) and "Refreshing" in page.locator(".topbar").inner_text()
    screenshot("command-warm-refresh.png")
    settle(page, "command-overview")
    command_map = page.locator('.tile-map').first; command_map_before = map_snapshot(command_map)
    priority = page.locator('.priority-items [data-action^="inspect-incident:"]').first
    command_id = (priority.get_attribute("data-action") or "").split(":", 1)[-1]
    priority.click(); page.wait_for_selector(f'[data-quicklook-incident="{command_id}"]', timeout=10_000)
    page.wait_for_function("id => document.querySelector('.tile-map')?.dataset.mapSelectedIncident===id", arg=command_id, timeout=10_000)
    try:
        page.wait_for_function("() => window.__VIGIA_EXECUTIVE_UX_RUNTIME__?.quicklook?.at(-1)?.dataMs !== null", timeout=10_000)
    except PlaywrightTimeout:
        pass
    screenshot("command-marker-after.png"); screenshot("command-quicklook.png")
    quicklook_text = page.locator('.incident-quicklook').inner_text().lower(); command_map_after = map_snapshot(command_map)
    quicklook_runtime = page.evaluate("() => window.__VIGIA_EXECUTIVE_UX_RUNTIME__?.quicklook?.at(-1) ?? null")
    result["commandQuicklookImmediate"] = all(label in quicklook_text for label in ["incident quicklook", "source strength", "latest material change", "highest-impact unknown", "what vigia is doing", "next decision"])
    shell_ms = quicklook_runtime.get("shellMs") if quicklook_runtime else None; data_ms = quicklook_runtime.get("dataMs") if quicklook_runtime else None
    result["commandQuicklookPerformance"] = isinstance(shell_ms, (int, float)) and shell_ms < 100 and isinstance(data_ms, (int, float)) and data_ms < 500
    result["commandQuicklookNoRemount"] = command_map_before["instance"] == command_map_after["instance"] and command_map_after["destroys"] == "0" and command_map_after["styleReloads"] == "0"
    page.get_by_role("button", name="Back to priorities").click(); page.wait_for_timeout(100)
    result["commandQuicklookBack"] = page.locator('.priority-items').count() == 1 and page.locator('.incident-quicklook').count() == 0
    page.locator(f'[data-action="inspect-incident:{command_id}"]').first.click(); page.wait_for_selector('.incident-quicklook')
    page.get_by_role("button", name="Open incident workspace").click(); page.wait_for_function("() => document.body.dataset.vigiaRoute==='incident-detail'", timeout=10_000)
    result["commandOpenWorkspace"] = page.evaluate("document.body.dataset.vigiaRoute") == "incident-detail"

    navigate_route(page, "command-overview"); settle(page, "command-overview", False); command_map = page.locator('.tile-map').first
    zoom_before = float(command_map.get_attribute('data-map-zoom') or 'nan'); command_map.focus(); box = command_map.bounding_box()
    if box:
        page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2); page.mouse.wheel(0, -520); page.wait_for_timeout(700)
    zoom_after = float(command_map.get_attribute('data-map-zoom') or 'nan'); screenshot("command-trackpad-zoom.png")
    result["mapZoomInputPolicy"] = zoom_after > zoom_before and command_map.get_attribute('data-map-wheel-zoom-enabled') == 'true' and command_map.get_attribute('data-map-touch-zoom-enabled') == 'true' and command_map.get_attribute('data-map-keyboard-enabled') == 'true'
    page.keyboard.press("Escape")

    navigate_route(page, "incidents"); settle(page, "incidents")
    selected_chain, selected_ids, selected_labels = [], [], []
    for row_index in range(3):
        row = page.locator('.incident-table__row').nth(row_index); action = row.get_attribute("data-action") or ""; incident_id = action.split(":", 1)[-1]; label = row.locator('.incident-identity strong').inner_text().strip()
        selected_ids.append(incident_id); selected_labels.append(label); row.focus(); row.press("Enter")
        page.wait_for_function("id => document.querySelector('.tile-map')?.dataset.mapSelectedIncident===id", arg=incident_id, timeout=10_000)
        selected_chain.append(page.locator(f'.incident-table__row[data-action="inspect-incident:{incident_id}"][aria-selected="true"]').count() == 1 and page.locator(f'[data-quicklook-incident="{incident_id}"]').count() == 1)
    selected_c, selected_label = selected_ids[-1], selected_labels[-1]
    result["incidentKeyboardSelection"] = all(selected_chain)
    result["incidentMapSelectionABC"] = page.locator(f'.tile-map[data-map-selected-incident="{selected_c}"]').count() == 1
    search = page.locator('[data-input="incident-search"]'); search.evaluate("node => node.dataset.qaIdentity='incidents-search-node'"); search.focus(); search.type(selected_label[:min(5, len(selected_label))], delay=35); page.wait_for_timeout(250)
    search_proof = search.evaluate("node => ({identity:node.dataset.qaIdentity,value:node.value,focused:document.activeElement===node,start:node.selectionStart,end:node.selectionEnd})")
    result["incidentSearchIdentityCaret"] = search_proof["identity"] == "incidents-search-node" and search_proof["focused"] and search_proof["start"] == len(search_proof["value"]) and search_proof["end"] == len(search_proof["value"])
    search.fill("zzzz-no-canonical-match"); page.wait_for_function("value => document.querySelectorAll('.incident-table__row').length === 0 && document.querySelector('.incident-inventory')?.textContent?.includes(value)", arg="zzzz-no-canonical-match", timeout=5_000)
    result["incidentNoMatchTruth"] = page.locator('.incident-table__row').count() == 0 and "zzzz-no-canonical-match" in page.locator('.incident-inventory').inner_text()
    screenshot("incidents-no-match.png"); search.fill(""); page.wait_for_timeout(180); screenshot("incidents-after-clear.png")
    saved_before = int(page.locator('.incident-inventory footer span').first.inner_text().split()[-2])
    incidents_map = page.locator('.tile-map').first; incidents_map_before = map_snapshot(incidents_map)
    saved_button = page.locator('[data-action="incident-saved-filter:NEW_CANDIDATES"]')
    saved_expected = int(saved_button.locator('strong').inner_text())
    saved_button.click(); page.wait_for_timeout(220)
    saved_after = int(page.locator('.incident-inventory footer span').first.inner_text().split()[-2])
    incidents_map_after = map_snapshot(incidents_map)
    screenshot("incidents-saved-filter-new-candidates.png")
    result["incidentsSavedFilterEvidence"] = {"pass": saved_button.get_attribute("aria-pressed") == "true" and saved_after == saved_expected and saved_after < saved_before and "saved=NEW_CANDIDATES" in page.url and incidents_map_before["instance"] == incidents_map_after["instance"] and incidents_map_after["destroys"] == "0" and incidents_map_after["styleReloads"] == "0", "filter": "NEW_CANDIDATES", "beforeCount": saved_before, "afterCount": saved_after, "expectedCount": saved_expected, "url": page.url}
    page.locator('[data-action="incident-saved-filter:ALL"]').click(); page.wait_for_timeout(180)

    navigate_route(page, "incident-detail"); settle(page, "incident-detail", False)
    page.wait_for_function("expected => document.querySelector('.incident-priority-grid h2')?.textContent?.trim()===expected.label && document.querySelector('.tile-map')?.dataset.mapSelectedIncident===expected.id", arg={"id":selected_c,"label":selected_label}, timeout=35_000)
    detail_document_before = page.evaluate("() => ({identity:document.querySelector('#app')?.dataset.documentIdentity,timeOrigin:performance.timeOrigin,navigationEntries:performance.getEntriesByType('navigation').length})")
    detail_map = page.locator('.tile-map').first; detail_instance = detail_map.get_attribute('data-map-instance-id')
    page.get_by_role("combobox", name="Incident context").click(); page.wait_for_timeout(100); screenshot("detail-incident-switcher-open.png"); page.keyboard.press("Escape")
    switch_results = []
    for incident_id, label in zip(selected_ids, selected_labels):
        page.get_by_role("combobox", name="Incident context").click(); page.locator(f'.vigia-select__menu [role="option"][data-action="select-context-incident:{incident_id}"]').click()
        page.wait_for_function("expected => document.querySelector('.incident-priority-grid h2')?.textContent?.trim()===expected.label && document.querySelector('.tile-map')?.dataset.mapSelectedIncident===expected.id", arg={"id":incident_id,"label":label}, timeout=35_000)
        switch_results.append(page.locator(f'.tile-map[data-map-selected-incident="{incident_id}"]').count() == 1)
    detail_document_after = page.evaluate("() => ({identity:document.querySelector('#app')?.dataset.documentIdentity,timeOrigin:performance.timeOrigin,navigationEntries:performance.getEntriesByType('navigation').length})")
    screenshot("detail-incident-transition-a-b-c.png")
    result["detailIncidentSwitcherABC"] = all(switch_results) and detail_instance == page.locator('.tile-map').get_attribute('data-map-instance-id') and detail_document_before == detail_document_after and "#/incident-detail?" in page.url and page.url.rfind("?") > page.url.rfind("#")
    detail_text = page.locator('.incident-priority-grid').inner_text().lower()
    result["detailDecisionHierarchy"] = all(label in detail_text for label in ["current situation", "material change", "risk and exposure", "next decision"])

    spatial_incident_id = os.environ.get("VIGIA_VQA_MAPPABLE_INCIDENT_ID", "incident:20261242892")
    navigate_route(page, "intelligence", f"?id={urllib.parse.quote_plus(spatial_incident_id)}")
    page.wait_for_function("() => document.body.dataset.vigiaRoute==='intelligence'", timeout=10_000)
    page.wait_for_function("() => document.querySelector('#app')?.dataset.vigiaIncidentLoadPending==='false'", timeout=60_000)
    settle(page, "intelligence", False)
    try:
        page.wait_for_function("id => document.querySelector('.tile-map')?.dataset.mapSelectedIncident===id", arg=spatial_incident_id, timeout=35_000)
    except PlaywrightTimeout as error:
        diagnostic = page.evaluate("""expectedId => {
          const app=document.querySelector('#app'),map=document.querySelector('.tile-map'),main=document.querySelector('main');
          let config={};try{config=JSON.parse(map?.dataset.mapConfig||'{}')}catch{}
          return {
            expectedId,
            href:location.href,
            route:document.body.dataset.vigiaRoute||null,
            appState:document.body.dataset.vigiaAppState||null,
            resourceState:document.body.dataset.vigiaResourceState||null,
            globalRefreshPending:app?.dataset.vigiaGlobalRefreshPending||null,
            incidentLoadPending:app?.dataset.vigiaIncidentLoadPending||null,
            routeProjectionState:main?.dataset.routeProjectionState||null,
            routeProjectionKey:main?.dataset.routeProjectionKey||null,
            mapState:map?.dataset.mapState||null,
            mapEnabled:map?.dataset.mapEnabled||null,
            mapInstanceId:map?.dataset.mapInstanceId||null,
            mapSceneIdentity:map?.dataset.mapSceneIdentity||null,
            mapSceneOwner:map?.closest('.canonical-map')?.dataset.mapSceneOwner||null,
            mapSelectedIncident:map?.dataset.mapSelectedIncident||null,
            mapFocusIncident:map?.dataset.mapFocusIncident||null,
            mapCameraIncident:map?.closest('.canonical-map')?.dataset.mapCameraIncident||null,
            selectedMarkerIds:(config.markers?.features||[]).filter(item=>item?.properties?.selected===true).map(item=>item?.properties?.identifier||item?.id||null),
            incidentMarkerIds:(config.markers?.features||[]).filter(item=>item?.properties?.kind==='incident').map(item=>item?.properties?.identifier||item?.id||null),
            mapRuntime:window.__VIGIA_MAP_RUNTIME__||null,
            appRuntime:window.__VIGIA_APP_RUNTIME__||null,
          };
        }""", spatial_incident_id)
        (evidence / "intelligence-selection-association-failure.json").write_text(json.dumps(diagnostic, indent=2) + "\n", encoding="utf-8")
        screenshot("intelligence-selection-association-failure.png", True)
        raise RuntimeError(f"intelligence_selection_association_failed:{json.dumps(diagnostic, sort_keys=True)}") from error
    intelligence_context_label = page.get_by_role("combobox", name="Incident context").locator("span").inner_text().strip()
    screenshot("intelligence-before-view-on-map.png"); intelligence_map = page.locator('.tile-map').first; intelligence_instance = intelligence_map.get_attribute('data-map-instance-id')
    available_map_actions = page.locator('[data-action^="map-focus-layer:"]:not([disabled])')
    focused_layer = None
    if available_map_actions.count():
        focused_layer = (available_map_actions.first.get_attribute("data-action") or "").split(":", 1)[-1]
        available_map_actions.first.click()
        try:
            page.wait_for_function("layer => document.querySelector('.tile-map')?.dataset.mapFocusedLayer===layer", arg=focused_layer, timeout=5_000)
        except PlaywrightTimeout as error:
            diagnostic = page.evaluate("""expectedLayer => {
              const map=document.querySelector('.tile-map'),runtime=window.__VIGIA_EXECUTIVE_UX_RUNTIME__;
              let config={};try{config=JSON.parse(map?.dataset.mapConfig||'{}')}catch{}
              return {expectedLayer,href:location.href,route:document.body.dataset.vigiaRoute||null,appState:document.body.dataset.vigiaAppState||null,mapState:map?.dataset.mapState||null,mapInstanceId:map?.dataset.mapInstanceId||null,mapSceneIdentity:map?.dataset.mapSceneIdentity||null,mapSelectedIncident:map?.dataset.mapSelectedIncident||null,mapFocusedLayer:map?.dataset.mapFocusedLayer||null,mapFocusedFeatureCount:map?.dataset.mapFocusedFeatureCount||null,focusChip:document.querySelector('.canonical-map__focus-chip')?.textContent?.trim()||null,lastRuntimeFocus:runtime?.mapFocus?.at(-1)||null,actions:[...document.querySelectorAll('[data-action^="map-focus-layer:"]:not([disabled])')].map(node=>({action:node.dataset.action,artifact:node.closest('[data-artifact]')?.dataset.artifact||null})),featureLayers:(config.features?.features||[]).reduce((out,item)=>{const key=item?.properties?.layer||'none';out[key]=(out[key]||0)+1;return out;},{}),markerKinds:(config.markers?.features||[]).reduce((out,item)=>{const key=item?.properties?.kind||'none';out[key]=(out[key]||0)+1;return out;},{}),mapRuntime:window.__VIGIA_MAP_RUNTIME__||null};
            }""", focused_layer)
            (evidence / "intelligence-view-on-map-failure.json").write_text(json.dumps(diagnostic, indent=2) + "\n", encoding="utf-8")
            screenshot("intelligence-view-on-map-failure.png", True)
            raise RuntimeError(f"intelligence_view_on_map_focus_failed:{json.dumps(diagnostic, sort_keys=True)}") from error
    screenshot("intelligence-after-view-on-map.png"); screenshot("intelligence-full-page.png", True)
    focus_runtime = page.evaluate("() => window.__VIGIA_EXECUTIVE_UX_RUNTIME__?.mapFocus?.filter(item=>item.kind==='layer').at(-1) ?? null")
    result["intelligenceReadingOrder"] = all(label in page.locator('.intelligence-reading').inner_text() for label in ["Now", "Next", "Watch", "Uncertainty", "Decision"])
    result["intelligenceViewOnMap"] = bool(focused_layer) and intelligence_map.get_attribute('data-map-focused-layer') == focused_layer and page.locator('.canonical-map__focus-chip').count() == 1 and intelligence_instance == intelligence_map.get_attribute('data-map-instance-id') and bool(focus_runtime) and focus_runtime.get("focused") is True and float(focus_runtime.get("durationMs", 9999)) < 150

    navigate_route(page, "operations"); settle(page, "operations", False)
    page.wait_for_function("label => document.querySelector('.operations-command-strip')?.textContent?.includes(label)", arg=intelligence_context_label, timeout=35_000)
    certification_incident_id = next((item for item in captured_response_incident_ids or [] if item), "")
    if certification_incident_id:
        operation_select = page.get_by_role("combobox", name="Incident context")
        operation_select.click()
        certification_action = f"select-context-incident:{certification_incident_id}"
        certification_option = page.locator(f'[data-action={json.dumps(certification_action)}]:visible:not([disabled]):not([aria-disabled="true"])')
        if not certification_option.count():
            operation_search = page.get_by_placeholder("Search name, locality, or official ID")
            if operation_search.count():
                operation_search.fill(certification_incident_id)
                page.wait_for_timeout(120)
            certification_option = page.locator(f'[data-action={json.dumps(certification_action)}]:visible:not([disabled]):not([aria-disabled="true"])')
        if not certification_option.count():
            page.keyboard.press("Escape")
            raise RuntimeError(f"captured_operations_certification_incident_not_selectable:{certification_incident_id}")
        certification_option.first.click()
        page.wait_for_function(
            "incidentId => document.querySelector('.tile-map')?.dataset.mapSelectedIncident === incidentId && document.querySelector('#app')?.dataset.vigiaIncidentLoadPending === 'false'",
            arg=certification_incident_id,
            timeout=35_000,
        )
    result["operationsCertificationContext"] = {
        "pass": not certification_incident_id or page.locator('.tile-map').first.get_attribute('data-map-selected-incident') == certification_incident_id,
        "incidentId": certification_incident_id or None,
        "reason": "The interaction certifier first proved Intelligence → Operations continuity, then restored the exact incident captured by the route/action inventory.",
    }
    page.wait_for_selector('.operation-queue-row', timeout=35_000)
    operation_select = page.get_by_role("combobox", name="Incident context"); operation_select.click(); page.wait_for_timeout(100)
    result["operationsIncidentSelector"] = operation_select.get_attribute("aria-expanded") == "true" and page.get_by_placeholder("Search name, locality, or official ID").count() == 1
    screenshot("operations-incident-selector-open.png"); page.keyboard.press("Escape")
    action_rows = page.locator('.operation-queue-row')
    if action_rows.count(): action_rows.first.click(); page.wait_for_timeout(120)
    screenshot("operations-prioritized-queue.png"); screenshot("operations-selected-action-inspector.png")
    operations_text = page.locator('.operation-inspector').inner_text().lower()
    result["operationsMasterDetail"] = action_rows.count() > 0 and page.locator('.operation-inspector[data-operation-id]').count() == 1 and all(label in operations_text for label in ["owner", "source", "last checked", "due / next check", "escalates when", "complete when"])
    lane = page.locator('.operation-lane', has_text="Source Resolution"); lane.click(); page.wait_for_timeout(100)
    result["operationsLaneFilter"] = page.locator('.operation-lane[aria-pressed="true"] strong').inner_text() == "Source Resolution"
    action_surfaces = [action_surface("operations:resolution", "operations")]
    for lane_name in ("response", "protect"):
        page.locator(f'[data-action="operations-tab:{lane_name}"]').click(); page.wait_for_timeout(150)
        action_surfaces.append(action_surface(f"operations:{lane_name}", "operations"))
    page.locator('[data-action="operations-tab:resolution"]').click(); page.wait_for_timeout(150)
    period_workflow = page.locator('.operations-period-workflow')
    if period_workflow.count():
        period_workflow.evaluate("node => node.open=true")
        page.wait_for_timeout(80)
        action_surfaces.append(action_surface("operations:period-workflow-open", "operations"))
        period_workflow.evaluate("node => node.open=false")
    result["consequentialActionExercise"] = controlled_action_exercise(action_surfaces)
    result["consequentialActionSurfaces"] = {"pass": len(action_surfaces) >= 3 and all(surface["actions"] for surface in action_surfaces), "surfaces": action_surfaces}

    navigate_route(page, "reports-analytics"); settle(page, "reports-analytics", False)
    report_panels = []
    for tab_name, slug in [("Decision Summary", "summary"), ("Outcome Analysis", "outcomes"), ("System Performance", "performance"), ("Situation Quality", "quality")]:
        page.get_by_role("tab", name=tab_name).click(); page.wait_for_timeout(120); panel = page.locator(f"#report-panel-{slug}"); report_panels.append(panel.inner_text()); screenshot(f"reports-{slug}.png")
    page.get_by_role("tab", name="Outcome Analysis").click(); page.wait_for_timeout(80)
    outcome_counts = [int(value.replace(',', '')) for value in page.locator('#report-panel-outcomes > .outcome-funnel--validated article b').all_inner_texts()]
    page.get_by_role("tab", name="Situation Quality").click(); page.wait_for_timeout(80)
    result["reportsSectionControl"] = page.get_by_role("tab", name="Situation Quality").get_attribute("aria-selected") == "true" and len(set(report_panels)) == 4
    result["reportsOutcomeLineage"] = len(outcome_counts) == 5 and outcome_counts == [0, 0, 0, 0, 0] and "monitored resolution requirements" in report_panels[1] and not any(code in report_panels[1] for code in ["TIME_ACCUMULATION_REQUIRED", "OUTCOME_LOOP_NOT_LINKED", "sha256:"])
    result["outcomeLineageEvidence"] = {"pass": result["reportsOutcomeLineage"], "labels": ["Actions initiated", "Acknowledged", "Postcondition defined", "Postcondition observed", "Outcome measured"], "distinctPersistedRecordCounts": outcome_counts, "derivedRequirementsExcluded": True}
    result["reportsSloTruth"] = any(label in report_panels[2] for label in ["Performance degraded", "Performance critical", "Within measured targets"]) and all(label in report_panels[2] for label in ["Basemap tile reliability", "Map stable render", "API response p95"])
    result["reportsQualityDimensions"] = "no composite confidence score" in report_panels[3].lower() and page.locator('#report-panel-quality .quality-dimensions article').count() > 0

    navigate_route(page, "global-awareness"); settle(page, "global-awareness")
    result["globalFilters"] = page.locator('.global-filters [role="combobox"]').count() == 5
    world_map = page.locator('.tile-map').first; global_document_before = page.evaluate("() => ({timeOrigin:performance.timeOrigin,navigationEntries:performance.getEntriesByType('navigation').length,identity:document.querySelector('#app')?.dataset.documentIdentity,mounts:document.querySelector('#app')?.dataset.applicationMountCount})"); global_map_before = map_snapshot(world_map)
    initial_count = int(page.locator('.global-results h2').inner_text().split()[0]); screenshot("global-before-filter.png"); chosen_filter = None
    for filter_id in ["global-status", "global-region", "global-time"]:
        trigger = page.locator(f'[data-vigia-select-trigger="{filter_id}"]')
        if not trigger.is_enabled(): continue
        trigger.click(); page.wait_for_timeout(80); options = page.locator(f'[data-vigia-select="{filter_id}"] [role="option"]'); candidate = None
        for index in range(1, options.count()):
            count_node = options.nth(index).locator('small'); count = int(count_node.inner_text()) if count_node.count() and count_node.inner_text().isdigit() else None
            if count is None or count < initial_count: candidate = index; break
        if candidate is not None:
            screenshot("global-dropdown-open.png"); options.nth(candidate).click(); chosen_filter = filter_id; break
        page.keyboard.press("Escape")
    page.wait_for_timeout(250); screenshot("global-after-filter.png"); filtered_count = int(page.locator('.global-results h2').inner_text().split()[0])
    global_document_after = page.evaluate("() => ({timeOrigin:performance.timeOrigin,navigationEntries:performance.getEntriesByType('navigation').length,identity:document.querySelector('#app')?.dataset.documentIdentity,mounts:document.querySelector('#app')?.dataset.applicationMountCount})"); global_map_after = map_snapshot(world_map)
    result["globalFilterVisibleEffect"] = chosen_filter is not None and filtered_count != initial_count and "#/global-awareness?" in page.url and page.url.rfind("?") > page.url.rfind("#")
    result["globalFilterEvidence"] = {"pass": result["globalFilterVisibleEffect"], "filter": chosen_filter, "beforeCount": initial_count, "afterCount": filtered_count, "url": page.url}
    result["globalFilterNoDocumentNavigation"] = global_document_before == global_document_after
    result["globalFilterNoMapRemount"] = global_map_before["instance"] == global_map_after["instance"] and global_map_after["destroys"] == "0" and global_map_after["styleReloads"] == "0"
    page.locator('[data-action="fit-map-results"]').first.click(); page.wait_for_timeout(450); screenshot("global-fit-results.png")
    mappable_count = int(page.locator('.global-results').get_attribute('data-global-mappable-count') or '0')
    result["globalFitResults"] = world_map.get_attribute('data-map-fit-at') is not None and int(world_map.get_attribute('data-map-fit-feature-count') or '0') == mappable_count and mappable_count <= filtered_count
    clear_global = page.locator('[data-action="clear-global-filters"]')
    if clear_global.count(): clear_global.click(); page.wait_for_timeout(180)
    region_before = int(page.locator('.global-results h2').inner_text().split()[0]); region_map_before = map_snapshot(world_map)
    region_button = page.locator('[data-action^="global-region-focus:"]').first
    region_name = region_button.locator('strong').inner_text().strip() if region_button.count() else None
    if region_button.count(): region_button.click(); page.wait_for_timeout(500)
    region_after = int(page.locator('.global-results h2').inner_text().split()[0]); region_map_after = map_snapshot(world_map)
    screenshot("global-regional-focus.png")
    result["globalRegionalFocusEvidence"] = {"pass": bool(region_button.count()) and bool(region_name) and region_after <= region_before and f"region={urllib.parse.quote_plus(region_name)}" in page.url and world_map.get_attribute('data-map-fit-at') is not None and region_map_before["center"] != region_map_after["center"] and region_map_before["instance"] == region_map_after["instance"] and region_map_after["destroys"] == "0" and region_map_after["styleReloads"] == "0", "region": region_name, "beforeCount": region_before, "afterCount": region_after, "url": page.url, "mapBefore": region_map_before, "mapAfter": region_map_after}

    result["mapDrag"] = {route: drag_map(route) for route in ["command-overview", "incidents", "incident-detail", "intelligence", "operations", "global-awareness"]}
    result["allMapRoutesDragWithoutRemount"] = all(item["pass"] for item in result["mapDrag"].values())

    page.set_viewport_size({"width": 836, "height": 941}); navigate_route(page, "reports-analytics", "?view=outcomes"); settle(page, "reports-analytics", False)
    page.add_style_tag(content="html{font-size:200%!important} .vigia-state-label{letter-spacing:.12em!important;word-spacing:.16em!important}"); screenshot("state-labels-200-percent-text-spacing.png")
    state_label_evidence = page.locator('.vigia-state-label').evaluate_all("nodes => nodes.map(node => {const box=node.getBoundingClientRect(),mark=node.querySelector('i')?.getBoundingClientRect(),label=node.querySelector('span')?.getBoundingClientRect();return {label:node.textContent.trim(),nowrap:getComputedStyle(node).whiteSpace==='nowrap',height:Number(box.height.toFixed(2)),scrollHeight:node.scrollHeight,centerDelta:Number((!mark||!label?0:Math.abs((mark.top+mark.height/2)-(label.top+label.height/2))).toFixed(2))};})")
    result["stateLabelsAt200Percent"] = bool(state_label_evidence) and all(item["nowrap"] and item["scrollHeight"] <= item["height"] + 1 and item["centerDelta"] < 2 for item in state_label_evidence)
    page.set_viewport_size({"width": 1672, "height": 941}); navigate_route(page, "reports-analytics", "?view=outcomes"); settle(page, "reports-analytics", False)
    page.add_style_tag(content="html{font-size:400%!important} .vigia-state-label{letter-spacing:.12em!important;word-spacing:.16em!important}"); screenshot("state-labels-400-percent-text-spacing.png")
    state_label_evidence_400 = page.locator('.vigia-state-label').evaluate_all("nodes => nodes.map(node => {const box=node.getBoundingClientRect(),mark=node.querySelector('i')?.getBoundingClientRect(),label=node.querySelector('span')?.getBoundingClientRect();return {label:node.textContent.trim(),nowrap:getComputedStyle(node).whiteSpace==='nowrap',height:Number(box.height.toFixed(2)),scrollHeight:node.scrollHeight,centerDelta:Number((!mark||!label?0:Math.abs((mark.top+mark.height/2)-(label.top+label.height/2))).toFixed(2))};})")
    result["stateLabelsAt400Percent"] = bool(state_label_evidence_400) and all(item["nowrap"] and item["scrollHeight"] <= item["height"] + 1 and item["centerDelta"] < 2 for item in state_label_evidence_400)
    result["stateLabelEvidence"] = {"pass": result["stateLabelsAt200Percent"] and result["stateLabelsAt400Percent"], "labels": state_label_evidence, "labelsAt400Percent": state_label_evidence_400}
    page.set_viewport_size({"width": 390, "height": 844}); navigate_route(page, "command-overview"); settle(page, "command-overview", False)
    page.locator('.priority-items [data-action^="inspect-incident:"]').first.click(); page.wait_for_selector('.incident-quicklook'); screenshot("mobile-quicklook-bottom-sheet.png")
    mobile = page.locator('.incident-quicklook'); position = mobile.evaluate("node => getComputedStyle(node).position"); mobile.get_by_role("button", name="Expand").click(); page.wait_for_timeout(100)
    result["mobileQuicklook"] = position == "fixed" and "is-expanded" in (mobile.get_attribute("class") or "")
    navigate_route(page, "evidence"); page.wait_for_function("() => document.body.dataset.vigiaRoute==='intelligence'", timeout=10_000); result["evidenceAlias"] = page.evaluate("document.body.dataset.vigiaRoute") == "intelligence"
    navigate_route(page, "control-plane"); page.wait_for_function("() => document.body.dataset.vigiaRoute==='operations'", timeout=10_000); result["controlPlaneAlias"] = page.evaluate("document.body.dataset.vigiaRoute") == "operations"

    # Build a non-vacuous warm interaction cohort across routes, incidents, and
    # repeated runs. These are real operator interactions measured by the app;
    # no synthetic timing samples are injected by the certification driver.
    for route in ("command-overview", "incidents", "global-awareness"):
        navigate_route(page, route); settle(page, route, False)
        for run_index in range(7):
            actions = page.locator('[data-action^="inspect-incident:"]:visible:not([disabled])')
            action_count = actions.count()
            if not action_count:
                break
            target = actions.nth(run_index % min(3, action_count))
            before_count = page.evaluate("() => window.__VIGIA_EXECUTIVE_UX_RUNTIME__?.quicklook?.length ?? 0")
            expected_action = target.get_attribute("data-action")
            expected_incident = (expected_action or "").split(":", 1)[-1]
            # Canonical priorities may legitimately reorder while the warm
            # cohort is sampled. Resolve the action from the current DOM on
            # every iteration instead of replaying a stale incident selector.
            target.click()
            page.wait_for_function("target => (window.__VIGIA_EXECUTIVE_UX_RUNTIME__?.quicklook ?? []).slice(target.count).some(item => item.uiAction === target.action && ['RECORDED','FAIL'].includes(item.state))", arg={"count": before_count, "action": expected_action}, timeout=10_000)
            recorded = page.evaluate("target => structuredClone((window.__VIGIA_EXECUTIVE_UX_RUNTIME__?.quicklook ?? []).slice(target.count).findLast(item => item.uiAction === target.action))", {"count": before_count, "action": expected_action})
            if recorded.get("state") != "RECORDED" or recorded.get("incidentId") != expected_incident or recorded.get("route") != route or recorded.get("quicklookVisible") is not True:
                raise RuntimeError(f"quicklook_interaction_not_recorded:{route}:{run_index}:{expected_action}:{json.dumps(recorded, sort_keys=True)}")
            back = page.get_by_role("button", name="Back to priorities")
            if back.count() and back.is_visible():
                back.click(); page.wait_for_timeout(40)

    switch_incident_ids = list(dict.fromkeys(selected_ids))[:3]
    for route in ("incident-detail", "intelligence", "operations"):
        navigate_route(page, route); settle(page, route, False)
        for run_index in range(7):
            incident_id = switch_incident_ids[run_index % len(switch_incident_ids)]
            before_count = page.evaluate("() => window.__VIGIA_EXECUTIVE_UX_RUNTIME__?.incidentSwitches?.length ?? 0")
            page.get_by_role("combobox", name="Incident context").click()
            page.locator(f'.vigia-select__menu [role="option"][data-action="select-context-incident:{incident_id}"]').click()
            expected_action = f"select-context-incident:{incident_id}"
            page.wait_for_function("target => (window.__VIGIA_EXECUTIVE_UX_RUNTIME__?.incidentSwitches ?? []).slice(target.count).some(item => item.uiAction === target.action && ['RECORDED','FAIL'].includes(item.state))", arg={"count": before_count, "action": expected_action}, timeout=35_000)
            recorded = page.evaluate("target => structuredClone((window.__VIGIA_EXECUTIVE_UX_RUNTIME__?.incidentSwitches ?? []).slice(target.count).findLast(item => item.uiAction === target.action))", {"count": before_count, "action": expected_action})
            if recorded.get("state") != "RECORDED" or recorded.get("incidentId") != incident_id or recorded.get("route") != route:
                raise RuntimeError(f"incident_switch_not_recorded:{route}:{run_index}:{expected_action}:{json.dumps(recorded, sort_keys=True)}")

    performance_cohort = page.evaluate("""() => {
      const runtime=window.__VIGIA_EXECUTIVE_UX_RUNTIME__??{};
      const summarize=rows=>({samples:rows.length,distinctIncidents:new Set(rows.map(row=>row.incidentId).filter(Boolean)).size,distinctRoutes:new Set(rows.map(row=>row.route).filter(Boolean)).size});
      return {quicklook:summarize(runtime.quicklook??[]),incidentSwitch:summarize(runtime.incidentSwitches??[])};
    }""")
    result["performanceInteractionCohort"] = {
        "pass": performance_cohort["quicklook"]["samples"] >= 20
        and performance_cohort["quicklook"]["distinctIncidents"] >= 3
        and performance_cohort["quicklook"]["distinctRoutes"] >= 2
        and performance_cohort["incidentSwitch"]["samples"] >= 20
        and performance_cohort["incidentSwitch"]["distinctIncidents"] >= 3
        and performance_cohort["incidentSwitch"]["distinctRoutes"] >= 2,
        **performance_cohort,
    }
    result["runtimeTelemetry"] = {"pass": True, **page.evaluate("() => ({executive:window.__VIGIA_EXECUTIVE_UX_RUNTIME__,map:window.__VIGIA_MAP_RUNTIME__,document:window.__VIGIA_APP_RUNTIME__})")}
    return result


CDP_DRAG_ROUTES = [
    "command-overview", "incidents", "incident-detail",
    "intelligence", "operations", "global-awareness",
]
CDP_DRAG_TRIALS_PER_ROUTE = 3
CDP_TRACE_CATEGORIES = ",".join([
    "-*", "devtools.timeline", "disabled-by-default-devtools.timeline",
    "disabled-by-default-devtools.timeline.frame", "disabled-by-default-devtools.timeline.input",
    # Renderer identity is read directly from the live WebGL context. Recording
    # every compositor, GPU, and top-level task event made the multi-route
    # ReturnAsStream trace exceed the bounded Docker flush window without
    # adding evidence to the input-to-paint or frame-interval calculations.
    "blink.user_timing", "input",
])


def renderer_classification(renderers: list[str]) -> str:
    values = [str(value).strip() for value in renderers if str(value or "").strip()]
    if not values:
        return "UNAVAILABLE"
    software = re.compile(r"swiftshader|software|llvmpipe|softpipe|microsoft basic render|mesa offscreen", re.IGNORECASE)
    if any(software.search(value) for value in values):
        return "SOFTWARE"
    hardware = re.compile(r"apple|metal|nvidia|amd|radeon|intel|adreno|mali|powervr|direct3d|d3d11|d3d12", re.IGNORECASE)
    return "HARDWARE" if all(hardware.search(value) for value in values) else "UNAVAILABLE"


def correlate_trace_trial(events: list[dict], marker: str) -> dict:
    complete_measures = [
        event for event in events
        if event.get("name") == marker
        and isinstance(event.get("ts"), (int, float))
        and isinstance(event.get("dur"), (int, float))
        and event.get("dur", 0) > 0
    ]
    windows = [(event["ts"], event["ts"] + event["dur"]) for event in complete_measures]
    # Current Chromium emits PerformanceMeasure entries as async begin/end
    # events (ph=b/e), while older builds emitted a complete event with dur.
    # Pair both encodings so certification remains bound to the real User
    # Timing window instead of silently returning an empty distribution.
    begins = sorted(
        event["ts"] for event in events
        if event.get("name") == marker and event.get("ph") in {"b", "B"}
        and isinstance(event.get("ts"), (int, float))
    )
    ends = sorted(
        event["ts"] for event in events
        if event.get("name") == marker and event.get("ph") in {"e", "E"}
        and isinstance(event.get("ts"), (int, float))
    )
    for begin in begins:
        end = next((timestamp for timestamp in ends if timestamp > begin), None)
        if end is not None:
            windows.append((begin, end))
    if not windows:
        return {"state": "TRACE_WINDOW_MISSING", "inputToPaintMs": [], "frameIntervalsMs": []}
    start, end = min(windows, key=lambda item: item[1] - item[0])
    window = [
        event for event in events
        if isinstance(event.get("ts"), (int, float)) and start <= event["ts"] <= end
    ]
    input_pattern = re.compile(r"mouse|pointer|gesture|inputlatency|eventdispatch", re.IGNORECASE)
    frame_pattern = re.compile(r"drawframe|beginframe|submitcompositorframe|composite", re.IGNORECASE)
    paint_pattern = re.compile(r"paint|raster|drawframe|submitcompositorframe", re.IGNORECASE)
    input_times = sorted({event["ts"] for event in window if input_pattern.search(str(event.get("name") or ""))})
    frame_times = sorted({event["ts"] for event in window if frame_pattern.search(str(event.get("name") or ""))})
    paint_times = sorted({event["ts"] for event in window if paint_pattern.search(str(event.get("name") or ""))})
    input_to_paint = []
    for input_time in input_times:
        paint_time = next((timestamp for timestamp in paint_times if timestamp >= input_time), None)
        if paint_time is not None:
            input_to_paint.append(round((paint_time - input_time) / 1_000, 3))
    frame_intervals = [
        round((right - left) / 1_000, 3)
        for left, right in zip(frame_times, frame_times[1:])
        if right > left
    ]
    return {
        "state": "CORRELATED" if input_to_paint and frame_intervals else "TRACE_EVENTS_INCOMPLETE",
        "windowStartUs": start,
        "windowDurationUs": end - start,
        "inputEventCount": len(input_times),
        "renderEventCount": len(frame_times),
        "paintEventCount": len(paint_times),
        "inputToPaintMs": input_to_paint,
        "frameIntervalsMs": frame_intervals,
    }


def capture_cdp_map_drag_trace(page, context, browser, output: Path, identity: dict, browser_mode: str) -> dict:
    """Capture exact map-drag windows through CDP; correlated rAF data stays explicitly separate."""
    trace_path = output / "interaction-evidence" / "map-drag-chrome-trace.json"
    trace_path.parent.mkdir(parents=True, exist_ok=True)
    # This trace runs in a fresh page after the functional exercise.  A route
    # may be navigable from last-good state before the page's parallel global
    # projection bootstrap has finished.  Sampling that transient frame can
    # falsely report a later route map as absent, so require the application’s
    # own hydration markers to reach idle before starting CDP collection.
    page.wait_for_function(
        """() => {
          const app=document.querySelector('#app');
          return app?.dataset.vigiaGlobalRefreshPending==='false'
            && app?.dataset.vigiaIncidentLoadPending==='false';
        }""",
        timeout=60_000,
    )
    session = context.new_cdp_session(page)
    completion: dict = {}
    session.on("Tracing.tracingComplete", lambda payload: completion.update(payload))
    version = session.send("Browser.getVersion")
    session.send("Tracing.start", {
        "categories": CDP_TRACE_CATEGORIES,
        "options": "record-as-much-as-possible",
        "transferMode": "ReturnAsStream",
        # The complete six-route trace contains more than a million events in
        # Chromium 139.  Asking Chrome to gzip the stream keeps the tracing
        # service from dropping the completion handle while Docker is under
        # memory pressure; the evidence is decompressed before validation and
        # written in the same canonical JSON form as an uncompressed stream.
        "streamCompression": "gzip",
    })
    trials: list[dict] = []
    renderers: list[str] = []
    try:
        for route in CDP_DRAG_ROUTES:
            navigate_route(page, route)
            settle(page, route)
            node = page.locator(".tile-map").first
            if not node.count():
                diagnostic = page.evaluate("""() => ({
                  route:document.body.dataset.vigiaRoute||null,
                  appState:document.body.dataset.vigiaAppState||null,
                  resourceState:document.body.dataset.vigiaResourceState||null,
                  globalRefreshPending:document.querySelector('#app')?.dataset.vigiaGlobalRefreshPending||null,
                  incidentLoadPending:document.querySelector('#app')?.dataset.vigiaIncidentLoadPending||null,
                  routeProjectionState:document.querySelector('main[data-vigia-route]')?.dataset.routeProjectionState||null,
                  mapStateCount:document.querySelectorAll('[data-map-state]').length,
                })""")
                raise RuntimeError(f"visual_qa_cdp_map_missing:{route}:{json.dumps(diagnostic, sort_keys=True)}")
            node.scroll_into_view_if_needed()
            page.wait_for_timeout(100)
            renderer = node.evaluate("""node => {
              const canvas=node.querySelector('canvas');
              if(!canvas)return null;
              const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
              if(!gl)return null;
              const extension=gl.getExtension('WEBGL_debug_renderer_info');
              return extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
            }""")
            if renderer and renderer not in renderers:
                renderers.append(renderer)
            for trial_index in range(CDP_DRAG_TRIALS_PER_ROUTE):
                box = node.bounding_box()
                if box is None:
                    raise RuntimeError(f"visual_qa_cdp_map_box_missing:{route}:{trial_index + 1}")
                before = node.evaluate("""node => ({
                  instance:node.dataset.mapInstanceId, center:node.dataset.mapCenter,
                  mounts:Number(node.dataset.mapMountCount||0), destroys:Number(node.dataset.mapDestroyCount||0),
                  styleReloads:Number(node.dataset.mapStyleReloadCount||0), sourceUpdates:Number(node.dataset.mapSourceUpdateCount||0),
                  pointerSamples:(()=>{try{return JSON.parse(node.dataset.mapPointerToPostRenderSamples||'[]')}catch{return[]}})()
                })""")
                page.evaluate("""() => {
                  const sample={active:true,previous:null,frames:[]};
                  window.__VIGIA_CDP_DRAG_FRAME_SAMPLE__=sample;
                  const tick=now=>{if(!sample.active)return;if(sample.previous!==null)sample.frames.push(Number((now-sample.previous).toFixed(3)));sample.previous=now;requestAnimationFrame(tick);};
                  requestAnimationFrame(tick);
                }""")
                direction = -1 if trial_index % 2 == 0 else 1
                start_fraction = .67 if direction < 0 else .33
                start_x = box["x"] + box["width"] * start_fraction
                start_y = box["y"] + box["height"] * .48
                trace_marker = f"vigia-map-drag:{route}:trial-{trial_index + 1}"
                page.evaluate("name => performance.mark(`${name}:start`)", trace_marker)
                page.mouse.move(start_x, start_y)
                page.mouse.down()
                steps = 48
                for step in range(1, steps + 1):
                    progress = step / steps
                    x = start_x + direction * box["width"] * .30 * progress
                    y = start_y + np.sin(progress * np.pi * 4) * min(28, box["height"] * .07)
                    page.mouse.move(x, y)
                    page.wait_for_timeout(12)
                page.mouse.up()
                page.evaluate("name => {performance.mark(`${name}:end`);performance.measure(name,`${name}:start`,`${name}:end`)}", trace_marker)
                frame_intervals = page.evaluate("""() => {const sample=window.__VIGIA_CDP_DRAG_FRAME_SAMPLE__;if(!sample)return [];sample.active=false;return sample.frames.slice();}""")
                page.wait_for_timeout(50)  # nested post-render rAF settles here
                after = node.evaluate("""node => ({
                  instance:node.dataset.mapInstanceId, center:node.dataset.mapCenter,
                  mounts:Number(node.dataset.mapMountCount||0), destroys:Number(node.dataset.mapDestroyCount||0),
                  styleReloads:Number(node.dataset.mapStyleReloadCount||0), sourceUpdates:Number(node.dataset.mapSourceUpdateCount||0),
                  routeRendersDuringDrag:Number(node.dataset.mapRouteRendersDuringDrag||0),
                  pointerSamples:(()=>{try{return JSON.parse(node.dataset.mapPointerToPostRenderSamples||'[]')}catch{return[]}})()
                })""")
                pointer_samples = after["pointerSamples"][len(before["pointerSamples"]):]
                trials.append({
                    "route": route, "trial": trial_index + 1, "traceMarker": trace_marker, "continuousPointerMoves": steps,
                    "frameIntervalsMs": frame_intervals, "pointerToPostRenderMs": pointer_samples,
                    "before": {key: value for key, value in before.items() if key != "pointerSamples"},
                    "after": {key: value for key, value in after.items() if key != "pointerSamples"},
                    "nativeDrag": before.get("center") != after.get("center"),
                    "instancePreserved": before.get("instance") == after.get("instance"),
                    "styleReloadDelta": after.get("styleReloads", 0) - before.get("styleReloads", 0),
                    "destroyDelta": after.get("destroys", 0) - before.get("destroys", 0),
                })
    finally:
        session.send("Tracing.end")
        # The stream handle is emitted only after Chrome has finalized the
        # complete trace.  Slow software-rendered Docker runs have crossed the
        # old one-minute boundary, so retain the full evidence rather than
        # converting a valid trace into a collection-race failure.
        deadline = time.monotonic() + 180
        while not completion.get("stream") and time.monotonic() < deadline:
            page.wait_for_timeout(50)
        stream = completion.get("stream")
        if not stream:
            session.detach()
            raise RuntimeError("visual_qa_cdp_trace_stream_missing")
        chunks: list[bytes] = []
        while True:
            part = session.send("IO.read", {"handle": stream})
            value = part.get("data", "")
            chunks.append(base64.b64decode(value) if part.get("base64Encoded") else value.encode("utf-8"))
            if part.get("eof"):
                break
        session.send("IO.close", {"handle": stream})
        session.detach()
    raw_trace = json.loads(gzip.decompress(b"".join(chunks)))
    if not isinstance(raw_trace, dict) or not isinstance(raw_trace.get("traceEvents"), list) or not raw_trace["traceEvents"]:
        raise RuntimeError("visual_qa_cdp_trace_events_missing")
    for trial in trials:
        trial["traceCorrelation"] = correlate_trace_trial(raw_trace["traceEvents"], trial["traceMarker"])
    correlated_frame_samples = [
        sample for trial in trials
        for sample in trial["traceCorrelation"]["frameIntervalsMs"]
    ]
    correlated_input_to_paint_samples = [
        sample for trial in trials
        for sample in trial["traceCorrelation"]["inputToPaintMs"]
    ]
    classification = renderer_classification(renderers)
    hardware_path = {
        "browser": version.get("product") or getattr(browser, "version", None), "userAgent": version.get("userAgent"),
        "mapEngine": "MapLibre GL 6.7.0", "renderers": renderers, "renderer": renderers[0] if renderers else None,
        "rendererClassification": classification, "hardwareAccelerationRequired": True, "browserMode": browser_mode,
    }
    metadata = {
        "schemaVersion": "vigia.chrome-devtools-map-drag-trace.v1", "source": "CHROME_DEVTOOLS_PROTOCOL",
        "capturedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), **identity,
        "categories": CDP_TRACE_CATEGORIES.split(","), "routes": CDP_DRAG_ROUTES,
        "routeCount": len(CDP_DRAG_ROUTES), "trialsPerRoute": CDP_DRAG_TRIALS_PER_ROUTE,
        "trialCount": len(trials), "trials": trials, "hardwareSoftwarePath": hardware_path,
        "correlationState": "PASS" if all(trial["traceCorrelation"]["state"] == "CORRELATED" for trial in trials) else "FAIL",
        "correlatedFrameSampleCount": len(correlated_frame_samples),
        "correlatedInputToPaintSampleCount": len(correlated_input_to_paint_samples),
        "environmentState": "PASS" if classification == "HARDWARE" else "HARDWARE_PATH_UNAVAILABLE",
        "rawEventCount": len(raw_trace["traceEvents"]),
    }
    raw_trace["vigiaMetadata"] = metadata
    trace_path.write_text(json.dumps(raw_trace, separators=(",", ":")) + "\n", encoding="utf-8")
    return {
        **{key: value for key, value in metadata.items() if key != "trials"}, "trials": trials,
        "path": str(trace_path.relative_to(ROOT)), "sha256": f"sha256:{sha256(trace_path)}",
    }


def fieldnet_lite_browser_exercise(context, identity: dict, output: Path) -> dict:
    harness = ROOT / "scripts" / "visual-qa" / "fieldnet_lite_browser_harness.mjs"
    environment = {
        **os.environ,
        "VIGIA_RELEASE_ID": identity["releaseId"],
        "VIGIA_CODE_STATE_HASH": identity["codeStateHash"],
        "VIGIA_OPERATIONAL_DATA_HASH": identity["operationalDataHash"],
        "VIGIA_APPROVED_RELEASE_STATEMENT_SHA256": identity["releaseStatementHash"],
    }
    process = subprocess.Popen(
        ["node", str(harness)], cwd=ROOT, env=environment,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    try:
        deadline = time.monotonic() + 20
        ready = None
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeError(f"fieldnet_lite_browser_harness_exited:{process.returncode}:{process.stderr.read()[:1000]}")
            readable, _, _ = select.select([process.stdout], [], [], 0.25)
            if not readable:
                continue
            line = process.stdout.readline().strip()
            if not line:
                continue
            event = json.loads(line)
            if event.get("event") == "FIELDNET_LITE_BROWSER_VQA_READY":
                ready = event
                break
        if not ready:
            raise RuntimeError("fieldnet_lite_browser_harness_timeout")
        release = ready.get("release", {})
        identity_match = all(release.get(key) == value for key, value in identity.items())
        page = context.new_page()
        context.grant_permissions(["geolocation"], origin=urllib.parse.urlsplit(ready["url"]).scheme + "://" + urllib.parse.urlsplit(ready["url"]).netloc)
        context.set_geolocation({"longitude": -8.6, "latitude": 41.1, "accuracy": 7})
        page.goto(ready["url"], wait_until="domcontentloaded", timeout=30_000)
        page.wait_for_selector("#session-status:text-is('Protected')", timeout=15_000)
        page.wait_for_function("() => document.querySelector('#task-count')?.textContent === '1'", timeout=15_000)
        page.wait_for_function("() => document.querySelector('#location-value')?.textContent !== 'Not captured'", timeout=15_000)
        rendered = page.locator("h1").inner_text() == "Field reporting" and page.locator("#report-heading").is_visible()
        initial_task = page.locator('[data-task-id="task:isolated-browser-vqa:road"]')
        task_visible = initial_task.count() == 1 and initial_task.locator('[data-task-action="accept"]').is_enabled()
        context.set_offline(True)
        page.locator('[data-view="tasks"]').click()
        initial_task.locator('[data-task-action="accept"]').click()
        page.locator('[data-view="report"]').click()
        page.locator("#report-type").select_option("ROAD_ACCESS")
        page.locator('[name="roadId"]').fill("N2:isolated-browser-vqa")
        page.locator("#linked-task").select_option("task:isolated-browser-vqa:road")
        page.locator("#report-form").evaluate("form => form.requestSubmit()")
        page.wait_for_function("() => Number(document.querySelector('#queue-count')?.textContent) >= 2")
        page.locator('[data-view="tasks"]').click()
        page.locator('[data-task-id="task:isolated-browser-vqa:road"] [data-task-action="complete"]').click()
        page.locator('[data-view="queue"]').click()
        page.wait_for_function("() => Number(document.querySelector('#queue-count')?.textContent) >= 3")
        offline_queue_count = int(page.locator("#queue-count").inner_text())
        offline_path = output / "interaction-evidence" / "fieldnet-lite-offline-queue.png"
        offline_path.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(offline_path), full_page=True, animations="disabled")
        context.set_offline(False)
        page.locator("#sync-now").click()
        page.wait_for_function("() => document.querySelector('#queue-count')?.textContent === '0'", timeout=15_000)
        acknowledged = page.locator(".queue-card.is-sent").count()
        online_path = output / "interaction-evidence" / "fieldnet-lite-synchronized.png"
        page.screenshot(path=str(online_path), full_page=True, animations="disabled")
        page.close()
        state = "PASS" if identity_match and rendered and task_visible and offline_queue_count >= 3 and acknowledged >= 3 else "FAIL"
        return {
            "schemaVersion": "vigia.fieldnet-lite-browser-exercise.v1", "state": state,
            **identity, "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "universe": "ISOLATED_BROWSER_EXERCISE", "productionTruth": False,
            "incidentId": ready.get("incidentId"), "deviceId": ready.get("deviceId"),
            "renderedFieldInterface": rendered, "protectedSession": True, "taskVisibleAndActionable": task_visible,
            "offlineQueueCount": offline_queue_count, "synchronizedReceiptCount": acknowledged,
            "offlineScreenshot": str(offline_path.relative_to(ROOT)), "synchronizedScreenshot": str(online_path.relative_to(ROOT)),
            "offlineScreenshotSha256": f"sha256:{sha256(offline_path)}", "synchronizedScreenshotSha256": f"sha256:{sha256(online_path)}",
            "truthBoundary": "This browser exercise proves the isolated phone interface, offline queue, task acknowledgement, linked report, completion, and local node receipts. It is not production field evidence, central admission, dispatch, authority, or outcome.",
        }
    finally:
        try:
            context.set_offline(False)
        except Exception:
            pass
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


def main() -> int:
    capture = load_capture_module()
    output = Path(os.environ.get("VIGIA_FINAL_WHITE_OUTPUT", OUTPUT_ROOT)).resolve()
    if ROOT not in output.parents:
        raise RuntimeError("final_white_output_outside_repository")
    output.mkdir(parents=True, exist_ok=True)
    operator_port = int(os.environ.get("VIGIA_VQA_OPERATOR_PORT", "4190"))
    proxy_port = int(os.environ.get("VIGIA_VQA_PROXY_PORT", "47831"))
    upstream_host = os.environ.get("VIGIA_VQA_UPSTREAM_HOST", "host.docker.internal")
    server, thread = capture.start_proxy("canonical", proxy_port, upstream_host, operator_port, {})
    capture.wait_proxy(proxy_port)
    origin = f"http://127.0.0.1:{proxy_port}"
    summary = {"schemaVersion": "vigia.final-white-visual-qa.v1", "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "origin": origin, "viewport": VIEWPORT, "routes": {}, "responsiveMatrix": [], "interactions": {}, "console": [], "pageErrors": [], "httpFailures": []}
    try:
        with sync_playwright() as playwright:
            browser_executable = os.environ.get("VIGIA_VQA_BROWSER_EXECUTABLE", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
            cdp_url = os.environ.get("VIGIA_VQA_CDP_URL", "").strip()
            launched_browser = not cdp_url
            if cdp_url:
                browser = playwright.chromium.connect_over_cdp(cdp_url)
            else:
                launch_options = {"headless": True}
                if Path(browser_executable).is_file():
                    launch_options["executable_path"] = browser_executable
                browser = playwright.chromium.launch(**launch_options)
            context = browser.new_context(viewport=VIEWPORT, device_scale_factor=1, color_scheme="light", reduced_motion="reduce", locale="en-US", timezone_id=OPERATOR_TIMEZONE, service_workers="block", bypass_csp=True)
            page = context.new_page()
            def bind_page_events(candidate):
                candidate.on("console", lambda message: summary["console"].append({"type": message.type, "text": message.text}) if message.type in ("error", "warning") else None)
                candidate.on("pageerror", lambda error: summary["pageErrors"].append(str(error)))
                def record_response(response):
                    if response.status < 400:
                        return
                    request = response.request
                    fragment = urllib.parse.urlsplit(candidate.url).fragment.split("?", 1)[0].lstrip("/")
                    summary["httpFailures"].append({
                        "status": response.status,
                        "url": response.url.split("?", 1)[0],
                        "route": fragment,
                        "method": request.method,
                        "resourceType": request.resource_type,
                    })
                candidate.on("response", record_response)
            bind_page_events(page)
            admission = capture.one_time_admission(capture.read_secret())
            admission_response = page.goto(f"{origin}/?admission={urllib.parse.quote(admission)}", wait_until="domcontentloaded", timeout=40_000)
            if admission_response is None or admission_response.status >= 400:
                status = admission_response.status if admission_response is not None else "NO_RESPONSE"
                raise RuntimeError(f"visual_qa_operator_admission_failed:{status}:{page.url}")
            # Chromium can complete the admitted document before reporting the
            # fragment-only Location transition through Playwright. Navigate to
            # the canonical hash explicitly; the admission cookie is already set.
            page.goto(f"{origin}/#/command-overview", wait_until="domcontentloaded", timeout=40_000)
            page.add_style_tag(content="*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;scroll-behavior:auto!important}")
            settle(page, "command-overview")
            identity_response = page.request.get(f"{origin}/__operator/ready")
            summary["releaseIdentity"] = identity_response.json() if identity_response.ok else {"status": identity_response.status}
            identity_binding = {key: summary["releaseIdentity"].get(key) for key in ("releaseId", "codeStateHash", "operationalDataHash", "releaseStatementHash")}
            if not all(identity_binding.values()):
                raise RuntimeError(f"visual_qa_release_identity_incomplete:{identity_binding}")
            fieldnet_origin = os.environ.get("VIGIA_VQA_FIELDNET_ORIGIN", "http://127.0.0.1:4188").rstrip("/")
            fieldnet_url = urllib.parse.urlsplit(fieldnet_origin)
            fieldnet_authority = f"127.0.0.1:{fieldnet_url.port or 4188}"
            fieldnet_headers = {"accept": "application/json", "host": fieldnet_authority}
            fieldnet_ready_response = page.request.get(f"{fieldnet_origin}/ready", headers=fieldnet_headers, timeout=12_000)
            fieldnet_release_response = page.request.get(f"{fieldnet_origin}/api/fieldnet/release", headers=fieldnet_headers, timeout=12_000)
            fieldnet_ready = fieldnet_ready_response.json() if fieldnet_ready_response.ok else {"status": fieldnet_ready_response.status}
            fieldnet_release = fieldnet_release_response.json() if fieldnet_release_response.ok else {"status": fieldnet_release_response.status}
            fieldnet_runtime_pass = (
                fieldnet_ready_response.status == 200
                and fieldnet_release_response.status == 200
                and fieldnet_ready.get("ready") is True
                and all(fieldnet_ready.get(key) == identity_binding[key] for key in identity_binding)
                and all(fieldnet_release.get(key) == identity_binding[key] for key in identity_binding)
            )
            summary["fieldNetRuntimeEvidence"] = {
                "schemaVersion": "vigia.fieldnet-browser-runtime-evidence.v1",
                "state": "PASS" if fieldnet_runtime_pass else "FAIL",
                "origin": fieldnet_origin,
                "readinessStatus": fieldnet_ready_response.status,
                "releaseStatus": fieldnet_release_response.status,
                "readiness": fieldnet_ready,
                "release": fieldnet_release,
                "identityMatches": fieldnet_runtime_pass,
                "surfaceClass": "DIRECT_FIELDNET_RUNTIME_READINESS_PLUS_REQUIRED_INTEGRATED_FIELDNET_TEST",
                **identity_binding,
            }
            summary["fieldNetLiteBrowserExercise"] = fieldnet_lite_browser_exercise(context, identity_binding, output)
            summary.update(identity_binding)
            for directory, route, reference_name in ROUTES:
                route_dir = output / directory
                route_dir.mkdir(parents=True, exist_ok=True)
                target = route_dir / "target.png"
                current = route_dir / "current.png"
                overlay = route_dir / "overlay-50.png"
                difference = route_dir / "difference.png"
                masked_difference = route_dir / "masked-difference.png"
                shutil.copyfile(REFERENCE_ROOT / reference_name, target)
                page.set_viewport_size(VIEWPORT)
                if route == "incident-detail":
                    incident_row = page.locator('.incident-table__row[data-action^="inspect-incident:"]').first
                    if incident_row.count():
                        selected_id = (incident_row.get_attribute("data-action") or "").split(":", 1)[-1]
                        incident_row.click()
                        page.wait_for_function("id => document.querySelector('.tile-map')?.dataset.mapSelectedIncident === id", arg=selected_id, timeout=10_000)
                navigate_route(page, route)
                settle(page, route)
                page.screenshot(path=str(current), full_page=False, animations="disabled")
                mask = map_mask_report(page)
                metrics = image_artifacts(target, current, overlay, difference, masked_difference, mask)
                map_states = map_transport_report(page)
                map_artifacts = None
                if page.locator('.tile-map').count():
                    map_current = route_dir / "map-current.png"
                    map_target = route_dir / "map-target-region.png"
                    map_overlay = route_dir / "map-overlay-50.png"
                    map_difference = route_dir / "map-difference.png"
                    for capture_attempt in range(3):
                        tile_map = page.locator('.tile-map').first
                        try:
                            tile_map.screenshot(path=str(map_current), animations="disabled")
                            box = tile_map.bounding_box()
                            break
                        except Exception as error:
                            if "not attached to the DOM" not in str(error) or capture_attempt == 2:
                                raise
                            page.wait_for_timeout(180)
                    if box:
                        with Image.open(target).convert("RGB") as target_image:
                            crop_box = (round(box["x"]), round(box["y"]), round(box["x"] + box["width"]), round(box["y"] + box["height"]))
                            target_crop = target_image.crop(crop_box)
                            target_crop.save(map_target)
                        with Image.open(map_current).convert("RGB") as current_crop:
                            if target_crop.size == current_crop.size:
                                Image.blend(target_crop, current_crop, 0.5).save(map_overlay)
                                crop_delta = np.abs(np.asarray(target_crop,dtype=np.int16)-np.asarray(current_crop,dtype=np.int16))
                                Image.fromarray(np.minimum(crop_delta*4,255).astype(np.uint8)).save(map_difference)
                    map_artifacts = {"current":str(map_current.relative_to(ROOT)),"targetRegion":str(map_target.relative_to(ROOT)),"overlay50":str(map_overlay.relative_to(ROOT)),"difference":str(map_difference.relative_to(ROOT))}
                metrics.update({"route": route, "dom": dom_report(page), "mapMask": mask, "mapStates": map_states, "artifacts": {"target": str(target.relative_to(ROOT)), "current": str(current.relative_to(ROOT)), "overlay50": str(overlay.relative_to(ROOT)), "difference": str(difference.relative_to(ROOT)), "maskedDifference":str(masked_difference.relative_to(ROOT)), "map":map_artifacts}, **identity_binding})
                (route_dir / "metrics.json").write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
                (route_dir / "geometry-report.json").write_text(json.dumps({**geometry_report(page, route), **identity_binding}, indent=2) + "\n", encoding="utf-8")
                (route_dir / "style-report.json").write_text(json.dumps({**style_report(page, route), **identity_binding}, indent=2) + "\n", encoding="utf-8")
                summary["routes"][route] = metrics
            for width, height in RESPONSIVE:
                page.set_viewport_size({"width": width, "height": height})
                for _, route, _ in ROUTES:
                    navigate_route(page, route)
                    settle(page, route, False)
                    responsive_entry = {"route": route, "viewport": {"width": width, "height": height}, **dom_report(page)}
                    if (width, height) in {(768, 1024), (390, 844), (320, 568)}:
                        responsive_path = output / "responsive" / f"{width}x{height}" / f"{route}.png"
                        responsive_path.parent.mkdir(parents=True, exist_ok=True)
                        page.screenshot(path=str(responsive_path), full_page=False, animations="disabled")
                        responsive_entry["screenshot"] = str(responsive_path.relative_to(ROOT))
                    summary["responsiveMatrix"].append(responsive_entry)
            page.close()
            page = context.new_page(); bind_page_events(page)
            page.goto(f"{origin}/#/command-overview", wait_until="domcontentloaded", timeout=40_000)
            page.add_style_tag(content="*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;scroll-behavior:auto!important}")
            settle(page, "command-overview")
            captured_response_incident_ids = []
            for map_state in summary.get("routes", {}).get("operations", {}).get("mapStates", []):
                scene_identity = str(map_state.get("sceneIdentity") or "")
                marker = ":incident:"
                if marker in scene_identity:
                    captured_incident_id = f"incident:{scene_identity.split(marker, 1)[1]}"
                    if captured_incident_id not in captured_response_incident_ids:
                        captured_response_incident_ids.append(captured_incident_id)
            summary["interactions"] = executive_interactions(
                page, origin, output, identity_binding, captured_response_incident_ids
            )
            page.close()
            page = context.new_page(); bind_page_events(page)
            page.goto(f"{origin}/#/command-overview", wait_until="domcontentloaded", timeout=40_000)
            page.add_style_tag(content="*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;scroll-behavior:auto!important}")
            page.set_viewport_size(VIEWPORT)
            settle(page, "command-overview")
            summary["mapTrace"] = capture_cdp_map_drag_trace(
                page, context, browser, output, identity_binding,
                "CONNECTED_CDP" if cdp_url else "HEADLESS_LOCAL_CHROME",
            )
            context.close()
            if launched_browser:
                browser.close()
    finally:
        server.shutdown(); server.server_close(); thread.join(timeout=2)
    def interaction_pass(value):
        if isinstance(value, bool): return value
        if isinstance(value, dict):
            if "pass" in value: return bool(value["pass"])
            return all(interaction_pass(item) for item in value.values())
        return False

    final_map_states = {route: result.get("mapStates", []) for route, result in summary["routes"].items()}
    expected_map_http_failures, recovered_map_http_failures, unexpected_http_failures = [], [], []
    for failure in summary["httpFailures"]:
        is_map_request = "/backend/api/v1/basemap/" in failure["url"] or "/backend/api/v10/events/thermal/overlay" in failure["url"]
        states = final_map_states.get(failure.get("route"), [])
        governed_map_503 = (
            is_map_request
            and failure.get("status") == 503
            and failure.get("method") == "GET"
            and failure.get("resourceType") == "fetch"
            and map_capture_is_settled(states)
        )
        if governed_map_503 and map_capture_is_fully_live(states):
            recovered_map_http_failures.append(failure)
        elif governed_map_503:
            expected_map_http_failures.append(failure)
        else:
            unexpected_http_failures.append(failure)
    summary["expectedMapHttpFailures"] = expected_map_http_failures
    summary["recoveredMapHttpFailures"] = recovered_map_http_failures
    summary["unexpectedHttpFailures"] = unexpected_http_failures

    summary["gates"] = {
        "freshRuntimeScreenshots": len(summary["routes"]) == 7 and all(item["dimensions"] == VIEWPORT for item in summary["routes"].values()),
        "sevenPrimaryRoutes": all(item["dom"]["semantics"]["primaryNavLinks"] == 7 for item in summary["routes"].values()),
        "noRouteNumbers": all(not item["dom"]["routeNumbers"] for item in summary["routes"].values()),
        "removedPrimaryRoutesAbsent": all(not item["dom"]["removedPrimaryRoutes"] for item in summary["routes"].values()),
        "horizontalOverflow": all(item["horizontalOverflowPx"] <= 1 for item in summary["responsiveMatrix"]),
        "semantics": all(item["semantics"]["mainCount"] == 1 and item["semantics"]["h1Count"] == 1 and not item["semantics"]["duplicateIds"] and item["semantics"]["unnamedControlCount"] == 0 for item in summary["responsiveMatrix"]),
        "interactions": all(interaction_pass(value) for value in summary["interactions"].values()),
        "pageErrors": not summary["pageErrors"],
        "unexpectedHttpFailures": not unexpected_http_failures,
    }

    def measured_distribution(values: list[float]) -> dict:
        measured = sorted(float(value) for value in values if isinstance(value, (int, float)) and np.isfinite(value) and value >= 0)
        if not measured:
            return {"p50Ms": None, "p95Ms": None, "maxMs": None, "samples": 0, "varianceMs2": None, "rawSamplesMs": []}
        at = lambda fraction: measured[min(len(measured) - 1, max(0, int(np.ceil(len(measured) * fraction)) - 1))]
        return {
            "p50Ms": round(at(.5), 2),
            "p95Ms": round(at(.95), 2),
            "maxMs": round(max(measured), 2),
            "samples": len(measured),
            "varianceMs2": round(float(np.var(measured)), 2),
            "rawSamplesMs": [round(value, 2) for value in measured],
        }

    interactions = summary["interactions"]
    runtime_telemetry = interactions.get("runtimeTelemetry", {})
    executive_telemetry = runtime_telemetry.get("executive") or {}
    quicklook_samples = [entry.get("dataMs") for entry in executive_telemetry.get("quicklook", []) if isinstance(entry, dict)]
    incident_switch_samples = [
        entry.get("durationMs") if entry.get("prefetched") is True else entry.get("enrichmentMs")
        for entry in executive_telemetry.get("incidentSwitches", []) if isinstance(entry, dict)
    ]
    map_drag_proofs = interactions.get("mapDrag", {})
    trace_trials = summary.get("mapTrace", {}).get("trials", [])
    pointer_samples = [sample for trial in trace_trials for sample in trial.get("traceCorrelation", {}).get("inputToPaintMs", [])]
    frame_samples = [sample for trial in trace_trials for sample in trial.get("traceCorrelation", {}).get("frameIntervalsMs", [])]
    quicklook_performance = measured_distribution(quicklook_samples)
    switch_performance = measured_distribution(incident_switch_samples)
    pointer_performance = measured_distribution(pointer_samples)
    frame_performance = measured_distribution(frame_samples)
    quicklook_performance["cohort"] = {
        "distinctIncidents": len({entry.get("incidentId") for entry in executive_telemetry.get("quicklook", []) if entry.get("incidentId")}),
        "distinctRoutes": len({entry.get("route") for entry in executive_telemetry.get("quicklook", []) if entry.get("route")}),
        "repeatedRunsPerRouteTarget": 7,
    }
    switch_performance["cohort"] = {
        "distinctIncidents": len({entry.get("incidentId") for entry in executive_telemetry.get("incidentSwitches", []) if entry.get("incidentId")}),
        "distinctRoutes": len({entry.get("route") for entry in executive_telemetry.get("incidentSwitches", []) if entry.get("route")}),
        "repeatedRunsPerRouteTarget": 7,
    }
    pointer_performance["measurementSource"] = "CHROME_DEVTOOLS_PROTOCOL_TRACE_EVENTS"
    frame_performance["measurementSource"] = "CHROME_DEVTOOLS_PROTOCOL_TRACE_EVENTS"
    pointer_performance["measurementDefinition"] = "Each input trace event is correlated to the next paint, raster, draw-frame, or compositor-submit event inside the exact User Timing drag window."
    frame_performance["measurementDefinition"] = "Intervals between compositor/render frame events inside the exact User Timing drag windows in the Chrome trace."
    browser_hardware_path = summary.get("mapTrace", {}).get("hardwareSoftwarePath", {})
    for performance_result in (quicklook_performance, switch_performance, pointer_performance, frame_performance):
        performance_result["cacheState"] = "WARM_CANONICAL_BROWSER_SESSION"
        performance_result["hardwareSoftwarePath"] = browser_hardware_path
    summary["gates"]["chromeDevToolsTrace"] = (
        summary.get("mapTrace", {}).get("source") == "CHROME_DEVTOOLS_PROTOCOL"
        and summary.get("mapTrace", {}).get("rawEventCount", 0) > 0
        and len(trace_trials) == len(CDP_DRAG_ROUTES) * CDP_DRAG_TRIALS_PER_ROUTE
        and all(trial.get("nativeDrag") is True and trial.get("instancePreserved") is True
                and trial.get("styleReloadDelta") == 0 and trial.get("destroyDelta") == 0
                and trial.get("traceCorrelation", {}).get("state") == "CORRELATED"
                and len(trial.get("traceCorrelation", {}).get("frameIntervalsMs", [])) > 0
                and len(trial.get("traceCorrelation", {}).get("inputToPaintMs", [])) > 0 for trial in trace_trials)
    )
    summary["gates"]["hardwareAcceleratedMapTrace"] = browser_hardware_path.get("rendererClassification") == "HARDWARE"

    route_screenshots = [Path(item["artifacts"]["current"]) for item in summary["routes"].values()]
    fresh_route_screenshots = summary["gates"]["freshRuntimeScreenshots"] and len(route_screenshots) == 7 and all((ROOT / item).is_file() for item in route_screenshots)
    all_map_states = [state for route in summary["routes"].values() for state in route.get("mapStates", [])]
    thermal_perimeter_violations = [
        feature for state in all_map_states for feature in state.get("renderedFeatures", [])
        if feature.get("layer") == "thermalSupport" and feature.get("authoritative") is True
    ]
    terrain_coverage = json.loads((ROOT / "data" / "reference" / "operational-proof" / "governed-incident-context.json").read_text(encoding="utf-8")).get("coverage", {})
    selected_terrain_states = [
        state.get("layerTruth", {}).get("layers", {}).get("terrain")
        for route_name in ("incident-detail", "intelligence")
        for state in summary["routes"].get(route_name, {}).get("mapStates", [])
    ]
    selected_terrain_states = [state for state in selected_terrain_states if isinstance(state, dict)]
    terrain_complete = (
        int(terrain_coverage.get("validCoordinates", -1)) > 0
        and int(terrain_coverage.get("terrainAvailable", -2)) == int(terrain_coverage.get("validCoordinates", -1))
        and int(terrain_coverage.get("terrainUnavailable", -1)) == 0
        and len(selected_terrain_states) == 2
        and all(state.get("state") in ("READY", "DEGRADED") and int(state.get("returned") or 0) > 0 for state in selected_terrain_states)
    )
    map_lifecycle_clean = (
        bool(map_drag_proofs)
        and all(proof.get("pass") is True and str(proof.get("after", {}).get("destroys")) == "0" for proof in map_drag_proofs.values())
        and interactions.get("commandQuicklookNoRemount") is True
        and interactions.get("detailIncidentSwitcherABC") is True
        and interactions.get("globalFilterNoMapRemount") is True
    )
    style_reload_clean = bool(map_drag_proofs) and all(str(proof.get("after", {}).get("styleReloads")) == "0" for proof in map_drag_proofs.values())
    mutation_interactions = [
        interactions.get("incidentsSavedFilterEvidence", {}).get("pass"),
        interactions.get("intelligenceViewOnMap"),
        interactions.get("operationsLaneFilter"),
        interactions.get("reportsSectionControl"),
        interactions.get("globalFilterVisibleEffect"),
        interactions.get("globalFitResults"),
    ]
    generic_inspect_controls = [control for route in summary["routes"].values() for control in route.get("dom", {}).get("genericInspectControls", [])]
    map_selection_consistent = all(interactions.get(key) is True for key in (
        "commandPrioritySelectsIncident" if "commandPrioritySelectsIncident" in interactions else "commandQuicklookImmediate",
        "incidentMapSelectionABC",
        "detailIncidentSwitcherABC",
        "intelligenceCarriesSelectionC" if "intelligenceCarriesSelectionC" in interactions else "intelligenceViewOnMap",
    ))
    keyboard_pass = all(interactions.get(key) is True for key in (
        "keyboardDrawerOpen", "keyboardDrawerEscapeClose", "incidentKeyboardSelection", "incidentSearchIdentityCaret",
    ))
    responsive_pass = summary["gates"]["horizontalOverflow"] and summary["gates"]["semantics"] and interactions.get("mobileQuicklook") is True
    state_label_clean = interactions.get("stateLabelEvidence", {}).get("pass") is True
    all_visible_actions = visible_action_inventory(summary)
    unhandled_visible_actions = [item for item in all_visible_actions if item.get("enabled") is True and item.get("knownHandler") is not True]
    visible_consequential_actions = []
    for item in all_visible_actions:
        if item.get("enabled") is not True or not is_consequential_action(item.get("action")):
            continue
        governed = {**item}
        if item.get("observedInControlledExercise") is True:
            governed["disposition"] = "EXECUTED_CONTROLLED_EXERCISE"
            governed["safetyBoundary"] = None
        else:
            governed["disposition"] = "UNEXECUTED_ENABLED_ACTION"
            governed["safetyBoundary"] = None
        visible_consequential_actions.append(governed)
    runtime_action_executions = executive_telemetry.get("actions", []) if isinstance(executive_telemetry.get("actions"), list) else []
    runtime_unknown_actions = executive_telemetry.get("unknownActions", []) if isinstance(executive_telemetry.get("unknownActions"), list) else []
    action_capture_completed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    handler_contract = action_handler_contract()
    action_integrity = {
        "schemaVersion": CONSEQUENTIAL_ACTION_EVIDENCE_SCHEMA,
        "generatedAt": summary["generatedAt"],
        "completedAt": action_capture_completed_at,
        **{key: summary[key] for key in ("releaseId", "codeStateHash", "operationalDataHash", "releaseStatementHash")},
        "universe": "CANONICAL_OPERATOR_RUNTIME",
        "classificationPolicy": {
            "included": ["command-intent-create", "response-recommendation-review", "planning-proposal-review", "human-attention-*", "period-*", "protection-* canonical mutations"],
            "excluded": ["navigation", "filters", "map camera/layer controls", "dialog open/close", "CAP local draft validation"],
            "matching": "Every enabled consequential data-action in the complete visible route inventory must have an exact route + uiAction controlled-exercise execution and receipt. A non-exercised consequential action must be visibly disabled with a reason.",
        },
        "handlerInventory": {
            "contract": handler_contract["contract"],
            "sources": handler_contract["sources"],
            "sourceSha256": handler_contract["sourceSha256"],
            "visibleActionCount": len(all_visible_actions),
            "knownHandlerCount": sum(1 for item in all_visible_actions if item.get("knownHandler") is True),
        },
        "visibleActionInventory": all_visible_actions,
        "visibleConsequentialActions": visible_consequential_actions,
        "executions": runtime_action_executions,
        "controlledExercise": interactions.get("consequentialActionExercise"),
        "unknownActions": runtime_unknown_actions,
        "unhandledVisibleActions": unhandled_visible_actions,
    }
    action_validation = validate_consequential_action_evidence(action_integrity)
    action_integrity["state"] = action_validation["state"]
    action_integrity["validation"] = action_validation
    action_evidence_path = output / "interaction-evidence" / "consequential-actions.json"
    action_evidence_path.write_text(json.dumps(action_integrity, indent=2) + "\n", encoding="utf-8")
    dead_controls_zero = not unhandled_visible_actions and not runtime_unknown_actions
    consequential_actions_receipt_backed = action_validation["state"] == "PASS"
    summary["gates"]["consequentialActionReceipts"] = consequential_actions_receipt_backed
    capability_names = (
        "crisisAutopilot", "valueOfInformation", "livingIncidentTwin", "decisionCompression",
        "regretRadar", "decisionHalfLife", "uncertaintyBudget", "sentinel", "fieldNetLite",
        "trustedObserver", "twoWayTasking", "dynamicExposureGraph", "crisisDependencyGraph",
        "modelDisagreement", "realityReconciliation", "commandByIntent", "operationalPeriodGenerator",
        "responseCapability", "resourceOptimizerOutput", "autonomousReplanning", "evacuationCorridor",
        "protectionTimeline", "capLifecycle", "multilingualComposer", "actionOutcomeLedger", "nearMiss", "prevention",
    )
    operator_capability_evidence = {}
    for capability_name in capability_names:
        observations = [
            {"route": route_name, **route.get("dom", {}).get("capabilities", {}).get(capability_name, {})}
            for route_name, route in summary["routes"].items()
            if route.get("dom", {}).get("capabilities", {}).get(capability_name, {}).get("visibleCount", 0) > 0
        ]
        usable_observations = [
            item for item in observations
            if not re.search(r"(?:^|_)(WITHHELD|UNAVAILABLE|NOT_AVAILABLE|NOT_APPLICABLE|ABSTAINED|INVALID)(?:_|$)", str(item.get("projectedState", "")).upper())
        ]
        operator_capability_evidence[capability_name] = {
            "state": "PASS" if usable_observations and any(item.get("textLength", 0) >= 20 and item.get("contentMatch") is True and item.get("featureSpecificNode") is True and item.get("projectedState") for item in usable_observations) else "FAIL",
            "observations": observations,
        }
    fieldnet_runtime = summary.get("fieldNetRuntimeEvidence", {})
    fieldnet_browser = summary.get("fieldNetLiteBrowserExercise", {})
    for capability_name in ("fieldNetLite", "trustedObserver", "twoWayTasking"):
        operator_capability_evidence[capability_name] = {
            "state": fieldnet_browser.get("state", "FAIL"),
            "observations": [{
                "route": "fieldnet-lite-isolated-browser-exercise",
                "selector": "#session-status, [data-task-id], #queue-count",
                "requiredText": capability_name,
                "visibleCount": 3 if fieldnet_browser.get("state") == "PASS" else 0,
                "textLength": len(json.dumps(fieldnet_browser)),
                "contentMatch": fieldnet_browser.get("state") == "PASS",
                "featureSpecificNode": fieldnet_browser.get("state") == "PASS",
                "matchedText": f'{capability_name}: rendered protected field UI with task, offline queue, linked report, completion, and node receipts.',
                "projectedState": "ISOLATED_BROWSER_EXERCISE_PASS" if fieldnet_browser.get("state") == "PASS" else "NOT_EXERCISED",
                "surfaceClass": "DIRECT_FIELDNET_LITE_BROWSER_EXERCISE",
            }],
        }
    acceptance = {
        "schemaVersion": "vigia.anduril-class-browser-acceptance.v1",
        "generatedAt": summary["generatedAt"],
        **{key: summary[key] for key in ("releaseId", "codeStateHash", "operationalDataHash", "releaseStatementHash")},
        "freshSevenRouteScreenshots": fresh_route_screenshots,
        "deadControlsZero": dead_controls_zero,
        "consequentialActionsReceiptBacked": consequential_actions_receipt_backed,
        "actionIntegrity": action_integrity,
        "operatorCapabilityEvidence": operator_capability_evidence,
        "fieldNetRuntimeEvidence": fieldnet_runtime,
        "fieldNetLiteBrowserExercise": fieldnet_browser,
        "toastOnlyMutationsZero": all(value is True for value in mutation_interactions),
        "genericInspectZero": not generic_inspect_controls,
        "mapListQuicklookMismatchZero": map_selection_consistent,
        "thermalPixelsAsPerimeterZero": not thermal_perimeter_violations,
        "terrainMissingForValidCoveredCoordinatesZero": terrain_complete,
        "statusLabelLayoutDefectsZero": state_label_clean,
        "mapRemountsZero": map_lifecycle_clean,
        "styleReloadsZero": style_reload_clean,
        "keyboardPass": keyboard_pass,
        "responsivePass": responsive_pass,
        "performance": {
            "quicklookUsefulContent": quicklook_performance,
            "incidentSwitchUsefulContent": switch_performance,
            "mapPointerToPaint": pointer_performance,
            "mapDragFrameTime": frame_performance,
            "chromeTrace": {
                key: value for key, value in summary.get("mapTrace", {}).items() if key != "trials"
            },
        },
        "evidence": {
            "visualQaSummary": str((output / "visual-qa-summary.json").relative_to(ROOT)),
            "routeScreenshots": [str(item) for item in route_screenshots],
            "interactionEvidenceDirectory": str((output / "interaction-evidence").relative_to(ROOT)),
            "consequentialActionEvidence": str(action_evidence_path.relative_to(ROOT)),
            "chromeTrace": summary.get("mapTrace", {}).get("path"),
            "mapDrag": map_drag_proofs,
            "mutationInteractions": mutation_interactions,
            "genericInspectControls": generic_inspect_controls,
            "thermalPerimeterViolations": thermal_perimeter_violations,
            "terrainCoverage": terrain_coverage,
            "selectedTerrainStates": selected_terrain_states,
        },
    }
    acceptance["state"] = "PASS" if all(acceptance[key] is True for key in (
        "freshSevenRouteScreenshots", "deadControlsZero", "toastOnlyMutationsZero", "genericInspectZero",
        "mapListQuicklookMismatchZero", "thermalPixelsAsPerimeterZero", "terrainMissingForValidCoveredCoordinatesZero",
        "statusLabelLayoutDefectsZero", "mapRemountsZero", "styleReloadsZero", "keyboardPass", "responsivePass",
        "consequentialActionsReceiptBacked",
    )) and quicklook_performance["samples"] >= 20 and quicklook_performance["cohort"]["distinctIncidents"] >= 3 and quicklook_performance["cohort"]["distinctRoutes"] >= 2 and quicklook_performance["p95Ms"] < 500 and switch_performance["samples"] >= 20 and switch_performance["cohort"]["distinctIncidents"] >= 3 and switch_performance["cohort"]["distinctRoutes"] >= 2 and switch_performance["p95Ms"] < 750 and pointer_performance["samples"] >= 20 and pointer_performance["p95Ms"] < 20 and frame_performance["samples"] >= 20 and frame_performance["p95Ms"] <= 20 and summary["gates"]["chromeDevToolsTrace"] and browser_hardware_path.get("rendererClassification") == "HARDWARE" else "FAIL"
    if fieldnet_runtime.get("state") != "PASS":
        acceptance["state"] = "FAIL"
    if fieldnet_browser.get("state") != "PASS":
        acceptance["state"] = "FAIL"
    (output / "visual-qa-summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    anduril_browser = ROOT / ".artifacts" / "anduril-class-crisis-os" / "browser"
    anduril_browser.mkdir(parents=True, exist_ok=True)
    (anduril_browser / "acceptance.json").write_text(json.dumps(acceptance, indent=2) + "\n", encoding="utf-8")
    world_browser = ROOT / ".artifacts" / "world-leader-gap-closure" / "browser"
    world_interactions = world_browser / "interaction-evidence"
    world_screens = world_browser / "route-screenshots"
    world_interactions.mkdir(parents=True, exist_ok=True)
    world_screens.mkdir(parents=True, exist_ok=True)
    binding = {key: summary[key] for key in ("releaseId", "codeStateHash", "operationalDataHash", "releaseStatementHash")}
    shutil.copyfile(ROOT / summary["mapTrace"]["path"], world_interactions / "map-drag-chrome-trace.json")
    map_proofs = [{"route": route.replace("-", " ").title(), "before": proof.get("before"), "after": proof.get("after"), "pass": proof.get("pass", False)} for route, proof in summary["interactions"]["mapDrag"].items()]
    native_drag = {"schemaVersion": "vigia.world-leader-map-native-drag.v3", "capturedAt": summary["generatedAt"], "engine": "MapLibre GL", "engineVersion": "6.7.0", "frameTiming": summary["mapTrace"], "proofs": map_proofs, **binding}
    (world_interactions / "map-native-drag.json").write_text(json.dumps(native_drag, indent=2) + "\n", encoding="utf-8")
    interaction_exports = {
        "search-caret.json": summary["interactions"].get("incidentSearchIdentityCaret"),
        "global-filter.json": summary["interactions"].get("globalFilterEvidence"),
        "reports-tabs.json": summary["interactions"].get("reportsSectionControl"),
        "last-good-refresh.json": summary["interactions"].get("warmRefreshRetainsContent"),
        "healthy-startup.json": not any("Unavailable" in str(item) for item in summary.get("routes", {}).values()),
        "keyboard-custom-select.json": summary["interactions"].get("keyboardDrawerOpen"),
    }
    for filename, proof in interaction_exports.items():
        (world_interactions / filename).write_text(json.dumps({"schemaVersion": "vigia.fresh-canonical-interaction-evidence.v1", "capturedAt": summary["generatedAt"], "proof": proof, "pass": bool(proof), **binding}, indent=2) + "\n", encoding="utf-8")
    route_names = ["command-overview", "incidents", "incident-detail", "intelligence", "operations", "reports-analytics", "global-awareness"]
    for index, route in enumerate(route_names, start=1):
        source = Path(summary["routes"][route]["artifacts"]["current"])
        with Image.open(ROOT / source).convert("RGB") as route_image:
            route_image.save(world_screens / f"{index:02d}-{route}.jpg", quality=94)
    executive_contract = Path(os.environ.get(
        "VIGIA_EXECUTIVE_CONTRACT",
        ROOT / "data" / "validation" / "frontend-visual-contract" / "executive-ux",
    )).resolve()
    executive_contract.mkdir(parents=True, exist_ok=True)
    task_tests = {
        "schemaVersion": "vigia.executive-ux-task-tests.v1",
        "generatedAt": summary["generatedAt"],
        **binding,
        "pass": all(summary["gates"].values()),
        "gates": summary["gates"],
        "tests": {key: value for key, value in summary["interactions"].items() if key != "runtimeTelemetry"},
    }
    interaction_certification = {
        "schemaVersion": "vigia.executive-ux-interaction-certification.v1",
        "generatedAt": summary["generatedAt"],
        **binding,
        "canonicalTruthSubstituted": False,
        "viewport": VIEWPORT,
        "pass": all(summary["gates"].values()),
        "runtimeTelemetry": summary["interactions"].get("runtimeTelemetry", {}),
        "consequentialActionIntegrity": action_integrity,
        "outcomeLineage": summary["interactions"].get("outcomeLineageEvidence", {}),
        "globalFilter": summary["interactions"].get("globalFilterEvidence", {}),
        "routeScreenshots": {route: item["artifacts"]["current"] for route, item in summary["routes"].items()},
        "interactionEvidenceDirectory": str((output / "interaction-evidence").relative_to(ROOT)),
    }
    (executive_contract / "task-tests.json").write_text(json.dumps(task_tests, indent=2) + "\n", encoding="utf-8")
    (executive_contract / "interaction-certification.json").write_text(json.dumps(interaction_certification, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output.relative_to(ROOT)), "releaseId": summary.get("releaseIdentity", {}).get("releaseId"), "gates": summary["gates"]}, indent=2))
    return 0 if all(summary["gates"].values()) else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"FINAL_WHITE_VISUAL_QA_FAILED: {error}", file=sys.stderr)
        raise
