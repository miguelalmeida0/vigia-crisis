#!/usr/bin/env python3
"""Repository-owned, objective visual QA for the six locked VIGIA routes.

The harness accepts only the canonical full-stack local runtime, authenticates
through its one-time admission contract, captures the native 1672×941 target
viewport, and emits deterministic overlays, differences, geometry, overflow,
accessibility, console, and network evidence. It never starts a second server.
"""

from __future__ import annotations

import argparse
import base64
import binascii
import hashlib
import hmac
import json
import math
import os
from pathlib import Path
import secrets
import shutil
import stat
import struct
import subprocess
import sys
import time
import urllib.request
import zlib

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import TimeoutError as PlaywrightTimeout
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[2]
TARGET_ROOT = ROOT / "DESIGN_SOURCE_OF_TRUTH"
OUTPUT_ROOT = ROOT / "data" / "validation" / "release" / "operator-console-screenshots" / "locked-parity"
OPERATOR_POINTER = ROOT / ".tmp" / "operator-console-current.json"
ACCESS_TOKEN_FILE = ROOT / ".tmp" / "release" / "operator-console-access-token"
GOLDEN = {"width": 1672, "height": 941}
VIEWPORTS = [(1672, 941), (1600, 1000), (1440, 900), (1280, 800), (1024, 768), (768, 1024), (430, 932), (390, 844), (320, 568)]
ROUTES = [
    ("01-command-overview", "command-overview", "01-command-overview.png"),
    ("02-incidents", "incidents", "02-incidents.png"),
    ("03-intelligence", "intelligence", "03-intelligence.png"),
    ("04-evidence", "evidence", "04-evidence.png"),
    ("05-operations", "operations", "05-operations.png"),
    ("06-incident-detail", "incident-detail", "06-incident-detail.png"),
]

# Pixel coordinates measured from the immutable 1672×941 targets. These are
# geometry contracts only; target copy and mock values never enter runtime.
TARGET_LANDMARKS = {
    "command-overview": {
        "sidebar": [0, 0, 248, 941], "topbar": [248, 0, 1424, 78],
        "telemetry": [263, 90, 1392, 60], "primaryVisual": [263, 157, 1046, 448],
        "rightRail": [1324, 157, 331, 731], "lowerPanels": [263, 620, 1046, 268],
    },
    "incidents": {
        "sidebar": [0, 0, 248, 941], "topbar": [248, 0, 1424, 90],
        "toolbar": [262, 100, 1390, 90], "inventory": [262, 192, 702, 704],
        "primaryVisual": [974, 193, 674, 394], "lowerPanels": [974, 601, 674, 294],
    },
    "intelligence": {
        "sidebar": [0, 0, 248, 941], "topbar": [248, 0, 1424, 74],
        "primaryVisual": [272, 74, 928, 628], "rightRail": [1208, 74, 449, 769],
        "lowerPanels": [272, 710, 928, 208],
    },
    "evidence": {
        "sidebar": [0, 0, 248, 941], "topbar": [248, 0, 1424, 90],
        "context": [279, 91, 1369, 55], "buckets": [279, 157, 160, 494],
        "primaryVisual": [459, 157, 825, 494], "rightRail": [1301, 157, 347, 494],
        "lowerPanels": [279, 668, 1369, 220],
    },
    "operations": {
        "sidebar": [0, 0, 248, 941], "topbar": [248, 0, 1424, 94],
        "urgent": [272, 95, 1383, 164], "primaryVisual": [272, 272, 800, 445],
        "rightRail": [1080, 272, 575, 445], "lowerPanels": [272, 733, 1383, 208],
    },
    "incident-detail": {
        "sidebar": [0, 0, 248, 941], "header": [282, 16, 1378, 85],
        "primaryVisual": [282, 116, 1030, 427], "rightRail": [1327, 116, 335, 627],
        "lowerPanels": [277, 558, 1035, 351],
    },
}

