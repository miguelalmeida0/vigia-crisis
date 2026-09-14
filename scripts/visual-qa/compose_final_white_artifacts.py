#!/usr/bin/env python3
"""Normalize native Chrome captures and compose final white visual artifacts."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / ".artifacts" / "precision-convergence" / "final"
SIZE = (1672, 941)


def relative(path: Path) -> str:
    return str(path.relative_to(ROOT))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def clamp(value: int, maximum: int) -> int:
    return max(0, min(maximum, int(value)))


def compose(route_dir: Path) -> dict:
    native = Image.open(route_dir / "current-native.jpg").convert("RGB")
    if native.width < SIZE[0] or native.height < SIZE[1]:
        raise RuntimeError(f"native_capture_too_small:{route_dir.name}:{native.size}")
    current = native.crop((0, 0, SIZE[0], SIZE[1]))
    current_path = route_dir / "current.png"
    current.save(current_path, format="PNG", optimize=True)
    target_path = route_dir / "target.png"
    target = Image.open(target_path).convert("RGB")
    if target.size != SIZE or current.size != target.size:
        raise RuntimeError(f"visual_dimensions_invalid:{route_dir.name}:{target.size}:{current.size}")

    target_values = np.asarray(target, dtype=np.int16)
    current_values = np.asarray(current, dtype=np.int16)
    delta = np.abs(target_values - current_values)
    Image.blend(target, current, 0.5).save(route_dir / "overlay-50.png", format="PNG", optimize=True)
    Image.fromarray(np.minimum(delta * 4, 255).astype(np.uint8)).save(route_dir / "difference.png", format="PNG", optimize=True)
    changed = np.max(delta, axis=2) > 12
    structural_delta = delta.copy()
    masked_pixels = 0
    mask_path = route_dir / "map-mask-report.json"
    mask = json.loads(mask_path.read_text(encoding="utf-8")) if mask_path.exists() else None
    map_artifacts = None

    if mask and mask.get("interior"):
        x0, y0, x1, y1 = mask["interior"]
        x0, x1 = clamp(x0, SIZE[0]), clamp(x1, SIZE[0])
        y0, y1 = clamp(y0, SIZE[1]), clamp(y1, SIZE[1])
        volatile = np.zeros(changed.shape, dtype=bool)
        volatile[y0:y1, x0:x1] = True
        for px0, py0, px1, py1 in mask.get("preservedUi", []):
            px0, px1 = clamp(px0, SIZE[0]), clamp(px1, SIZE[0])
            py0, py1 = clamp(py0, SIZE[1]), clamp(py1, SIZE[1])
            volatile[py0:py1, px0:px1] = False
        structural_delta[volatile] = 0
        masked_pixels = int(volatile.sum())
        if x1 > x0 and y1 > y0:
            target_crop = target.crop((x0, y0, x1, y1))
            current_crop = current.crop((x0, y0, x1, y1))
            crop_delta = np.abs(np.asarray(target_crop, dtype=np.int16) - np.asarray(current_crop, dtype=np.int16))
            target_crop.save(route_dir / "map-target-region.png", format="PNG", optimize=True)
            current_crop.save(route_dir / "map-current.png", format="PNG", optimize=True)
            Image.blend(target_crop, current_crop, 0.5).save(route_dir / "map-overlay-50.png", format="PNG", optimize=True)
            Image.fromarray(np.minimum(crop_delta * 4, 255).astype(np.uint8)).save(route_dir / "map-difference.png", format="PNG", optimize=True)
            map_artifacts = {
                "current": relative(route_dir / "map-current.png"),
                "targetRegion": relative(route_dir / "map-target-region.png"),
                "overlay50": relative(route_dir / "map-overlay-50.png"),
                "difference": relative(route_dir / "map-difference.png"),
            }

    structural_changed = np.max(structural_delta, axis=2) > 12
    Image.fromarray(np.minimum(structural_delta * 4, 255).astype(np.uint8)).save(route_dir / "masked-difference.png", format="PNG", optimize=True)
    points = np.argwhere(changed)
    bounding_box = None
    if points.size:
        y0, x0 = points.min(axis=0).tolist()
        y1, x1 = points.max(axis=0).tolist()
        bounding_box = {"x": x0, "y": y0, "width": x1 - x0 + 1, "height": y1 - y0 + 1}

    runtime = json.loads((route_dir / "runtime-report.json").read_text(encoding="utf-8"))
    metrics = {
        "route": runtime["route"],
        "targetSha256": sha256(target_path),
        "currentSha256": sha256(current_path),
        "nativeCurrentSha256": sha256(route_dir / "current-native.jpg"),
        "dimensions": {"width": SIZE[0], "height": SIZE[1]},
        "captureNormalization": {
            "cssViewport": runtime["viewport"],
            "nativeCapture": {"width": native.width, "height": native.height},
            "method": "Exact top-left CSS viewport crop from fresh Chrome transport canvas; native evidence retained without rescaling",
        },
        "pixelDifference": {
            "thresholdPerChannel": 12,
            "changedPixels": int(changed.sum()),
            "changedPixelRatio": float(changed.mean()),
            "meanAbsoluteError": float(delta.mean()),
            "rootMeanSquareError": float(np.sqrt(np.mean(np.square(delta.astype(np.float64))))),
            "changedBoundingBox": bounding_box,
        },
        "maskedStructuralDifference": {
            "policy": "Only volatile basemap and thermal raster pixels inside the rendered tile grid are excluded. Runtime controls, status, legends, labels, markers, north, wind, and scale remain compared.",
            "maskedPixels": masked_pixels,
            "changedPixels": int(structural_changed.sum()),
            "changedPixelRatio": float(structural_changed.mean()),
            "meanAbsoluteError": float(structural_delta.mean()),
        },
        "dom": {key: runtime[key] for key in ("route", "appState", "projectionState", "viewport", "document", "horizontalOverflowPx", "semantics", "routeNumbers", "removedPrimaryRoutes")},
        "mapMask": mask,
        "mapStates": runtime["maps"],
        "artifacts": {
            "target": relative(target_path),
            "current": relative(current_path),
            "nativeCurrent": relative(route_dir / "current-native.jpg"),
            "overlay50": relative(route_dir / "overlay-50.png"),
            "difference": relative(route_dir / "difference.png"),
            "maskedDifference": relative(route_dir / "masked-difference.png"),
            "map": map_artifacts,
        },
    }
    (route_dir / "metrics.json").write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
    return metrics


def main() -> int:
    for route_dir in sorted(path for path in OUTPUT.iterdir() if path.is_dir() and path.name[:2].isdigit()):
        metrics = compose(route_dir)
        print(f"{route_dir.name} 1672x941 difference={metrics['pixelDifference']['changedPixelRatio']:.5f} structural={metrics['maskedStructuralDifference']['changedPixelRatio']:.5f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
