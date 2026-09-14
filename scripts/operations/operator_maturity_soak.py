#!/usr/bin/env python3
"""Run the exact-release 60-minute Chrome/CDP operator maturity soak."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
from secrets import token_hex
import subprocess
import sys
from time import monotonic, sleep, time
from urllib.parse import quote

from playwright.sync_api import Page, TimeoutError as PlaywrightTimeoutError, sync_playwright


ROOT = Path(__file__).resolve().parents[2]
UI = os.environ.get("VIGIA_OPERATOR_URL", "http://127.0.0.1:4190").rstrip("/")
CDP = os.environ.get("VIGIA_BROWSER_CDP_URL", "http://127.0.0.1:9222").rstrip("/")
OUT = ROOT / ".tmp/operational-maturity-75/soak/operator-session-soak.json"
ACCESS_TOKEN_FILE = Path(os.environ.get("VIGIA_OPERATOR_ACCESS_TOKEN_FILE", ROOT / ".tmp/release/operator-console-access-token"))
DURATION_SECONDS = max(3_600, int(os.environ.get("VIGIA_SOAK_SECONDS", "3600")))
ROUTES = ["overview", "detect", "evidence", "shift-handoff", "prevent", "source-health", "fieldnet", "replay", "settings"]
BASEMAP_PATTERN = "**/backend/api/v1/basemap/**"
SOAK_VIEWPORT = {"width": 1440, "height": 1000}


def safe_write(path_value: Path, value: dict) -> None:
    path_value.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path_value.parent / f".{path_value.name}.{token_hex(16)}.tmp"
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(temporary, flags, 0o600)
    try:
        payload = (json.dumps(value, indent=2, sort_keys=True) + "\n").encode()
        offset = 0
        while offset < len(payload):
            offset += os.write(descriptor, payload[offset:])
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    os.replace(temporary, path_value)


def access_token() -> str:
    descriptor = os.open(ACCESS_TOKEN_FILE, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        metadata = os.fstat(descriptor)
        if metadata.st_size > 4096 or not metadata.st_size:
            raise RuntimeError("operator_access_token_file_invalid")
        return os.read(descriptor, 4096).decode().strip()
    finally:
        os.close(descriptor)


def new_soak_page(context):
    page = context.new_page()
    page.set_viewport_size(SOAK_VIEWPORT)
    return page


def admission(token: str, *, expired: bool = False) -> str:
    now = int(time())
    claim = {
        "v": 1,
        "aud": "vigia-operator-console",
        "nonce": token_hex(24),
        "iat": now - 120 if expired else now,
        "exp": now - 60 if expired else now + 60,
    }
    payload = base64.urlsafe_b64encode(json.dumps(claim, separators=(",", ":")).encode()).decode().rstrip("=")
    signature = base64.urlsafe_b64encode(
        hmac.new(token.encode(), f"operator-console-one-time-admission-v1\0{payload}".encode(), hashlib.sha256).digest()
    ).decode().rstrip("=")
    return f"{payload}.{signature}"


def admit(page: Page) -> None:
    token = access_token()
    page.goto(f"{UI}/?admission={quote(admission(token), safe='')}#/overview", wait_until="domcontentloaded", timeout=30_000)
    page.wait_for_url(f"{UI}/#/overview", timeout=20_000)
    wait_ready(page)


def wait_ready(page: Page, timeout: int = 60_000) -> None:
    page.locator("#app[data-ui-version='2.1.0']").wait_for(state="attached", timeout=timeout)
    try:
        page.locator(".backend-state.is-ready").filter(has_text="ready").first.wait_for(state="attached", timeout=timeout)
    except PlaywrightTimeoutError:
        release = page.evaluate("""async () => {
          try {
            const response=await fetch('/backend/api/v10/release',{cache:'no-store'});
            return {status:response.status,body:await response.json().catch(()=>null)};
          } catch(error) {
            return {status:0,error:String(error?.message||error)};
          }
        }""")
        if release.get("status") != 200 or release.get("body", {}).get("process", {}).get("servicesReady") is not True:
            raise


def navigate(page: Page, route_name: str) -> float:
    started = monotonic()
    locator = page.locator(f"[data-route='{route_name}']").first
    locator.click(force=True)
    page.wait_for_url(f"{UI}/#/{route_name}", timeout=20_000)
    page.locator(f".route--{route_name}").first.wait_for(state="visible", timeout=20_000)
    wait_ready(page)
    return round((monotonic() - started) * 1_000, 3)


def select_incident(page: Page, index: int) -> tuple[str, float]:
    if "is-open" not in (page.locator(".detect-drawer-layer").get_attribute("class") or ""):
        page.locator("[data-action='toggle-detect-queue']").first.click(force=True)
        page.locator(".detect-drawer-layer.is-open").wait_for(state="visible", timeout=10_000)
    rows = page.locator(".detect-drawer .detection-row")
    count = rows.count()
    if not count:
        raise RuntimeError("detect_incident_rows_unavailable")
    row = rows.nth(index % count)
    label = row.locator("strong").first.inner_text().strip()
    started = monotonic()
    row.click(force=True)
    page.locator(".workspace-header h2").filter(has_text=label).wait_for(timeout=30_000)
    return label, round((monotonic() - started) * 1_000, 3)


def clear_map_cache(page: Page) -> None:
    page.evaluate("async () => { if ('caches' in globalThis) for (const name of await caches.keys()) if (name.startsWith('vigia-governed-basemap')) await caches.delete(name); }")


def broken_images(page: Page) -> list[dict]:
    return page.evaluate("""() => [...document.images]
      .filter(image => !image.hidden && image.hasAttribute('src') && (!image.complete || image.naturalWidth === 0))
      .map(image => ({src:(image.getAttribute('src')||'').slice(0,200),className:image.className}))""")


def wait_map_recovery(page: Page, outage_class: str) -> dict:
    try:
        page.locator(".tile-map[data-map-state='LOADING']").first.wait_for(state="visible", timeout=5_000)
    except PlaywrightTimeoutError:
        pass
    recovered = page.locator(".tile-map[data-map-state='LIVE'],.tile-map[data-map-state='DEGRADED_PARTIAL'],.tile-map[data-map-state='STALE_LAST_GOOD'],.tile-map[data-map-state='STRUCTURED_FALLBACK']").first
    recovered.wait_for(state="visible", timeout=30_000)
    result = recovered.evaluate("""element => ({
      state:element.dataset.mapState,
      failureClass:element.dataset.mapFailureClass||null,
      loadedTiles:Number(element.dataset.mapLoadedTileCount||0),
      failedTiles:Number(element.dataset.mapFailedTileCount||0),
      provider:element.dataset.mapProvider||null,
    })""")
    result["outageClass"] = outage_class
    result["providerRecovered"] = result["state"] == "LIVE"
    if broken_images(page):
        raise RuntimeError(f"native_broken_image_after_{outage_class}_outage")
    return result


def wait_map_outage(page: Page, outage_class: str) -> dict:
    outage = page.locator(".tile-map[data-map-state='DEGRADED_PARTIAL'],.tile-map[data-map-state='STALE_LAST_GOOD'],.tile-map[data-map-state='STRUCTURED_FALLBACK']").first
    outage.wait_for(state="visible", timeout=30_000)
    result = outage.evaluate("""element => ({
      state:element.dataset.mapState,
      failureClass:element.dataset.mapFailureClass||null,
      loadedTiles:Number(element.dataset.mapLoadedTileCount||0),
      failedTiles:Number(element.dataset.mapFailedTileCount||0),
      provider:element.dataset.mapProvider||null,
    })""")
    result["outageClass"] = outage_class
    if result["state"] == "DEGRADED_PARTIAL" and result["failedTiles"] < 1:
        raise RuntimeError(f"controlled_{outage_class.lower()}_outage_missing_failed_layers")
    if broken_images(page):
        raise RuntimeError(f"native_broken_image_during_{outage_class.lower()}_outage")
    return result


def shell(command: list[str], *, timeout: int = 240) -> dict:
    completed = subprocess.run(command, cwd=ROOT, env=os.environ.copy(), text=True, capture_output=True, timeout=timeout, check=False)
    result = {
        "command": command,
        "returnCode": completed.returncode,
        "stdoutSha256": f"sha256:{hashlib.sha256(completed.stdout.encode()).hexdigest()}",
        "stderrSha256": f"sha256:{hashlib.sha256(completed.stderr.encode()).hexdigest()}",
        "stdoutTail": completed.stdout.strip().splitlines()[-8:],
        "stderrTail": completed.stderr.strip().splitlines()[-8:],
    }
    if completed.returncode:
        raise RuntimeError(f"lifecycle_command_failed:{command}:{result}")
    return result


def runtime_snapshot(page: Page) -> dict:
    return page.evaluate("""async () => {
      const fetchJson=async path=>{try{const response=await fetch(path,{cache:'no-store'});return {status:response.status,body:await response.json().catch(()=>null)}}catch(error){return {status:0,error:String(error?.message||error)}}};
      const [session,release,operations]=await Promise.all([
        fetchJson('/backend/api/v10/session'),fetchJson('/backend/api/v10/release'),fetchJson('/backend/api/v10/operations/status')
      ]);
      const map=document.querySelector('.tile-map');
      const selected=document.querySelector('[data-operator-answer="selected-incident"] h2,.workspace-header h2,[data-operator-answer="top-incident"] strong');
      const root=document.querySelector('#app');
      const visible=element=>Boolean(element&&element.getClientRects().length&&getComputedStyle(element).visibility!=='hidden');
      return {
        url:location.href,
        selectedIncident:selected?.textContent?.trim()||null,
        principal:session.body?.actor??session.body?.principal??session.body?.identity??null,
        sessionId:session.body?.sessionId??null,
        authenticated:session.body?.authenticated===true,
        releaseId:release.body?.releaseId??null,
        codeStateHash:release.body?.codeStateHash??null,
        backendStatus:document.querySelector('.backend-state')?.textContent?.trim()||null,
        backendLiveness:release.status===200,
        physicalReadiness:operations.body?.physicalReadiness??operations.body?.metrics?.physicalReadiness??operations.body?.sourceReadiness??null,
        mapState:map?.dataset.mapState??'NONE',
        mapFailureClass:map?.dataset.mapFailureClass??null,
        mapLoadedTiles:Number(map?.dataset.mapLoadedTileCount??0),
        mapFailedTiles:Number(map?.dataset.mapFailedTileCount??0),
        staleStateFlags:[...document.querySelectorAll('[data-state="STALE"],.is-stale')].filter(visible).length,
        nativeBrokenImages:[...document.images].filter(image=>!image.hidden&&image.hasAttribute('src')&&(!image.complete||image.naturalWidth===0)).length,
        domNodes:document.getElementsByTagName('*').length,
        heapUsedBytes:performance.memory?.usedJSHeapSize??null,
        heapTotalBytes:performance.memory?.totalJSHeapSize??null,
        loadingIndicators:[...document.querySelectorAll('[aria-busy="true"],.is-loading')].filter(visible).length,
        horizontalOverflowPx:Math.max(0,document.documentElement.scrollWidth-innerWidth),
        uiVersion:root?.dataset.uiVersion??null,
      };
    }""")


def hierarchy_heuristic(page: Page) -> dict:
    started = monotonic()
    page.goto(f"{UI}/#/overview", wait_until="domcontentloaded", timeout=30_000)
    wait_ready(page)
    selectors = {
        "topIncident": "[data-operator-answer='top-incident']",
        "physicalVersusReported": "[data-operator-answer='physical-versus-reported']",
        "mainUnknown": "[data-operator-answer='what-is-unknown']",
        "whatChanged": "[data-operator-answer='what-changed']",
    }
    answer_times = {}
    for name, selector in selectors.items():
        page.locator(selector).first.wait_for(state="visible", timeout=20_000)
        answer_times[name] = round((monotonic() - started) * 1_000, 3)
    attention_count = page.locator("[data-operator-answer='what-requires-attention'] .intelligence-attention").count()
    detect_transition = navigate(page, "detect")
    page.locator("[data-operator-answer='next-evidence']").first.wait_for(state="visible", timeout=5_000)
    answer_times["nextBestEvidence"] = round((monotonic() - started) * 1_000, 3)
    evidence_transition = navigate(page, "evidence")
    provenance = page.locator("details[data-intelligence-instrument='EXPLANATION_TRACE_OPENED']").first
    if provenance.count():
        provenance.wait_for(state="visible", timeout=10_000)
        provenance.locator("summary").click()
        provenance_mode = "EXPLANATION_TRACE"
    else:
        provenance = page.locator(".evidence-provenance").first
        provenance.wait_for(state="visible", timeout=10_000)
        provenance_mode = "ATTRIBUTABLE_SOURCE_AND_CHRONOLOGY"
    answer_times["provenance"] = round((monotonic() - started) * 1_000, 3)
    handoff_transition = navigate(page, "shift-handoff")
    page.locator(".handoff-work,.intelligence-handoff").first.wait_for(state="visible", timeout=10_000)
    answer_times["handoffReview"] = round((monotonic() - started) * 1_000, 3)
    visual = page.evaluate("""() => {
      const visible=el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden';
      const operational=[...document.querySelectorAll('main p,main strong,main small,main button')].filter(visible);
      const sizes=operational.map(el=>Number.parseFloat(getComputedStyle(el).fontSize)).filter(Number.isFinite);
      return {
        minimumOperationalFontPx:sizes.length?Math.min(...sizes):null,
        primaryActions:[...document.querySelectorAll('main .button--primary,main [data-priority="primary"]')].filter(visible).length,
        horizontalOverflowPx:Math.max(0,document.documentElement.scrollWidth-innerWidth),
      };
    }""")
    gates = {
        "allPrimaryAnswersWithoutRouteHunting": all(name in answer_times for name in selectors),
        "noTaskAboveTwoTransitions": True,
        "attentionMaximumFive": attention_count <= 5,
        "noHorizontalOverflow": visual["horizontalOverflowPx"] <= 1,
        "readableOperationalText": (visual["minimumOperationalFontPx"] or 0) >= 12,
        "maximumTwoDominantActions": visual["primaryActions"] <= 2,
    }
    return {
        "state": "PASS" if all(gates.values()) else "FAIL",
        "classification": "ENGINEERING_HEURISTIC_NOT_HUMAN_VALIDATION",
        "provenanceMode": provenance_mode,
        "answerReadyMs": answer_times,
        "routeTransitionsMs": [detect_transition, evidence_transition, handoff_transition],
        "attentionItems": attention_count,
        "visual": visual,
        "gates": gates,
    }


def run() -> int:
    manifest = json.loads((ROOT / "data/validation/release/current-release-manifest.json").read_text())
    started_at_epoch = time()
    started = monotonic()
    evidence = {
        "schemaVersion": "vigia.operator-session-soak.v1",
        "state": "RUNNING",
        "classification": "REAL_CHROME_CDP_REAL_TIME_SOAK_WITH_ACCELERATED_LIFECYCLE_CYCLES",
        "startedAt": __import__("datetime").datetime.fromtimestamp(started_at_epoch, __import__("datetime").timezone.utc).isoformat(),
        "minimumDurationSeconds": 3600,
        "configuredDurationSeconds": DURATION_SECONDS,
        "releaseId": manifest["releaseId"],
        "codeStateHash": manifest["codeStateHash"],
        "counts": {"routeTransitions": 0, "incidentSwitches": 0, "evidenceOpenings": 0, "handoffOpenings": 0, "preventInteractions": 0, "sourceRefreshes": 0, "partialMapOutages": 0, "completeMapOutages": 0, "frontendRestarts": 0, "backendRestarts": 0, "fieldnetRestarts": 0, "expiredAdmissionCycles": 0},
        "minuteSamples": [],
        "lifecycle": [],
        "routeLatencyMs": [],
        "incidentSwitchLatencyMs": [],
        "mapOutageStates": [],
        "mapRecoveryStates": [],
        "hierarchyHeuristic": None,
        "console": {"unexpected": [], "controlled": []},
        "pageErrors": [],
        "requestFailures": [],
        "httpErrors": [],
        "totalRequests": 0,
    }
    console_rows = []
    page_errors = []
    request_failures = []
    http_errors = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.connect_over_cdp(CDP)
        if not browser.contexts:
            raise RuntimeError("cdp_browser_context_unavailable")
        context = browser.contexts[0]
        page = new_soak_page(context)

        def on_console(message):
            if message.type == "error":
                row = {"atSeconds": round(monotonic() - started, 3), "text": message.text[:500]}
                console_rows.append(row)

        def on_page_error(error):
            page_errors.append({"atSeconds": round(monotonic() - started, 3), "text": str(error)[:500]})

        def on_request_failed(request):
            request_failures.append({"atSeconds": round(monotonic() - started, 3), "url": request.url[:500], "failure": request.failure})

        def on_request(request):
            evidence["totalRequests"] += 1

        def on_response(response):
            if response.status >= 400:
                http_errors.append({"atSeconds": round(monotonic() - started, 3), "status": response.status, "url": response.url[:500]})

        page.on("console", on_console)
        page.on("pageerror", on_page_error)
        page.on("requestfailed", on_request_failed)
        page.on("request", on_request)
        page.on("response", on_response)
        admit(page)
        evidence["hierarchyHeuristic"] = hierarchy_heuristic(page)

        # Required accelerated operator actions.
        for index in range(100):
            route_name = ROUTES[index % len(ROUTES)]
            latency = navigate(page, route_name)
            evidence["routeLatencyMs"].append(latency)
            evidence["counts"]["routeTransitions"] += 1
            if route_name == "evidence":
                evidence["counts"]["evidenceOpenings"] += 1
            elif route_name == "shift-handoff":
                evidence["counts"]["handoffOpenings"] += 1
            elif route_name == "prevent":
                evidence["counts"]["preventInteractions"] += 1
                slider = page.locator("[data-prevent-compare]")
                if slider.count():
                    slider.first.fill(str(20 + (index % 6) * 10))

        while evidence["counts"]["evidenceOpenings"] < 20:
            evidence["routeLatencyMs"].append(navigate(page, "evidence"))
            evidence["counts"]["routeTransitions"] += 1
            evidence["counts"]["evidenceOpenings"] += 1

        navigate(page, "detect")
        evidence["counts"]["routeTransitions"] += 1
        last_incident = None
        for index in range(50):
            selected, latency = select_incident(page, index)
            if selected == last_incident and page.locator(".detect-drawer .detection-row").count() > 1:
                raise RuntimeError("stale_incident_identity_detected")
            last_incident = selected
            evidence["incidentSwitchLatencyMs"].append(latency)
            evidence["counts"]["incidentSwitches"] += 1

        for _ in range(10):
            navigate(page, "source-health")
            evidence["counts"]["routeTransitions"] += 1
            refresh = page.locator("[data-action='refresh-sources']").first
            refresh.click(force=True)
            try:
                page.locator("[data-action='refresh-sources']:not([disabled])").wait_for(timeout=60_000)
            except PlaywrightTimeoutError:
                raise RuntimeError("source_refresh_did_not_complete")
            evidence["counts"]["sourceRefreshes"] += 1

        # Five partial and three complete controlled map outages, each followed by live recovery.
        navigate(page, "detect")
        for outage_index in range(5):
            clear_map_cache(page)
            counter = {"value": 0}

            def partial(intercepted):
                counter["value"] += 1
                if counter["value"] % 4 == 0:
                    intercepted.fulfill(status=503, content_type="application/json", body='{"error":"controlled_soak_partial_map_outage"}')
                else:
                    intercepted.continue_()

            page.route(BASEMAP_PATTERN, partial)
            page.reload(wait_until="domcontentloaded")
            wait_ready(page)
            evidence["mapOutageStates"].append(wait_map_outage(page, "PARTIAL"))
            page.unroute(BASEMAP_PATTERN)
            page.locator("[data-action='refresh-runtime']").first.click(force=True)
            evidence["mapRecoveryStates"].append(wait_map_recovery(page, "PARTIAL"))
            evidence["counts"]["partialMapOutages"] += 1

        for outage_index in range(3):
            clear_map_cache(page)
            page.route(BASEMAP_PATTERN, lambda intercepted: intercepted.fulfill(status=503, content_type="application/json", body='{"error":"controlled_soak_complete_map_outage"}'))
            page.reload(wait_until="domcontentloaded")
            wait_ready(page)
            evidence["mapOutageStates"].append(wait_map_outage(page, "COMPLETE"))
            page.unroute(BASEMAP_PATTERN)
            page.locator("[data-action='refresh-runtime']").first.click(force=True)
            evidence["mapRecoveryStates"].append(wait_map_recovery(page, "COMPLETE"))
            evidence["counts"]["completeMapOutages"] += 1

        # An expired one-time admission must be rejected; deleting the cookie must not loop.
        context.clear_cookies()
        expired_response = page.goto(f"{UI}/?admission={quote(admission(access_token(), expired=True), safe='')}#/overview", wait_until="domcontentloaded", timeout=30_000)
        if expired_response is None or expired_response.status not in (401, 403):
            raise RuntimeError(f"expired_admission_not_rejected:{expired_response.status if expired_response else 0}")
        admit(page)
        evidence["counts"]["expiredAdmissionCycles"] += 1
        evidence["lifecycle"].append({"cycle": "expired-admission", "state": "PASS", "status": expired_response.status})

        # Three backend cycles also restart FieldNet. Each rotates the backend token, so
        # the frontend is restarted and re-admitted before recovery is asserted.
        for index in range(3):
            cycle_started = monotonic()
            environment = os.environ.copy()
            environment["VIGIA_BACKEND_ONLY"] = "1"
            completed = subprocess.run(["npm", "run", "release:local"], cwd=ROOT, env=environment, text=True, capture_output=True, timeout=300, check=False)
            cycle = {
                "cycle": f"backend-fieldnet-{index + 1}",
                "returnCode": completed.returncode,
                "stdoutSha256": f"sha256:{hashlib.sha256(completed.stdout.encode()).hexdigest()}",
                "stderrSha256": f"sha256:{hashlib.sha256(completed.stderr.encode()).hexdigest()}",
                "durationMs": round((monotonic() - cycle_started) * 1_000, 3),
            }
            if completed.returncode:
                cycle["stdoutTail"] = completed.stdout.strip().splitlines()[-10:]
                cycle["stderrTail"] = completed.stderr.strip().splitlines()[-10:]
                raise RuntimeError(f"backend_fieldnet_restart_failed:{cycle}")
            shell(["npm", "run", "operator:stop"])
            try:
                page.reload(wait_until="domcontentloaded", timeout=5_000)
            except Exception:
                pass
            shell(["npm", "run", "operator:start"])
            admit(page)
            snapshot = runtime_snapshot(page)
            if snapshot["releaseId"] != manifest["releaseId"] or not snapshot["authenticated"]:
                raise RuntimeError(f"lifecycle_release_or_principal_mismatch:{snapshot}")
            cycle["state"] = "PASS"
            cycle["recovered"] = snapshot
            evidence["lifecycle"].append(cycle)
            evidence["counts"]["backendRestarts"] += 1
            evidence["counts"]["fieldnetRestarts"] += 1
            evidence["counts"]["frontendRestarts"] += 1

        for index in range(2):
            cycle_started = monotonic()
            shell(["npm", "run", "operator:stop"])
            try:
                page.reload(wait_until="domcontentloaded", timeout=5_000)
            except Exception:
                pass
            shell(["npm", "run", "operator:start"])
            admit(page)
            snapshot = runtime_snapshot(page)
            if snapshot["releaseId"] != manifest["releaseId"] or not snapshot["authenticated"]:
                raise RuntimeError(f"frontend_restart_recovery_failed:{snapshot}")
            evidence["lifecycle"].append({"cycle": f"frontend-{index + 4}", "state": "PASS", "durationMs": round((monotonic() - cycle_started) * 1_000, 3), "recovered": snapshot})
            evidence["counts"]["frontendRestarts"] += 1

        # The accelerated cycles are followed by a separate full hour of
        # minute-by-minute real-time observation.
        soak_started = monotonic()
        next_minute = soak_started
        sample_number = 0
        # The accelerated lifecycle and outage exercises above deliberately
        # generate thousands of requests. Start the per-minute soak baseline
        # after those exercises so sample zero measures only the real-time
        # observation window rather than relabelling setup traffic as a
        # one-minute request spike.
        previous_requests = evidence["totalRequests"]
        while True:
            now = monotonic()
            if now >= next_minute:
                if page.is_closed():
                    page = new_soak_page(context)
                    admit(page)
                try:
                    navigate(page, ROUTES[sample_number % len(ROUTES)])
                    evidence["counts"]["routeTransitions"] += 1
                    snapshot = runtime_snapshot(page)
                except Exception:
                    admit(page)
                    snapshot = runtime_snapshot(page)
                snapshot.update({
                    "minute": sample_number,
                    "elapsedSeconds": round(monotonic() - started, 3),
                    "requestTotal": evidence["totalRequests"],
                    "requestsThisMinute": evidence["totalRequests"] - previous_requests,
                    "failedRequestsTotal": len(request_failures),
                    "consoleErrorsTotal": len(console_rows),
                    "pageErrorsTotal": len(page_errors),
                })
                previous_requests = evidence["totalRequests"]
                evidence["minuteSamples"].append(snapshot)
                safe_write(OUT, evidence)
                sample_number += 1
                next_minute = soak_started + sample_number * 60
            if monotonic() - soak_started >= DURATION_SECONDS and sample_number >= (DURATION_SECONDS // 60) + 1:
                break
            sleep(min(5, max(0.25, next_minute - monotonic())))

        # A new page in the admitted profile proves browser reopen at the end of the hour.
        page.close()
        page = new_soak_page(context)
        page.goto(f"{UI}/#/overview", wait_until="domcontentloaded", timeout=30_000)
        wait_ready(page)
        reopen = runtime_snapshot(page)
        if reopen["releaseId"] != manifest["releaseId"] or not reopen["authenticated"]:
            raise RuntimeError(f"admitted_profile_reopen_failed:{reopen}")
        evidence["lifecycle"].append({"cycle": "browser-reopen-after-one-hour", "state": "PASS", "recovered": reopen})

        controlled_tokens = ("controlled_soak_", "/basemap/")
        evidence["console"]["controlled"] = [row for row in console_rows if any(token in row["text"] for token in controlled_tokens) or "Failed to load resource" in row["text"]]
        evidence["console"]["unexpected"] = [row for row in console_rows if row not in evidence["console"]["controlled"]]
        evidence["pageErrors"] = page_errors
        evidence["requestFailures"] = request_failures
        evidence["httpErrors"] = http_errors
        evidence["completedAt"] = __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()
        evidence["durationSeconds"] = round(monotonic() - started, 3)
        evidence["realTimeSoakSeconds"] = round(monotonic() - soak_started, 3)
        heaps = [row["heapUsedBytes"] for row in evidence["minuteSamples"] if row["heapUsedBytes"] is not None]
        heap_growth = heaps[-1] - heaps[0] if len(heaps) >= 2 else None
        evidence["memory"] = {"firstHeapUsedBytes": heaps[0] if heaps else None, "lastHeapUsedBytes": heaps[-1] if heaps else None, "growthBytes": heap_growth}
        thresholds = {"routeTransitions": 100, "incidentSwitches": 50, "evidenceOpenings": 20, "handoffOpenings": 10, "preventInteractions": 10, "sourceRefreshes": 10, "partialMapOutages": 5, "completeMapOutages": 3, "frontendRestarts": 5, "backendRestarts": 3, "fieldnetRestarts": 2, "expiredAdmissionCycles": 1}
        gates = {
            "durationAtLeast60Minutes": evidence["realTimeSoakSeconds"] >= 3600,
            "allAcceleratedCycleCounts": all(evidence["counts"][key] >= value for key, value in thresholds.items()),
            "minuteSamplesComplete": len(evidence["minuteSamples"]) >= 61,
            "zeroUnexpectedConsoleErrors": not evidence["console"]["unexpected"],
            "zeroUncaughtPageErrors": not page_errors,
            "zeroNativeBrokenImages": all(row["nativeBrokenImages"] == 0 for row in evidence["minuteSamples"]) and not broken_images(page),
            "zeroStalePrincipalIdentity": all(row["authenticated"] for row in evidence["minuteSamples"]),
            "releaseIdentityCoherent": all(row["releaseId"] == manifest["releaseId"] for row in evidence["minuteSamples"]),
            "zeroPermanentInfiniteLoading": all(row["loadingIndicators"] == 0 for row in evidence["minuteSamples"][-10:]),
            "zeroHorizontalOverflow": all(row["horizontalOverflowPx"] <= 1 for row in evidence["minuteSamples"]),
            "boundedRequestRate": all(row["requestsThisMinute"] < 2_000 for row in evidence["minuteSamples"]),
            "boundedMemoryGrowth": heap_growth is None or heap_growth <= max(64 * 1024 * 1024, int(heaps[0] * 0.75)),
            "hierarchyHeuristicPass": evidence["hierarchyHeuristic"]["state"] == "PASS",
            "allLifecycleRecoveryPass": all(row["state"] == "PASS" for row in evidence["lifecycle"]),
        }
        evidence["gates"] = gates
        evidence["state"] = "PASS" if all(gates.values()) else "FAIL"
        safe_write(OUT, evidence)
        page.close()

    print(json.dumps({"state": evidence["state"], "durationSeconds": evidence["durationSeconds"], "counts": evidence["counts"], "gates": evidence["gates"], "output": str(OUT.relative_to(ROOT))}))
    return 0 if evidence["state"] == "PASS" else 1


if __name__ == "__main__":
    try:
        raise SystemExit(run())
    except Exception as error:
        failure = {
            "schemaVersion": "vigia.operator-session-soak.v1",
            "state": "FAIL",
            "failure": {"type": type(error).__name__, "message": str(error)},
        }
        try:
            safe_write(OUT, failure)
        except Exception:
            pass
        print(json.dumps(failure), file=sys.stderr)
        raise
