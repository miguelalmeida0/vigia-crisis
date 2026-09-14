#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
from itertools import product
from pathlib import Path

import cv2
import numpy as np

ROOT = Path("/workspace")
REFERENCE_ROOT = ROOT / "DESIGN_SOURCE_OF_TRUTH"
CONTRACT_PATH = Path(os.environ.get("VIGIA_VQA_CONTRACT", "/contract/vigia-visual-contract.json"))

# Typography values are declared here as measured/identified properties of the
# immutable locked rasters. No legacy handoff is consulted by the extractor.
LOCKED_RASTER_TOKENS = {
    "color": {"text": "#171715"},
    "typography": {
        "ui": 'Roboto, Inter, "Helvetica Neue", Arial, sans-serif',
        "bodyPx": 12,
    },
}

REFERENCES = {
    "command-overview": ("01-command-overview.png", "f8d3bfc501ece4dcf3c80f11ca37f0adc983cbcac021d6d8e8edec44be251eea"),
    "incidents": ("02-incidents.png", "bc379fddc4913017175861c730971a62063c4eae5099f01eaa84a6bec551f146"),
    "intelligence": ("03-intelligence.png", "7c9f87b5df775559d07633e4c54a3b8805f50d38b9a9c981ee18fb14be9449c1"),
    "evidence": ("04-evidence.png", "5e4c3dab18e48057cf2f8289503051913785261ac22fdc8b845299cbe6c33983"),
    "operations": ("05-operations.png", "db06284acb27d2168e2d3035ccb317693d4a8cd6a88ec629da50c794926b0b4d"),
    "incident-detail": ("06-incident-detail.png", "ce9942412a5efeef8a72702f2e25638b860c6e18f825c078fc4afe321afb2c12"),
}

# Search windows are a declared route-topology profile, not final measurements.
# Every emitted edge is selected from the locked raster by the OpenCV scorer below.
SHARED = {
    "shell.sidebar": (0, 0, 248, 941),
    "shell.header": (248, 0, 1424, 92),
    "shell.main": (248, 92, 1424, 825),
    "shell.navigation": (0, 145, 248, 330),
    "shell.operator": (18, 680, 214, 112),
    "shell.system-status": (18, 815, 214, 78),
}

ROUTE_SHARED = {
    "operations": {
        # The locked raster has no footer: its bottom panels finish at y=941.
        "shell.main": (248, 92, 1424, 849),
    },
    "incident-detail": {
        "shell.header": (248, 0, 1424, 116),
        "shell.main": (248, 0, 1424, 917),
    },
}

SEEDS = {
    "command-overview": {
        "command.telemetry": (263, 91, 1392, 56),
        "command.map": (263, 157, 1047, 449),
        "command.situation": (1323, 156, 332, 353),
        "command.auto-priority": (1323, 519, 332, 159),
        "command.watch-for": (1323, 688, 332, 178),
        "command.priority-incidents": (263, 620, 638, 268),
        "command.readiness": (911, 620, 399, 268),
    },
    "incidents": {
        "incidents.metrics": (262, 101, 947, 90),
        "incidents.table": (262, 192, 702, 704),
        "incidents.map": (974, 194, 674, 393),
        "incidents.triage": (974, 600, 308, 296),
        "incidents.activity": (1293, 600, 355, 296),
    },
    "intelligence": {
        "intelligence.map": (273, 74, 918, 447),
        "intelligence.revisions": (1208, 74, 449, 317),
        "intelligence.assumptions": (1208, 404, 449, 208),
        "intelligence.watch-for": (1208, 624, 449, 219),
        "intelligence.implications": (272, 533, 928, 166),
        "intelligence.hypotheses": (272, 709, 928, 208),
    },
    "evidence": {
        "evidence.buckets": (278, 157, 160, 493),
        "evidence.graph": (460, 157, 825, 493),
        "evidence.qualification": (1301, 157, 347, 493),
        "evidence.recent": (265, 668, 1384, 220),
    },
    "operations": {
        "operations.actions": (273, 94, 1383, 164),
        "operations.map": (273, 273, 800, 444),
        "operations.readiness": (1080, 272, 575, 245),
        "operations.trend": (1080, 518, 575, 198),
        "operations.handoff": (273, 733, 580, 208),
        "operations.needs": (865, 733, 443, 208),
        "operations.logistics": (1319, 733, 337, 208),
    },
    "incident-detail": {
        "detail.telemetry": (571, 56, 664, 59),
        "detail.map": (282, 116, 1029, 427),
        "detail.summary": (1325, 116, 337, 162),
        "detail.communities": (1325, 283, 337, 94),
        "detail.evacuation": (1325, 386, 337, 103),
        "detail.thresholds": (1325, 499, 337, 245),
        "detail.timeline": (278, 558, 288, 186),
        "detail.resources": (577, 558, 306, 186),
        "detail.changes": (892, 558, 418, 186),
        "detail.evidence": (278, 759, 652, 151),
        "detail.weather": (947, 759, 715, 151),
    },
}

# Internal rectangles measured directly from the immutable 1672 x 941 locked
# rasters. These deliberately extend coverage below route-level containers.
# They are exact specification coordinates, not runtime-derived snapshots.
MEASURED_INTERNAL = {
    "command-overview": {
        "command.map.controls": (279, 185, 48, 188),
        "command.situation.header": (1324, 156, 331, 38),
        "command.situation.body": (1324, 194, 331, 315),
        "command.auto-priority.header": (1324, 518, 331, 31),
        "command.auto-priority.body": (1325, 550, 329, 125),
        "command.watch-for.header": (1324, 687, 331, 39),
        "command.watch-for.body": (1324, 726, 331, 140),
        "command.priority-incidents.header": (263, 620, 638, 48),
        "command.priority-incidents.body": (263, 668, 638, 219),
        "command.priority-incidents.columns": (264, 669, 636, 24),
        "command.readiness.header": (911, 620, 398, 48),
        "command.readiness.body": (911, 668, 398, 219),
        "command.readiness.resources": (911, 668, 208, 219),
        "command.readiness.tempo": (1119, 668, 190, 219),
    },
    "incidents": {
        "incidents.filters": (1209, 101, 439, 90),
        "incidents.table.columns": (262, 192, 702, 65),
        "incidents.table.body": (262, 257, 702, 473),
        "incidents.map-canvas": (974, 194, 674, 393),
        "incidents.map-canvas.controls": (988, 208, 39, 171),
    },
    "intelligence": {
        "intelligence.map.header": (273, 74, 918, 61),
        "intelligence.map.stage": (273, 135, 918, 386),
        "intelligence.map-canvas": (273, 135, 918, 386),
        "intelligence.map-canvas.controls": (282, 148, 42, 186),
        "intelligence.map.scenarios": (1044, 148, 118, 364),
    },
    "evidence": {
        "evidence.graph.header": (460, 157, 825, 42),
        "evidence.graph.canvas": (460, 199, 825, 451),
        "evidence.graph.controls": (1222, 449, 39, 174),
        "evidence.graph.legend": (488, 559, 100, 59),
    },
    "operations": {
        "operations.actions.header": (273, 94, 1383, 44),
        "operations.actions.body": (273, 138, 1383, 120),
        "operations.map.header": (273, 273, 800, 40),
        "operations.map-canvas": (273, 313, 800, 404),
        "operations.map-canvas.controls": (286, 326, 43, 194),
    },
    "incident-detail": {
        "detail.header-context": (1333, 24, 332, 66),
        "detail.map.layers": (346, 131, 589, 35),
        "detail.map-canvas": (281, 116, 1031, 428),
        "detail.map-canvas.controls": (294, 131, 42, 348),
    },
}

