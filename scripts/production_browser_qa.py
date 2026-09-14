#!/usr/bin/env python3
"""Browser proof for the fixture-free VIGIA production entrypoint."""
from __future__ import annotations

import os
import json
import re
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import traceback
from urllib.parse import urlparse
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
INTEGRITY_LABEL = "PRODUCTION · READ-ONLY · SYNTHETIC OBSERVATIONS REJECTED"


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def wait_for(url: str, timeout: float = 60.0) -> None:
    deadline = time.time() + timeout
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            with urlopen(url, timeout=1.5) as response:  # noqa: S310 - local QA server
                if response.status < 500:
                    return
        except Exception as error:  # pragma: no cover - timing dependent
            last_error = error
        time.sleep(0.15)
    raise RuntimeError(f"Production QA server did not start: {last_error}")


def wait_for_services(url: str, timeout: float = 60.0) -> None:
    deadline = time.time() + timeout
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            with urlopen(url, timeout=1.5) as response:  # noqa: S310 - local QA server
                body = json.loads(response.read().decode("utf-8"))
                if body.get("startup", {}).get("servicesReadyAt"):
                    return
        except Exception as error:  # pragma: no cover - timing dependent
            last_error = error
        time.sleep(0.15)
    raise RuntimeError(f"Production QA services did not become ready: {last_error}")


def chromium_path() -> str | None:
    bundled = None
    headless_shell = None
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as playwright:
            bundled = playwright.chromium.executable_path
        revision = re.search(r"chromium-(\d+)", bundled or "")
        if revision:
            shell_root = Path.home() / "Library" / "Caches" / "ms-playwright" / f"chromium_headless_shell-{revision.group(1)}"
            shell_paths = [*shell_root.glob("**/chrome-headless-shell"), *shell_root.glob("**/headless_shell")]
            headless_shell = next((str(path) for path in shell_paths if path.is_file()), None)
    except Exception:  # pragma: no cover - installation-specific fallback
        bundled = None
    candidates = [
        os.environ.get("VIGIA_CHROMIUM"),
        os.environ.get("CHROMIUM_PATH"),
        headless_shell,
        bundled,
        shutil.which("chromium"),
        shutil.which("chromium-browser"),
        shutil.which("google-chrome"),
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ]
    return next((item for item in candidates if item and Path(item).exists()), None)


def visible_product_labels(page) -> list[str]:
    return [" ".join(text.split()) for text in page.locator("[data-view-button]:visible").all_inner_texts()]


def assert_production_api(page, base: str) -> None:
    health = page.request.get(f"{base}/api/v2/health").json()
    bootstrap = page.request.get(f"{base}/api/v2/bootstrap").json()
    readiness = page.request.get(f"{base}/api/v10/ready").json()
    assert health["universe"] == "production"
    assert bootstrap["meta"]["universe"] == "production"
    assert bootstrap["meta"]["features"] == {"prevention": True, "detection": True, "livingFire": True, "action": True, "outcomes": False}
    assert [actor["id"] for actor in bootstrap["control"]["actors"]] == ["public-readonly"]
    if "checks" in readiness:
        checks = {item["id"]: item for item in readiness["checks"]}
        assert checks["production_synthetic_observations"]["evidence"]["syntheticObservations"] == 0
        assert checks["demo_identities"]["evidence"]["count"] == 0
    else:
        assert readiness == {
            "error": "operations_postgis_unavailable",
            "status": "degraded",
            "dependency": "postgis",
            "capability": "operations",
            "retryable": True,
            "message": "Durable operations state is temporarily unavailable. Retry after PostGIS recovers.",
            "dependencyState": readiness.get("dependencyState"),
            "lastSuccessfulConnectionAt": readiness.get("lastSuccessfulConnectionAt"),
            "lastFailureAt": readiness.get("lastFailureAt"),
        }, readiness