SELECTORS = {
    "command-overview": {"sidebar": ".phase-b-sidebar", "topbar": ".phase-b-topbar", "telemetry": ".overview-metrics", "primaryVisual": ".locked-map-surface", "rightRail": ".command-rail", "lowerPanels": ".command-lower"},
    "incidents": {"sidebar": ".phase-b-sidebar", "topbar": ".phase-b-topbar", "toolbar": ".incident-toolbar", "inventory": ".incident-inventory", "primaryVisual": ".incident-context-map", "lowerPanels": ".incidents-context-lower"},
    "intelligence": {"sidebar": ".phase-b-sidebar", "topbar": ".phase-b-topbar", "primaryVisual": ".forecast-surface", "rightRail": ".intelligence-rail", "lowerPanels": ".hypothesis-strip"},
    "evidence": {"sidebar": ".phase-b-sidebar", "topbar": ".phase-b-topbar", "context": ".evidence-context", "buckets": ".evidence-bucket-rail", "primaryVisual": ".evidence-graph-surface", "rightRail": ".evidence-inspector", "lowerPanels": ".recent-evidence"},
    "operations": {"sidebar": ".phase-b-sidebar", "topbar": ".phase-b-topbar", "urgent": ".urgent-actions", "primaryVisual": ".operations-map", "rightRail": ".operations-rail", "lowerPanels": ".operations-lower"},
    "incident-detail": {"sidebar": ".phase-b-sidebar", "header": ".incident-detail-header", "primaryVisual": ".incident-detail-map", "rightRail": ".incident-right-rail", "lowerPanels": ".incident-work-surfaces"},
}


def fail(message: str) -> None:
    raise RuntimeError(message)


def ensure_within(path: Path, root: Path) -> Path:
    resolved = path.resolve()
    if resolved != root.resolve() and root.resolve() not in resolved.parents:
        fail(f"artifact_path_outside_repository:{resolved}")
    return resolved


def prepare_output() -> None:
    ensure_within(OUTPUT_ROOT, ROOT)
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    if OUTPUT_ROOT.is_symlink():
        fail("visual_qa_output_must_not_be_symlink")


def local_status() -> str:
    result = subprocess.run(
        ["npm", "run", "local:status"], cwd=ROOT, text=True,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=90, check=False,
    )
    if result.returncode != 0 or "Operator       READY" not in result.stdout or "Central API    READY" not in result.stdout:
        fail(f"canonical_local_runtime_not_ready\n{result.stdout.strip()}")
    return result.stdout


def runtime_identity() -> tuple[str, dict]:
    pointer = json.loads(OPERATOR_POINTER.read_text(encoding="utf-8"))
    origin = str(pointer.get("origin", "")).rstrip("/")
    if not origin.startswith("http://127.0.0.1:") or any(part in origin for part in ("?", "#", "@")):
        fail("operator_runtime_pointer_invalid")
    with urllib.request.urlopen(f"{origin}/__operator/ready", timeout=5) as response:
        ready = json.load(response)
    if ready.get("ok") is not True or ready.get("frontend") != "operator-console" or ready.get("path") != "apps/operator-console":
        fail("operator_runtime_identity_invalid")
    return origin, ready


def one_time_admission(origin: str) -> str:
    metadata = ACCESS_TOKEN_FILE.lstat()
    if not stat.S_ISREG(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode) or stat.S_IMODE(metadata.st_mode) & 0o077:
        fail("operator_access_token_file_not_protected")
    secret = ACCESS_TOKEN_FILE.read_text(encoding="utf-8").strip()
    if len(secret) < 32:
        fail("operator_access_token_invalid")
    now = int(time.time())
    claim = {"v": 1, "aud": "vigia-operator-console", "nonce": secrets.token_hex(24), "iat": now, "exp": now + 60}
    payload = base64.urlsafe_b64encode(json.dumps(claim, separators=(",", ":")).encode()).decode().rstrip("=")
    signature = base64.urlsafe_b64encode(hmac.new(secret.encode(), f"operator-console-one-time-admission-v1\0{payload}".encode(), hashlib.sha256).digest()).decode().rstrip("=")
    return f"{origin}/?admission={payload}.{signature}"


