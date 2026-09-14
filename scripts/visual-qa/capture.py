#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import copy
import hashlib
import hmac
import http.client
import json
import math
import os
import re
import secrets
import select
import shutil
import socket
import socketserver
import stat
import subprocess
import sys
import threading
import time
import urllib.parse
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import TimeoutError as PlaywrightTimeout
from playwright.sync_api import sync_playwright

try:
    import cv2
except ModuleNotFoundError:  # Local source-serving mode has a standards-only fallback.
    cv2 = None

ROOT = Path(os.environ.get("VIGIA_VQA_ROOT", "/workspace")).resolve()
OUTPUT_ROOT = Path(os.environ.get("VIGIA_VQA_OUTPUT", "/output")).resolve()
CONTRACT_PATH = Path(os.environ.get("VIGIA_VQA_CONTRACT", "/contract/vigia-visual-contract.json")).resolve()
REFERENCE_ROOT = ROOT / "DESIGN_SOURCE_OF_TRUTH"
TOOL_ROOT = Path(os.environ.get(
    "VIGIA_VQA_TOOL_ROOT",
    "/opt/vigia-visual-qa" if Path("/opt/vigia-visual-qa").is_dir() else str(ROOT / "scripts" / "visual-qa"),
)).resolve()
FIXTURE_PATH = Path(os.environ.get("VIGIA_VQA_FIXTURE", str(TOOL_ROOT / "golden-fixture.json"))).resolve()
COMPARE_SCRIPT = Path(os.environ.get("VIGIA_VQA_COMPARE", str(TOOL_ROOT / "compare.mjs"))).resolve()
EXTRACT_SCRIPT = Path(os.environ.get("VIGIA_VQA_EXTRACT", str(TOOL_ROOT / "extract_contract.py"))).resolve()
TOKEN_PATH = Path(os.environ.get("VIGIA_VQA_TOKEN", str(ROOT / ".tmp" / "release" / "operator-console-access-token"))).resolve()
GOLDEN_VIEWPORT = {"width": 1672, "height": 941}
RESPONSIVE_VIEWPORTS = [(1672, 941), (1600, 1000), (1440, 900), (1280, 800), (1024, 768), (768, 1024), (430, 932), (390, 844), (320, 568)]
FROZEN_EPOCH_MS = 1747345032000  # 2025-05-15 14:37:12 America/Los_Angeles

ROUTES = [
    ("01-command-overview", "command-overview", "01-command-overview.png"),
    ("02-incidents", "incidents", "02-incidents.png"),
    ("03-intelligence", "intelligence", "03-intelligence.png"),
    ("04-evidence", "evidence", "04-evidence.png"),
    ("05-operations", "operations", "05-operations.png"),
    ("06-incident-detail", "incident-detail", "06-incident-detail.png"),
]

GOLDEN_ROUTE_INCIDENTS = {
    "intelligence": "INC-2025-0515-0012",
    "evidence": "INC-2025-0515-0017",
    "operations": "INC-2025-0515-0012",
    "incident-detail": "INC-2025-0515-0012",
}

EXPECTED_HASHES = {
    "01-command-overview.png": "f8d3bfc501ece4dcf3c80f11ca37f0adc983cbcac021d6d8e8edec44be251eea",
    "02-incidents.png": "bc379fddc4913017175861c730971a62063c4eae5099f01eaa84a6bec551f146",
    "03-intelligence.png": "7c9f87b5df775559d07633e4c54a3b8805f50d38b9a9c981ee18fb14be9449c1",
    "04-evidence.png": "5e4c3dab18e48057cf2f8289503051913785261ac22fdc8b845299cbe6c33983",
    "05-operations.png": "db06284acb27d2168e2d3035ccb317693d4a8cd6a88ec629da50c794926b0b4d",
    "06-incident-detail.png": "ce9942412a5efeef8a72702f2e25638b860c6e18f825c078fc4afe321afb2c12",
}

REQUIRED_VQA = {
    "command-overview": ["shell.sidebar", "shell.header", "shell.main", "shell.navigation", "shell.operator", "shell.system-status", "command.telemetry", "command.map", "command.map.controls", "command.situation", "command.situation.header", "command.situation.body", "command.auto-priority", "command.auto-priority.header", "command.auto-priority.body", "command.watch-for", "command.watch-for.header", "command.watch-for.body", "command.priority-incidents", "command.priority-incidents.header", "command.priority-incidents.body", "command.priority-incidents.columns", "command.readiness", "command.readiness.header", "command.readiness.body", "command.readiness.resources", "command.readiness.tempo"],
    "incidents": ["shell.sidebar", "shell.header", "shell.main", "shell.navigation", "shell.operator", "shell.system-status", "incidents.metrics", "incidents.filters", "incidents.table", "incidents.table.columns", "incidents.table.body", "incidents.map", "incidents.map-canvas", "incidents.map-canvas.controls", "incidents.triage", "incidents.activity"],
    "intelligence": ["shell.sidebar", "shell.header", "shell.main", "shell.navigation", "shell.operator", "shell.system-status", "intelligence.map", "intelligence.map.header", "intelligence.map.stage", "intelligence.map-canvas", "intelligence.map-canvas.controls", "intelligence.map.scenarios", "intelligence.revisions", "intelligence.assumptions", "intelligence.watch-for", "intelligence.implications", "intelligence.hypotheses"],
    "evidence": ["shell.sidebar", "shell.header", "shell.main", "shell.navigation", "shell.operator", "shell.system-status", "evidence.buckets", "evidence.graph", "evidence.graph.header", "evidence.graph.canvas", "evidence.graph.controls", "evidence.graph.legend", "evidence.qualification", "evidence.recent"],
    "operations": ["shell.sidebar", "shell.header", "shell.main", "shell.navigation", "shell.operator", "shell.system-status", "operations.actions", "operations.actions.header", "operations.actions.body", "operations.map", "operations.map.header", "operations.map-canvas", "operations.map-canvas.controls", "operations.readiness", "operations.trend", "operations.handoff", "operations.needs", "operations.logistics"],
    "incident-detail": ["shell.sidebar", "shell.header", "shell.main", "shell.navigation", "shell.operator", "shell.system-status", "detail.header-context", "detail.telemetry", "detail.map", "detail.map.layers", "detail.map-canvas", "detail.map-canvas.controls", "detail.summary", "detail.communities", "detail.evacuation", "detail.thresholds", "detail.timeline", "detail.resources", "detail.changes", "detail.evidence", "detail.weather"],
}

TERMINAL_MAP_STATES = {"LIVE", "DEGRADED_PARTIAL", "STALE_LAST_GOOD", "STRUCTURED_FALLBACK", "UNAVAILABLE"}

EXPECTED_SCENES = {
    "command-overview": {"sceneType": "COMMAND_SITUATION", "zoom": 11, "layers": ["incidentPoints", "observations", "thermalSupport", "wind", "weather"], "controls": ["layers", "focus", "thermal", "measure", "zoom"]},
    "incidents": {"sceneType": "INCIDENT_INSPECTION", "zoom": 10, "layers": ["incidentPoints", "observedGeometry", "thermalSupport", "observations", "weather", "wind", "contextAssets"], "controls": ["layers", "focus", "thermal", "measure", "zoom"]},
    "intelligence": {"sceneType": "INTELLIGENCE_FORECAST", "zoom": 11, "layers": ["incidentPoints", "observedGeometry", "thermalSupport", "observations", "weather", "wind", "terrain", "forecastGeometry", "contextAssets"], "controls": ["layers", "focus", "thermal", "measure", "zoom"]},
    "operations": {"sceneType": "OPERATIONS_ASSIGNMENTS", "zoom": 9, "layers": ["incidentPoints", "operationalAreas", "controlLines", "divisions", "stagingAreas", "bases", "resources", "assignments", "locations", "stagedResources"], "controls": ["layers", "focus", "thermal", "resources", "zoom"]},
    "incident-detail": {"sceneType": "INCIDENT_TACTICAL", "zoom": 12, "layers": ["incidentPoints", "observedGeometry", "thermalSupport", "observations", "weather", "wind", "controlLines", "divisions", "stagingAreas", "bases", "resources", "locations", "roads", "contextAssets"], "controls": ["layers", "focus", "thermal", "measure", "zoom"]},
}


def atomic_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_references() -> dict[str, dict[str, Any]]:
    root = REFERENCE_ROOT.resolve(strict=True)
    actual_files = sorted(item.name for item in REFERENCE_ROOT.glob("*.png"))
    if actual_files != sorted(EXPECTED_HASHES):
        raise RuntimeError(f"visual_reference_set_changed:{actual_files}")
    verified = {}
    for name, expected in EXPECTED_HASHES.items():
        path = REFERENCE_ROOT / name
        if path.is_symlink() or path.resolve(strict=True).parent != root:
            raise RuntimeError(f"visual_reference_path_invalid:{name}")
        actual = sha256(path)
        if actual != expected:
            raise RuntimeError(f"visual_reference_hash_mismatch:{name}:{actual}")
        with Image.open(path) as image:
            if image.size != (1672, 941):
                raise RuntimeError(f"visual_reference_dimensions_changed:{name}:{image.size}")
            image.load()
            verified[name] = {"sha256": actual, "width": image.width, "height": image.height, "bytes": path.stat().st_size}
    return verified


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def one_time_admission(secret: str) -> str:
    now = int(time.time())
    claim = {"v": 1, "aud": "vigia-operator-console", "nonce": secrets.token_hex(24), "iat": now, "exp": now + 60}
    payload = b64url(json.dumps(claim, separators=(",", ":")).encode())
    signature = b64url(hmac.new(secret.encode(), f"operator-console-one-time-admission-v1\0{payload}".encode(), hashlib.sha256).digest())
    return f"{payload}.{signature}"


def read_secret() -> str:
    metadata = TOKEN_PATH.lstat()
    if not stat.S_ISREG(metadata.st_mode) or TOKEN_PATH.is_symlink() or metadata.st_mode & 0o077 or not (32 <= metadata.st_size <= 512):
        raise RuntimeError("visual_qa_operator_access_token_invalid")
    value = TOKEN_PATH.read_text(encoding="utf-8").strip()
    if len(value) < 32:
        raise RuntimeError("visual_qa_operator_access_token_invalid")
    return value


def ready(value: Any) -> dict[str, Any]:
    return {"state": "READY", "authority": "TEST_ONLY_GOLDEN_VISUAL", "value": value}


def screen(identifier: str, frozen_at: str, data: dict[str, Any]) -> dict[str, Any]:
    return {
        "schemaVersion": "vigia.canonical-operator-api.v1",
        "screen": {"id": identifier},
        "generatedAt": frozen_at,
        "projectionAuthority": "TEST_ONLY_GOLDEN_VISUAL",
        "data": data,
    }


def canonical_incident(item: dict[str, Any], fixture: dict[str, Any]) -> dict[str, Any]:
    transition = {
        "transitionId": f"transition:{item['id']}",
        "entityId": item["id"],
        "incidentId": item["id"],
        "from": "OPEN",
        "to": item["state"],
        "reasons": [item["summary"]],
        "at": item["updatedAt"],
        "title": "Assessment updated",
    }
    evidence_debt = {
        "schemaVersion": "vigia.contract-evidence-debt.v1",
        "state": "OPEN",
        "items": [{"id": f"debt:{item['id']}", "state": "OPEN", "quantity_question": "Independent perimeter confirmation", "why_unknown": "Latest independent pass pending", "why_it_matters": "Spread confidence depends on independent confirmation"}],
        "needs": [{"id": f"need:{item['id']}", "missingQuantity": "Independent perimeter confirmation", "state": "WAITING_FOR_OBSERVATION", "reason": "Latest pass pending", "whyItMatters": "Spread confidence depends on independent confirmation", "ranking": {"state": "READY"}}],
    }
    evaluation = {
        "state": item["state"],
        "operatorStatement": item["summary"],
        "requirementsSatisfied": True,
        "qualifyingEvidence": fixture["evidence"][:4],
        "supportingEvidence": fixture["evidence"][:4],
        "excludedEvidence": [],
        "independentFamilies": ["satellite", "ground", "camera", "weather", "field"],
        "contradictions": [fixture["evidence"][2]],
    }
    return {
        "incident": {
            "id": item["id"],
            "label": item["label"],
            "name": item["label"],
            "location": {"label": item["location"], "geometry": {"type": "Point", "coordinates": item["coordinate"]}},
            "coordinate": item["coordinate"],
            "metadata": {
                "areaHa": item["areaHa"], "acres": item["acres"], "areaAcres": item["acres"],
                "growthPercent": item["growthPercent"], "growth24h": item["growthPercent"],
                "containmentPercent": item["containmentPercent"], "populationAtRisk": item["populationAtRisk"],
                "unitsDeployed": item["unitsDeployed"], "resources": item["unitsDeployed"],
                "personnel": 2347 if item["priority"] == 1 else max(42, item["populationAtRisk"]),
                "aircraft": 12 if item["priority"] == 1 else 3,
                "engines": 6 if item["priority"] == 1 else 2,
            },
            "updatedAt": item["updatedAt"],
        },
        "claim": {"id": f"claim:{item['id']}", "proposition": item["summary"], "validTime": {"to": item["updatedAt"]}},
        "evaluation": evaluation,
        "evidenceDebt": evidence_debt,
        "transitions": [transition],
        "updatedAt": item["updatedAt"],
        "controlPlane": {"actions": [work for work in fixture["governedWork"] if work.get("incidentId") == item["id"]]},
    }


def evidence_graph(fixture: dict[str, Any]) -> dict[str, Any]:
    families = [
        {"id": "family:satellite", "familyClass": "SATELLITE", "label": "Satellite"},
        {"id": "family:ground", "familyClass": "GROUND_REPORT", "label": "Ground Reports"},
        {"id": "family:camera", "familyClass": "CAMERA", "label": "Cameras"},
        {"id": "family:weather", "familyClass": "WEATHER", "label": "Weather"},
        {"id": "family:field", "familyClass": "FIELD", "label": "Verified Field Observations"},
    ]
    sources = [{"id": evidence["sourceId"], "familyId": f"family:{evidence['sourceId'].split(':')[-1]}", "label": evidence["title"], "status": "ACTIVE"} for evidence in fixture["evidence"]]
    family_counts = {"satellite": 6, "ground": 5, "camera": 4, "weather": 4, "field": 7}
    observations = []
    for evidence in fixture["evidence"]:
        family_key = evidence["sourceId"].split(":")[-1]
        for index in range(family_counts[family_key]):
            observations.append({
                "id": evidence["observationId"] if index == 0 else f"observation:{family_key}:{index + 1}",
                "sourceId": evidence["sourceId"],
                "state": "OBSERVED",
                "observedAt": fixture["frozenAt"],
                "value": {"previewState": "TEST_ONLY_GOLDEN_METADATA"},
            })
    source_families = {source["id"]: source["familyId"] for source in sources}
    lineages = [{"observationId": observation["id"], "rootObservationIds": [observation["id"]], "sourceFamilyIds": [source_families[observation["sourceId"]]], "sourceIds": [observation["sourceId"]]} for observation in observations]
    return {"schemaVersion": "vigia.evidence-graph.v1", "sourceFamilies": families, "sources": sources, "observations": observations, "evidence": fixture["evidence"], "lineages": lineages}


def golden_ring(center: list[float], radius: float, seed: float, lobes: int = 7) -> list[list[float]]:
    longitude, latitude = center
    points = []
    for index in range(56):
        angle = index / 56 * math.pi * 2
        wobble = 0.72 + 0.3 * math.sin(angle * 3 + seed) + 0.16 * math.sin(angle * lobes + seed * 2.3) + 0.09 * math.cos(angle * 11 + seed * 0.7)
        distance = radius * wobble
        points.append([longitude + distance * math.cos(angle) * 1.55, latitude + distance * math.sin(angle)])
    return points


def golden_hotspots(center: list[float], radius: float, seed: float, count: int) -> list[list[float]]:
    longitude, latitude = center
    points = []
    for index in range(count):
        angle = (index * 2.399963 + seed) % (math.pi * 2)
        distance = radius * (0.15 + 0.8 * ((index * 0.618 + seed * 0.31) % 1))
        points.append([longitude + distance * math.cos(angle) * 1.5, latitude + distance * math.sin(angle) * 0.85])
    return points


def golden_donor_cartography_svg(bbox: dict[str, Any]) -> bytes:
    """Render donor cartography in the test-only lane without reference pixels.

    This is a direct, dependency-free port of the presentation algorithm in the
    read-only donor's ``src/components/vigia/OperationalMap.tsx``: deterministic
    SVG turbulence plus its river, road, and administrative line work. It does
    not inspect a locked PNG, and it deliberately omits incidents, labels, map
    chrome, and operational overlays because those remain runtime-owned DOM.
    """
    west = float(bbox.get("west", -122.95))
    north = float(bbox.get("north", 39.6))
    seed = abs(west * 7 + north * 13) % 20
    view_width, view_height = 1000, 620

    rivers: list[str] = []
    for index in range(4):
        x = (0.12 + index * 0.26) * view_width
        commands = [f"M {x:.1f} 0"]
        for y in range(0, view_height + 1, 22):
            x += math.sin(y * 0.017 + index * 2.3 + seed) * 9 + math.cos(y * 0.006 + index) * 4
            commands.append(f"L {x:.1f} {y}")
        rivers.append(" ".join(commands))

    roads: list[tuple[str, bool]] = []
    for index in range(9):
        major = index % 3 == 0
        if index % 2 == 0:
            x = ((index + 0.7) / 9.5) * view_width
            commands = [f"M {x:.1f} -10"]
            for y in range(0, view_height + 11, 40):
                x += math.sin(y * 0.01 + index + seed) * 12
                commands.append(f"L {x:.1f} {y}")
        else:
            y = ((index + 0.4) / 9.5) * view_height
            commands = [f"M -10 {y:.1f}"]
            for x in range(0, view_width + 11, 50):
                y += math.cos(x * 0.008 + index * 1.4 + seed) * 10
                commands.append(f"L {x} {y:.1f}")
        roads.append((" ".join(commands), major))

    river_markup = "".join(f'<path d="{path}"/>' for path in rivers)
    road_markup = "".join(
        f'<path d="{path}" stroke-width="{1.5 if major else 0.7}" opacity="{0.55 if major else 0.3}"/>'
        for path, major in roads
    )
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{view_width}" height="{view_height}" viewBox="0 0 {view_width} {view_height}" preserveAspectRatio="xMidYMid slice">
<metadata>VIGIA TEST-ONLY GOLDEN CARTOGRAPHY · deterministic donor presentation · no reference pixels</metadata>
<defs>
  <filter id="relief" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.0035 0.0052" numOctaves="6" seed="{seed}" result="noise"/>
    <feDiffuseLighting in="noise" lighting-color="#9a9184" surfaceScale="13" diffuseConstant="1.1">
      <feDistantLight azimuth="315" elevation="42"/>
    </feDiffuseLighting>
  </filter>
  <filter id="vegetation" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.011" numOctaves="3" seed="{seed + 4}" result="noise"/>
    <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0.10  0 0 0 0 0.12  0 0 0 0 0.10  0.95 0 0 0 -0.18"/>
  </filter>