def assert_shell(page) -> None:
    page.locator("#app[data-ready='true']").wait_for(timeout=20_000)
    page.locator("#app[data-physical-loading='false']").wait_for(timeout=20_000)
    mode_label = page.locator("[data-mode-label]")
    assert mode_label.count() == 1 and mode_label.text_content() == INTEGRITY_LABEL
    if page.locator("[data-action='mobile-queue']:visible").count() == 0:
        mode_label.wait_for(state="visible")
    labels = visible_product_labels(page)
    normalized = [label.lower() for label in labels]
    primary = [label.split()[-1] for label in normalized if label.split()[-1] in {"command", "prevention", "validation"}]
    assert primary == ["command", "prevention", "validation"], labels
    assert not any(label.endswith(("detect", "fire", "action", "field", "outcomes")) for label in normalized), labels
    assert set(label.split()[-1] for label in normalized).issubset({"command", "prevention", "validation", "replay"}), labels
    assert page.locator("[data-view-button='observe']:visible").count() > 0
    assert page.locator("[data-view-button='outcomes']:visible").count() == 0


def assert_accessibility_basics(page) -> None:
    findings = page.evaluate("""() => {
      const visible = (node) => Boolean(node.offsetWidth || node.offsetHeight || node.getClientRects().length);
      const unnamedButtons = [...document.querySelectorAll('button')].filter((node) => visible(node) && !((node.getAttribute('aria-label') || node.textContent || '').trim())).length;
      const missingAlt = [...document.querySelectorAll('img')].filter((node) => !node.hasAttribute('alt')).length;
      const ids = [...document.querySelectorAll('[id]')].map((node) => node.id);
      const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
      return {unnamedButtons, missingAlt, duplicateIds, main: document.querySelectorAll('main').length, productNav: document.querySelectorAll('nav[aria-label="Product area"]').length};
    }""")
    assert findings["unnamedButtons"] == 0, findings
    assert findings["missingAlt"] == 0, findings
    assert findings["duplicateIds"] == [], findings
    assert findings["main"] == 1 and findings["productNav"] >= 1, findings


def launch_browser(playwright, executable: str):
    last_error: Exception | None = None
    for attempt in range(5):
        try:
            return playwright.chromium.launch(
                executable_path=executable,
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
            )
        except Exception as error:  # pragma: no cover - host process startup race
            last_error = error
            if attempt < 4:
                time.sleep(attempt + 1)
    raise last_error or RuntimeError("Chromium failed to launch")