def read_png(path: Path) -> tuple[int, int, bytearray]:
    raw = path.read_bytes()
    if raw[:8] != b"\x89PNG\r\n\x1a\n":
        fail(f"not_png:{path}")
    position, compressed, header = 8, bytearray(), None
    while position < len(raw):
        length = struct.unpack(">I", raw[position:position + 4])[0]
        kind = raw[position + 4:position + 8]
        data = raw[position + 8:position + 8 + length]
        position += 12 + length
        if kind == b"IHDR":
            header = struct.unpack(">IIBBBBB", data)
        elif kind == b"IDAT":
            compressed.extend(data)
        elif kind == b"IEND":
            break
    if not header:
        fail(f"png_header_missing:{path}")
    width, height, depth, color_type, compression, filtering, interlace = header
    if depth != 8 or color_type not in (2, 6) or compression or filtering or interlace:
        fail(f"unsupported_png_format:{path}:{header}")
    channels = 3 if color_type == 2 else 4
    scan = zlib.decompress(bytes(compressed))
    stride, offset, prior, rgb = width * channels, 0, bytearray(width * channels), bytearray(width * height * 3)
    for y in range(height):
        filter_type, offset = scan[offset], offset + 1
        row = bytearray(scan[offset:offset + stride]); offset += stride
        for index in range(stride):
            left = row[index - channels] if index >= channels else 0
            up = prior[index]
            upper_left = prior[index - channels] if index >= channels else 0
            if filter_type == 1:
                row[index] = (row[index] + left) & 255
            elif filter_type == 2:
                row[index] = (row[index] + up) & 255
            elif filter_type == 3:
                row[index] = (row[index] + ((left + up) >> 1)) & 255
            elif filter_type == 4:
                estimate = left + up - upper_left
                pa, pb, pc = abs(estimate - left), abs(estimate - up), abs(estimate - upper_left)
                predictor = left if pa <= pb and pa <= pc else up if pb <= pc else upper_left
                row[index] = (row[index] + predictor) & 255
            elif filter_type != 0:
                fail(f"unsupported_png_filter:{filter_type}:{path}")
        target = y * width * 3
        for x in range(width):
            source = x * channels
            rgb[target + x * 3:target + x * 3 + 3] = row[source:source + 3]
        prior = row
    return width, height, rgb


def png_chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", binascii.crc32(kind + data) & 0xFFFFFFFF)


def write_png(path: Path, width: int, height: int, rgb: bytes) -> None:
    stride = width * 3
    body = b"".join(b"\x00" + rgb[y * stride:(y + 1) * stride] for y in range(height))
    payload = b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + png_chunk(b"IDAT", zlib.compress(body, 9)) + png_chunk(b"IEND", b"")
    path.write_bytes(payload)


def image_metrics(reference: Path, runtime: Path, overlay: Path, difference: Path) -> dict:
    rw, rh, ref = read_png(reference)
    tw, th, actual = read_png(runtime)
    if (rw, rh) != (GOLDEN["width"], GOLDEN["height"]):
        fail(f"locked_target_dimensions_changed:{reference}:{rw}x{rh}")
    if (tw, th) != (rw, rh):
        fail(f"runtime_capture_dimensions_mismatch:{runtime}:{tw}x{th}")
    mixed, diff = bytearray(len(ref)), bytearray(len(ref))
    changed, absolute, squared = 0, 0, 0
    min_x, min_y, max_x, max_y = rw, rh, -1, -1
    for pixel in range(rw * rh):
        base = pixel * 3
        delta = [abs(ref[base + channel] - actual[base + channel]) for channel in range(3)]
        for channel in range(3):
            mixed[base + channel] = (ref[base + channel] + actual[base + channel]) // 2
            diff[base + channel] = min(255, delta[channel] * 4)
            absolute += delta[channel]
            squared += delta[channel] * delta[channel]
        if max(delta) > 12:
            changed += 1
            x, y = pixel % rw, pixel // rw
            min_x, min_y, max_x, max_y = min(min_x, x), min(min_y, y), max(max_x, x), max(max_y, y)
    write_png(overlay, rw, rh, mixed)
    write_png(difference, rw, rh, diff)
    channels = rw * rh * 3
    return {
        "targetDimensions": {"width": rw, "height": rh},
        "runtimeDimensions": {"width": tw, "height": th},
        "pixelDifference": {
            "thresholdPerChannel": 12, "differenceVisualizationAmplification": 4,
            "changedPixels": changed, "changedPixelRatio": changed / (rw * rh),
            "meanAbsoluteError": absolute / channels, "rootMeanSquareError": math.sqrt(squared / channels),
            "changedBoundingBox": None if max_x < 0 else {"x": min_x, "y": min_y, "width": max_x - min_x + 1, "height": max_y - min_y + 1},
        },
    }