MEASURED_INTERNAL_STYLES = {
    "command-overview": {
        "command.priority-incidents.columns": {"fontFamily": 'Roboto, Inter, "Helvetica Neue", Arial, sans-serif', "fontSize": "8px", "color": "rgb(104, 100, 94)"},
    },
    "incidents": {
        "incidents.table.columns": {"fontFamily": 'Roboto, Inter, "Helvetica Neue", Arial, sans-serif', "fontSize": "8px", "color": "rgb(104, 100, 94)"},
    },
    "intelligence": {
        "intelligence.map.scenarios": {"fontSize": "12px", "color": "rgb(245, 241, 235)"},
    },
    "evidence": {
        "evidence.graph.legend": {"fontSize": "9px", "color": "rgb(104, 100, 94)"},
    },
}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


HOUGH_RHO_PX = 1
HOUGH_THETA_RAD = np.pi / 180.0
HOUGH_MIN_VOTES = 48
RIDGE_PAIR_MAX_GAP_PX = 3
TANGENT_CLOSE_PX = 7
SEARCH_RADIUS_PX = 12
MINIMUM_SIDE_RUN_RATIO = 0.80
MAXIMUM_CORNER_DISTANCE_PX = 8
MINIMUM_DARK_RIDGE_RATIO = 0.85
MINIMUM_RIDGE_GRAYSCALE_LEVELS = 3.0
MINIMUM_GRADIENT_SIDE_RUN_RATIO = 0.80
MINIMUM_GRADIENT_SUPPORT_RATIO = 0.72
PROFILE_MINIMUM_MEAN_CONTRAST = 2.0
PROFILE_MINIMUM_UNIT_SUPPORT_RATIO = 0.45
PROFILE_MINIMUM_THREE_LEVEL_SUPPORT_RATIO = 0.20
PROFILE_SUBTLE_MINIMUM_MEAN_CONTRAST = 0.75
PROFILE_SUBTLE_MINIMUM_UNIT_SUPPORT_RATIO = 0.75
PROFILE_SUBTLE_MINIMUM_THREE_LEVEL_SUPPORT_RATIO = 0.03
PROFILE_SEARCH_RADIUS_PX = 6
INTERPOLATION_NEIGHBOR_COUNT = 5

# These DOM regions are intentionally transparent layout groups in the locked
# design.  Their outer edges are not painted, so nearby child/text edges must
# not be misclassified as the group boundary.  Missing sides are resolved from
# independently painted, aligned raster landmarks below.
TRANSPARENT_LAYOUT_PROFILE_EXCLUSIONS = {
    "shell.navigation": {"left", "right", "top", "bottom"},
    "shell.operator": {"left", "right", "top", "bottom"},
    "command.telemetry": {"left", "right", "top", "bottom"},
    "detail.telemetry": {"left", "right", "top"},
}