def run_case(base: str, executable: str, case: str) -> dict:
    from playwright.sync_api import sync_playwright

    viewport = {"width": 390, "height": 844} if case == "mobile" else {"width": 1440, "height": 1000}
    errors: list[str] = []
    network_errors: list[tuple[int, str]] = []
    with sync_playwright() as playwright:
        browser = launch_browser(playwright, executable)
        page = browser.new_page(viewport=viewport)
        page.set_default_timeout(12_000)
        page.on("console", lambda message: errors.append(f"console:{message.type}:{message.text}") if message.type == "error" else None)
        page.on("pageerror", lambda error: errors.append(f"page:{error}"))
        page.on("response", lambda response: network_errors.append((response.status, response.url)) if response.status >= 400 else None)
        page.goto(base, wait_until="domcontentloaded")
        assert_shell(page)
        assert_accessibility_basics(page)
        assert_production_api(page, base)

        if case == "fire":
            page.locator("[data-view-button='live']:visible").click()
            page.locator("#app[data-view='live'][data-ready='true']").wait_for()
            assert page.locator("[data-queue-kicker]").text_content() == "PORTUGAL SHADOW TERRITORY"
            event = page.locator("[data-queue-list] [data-select-kind='event']:visible").first
            if event.count():
                event.click()
                page.locator("#app[data-view='live'][data-selected-kind='event']").wait_for()
                page.get_by_text("INCIDENT DECISION LEDGER", exact=False).first.wait_for()
                page.get_by_text("EVIDENCE STATE", exact=True).wait_for()
            else:
                assert page.locator("#app").get_attribute("data-selected-kind") == ""
                if page.locator(".physical-live-state.is-unavailable:visible").count():
                    page.get_by_text("LIVE STATE NOT RESOLVED", exact=True).wait_for()
                    assert page.locator(".summary-hero.unavailable strong").text_content() == "—"
                else:
                    page.get_by_text("PHYSICAL FIRES NOW", exact=True).wait_for()
        elif case == "mobile":
            sensor_family_proof = page.locator(".sensor-proof-strip > b:last-child")
            if sensor_family_proof.count() and sensor_family_proof.is_visible():
                assert "Sentinel-3" in sensor_family_proof.text_content() or "VIIRS+S3" in sensor_family_proof.text_content()
            else:
                page.locator(".summary-hero.unavailable strong").wait_for(state="visible")
                assert page.locator(".summary-hero.unavailable strong").text_content() == "—"
            page.locator("[data-view-button='observe']:visible").click()
            page.locator("#app[data-view='observe']").wait_for()
            page.locator("[data-view-button='validation']:visible").click()
            page.locator("#app[data-view='validation']").wait_for()
            page.locator("[data-view-button='live']:visible").click()
            page.locator("#app[data-view='live']").wait_for()
            event = page.locator("[data-queue-list] [data-select-kind='event']:visible").first
            if event.count():
                event.click()
                page.locator("#app.mobile-inspector[data-selected-kind='event']").wait_for()
                page.get_by_text("INCIDENT DECISION LEDGER", exact=False).first.wait_for()
            overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            assert overflow <= 1, f"horizontal overflow: {overflow}px"
        else:
            assert page.locator("#app").get_attribute("data-view") == "live"
            assert page.locator("[data-queue-kicker]").text_content() == "PORTUGAL SHADOW TERRITORY"
            page.get_by_text("What requires attention across the monitored territory?", exact=True).wait_for()
            if page.locator(".command-map-status:visible").count():
                page.get_by_text("COMMAND DECISION · NOW", exact=True).wait_for()
                assert page.locator(".command-quantities > div").count() == 6
            else:
                page.get_by_text("LIVE STATE NOT RESOLVED", exact=True).wait_for()
                assert page.locator(".summary-hero.unavailable strong").text_content() == "—"
                assert page.locator(".command-quantities").count() == 0

        actionable = [item for item in errors if "favicon" not in item and "ERR_BLOCKED_BY_CLIENT" not in item and "Failed to load resource" not in item]
        expected_degraded = []
        unexpected_network = []
        for status, url in network_errors:
            path = urlparse(url).path
            expected = (
                status == 503 and path.startswith(("/api/v10/operations", "/api/v10/alerts", "/api/v10/notifications"))
            ) or (status in {403, 429, 503} and path.startswith("/api/v1/basemap/"))
            (expected_degraded if expected else unexpected_network).append((status, url))
        assert not actionable, " | ".join(actionable)
        assert not unexpected_network, unexpected_network
        result = {"case": case, "products": visible_product_labels(page), "consoleErrors": len(actionable), "expectedDegradedResponses": len(expected_degraded)}
        browser.close()
        return result


def run(case: str) -> int:
    if case not in {"desktop", "fire", "mobile"}:
        print(f"Unknown browser QA case: {case}", file=sys.stderr)
        return 2
    executable = chromium_path()
    if not executable:
        print("Production browser QA failed: Chromium unavailable.", file=sys.stderr)
        return 2
    port = free_port()
    with tempfile.TemporaryDirectory(prefix="vigia-production-browser-") as state_root:
        env = os.environ.copy()
        env.pop("VIGIA_FIXTURES", None)
        for secret in ("NASA_FIRMS_MAP_KEY", "VIGIA_CDSE_USERNAME", "VIGIA_CDSE_PASSWORD", "VIGIA_CDSE_ACCESS_TOKEN", "VIGIA_EARTHDATA_TOKEN"):
            env.pop(secret, None)
        env.update({
            "PORT": str(port),
            "OPEN_BROWSER": "0",
            "VIGIA_UNIVERSE": "production",
            "VIGIA_LOCAL_SECRETS_DISABLED": "1",
            "VIGIA_KEYCHAIN_DISABLED": "1",
            "VIGIA_STATE_FILE": str(Path(state_root) / "production.json"),
        })
        process = subprocess.Popen(
            [shutil.which("node") or "node", "apps/api/src/server.mjs"],
            cwd=ROOT,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        try:
            base = f"http://127.0.0.1:{port}"
            wait_for(f"{base}/api/v2/health")
            wait_for_services(f"{base}/api/v10/health")
            result = run_case(base, executable, case)
            print(f"Production browser QA passed: {result}")
            return 0
        except Exception as error:
            print(f"Production browser QA failed ({case}): {error}", file=sys.stderr)
            traceback.print_exc()
            return 1
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()


if __name__ == "__main__":
    raise SystemExit(run(sys.argv[1] if len(sys.argv) > 1 else "desktop"))