def rounded_box(box: dict | None) -> list[int] | None:
    if not box:
        return None
    return [round(box["x"]), round(box["y"]), round(box["width"]), round(box["height"])]


def landmark_metrics(page, route: str) -> dict:
    runtime = {}
    for name, selector in SELECTORS[route].items():
        runtime[name] = rounded_box(page.locator(selector).first.bounding_box())
    variance, values = {}, []
    for name, target in TARGET_LANDMARKS[route].items():
        actual = runtime.get(name)
        if not actual:
            variance[name] = None
            continue
        delta = [actual[index] - target[index] for index in range(4)]
        absolute = [abs(value) for value in delta]
        values.extend(absolute)
        variance[name] = {"target": target, "runtime": actual, "delta": delta, "absoluteDelta": absolute}
    return {"target": TARGET_LANDMARKS[route], "runtime": runtime, "variance": variance, "meanAbsoluteEdgeVariance": sum(values) / len(values) if values else None, "maximumAbsoluteEdgeVariance": max(values) if values else None}


def settled(page, route: str, *, wait_for_map: bool) -> None:
    page.wait_for_function(
        "route => document.body.dataset.vigiaRoute === route && ['ready','degraded','error'].includes(document.body.dataset.vigiaAppState)",
        arg=route,
        timeout=30000,
    )
    if wait_for_map and page.locator("[data-map-state]").count():
        try:
            page.wait_for_function("() => [...document.querySelectorAll('[data-map-state]')].every(node => node.dataset.mapState !== 'LOADING')", timeout=35000)
        except PlaywrightTimeout:
            pass
    page.wait_for_timeout(250)


def dom_metrics(page) -> dict:
    return page.evaluate("""() => {
      const html=document.documentElement, main=document.querySelector('main');
      const visible=node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'};
      const controls=[...document.querySelectorAll('button,a[href],input,select,textarea,summary')].filter(visible);
      const unnamed=controls.filter(node=>!((node.getAttribute('aria-label')||node.getAttribute('title')||node.textContent||node.getAttribute('placeholder')||'').trim()));
      const ids=[...document.querySelectorAll('[id]')].map(node=>node.id), duplicates=[...new Set(ids.filter((id,index)=>ids.indexOf(id)!==index))];
      const tap=controls.map(node=>{const r=node.getBoundingClientRect();return{tag:node.tagName,label:(node.getAttribute('aria-label')||node.textContent||'').trim().slice(0,80),width:r.width,height:r.height}});
      return {
        viewport:{width:innerWidth,height:innerHeight}, document:{clientWidth:html.clientWidth,scrollWidth:html.scrollWidth,clientHeight:html.clientHeight,scrollHeight:html.scrollHeight},
        main:{clientWidth:main?.clientWidth??null,scrollWidth:main?.scrollWidth??null,clientHeight:main?.clientHeight??null,scrollHeight:main?.scrollHeight??null},
        horizontalOverflowPx:Math.max(0,html.scrollWidth-html.clientWidth), bodyRoute:document.body.dataset.vigiaRoute, appState:document.body.dataset.vigiaAppState,
        semantics:{mainCount:document.querySelectorAll('main').length,h1Count:document.querySelectorAll('h1').length,primaryNavLinks:document.querySelectorAll('.sidebar__nav--primary a').length,duplicateIds:duplicates,unnamedControlCount:unnamed.length},
        tapTargets:{minimumWidth:tap.length?Math.min(...tap.map(item=>item.width)):null,minimumHeight:tap.length?Math.min(...tap.map(item=>item.height)):null,below44:tap.filter(item=>item.width<43.5||item.height<43.5)}
      };
    }""")