def exact_axis_hough(image: np.ndarray) -> dict:
    """Build deterministic exact-axis Hough bands from the locked raster."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (3, 3), 0.8, sigmaY=0.8, borderType=cv2.BORDER_REPLICATE)
    canny = cv2.Canny(blurred, 8, 24, apertureSize=3, L2gradient=True)
    gradient_x = cv2.Scharr(blurred, cv2.CV_32F, 1, 0)
    gradient_y = cv2.Scharr(blurred, cv2.CV_32F, 0, 1)
    absolute_x, absolute_y = np.abs(gradient_x), np.abs(gradient_y)
    vertical = np.where((canny != 0) & (absolute_x >= 2.0 * absolute_y), 255, 0).astype(np.uint8)
    horizontal = np.where((canny != 0) & (absolute_y >= 2.0 * absolute_x), 255, 0).astype(np.uint8)
    vertical = cv2.morphologyEx(vertical, cv2.MORPH_CLOSE, np.ones((TANGENT_CLOSE_PX, 1), np.uint8))
    horizontal = cv2.morphologyEx(horizontal, cv2.MORPH_CLOSE, np.ones((1, TANGENT_CLOSE_PX), np.uint8))
    return {
        "gray": gray,
        "verticalMask": vertical,
        "horizontalMask": horizontal,
        "verticalBands": hough_ridge_bands(vertical, "x"),
        "horizontalBands": hough_ridge_bands(horizontal, "y"),
    }


def hough_ridge_bands(mask: np.ndarray, axis: str) -> list[dict]:
    """Cluster exact-axis Hough ridges, retaining observable one-pixel edges."""
    raw_lines = cv2.HoughLinesWithAccumulator(mask, HOUGH_RHO_PX, HOUGH_THETA_RAD, HOUGH_MIN_VOTES)
    if raw_lines is None:
        return []
    expected_angle_index = 0 if axis == "x" else 90
    array = np.asarray(raw_lines)
    by_position: dict[int, float] = {}
    for raw_line in array.reshape(-1, array.shape[-1]):
        rho, theta, votes = (float(value) for value in raw_line[:3])
        angle_index = int(round(theta / HOUGH_THETA_RAD))
        if angle_index != expected_angle_index or abs(theta - expected_angle_index * HOUGH_THETA_RAD) > 1e-5:
            continue
        position = int(round(rho))
        by_position[position] = max(by_position.get(position, 0.0), votes)
    positions = sorted(by_position)
    bands = []
    seen = set()
    for start_index, first in enumerate(positions):
        members = []
        for position in positions[start_index:]:
            if position - first > RIDGE_PAIR_MAX_GAP_PX:
                break
            members.append(position)
        key = (members[0], members[-1])
        if key in seen:
            continue
        seen.add(key)
        weights = np.asarray([by_position[position] for position in members], dtype=np.float64)
        weighted = float(np.average(np.asarray(members, dtype=np.float64), weights=weights))
        bands.append({
            "position": int(np.floor(weighted + 0.5)),
            "ridgeStart": int(members[0]),
            "ridgeEnd": int(members[-1]),
            "ridgeCount": len(members),
            "votes": float(np.sum(weights)),
            "minimumRidgeVotes": float(np.min(weights)),
            "maximumRidgeGapPx": int(max(np.diff(members), default=0)),
        })
    return sorted(bands, key=lambda band: (band["position"], band["ridgeStart"], band["ridgeEnd"]))


def longest_boolean_run(values: np.ndarray) -> tuple[int, int]:
    transitions = np.diff(np.pad(values.astype(np.int8), (1, 1), constant_values=0))
    starts, ends = np.flatnonzero(transitions == 1), np.flatnonzero(transitions == -1)
    if not len(starts):
        return 0, 0
    index = max(range(len(starts)), key=lambda candidate: (int(ends[candidate] - starts[candidate]), -int(starts[candidate])))
    return int(starts[index]), int(ends[index])


def viewport_band(axis: str, side: str, extent: int) -> dict:
    position = 0 if side in ("left", "top") else extent - 1
    return {
        "axis": axis,
        "position": position,
        "ridgeStart": position,
        "ridgeEnd": position,
        "ridgeCount": 1,
        "votes": None,
        "minimumRidgeVotes": None,
        "maximumRidgeGapPx": 0,
        "viewportBoundary": True,
        "observable": True,
        "selectedBy": "locked-raster-viewport-boundary",
    }


def side_support(axis_data: dict, axis: str, band: dict, start: int, end: int) -> dict:
    """Require one coherent side run and a consistently darker ridge."""
    if band.get("gradientDerived"):
        return gradient_side_support(axis_data, axis, str(band["side"]), int(band["position"]), start, end)
    if band.get("viewportBoundary"):
        length = max(0, end - start)
        return {
            **band,
            "sideStart": int(start),
            "sideEndExclusive": int(end),
            "mergedRunStart": int(start),
            "mergedRunEndExclusive": int(end),
            "mergedRunLengthPx": int(length),
            "mergedRunRatio": 1.0,
            "startCornerDistancePx": 0,
            "endCornerDistancePx": 0,
            "darkRidgeSupportRatio": 1.0,
            "ridgeContrastQ10": None,
            "minimumGrayscaleLevels": MINIMUM_RIDGE_GRAYSCALE_LEVELS,
            "observable": True,
        }
    mask = axis_data["verticalMask"] if axis == "x" else axis_data["horizontalMask"]
    gray = axis_data["gray"]
    tangent_extent = mask.shape[0] if axis == "x" else mask.shape[1]
    normal_extent = mask.shape[1] if axis == "x" else mask.shape[0]
    start, end = max(0, start), min(tangent_extent, end)
    normal_start = max(0, int(band["ridgeStart"]))
    normal_end = min(normal_extent, int(band["ridgeEnd"]) + 1)
    if end <= start or normal_end <= normal_start:
        return {**band, "observable": False, "failure": "empty_side_or_ridge"}
    if axis == "x":
        merged = np.any(mask[start:end, normal_start:normal_end] != 0, axis=1)
        ridge_gray = gray[start:end, normal_start:normal_end]
        neighborhood = gray[start:end, max(0, normal_start - 2):min(normal_extent, normal_end + 2)]
    else:
        merged = np.any(mask[normal_start:normal_end, start:end] != 0, axis=0)
        ridge_gray = gray[normal_start:normal_end, start:end].T
        neighborhood = gray[max(0, normal_start - 2):min(normal_extent, normal_end + 2), start:end].T
    run_start, run_end = longest_boolean_run(merged)
    side_length = end - start
    run_length = run_end - run_start
    run_ratio = float(run_length) / max(1, side_length)
    start_distance, end_distance = run_start, side_length - run_end
    contrast = np.max(neighborhood.astype(np.float32), axis=1) - np.min(ridge_gray.astype(np.float32), axis=1)
    dark_support = float(np.count_nonzero(contrast >= MINIMUM_RIDGE_GRAYSCALE_LEVELS)) / max(1, len(contrast))
    contrast_q10 = float(np.quantile(contrast, 0.10)) if len(contrast) else 0.0
    observable = (
        run_ratio >= MINIMUM_SIDE_RUN_RATIO
        and start_distance <= MAXIMUM_CORNER_DISTANCE_PX
        and end_distance <= MAXIMUM_CORNER_DISTANCE_PX
        and dark_support >= MINIMUM_DARK_RIDGE_RATIO
        and contrast_q10 >= MINIMUM_RIDGE_GRAYSCALE_LEVELS
    )
    return {
        **band,
        "sideStart": int(start),
        "sideEndExclusive": int(end),
        "mergedRunStart": int(start + run_start),
        "mergedRunEndExclusive": int(start + run_end),
        "mergedRunLengthPx": int(run_length),
        "mergedRunRatio": run_ratio,
        "startCornerDistancePx": int(start_distance),
        "endCornerDistancePx": int(end_distance),
        "darkRidgeSupportRatio": dark_support,
        "ridgeContrastQ10": contrast_q10,
        "minimumGrayscaleLevels": MINIMUM_RIDGE_GRAYSCALE_LEVELS,
        "observable": observable,
        "selectedBy": "exact-axis-hough-ridge-and-side-support" if observable else "rejected-side-support",
    }


def gradient_side_support(axis_data: dict, axis: str, side: str, position: int, start: int, end: int) -> dict:
    """Measure a one-pixel raster boundary when Canny/Hough has no exact-axis ridge."""
    gray = axis_data["gray"].astype(np.float32)
    tangent_extent = gray.shape[0] if axis == "x" else gray.shape[1]
    normal_extent = gray.shape[1] if axis == "x" else gray.shape[0]
    start, end = max(0, start), min(tangent_extent, end)
    outside = position - 1 if side in ("left", "top") else position + 1
    if end <= start or position < 0 or position >= normal_extent or outside < 0 or outside >= normal_extent:
        return {"position": position, "side": side, "gradientDerived": True, "observable": False, "failure": "empty_gradient_side"}
    contrast = (
        np.abs(gray[start:end, position] - gray[start:end, outside])
        if axis == "x"
        else np.abs(gray[position, start:end] - gray[outside, start:end])
    )
    supported = (contrast >= MINIMUM_RIDGE_GRAYSCALE_LEVELS).astype(np.uint8)
    supported = cv2.morphologyEx(supported.reshape(-1, 1), cv2.MORPH_CLOSE, np.ones((TANGENT_CLOSE_PX, 1), np.uint8)).reshape(-1) != 0
    run_start, run_end = longest_boolean_run(supported)
    side_length = end - start
    run_length = run_end - run_start
    run_ratio = float(run_length) / max(1, side_length)
    support_ratio = float(np.count_nonzero(contrast >= MINIMUM_RIDGE_GRAYSCALE_LEVELS)) / max(1, len(contrast))
    start_distance, end_distance = run_start, side_length - run_end
    contrast_q10 = float(np.quantile(contrast, 0.10)) if len(contrast) else 0.0
    observable = (
        run_ratio >= MINIMUM_GRADIENT_SIDE_RUN_RATIO
        and support_ratio >= MINIMUM_GRADIENT_SUPPORT_RATIO
        and start_distance <= MAXIMUM_CORNER_DISTANCE_PX
        and end_distance <= MAXIMUM_CORNER_DISTANCE_PX
        and contrast_q10 >= MINIMUM_RIDGE_GRAYSCALE_LEVELS
    )
    return {
        "position": int(position),
        "ridgeStart": int(position),
        "ridgeEnd": int(position),
        "ridgeCount": 1,
        "votes": int(np.count_nonzero(contrast >= MINIMUM_RIDGE_GRAYSCALE_LEVELS)),
        "minimumRidgeVotes": None,
        "maximumRidgeGapPx": 0,
        "side": side,
        "sideStart": int(start),
        "sideEndExclusive": int(end),
        "mergedRunStart": int(start + run_start),
        "mergedRunEndExclusive": int(start + run_end),
        "mergedRunLengthPx": int(run_length),
        "mergedRunRatio": run_ratio,
        "startCornerDistancePx": int(start_distance),
        "endCornerDistancePx": int(end_distance),
        "darkRidgeSupportRatio": support_ratio,
        "gradientSupportRatio": support_ratio,
        "ridgeContrastQ10": contrast_q10,
        "minimumGrayscaleLevels": MINIMUM_RIDGE_GRAYSCALE_LEVELS,
        "gradientDerived": True,
        "observable": observable,
        "selectedBy": "exact-one-pixel-gradient-side-support" if observable else "rejected-gradient-side-support",
    }


def profile_side_candidate(axis_data: dict, axis: str, side: str, expected_stroke: int, start: int, end: int) -> dict | None:
    """Measure a locally observable partition edge without requiring a solid border.

    Logical layout regions such as telemetry strips and transparent card groups do
    not always paint a four-sided rectangle.  Their painted partition still
    produces a deterministic adjacent-pixel contrast profile.  This scorer keeps
    only coherent profiles; a quiet search window is never accepted merely
    because it is close to the topology anchor.
    """
    gray = axis_data["gray"].astype(np.float32)
    tangent_extent = gray.shape[0] if axis == "x" else gray.shape[1]
    normal_extent = gray.shape[1] if axis == "x" else gray.shape[0]
    start, end = max(0, start), min(tangent_extent, end)
    if expected_stroke <= 0 and side in ("left", "top"):
        return side_support(axis_data, axis, viewport_band(axis, side, normal_extent), start, end)
    if expected_stroke >= normal_extent - 1 and side in ("right", "bottom"):
        return side_support(axis_data, axis, viewport_band(axis, side, normal_extent), start, end)
    direction = -1 if side in ("left", "top") else 1
    candidates = []
    for position in range(max(1, expected_stroke - PROFILE_SEARCH_RADIUS_PX), min(normal_extent - 1, expected_stroke + PROFILE_SEARCH_RADIUS_PX + 1)):
        contrast = (
            np.abs(gray[start:end, position] - gray[start:end, position + direction])
            if axis == "x"
            else np.abs(gray[position, start:end] - gray[position + direction, start:end])
        )
        if not len(contrast):
            continue
        mean_contrast = float(np.mean(contrast))
        unit_support = float(np.count_nonzero(contrast >= 1.0)) / len(contrast)
        three_level_support = float(np.count_nonzero(contrast >= MINIMUM_RIDGE_GRAYSCALE_LEVELS)) / len(contrast)
        median_contrast = float(np.median(contrast))
        qualified = (
            mean_contrast >= PROFILE_MINIMUM_MEAN_CONTRAST
            and unit_support >= PROFILE_MINIMUM_UNIT_SUPPORT_RATIO
            and three_level_support >= PROFILE_MINIMUM_THREE_LEVEL_SUPPORT_RATIO
        ) or (
            mean_contrast >= PROFILE_SUBTLE_MINIMUM_MEAN_CONTRAST
            and unit_support >= PROFILE_SUBTLE_MINIMUM_UNIT_SUPPORT_RATIO
            and three_level_support >= PROFILE_SUBTLE_MINIMUM_THREE_LEVEL_SUPPORT_RATIO
        )
        if not qualified:
            continue
        candidates.append({
            "position": int(position),
            "side": side,
            "axis": axis,
            "sideStart": int(start),
            "sideEndExclusive": int(end),
            "meanAdjacentContrast": mean_contrast,
            "medianAdjacentContrast": median_contrast,
            "unitContrastSupportRatio": unit_support,
            "threeLevelContrastSupportRatio": three_level_support,
            "distanceFromSearchAnchorPx": abs(position - expected_stroke),
            "observable": True,
            "selectedBy": "locked-raster-adjacent-pixel-partition-profile",
            "profileDerived": True,
        })
    return min(candidates, key=lambda candidate: (
        candidate["distanceFromSearchAnchorPx"],
        -candidate["unitContrastSupportRatio"],
        -candidate["threeLevelContrastSupportRatio"],
        -candidate["meanAdjacentContrast"],
        candidate["position"],
    ), default=None)


def profile_side_candidates(axis_data: dict, region: str, seed: tuple[int, int, int, int]) -> dict[str, dict | None]:
    x, y, width, height = seed
    candidates = {
        "left": profile_side_candidate(axis_data, "x", "left", x, y, y + height),
        "right": profile_side_candidate(axis_data, "x", "right", x + width - 1, y, y + height),
        "top": profile_side_candidate(axis_data, "y", "top", y, x, x + width),
        "bottom": profile_side_candidate(axis_data, "y", "bottom", y + height - 1, x, x + width),
    }
    for side in TRANSPARENT_LAYOUT_PROFILE_EXCLUSIONS.get(region, ()):
        candidates[side] = None
    return candidates


def side_anchor(seed: tuple[int, int, int, int], side: str) -> int:
    x, y, width, height = seed
    return {"left": x, "right": x + width - 1, "top": y, "bottom": y + height - 1}[side]


def side_axis(side: str) -> str:
    return "x" if side in ("left", "right") else "y"


def raster_landmark_interpolation(
    route: str,
    region: str,
    side: str,
    seed: tuple[int, int, int, int],
    landmarks: list[dict],
) -> dict | None:
    """Interpolate an unpainted logical edge from qualified raster landmarks.

    The SEEDS table supplies only route topology/search windows.  The emitted
    coordinate is the topology anchor translated by a nearest-landmark median
    measured from nearby, independently qualified edges in the same locked
    raster.  At least three independent raster landmarks are required, so this
    can never degrade into seed-coordinate fallback.
    """
    axis = side_axis(side)
    anchor = side_anchor(seed, side)
    possible = [item for item in landmarks if item["axis"] == axis and item["region"] != region]
    # One landmark per independently measured peer region prevents a single
    # rectangle from supplying all interpolation authority.
    usable_by_region = {}
    for item in sorted(possible, key=lambda candidate: (
        abs(candidate["anchor"] - anchor), candidate["region"], candidate["side"], candidate["position"]
    )):
        usable_by_region.setdefault(item["region"], item)
    usable = list(usable_by_region.values())
    if len(usable) < 3:
        return None
    aligned = [item for item in usable if item["anchor"] == anchor]
    nearest = sorted((aligned or usable), key=lambda item: (
        abs(item["anchor"] - anchor),
        item["region"],
        item["side"],
        item["position"],
    ))[:INTERPOLATION_NEIGHBOR_COUNT]
    if aligned and len(nearest) < 3:
        supplemental = [item for item in usable if item not in aligned]
        nearest.extend(sorted(supplemental, key=lambda item: (
            abs(item["anchor"] - anchor), item["region"], item["side"], item["position"]
        ))[:3 - len(nearest)])
    if len(nearest) < 3:
        return None
    offset_sources = aligned if aligned else nearest
    ordered_offsets = sorted(
        (int(item["position"] - item["anchor"]), index, item)
        for index, item in enumerate(offset_sources)
    )
    offset = ordered_offsets[len(ordered_offsets) // 2][0]
    position = int(anchor + offset)
    return {
        "position": position,
        "side": side,
        "axis": axis,
        "observable": True,
        "selectedBy": "locked-raster-qualified-landmark-nearest-median-interpolation",
        "interpolated": True,
        "route": route,
        "searchAnchorCoordinateEmitted": False,
        "measuredTranslationPx": int(offset),
        "landmarkCount": len(nearest),
        "landmarks": [
            {
                "region": item["region"],
                "side": item["side"],
                "anchor": int(item["anchor"]),
                "measured": int(item["position"]),
                "translationPx": int(item["position"] - item["anchor"]),
                "selectedBy": item["selectedBy"],
            }
            for item in nearest
        ],
    }


def side_candidates(axis_data: dict, axis: str, side: str, expected_stroke: int, start: int, end: int) -> list[dict]:
    extent = axis_data["gray"].shape[1] if axis == "x" else axis_data["gray"].shape[0]
    if expected_stroke <= 0 and side in ("left", "top"):
        return [side_support(axis_data, axis, viewport_band(axis, side, extent), start, end)]
    if expected_stroke >= extent - 1 and side in ("right", "bottom"):
        return [side_support(axis_data, axis, viewport_band(axis, side, extent), start, end)]
    source = axis_data["verticalBands"] if axis == "x" else axis_data["horizontalBands"]
    candidates = []
    for band in source:
        if abs(int(band["position"]) - expected_stroke) > SEARCH_RADIUS_PX:
            continue
        measured = side_support(axis_data, axis, band, start, end)
        measured["distanceFromSearchAnchorPx"] = abs(int(band["position"]) - expected_stroke)
        if measured["observable"]:
            candidates.append(measured)
    if not candidates:
        for position in range(max(0, expected_stroke - SEARCH_RADIUS_PX), min(extent, expected_stroke + SEARCH_RADIUS_PX + 1)):
            measured = gradient_side_support(axis_data, axis, side, position, start, end)
            measured["distanceFromSearchAnchorPx"] = abs(position - expected_stroke)
            if measured["observable"]:
                candidates.append(measured)
    return sorted(candidates, key=lambda candidate: (
        candidate.get("distanceFromSearchAnchorPx", 0),
        -candidate["mergedRunRatio"],
        -candidate["darkRidgeSupportRatio"],
        -(candidate.get("votes") or 0),
        candidate["position"],
    ))[:6]


def refine_box(image: np.ndarray, axis_data: dict, seed: tuple[int, int, int, int]) -> tuple[dict | None, dict]:
    """Accept only a four-band rectangle; never substitute the topology seed."""
    del image
    x, y, width, height = seed
    side_sets = {
        "left": side_candidates(axis_data, "x", "left", x, y, y + height),
        "right": side_candidates(axis_data, "x", "right", x + width - 1, y, y + height),
        "top": side_candidates(axis_data, "y", "top", y, x, x + width),
        "bottom": side_candidates(axis_data, "y", "bottom", y + height - 1, x, x + width),
    }
    accepted = []
    if all(side_sets.values()):
        combinations = product(side_sets["left"], side_sets["right"], side_sets["top"], side_sets["bottom"])
        for left, right, top, bottom in combinations:
            right_edge, bottom_edge = int(right["position"]) + 1, int(bottom["position"]) + 1
            if right_edge <= int(left["position"]) or bottom_edge <= int(top["position"]):
                continue
            final = {
                "left": side_support(axis_data, "x", left, int(top["position"]), bottom_edge),
                "right": side_support(axis_data, "x", right, int(top["position"]), bottom_edge),
                "top": side_support(axis_data, "y", top, int(left["position"]), right_edge),
                "bottom": side_support(axis_data, "y", bottom, int(left["position"]), right_edge),
            }
            if not all(side["observable"] for side in final.values()):
                continue
            box = {
                "x": int(left["position"]),
                "y": int(top["position"]),
                "width": int(right_edge - int(left["position"])),
                "height": int(bottom_edge - int(top["position"])),
            }
            distance = abs(box["x"] - x) + abs(box["y"] - y) + abs(box["width"] - width) + abs(box["height"] - height)
            support = sum(side["mergedRunRatio"] + side["darkRidgeSupportRatio"] for side in final.values())
            votes = sum((side.get("votes") or 0.0) for side in final.values())
            accepted.append(((distance, -support, -votes, box["x"], box["y"]), box, final))
    if accepted:
        _, box, selected_sides = min(accepted, key=lambda candidate: candidate[0])
        geometry_enforced = True
        status = "MEASURED"
    else:
        box, selected_sides = None, {side: None for side in ("left", "right", "top", "bottom")}
        geometry_enforced = False
        status = "UNRESOLVED_DIAGNOSTIC_ONLY"
    public_candidates = {
        side: [{key: value for key, value in candidate.items() if key != "axis"} for candidate in candidates]
        for side, candidates in side_sets.items()
    }
    evidence = {
        "searchWindowAnchor": {"x": x, "y": y, "width": width, "height": height},
        "edgeSupport": selected_sides,
        "qualifiedSideCandidates": public_candidates,
        "geometryEnforced": geometry_enforced,
        "geometryStatus": status,
        "boxMethod": "half-open-exact-axis-hough-dark-ridge-v6",
        "houghParameters": {
            "gaussianKernel": [3, 3],
            "gaussianSigma": 0.8,
            "cannyThresholds": [8, 24],
            "cannyL2Gradient": True,
            "orientationFilter": "vertical:abs(scharrX)>=2*abs(scharrY);horizontal:abs(scharrY)>=2*abs(scharrX)",
            "tangentClosePx": TANGENT_CLOSE_PX,
            "rhoPx": HOUGH_RHO_PX,
            "thetaDegrees": 1,
            "acceptedAxesDegrees": [0, 90],
            "minimumVotes": HOUGH_MIN_VOTES,
            "maximumRidgeClusterGapPx": RIDGE_PAIR_MAX_GAP_PX,
            "singlePixelRidgesAllowed": True,
            "onePixelGradientFallback": {
                "minimumRunRatio": MINIMUM_GRADIENT_SIDE_RUN_RATIO,
                "minimumSupportRatio": MINIMUM_GRADIENT_SUPPORT_RATIO,
                "minimumContrastLevels": MINIMUM_RIDGE_GRAYSCALE_LEVELS,
                "seedCoordinatesEmitted": False,
            },
            "minimumMergedSideRunRatio": MINIMUM_SIDE_RUN_RATIO,
            "maximumCornerDistancePx": MAXIMUM_CORNER_DISTANCE_PX,
            "minimumDarkRidgeSupportRatio": MINIMUM_DARK_RIDGE_RATIO,
            "minimumRidgeContrastQ10": MINIMUM_RIDGE_GRAYSCALE_LEVELS,
            "seedFallback": False,
        },
    }
    return box, evidence


def resolve_route_geometry(
    route: str,
    image: np.ndarray,
    axis_data: dict,
    topology: dict[str, tuple[int, int, int, int]],
) -> dict[str, tuple[dict | None, dict]]:
    """Resolve every topology region from direct or cross-region raster evidence."""
    preliminary = {}
    landmarks = []
    for region, seed in topology.items():
        box, evidence = refine_box(image, axis_data, seed)
        profiles = profile_side_candidates(axis_data, region, seed)
        if box is not None:
            sides = evidence["edgeSupport"]
        else:
            sides = profiles
        preliminary[region] = {"box": box, "evidence": evidence, "profiles": profiles, "sides": sides}
        for side, measurement in sides.items():
            if measurement is None or measurement.get("observable") is not True:
                continue
            landmarks.append({
                "region": region,
                "side": side,
                "axis": side_axis(side),
                "anchor": side_anchor(seed, side),
                "position": int(measurement["position"]),
                "selectedBy": measurement.get("selectedBy", "locked-raster-qualified-edge"),
            })

    resolved = {}
    for region, seed in topology.items():
        item = preliminary[region]
        if item["box"] is not None:
            resolved[region] = (item["box"], item["evidence"])
            continue
        sides = dict(item["sides"])
        interpolated_sides = []
        for side, measurement in sides.items():
            if measurement is not None:
                continue
            measurement = raster_landmark_interpolation(route, region, side, seed, landmarks)
            sides[side] = measurement
            if measurement is not None:
                interpolated_sides.append(side)
        if all(sides.values()):
            left, right, top, bottom = (int(sides[side]["position"]) for side in ("left", "right", "top", "bottom"))
            if right >= left and bottom >= top:
                box = {"x": left, "y": top, "width": right - left + 1, "height": bottom - top + 1}
                status = "MEASURED_WITH_RASTER_LANDMARK_INTERPOLATION" if interpolated_sides else "MEASURED_FROM_PARTITION_PROFILES"
                evidence = {
                    **item["evidence"],
                    "edgeSupport": sides,
                    "partitionProfileCandidates": item["profiles"],
                    "geometryEnforced": True,
                    "geometryStatus": status,
                    "boxMethod": "half-open-raster-partition-and-qualified-landmark-interpolation-v7",
                    "targetProvenance": (
                        "locked-raster:direct-partitions-plus-qualified-landmark-interpolation"
                        if interpolated_sides
                        else "locked-raster:four-direct-adjacent-pixel-partitions"
                    ),
                    "interpolatedSides": interpolated_sides,
                    "seedCoordinatesEmittedAsFallback": False,
                }
                resolved[region] = (box, evidence)
                continue
        item["evidence"]["partitionProfileCandidates"] = item["profiles"]
        item["evidence"]["seedCoordinatesEmittedAsFallback"] = False
        resolved[region] = (None, item["evidence"])
    return resolved


def rgb(value: np.ndarray) -> str:
    b, g, r = (int(channel) for channel in value)
    return f"rgb({r}, {g}, {b})"


def token_rgb(value: str) -> str:
    raw = value.removeprefix("#")
    if len(raw) != 6:
        raise ValueError(f"unsupported_color_token:{value}")
    return f"rgb({int(raw[0:2], 16)}, {int(raw[2:4], 16)}, {int(raw[4:6], 16)})"


def longest_true_run(mask: np.ndarray) -> dict | None:
    best = None
    for orientation, matrix in (("horizontal", mask), ("vertical", mask.T)):
        for line_index, line in enumerate(matrix):
            transitions = np.diff(np.pad(line.astype(np.int8), (1, 1), constant_values=0))
            starts, ends = np.flatnonzero(transitions == 1), np.flatnonzero(transitions == -1)
            for start, end in zip(starts, ends):
                candidate = {
                    "orientation": orientation,
                    "x": int(start if orientation == "horizontal" else line_index),
                    "y": int(line_index if orientation == "horizontal" else start),
                    "length": int(end - start),
                }
                key = (candidate["length"], orientation == "horizontal", -candidate["y"], -candidate["x"])
                if best is None or key > best[0]:
                    best = (key, candidate)
    return best[1] if best else None


def exact_run_evidence(pixels: np.ndarray, color: np.ndarray, origin_x: int, origin_y: int, minimum_run: int, sample_count: int) -> dict:
    exact_mask = np.all(pixels == color, axis=2)
    run = longest_true_run(exact_mask)
    if run:
        run = {
            **run,
            "x": run["x"] + origin_x,
            "y": run["y"] + origin_y,
            "endExclusive": (
                run["x"] + origin_x + run["length"]
                if run["orientation"] == "horizontal"
                else run["y"] + origin_y + run["length"]
            ),
        }
    exact_count = int(np.count_nonzero(exact_mask))
    passed = run is not None and run["length"] >= minimum_run and exact_count >= minimum_run
    return {
        "color": rgb(color),
        "rawExact": True,
        "pass": passed,
        "minimumRunPx": minimum_run,
        "longestRun": run,
        "exactPixelCount": exact_count,
        "sampleCount": int(sample_count),
        "exactCoverage": float(exact_count) / max(1, sample_count),
    }


def border_run_evidence(image: np.ndarray, box: dict, background: np.ndarray | None) -> tuple[np.ndarray | None, dict]:
    x, y, width, height = (box[key] for key in ("x", "y", "width", "height"))
    x0, x1 = max(0, x), min(image.shape[1], x + width)
    y0, y1 = max(0, y), min(image.shape[0], y + height)
    lines = []
    if x1 > x0 and y1 > y0:
        lines = [
            ("top", image[y0, x0:x1], x0, y0, "horizontal"),
            ("bottom", image[y1 - 1, x0:x1], x0, y1 - 1, "horizontal"),
            ("left", image[y0:y1, x0], x0, y0, "vertical"),
            ("right", image[y0:y1, x1 - 1], x1 - 1, y0, "vertical"),
        ]
    candidates = []
    for side, line, line_x, line_y, orientation in lines:
        colors, counts = np.unique(line, axis=0, return_counts=True)
        color = colors[int(np.argmax(counts))]
        mask = np.all(line == color, axis=1)[None, :]
        run = longest_true_run(mask if orientation == "horizontal" else mask.T)
        if not run:
            continue
        run = {
            **run,
            "x": run["x"] + line_x,
            "y": run["y"] + line_y,
            "endExclusive": (
                run["x"] + line_x + run["length"]
                if orientation == "horizontal"
                else run["y"] + line_y + run["length"]
            ),
        }
        minimum_run = max(8, min(48, int(round(len(line) * 0.10))))
        distinct = background is None or not np.array_equal(color, background)
        candidates.append({
            "side": side,
            "color": rgb(color),
            "rawExact": True,
            "differentFromInterior": distinct,
            "minimumRunPx": minimum_run,
            "longestRun": run,
            "exactPixelCount": int(np.max(counts)),
            "linePixelCount": int(len(line)),
            "pass": distinct and run["length"] >= minimum_run,
            "_color": color,
        })
    passing = [candidate for candidate in candidates if candidate["pass"]]
    selected = max(passing, key=lambda item: (item["longestRun"]["length"], item["exactPixelCount"], item["side"]), default=None)
    public = lambda item: {key: value for key, value in item.items() if key != "_color"}
    return (selected["_color"] if selected else None), {
        "pass": selected is not None,
        "selected": public(selected) if selected else None,
        "candidates": [public(candidate) for candidate in candidates],
    }


def surface_measurements(image: np.ndarray, box: dict) -> dict:
    x, y, width, height = (box[key] for key in ("x", "y", "width", "height"))
    x1, y1 = max(0, x + 5), max(0, y + 5)
    x2, y2 = min(image.shape[1], x + width - 5), min(image.shape[0], y + height - 5)
    crop = image[y1:y2, x1:x2]
    if crop.size == 0:
        return {"background": None, "border": None, "backgroundExact": False, "borderExact": False, "flatColorEvidence": {"background": None, "border": None}, "sampleCount": 0}
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    gradient = cv2.morphologyEx(cv2.Canny(gray, 40, 120), cv2.MORPH_DILATE, np.ones((3, 3), np.uint8))
    pixels = crop[gradient == 0]
    if pixels.size == 0:
        pixels = crop.reshape(-1, 3)
    colors, counts = np.unique(pixels, axis=0, return_counts=True)
    modal = colors[int(np.argmax(counts))]
    exact_coverage = float(np.max(counts)) / max(1, len(pixels))
    minimum_run = max(8, min(48, int(round(max(crop.shape[:2]) * 0.05))))
    background_evidence = exact_run_evidence(crop, modal, x1, y1, minimum_run, crop.shape[0] * crop.shape[1])
    if background_evidence["pass"]:
        border, border_evidence = border_run_evidence(image, box, modal)
    else:
        border, border_evidence = None, {
            "pass": False,
            "selected": None,
            "candidates": [],
            "reason": "border_not_enforced_without_qualified_interior_color",
        }
    return {
        "background": rgb(modal) if background_evidence["pass"] else None,
        "border": rgb(border) if border is not None else None,
        "backgroundExactCoverage": exact_coverage,
        "backgroundExact": background_evidence["pass"],
        "borderExact": border_evidence["pass"],
        "flatColorEvidence": {"background": background_evidence, "border": border_evidence},
        "sampleCount": int(len(pixels)),
        "surfaceMethod": "opencv-quiet-interior-and-perimeter-raw-exact-runs-v3",
    }


def style_profile(tokens: dict, surface: dict) -> dict:
    ui = tokens["typography"]["ui"]
    targets = {
        "targetColor": token_rgb(tokens["color"]["text"]),
        "targetBackground": surface["background"],
        "targetBorder": surface["border"],
        "targetRadius": None,
        "targetPadding": None,
        "targetGap": None,
        "targetFontFamily": ui,
        "targetFontSize": f"{tokens['typography']['bodyPx']}px",
        "targetLineHeight": None,
        "targetFontWeight": None,
        "targetBorderWidth": None,
        "targetDisplay": None,
        "targetGridTemplateColumns": None,
    }
    enforcement = {
        "fontFamily": True,
        "fontSize": True,
        "fontWeight": False,
        "lineHeight": False,
        "color": True,
        "backgroundColor": surface["backgroundExact"],
        "borderColor": surface["borderExact"],
        "borderWidth": False,
        "borderRadius": False,
        "padding": False,
        "gap": False,
        "display": False,
        "gridTemplateColumns": False,
    }
    provenance = {
        "fontFamily": "locked-token:typography.ui",
        "fontSize": "locked-token:typography.bodyPx",
        "fontWeight": "not-raster-observable:no-locked-value",
        "lineHeight": "not-raster-observable:no-locked-value",
        "color": "locked-token:color.text",
        "backgroundColor": "locked-raster:quiet-interior-raw-exact-run" if surface["backgroundExact"] else "not-enforced:no-qualifying-flat-run",
        "borderColor": "locked-raster:perimeter-raw-exact-run" if surface["borderExact"] else "not-enforced:no-distinct-qualifying-border-run",
        "borderWidth": "not-raster-observable:per-side-css-shorthand-unknown",
        "borderRadius": "not-raster-observable:region-token-applicability-unknown",
        "padding": "not-raster-observable",
        "gap": "not-raster-observable",
        "display": "not-raster-observable",
        "gridTemplateColumns": "not-raster-observable",
    }
    return {"targets": targets, "enforcement": enforcement, "provenance": provenance}


def build_contract() -> dict:
    cv2.setNumThreads(1)
    cv2.ocl.setUseOpenCL(False)
    cv2.setRNGSeed(0x56494749)
    tokens = LOCKED_RASTER_TOKENS
    routes = {}
    for route, (filename, expected_hash) in REFERENCES.items():
        path = REFERENCE_ROOT / filename
        if path.is_symlink() or path.resolve() != (REFERENCE_ROOT.resolve() / filename):
            raise SystemExit(f"reference_path_invalid:{filename}")
        actual_hash = digest(path)
        if actual_hash != expected_hash:
            raise SystemExit(f"reference_hash_mismatch:{filename}:{actual_hash}")
        image = cv2.imread(str(path), cv2.IMREAD_COLOR)
        if image is None or image.shape[:2] != (941, 1672):
            raise SystemExit(f"reference_decode_invalid:{filename}")
        axis_data = exact_axis_hough(image)
        regions = {}
        shared = {**SHARED, **ROUTE_SHARED.get(route, {})}
        measured_internal = MEASURED_INTERNAL.get(route, {})
        extracted_topology = {**shared, **SEEDS[route]}
        topology = {**extracted_topology, **measured_internal}
        resolved_geometry = resolve_route_geometry(route, image, axis_data, extracted_topology)
        for name, (x, y, width, height) in measured_internal.items():
            resolved_geometry[name] = ({"x": x, "y": y, "width": width, "height": height}, {
                "geometryEnforced": True,
                "targetProvenance": "locked-raster:manually-measured-internal-component-rectangle",
                "measurementMethod": "immutable-raster-coordinate-inspection",
                "seedCoordinatesEmittedAsFallback": False,
            })
        for name, seed in topology.items():
            box, evidence = resolved_geometry[name]
            surface_box = box or {"x": seed[0], "y": seed[1], "width": seed[2], "height": seed[3]}
            surface = surface_measurements(image, surface_box)
            profile = style_profile(tokens, surface)
            if name in measured_internal:
                profile["enforcement"].update({"backgroundColor": False, "borderColor": False})
                for property_name, target_value in MEASURED_INTERNAL_STYLES.get(route, {}).get(name, {}).items():
                    target_name = {
                        "fontFamily": "targetFontFamily",
                        "fontSize": "targetFontSize",
                        "color": "targetColor",
                    }[property_name]
                    profile["targets"][target_name] = target_value
                    profile["enforcement"][property_name] = True
                    profile["provenance"][property_name] = "locked-raster:manually-measured-internal-typography"
            regions[name] = {
                "target": box,
                "tolerance": 2,
                "geometryEnforced": evidence["geometryEnforced"],
                **profile["targets"],
                "styleEnforcement": profile["enforcement"],
                "provenance": {
                    "target": evidence.get("targetProvenance", "locked-raster:exact-axis-hough-four-side-rectangle") if box else "not-enforced:no-qualified-four-side-rectangle",
                    **profile["provenance"],
                },
                "extractionEvidence": {
                    **evidence,
                    **surface,
                    "surfaceSamplingBoxSource": "measured-geometry" if box else "diagnostic-search-window",
                },
            }
        routes[route] = {"reference": filename, "sha256": expected_hash, "width": 1672, "height": 941, "regions": dict(sorted(regions.items()))}
    return {
        "schemaVersion": "vigia.frontend-visual-contract.v1",
        "status": "LOCKED_REFERENCE_DERIVED_WITH_EXPLICIT_ENFORCEMENT",
        "extractor": {"name": "vigia-opencv-visual-contract", "version": "4.3.0", "opencv": cv2.__version__, "threads": 1, "opencl": False, "rngSeed": 0x56494749},
        "referenceRoot": "DESIGN_SOURCE_OF_TRUTH",
        "thresholds": {"goldenStaticPixelDifferenceRatio": 0.005, "majorBoxDeltaPx": 2, "maximumTranslationPx": 2, "horizontalOverflowPx": 1},
        "routes": dict(sorted(routes.items())),
    }


def main() -> None:
    contract = build_contract()
    payload = (json.dumps(contract, indent=2, sort_keys=True) + "\n").encode()
    CONTRACT_PATH.parent.mkdir(parents=True, exist_ok=True)
    if CONTRACT_PATH.exists() and CONTRACT_PATH.read_bytes() == payload:
        return
    temporary = CONTRACT_PATH.with_suffix(".json.tmp")
    temporary.write_bytes(payload)
    os.replace(temporary, CONTRACT_PATH)


if __name__ == "__main__":
    main()