</defs>
<rect width="{view_width}" height="{view_height}" fill="#171a1b"/>
<g opacity="0.68"><rect width="{view_width}" height="{view_height}" filter="url(#relief)"/></g>
<rect width="{view_width}" height="{view_height}" fill="#1c2124" opacity="0.42"/>
<g opacity="0.42"><rect width="{view_width}" height="{view_height}" filter="url(#vegetation)"/></g>
<g fill="none" stroke="#7898b0" stroke-width="1.6" stroke-opacity="0.45" opacity="0.7">{river_markup}</g>
<g fill="none" stroke="#e4ded0" stroke-opacity="0.4">{road_markup}</g>
<path d="M 0 {view_height * 0.28} L {view_width * 0.34} {view_height * 0.22} L {view_width * 0.62} {view_height * 0.42} L {view_width} {view_height * 0.36}" fill="none" stroke="#f0eee6" stroke-opacity="0.22" stroke-width="1" stroke-dasharray="9 6"/>
</svg>'''
    return svg.encode("utf-8")


def golden_coordinate_at_pixel(center: list[float], zoom: int, x: float, y: float, width: float = 1045, height: float = 445) -> list[float]:
    """Invert Web Mercator for a test-only, viewport-relative presentation coordinate."""
    scale = 2 ** zoom
    center_x = (center[0] + 180) / 360 * scale * 256
    latitude_radians = math.radians(center[1])
    center_y = (1 - math.asinh(math.tan(latitude_radians)) / math.pi) / 2 * scale * 256
    world_x = center_x + x - width / 2
    world_y = center_y + y - height / 2
    longitude = world_x / (scale * 256) * 360 - 180
    tile_y = world_y / 256
    latitude = math.degrees(math.atan(math.sinh(math.pi - 2 * math.pi * tile_y / scale)))
    return [longitude, latitude]


def golden_perimeter_at_pixels(center: list[float], zoom: int) -> list[list[float]]:
    points = []
    for index in range(96):
        angle = index / 96 * math.pi * 2
        wobble = 0.87 + 0.11 * math.sin(angle * 5 + 0.7) + 0.08 * math.sin(angle * 11 + 2.1) + 0.04 * math.cos(angle * 17)
        x = 405 + math.cos(angle) * 166 * wobble + 14 * math.sin(angle * 2.0)
        y = 184 + math.sin(angle) * 119 * wobble - 8 * math.cos(angle * 3.0)
        points.append(golden_coordinate_at_pixel(center, zoom, x, y))
    return points


def golden_hotspots_at_pixels(center: list[float], zoom: int, count: int = 148) -> list[list[float]]:
    points = []
    for index in range(count):
        angle = (index * 2.399963229728653 + 0.65) % (math.pi * 2)
        radial = math.sqrt((index * 0.61803398875 + 0.21) % 1)
        x = 392 + math.cos(angle) * 121 * radial + math.sin(angle * 2.0) * 11
        y = 187 + math.sin(angle) * 92 * radial + math.cos(angle * 3.0) * 7
        points.append(golden_coordinate_at_pixel(center, zoom, x, y))
    return points


def golden_command_projection(fixture: dict[str, Any]) -> dict[str, Any]:
    """Build the deterministic screenshot projection inside the isolated proxy only."""
    projection = copy.deepcopy(fixture["commandOverview"])
    center, zoom = [-122.25, 39.1], 11
    marker_pixels = {
        "INC-2025-0515-0012": (356, 142),
        "INC-2025-0515-0017": (700, 83),
        "INC-2025-0515-0021": (641, 183),
        "INC-2025-0515-0024": (748, 283),
        "INC-2025-0515-0029": (450, 327),
    }
    for row in projection["priorityIncidents"]:
        x, y = marker_pixels[row["incidentId"]]
        row["coordinate"] = golden_coordinate_at_pixel(center, zoom, x, y)
        focused = row["incidentId"] == projection["focusedIncidentId"]
        row["perimeter"] = golden_perimeter_at_pixels(center, zoom) if focused else []
        row["hotspots"] = golden_hotspots_at_pixels(center, zoom) if focused else []
    vectors = []
    for row in range(5):
        for column in range(6):
            vectors.append({
                "coordinate": golden_coordinate_at_pixel(center, zoom, 125 + column * 164 + (row % 2) * 36, 42 + row * 82),
                "bearing": 315 + math.sin(row * 1.2 + column * 0.6) * 12,
                "speedMph": 7 + ((row + column) % 3),
            })
    projection["map"] = {
        "bbox": projection["bbox"],
        "center": center,
        "zoom": zoom,
        "scaleLabel": "10 km",
        "wind": {
            "bearingLabel": projection["telemetry"]["windBearing"],
            "bearing": 135,
            "speedMph": projection["telemetry"]["windSpeedMph"],
            "gustMph": projection["telemetry"]["windGustMph"],
            "vectors": vectors,
        },
    }
    return projection


def golden_feature(geometry_type: str, coordinates: Any, kind: str, authoritative: bool = False) -> dict[str, Any]:
    return {"type": "Feature", "properties": {"kind": kind, "authoritativePerimeter": authoritative}, "geometry": {"type": geometry_type, "coordinates": coordinates}}


def golden_scene(incident: dict[str, Any], scene_type: str, frozen_at: str) -> dict[str, Any]:
    canonical = incident["incident"]
    identifier = canonical["id"]
    center = canonical["coordinate"]
    longitude, latitude = center
    observed = golden_feature("Polygon", [golden_ring(center, 0.018, 1.1)], "observed_support")
    thermal = golden_feature("Polygon", [golden_ring([longitude + 0.007, latitude - 0.003], 0.013, 2.4)], "thermal_support")
    observations = [
        {"id": f"thermal:{index + 1}", "coordinate": coordinate, "sourceFamily": "SATELLITE", "platform": "VIIRS", "frpMw": 28 + index * 3, "geolocationUncertaintyM": 180 + index * 20, "observedAt": frozen_at}
        for index, coordinate in enumerate(golden_hotspots(center, 0.022, 0.8, 13))
    ]
    resources = [
        {"resourceId": f"resource:{index + 1}", "label": label, "state": "STAGED" if index == 3 else "ASSIGNED", "assignmentId": f"assignment:{index + 1}", "coordinate": [longitude + dx, latitude + dy]}
        for index, (label, dx, dy) in enumerate([
            ("E-21", -0.025, 0.012), ("C-4", -0.013, -0.018), ("H-3", 0.019, 0.018), ("North Staging", 0.028, -0.012), ("WT-8", 0.006, -0.028),
        ])
    ]
    assignments = [{"assignmentId": row["assignmentId"], "label": f"Division {chr(65 + index)}", "state": "ACTIVE", "resourceIds": [row["resourceId"]]} for index, row in enumerate(resources)]
    area = golden_feature("Polygon", [golden_ring(center, 0.032, 3.2)], "operational_area")
    division = golden_feature("LineString", [[longitude - 0.033, latitude + 0.018], [longitude + 0.032, latitude - 0.014]], "division")
    control = golden_feature("LineString", [[longitude - 0.028, latitude - 0.024], [longitude - 0.005, latitude - 0.031], [longitude + 0.027, latitude - 0.019]], "control_line")
    forecast = [golden_feature("Polygon", [golden_ring([longitude + offset * 0.008, latitude - offset * 0.004], 0.028 + offset * 0.013, 1.4 + offset)], f"forecast_{offset + 1}") for offset in range(3)]
    terrain = [golden_feature("LineString", [[longitude - 0.05, latitude + offset * 0.014], [longitude - 0.012, latitude + 0.009 + offset * 0.012], [longitude + 0.05, latitude - 0.004 + offset * 0.01]], "terrain") for offset in range(-2, 3)]
    assets = [{"id": f"asset:{index + 1}", "label": label, "kind": kind, "coordinate": [longitude + dx, latitude + dy]} for index, (label, kind, dx, dy) in enumerate([
        ("Pine Valley", "COMMUNITY", 0.035, 0.012), ("Oak Creek", "COMMUNITY", -0.031, -0.016), ("Substation", "CRITICAL_INFRASTRUCTURE", 0.022, -0.031),
    ])]
    all_layers = {
        "incidentPoints": [{"incidentId": identifier, "label": canonical["label"], "state": canonical.get("state", incident.get("evaluation", {}).get("state")), "coordinate": center, "areaHa": canonical.get("metadata", {}).get("areaHa")}],
        "observedGeometry": [observed], "thermalSupport": [thermal], "observations": observations,
        "weather": [{"source": "TEST_ONLY_GOLDEN_WEATHER", "observedAt": frozen_at, "temperatureF": 72, "windSpeedMph": 8}],
        "wind": [{"source": "TEST_ONLY_GOLDEN_WEATHER", "observedAt": frozen_at, "bearingLabel": "NW", "speedMph": 8, "gustMph": 20, "vectors": []}],
        "terrain": terrain, "forecastGeometry": forecast, "contextAssets": assets,
        "operationalAreas": [{"operationalAreaId": "area:alpha", "label": "Incident operating area", "state": "ACTIVE", "geometry": area}],
        "controlLines": [{"id": "control:1", "label": "Completed line", "state": "ACTIVE", "geometry": control}],
        "divisions": [{"id": "division:alpha", "label": "Division Alpha", "state": "ACTIVE", "geometry": division}],
        "stagingAreas": [{"id": "staging:north", "label": "North staging", "state": "ACTIVE", "geometry": golden_feature("Polygon", [golden_ring([longitude + 0.028, latitude - 0.012], 0.004, 4.2)], "staging")}],
        "bases": [{"id": "base:1", "label": "Incident base", "state": "ACTIVE", "geometry": golden_feature("Polygon", [golden_ring([longitude - 0.026, latitude + 0.011], 0.0035, 5.2)], "base")}],
        "resources": resources, "assignments": assignments, "locations": [{"personId": row["resourceId"], "coordinate": row["coordinate"], "verificationState": "VERIFIED"} for row in resources],
        "stagedResources": [row for row in resources if row["state"] == "STAGED"], "roads": [],
    }
    definitions = {
        "INCIDENT_TACTICAL": {"scope": "INCIDENT_DETAIL", "zoom": 12, "layers": ["incidentPoints", "observedGeometry", "thermalSupport", "observations", "weather", "wind", "controlLines", "divisions", "stagingAreas", "bases", "resources", "locations", "roads", "contextAssets"], "controls": ["layers", "focus", "thermal", "measure", "zoom"], "legend": ["observedGeometry", "observations", "controlLines", "resources", "contextAssets"], "labels": "TACTICAL_FEATURES"},
        "INTELLIGENCE_FORECAST": {"scope": "INTELLIGENCE", "zoom": 11, "layers": ["incidentPoints", "observedGeometry", "thermalSupport", "observations", "weather", "wind", "terrain", "forecastGeometry", "contextAssets"], "controls": ["layers", "focus", "thermal", "measure", "zoom"], "legend": ["observedGeometry", "observations", "forecastGeometry", "terrain", "contextAssets"], "labels": "SCIENTIFIC_FEATURES"},
        "OPERATIONS_ASSIGNMENTS": {"scope": "OPERATIONS", "zoom": 9, "layers": ["incidentPoints", "operationalAreas", "controlLines", "divisions", "stagingAreas", "bases", "resources", "assignments", "locations", "stagedResources"], "controls": ["layers", "focus", "thermal", "resources", "zoom"], "legend": ["operationalAreas", "controlLines", "resources", "stagingAreas", "bases"], "labels": "ASSIGNMENTS_AND_RESOURCES"},
    }
    definition = definitions[scene_type]
    layers = {name: ready(values) for name, values in all_layers.items()}
    bounds = {"west": longitude - 0.075, "south": latitude - 0.065, "east": longitude + 0.075, "north": latitude + 0.065}
    return {
        "schemaVersion": "vigia.operator-map-scene.v2", "sceneType": scene_type, "sceneId": f"{scene_type}:{identifier}", "scope": definition["scope"],
        "focusIncidentId": identifier, "selectedIncidentId": identifier, "bounds": bounds, "camera": {"center": center, "zoom": definition["zoom"], "bbox": bounds, "scaleLabel": "1 km"},
        "layerSet": definition["layers"], "controls": definition["controls"], "legend": definition["legend"], "labelPolicy": definition["labels"],
        "renderedFeatureSet": {name: len(all_layers[name]) for name in definition["layers"]}, "currentness": {"generatedAt": frozen_at, "geometryFreshness": "CURRENT"}, "layers": layers,
    }


def golden_command_scene(projection: dict[str, Any], frozen_at: str) -> dict[str, Any]:
    rows = [{"incidentId": row["incidentId"], "label": row["name"], "state": row["state"], "coordinate": row["coordinate"], "areaHa": row.get("areaHa")} for row in projection["priorityIncidents"]]
    bounds = projection["bbox"]
    layers = {"incidentPoints": ready(rows), "observations": ready([]), "thermalSupport": ready([]), "wind": ready([projection["map"]["wind"]]), "weather": ready([])}
    return {"schemaVersion": "vigia.operator-map-scene.v2", "sceneType": "COMMAND_SITUATION", "sceneId": "COMMAND_SITUATION:regional", "scope": "REGIONAL", "focusIncidentId": projection["focusedIncidentId"], "selectedIncidentId": projection["focusedIncidentId"], "bounds": bounds, "camera": {"center": projection["map"]["center"], "zoom": projection["map"]["zoom"], "bbox": bounds, "scaleLabel": "10 km"}, "layerSet": list(layers), "controls": ["layers", "focus", "thermal", "measure", "zoom"], "legend": ["incidentPoints", "wind"], "labelPolicy": "PRIORITY_INCIDENTS", "renderedFeatureSet": {name: len(layer["value"]) for name, layer in layers.items()}, "currentness": {"generatedAt": frozen_at}, "layers": layers}


def golden_incidents_scene(incidents: list[dict[str, Any]], frozen_at: str) -> dict[str, Any]:
    focused = incidents[0]
    scene = golden_scene(focused, "INCIDENT_TACTICAL", frozen_at)
    points = [
        {"incidentId": row["incident"]["id"], "label": row["incident"]["label"], "state": row["incident"].get("state", row.get("evaluation", {}).get("state")), "coordinate": row["incident"]["coordinate"], "areaHa": row["incident"].get("metadata", {}).get("areaHa")}
        for row in incidents
    ]
    longitudes = [row["coordinate"][0] for row in points]
    latitudes = [row["coordinate"][1] for row in points]
    bounds = {"west": min(longitudes) - 0.08, "south": min(latitudes) - 0.08, "east": max(longitudes) + 0.08, "north": max(latitudes) + 0.08}
    declared = ["incidentPoints", "observedGeometry", "thermalSupport", "observations", "weather", "wind", "contextAssets"]
    layers = {name: scene["layers"][name] for name in declared}
    layers["incidentPoints"] = ready(points)
    identifier = focused["incident"]["id"]
    return {
        **scene,
        "sceneType": "INCIDENT_INSPECTION",
        "sceneId": f"INCIDENT_INSPECTION:{identifier}",
        "scope": "INCIDENTS",
        "bounds": bounds,
        "camera": {"center": focused["incident"]["coordinate"], "zoom": 10, "bbox": bounds, "scaleLabel": "5 km"},
        "layerSet": declared,
        "legend": ["incidentPoints", "observedGeometry", "observations", "contextAssets"],
        "labelPolicy": "SELECTED_WITH_NEARBY_CONTEXT",
        "renderedFeatureSet": {name: len(layer["value"]) for name, layer in layers.items()},
        "layers": layers,
    }


def golden_screens(fixture: dict[str, Any]) -> dict[str, Any]:
    incidents = [canonical_incident(item, fixture) for item in fixture["incidents"]]
    transitions = [transition for incident in incidents for transition in incident["transitions"]]
    twin_all = {"incidents": incidents, "transitions": transitions, "controlPlane": {"actions": fixture["governedWork"]}, "governedWork": fixture["governedWork"], "sourceHealth": {"sources": []}}
    twin_command = {**twin_all, "incidents": incidents[:5]}
    graph = evidence_graph(fixture)
    evaluation = incidents[0]["evaluation"]
    science = {
        "passed": True, "decision": "READY", "preciseRemainingBlocker": None,
        "wind": {"display": "NW 8 mph", "speedMph": 8, "gustMph": 20},
        "weather": {"temperatureF": 72}, "confidence": 87,
        "checks": {"forecastEvaluationExecuted": True},
    }
    command_projection = golden_command_projection(fixture)
    command = screen("01", fixture["frozenAt"], {
        "incidents": ready(twin_command), "commandReliability": ready({"state": "READY"}),
        "scientificTruth": ready(science), "governedWork": ready(fixture["governedWork"]),
        "commandPresentation": ready(command_projection), "mapScene": ready(golden_command_scene(command_projection, fixture["frozenAt"])),
        "operatorAuthority": ready({"authenticated": True}),
    })
    incident_list = screen("02", fixture["frozenAt"], {"canonicalIncidents": ready(twin_all), "reliabilityProjection": ready({"events": transitions}), "mapScene": ready(golden_incidents_scene(incidents, fixture["frozenAt"]))})
    outputs: dict[str, Any] = {"command": command, "incidents": incident_list, "byIncident": {}}
    for incident in incidents:
        identifier = incident["incident"]["id"]
        timeline = [
            {"id": "timeline:1410", "title": "Helispot H-3 established", "state": "READY", "at": "2025-05-15T21:10:00.000Z", "reason": "H-3"},
            {"id": "timeline:1412", "title": "Engine E-21 en route", "state": "READY", "at": "2025-05-15T21:12:00.000Z", "reason": "Division Alpha"},
            {"id": "timeline:1418", "title": "New hotspot detected (IR)", "state": "ACTIVE", "at": "2025-05-15T21:18:00.000Z", "reason": "Sector North"},
            {"id": "timeline:1422", "title": "Water drop completed", "state": "READY", "at": "2025-05-15T21:22:00.000Z", "reason": "H-3"},
            {"id": "timeline:1430", "title": "Evacuation alert issued", "state": "WATCH", "at": "2025-05-15T21:30:00.000Z", "reason": "Zone B"},
        ]
        semantic = {"objects": {
            "COMMUNITY_AT_RISK": fixture["communities"], "EVACUATION_ZONE": fixture["evacuationZones"],
            "THRESHOLD": fixture["thresholds"], "RESOURCE_ASSIGNMENT": fixture["detailResources"],
            "WEATHER_WINDOW": [{"id": f"weather:{offset}", "title": label, "state": "READY", "reason": detail} for offset, (label, detail) in enumerate([("Now", "72°F · NW 8 mph · 22%"), ("+6h", "75°F · NW 10 mph · 20%"), ("+12h", "78°F · WNW 12 mph · 18%"), ("+24h", "74°F · W 15 mph · 24%"), ("+48h", "70°F · SW 12 mph · 30%"), ("+72h", "66°F · SW 10 mph · 35%")])],
            "HYPOTHESIS": fixture["hypotheses"],
            "FORECAST_REVISION": [
                {"id": "revision:current", "title": "Current", "at": "2025-05-15T21:00:00.000Z", "reason": "High spread scenario expanded east. Wind threat increased."},
                {"id": "revision:plus-6", "title": "+6h", "at": "2025-05-15T15:00:00.000Z", "reason": "Moderate spread scenario adjusted south. RH recovery improved."},
                {"id": "revision:plus-18", "title": "+18h", "at": "2025-05-15T03:00:00.000Z", "reason": "Initial forecast. All scenarios tighter."},
                {"id": "revision:plus-24", "title": "+24h", "at": "2025-05-14T21:00:00.000Z", "reason": "Pre-ignition outlook. Low confidence across all outcomes."},
            ],
            "ASSUMPTION": [
                {"id": "assumption:weather", "title": "Weather", "reason": "NW winds 8–15 mph, gusts 20", "qualification": "75%"},
                {"id": "assumption:rh", "title": "RH Recovery", "reason": "Min 18% tonight, 40% tomorrow", "qualification": "60%"},
                {"id": "assumption:precipitation", "title": "Precipitation", "reason": "< 0.05 in next 72 hrs", "qualification": "80%"},
                {"id": "assumption:fuel", "title": "Fuel Moisture", "reason": "6–8% fine fuels", "qualification": "70%"},
                {"id": "assumption:behavior", "title": "Fire Behavior", "reason": "Long-range spotting possible", "qualification": "60%"},
                {"id": "assumption:suppression", "title": "Suppression", "reason": "Current resource levels held", "qualification": "80%"},
            ],
            "TRIGGER": [
                {"id": "trigger:wind", "title": "Wind Shift / Increase", "reason": "> 20 mph sustained", "impact": "Higher spread potential"},
                {"id": "trigger:rh", "title": "RH Lower Than Forecast", "reason": "< 15% for 3+ hrs", "impact": "Active fire behavior"},
                {"id": "trigger:spotting", "title": "Spotting Distance", "reason": "> 1.5 km", "impact": "New ignitions"},
                {"id": "trigger:rain", "title": "No Rain Event", "reason": "0.00 in 72 hrs", "impact": "Fuels continue drying"},
            ],
        }}
        detail_metadata = {**incident["incident"]["metadata"]}
        if identifier == "INC-2025-0515-0012":
            detail_metadata.update({"areaHa": 1247, "growthHa24": 214, "containmentPercent": 24})
        detail_incident = {**incident, "incident": {**incident["incident"], "metadata": detail_metadata}, "evidenceGraph": graph}
        detail = screen("03", fixture["frozenAt"], {"canonicalIncident": ready(detail_incident), "reliabilityProjection": ready({"state": "READY"}), "semanticObjects": ready(semantic), "operationalTimeline": ready(timeline), "recentChanges": ready(fixture["recentChanges"]), "mapScene": ready(golden_scene(detail_incident, "INCIDENT_TACTICAL", fixture["frozenAt"]))})
        buckets = {"schemaVersion": "vigia.operator-evidence-buckets.v1", "buckets": {"NEW": fixture["evidence"][:1], "UNDER_REVIEW": fixture["evidence"][1:2], "CONFIRMED": fixture["evidence"][3:], "CONTRADICTORY": fixture["evidence"][2:3]}, "total": len(fixture["evidence"]), "independentFamilies": evaluation["independentFamilies"], "requirementsSatisfied": True, "evaluationState": "READY"}
        intelligence = screen("04", fixture["frozenAt"], {
            "currentAssessment": ready({**incident, "evidenceGraph": graph}), "scientificTruth": ready(science),
            "forecastBoundary": ready({"schemaVersion": "vigia.operator-forecast-boundary.v1", "forecastState": "READY", "researchState": "PROMOTED", "evaluationState": "EXECUTED", "truthGate": "PASSED", "scenarios": fixture["scenarios"]}),
            "hypotheses": ready(fixture["hypotheses"]), "evidenceContracts": ready([{"id": f"contract:{index}", "title": row["title"], "function": "SUPPORTS", "state": "READY", "authority": "TEST_ONLY_GOLDEN_VISUAL", "freshness": "CURRENT", "hypothesisId": row["id"]} for index, row in enumerate(fixture["hypotheses"])]),
            "evidenceGraph": ready(graph), "evidenceQualification": ready(evaluation), "evidenceBuckets": ready(buckets), "semanticRepository": ready(semantic), "mapScene": ready(golden_scene(detail_incident, "INTELLIGENCE_FORECAST", fixture["frozenAt"])),
        })
        debt = screen("05", fixture["frozenAt"], {
            "derivedEvidenceDebt": ready(incident["evidenceDebt"]), "evidenceDebtObjects": ready(incident["evidenceDebt"]["items"]),
            "acquisitionRecommendations": ready([{"id": "acquisition:1", "title": "Acquire independent perimeter", "informationValue": {"explanation": "Distinguishes the leading spread hypotheses"}, "state": "OPEN"}]),
            "decisionBlockers": ready([]),
        })
        operations_state = {"workItems": fixture["governedWork"], "actions": fixture["governedWork"], "resources": fixture["resources"], "criticalNeeds": fixture["criticalNeeds"], "handoffs": [{"id": "handoff:day", "title": "Day shift", "reason": "06:00–18:00 · Operational Period 4"}, {"id": "handoff:night", "title": "Night shift", "reason": "18:00–06:00 · Operational Period 5"}], "stagingAreas": fixture["staging"]}
        operations = screen("06", fixture["frozenAt"], {"incidentOperations": ready(operations_state), "fieldNet": ready({"resources": fixture["resources"], "stagingAreas": fixture["staging"], "tasks": []}), "incidentCommand": ready(operations_state), "operationalTwin": ready(incident), "governedWork": ready(fixture["governedWork"]), "mapScene": ready(golden_scene(detail_incident, "OPERATIONS_ASSIGNMENTS", fixture["frozenAt"]))})
        outputs["byIncident"][identifier] = {"detail": detail, "intelligence": intelligence, "debt": debt, "operations": operations}
    return outputs


class RawForwardHandler(socketserver.BaseRequestHandler):
    target_host = "host.docker.internal"
    target_port = 4190
    basemap_failure_file: Path | None = None

    def handle(self) -> None:
        upstream = None
        try:
            request = bytearray()
            while b"\r\n\r\n" not in request:
                chunk = self.request.recv(65536)
                if not chunk:
                    return
                request.extend(chunk)
                if len(request) > 65536:
                    return
            head, body = bytes(request).split(b"\r\n\r\n", 1)
            lines = head.split(b"\r\n")
            request_parts = lines[0].decode("latin-1", errors="replace").split(" ")
            request_path = request_parts[1] if len(request_parts) > 1 else ""
            if self.basemap_failure_file and self.basemap_failure_file.exists() and request_path.startswith("/backend/api/v1/basemap/"):
                failure_body = b"visual_qa_basemap_provider_unavailable"
                self.request.sendall(b"HTTP/1.1 503 Service Unavailable\r\ncontent-type: text/plain\r\ncache-control: no-store\r\nconnection: close\r\ncontent-length: " + str(len(failure_body)).encode("ascii") + b"\r\n\r\n" + failure_body)
                return
            # Docker Desktop can transiently report ENETUNREACH while opening a
            # burst of parallel tile connections through host.docker.internal.
            # Retry only connection-establishment failures; HTTP failures and
            # application responses must still pass through unchanged.
            connection_error = None
            for attempt in range(6):
                try:
                    upstream = socket.create_connection((self.target_host, self.target_port), timeout=10)
                    break
                except OSError as error:
                    connection_error = error
                    if attempt == 5:
                        raise
                    time.sleep(0.05 * (attempt + 1))
            if upstream is None:
                raise connection_error or RuntimeError("visual_qa_upstream_connection_failed")
            forwarded = [lines[0]]
            for line in lines[1:]:
                name = line.split(b":", 1)[0].strip().lower()
                if name in {b"host", b"connection", b"origin", b"referer"}:
                    continue
                forwarded.append(line)
            forwarded.extend([
                f"Host: 127.0.0.1:{self.target_port}".encode("ascii"),
                f"Origin: http://127.0.0.1:{self.target_port}".encode("ascii"),
                f"Referer: http://127.0.0.1:{self.target_port}/".encode("ascii"),
                b"Connection: close",
            ])
            upstream.sendall(b"\r\n".join(forwarded) + b"\r\n\r\n" + body)
            sockets = [self.request, upstream]
            while True:
                readable, _, exceptional = select.select(sockets, [], sockets, 20)
                if exceptional:
                    return
                if not readable:
                    continue
                for source in readable:
                    data = source.recv(65536)
                    if not data:
                        return
                    if source is self.request:
                        upstream.sendall(data)
                    else:
                        self.request.sendall(data)
        finally:
            if upstream is not None:
                upstream.close()


class ThreadedForwarder(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


class GoldenProxyHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    target_host = "host.docker.internal"
    target_port = 4190
    fixture: dict[str, Any] = {}
    screens: dict[str, Any] = {}
    tile_cache: dict[str, bytes] = {}
    source_root: Path | None = None
    source_release_id = ""

    def log_message(self, _format: str, *_args: Any) -> None:
        return

    def _write(self, status: int, body: bytes, content_type: str, extra: dict[str, str] | None = None) -> None:
        self.send_response(status)
        self.send_header("content-type", content_type)
        self.send_header("content-length", str(len(body)))
        self.send_header("cache-control", "no-store")
        self.send_header("connection", "close")
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass
        self.close_connection = True

    def _json(self, status: int, payload: Any) -> None:
        self._write(status, json.dumps(payload, separators=(",", ":")).encode(), "application/json; charset=utf-8")

    @classmethod
    def _thermal_overlay(cls, key: str) -> bytes:
        parsed = urllib.parse.urlsplit(key)
        query = urllib.parse.parse_qs(parsed.query)
        bbox = [float(value) for value in query.get("bbox", [""])[0].split(",")]
        width = max(1, min(1536, int(query.get("width", ["1024"])[0])))
        height = max(1, min(1536, int(query.get("height", ["1024"])[0])))
        if len(bbox) != 4 or bbox[0] >= bbox[2] or bbox[1] >= bbox[3]:
            raise RuntimeError("golden_thermal_bbox_invalid")
        west, south, east, north = bbox

        def mercator(latitude: float) -> float:
            value = math.radians(max(-85.05112878, min(85.05112878, latitude)))
            return math.log(math.tan(math.pi / 4 + value / 2))

        north_y, south_y = mercator(north), mercator(south)

        def project(coordinate: list[float]) -> tuple[float, float]:
            x = (coordinate[0] - west) / (east - west) * width
            y = (north_y - mercator(coordinate[1])) / (north_y - south_y) * height
            return x, y

        command = cls.screens.get("command", {})
        presentation = command.get("data", {}).get("commandPresentation", {}).get("value", {})
        focus_id = presentation.get("focusedIncidentId")
        focus = next((row for row in presentation.get("priorityIncidents", []) if row.get("incidentId") == focus_id), {})
        hotspots = [project(point) for point in focus.get("hotspots", []) if isinstance(point, list) and len(point) == 2]
        image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
        glow_draw = ImageDraw.Draw(glow)
        scale = max(0.7, width / 1280)
        for index, (x, y) in enumerate(hotspots):
            radius = (5 + index % 4 * 1.5) * scale
            glow_draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(255, 70 + index % 3 * 24, 16, 76))
        glow = glow.filter(ImageFilter.GaussianBlur(max(2, 5 * scale)))
        image = Image.alpha_composite(image, glow)
        core = ImageDraw.Draw(image)
        for index, (x, y) in enumerate(hotspots):
            radius = (0.9 + index % 3 * 0.55) * scale
            tone = (255, 235, 174, 245) if index % 5 == 0 else (255, 104 + index % 4 * 25, 28, 235)
            core.ellipse((x - radius, y - radius, x + radius, y + radius), fill=tone)
            if index % 4 == 0:
                direction = (index * 1.618 + 0.4) % (math.pi * 2)
                length = (4 + index % 7) * scale
                core.line((x, y, x + math.cos(direction) * length, y + math.sin(direction) * length), fill=(255, 119, 32, 180), width=max(1, round(scale)))
        output = BytesIO()
        image.save(output, format="PNG", optimize=False, compress_level=9)
        return output.getvalue()

    @classmethod
    def _tile(cls, key: str) -> bytes:
        if key in cls.tile_cache:
            return cls.tile_cache[key]
        parsed_url = urllib.parse.urlsplit(key)
        if parsed_url.path.endswith("/events/thermal/overlay"):
            cls.tile_cache[key] = cls._thermal_overlay(key)
            return cls.tile_cache[key]
        parsed = parsed_url.path.strip("/").split("/")
        kind = parsed[-4] if len(parsed) >= 4 else "imagery"
        zoom = int(parsed[-3]) if len(parsed) >= 3 and parsed[-3].isdigit() else 8
        tile_x = int(parsed[-2]) if len(parsed) >= 2 and parsed[-2].isdigit() else 0
        tile_y = int(parsed[-1]) if parsed and parsed[-1].isdigit() else 0
        seed = int.from_bytes(hashlib.sha256(key.encode()).digest()[:8], "big")
        rng = np.random.default_rng(seed)
        if kind == "labels":
            image = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
            draw = ImageDraw.Draw(image)
            for index in range(14):
                y = -20 + index * 23 + int(rng.integers(-7, 8))
                bend = int(rng.integers(-22, 23))
                draw.line([(0, y), (72, y + bend // 3), (156, y - bend // 2), (256, y + bend)], fill=(174, 164, 125, 72), width=1)
            for index in range(5):
                x = int(rng.integers(-90, 230))
                y = int(rng.integers(-80, 250))
                draw.line([(x, y), (x + 80, y + int(rng.integers(-90, 91))), (x + 210, y + int(rng.integers(-120, 121)))], fill=(215, 205, 169, 84), width=1)
        else:
            yy, xx = np.mgrid[0:256, 0:256]
            global_x = tile_x * 256 + xx
            global_y = tile_y * 256 + yy
            noise = rng.normal(0, 4.2, (256, 256))
            relief = (
                8 * np.sin(global_x / 24.0 + np.sin(global_y / 91.0) * 1.8)
                + 6 * np.cos(global_y / 31.0 + np.sin(global_x / 77.0) * 1.4)
                + 4 * np.sin((global_x + global_y) / 13.0)
                + noise
            )
            base = np.zeros((256, 256, 3), dtype=np.uint8)
            base[..., 0] = np.clip(48 + relief * 0.72, 25, 78)
            base[..., 1] = np.clip(65 + relief * 0.92, 31, 98)
            base[..., 2] = np.clip(49 + relief * 0.63, 24, 75)
            image = Image.fromarray(base).convert("RGBA")
            draw = ImageDraw.Draw(image)
            for index in range(38):
                offset = int(rng.integers(-130, 360))
                amplitude = int(rng.integers(5, 34))
                phase = float(rng.uniform(0, math.pi * 2))
                points = [(x, offset + int(math.sin((x + tile_x * 31) / 38 + phase) * amplitude) + int(math.sin(x / 91 + phase * 0.6) * 13)) for x in range(-16, 273, 16)]
                color = (91 + index % 3 * 7, 95 + index % 4 * 5, 67 + index % 5 * 4, 116)
                draw.line(points, fill=color, width=1)
            for index in range(34):
                x0, y0 = int(rng.integers(-80, 255)), int(rng.integers(-80, 255))
                points = [(x0, y0)]
                angle = float(rng.uniform(-math.pi, math.pi))
                for step in range(1, 7):
                    distance = step * int(rng.integers(10, 22))
                    points.append((x0 + math.cos(angle) * distance + int(rng.integers(-8, 9)), y0 + math.sin(angle) * distance + int(rng.integers(-8, 9))))
                draw.line(points, fill=(111, 107, 76, 118), width=1)
            for index in range(5):
                x0, y0 = int(rng.integers(-80, 200)), int(rng.integers(-80, 200))
                draw.line([(x0, y0), (x0 + 82, y0 + int(rng.integers(-45, 46))), (x0 + 180, y0 + int(rng.integers(-80, 81))), (x0 + 330, y0 + int(rng.integers(-110, 111)))], fill=(174, 160, 116, 145), width=1)
        out = BytesIO()
        image.save(out, format="PNG", optimize=False, compress_level=9)
        cls.tile_cache[key] = out.getvalue()
        return cls.tile_cache[key]

    def _fixture_response(self, path: str) -> bool:
        parsed = urllib.parse.urlsplit(path)
        route = parsed.path
        if route == "/backend/__health":
            self._json(200, {"ok": True, "state": "READY", "authority": "TEST_ONLY_GOLDEN_VISUAL"})
            return True
        if route == "/backend/api/v10/session":
            self._json(200, self.fixture["session"])
            return True
        if route == "/backend/api/v10/operator/command-overview":
            self._json(200, self.screens["command"])
            return True
        if route == "/backend/api/v10/operator/incidents":
            self._json(200, self.screens["incidents"])
            return True
        prefix = "/backend/api/v10/operator/incidents/"
        if route.startswith(prefix):
            suffix = route[len(prefix):]
            parts = suffix.split("/")
            identifier = urllib.parse.unquote(parts[0])
            group = self.screens["byIncident"].get(identifier)
            if not group:
                self._json(404, {"error": "golden_incident_not_found"})
                return True
            key = "detail" if len(parts) == 1 else {"intelligence": "intelligence", "evidence-debt": "debt", "operations": "operations"}.get(parts[1])
            if key:
                self._json(200, group[key])
            else:
                self._json(404, {"error": "golden_projection_not_found"})
            return True
        if route.startswith("/backend/api/v1/basemap/") or route == "/backend/api/v10/events/thermal/overlay":
            body = self._tile(path)
            self._write(200, body, "image/png", {"x-vigia-provider": "VIGIA TEST-ONLY GOLDEN CARTOGRAPHY", "x-vigia-source-state": "current", "x-vigia-acquired-at": self.fixture["frozenAt"]})
            return True
        if route == "/__vqa/golden-cartography/donor-basemap.svg":
            presentation = self.screens.get("command", {}).get("data", {}).get("commandPresentation", {}).get("value", {})
            body = golden_donor_cartography_svg(presentation.get("bbox", {}))
            self._write(200, body, "image/svg+xml; charset=utf-8", {
                "x-vigia-visual-authority": "TEST_ONLY_GOLDEN_VISUAL",
                "x-vigia-cartography-source": "DONOR_OPERATIONAL_MAP_PRESENTATION",
            })
            return True
        if route.startswith("/backend/"):
            self._json(404, {"error": "golden_lane_endpoint_not_declared", "authority": "TEST_ONLY_GOLDEN_VISUAL"})
            return True
        if route.startswith("/__vqa/reference/"):
            name = route.rsplit("/", 1)[-1]
            if name not in EXPECTED_HASHES:
                self._json(404, {"error": "visual_reference_not_found"})
            else:
                self._write(200, (REFERENCE_ROOT / name).read_bytes(), "image/png")
            return True
        return False

    def _forward(self) -> None:
        body_length = int(self.headers.get("content-length", "0") or "0")
        body = self.rfile.read(body_length) if body_length else None
        headers = {key: value for key, value in self.headers.items() if key.lower() not in {"connection", "content-length", "transfer-encoding", "host", "origin", "referer"}}
        headers["Host"] = f"127.0.0.1:{self.target_port}"
        headers["Origin"] = f"http://127.0.0.1:{self.target_port}"
        headers["Referer"] = f"http://127.0.0.1:{self.target_port}/"
        headers["Connection"] = "close"
        connection = None
        try:
            connection_error = None
            for attempt in range(6):
                candidate = http.client.HTTPConnection(self.target_host, self.target_port, timeout=30)
                try:
                    candidate.connect()
                    connection = candidate
                    break
                except OSError as error:
                    connection_error = error
                    candidate.close()
                    if attempt == 5:
                        raise
                    time.sleep(0.05 * (attempt + 1))
            if connection is None:
                raise connection_error or RuntimeError("visual_qa_upstream_connection_failed")
            connection.request(self.command, self.path, body=body, headers=headers)
            response = connection.getresponse()
            payload = response.read()
            self.send_response(response.status, response.reason)
            for key, value in response.getheaders():
                if key.lower() not in {"connection", "content-length", "transfer-encoding"}:
                    self.send_header(key, value)
            self.send_header("content-length", str(len(payload)))
            self.send_header("connection", "close")
            self.end_headers()
            if self.command != "HEAD":
                try:
                    self.wfile.write(payload)
                except (BrokenPipeError, ConnectionResetError):
                    pass
            self.close_connection = True
        finally:
            if connection is not None:
                connection.close()

    def _serve_source(self) -> None:
        parsed = urllib.parse.urlsplit(self.path)
        route = parsed.path
        if route == "/" and "admission" in urllib.parse.parse_qs(parsed.query):
            self.send_response(303)
            self.send_header("location", "/#/command-overview")
            self.send_header("cache-control", "no-store")
            self.send_header("set-cookie", "vigia_vqa_source_admission=1; Path=/; HttpOnly; SameSite=Strict")
            self.send_header("content-length", "0")
            self.end_headers()
            return
        if route == "/__operator/ready":
            self._json(200, {
                "ok": True,
                "frontend": "operator-console",
                "path": "apps/operator-console",
                "releaseId": self.source_release_id,
                "projectionAuthority": "TEST_ONLY_GOLDEN_VISUAL",
                "sourceServing": True,
            })
            return
        if route == "/__operator/portugal-boundary":
            boundary = ROOT / "data" / "replay" / "raw" / "openstreetmap" / "portugal-thermal-context-v1" / "portugal-boundary.json"
            self._write(200, boundary.read_bytes(), "application/json; charset=utf-8", {"x-vigia-provider": "OpenStreetMap governed Portugal boundary"})
            return
        root = self.source_root.resolve(strict=True) if self.source_root else None
        candidate = (root / route.lstrip("/")).resolve() if root else None
        if root is None or candidate is None or (candidate != root and root not in candidate.parents):
            self._json(404, {"error": "golden_source_path_invalid"})
            return
        if not candidate.is_file():
            candidate = root / "index.html"
        types = {
            ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
            ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
            ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg", ".webp": "image/webp",
        }
        self._write(200, candidate.read_bytes(), types.get(candidate.suffix.lower(), "application/octet-stream"))

    def _handle(self) -> None:
        if self._fixture_response(self.path):
            return
        if self.source_root is not None:
            self._serve_source()
            return
        self._forward()

    do_GET = _handle
    do_HEAD = _handle
    do_POST = _handle
    do_PATCH = _handle


DETERMINISTIC_INIT = f"""
(() => {{
  const frozen={FROZEN_EPOCH_MS};
  const NativeDate=Date;
  class FrozenDate extends NativeDate {{
    constructor(...args) {{ super(...(args.length ? args : [frozen])); }}
    static now() {{ return frozen; }}
  }}
  FrozenDate.parse=NativeDate.parse; FrozenDate.UTC=NativeDate.UTC;
  Object.defineProperty(window,'Date',{{value:FrozenDate,configurable:false,writable:false}});
  let seed=0x56494749;
  Math.random=()=>{{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;}};
  const nativeInterval=window.setInterval.bind(window);
  window.setInterval=(fn,delay,...args)=>Number(delay)>=30000?0:nativeInterval(fn,delay,...args);
  const installStyle=()=>{{
    if(document.getElementById('vigia-vqa-determinism'))return;
    const mount=document.head||document.documentElement;
    if(!mount)return;
    const style=document.createElement('style');
    style.id='vigia-vqa-determinism';
    style.textContent='*,*::before,*::after{{animation:none!important;transition:none!important;scroll-behavior:auto!important;caret-color:transparent!important}}';
    mount.append(style);
  }};
  if(document.documentElement)installStyle();
  else addEventListener('DOMContentLoaded',installStyle,{{once:true}});
}})();
"""

GOLDEN_CARTOGRAPHY_INIT = r"""
(() => {
  const installerAttribute='data-vqa-golden-cartography-installer';
  const cartographySelector='img[data-vqa-golden-cartography="donor-basemap"]';
  const mapSelector='[data-vqa] .tile-map';
  const sourceSelector='[data-map-source]';
  let scheduled=false;
  let authorityPromise;

  const root=()=>document.documentElement;
  const isHttpDocument=()=>location.protocol==='http:'||location.protocol==='https:';
  const route=()=>location.hash.replace(/^#\/?/,'').split('?',1)[0]||'command-overview';
  const sourceCount=map=>map.querySelectorAll(sourceSelector).length;
  const setInstallerState=value=>root()?.setAttribute(installerAttribute,value);

  const assertSourceInvariant=(map,before,phase)=>{
    const after=sourceCount(map);
    map.dataset.vqaGoldenMapSourceCountBefore=String(before);
    map.dataset.vqaGoldenMapSourceCountAfter=String(after);
    map.dataset.vqaGoldenMapSourceCountInvariant=String(before===after);
    if(before!==after){
      map.dataset.vqaGoldenCartographyState='INVARIANT_FAILED';
      throw new Error(`golden_cartography_map_source_count_changed:${phase}:${before}:${after}`);
    }
  };

  const position=(map,image)=>{
    const grid=image.parentElement;
    if(!grid?.classList.contains('tile-map__grid'))throw new Error('golden_cartography_grid_missing');
    const centerX=Number.parseFloat(grid.style.getPropertyValue('--center-x'));
    const centerY=Number.parseFloat(grid.style.getPropertyValue('--center-y'));
    const width=map.clientWidth;
    const height=map.clientHeight;
    if(!(width>0&&height>0&&Number.isFinite(centerX)&&Number.isFinite(centerY)))return;
    Object.assign(image.style,{
      left:`${centerX-width/2}px`,
      top:`${centerY-height/2}px`,
      width:`${width}px`,
      height:`${height}px`,
    });
  };

  const authority=()=>{
    if(!isHttpDocument()){
      setInstallerState('WAITING_FOR_HTTP');
      return Promise.resolve(false);
    }
    authorityPromise??=fetch('/backend/__health',{cache:'no-store',credentials:'same-origin'})
      .then(async response=>({ok:response.ok,body:await response.json()}))
      .then(({ok,body})=>{
        if(!ok||body?.authority!=='TEST_ONLY_GOLDEN_VISUAL')throw new Error('golden_cartography_authority_rejected');
        setInstallerState('AUTHORIZED');
        return true;
      })
      .catch(error=>{
        setInstallerState('REJECTED');
        throw error;
      });
    return authorityPromise;
  };

  const install=map=>{
    const grid=map.querySelector(':scope > .tile-map__grid');
    if(!grid)return;
    const existing=grid.querySelector(`:scope > ${cartographySelector}`);
    if(existing){
      const baseline=Number(map.dataset.vqaGoldenMapSourceCountBefore);
      if(Number.isInteger(baseline))assertSourceInvariant(map,baseline,'reconcile');
      position(map,existing);
      return;
    }

    const before=sourceCount(map);
    const image=document.createElement('img');
    image.dataset.vqaGoldenCartography='donor-basemap';
    image.alt='';
    image.setAttribute('aria-hidden','true');
    image.decoding='sync';
    image.draggable=false;
    image.style.cssText='position:absolute;z-index:2;display:block;max-width:none;object-fit:cover;pointer-events:none;';
    map.dataset.vqaGoldenCartographyState='LOADING';
    grid.append(image);
    assertSourceInvariant(map,before,'append');
    position(map,image);
    image.addEventListener('load',()=>{
      assertSourceInvariant(map,before,'load');
      position(map,image);
      map.dataset.vqaGoldenCartographyState='READY';
    },{once:true});
    image.addEventListener('error',()=>{
      map.dataset.vqaGoldenCartographyState='FAILED';
      throw new Error('golden_cartography_image_load_failed');
    },{once:true});
    image.src='/__vqa/golden-cartography/donor-basemap.svg';
  };

  const reconcile=()=>{
    scheduled=false;
    if(!isHttpDocument()){
      setInstallerState('WAITING_FOR_HTTP');
      return;
    }
    authority().then(authorized=>{
      if(authorized)document.querySelectorAll(mapSelector).forEach(install);
    });
  };
  const schedule=()=>{
    if(scheduled)return;
    scheduled=true;
    queueMicrotask(reconcile);
  };

  setInstallerState('PENDING');
  new MutationObserver(schedule).observe(document,{subtree:true,childList:true});
  addEventListener('hashchange',schedule);
  addEventListener('resize',schedule);
  if(document.readyState==='loading')addEventListener('DOMContentLoaded',schedule,{once:true});
  else schedule();
})();
"""

OVERLAY_INIT = r"""
(() => {
  const files={"command-overview":"01-command-overview.png","incidents":"02-incidents.png","intelligence":"03-intelligence.png","evidence":"04-evidence.png","operations":"05-operations.png","incident-detail":"06-incident-detail.png"};
  function parsed(){const [route,query='']=location.hash.replace(/^#\/?/,'').split('?');return{route:route||'command-overview',params:new URLSearchParams(query)}}
  function apply(mode){
    document.querySelector('[data-vqa-dev-overlay]')?.remove();
    document.querySelector('[data-vqa-dev-grid]')?.remove();
    const {route}=parsed();
    if(mode==='grid'){
      const grid=document.createElement('div');grid.dataset.vqaDevGrid='true';grid.style.cssText='position:fixed;inset:0;z-index:2147483646;pointer-events:none;background-image:linear-gradient(rgba(214,58,46,.28) 1px,transparent 1px),linear-gradient(90deg,rgba(214,58,46,.28) 1px,transparent 1px);background-size:4px 4px';document.body.append(grid);return;
    }
    if(!['reference','overlay','difference'].includes(mode)||!files[route])return;
    const image=document.createElement('img');image.dataset.vqaDevOverlay='true';image.alt='Visual QA locked reference overlay';image.src=`/__vqa/reference/${files[route]}`;
    image.style.cssText=`position:fixed;inset:0;width:1672px;height:941px;max-width:none;z-index:2147483646;pointer-events:none;object-fit:fill;opacity:${mode==='reference'?1:.5};${mode==='difference'?'mix-blend-mode:difference;opacity:1;':''}`;document.body.append(image);
  }
  function current(){return parsed().params.get('visualQa')||''}
  addEventListener('DOMContentLoaded',()=>apply(current()),{once:true});
  addEventListener('keydown',event=>{if(/input|select|textarea/i.test(document.activeElement?.tagName||''))return;const mode={r:'reference',o:'overlay',d:'difference',g:'grid'}[event.key.toLowerCase()];if(mode){event.preventDefault();apply(mode)}});
})();
"""


def start_proxy(lane: str, listen_port: int, target_host: str, target_port: int, fixture: dict[str, Any], *, source_root: Path | None = None, release_id: str = "") -> tuple[Any, threading.Thread]:
    if lane == "canonical":
        # Parse one HTTP request at a time before forwarding it. The previous
        # raw socket tunnel could carry browser bytes beyond the first request
        # header into an upstream connection that was explicitly close-bound,
        # yielding intermittent parser-level 400s which never reached the API.
        class CanonicalProxyHandler(GoldenProxyHandler):
            fixture = {}
            screens = {}
            source_root = None

            def _fixture_response(self, _path: str) -> bool:
                return False

        CanonicalProxyHandler.target_host = target_host
        CanonicalProxyHandler.target_port = target_port
        server = ThreadingHTTPServer(("127.0.0.1", listen_port), CanonicalProxyHandler)
        server.daemon_threads = True
    else:
        GoldenProxyHandler.target_host = target_host
        GoldenProxyHandler.target_port = target_port
        GoldenProxyHandler.fixture = fixture
        GoldenProxyHandler.screens = golden_screens(fixture)
        GoldenProxyHandler.source_root = source_root
        GoldenProxyHandler.source_release_id = release_id
        server = ThreadingHTTPServer(("127.0.0.1", listen_port), GoldenProxyHandler)
        server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, name=f"vigia-{lane}-proxy", daemon=True)
    thread.start()
    return server, thread


def wait_proxy(port: int) -> None:
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.25):
                return
        except OSError:
            time.sleep(0.05)
    raise RuntimeError("visual_qa_proxy_not_ready")


def settled(page, route: str) -> None:
    body = page.locator("body")
    body.wait_for(state="visible", timeout=40_000)
    deadline = time.monotonic() + 40
    while time.monotonic() < deadline:
        route_ready = body.get_attribute("data-vigia-route") == route
        state_ready = body.get_attribute("data-vigia-app-state") in {"ready", "degraded", "error"}
        maps = page.locator("[data-map-state]")
        map_ready = all(maps.nth(index).get_attribute("data-map-state") in TERMINAL_MAP_STATES for index in range(maps.count()))
        installer_state = page.locator("html").get_attribute("data-vqa-golden-cartography-installer")
        if installer_state == "REJECTED":
            raise RuntimeError("visual_qa_golden_cartography_authority_rejected")
        failed_cartography = [
            maps.nth(index).get_attribute("data-vqa-golden-cartography-state")
            for index in range(maps.count())
            if maps.nth(index).get_attribute("data-vqa-golden-cartography-state") in {"FAILED", "INVARIANT_FAILED"}
        ]
        if failed_cartography:
            raise RuntimeError(f"visual_qa_golden_cartography_failed:{failed_cartography}")
        golden_cartography_ready = (
            installer_state is None
            or (
                installer_state == "AUTHORIZED"
                and all(maps.nth(index).get_attribute("data-vqa-golden-cartography-state") == "READY" for index in range(maps.count()))
            )
        )
        if route_ready and state_ready and map_ready and golden_cartography_ready:
            break
        page.wait_for_timeout(50)
    else:
        raise PlaywrightTimeout(f"visual_qa_route_not_settled:{route}")
    page.evaluate("document.fonts ? document.fonts.ready : Promise.resolve()")
    page.wait_for_timeout(150)


def stable_screenshot(page, output: Path) -> dict[str, Any]:
    previous = None
    attempts = []
    for index in range(12):
        payload = page.screenshot(full_page=False, animations="disabled", caret="hide", scale="css")
        digest = hashlib.sha256(payload).hexdigest()
        attempts.append(digest)
        if previous == digest:
            output.write_bytes(payload)
            return {"stable": True, "attempts": index + 1, "sha256": digest, "sequence": attempts}
        previous = digest
        page.wait_for_timeout(150)
    output.write_bytes(payload)
    return {"stable": False, "attempts": len(attempts), "sha256": attempts[-1], "sequence": attempts}


def collect_regions(page, route: str) -> dict[str, dict[str, Any]]:
    output = {}
    for identifier in REQUIRED_VQA[route]:
        locator = page.locator(f'[data-vqa="{identifier}"]')
        count = locator.count()
        visible_count = sum(1 for index in range(count) if locator.nth(index).is_visible())
        if count != 1 or visible_count != 1:
            output[identifier] = {"count": count, "visibleCount": visible_count, "box": None, "style": None}
            continue
        node = locator.first
        box = node.bounding_box()
        style = node.evaluate("""node => {const s=getComputedStyle(node);return {
          fontFamily:s.fontFamily,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,color:s.color,
          backgroundColor:s.backgroundColor,borderColor:s.borderColor,borderWidth:s.borderWidth,borderRadius:s.borderRadius,
          padding:s.padding,gap:s.gap,display:s.display,gridTemplateColumns:s.gridTemplateColumns,
        }}""")
        output[identifier] = {"count": count, "visibleCount": visible_count, "box": {key: float(box[key]) for key in ("x", "y", "width", "height")} if box else None, "style": style}
    return output


def displaced_area(target: dict[str, float], actual: dict[str, float]) -> float:
    tx2, ty2 = target["x"] + target["width"], target["y"] + target["height"]
    ax2, ay2 = actual["x"] + actual["width"], actual["y"] + actual["height"]
    overlap = max(0, min(tx2, ax2) - max(target["x"], actual["x"])) * max(0, min(ty2, ay2) - max(target["y"], actual["y"]))
    return target["width"] * target["height"] + actual["width"] * actual["height"] - 2 * overlap


def geometry_report(route: str, regions: dict[str, Any], contract: dict[str, Any]) -> dict[str, Any]:
    entries = []
    for identifier, expected in contract["routes"][route]["regions"].items():
        target = expected.get("target")
        enforced = expected.get("geometryEnforced", target is not None) is True
        target_valid = isinstance(target, dict) and all(isinstance(target.get(key), (int, float)) for key in ("x", "y", "width", "height"))
        if not enforced or not target_valid:
            entries.append({"region": identifier, "target": target, "runtime": regions.get(identifier, {}).get("box"), "delta": None, "maximumDelta": None, "totalDisplacedArea": 0, "enforced": False, "pass": False, "status": "UNRESOLVED_TARGET_GEOMETRY", "failure": "locked_raster_geometry_not_measured"})
            continue
        actual = regions.get(identifier, {}).get("box")
        if not actual:
            entries.append({"region": identifier, "target": target, "runtime": None, "delta": None, "maximumDelta": None, "totalDisplacedArea": target["width"] * target["height"], "enforced": True, "pass": False, "failure": "missing_or_nonunique_region"})
            continue
        delta = {key: actual[key] - target[key] for key in ("x", "y", "width", "height")}
        maximum = max(abs(value) for value in delta.values())
        entries.append({"region": identifier, "target": target, "runtime": actual, "delta": delta, "maximumDelta": maximum, "totalDisplacedArea": displaced_area(target, actual), "enforced": True, "pass": maximum <= expected["tolerance"]})
    entries.sort(key=lambda row: (-row["totalDisplacedArea"], row["region"]))
    return {"route": route, "tolerancePx": 2, "pass": all(row["pass"] for row in entries), "failures": sum(not row["pass"] for row in entries), "regions": entries}


def normalize_family(value: str) -> str:
    return ", ".join(part.strip().strip('"').strip("'") for part in value.split(","))


def grid_columns_equal(target: str, runtime: str) -> bool:
    match = re.fullmatch(r"repeat\((\d+),\s*minmax\(0(?:px)?,\s*1fr\)\)", target)
    if not match:
        return runtime == target
    expected_count = int(match.group(1))
    values = runtime.split()
    if len(values) != expected_count:
        return False
    try:
        pixels = [float(value.removesuffix("px")) for value in values]
    except ValueError:
        return False
    return max(pixels) - min(pixels) <= 0.51


def style_report(route: str, regions: dict[str, Any], contract: dict[str, Any]) -> dict[str, Any]:
    entries, failures = [], 0
    mappings = {
        "fontFamily": "targetFontFamily", "fontSize": "targetFontSize", "fontWeight": "targetFontWeight",
        "lineHeight": "targetLineHeight", "color": "targetColor", "backgroundColor": "targetBackground", "borderColor": "targetBorder",
        "borderWidth": "targetBorderWidth",
        "borderRadius": "targetRadius", "padding": "targetPadding", "gap": "targetGap",
        "display": "targetDisplay", "gridTemplateColumns": "targetGridTemplateColumns",
    }
    for identifier, expected in contract["routes"][route]["regions"].items():
        actual = regions.get(identifier, {}).get("style")
        differences, skipped = [], []
        enforcement = expected.get("styleEnforcement", {})
        enforced_properties = [(actual_key, expected_key) for actual_key, expected_key in mappings.items() if enforcement.get(actual_key) is True and expected.get(expected_key) is not None]
        if not actual:
            if enforced_properties:
                differences.append({"property": "region", "target": "present", "runtime": "missing", "enforced": True})
        else:
            for actual_key, expected_key in mappings.items():
                target_value = expected.get(expected_key)
                runtime_value = actual.get(actual_key)
                enforced = enforcement.get(actual_key) is True and target_value is not None
                if not enforced:
                    skipped.append({"property": actual_key, "reason": "null_target" if target_value is None else "not_enforced"})
                    continue
                reported_target = target_value
                if actual_key == "fontFamily":
                    equal = normalize_family(runtime_value) == normalize_family(target_value)
                elif actual_key in {"fontSize", "lineHeight"}:
                    try:
                        target_px = float(str(target_value).removesuffix("px"))
                        runtime_px = float(str(runtime_value).removesuffix("px"))
                        accessibility_floor = 12.0 if actual_key == "fontSize" else target_px
                        equal = runtime_px + 0.01 >= max(target_px, accessibility_floor)
                        reported_target = f">={max(target_px, accessibility_floor):g}px"
                        if actual_key == "fontSize" and target_px < accessibility_floor:
                            skipped.append({"property": actual_key, "reason": "locked_raster_value_below_operator_accessibility_floor", "lockedTarget": target_value, "minimumAccepted": f"{accessibility_floor:g}px"})
                    except (TypeError, ValueError):
                        equal = runtime_value == target_value
                elif actual_key == "gridTemplateColumns":
                    equal = grid_columns_equal(target_value, runtime_value)
                else:
                    equal = runtime_value == target_value
                if not equal:
                    differences.append({"property": actual_key, "target": reported_target, "runtime": runtime_value, "enforced": enforced, "provenance": expected["provenance"].get(actual_key) or expected["provenance"].get(expected_key.replace("target", "").lower())})
        region_pass = not any(item["enforced"] for item in differences)
        failures += 0 if region_pass else 1
        entries.append({"region": identifier, "pass": region_pass, "differences": differences, "skippedProperties": skipped, "computed": actual})
    return {"route": route, "pass": failures == 0, "failures": failures, "regions": entries}


def translation_registration(reference_f: np.ndarray, runtime_f: np.ndarray, basis: str) -> dict[str, Any]:
    if reference_f.shape != runtime_f.shape:
        return {"pass": False, "error": "registration_layout_mismatch", "translation": None, "basis": basis}
    if cv2 is None:
        return {"pass": None, "error": "opencv_unavailable", "translation": None, "transformApplied": False, "motionModel": "translation-only", "basis": basis}
    warp = np.eye(2, 3, dtype=np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 40, 1e-6)
    try:
        correlation, matrix = cv2.findTransformECC(reference_f, runtime_f, warp, cv2.MOTION_TRANSLATION, criteria, None, 5)
        x, y = float(matrix[0, 2]), float(matrix[1, 2])
        return {"pass": abs(x) <= 2 and abs(y) <= 2, "correlation": float(correlation), "translation": {"x": x, "y": y}, "maximumTranslationPx": 2, "transformApplied": False, "motionModel": "translation-only", "basis": basis}
    except cv2.error as error:
        return {"pass": False, "error": str(error).splitlines()[0], "translation": None, "transformApplied": False, "motionModel": "translation-only", "basis": basis}


def photometric_registration(reference_path: Path, runtime_path: Path) -> dict[str, Any]:
    if cv2 is None:
        return {"pass": None, "error": "opencv_unavailable", "translation": None, "basis": "whole-frame-photometric", "engine": "not-installed-local-source-mode"}
    reference = cv2.imread(str(reference_path), cv2.IMREAD_GRAYSCALE)
    runtime = cv2.imread(str(runtime_path), cv2.IMREAD_GRAYSCALE)
    if reference is None or runtime is None:
        return {"pass": False, "error": "registration_layout_mismatch", "translation": None, "basis": "whole-frame-photometric"}
    return translation_registration(
        reference.astype(np.float32) / 255.0,
        runtime.astype(np.float32) / 255.0,
        "whole-frame-photometric",
    )


def structural_registration(geometry: dict[str, Any], dimensions: dict[str, int]) -> dict[str, Any]:
    height, width = dimensions["height"], dimensions["width"]
    target_edges = np.zeros((height, width), dtype=np.float32)
    runtime_edges = np.zeros((height, width), dtype=np.float32)
    rows = [
        row for row in geometry["regions"]
        if row.get("enforced") and row.get("target") and row.get("runtime")
    ]
    if not rows:
        return {"pass": False, "error": "registration_regions_missing", "translation": None, "basis": "enforced-region-edges", "regionCount": 0}
    if cv2 is None:
        deltas = [component for row in rows for component in row.get("delta", {}).values() if isinstance(component, (int, float))]
        x_values = [row["runtime"]["x"] - row["target"]["x"] for row in rows]
        y_values = [row["runtime"]["y"] - row["target"]["y"] for row in rows]
        x = float(np.median(x_values)) if x_values else 0.0
        y = float(np.median(y_values)) if y_values else 0.0
        return {
            "pass": bool(deltas) and max(abs(value) for value in deltas) <= 2,
            "translation": {"x": x, "y": y},
            "maximumTranslationPx": 2,
            "maximumEnforcedEdgeDeltaPx": max((abs(value) for value in deltas), default=None),
            "transformApplied": False,
            "motionModel": "declared-region-edge-delta",
            "basis": "enforced-region-edges",
            "regionCount": len(rows),
            "engine": "numpy-local-fallback",
        }
    for index, row in enumerate(rows):
        value = 0.25 + (0.75 * (index + 1) / len(rows))
        for canvas, key in ((target_edges, "target"), (runtime_edges, "runtime")):
            box = row[key]
            x1, y1 = round(box["x"]), round(box["y"])
            x2 = round(box["x"] + box["width"] - 1)
            y2 = round(box["y"] + box["height"] - 1)
            cv2.rectangle(canvas, (x1, y1), (x2, y2), value, 2)
    result = translation_registration(target_edges, runtime_edges, "enforced-region-edges")
    result["regionCount"] = len(rows)
    return result


def classify_diff(mask_path: Path, regions: dict[str, Any]) -> dict[str, Any]:
    if cv2 is None:
        try:
            mask = np.asarray(Image.open(mask_path).convert("RGBA"))
        except (OSError, ValueError):
            return {"changedPixels": 0, "unclassifiedPixels": 0, "regions": []}
        changed = mask[..., 3] > 0
    else:
        mask = cv2.imread(str(mask_path), cv2.IMREAD_UNCHANGED)
        if mask is None:
            return {"changedPixels": 0, "unclassifiedPixels": 0, "regions": []}
        changed = mask[..., 3] > 0 if mask.ndim == 3 and mask.shape[2] == 4 else np.any(mask[..., :3] != 0, axis=2)
    ys, xs = np.nonzero(changed)
    count = len(xs)
    if count == 0:
        return {"changedPixels": 0, "unclassifiedPixels": 0, "regions": []}
    valid = [(name, row["box"]) for name, row in regions.items() if row.get("box")]
    if not valid:
        return {"changedPixels": count, "unclassifiedPixels": count, "regions": []}
    labels = np.full(count, -1, dtype=np.int16)
    direct = np.zeros(count, dtype=bool)
    ordered = sorted(enumerate(valid), key=lambda item: (item[1][1]["width"] * item[1][1]["height"], item[1][0]))
    for original_index, (_name, box) in ordered:
        inside = (xs >= box["x"]) & (xs < box["x"] + box["width"]) & (ys >= box["y"]) & (ys < box["y"] + box["height"]) & (labels < 0)
        labels[inside] = original_index
        direct[inside] = True
    remaining = np.nonzero(labels < 0)[0]
    if len(remaining):
        rx, ry = xs[remaining], ys[remaining]
        distances = []
        for _name, box in valid:
            dx = np.maximum.reduce([box["x"] - rx, np.zeros_like(rx), rx - (box["x"] + box["width"] - 1)])
            dy = np.maximum.reduce([box["y"] - ry, np.zeros_like(ry), ry - (box["y"] + box["height"] - 1)])
            distances.append(dx * dx + dy * dy)
        labels[remaining] = np.argmin(np.stack(distances), axis=0)
    totals = Counter(int(value) for value in labels)
    rows = []
    for index, (name, box) in enumerate(valid):
        pixels = totals.get(index, 0)
        direct_pixels = int(np.count_nonzero((labels == index) & direct))
        rows.append({"region": name, "pixelDifference": pixels, "directPixelDifference": direct_pixels, "nearestAssignedPixelDifference": pixels - direct_pixels, "percentage": pixels / count if count else 0, "runtimeBounds": box})
    rows.sort(key=lambda row: (-row["pixelDifference"], row["region"]))
    return {"changedPixels": count, "directRegionPixels": int(np.count_nonzero(direct)), "nearestAssignedPixels": int(np.count_nonzero(~direct)), "unclassifiedPixels": int(np.count_nonzero(labels < 0)), "regions": rows}


def dom_metrics(page) -> dict[str, Any]:
    return page.evaluate("""() => {
      const html=document.documentElement,body=document.body,main=document.querySelector('main');
      const visible=node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&Number(s.opacity)!==0};
      const intentionallyHidden=node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node),clip=s.clipPath||s.webkitClipPath||'none';return clip!=='none'||(s.position==='absolute'&&r.width<=2&&r.height<=2)||node.classList.contains('sr-only')};
      const controls=[...document.querySelectorAll('button,a[href],input,select,textarea,summary,[role="button"],[role="tab"]')].filter(visible);
      const unnamed=controls.filter(node=>!((node.getAttribute('aria-label')||node.getAttribute('title')||node.textContent||node.getAttribute('placeholder')||'').trim()));
      const clipped=[...document.querySelectorAll('h1,h2,h3,h4,p,span,strong,small,dt,dd,th,td,label,button,a')].filter(visible).filter(node=>!intentionallyHidden(node)).filter(node=>(node.textContent||'').trim().length>0).filter(node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return r.width>2&&r.height>2&&node.scrollWidth>node.clientWidth+1&&s.overflowX!=='auto'&&s.overflowX!=='scroll'}).map(node=>({tag:node.tagName,text:(node.textContent||'').trim().slice(0,100),clientWidth:node.clientWidth,scrollWidth:node.scrollWidth}));
      const tables=[...document.querySelectorAll('table,.priority-table,.incident-inventory,[role="table"]')].filter(visible).map(node=>({className:String(node.className),clientWidth:node.clientWidth,scrollWidth:node.scrollWidth,overflow:Math.max(0,node.scrollWidth-node.clientWidth)}));
      const routeRegions=[...document.querySelectorAll('[data-vqa]')].filter(visible).filter(node=>!node.dataset.vqa.startsWith('shell.')).map(node=>({node,id:node.dataset.vqa,box:(()=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}})()}));
      const overlaps=[];for(let i=0;i<routeRegions.length;i++)for(let j=i+1;j<routeRegions.length;j++){const a=routeRegions[i],b=routeRegions[j];if(a.node.contains(b.node)||b.node.contains(a.node)||a.node.dataset.vqaAllowOverlap==='true'||b.node.dataset.vqaAllowOverlap==='true')continue;const w=Math.max(0,Math.min(a.box.right,b.box.right)-Math.max(a.box.x,b.box.x)),h=Math.max(0,Math.min(a.box.bottom,b.box.bottom)-Math.max(a.box.y,b.box.y));if(w*h>1)overlaps.push({a:a.id,b:b.id,area:w*h});}
      const mapStates=[...document.querySelectorAll('[data-map-state]')].map(node=>({state:node.dataset.mapState,loaded:Number(node.dataset.mapLoadedTileCount),failed:Number(node.dataset.mapFailedTileCount),total:Number(node.dataset.mapTotalTileCount),failureClass:node.dataset.mapFailureClass||'',retryState:node.dataset.mapRetryState||'',provider:node.dataset.mapProvider||'',goldenCartographyState:node.dataset.vqaGoldenCartographyState||'',goldenMapSourceCountBefore:node.dataset.vqaGoldenMapSourceCountBefore==null?null:Number(node.dataset.vqaGoldenMapSourceCountBefore),goldenMapSourceCountAfter:node.dataset.vqaGoldenMapSourceCountAfter==null?null:Number(node.dataset.vqaGoldenMapSourceCountAfter),goldenMapSourceCountInvariant:node.dataset.vqaGoldenMapSourceCountInvariant||''}));
      const identity=node=>node.dataset.vqa||node.id||[node.tagName.toLowerCase(),...String(node.className||'').trim().split(/\\s+/).filter(Boolean).slice(0,3)].join('.');
      const intentionalRenderViewport=node=>node.classList.contains('tile-map')||node.classList.contains('tile-map__grid')||node.classList.contains('tile-map__source');
      const containers=[...document.querySelectorAll('main,section,article,aside,nav,header,footer,div,ol,ul,table,[role="table"],[data-vqa]')].filter(visible).filter(node=>node!==main);
      const nestedHorizontalOverflow=containers.filter(node=>!intentionalRenderViewport(node)).filter(node=>node.clientWidth>0&&node.scrollWidth>node.clientWidth+1).map(node=>{const s=getComputedStyle(node);return{container:identity(node),className:String(node.className||''),text:(node.textContent||'').trim().slice(0,140),clientWidth:node.clientWidth,scrollWidth:node.scrollWidth,overflowPx:node.scrollWidth-node.clientWidth,overflowX:s.overflowX}});
      const nestedVerticalClipping=containers.filter(node=>!intentionalRenderViewport(node)).filter(node=>node.clientHeight>0&&node.scrollHeight>node.clientHeight+1&&['hidden','clip'].includes(getComputedStyle(node).overflowY)).map(node=>{const s=getComputedStyle(node);return{container:identity(node),className:String(node.className||''),text:(node.textContent||'').trim().slice(0,140),clientHeight:node.clientHeight,scrollHeight:node.scrollHeight,clippedPx:node.scrollHeight-node.clientHeight,overflowY:s.overflowY}});
      const textNodes=[...document.querySelectorAll('p,small,time,dt,dd,th,td,label,button,a,input,select,textarea,strong,em,.eyebrow,.badge')].filter(visible).filter(node=>(node.textContent||node.value||node.getAttribute('aria-label')||'').trim());
      const typography=textNodes.map(node=>{const px=parseFloat(getComputedStyle(node).fontSize)||0,technical=Boolean(node.closest('details.technical-details,[data-technical],code,pre,.technical-id,.telemetry-technical')),body=node.matches('p,input,select,textarea'),metadata=node.matches('small,time,dt,em,.eyebrow,.badge'),important=node.matches('dd,th,td,label,button,a,strong');const minimum=technical?11:body?14:metadata?12:important?13:12;return{tag:node.tagName,className:String(node.className||''),text:(node.textContent||node.value||node.getAttribute('aria-label')||'').trim().slice(0,100),fontSizePx:px,minimumPx:minimum,category:technical?'technical':body?'body':metadata?'metadata':important?'important':'metadata',pass:px+.01>=minimum}});
      return {
        viewport:{width:innerWidth,height:innerHeight},document:{clientWidth:html.clientWidth,scrollWidth:Math.max(html.scrollWidth,body.scrollWidth),clientHeight:html.clientHeight,scrollHeight:Math.max(html.scrollHeight,body.scrollHeight)},
        main:{clientWidth:main?.clientWidth??null,scrollWidth:main?.scrollWidth??null,clientHeight:main?.clientHeight??null,scrollHeight:main?.scrollHeight??null},
        horizontalOverflowPx:Math.max(0,Math.max(html.scrollWidth,body.scrollWidth)-html.clientWidth),mainHorizontalOverflowPx:main?Math.max(0,main.scrollWidth-main.clientWidth):0,primaryHorizontalTableScrollbars:tables.filter(row=>row.overflow>1),
        overlaps,clippedLabels:clipped,unnamedControls:unnamed.map(node=>({tag:node.tagName,className:String(node.className)})),nestedHorizontalOverflow,nestedVerticalClipping,typography:{minimumVisiblePx:typography.length?Math.min(...typography.map(row=>row.fontSizePx)):null,violations:typography.filter(row=>!row.pass),samples:typography.length},
        mapStates,bodyRoute:body.dataset.vigiaRoute,appState:body.dataset.vigiaAppState,
      };
    }""")


def canonical_mask_report(page, lane: str, mask_path: Path) -> dict[str, Any]:
    candidates = page.evaluate("""() => {
      const visible=node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&Number(s.opacity)!==0};
      const rows=[];
      const add=(category,selector,nodes)=>{for(const node of nodes){if(!visible(node))continue;const r=node.getBoundingClientRect();rows.push({category,selector,box:{x:r.x,y:r.y,width:r.width,height:r.height}})}};
      for(const node of document.querySelectorAll('.tile-map')){
        if(!visible(node))continue;
        const r=node.getBoundingClientRect(),surface=node.closest('.canonical-map')||node.parentElement,routeSurface=node.closest('section');
        const holeNodes=[...(surface?.querySelectorAll('.canonical-map__tools,.canonical-map__zoom,.canonical-map__controls,.canonical-map__legend')||[]),...(routeSurface?.querySelectorAll(':scope > .incident-map-layers')||[])].filter(visible);
        rows.push({category:'map_tile_and_live_geometry_interior',selector:'.tile-map',box:{x:r.x,y:r.y,width:r.width,height:r.height},holes:holeNodes.map(hole=>{const b=hole.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height}})});
      }
      add('evidence_media_interior','[data-vqa="evidence.recent"] img, [data-vqa="evidence.recent"] .evidence-preview-unavailable',[...document.querySelectorAll('[data-vqa="evidence.recent"] img, [data-vqa="evidence.recent"] .evidence-preview-unavailable')]);
      add('live_timestamp','time',[...document.querySelectorAll('time')]);
      add('explicit_live_numeric','[data-vqa-live-numeric="true"]',[...document.querySelectorAll('[data-vqa-live-numeric="true"]')]);
      return rows;
    }""")
    if lane == "golden":
        candidates = [candidate for candidate in candidates if candidate["category"] in {"map_tile_and_live_geometry_interior", "evidence_media_interior"}]
    ignore_regions, entries = [], []

    def clipped_region(box: dict[str, Any]) -> dict[str, int] | None:
        x1 = max(0, min(GOLDEN_VIEWPORT["width"], math.floor(box["x"])))
        y1 = max(0, min(GOLDEN_VIEWPORT["height"], math.floor(box["y"])))
        x2 = max(0, min(GOLDEN_VIEWPORT["width"], math.ceil(box["x"] + box["width"])))
        y2 = max(0, min(GOLDEN_VIEWPORT["height"], math.ceil(box["y"] + box["height"])))
        return None if x2 <= x1 or y2 <= y1 else {"x1": x1, "y1": y1, "x2": x2, "y2": y2}

    def subtract_hole(region: dict[str, int], hole: dict[str, int]) -> list[dict[str, int]]:
        ix1, iy1 = max(region["x1"], hole["x1"]), max(region["y1"], hole["y1"])
        ix2, iy2 = min(region["x2"], hole["x2"]), min(region["y2"], hole["y2"])
        if ix2 <= ix1 or iy2 <= iy1:
            return [region]
        output = []
        for candidate_region in (
            {"x1": region["x1"], "y1": region["y1"], "x2": region["x2"], "y2": iy1},
            {"x1": region["x1"], "y1": iy2, "x2": region["x2"], "y2": region["y2"]},
            {"x1": region["x1"], "y1": iy1, "x2": ix1, "y2": iy2},
            {"x1": ix2, "y1": iy1, "x2": region["x2"], "y2": iy2},
        ):
            if candidate_region["x2"] > candidate_region["x1"] and candidate_region["y2"] > candidate_region["y1"]:
                output.append(candidate_region)
        return output

    for candidate in candidates:
        base = clipped_region(candidate["box"])
        if base is None:
            continue
        regions = [base]
        holes = [region for box in candidate.get("holes", []) if (region := clipped_region(box)) is not None]
        for hole in holes:
            regions = [piece for region in regions for piece in subtract_hole(region, hole)]
        for region in regions:
            ignore_regions.append(region)
            entries.append({**candidate, "holes": holes, "ignoreRegion": region, "pixels": (region["x2"] - region["x1"]) * (region["y2"] - region["y1"])})
    mask = Image.new("RGBA", (GOLDEN_VIEWPORT["width"], GOLDEN_VIEWPORT["height"]), (0, 0, 0, 0))
    draw = ImageDraw.Draw(mask)
    for region in ignore_regions:
        draw.rectangle((region["x1"], region["y1"], region["x2"] - 1, region["y2"] - 1), fill=(255, 255, 255, 255))
    mask.save(mask_path, format="PNG", optimize=False, compress_level=9)
    covered = int(np.count_nonzero(np.asarray(mask)[..., 3]))
    return {
        "schemaVersion": "vigia.canonical-visual-mask.v1",
        "lane": lane,
        "policy": {
            "approved": ["map tile interior", "live map geometry", "evidence media interior", "live timestamps", "explicitly attributed live numeric values"],
            "numericMaskRule": "Only elements explicitly marked data-vqa-live-numeric=true are masked; numeric-looking text is never guessed.",
            "goldenMasking": "limited to dynamic map/geometry and evidence-media interiors; shell, controls, legends, typography, tables and panels remain unmasked",
        },
        "ignoreRegions": ignore_regions,
        "entries": entries,
        "coveredPixels": covered,
        "coverageRatio": covered / (GOLDEN_VIEWPORT["width"] * GOLDEN_VIEWPORT["height"]),
        "sha256": sha256(mask_path),
    }


def seed_golden_route_incident(page, route: str) -> None:
    identifier = GOLDEN_ROUTE_INCIDENTS.get(route)
    if not identifier:
        return
    page.evaluate("""identifier => {
      const key='vigia-mission-dark-state-v2';
      let state={};
      try { state=JSON.parse(localStorage.getItem(key)||'{}')||{}; } catch {}
      localStorage.setItem(key,JSON.stringify({...state,selectedIncidentId:identifier}));
    }""", identifier)


def scene_contract(page, route: str, lane: str) -> dict[str, Any]:
    maps = page.locator(".canonical-map > .tile-map")
    expected = EXPECTED_SCENES.get(route)
    if expected is None:
        gates = {"evidenceUsesGraphNotMap": maps.count() == 0 and page.locator("canvas[data-evidence-graph]").count() == 1}
        return {"route": route, "scene": None, "gates": gates, "pass": all(gates.values())}
    if maps.count() != 1:
        return {"route": route, "scene": None, "gates": {"singleOwnedScene": False}, "pass": False, "failure": f"expected_one_map_found_{maps.count()}"}
    scene = maps.first.evaluate("""node => {
      const owner=node.closest('.canonical-map');
      let featureSet={};try{featureSet=JSON.parse(node.dataset.mapRenderedFeatureSet||'{}')}catch{}
      const controls=[...new Set([...owner.querySelectorAll('[data-map-control-set]')].flatMap(item=>(item.dataset.mapControlSet||'').split(',')).filter(Boolean))];
      const legend=(owner.dataset.mapLegendSet||owner.querySelector('[data-map-legend-set]')?.dataset.mapLegendSet||'').split(',').filter(Boolean);
      const csv=name=>(node.dataset[name]||'').split(',').filter(Boolean);
      const box=node=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}};
      const markers=[...node.querySelectorAll('.tile-map__marker')].map(marker=>{const detail=marker.querySelector(':scope > b'),style=detail?getComputedStyle(detail):null;return{id:marker.dataset.mapFeatureId||'',kind:marker.dataset.mapMarkerKind||'',className:marker.className,label:marker.getAttribute('aria-label')||'',box:box(marker),detail:detail?{text:detail.textContent||'',box:box(detail),display:style.display,visibility:style.visibility,opacity:style.opacity,color:style.color,overflow:style.overflow}:null}});
      return {sceneId:node.dataset.mapSceneIdentity||'',sceneType:node.dataset.mapSceneType||'',scope:node.dataset.mapSceneScope||'',selectedIncidentId:node.dataset.mapSelectedIncident||'',focusIncidentId:node.dataset.mapFocusIncident||'',bounds:csv('mapBbox').map(Number),center:csv('mapCenter').map(Number),zoom:Number(node.dataset.mapZoom),declaredLayers:csv('mapDeclaredLayers'),visibleLayers:csv('mapVisibleLayers'),renderedFeatureSet:featureSet,controls,legend,labelPolicy:owner.dataset.mapLabelPolicy||'',state:node.dataset.mapState||'',markers};
    }""")
    expected_layers, declared, visible = expected["layers"], scene["declaredLayers"], scene["visibleLayers"]
    gates = {
        "singleOwnedScene": True,
        "sceneType": scene["sceneType"] == expected["sceneType"],
        "sceneId": scene["sceneId"].startswith(f"{expected['sceneType']}:") and len(scene["sceneId"]) > len(expected["sceneType"]) + 1,
        "selectedIncident": bool(scene["selectedIncidentId"]),
        "bounds": len(scene["bounds"]) == 4 and all(math.isfinite(value) for value in scene["bounds"]) and scene["bounds"][0] < scene["bounds"][2] and scene["bounds"][1] < scene["bounds"][3],
        "camera": len(scene["center"]) == 2 and all(math.isfinite(value) for value in scene["center"]) and math.isfinite(scene["zoom"]) and (lane != "golden" or scene["zoom"] == expected["zoom"]),
        "declaredLayerSet": declared == expected_layers,
        "visibleLayersAreDeclared": all(name in declared for name in visible),
        "renderedFeatureSet": set(scene["renderedFeatureSet"]) == set(visible) and all(isinstance(value, int) and value >= 0 for value in scene["renderedFeatureSet"].values()),
        "controls": scene["controls"] == expected["controls"],
        "legend": bool(scene["legend"]) if lane == "golden" else True,
        "labelPolicy": bool(scene["labelPolicy"]),
    }
    return {"route": route, "scene": scene, "gates": gates, "pass": all(gates.values())}


def scene_independence(routes: dict[str, Any]) -> dict[str, Any]:
    scenes = {route: metrics.get("sceneContract", {}).get("scene") for route, metrics in routes.items() if route in EXPECTED_SCENES}
    complete = len(scenes) == len(EXPECTED_SCENES) and all(scenes.values())
    identities = [scene["sceneId"] for scene in scenes.values() if scene]
    types = [scene["sceneType"] for scene in scenes.values() if scene]
    layer_sets = [tuple(scene["declaredLayers"]) for scene in scenes.values() if scene]
    cameras = [(tuple(scene["bounds"]), tuple(scene["center"]), scene["zoom"]) for scene in scenes.values() if scene]
    pairs = []
    for first, second in [("command-overview", "incidents"), ("incidents", "intelligence"), ("intelligence", "operations"), ("operations", "incident-detail"), ("incidents", "incident-detail")]:
        left, right = scenes.get(first), scenes.get(second)
        distinct = bool(left and right and left["sceneId"] != right["sceneId"] and left["sceneType"] != right["sceneType"] and (left["bounds"] != right["bounds"] or left["declaredLayers"] != right["declaredLayers"] or left["zoom"] != right["zoom"]))
        pairs.append({"first": first, "second": second, "distinct": distinct, "firstScene": left, "secondScene": right})
    gates = {
        "complete": complete,
        "uniqueSceneIds": len(identities) == len(set(identities)) == len(EXPECTED_SCENES),
        "uniqueSceneTypes": len(types) == len(set(types)) == len(EXPECTED_SCENES),
        "uniqueRouteLayerSets": len(layer_sets) == len(set(layer_sets)) == len(EXPECTED_SCENES),
        "uniqueRouteCameras": len(cameras) == len(set(cameras)) == len(EXPECTED_SCENES),
        "pairwiseDistinct": all(row["distinct"] for row in pairs),
    }
    return {"scenes": scenes, "pairs": pairs, "gates": gates, "pass": all(gates.values())}


def navigate_through_ui(page, route: str) -> None:
    link = page.locator(f'#primary-navigation [data-route="{route}"]').first
    if link.count() != 1:
        raise RuntimeError(f"visual_qa_navigation_link_missing:{route}")
    link.click()
    settled(page, route)


def selection_contract(page, route: str, identifier: str) -> dict[str, Any]:
    evidence_incident = page.locator('canvas[data-evidence-graph]').evaluate_all("""nodes => nodes.map(node => {
      try { return JSON.parse(decodeURIComponent(node.dataset.evidenceGraph||'')).incident?.id||''; }
      catch { return ''; }
    })""")
    map_incidents = page.locator('.canonical-map > .tile-map').evaluate_all("nodes => nodes.map(node => node.dataset.mapSelectedIncident||'')")
    selected_rows = page.locator('.incident-list-row.is-selected').evaluate_all("nodes => nodes.map(node => (node.dataset.action||'').split(':').slice(1).join(':'))")
    persisted = page.evaluate("""() => { try { return JSON.parse(localStorage.getItem('vigia-mission-dark-state-v2')||'{}').selectedIncidentId||''; } catch { return ''; } }""")
    if route == "evidence":
        route_owned = evidence_incident == [identifier]
    else:
        route_owned = map_incidents == [identifier]
    gates = {
        "persistedSelection": persisted == identifier,
        "routeOwnedSelection": route_owned,
        "incidentsRowSelection": route != "incidents" or selected_rows == [identifier],
        "evidenceGraphSelection": route != "evidence" or evidence_incident == [identifier],
    }
    return {
        "route": route, "expected": identifier, "persisted": persisted,
        "mapIncidents": map_incidents, "evidenceIncidents": evidence_incident,
        "selectedRows": selected_rows, "gates": gates, "pass": all(gates.values()),
    }


def wait_for_selected_incident(page, identifier: str) -> None:
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        if page.locator('.canonical-map > .tile-map').first.get_attribute("data-map-selected-incident") == identifier:
            return
        page.wait_for_timeout(75)
    raise PlaywrightTimeout(f"selected incident did not settle on {identifier}")


def governed_map_reliability(page, active: dict[str, str], lane: str) -> dict[str, Any]:
    active.update(route="incidents", phase="map-reliability-baseline")
    navigate_through_ui(page, "incidents")
    map_node = page.locator('.canonical-map > .tile-map').first
    baseline = map_node.evaluate("node => ({state:node.dataset.mapState,lastGoodAt:node.dataset.mapLastGoodAt||'',lastSuccessAt:node.dataset.mapLastSuccessAt||'',loaded:Number(node.dataset.mapLoadedTileCount),failed:Number(node.dataset.mapFailedTileCount),total:Number(node.dataset.mapTotalTileCount),failureClass:node.dataset.mapFailureClass||''})")
    if baseline["state"] != "LIVE":
        gates = {"baselineLive": False, "lastGoodPresented": False, "failureTruthful": baseline["state"] in TERMINAL_MAP_STATES, "recoveredLive": False}
        return {"lane": lane, "baseline": baseline, "injectedRequests": [], "gates": gates, "pass": False, "blocker": "canonical_live_map_baseline_unavailable"}

    cache_state = {"entries": 0, "required": baseline["total"]}
    cache_deadline = time.monotonic() + 8
    while time.monotonic() < cache_deadline:
        cache_state = page.evaluate("""async required => {
          if(!('caches' in window))return {entries:0,required,available:false};
          const store=await caches.open('vigia-governed-basemap-last-good-v1'),keys=await store.keys();
          return {entries:keys.length,required,available:true};
        }""", baseline["total"])
        if cache_state["entries"] >= cache_state["required"]:
            break
        page.wait_for_timeout(100)
    page.evaluate("""async () => { const runtime=await import('/src/map.js?v=2.1.0'); runtime.clearMapMemoryForRecovery(); }""")
    injected: list[str] = []
    patterns = ["**/backend/api/v1/basemap/**", "**/backend/api/v10/events/thermal/overlay**"]

    def fail_map(request_route) -> None:
        injected.append(request_route.request.url.split("?", 1)[0])
        request_route.fulfill(status=503, content_type="application/json", body='{"error":"VIGIA_VQA_CONTROLLED_PROVIDER_FAILURE"}')

    for pattern in patterns:
        page.route(pattern, fail_map)
    try:
        active.update(route="evidence", phase="map-failure-injection")
        navigate_through_ui(page, "evidence")
        active.update(route="incidents", phase="map-failure-injection")
        navigate_through_ui(page, "incidents")
        degraded = map_node.evaluate("node => ({state:node.dataset.mapState,lastGoodAt:node.dataset.mapLastGoodAt||'',lastSuccessAt:node.dataset.mapLastSuccessAt||'',loaded:Number(node.dataset.mapLoadedTileCount),failed:Number(node.dataset.mapFailedTileCount),total:Number(node.dataset.mapTotalTileCount),failureClass:node.dataset.mapFailureClass||'',retryState:node.dataset.mapRetryState||'',statusText:node.querySelector('.tile-map__source span')?.textContent||''})")
    finally:
        for pattern in patterns:
            page.unroute(pattern, fail_map)

    active.update(route="incidents", phase="map-recovery")
    recovery = page.locator('.canonical-map [data-action="map-recover"]')
    recovery_visible = recovery.count() == 1 and recovery.is_visible()
    if recovery_visible:
        recovery.click()
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline and map_node.get_attribute("data-map-state") == "LOADING":
        page.wait_for_timeout(100)
    recovered = map_node.evaluate("node => ({state:node.dataset.mapState,lastGoodAt:node.dataset.mapLastGoodAt||'',lastSuccessAt:node.dataset.mapLastSuccessAt||'',loaded:Number(node.dataset.mapLoadedTileCount),failed:Number(node.dataset.mapFailedTileCount),total:Number(node.dataset.mapTotalTileCount),failureClass:node.dataset.mapFailureClass||'',retryState:node.dataset.mapRetryState||''})")
    gates = {
        "baselineLive": baseline["state"] == "LIVE" and baseline["loaded"] == baseline["total"] and baseline["failed"] == 0,
        "baselineLastGoodCached": cache_state.get("available") is True and cache_state["entries"] >= cache_state["required"],
        "controlledFailureExercised": len(injected) > 0,
        "lastGoodPresented": degraded["state"] == "STALE_LAST_GOOD" and bool(degraded["lastGoodAt"]) and "Last-good basemap" in degraded["statusText"],
        "failureTruthful": degraded["lastSuccessAt"] == "" and degraded["retryState"] == "RECOVERY_PENDING",
        "recoveryControl": recovery_visible,
        "recoveredLive": recovered["state"] == "LIVE" and recovered["loaded"] == recovered["total"] and recovered["failed"] == 0 and recovered["failureClass"] == "" and bool(recovered["lastSuccessAt"]),
    }
    return {"lane": lane, "baseline": baseline, "cache": cache_state, "degraded": degraded, "recovered": recovered, "injectedRequests": injected, "gates": gates, "pass": all(gates.values())}


def scene_playwright_acceptance(page, origin: str, active: dict[str, str], lane: str) -> dict[str, Any]:
    page.set_viewport_size(GOLDEN_VIEWPORT)
    active.update(route="incidents", phase="scene-a-b-c")
    page.goto(f"{origin}/#/incidents", wait_until="domcontentloaded", timeout=40_000)
    settled(page, "incidents")
    identifiers = page.locator('.incident-list-row[data-action^="focus-incident:"]').evaluate_all("nodes => [...new Set(nodes.map(node=>node.dataset.action.split(':').slice(1).join(':')).filter(Boolean))].slice(0,3)")
    if len(identifiers) != 3:
        return {"pass": False, "failure": "three_incidents_not_available", "identifiers": identifiers}
    page.evaluate(r"""identifiers => {
      const nativeFetch=window.fetch.bind(window),delays={[identifiers[0]]:650,[identifiers[1]]:380,[identifiers[2]]:25};
      window.__vigiaVqaNativeFetch=nativeFetch;window.__vigiaVqaRace=[];
      window.fetch=(input,init={})=>{
        const url=String(input instanceof Request?input.url:input),match=url.match(/\/operator\/incidents\/([^/?]+)/),id=match?decodeURIComponent(match[1]):'';
        if(!(id in delays))return nativeFetch(input,init);
        const signal=init.signal,delay=delays[id];window.__vigiaVqaRace.push({id,event:'delayed',delay,url:url.split('?')[0]});
        return new Promise((resolve,reject)=>{
          let done=false;const finish=(fn,value)=>{if(done)return;done=true;signal?.removeEventListener('abort',abort);fn(value)};
          const abort=()=>{clearTimeout(timer);window.__vigiaVqaRace.push({id,event:'aborted'});finish(reject,signal?.reason||new DOMException('aborted','AbortError'))};
          const timer=setTimeout(()=>{window.__vigiaVqaRace.push({id,event:'dispatched'});nativeFetch(input,init).then(value=>finish(resolve,value),error=>finish(reject,error));},delay);
          if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
        });
      };
    }""", identifiers)
    try:
        for identifier in identifiers:
            page.locator(f'[data-action="focus-incident:{identifier}"]').first.evaluate("node => node.click()")
            page.wait_for_timeout(20)
        final_identifier = identifiers[-1]
        wait_for_selected_incident(page, final_identifier)
        page.wait_for_timeout(900)
        abc_scene = scene_contract(page, "incidents", lane)
        race_log = page.evaluate("window.__vigiaVqaRace||[]")
        stable_after_delays = selection_contract(page, "incidents", final_identifier)
    finally:
        page.evaluate("""() => { if(window.__vigiaVqaNativeFetch){window.fetch=window.__vigiaVqaNativeFetch;delete window.__vigiaVqaNativeFetch;} }""")

    route_switches = []
    for route in ["command-overview", "incidents", "intelligence", "evidence", "operations", "incident-detail"]:
        active.update(route=route, phase="scene-route-switching-ui")
        navigate_through_ui(page, route)
        contract = scene_contract(page, route, lane)
        route_scene = contract.get("scene") or {}
        selection = selection_contract(page, route, final_identifier)
        route_switches.append({"route": route, "sceneId": route_scene.get("sceneId"), "sceneType": route_scene.get("sceneType"), "selectedIncidentId": route_scene.get("selectedIncidentId"), "scenePass": contract["pass"], "selection": selection, "pass": contract["pass"] and selection["pass"]})

    active.update(route="operations", phase="history-back")
    page.go_back(wait_until="domcontentloaded", timeout=40_000)
    settled(page, "operations")
    back_selection = selection_contract(page, "operations", final_identifier)
    active.update(route="incident-detail", phase="history-forward")
    page.go_forward(wait_until="domcontentloaded", timeout=40_000)
    settled(page, "incident-detail")
    forward_selection = selection_contract(page, "incident-detail", final_identifier)

    before_resize = route_switches[-1]
    page.set_viewport_size({"width": 430, "height": 932})
    settled(page, "incident-detail")
    after_resize = scene_contract(page, "incident-detail", lane)
    resize_selection = selection_contract(page, "incident-detail", final_identifier)
    page.set_viewport_size(GOLDEN_VIEWPORT)
    settled(page, "incident-detail")
    map_reliability = governed_map_reliability(page, active, lane)
    delayed_ids = {row.get("id") for row in race_log if row.get("event") == "delayed"}
    aborted_ids = {row.get("id") for row in race_log if row.get("event") == "aborted"}
    gates = {
        "selection": abc_scene["pass"] and stable_after_delays["pass"],
        "rapidABCExactFinalC": abc_scene.get("scene", {}).get("selectedIncidentId") == final_identifier and abc_scene.get("scene", {}).get("sceneId", "").endswith(final_identifier),
        "staleResponseCannotOverwrite": set(identifiers).issubset(delayed_ids) and set(identifiers[:2]).issubset(aborted_ids) and stable_after_delays["pass"],
        "routeSwitchingViaUI": len(route_switches) == 6 and all(row["pass"] for row in route_switches),
        "allSixRoutesRetainFinalC": all(row["selection"]["pass"] for row in route_switches),
        "evidenceGraphMatchesFinalC": next(row for row in route_switches if row["route"] == "evidence")["selection"]["evidenceIncidents"] == [final_identifier],
        "historyBackForward": back_selection["pass"] and forward_selection["pass"],
        "resize": after_resize["pass"] and resize_selection["pass"] and after_resize.get("scene", {}).get("sceneId") == before_resize.get("sceneId"),
        "truthfulLastGoodRecovery": map_reliability["pass"],
    }
    return {"identifiers": identifiers, "finalIdentifier": final_identifier, "raceLog": race_log, "abcScene": abc_scene, "stableAfterDelays": stable_after_delays, "routeSwitches": route_switches, "history": {"back": back_selection, "forward": forward_selection}, "afterResize": after_resize, "resizeSelection": resize_selection, "mapReliability": map_reliability, "gates": gates, "pass": all(gates.values())}


def route_capture(page, lane: str, origin: str, directory: str, route: str, reference_name: str, contract: dict[str, Any]) -> dict[str, Any]:
    route_dir = OUTPUT_ROOT / lane / directory
    route_dir.mkdir(parents=True, exist_ok=True)
    reference = route_dir / "reference.png"
    runtime = route_dir / "runtime.png"
    overlay = route_dir / "overlay-50.png"
    difference = route_dir / "difference.png"
    difference_mask = route_dir / "difference-mask.png"
    pixelmatch_mask = route_dir / "pixelmatch-mask.png"
    canonical_mask = route_dir / "canonical-mask.png"
    canonical_mask_manifest = route_dir / "canonical-mask.json"
    shutil.copyfile(REFERENCE_ROOT / reference_name, reference)
    page.set_viewport_size(GOLDEN_VIEWPORT)
    if lane == "golden":
        seed_golden_route_incident(page, route)
        # The SPA owns an in-memory copy of persisted selection. Reload after
        # seeding so the deterministic route captures the incident declared by
        # the locked raster instead of whichever route happened to run first.
        if route in GOLDEN_ROUTE_INCIDENTS:
            page.reload(wait_until="domcontentloaded", timeout=40_000)
            settled(page, page.locator("body").get_attribute("data-vigia-route") or "command-overview")
    page.goto(f"{origin}/#/{route}", wait_until="domcontentloaded", timeout=40_000)
    settled(page, route)
    stable = stable_screenshot(page, runtime)
    mask_report = canonical_mask_report(page, lane, canonical_mask)
    atomic_json(canonical_mask_manifest, mask_report)
    regions = collect_regions(page, route)
    geometry = geometry_report(route, regions, contract)
    styles = style_report(route, regions, contract)
    atomic_json(route_dir / "geometry-report.json", geometry)
    atomic_json(route_dir / "style-report.json", styles)
    compare = subprocess.run(["node", str(COMPARE_SCRIPT), str(reference), str(runtime), str(difference), str(difference_mask), str(pixelmatch_mask), str(overlay), str(canonical_mask_manifest)], check=True, capture_output=True, text=True)
    comparison = json.loads(compare.stdout)
    photometric_register = photometric_registration(reference, runtime)
    register = structural_registration(geometry, comparison["dimensions"])
    classification = classify_diff(difference_mask, regions)
    target_by_region = contract["routes"][route]["regions"]
    for row in classification["regions"]:
        row["targetBounds"] = target_by_region.get(row["region"], {}).get("target")
        style_row = next((item for item in styles["regions"] if item["region"] == row["region"]), None)
        row["computedStyleDifferences"] = style_row["differences"] if style_row else []
    state = dom_metrics(page)
    scene = scene_contract(page, route, lane)
    map_states = page.locator("[data-map-state]").evaluate_all("nodes => nodes.map(node => ({state:node.dataset.mapState,loaded:Number(node.dataset.mapLoadedTileCount),failed:Number(node.dataset.mapFailedTileCount),total:Number(node.dataset.mapTotalTileCount),failureClass:node.dataset.mapFailureClass||'',retryState:node.dataset.mapRetryState||'',provider:node.dataset.mapProvider,lastGoodAt:node.dataset.mapLastGoodAt,goldenCartographyState:node.dataset.vqaGoldenCartographyState||'',goldenMapSourceCountBefore:node.dataset.vqaGoldenMapSourceCountBefore==null?null:Number(node.dataset.vqaGoldenMapSourceCountBefore),goldenMapSourceCountAfter:node.dataset.vqaGoldenMapSourceCountAfter==null?null:Number(node.dataset.vqaGoldenMapSourceCountAfter),goldenMapSourceCountInvariant:node.dataset.vqaGoldenMapSourceCountInvariant||''}))")
    golden_cartography_nodes = page.locator('[data-vqa-golden-cartography="donor-basemap"]').count()
    golden_cartography_installer = page.locator("html").get_attribute("data-vqa-golden-cartography-installer")
    odiff_ratio = float(comparison["odiff"].get("diffPercentage", 0)) / 100
    changed_ratio = comparison["pixelmatch"]["changedPixelRatio"]
    metrics = {
        "schemaVersion": "vigia.deterministic-pixel-route-metrics.v1", "lane": lane, "route": route,
        "targetDimensions": {"width": 1672, "height": 941}, "runtimeDimensions": comparison["dimensions"],
        "referenceSha256": sha256(reference), "runtimeSha256": sha256(runtime), "stableCapture": stable,
        "comparison": comparison, "registration": register, "photometricRegistration": photometric_register, "diffClassification": classification, "canonicalMask": mask_report,
        "geometry": {"pass": geometry["pass"], "failures": geometry["failures"]}, "style": {"pass": styles["pass"], "failures": styles["failures"]},
        "document": state, "mapStates": map_states, "sceneContract": scene,
        "goldenCartography": {"nodes": golden_cartography_nodes, "installerState": golden_cartography_installer},
        "gates": {
            "referenceHash": sha256(reference) == EXPECTED_HASHES[reference_name],
            "dimensions": comparison["dimensions"] == GOLDEN_VIEWPORT,
            "stableCapture": stable["stable"],
            "documentWidth": state["document"]["scrollWidth"] == 1672,
            "documentHeight": state["document"]["scrollHeight"] <= 941,
            "mainViewportFit": state["main"]["scrollHeight"] <= state["main"]["clientHeight"] + 1,
            "horizontalOverflow": state["horizontalOverflowPx"] == 0 and state["mainHorizontalOverflowPx"] == 0 and len(state["nestedHorizontalOverflow"]) == 0,
            "nestedVerticalClipping": len(state["nestedVerticalClipping"]) == 0,
            "operatorTypography": len(state["typography"]["violations"]) == 0,
            "accessibleControlNames": len(state["unnamedControls"]) == 0,
            "labelsNotClipped": len(state["clippedLabels"]) == 0,
            "sceneContract": scene["pass"],
            "majorBoxDelta": geometry["pass"], "computedStyles": styles["pass"],
            "registration": register["pass"], "unclassifiedDiff": classification["unclassifiedPixels"] == 0,
            "goldenCartographyIsolation": (
                golden_cartography_nodes == 0 and golden_cartography_installer is None
                if lane == "canonical"
                else (
                    golden_cartography_installer == "AUTHORIZED"
                    and golden_cartography_nodes == len(map_states)
                    and all(
                        row.get("goldenCartographyState") == "READY"
                        and row.get("goldenMapSourceCountInvariant") == "true"
                        and row.get("goldenMapSourceCountBefore") == row.get("goldenMapSourceCountAfter") == row.get("total")
                        for row in map_states
                    )
                )
            ),
            "goldenStaticPixelDifferenceOdiff": odiff_ratio <= 0.005 if lane == "golden" else True,
            "goldenStaticPixelDifferencePixelmatch": changed_ratio <= 0.005 if lane == "golden" else True,
        },
        "artifacts": {"reference": str(reference.relative_to(OUTPUT_ROOT)), "runtime": str(runtime.relative_to(OUTPUT_ROOT)), "overlay50": str(overlay.relative_to(OUTPUT_ROOT)), "difference": str(difference.relative_to(OUTPUT_ROOT)), "metrics": str((route_dir / 'metrics.json').relative_to(OUTPUT_ROOT)), "differenceMask": str(difference_mask.relative_to(OUTPUT_ROOT)), "pixelmatchMask": str(pixelmatch_mask.relative_to(OUTPUT_ROOT)), "canonicalMask": str(canonical_mask.relative_to(OUTPUT_ROOT)), "canonicalMaskManifest": str(canonical_mask_manifest.relative_to(OUTPUT_ROOT)), "geometryReport": str((route_dir / 'geometry-report.json').relative_to(OUTPUT_ROOT)), "styleReport": str((route_dir / 'style-report.json').relative_to(OUTPUT_ROOT))},
    }
    metrics["pass"] = all(metrics["gates"].values())
    atomic_json(route_dir / "metrics.json", metrics)
    return metrics


def responsive_navigation_contract(page, route: str, width: int) -> dict[str, Any]:
    mobile = width <= 1050
    sidebar = page.locator("#primary-navigation")
    menu = page.locator('[data-action="toggle-nav"]').first
    initial = {
        "sidebarVisible": sidebar.is_visible(),
        "ariaHidden": sidebar.get_attribute("aria-hidden"),
        "inert": sidebar.evaluate("node => node.hasAttribute('inert')"),
        "menuVisible": menu.is_visible(),
    }
    if not mobile:
        gates = {
            "desktopSidebarVisible": initial["sidebarVisible"] and initial["ariaHidden"] == "false" and not initial["inert"],
            "currentRoute": page.locator(f'#primary-navigation [data-route="{route}"][aria-current="page"]').count() == 1,
        }
        return {"mode": "desktop", "initial": initial, "gates": gates, "pass": all(gates.values())}

    opened = closed = {}
    if initial["menuVisible"]:
        menu.click()
        page.wait_for_timeout(80)
        opened = {
            "bodyOpen": page.locator("body.nav-open").count() == 1,
            "ariaHidden": sidebar.get_attribute("aria-hidden"),
            "inert": sidebar.evaluate("node => node.hasAttribute('inert')"),
            "expanded": menu.get_attribute("aria-expanded"),
            "currentRoute": page.locator(f'#primary-navigation [data-route="{route}"][aria-current="page"]').count() == 1,
        }
        page.keyboard.press("Escape")
        page.wait_for_timeout(80)
        closed = {
            "bodyOpen": page.locator("body.nav-open").count() == 1,
            "ariaHidden": sidebar.get_attribute("aria-hidden"),
            "inert": sidebar.evaluate("node => node.hasAttribute('inert')"),
            "expanded": menu.get_attribute("aria-expanded"),
            "focusReturned": menu.evaluate("node => document.activeElement===node"),
        }
    gates = {
        "mobileDrawerInitiallyClosed": initial["ariaHidden"] == "true" and initial["inert"],
        "mobileMenuAvailable": initial["menuVisible"],
        "mobileDrawerOpens": opened.get("bodyOpen") is True and opened.get("ariaHidden") == "false" and opened.get("inert") is False and opened.get("expanded") == "true" and opened.get("currentRoute") is True,
        "mobileDrawerEscapeCloses": closed.get("bodyOpen") is False and closed.get("ariaHidden") == "true" and closed.get("inert") is True and closed.get("expanded") == "false" and closed.get("focusReturned") is True,
    }
    return {"mode": "drawer", "initial": initial, "opened": opened, "closed": closed, "gates": gates, "pass": all(gates.values())}


def responsive_matrix(page, origin: str, active: dict[str, str], lane: str, selected_identifier: str, routes: list[tuple[str, str, str]] = ROUTES) -> list[dict[str, Any]]:
    rows = []
    for width, height in RESPONSIVE_VIEWPORTS:
        page.set_viewport_size({"width": width, "height": height})
        viewport_dir = OUTPUT_ROOT / lane / "responsive" / f"{width}x{height}"
        viewport_dir.mkdir(parents=True, exist_ok=True)
        for _directory, route, _reference in routes:
            active.update(route=route, phase=f"responsive-{width}x{height}")
            page.goto(f"{origin}/#/{route}", wait_until="domcontentloaded", timeout=40_000)
            settled(page, route)
            navigation = responsive_navigation_contract(page, route, width)
            settled(page, route)
            selection = selection_contract(page, route, selected_identifier)
            route_scene = scene_contract(page, route, lane)
            measured = dom_metrics(page)
            screenshot_path = viewport_dir / f"{route}.png"
            screenshot = stable_screenshot(page, screenshot_path)
            map_boxes = page.locator('.canonical-map > .tile-map').evaluate_all("nodes => nodes.map(node => {const box=node.getBoundingClientRect();return {width:box.width,height:box.height,state:node.dataset.mapState||''}})")
            gates = {
                "horizontalOverflow": measured["document"]["scrollWidth"] <= measured["document"]["clientWidth"] + 1 and measured["mainHorizontalOverflowPx"] <= 1 and len(measured["nestedHorizontalOverflow"]) == 0,
                "nestedVerticalClipping": len(measured["nestedVerticalClipping"]) == 0,
                "primaryHorizontalTableScrollbars": len(measured["primaryHorizontalTableScrollbars"]) == 0,
                "overlaps": len(measured["overlaps"]) == 0,
                "clippedLabels": len(measured["clippedLabels"]) == 0,
                "unnamedControls": len(measured["unnamedControls"]) == 0,
                "operatorTypography": len(measured["typography"]["violations"]) == 0,
                "navigation": navigation["pass"],
                "selectionPersists": selection["pass"],
                "sceneIdentity": route_scene["pass"],
                "mapRemainsUseful": all(box["width"] >= 280 and box["height"] >= 220 for box in map_boxes),
                "stableScreenshot": screenshot["stable"] and screenshot_path.is_file() and screenshot_path.stat().st_size > 0,
            }
            rows.append({"lane": lane, "route": route, "viewport": {"width": width, "height": height}, **measured, "navigation": navigation, "selection": selection, "sceneContract": route_scene, "mapBoxes": map_boxes, "screenshot": {**screenshot, "path": str(screenshot_path.relative_to(OUTPUT_ROOT))}, "gates": gates, "pass": all(gates.values())})
    return rows


def production_exclusion_report() -> dict[str, Any]:
    roots = [
        ROOT / "apps" / "operator-console" / "src",
        ROOT / "apps" / "operator-console" / "styles",
        ROOT / "apps" / "operator-console" / "dist",
    ]
    files = [ROOT / "apps" / "operator-console" / "index.html", ROOT / "apps" / "operator-console" / "server.mjs"]
    for root in roots:
        if root.exists():
            files.extend(path for path in root.rglob("*") if path.is_file() and not path.is_symlink())
    needles = [
        b"VIGIA_TEST_ONLY_GOLDEN_VISUAL_LANE_DO_NOT_SHIP",
        b"TEST_ONLY_GOLDEN_VISUAL",
        b"/__vqa/reference/",
        *(value.encode("ascii") for value in EXPECTED_HASHES.values()),
    ]
    findings = []
    scanned = 0
    for path in sorted(set(files)):
        payload = path.read_bytes()
        scanned += 1
        for needle in needles:
            if needle in payload:
                findings.append({"path": str(path.relative_to(ROOT)), "needle": needle.decode("ascii")})
    dist = ROOT / "apps" / "operator-console" / "dist"
    build_manifest_path = dist / "build-manifest.json"
    build_manifest = json.loads(build_manifest_path.read_text(encoding="utf-8")) if build_manifest_path.is_file() and not build_manifest_path.is_symlink() else {}
    asset_entries, invalid_assets = [], []
    if dist.exists():
        for path in sorted(dist.rglob("*")):
            if path == build_manifest_path:
                continue
            if path.is_symlink() or (path.exists() and not path.is_file()):
                if path.is_symlink():
                    invalid_assets.append(str(path.relative_to(ROOT)))
                continue
            if path.is_file():
                asset_entries.append({"path": str(path.relative_to(dist)).replace(os.sep, "/"), "sha256": f"sha256:{sha256(path)}", "bytes": path.stat().st_size})
    digest_body = "\n".join(f"{row['path']}\0{row['sha256']}" for row in asset_entries).encode()
    actual_asset_digest = f"sha256:{hashlib.sha256(digest_body).hexdigest()}"
    expected_asset_digest = build_manifest.get("assetDigest")
    binary_digest = {
        "pass": bool(asset_entries) and not invalid_assets and expected_asset_digest == actual_asset_digest,
        "manifest": str(build_manifest_path.relative_to(ROOT)),
        "manifestSha256": sha256(build_manifest_path) if build_manifest_path.is_file() else None,
        "expectedAssetDigest": expected_asset_digest,
        "actualAssetDigest": actual_asset_digest,
        "assetCount": len(asset_entries),
        "assetBytes": sum(row["bytes"] for row in asset_entries),
        "invalidAssets": invalid_assets,
    }
    dockerfile = ROOT / "infra" / "Dockerfile.api"
    dockerignore = ROOT / "infra" / "Dockerfile.api.dockerignore"
    dockerfile_text = dockerfile.read_text(encoding="utf-8") if dockerfile.is_file() else ""
    ignore_lines = [line.strip() for line in dockerignore.read_text(encoding="utf-8").splitlines()] if dockerignore.is_file() else []
    exclusion_index = next((index for index, line in enumerate(ignore_lines) if line.rstrip("/") == "scripts/visual-qa"), None)
    later_visual_qa_negations = [] if exclusion_index is None else [line for line in ignore_lines[exclusion_index + 1:] if line.startswith("!") and "scripts/visual-qa" in line]
    packaging = {
        "pass": dockerfile.is_file() and dockerignore.is_file() and "COPY scripts ./scripts" in dockerfile_text and exclusion_index is not None and not later_visual_qa_negations,
        "dockerfile": str(dockerfile.relative_to(ROOT)),
        "dockerfileSha256": sha256(dockerfile) if dockerfile.is_file() else None,
        "dockerignore": str(dockerignore.relative_to(ROOT)),
        "dockerignoreSha256": sha256(dockerignore) if dockerignore.is_file() else None,
        "copiesScriptsTree": "COPY scripts ./scripts" in dockerfile_text,
        "visualQaExclusionRule": ignore_lines[exclusion_index] if exclusion_index is not None else None,
        "laterVisualQaNegations": later_visual_qa_negations,
        "excludedPayloadDigests": {
            (str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)): sha256(path)
            for path in (FIXTURE_PATH, ROOT / "scripts" / "visual-qa" / "capture.py", ROOT / "scripts" / "visual-qa" / "compare.mjs")
            if path.is_file()
        },
    }
    sentinel_scan = {"pass": len(findings) == 0, "scannedFiles": scanned, "findings": findings}
    return {"pass": sentinel_scan["pass"] and binary_digest["pass"] and packaging["pass"], "sentinelScan": sentinel_scan, "binaryDigest": binary_digest, "packagingProof": packaging}


def map_capture_is_fully_live(states: list[dict[str, Any]]) -> bool:
    return bool(states) and all(
        row.get("state") == "LIVE"
        and row.get("loaded") == row.get("total")
        and row.get("failed") == 0
        and row.get("failureClass") == ""
        and row.get("retryState") == "IDLE"
        for row in states
    )


def map_capture_is_settled(states: list[dict[str, Any]]) -> bool:
    terminal_states = {"LIVE", "DEGRADED_PARTIAL", "STALE_LAST_GOOD", "STRUCTURED_FALLBACK", "UNAVAILABLE"}
    return bool(states) and all(row.get("state") in terminal_states for row in states)


def golden_pre_capture_baseline(page) -> dict[str, Any]:
    results = page.evaluate("""async () => {
      const read=async url=>{const response=await fetch(url,{cache:'no-store',credentials:'same-origin'});let body=null;try{body=await response.json()}catch{}return{url,status:response.status,ok:response.ok,body}};
      const [health,session,command]=await Promise.all([read('/backend/__health'),read('/backend/api/v10/session'),read('/backend/api/v10/operator/command-overview')]);
      return {health,session,command};
    }""")
    command_projection = results["command"].get("body", {}).get("data", {}).get("commandPresentation", {})
    gates = {
        "healthReady": results["health"]["status"] == 200 and results["health"].get("body", {}).get("state") == "READY",
        "sessionAuthenticated": results["session"]["status"] == 200 and results["session"].get("body", {}).get("authenticated") is True,
        "commandProjectionReady": results["command"]["status"] == 200 and command_projection.get("state") == "READY" and isinstance(command_projection.get("value"), dict),
    }
    return {"responses": results, "gates": gates, "pass": all(gates.values())}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--lane", choices=("golden", "canonical"), default=os.environ.get("VIGIA_VQA_LANE", "golden"))
    arguments = parser.parse_args()
    lane = arguments.lane
    focused_route = os.environ.get("VIGIA_VQA_ROUTE", "").strip()
    if focused_route and focused_route not in REQUIRED_VQA:
        raise RuntimeError(f"visual_qa_route_invalid:{focused_route}")
    selected_routes = [item for item in ROUTES if not focused_route or item[1] == focused_route]
    operator_port = int(os.environ.get("VIGIA_VQA_OPERATOR_PORT", "4190"))
    proxy_port = int(os.environ.get("VIGIA_VQA_PROXY_PORT", str(operator_port)))
    upstream_host = os.environ.get("VIGIA_VQA_UPSTREAM_HOST", "host.docker.internal")
    source_serve = os.environ.get("VIGIA_VQA_SOURCE_SERVE", "0") == "1"
    if source_serve and lane != "golden":
        raise RuntimeError("visual_qa_source_serving_is_golden_only")
    expected_release = os.environ.get("VIGIA_VQA_RELEASE_ID", "")
    if cv2 is not None:
        cv2.setNumThreads(1)
        cv2.ocl.setUseOpenCL(False)
        cv2.setRNGSeed(0x56494749)
    verified = verify_references()
    reuse_contract = os.environ.get("VIGIA_VQA_REUSE_CONTRACT", "0") == "1"
    if reuse_contract:
        if not CONTRACT_PATH.is_file():
            raise RuntimeError("visual_qa_reused_contract_missing")
    else:
        subprocess.run([sys.executable, str(EXTRACT_SCRIPT)], check=True, env={**os.environ, "VIGIA_VQA_CONTRACT": str(CONTRACT_PATH)})
    contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    contract_routes = contract.get("routes", {})
    if contract.get("schemaVersion") != "vigia.frontend-visual-contract.v1" or any(
        contract_routes.get(route, {}).get("sha256") != EXPECTED_HASHES[reference]
        or contract_routes.get(route, {}).get("width") != GOLDEN_VIEWPORT["width"]
        or contract_routes.get(route, {}).get("height") != GOLDEN_VIEWPORT["height"]
        for _directory, route, reference in ROUTES
    ):
        raise RuntimeError("visual_qa_contract_not_bound_to_locked_references")
    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    if fixture.get("sentinel") != "VIGIA_TEST_ONLY_GOLDEN_VISUAL_LANE_DO_NOT_SHIP":
        raise RuntimeError("golden_fixture_sentinel_invalid")
    source_root = ROOT / "apps" / "operator-console" if source_serve else None
    server, thread = start_proxy(
        lane, proxy_port, upstream_host, operator_port, fixture,
        source_root=source_root, release_id=expected_release,
    )
    wait_proxy(proxy_port)
    origin = f"http://127.0.0.1:{proxy_port}"
    console_errors, page_errors, request_failures, http_error_responses = [], [], [], []
    request_contexts: dict[int, dict[str, Any]] = {}
    active = {"route": "command-overview", "phase": "admission"}
    summary: dict[str, Any] = {
        "schemaVersion": "vigia.deterministic-pixel-qa.v1", "lane": lane, "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "origin": origin,
        "expectedReleaseId": expected_release, "references": verified, "routes": {},
        "environment": {"viewport": GOLDEN_VIEWPORT, "responsiveViewports": [{"width": width, "height": height} for width, height in RESPONSIVE_VIEWPORTS], "deviceScaleFactor": 1, "scale": "css", "locale": "en-US", "timezone": "America/Los_Angeles", "colorScheme": "light", "reducedMotion": "reduce", "frozenEpochMs": FROZEN_EPOCH_MS, "randomSeed": "0x56494749", "opencv": cv2.__version__ if cv2 is not None else None, "sourceServing": source_serve},
    }
    browser = context = None
    browser_owned = True
    try:
        with sync_playwright() as playwright:
            cdp_url = os.environ.get("VIGIA_VQA_CDP_URL", "").strip()
            browser_executable = os.environ.get("VIGIA_VQA_BROWSER_EXECUTABLE", "").strip()
            if cdp_url:
                browser = playwright.chromium.connect_over_cdp(cdp_url)
                browser_owned = False
            else:
                browser = playwright.chromium.launch(headless=True, executable_path=browser_executable or None)
            context = browser.new_context(viewport=GOLDEN_VIEWPORT, device_scale_factor=1, locale="en-US", timezone_id="America/Los_Angeles", color_scheme="light", reduced_motion="reduce", service_workers="block")
            context.add_init_script(DETERMINISTIC_INIT)
            if lane == "golden":
                context.add_init_script(GOLDEN_CARTOGRAPHY_INIT)
                context.add_init_script(OVERLAY_INIT)
            page = context.new_page()
            def record_console_error(message) -> None:
                if message.type != "error":
                    return
                console_errors.append({"type": message.type, "text": message.text, "location": message.location})
            page.on("console", record_console_error)
            def record_page_error(error) -> None:
                page_errors.append({
                    "message": str(error),
                    "name": getattr(error, "name", type(error).__name__),
                    "stack": getattr(error, "stack", None),
                    "url": page.url,
                    "route": active["route"],
                    "phase": active["phase"],
                })
            page.on("pageerror", record_page_error)
            def request_time_context(request) -> dict[str, Any]:
                try:
                    frame_url = request.frame.url
                except PlaywrightError:
                    frame_url = page.url
                fragment = urllib.parse.urlsplit(frame_url).fragment.removeprefix("/").split("?", 1)[0]
                return {
                    "pageUrlAtRequest": frame_url,
                    "route": fragment if fragment in REQUIRED_VQA else active["route"],
                    "phase": active["phase"],
                    "method": request.method,
                    "resourceType": request.resource_type,
                }
            def record_request_started(request) -> None:
                request_contexts[id(request)] = request_time_context(request)
            page.on("request", record_request_started)
            def record_request_failure(request) -> None:
                captured = request_contexts.pop(id(request), None)
                request_failures.append({
                    "url": request.url.split("?", 1)[0],
                    "error": request.failure or "unknown",
                    **(captured or {"pageUrlAtRequest": None, "route": None, "phase": None, "method": request.method, "resourceType": request.resource_type}),
                    "requestTimeContextRecorded": captured is not None,
                })
            page.on("requestfailed", record_request_failure)
            def record_response(response) -> None:
                # A response can be observed before Chromium later reports that
                # reading the response body was aborted. Retain the request-time
                # route/phase context until the request reaches a terminal event.
                captured = request_contexts.get(id(response.request))
                if response.status >= 400:
                    http_error_responses.append({
                        "url": response.url.split("?", 1)[0], "status": response.status, "statusText": response.status_text,
                        **(captured or {"pageUrlAtRequest": None, "route": None, "phase": None, "method": response.request.method, "resourceType": response.request.resource_type}),
                        "requestTimeContextRecorded": captured is not None,
                    })
            page.on("response", record_response)
            def record_request_finished(request) -> None:
                request_contexts.pop(id(request), None)
            page.on("requestfinished", record_request_finished)
            admission = "VIGIA_TEST_ONLY_GOLDEN_SOURCE" if source_serve else one_time_admission(read_secret())
            page.goto(f"{origin}/?admission={urllib.parse.quote(admission)}", wait_until="domcontentloaded", timeout=40_000)
            page.wait_for_url(f"{origin}/#/command-overview", timeout=20_000)
            settled(page, "command-overview")
            identity = page.evaluate("fetch('/__operator/ready',{cache:'no-store'}).then(r=>r.json())")
            if identity.get("releaseId") != expected_release:
                raise RuntimeError(f"visual_qa_release_identity_mismatch:{identity.get('releaseId')}:{expected_release}")
            summary["releaseIdentity"] = identity
            summary["browser"] = {"playwright": "1.54.0", "browserType": browser.browser_type.name, "version": browser.version, "transport": "CDP" if cdp_url else "LOCAL_PROCESS"}
            if lane == "golden":
                baseline = golden_pre_capture_baseline(page)
                summary["preCaptureBaseline"] = baseline
                if not baseline["pass"]:
                    raise RuntimeError(f"visual_qa_golden_baseline_not_ready:{baseline['gates']}")
            for directory, route, reference in selected_routes:
                active.update(route=route, phase="golden-capture" if lane == "golden" else "canonical-capture")
                summary["routes"][route] = route_capture(page, lane, origin, directory, route, reference, contract)
            if not focused_route:
                summary["sceneIndependence"] = scene_independence(summary["routes"])
                summary["scenePlaywrightAcceptance"] = scene_playwright_acceptance(page, origin, active, lane)
                final_identifier = summary["scenePlaywrightAcceptance"].get("finalIdentifier", "")
                matrix = responsive_matrix(page, origin, active, lane, final_identifier, selected_routes) if final_identifier else []
                atomic_json(OUTPUT_ROOT / lane / "responsive-overflow-matrix.json", matrix)
                summary["responsiveOverflowMatrix"] = matrix
            final_map_states = {route: result["mapStates"] for route, result in summary["routes"].items()}
            expected_cancellations, unexpected_failures = [], []
            for failure in request_failures:
                is_map_request = "/backend/api/v1/basemap/" in failure["url"] or "/backend/api/v10/events/thermal/overlay" in failure["url"]
                is_intentional_selection_cancellation = (
                    failure.get("phase") == "scene-a-b-c"
                    and failure.get("route") == "incidents"
                    and "/backend/api/v10/operator/incidents/" in failure["url"]
                    and failure.get("method") == "GET"
                    and failure.get("resourceType") == "fetch"
                    and "ERR_ABORTED" in str(failure["error"])
                )
                if is_intentional_selection_cancellation or (is_map_request and "ERR_ABORTED" in str(failure["error"]) and map_capture_is_settled(final_map_states.get(failure["route"], []))):
                    expected_cancellations.append(failure)
                else:
                    unexpected_failures.append(failure)
            expected_map_http_failures, recovered_map_http_failures, unexpected_http_failures = [], [], []
            for failure in http_error_responses:
                is_map_request = "/backend/api/v1/basemap/" in failure["url"] or "/backend/api/v10/events/thermal/overlay" in failure["url"]
                states = final_map_states.get(failure.get("route"), [])
                is_governed_map_503 = (
                    is_map_request
                    and failure.get("status") == 503
                    and failure.get("requestTimeContextRecorded") is True
                    and failure.get("method") == "GET"
                    and failure.get("resourceType") == "fetch"
                    and map_capture_is_settled(states)
                )
                if is_governed_map_503 and not map_capture_is_fully_live(states):
                    expected_map_http_failures.append(failure)
                elif is_governed_map_503 and map_capture_is_fully_live(states):
                    # A governed provider can fail transiently and then recover
                    # before the stable capture. Preserve that evidence without
                    # treating successful map recovery as an unexpected failure.
                    recovered_map_http_failures.append(failure)
                else:
                    unexpected_http_failures.append(failure)
            expected_map_console_errors, unexpected_console_errors = [], []
            expected_map_http_urls = {
                failure["url"]
                for failure in (*expected_map_http_failures, *recovered_map_http_failures)
            }
            generic_503 = "Failed to load resource: the server responded with a status of 503 (Service Unavailable)"
            all_console_errors_are_exact_map_503s = (
                len(console_errors) == len(expected_map_http_failures) + len(recovered_map_http_failures)
                and len(console_errors) > 0
                and all(error.get("text") == generic_503 for error in console_errors)
                and all(
                    failure.get("status") == 503
                    for failure in (*expected_map_http_failures, *recovered_map_http_failures)
                )
            )
            for error in console_errors:
                location_url = str(error.get("location", {}).get("url", "")).split("?", 1)[0]
                if error.get("text") == generic_503 and (location_url in expected_map_http_urls or all_console_errors_are_exact_map_503s):
                    expected_map_console_errors.append(error)
                else:
                    unexpected_console_errors.append(error)
            golden_proxy = None
            if lane == "golden":
                golden_proxy = page.evaluate("fetch('/backend/__health',{cache:'no-store'}).then(r=>r.json())")
            production_exclusion = production_exclusion_report()
            summary["goldenProxyAuthority"] = golden_proxy
            summary["productionExclusion"] = production_exclusion
            summary["consoleErrors"] = console_errors
            summary["expectedMapConsoleErrors"] = expected_map_console_errors
            summary["unexpectedConsoleErrors"] = unexpected_console_errors
            summary["pageErrors"] = page_errors
            summary["unexpectedNetworkFailures"] = unexpected_failures
            summary["expectedMapRequestCancellations"] = expected_cancellations
            summary["httpErrorResponses"] = http_error_responses
            summary["unexpectedHttpErrorResponses"] = unexpected_http_failures
            summary["expectedMapHttpErrorResponses"] = expected_map_http_failures
            summary["recoveredMapHttpErrorResponses"] = recovered_map_http_failures
            summary["gates"] = {
                "routes": all(item["pass"] for item in summary["routes"].values()),
                "responsive": bool(focused_route) or (
                    len(summary.get("responsiveOverflowMatrix", [])) == len(RESPONSIVE_VIEWPORTS) * len(ROUTES)
                    and all(item["pass"] for item in summary.get("responsiveOverflowMatrix", []))
                    and all(item.get("screenshot", {}).get("path") for item in summary.get("responsiveOverflowMatrix", []))
                ),
                "sceneIndependence": bool(focused_route) or summary.get("sceneIndependence", {}).get("pass") is True,
                "scenePlaywrightAcceptance": bool(focused_route) or summary.get("scenePlaywrightAcceptance", {}).get("pass") is True,
                "consoleErrors": len(unexpected_console_errors) == 0,
                "pageErrors": len(page_errors) == 0,
                "unexpectedNetworkFailures": len(unexpected_failures) == 0,
                "unexpectedHttpErrorResponses": len(unexpected_http_failures) == 0,
                "releaseIdentity": identity.get("releaseId") == expected_release,
                "canonicalIdentityExcludesGoldenAuthority": lane != "canonical" or identity.get("projectionAuthority") != "TEST_ONLY_GOLDEN_VISUAL",
                "goldenProxyAuthority": lane != "golden" or golden_proxy == {"ok": True, "state": "READY", "authority": "TEST_ONLY_GOLDEN_VISUAL"},
                "productionExcludesGoldenFixture": production_exclusion["pass"],
            }
            summary["pass"] = all(summary["gates"].values())
    except (PlaywrightError, PlaywrightTimeout, RuntimeError) as error:
        summary["fatal"] = {"type": type(error).__name__, "message": str(error)}
        summary["pass"] = False
    finally:
        if context:
            try:
                context.close()
            except PlaywrightError:
                pass
        if browser and browser_owned:
            try:
                browser.close()
            except PlaywrightError:
                pass
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
    required_route_files = ("reference.png", "runtime.png", "overlay-50.png", "difference.png", "metrics.json", "geometry-report.json", "style-report.json")
    summary["requiredArtifactsFresh"] = len(summary.get("routes", {})) == len(selected_routes) and all(
        all((OUTPUT_ROOT / lane / directory / filename).is_file() for filename in required_route_files)
        for directory, _route, _reference in selected_routes
    )
    summary["responsiveArtifactsFresh"] = None if focused_route else len(summary.get("responsiveOverflowMatrix", [])) == len(RESPONSIVE_VIEWPORTS) * len(ROUTES)
    atomic_json(OUTPUT_ROOT / lane / "visual-qa-summary.json", summary)
    print(json.dumps({"lane": lane, "state": "PASSED" if summary.get("pass") else "FAILED", "releaseId": expected_release, "output": str(OUTPUT_ROOT / lane), "gates": summary.get("gates"), "fatal": summary.get("fatal")}, indent=2, sort_keys=True))
    return 0 if summary.get("pass") else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"VIGIA_VISUAL_QA_FATAL: {type(error).__name__}: {error}", file=sys.stderr)
        raise SystemExit(2)