def run_interactions(page, origin: str) -> dict:
    results = {}
    page.set_viewport_size({"width": 390, "height": 844})
    page.goto(f"{origin}/#/command-overview", wait_until="domcontentloaded")
    settled(page, "command-overview", wait_for_map=False)
    menu = page.locator('[data-action="toggle-nav"]')
    menu.focus(); menu.press("Enter"); page.wait_for_timeout(100)
    results["keyboardDrawerOpen"] = page.locator("body.nav-open").count() == 1
    page.keyboard.press("Escape"); page.wait_for_timeout(100)
    results["keyboardDrawerEscapeClose"] = page.locator("body.nav-open").count() == 0
    page.set_viewport_size(GOLDEN)
    page.goto(f"{origin}/#/incidents", wait_until="domcontentloaded")
    settled(page, "incidents", wait_for_map=False)
    status_filter = page.locator('[data-change="incident-filter"]')
    sort_filter = page.locator('[data-change="incident-sort"]')
    status_options = status_filter.locator("option")
    status_value = status_options.nth(1).get_attribute("value") if status_options.count() > 1 else "ALL"
    status_filter.select_option(status_value)
    sort_filter.select_option("CHANGED")
    page.wait_for_timeout(100)
    results["incidentFilterSelection"] = status_filter.input_value() == status_value and sort_filter.input_value() == "CHANGED"
    actions = page.locator('[data-action^="focus-incident:"]')
    identifiers = [actions.nth(index).get_attribute("data-action") for index in range(min(3, actions.count()))]
    for action in identifiers:
        page.locator(f'[data-action="{action}"]').click(); page.wait_for_timeout(80)
    results["rapidIncidentSwitching"] = len(identifiers) == 3 and page.locator('[data-action^="focus-incident:"].is-selected').get_attribute("data-action") == identifiers[-1]
    page.goto(f"{origin}/#/command-overview", wait_until="domcontentloaded")
    settled(page, "command-overview", wait_for_map=False)
    map_node = page.locator("[data-map-zoom]").first
    before = map_node.get_attribute("data-map-zoom")
    page.locator('[data-action="map-zoom-in"]').first.click(); page.wait_for_timeout(100)
    after = page.locator("[data-map-zoom]").first.get_attribute("data-map-zoom")
    results["mapZoom"] = before != after
    return results


def main() -> int:
    global OUTPUT_ROOT
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=OUTPUT_ROOT)
    args = parser.parse_args()
    OUTPUT_ROOT = ensure_within(args.output if args.output.is_absolute() else ROOT / args.output, ROOT)
    status_text = local_status()
    origin, identity = runtime_identity()
    prepare_output()
    console_errors, unexpected_responses, provider_failures = [], [], []
    summary = {"schemaVersion": "vigia.locked-frontend-visual-qa.v1", "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "origin": origin, "releaseIdentity": identity, "goldenViewport": GOLDEN, "routes": {}, "responsiveOverflowMatrix": [], "interactions": {}, "localStatus": status_text}
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            context = browser.new_context(viewport=GOLDEN, device_scale_factor=1, color_scheme="light", reduced_motion="reduce")
            page = context.new_page()
            page.on("console", lambda message: console_errors.append({"type": message.type, "text": message.text}) if message.type in ("error", "warning") else None)
            def record_response(response):
                if response.status < 400:
                    return
                row = {"status": response.status, "url": response.url.split("?", 1)[0]}
                (provider_failures if "/backend/api/v1/basemap/" in response.url or "/backend/api/v1/map/" in response.url else unexpected_responses).append(row)
            page.on("response", record_response)
            page.goto(one_time_admission(origin), wait_until="domcontentloaded")
            page.wait_for_url(f"{origin}/#/command-overview", timeout=15000)
            settled(page, "command-overview", wait_for_map=True)
            for directory, route, target_name in ROUTES:
                route_dir = OUTPUT_ROOT / directory
                route_dir.mkdir(parents=True, exist_ok=True)
                reference = route_dir / "reference.png"; runtime = route_dir / "runtime.png"
                overlay = route_dir / "overlay-50.png"; difference = route_dir / "difference.png"
                shutil.copyfile(TARGET_ROOT / target_name, reference)
                page.set_viewport_size(GOLDEN)
                page.goto(f"{origin}/#/{route}", wait_until="domcontentloaded")
                settled(page, route, wait_for_map=True)
                page.screenshot(path=str(runtime), full_page=False, animations="disabled")
                metrics = image_metrics(reference, runtime, overlay, difference)
                metrics["route"] = route
                metrics["state"] = dom_metrics(page)
                metrics["landmarks"] = landmark_metrics(page, route)
                metrics["mapStates"] = page.locator("[data-map-state]").evaluate_all("nodes => nodes.map(node => ({state:node.dataset.mapState,loaded:Number(node.dataset.mapLoadedTileCount),failed:Number(node.dataset.mapFailedTileCount),failureClass:node.dataset.mapFailureClass,lastGoodAt:node.dataset.mapLastGoodAt}))")
                metrics["artifacts"] = {name: str(path.relative_to(ROOT)) for name, path in {"reference": reference, "runtime": runtime, "overlay50": overlay, "difference": difference}.items()}
                (route_dir / "metrics.json").write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
                summary["routes"][route] = metrics
            for width, height in VIEWPORTS:
                page.set_viewport_size({"width": width, "height": height})
                for _, route, _ in ROUTES:
                    page.goto(f"{origin}/#/{route}", wait_until="domcontentloaded")
                    settled(page, route, wait_for_map=False)
                    measured = dom_metrics(page)
                    summary["responsiveOverflowMatrix"].append({"route": route, "viewport": {"width": width, "height": height}, **measured})
            summary["interactions"] = run_interactions(page, origin)
            summary["consoleErrors"] = console_errors
            summary["unexpectedNetworkFailures"] = unexpected_responses
            summary["providerFailures"] = provider_failures
            summary["gates"] = {
                "dimensions": all(item["runtimeDimensions"] == GOLDEN for item in summary["routes"].values()),
                "horizontalOverflow": all(item["horizontalOverflowPx"] <= 1 for item in summary["responsiveOverflowMatrix"]),
                "semantics": all(not item["semantics"]["duplicateIds"] and item["semantics"]["unnamedControlCount"] == 0 and item["semantics"]["mainCount"] == 1 for item in summary["responsiveOverflowMatrix"]),
                "interactions": all(summary["interactions"].values()),
                "consoleErrors": not any(item["type"] == "error" for item in console_errors),
                "unexpectedNetworkFailures": len(unexpected_responses) == 0,
            }
            browser.close()
    except (PlaywrightError, PlaywrightTimeout) as error:
        print(f"PLAYWRIGHT_ENVIRONMENT_BLOCKED: {error}", file=sys.stderr)
        return 2
    (OUTPUT_ROOT / "visual-qa-summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"state": "COMPLETE", "origin": origin, "releaseId": identity.get("releaseId"), "output": str(OUTPUT_ROOT.relative_to(ROOT)), "gates": summary["gates"]}, indent=2))
    return 0 if all(summary["gates"].values()) else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"LOCKED_FRONTEND_VISUAL_QA_FAILED: {error}", file=sys.stderr)
        raise SystemExit(1)
