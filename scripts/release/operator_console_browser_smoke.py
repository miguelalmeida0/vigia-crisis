#!/usr/bin/env python3
"""Certify the exact running Operator Console through the required CDP browser."""
from __future__ import annotations

import hashlib
import hmac
import base64
import atexit
import json
import os
import re
import shutil
import signal
import stat
import subprocess
from pathlib import Path
import sys
from time import perf_counter
from time import sleep
from time import time
from http.cookiejar import CookieJar
from urllib.parse import quote, urlsplit
from urllib.request import HTTPRedirectHandler, HTTPCookieProcessor, Request, build_opener
from secrets import token_hex

from playwright.sync_api import Page, expect, sync_playwright

ROOT = Path(__file__).resolve().parents[2]
UI = os.environ.get("VIGIA_OPERATOR_URL", "http://127.0.0.1:4190").rstrip("/")
BACKEND = os.environ.get("VIGIA_BASE_URL", "http://127.0.0.1:4177").rstrip("/")
CDP_URL = os.environ.get("VIGIA_BROWSER_CDP_URL", "http://127.0.0.1:9222").rstrip("/")
BROWSER_EXECUTABLE = os.environ.get("VIGIA_BROWSER_EXECUTABLE", "")
BROWSER_EXECUTABLE_SHA256 = os.environ.get("VIGIA_BROWSER_EXECUTABLE_SHA256", "")
BROWSER_PROFILE_NONCE = os.environ.get("VIGIA_BROWSER_PROFILE_NONCE", "")
MANIFEST = ROOT / "data/validation/release/current-release-manifest.json"
QA_MODE = os.environ.get("VIGIA_OPERATOR_QA_MODE", "release")
OUT = ROOT / (".tmp/operator-console-qa/running-browser-certification.json" if QA_MODE == "development" else "data/validation/release/running-browser-certification.json")
SHOTS = ROOT / (".tmp/operator-console-qa/screenshots" if QA_MODE == "development" else "data/validation/release/operator-console-screenshots")
FRONTEND = {"id": "operator-console", "path": "apps/operator-console", "origin": UI}
ACCESS_TOKEN_FILE = Path(os.environ.get("VIGIA_OPERATOR_ACCESS_TOKEN_FILE", ROOT / ".tmp/release/operator-console-access-token"))
ATTESTATION_KEY = ""
RUN_NONCE = ""
VIEWPORTS = [(1600, 1000), (1440, 900), (1280, 800), (1024, 768), (768, 1024), (430, 932), (390, 844), (320, 568)]
PRIMARY_NAV = ["Overview", "Detect", "Evidence", "Handoff"]
UTILITY_NAV = ["Prevent screening", "Source Health", "FieldNet", "Incident Replay", "Settings"]
PROHIBITED_ROUTES = {"respond", "resources", "accountability", "dispatch", "system-proof"}
MAX_HTTP_JSON_BYTES = 2 * 1024 * 1024
MAX_DIST_FILES = 4096
MAX_DIST_ENTRIES = 8192
MAX_DIST_FILE_BYTES = 16 * 1024 * 1024
MAX_DIST_BYTES = 128 * 1024 * 1024
MAX_DIST_DEPTH = 64


def canonical_json(value) -> str:
    if isinstance(value, dict):
        return "{" + ",".join(f"{json.dumps(key, ensure_ascii=False)}:{canonical_json(value[key])}" for key in sorted(value)) + "}"
    if isinstance(value, list):
        return "[" + ",".join(canonical_json(item) for item in value) + "]"
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if not (float("-inf") < value < float("inf")):
            raise RuntimeError("browser_evidence_non_finite_number")
        if value == 0:
            return "0"
        if value.is_integer():
            return str(int(value))
        return json.dumps(value, separators=(",", ":"))
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def secure_parent(path_value: Path, create: bool) -> tuple[int, list[int], str]:
    base = os.path.abspath(ROOT)
    target = os.path.abspath(path_value)
    if os.path.commonpath((base, target)) != base or target == base:
        raise RuntimeError("release_artifact_path_escape")
    relative = os.path.relpath(target, base)
    parts = relative.split(os.sep)
    flags = os.O_RDONLY | os.O_DIRECTORY | getattr(os, "O_NOFOLLOW", 0)
    opened: list[int] = []
    try:
        current = os.open(base, flags)
        opened.append(current)
        for component in parts[:-1]:
            try:
                next_fd = os.open(component, flags, dir_fd=current)
            except FileNotFoundError:
                if not create:
                    raise RuntimeError("release_artifact_directory_invalid")
                os.mkdir(component, 0o700, dir_fd=current)
                next_fd = os.open(component, flags, dir_fd=current)
            opened.append(next_fd)
            current = next_fd
        return current, opened, parts[-1]
    except Exception:
        for descriptor in reversed(opened):
            os.close(descriptor)
        raise


def secure_directory(path_value: Path) -> None:
    base = os.path.abspath(ROOT)
    target = os.path.abspath(path_value)
    if os.path.commonpath((base, target)) != base or target == base:
        raise RuntimeError("release_artifact_path_escape")
    flags = os.O_RDONLY | os.O_DIRECTORY | getattr(os, "O_NOFOLLOW", 0)
    current = os.open(base, flags)
    try:
        for component in os.path.relpath(target, base).split(os.sep):
            try:
                next_fd = os.open(component, flags, dir_fd=current)
            except FileNotFoundError:
                os.mkdir(component, 0o700, dir_fd=current)
                next_fd = os.open(component, flags, dir_fd=current)
            os.close(current)
            current = next_fd
    finally:
        os.close(current)


def safe_read(path_value: Path, maximum: int = 64 * 1024 * 1024) -> bytes:
    parent, opened, basename = secure_parent(path_value, create=False)
    descriptor = None
    try:
        descriptor = os.open(basename, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0), dir_fd=parent)
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_size > maximum:
            raise RuntimeError(f"release_artifact_read_invalid:{path_value}")
        chunks = []
        remaining = metadata.st_size
        while remaining:
            chunk = os.read(descriptor, min(1024 * 1024, remaining))
            if not chunk:
                raise RuntimeError(f"release_artifact_short_read:{path_value}")
            chunks.append(chunk)
            remaining -= len(chunk)
        return b"".join(chunks)
    finally:
        if descriptor is not None:
            os.close(descriptor)
        for opened_fd in reversed(opened):
            os.close(opened_fd)


def safe_write(path_value: Path, value: bytes) -> None:
    parent, opened, basename = secure_parent(path_value, create=True)
    temporary = f".{basename}.{token_hex(24)}.tmp"
    descriptor = None
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600, dir_fd=parent)
        remaining = memoryview(value)
        while remaining:
            remaining = remaining[os.write(descriptor, remaining):]
        os.fsync(descriptor)
        os.close(descriptor)
        descriptor = None
        os.rename(temporary, basename, src_dir_fd=parent, dst_dir_fd=parent)
        os.fsync(parent)
    finally:
        if descriptor is not None:
            os.close(descriptor)
        try:
            os.unlink(temporary, dir_fd=parent)
        except FileNotFoundError:
            pass
        for opened_fd in reversed(opened):
            os.close(opened_fd)


def bounded_response_bytes(response, maximum: int = MAX_HTTP_JSON_BYTES) -> bytes:
    declared = response.headers.get("content-length")
    if declared is not None and (not declared.isdigit() or int(declared) > maximum):
        raise RuntimeError("browser_certification_http_response_too_large")
    value = response.read(maximum + 1)
    if len(value) > maximum:
        raise RuntimeError("browser_certification_http_response_too_large")
    return value


def assert_loopback_url(url: str) -> None:
    parsed = urlsplit(url)
    if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise RuntimeError("browser_certification_non_loopback_redirect_rejected")


class LoopbackRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, request, file_pointer, code, message, headers, new_url):
        assert_loopback_url(new_url)
        return super().redirect_request(request, file_pointer, code, message, headers, new_url)


def read_json(url: str) -> dict:
    assert_loopback_url(url)
    with build_opener(LoopbackRedirectHandler()).open(url, timeout=15) as response:  # noqa: S310 - loopback certification only
        if "json" not in str(response.headers.get("content-type") or "").lower():
            raise RuntimeError("browser_certification_http_content_type_invalid")
        return json.loads(bounded_response_bytes(response).decode("utf-8"))


def read_ui_headers() -> dict[str, str]:
    with build_opener(LoopbackRedirectHandler()).open(f"{UI}/#/overview", timeout=15) as response:  # noqa: S310 - loopback certification only
        return {key.lower(): value for key, value in response.headers.items()}


def access_token() -> str:
    value = os.environ.get("VIGIA_OPERATOR_ACCESS_TOKEN", "").strip()
    if not value and ACCESS_TOKEN_FILE.exists():
        descriptor = os.open(ACCESS_TOKEN_FILE, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        try:
            metadata = os.fstat(descriptor)
            if not stat.S_ISREG(metadata.st_mode) or metadata.st_size > 4096:
                raise RuntimeError("operator_console_access_token_file_invalid")
            value = os.read(descriptor, 4096).decode("utf-8").strip()
        finally:
            os.close(descriptor)
    if not value:
        raise RuntimeError("operator_console_access_token_unavailable")
    return value


def one_time_admission(token: str) -> str:
    issued_at = int(time())
    claim = {"v": 1, "aud": "vigia-operator-console", "nonce": token_hex(24), "iat": issued_at, "exp": issued_at + 60}
    payload = base64.urlsafe_b64encode(json.dumps(claim, separators=(",", ":")).encode()).decode().rstrip("=")
    signature = base64.urlsafe_b64encode(hmac.new(token.encode(), f"operator-console-one-time-admission-v1\0{payload}".encode(), hashlib.sha256).digest()).decode().rstrip("=")
    return f"{payload}.{signature}"


def verify_listener(token: str, operator_identity: dict) -> None:
    challenge = token_hex(32)
    proof = read_json(f"{UI}/__operator/prove?challenge={challenge}")
    material = "\0".join(("operator-console-listener-proof-v1", challenge, str(operator_identity.get("releaseId") or ""), str(operator_identity.get("codeStateHash") or ""), str(operator_identity.get("assetDigest") or "")))
    expected = hmac.new(token.encode(), material.encode(), hashlib.sha256).hexdigest()
    if proof.get("schemaVersion") != "vigia.operator-listener-proof.v1" or proof.get("challenge") != challenge or not hmac.compare_digest(str(proof.get("proof") or ""), expected):
        raise RuntimeError("operator_console_listener_proof_failed")


def read_admitted_json(url: str, token: str) -> dict:
    assert_loopback_url(url)
    opener = build_opener(LoopbackRedirectHandler(), HTTPCookieProcessor(CookieJar()))
    opener.open(f"{UI}/?admission={quote(one_time_admission(token), safe='')}", timeout=15).close()  # noqa: S310 - loopback admission
    request = Request(url, headers={"Sec-Fetch-Site": "same-origin"})  # noqa: S310 - fixed loopback URL
    with opener.open(request, timeout=15) as response:  # noqa: S310 - loopback certification only
        if "json" not in str(response.headers.get("content-type") or "").lower():
            raise RuntimeError("browser_certification_http_content_type_invalid")
        return json.loads(bounded_response_bytes(response).decode("utf-8"))


def cdp_available(url: str = CDP_URL) -> bool:
    try:
        return read_json(f"{url}/json/version").get("Protocol-Version") == "1.3"
    except Exception:
        return False


def locked_file_digest(path_value: Path, expected_bytes: int) -> str:
    descriptor = os.open(path_value, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_size != expected_bytes:
            raise RuntimeError("browser_certification_browser_file_invalid")
        hasher = hashlib.sha256()
        remaining = metadata.st_size
        while remaining:
            chunk = os.read(descriptor, min(1024 * 1024, remaining))
            if not chunk:
                raise RuntimeError("browser_certification_browser_file_changed")
            hasher.update(chunk)
            remaining -= len(chunk)
        return "sha256:" + hasher.hexdigest()
    finally:
        os.close(descriptor)


def launch_owned_browser(browser_runtime: dict) -> dict:
    if not BROWSER_EXECUTABLE or not BROWSER_EXECUTABLE_SHA256.startswith("sha256:") or not re.fullmatch(r"[a-f0-9]{48}", BROWSER_PROFILE_NONCE):
        raise RuntimeError("browser_certification_locked_browser_required")
    executable = Path(BROWSER_EXECUTABLE)
    actual_digest = locked_file_digest(executable, int(browser_runtime.get("bytes") or 0))
    if not hmac.compare_digest(actual_digest, BROWSER_EXECUTABLE_SHA256):
        raise RuntimeError("browser_certification_browser_lock_mismatch")
    for asset in browser_runtime.get("assets") or []:
        relative_asset = Path(str(asset.get("name") or ""))
        asset_path = executable.parent / relative_asset
        if relative_asset.is_absolute() or ".." in relative_asset.parts or not hmac.compare_digest(locked_file_digest(asset_path, int(asset.get("bytes") or 0)), str(asset.get("sha256") or "")):
            raise RuntimeError("browser_certification_browser_asset_lock_mismatch")
    profile = ROOT / ".tmp/browser" / f"certifier-profile-{BROWSER_PROFILE_NONCE}"
    secure_directory(profile)
    process = subprocess.Popen([
        str(executable), "--headless=new", "--no-sandbox", "--no-zygote", "--single-process", "--disable-gpu",
        "--disable-background-networking", "--disable-component-update", "--disable-default-apps", "--disable-extensions",
        "--disable-sync", "--metrics-recording-only", "--no-first-run", "--no-default-browser-check",
        "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", f"--user-data-dir={profile}", "about:blank",
    ], cwd=ROOT, env={key: value for key, value in {"PATH": "/usr/bin:/bin:/usr/sbin:/sbin", "HOME": os.environ.get("HOME", ""), "TMPDIR": os.environ.get("TMPDIR", ""), "LANG": os.environ.get("LANG", "C.UTF-8")}.items() if value}, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    active_port = profile / "DevToolsActivePort"
    endpoint = None
    for _ in range(300):
        if process.poll() is not None:
            raise RuntimeError(f"browser_certification_browser_exited:{process.returncode}")
        try:
            lines = safe_read(active_port, 4096).decode().splitlines()
            if lines and lines[0].isdigit():
                endpoint = f"http://127.0.0.1:{int(lines[0])}"
                if cdp_available(endpoint):
                    break
        except (FileNotFoundError, RuntimeError, OSError):
            pass
        sleep(0.1)
    if not endpoint or not cdp_available(endpoint):
        process.terminate()
        raise RuntimeError("browser_certification_owned_cdp_unavailable")
    owned = {"process": process, "profile": profile, "endpoint": endpoint, "pid": process.pid, "profileNonce": BROWSER_PROFILE_NONCE, "executableSha256": actual_digest}
    atexit.register(stop_owned_browser, owned)
    return owned


def stop_owned_browser(owned: dict) -> None:
    process = owned.get("process")
    if process and process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
    profile = owned.get("profile")
    if profile:
        shutil.rmtree(profile, ignore_errors=True)


def terminate_producer(_signal_number, _frame) -> None:
    raise SystemExit(128)


signal.signal(signal.SIGTERM, terminate_producer)
signal.signal(signal.SIGINT, terminate_producer)


def wait_ready(page: Page) -> None:
    ready = page.locator(".backend-state.is-ready").filter(has_text="ready")
    ready.first.wait_for(state="attached", timeout=60_000)
    if (page.viewport_size or {}).get("width", 0) > 1080:
        assert ready.first.is_visible(), "desktop_backend_ready_state_hidden"
    assert page.locator("#app").get_attribute("data-ui-version") == "2.1.0"


def route(page: Page, name: str, ready: bool = True) -> float:
    started = perf_counter()
    page.locator(f"[data-route='{name}']").first.click()
    page.wait_for_url(f"{UI}/#/{name}", timeout=20_000)
    page.locator(f".route--{name}").first.wait_for(state="visible", timeout=20_000)
    if ready:
        wait_ready(page)
    return round((perf_counter() - started) * 1000, 3)


def assert_view(page: Page, label: str) -> dict:
    measurements = page.evaluate(r"""() => ({
      overflow: Math.max(0, document.documentElement.scrollWidth-window.innerWidth),
      main: Boolean(document.querySelector('main#main-content')),
      nav: Boolean(document.querySelector('aside.sidebar')),
      buttons: [...document.querySelectorAll('button')].filter(x => x.offsetParent !== null).length,
      fixtureImages: [...document.images].map(x => x.getAttribute('src')||'').filter(x => /assets\/(maps|fleet|evidence)|fixture/i.test(x)),
      fakeResources: /Engine 1|Alpha Two|Canyon Ridge|Pinecrest/.test(document.body.innerText),
      routeNotFound: /route not found/i.test(document.body.innerText),
    })""")
    assert measurements["overflow"] <= 1, f"horizontal_overflow:{label}:{measurements}"
    assert measurements["main"] and measurements["nav"] and measurements["buttons"] > 0, measurements
    assert not measurements["fixtureImages"] and not measurements["fakeResources"], measurements
    assert not measurements["routeNotFound"], measurements
    return measurements


def capture(page: Page, manifest: dict, number: int, slug: str, cases: list[dict], note: str) -> None:
    checks = assert_view(page, slug)
    target = SHOTS / f"{number:02d}-{slug}.png"
    screenshot_bytes = page.screenshot(full_page=False)
    safe_write(target, screenshot_bytes)
    screenshot_digest = f"sha256:{hashlib.sha256(screenshot_bytes).hexdigest()}"
    cases.append({
        "case": number, "state": "PASS", "viewState": slug, "note": note, "viewport": page.viewport_size,
        "horizontalOverflowPx": checks["overflow"], "screenshot": str(target.relative_to(ROOT)),
        "screenshotSha256": screenshot_digest, "releaseId": manifest["releaseId"],
        "codeStateHash": manifest["codeStateHash"],
        "frontend": {**FRONTEND, "sourceHash": manifest["canonicalOperatorConsole"]["sourceHash"]},
    })


def built_asset_entries() -> list[tuple[str, bytes]]:
    dist = ROOT / "apps/operator-console/dist"
    files: list[Path] = []
    entries_seen = 0
    def visit(directory: Path, depth: int = 0) -> None:
        nonlocal entries_seen
        if depth > MAX_DIST_DEPTH:
            raise RuntimeError("operator_asset_depth_exceeded")
        for item in os.scandir(directory):
            entries_seen += 1
            if entries_seen > MAX_DIST_ENTRIES:
                raise RuntimeError("operator_asset_entry_count_exceeded")
            metadata = item.stat(follow_symlinks=False)
            target = Path(item.path)
            if stat.S_ISLNK(metadata.st_mode):
                raise RuntimeError(f"operator_asset_symlink_forbidden:{target.relative_to(dist)}")
            if stat.S_ISDIR(metadata.st_mode):
                visit(target, depth + 1)
            elif stat.S_ISREG(metadata.st_mode) and item.name != "build-manifest.json":
                files.append(target)
                if len(files) > MAX_DIST_FILES:
                    raise RuntimeError("operator_asset_file_count_exceeded")
            elif not stat.S_ISREG(metadata.st_mode):
                raise RuntimeError(f"operator_asset_entry_invalid:{target.relative_to(dist)}")
    visit(dist)
    entries: list[tuple[str, bytes]] = []
    total = 0
    for file in sorted(files):
        value = safe_read(file, MAX_DIST_FILE_BYTES)
        total += len(value)
        if total > MAX_DIST_BYTES:
            raise RuntimeError("operator_asset_aggregate_bytes_exceeded")
        entries.append((file.relative_to(dist).as_posix(), value))
    return entries


def asset_digest(entries: list[tuple[str, bytes]]) -> str:
    material = [f"{relative}\0sha256:{hashlib.sha256(value).hexdigest()}" for relative, value in entries]
    return f"sha256:{hashlib.sha256(chr(10).join(material).encode()).hexdigest()}"


def remote_asset_identity(expected_entries: list[tuple[str, bytes]]) -> dict:
    remote_entries: list[tuple[str, bytes]] = []
    total = 0
    opener = build_opener(LoopbackRedirectHandler())
    for relative, _expected in expected_entries:
        url = f"{UI}/{quote(relative, safe='/')}"
        assert_loopback_url(url)
        request = Request(url, headers={"Cache-Control": "no-cache"})  # noqa: S310 - fixed loopback URL
        with opener.open(request, timeout=15) as response:  # noqa: S310 - loopback certification only
            value = bounded_response_bytes(response, MAX_DIST_FILE_BYTES)
        total += len(value)
        if total > MAX_DIST_BYTES:
            raise RuntimeError("operator_remote_asset_aggregate_bytes_exceeded")
        remote_entries.append((relative, value))
    return {"assetDigest": asset_digest(remote_entries), "files": len(remote_entries), "bytes": total}


def select_event(page: Page, index: int) -> tuple[str, str | None, float]:
    drawer = page.locator(".detect-drawer-layer")
    if "is-open" not in (drawer.get_attribute("class") or ""):
        page.locator("[data-action='toggle-detect-queue']").first.click()
        page.locator(".detect-drawer-layer.is-open").wait_for(state="visible")
    row = page.locator(".detect-drawer .detection-row").nth(index)
    label = row.locator("strong").inner_text().strip()
    event_id = (row.get_attribute("data-action") or "").split(":", 1)[-1]
    started = perf_counter()
    row.click()
    page.locator(".workspace-header h2").filter(has_text=label).wait_for(timeout=30_000)
    selected_map = page.get_by_role("group", name=f"Real satellite context for {label}", exact=True)
    selected_map.wait_for(state="visible", timeout=30_000)
    assert page.evaluate("JSON.parse(localStorage.getItem('vigia-mission-dark-state-v2')).selectedEventId") == event_id
    latency = round((perf_counter() - started) * 1000, 3)
    center = selected_map.get_attribute("data-map-center")
    return label, center, latency


def assert_nav_scope(page: Page) -> None:
    primary = page.locator(".sidebar__nav--primary .nav-link").evaluate_all("els => els.map(el => el.getAttribute('aria-label'))")
    utility = page.locator(".sidebar__nav--utility .nav-link").evaluate_all("els => els.map(el => el.getAttribute('aria-label'))")
    routes = set(page.locator("[data-route]").evaluate_all("els => els.map(el => el.dataset.route)"))
    assert primary == PRIMARY_NAV, primary
    assert utility == UTILITY_NAV, utility
    assert not routes.intersection(PROHIBITED_ROUTES), routes


def assert_touch_targets(page: Page, label: str) -> dict:
    result = page.evaluate(r"""() => {
      const candidates=[...document.querySelectorAll('.topbar__menu,.nav-link,button.button,.icon-button,.detection-row,input[type=range]')]
        .filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
      const measured=candidates.map(el=>{const r=el.getBoundingClientRect();return {tag:el.tagName,label:(el.getAttribute('aria-label')||el.textContent||'').trim().slice(0,60),width:r.width,height:r.height}});
      return {count:measured.length,minimum:measured.reduce((min,item)=>Math.min(min,item.height),Infinity),failures:measured.filter(item=>item.height<43.5)};
    }""")
    assert result["count"] > 0 and not result["failures"], f"undersized_targets:{label}:{result}"
    return result


def certify_mobile_nav(page: Page) -> None:
    toggle = page.locator("button[data-action='toggle-nav']")
    sidebar = page.locator("#primary-navigation")
    assert toggle.get_attribute("aria-expanded") == "false"
    assert sidebar.get_attribute("aria-hidden") == "true" and sidebar.get_attribute("inert") is not None
    toggle.click()
    assert toggle.get_attribute("aria-expanded") == "true"
    assert sidebar.get_attribute("aria-hidden") == "false" and sidebar.get_attribute("inert") is None
    expect(sidebar.locator(".nav-link").first).to_be_focused(timeout=5_000)
    page.keyboard.press("Escape")
    assert toggle.get_attribute("aria-expanded") == "false"
    expect(toggle, "mobile_nav_focus_not_restored").to_be_focused(timeout=5_000)


def intelligence_probe(page: Page) -> dict:
    return page.evaluate(r"""async () => {
      const timed=async path=>{const started=performance.now(),response=await fetch(`/backend${path}`,{cache:'no-store'}),body=await response.json();if(!response.ok)throw new Error(`intelligence_probe_${response.status}:${path}`);return {body,durationMs:performance.now()-started}};
      const inbox=await timed('/api/v10/intelligence/inbox?limit=5'),ids=inbox.body.items.map(item=>item.incidentId).slice(0,5),details=[];
      for(const id of ids){await timed(`/api/v10/intelligence/incidents/${encodeURIComponent(id)}`);details.push(await timed(`/api/v10/intelligence/incidents/${encodeURIComponent(id)}`));}
      const secondInbox=await timed('/api/v10/intelligence/inbox?limit=5');return {inbox:secondInbox.body,inboxDurationMs:secondInbox.durationMs,details:details.map(item=>item.body),cachedHttpMs:details.map(item=>item.durationMs)};
    }""")


def rehearsal_boundary_probe(page: Page, base: dict) -> dict:
    return page.evaluate(r"""async base => {
      const {evidenceIntelligence}=await import('/src/intelligenceView.js?v=2.1.0'),results={};
      const definitions=[
        ['REPORT_ONLY_INCIDENT',{supportingEvidence:['rehearsal:report:1'],contradictoryEvidence:[],excludedEvidence:[]}],
        ['SINGLE_FAMILY_PHYSICAL_SIGNAL',{supportingEvidence:['rehearsal:physical:family-a'],contradictoryEvidence:[],excludedEvidence:[]}],
        ['STALE_PHYSICAL_EVIDENCE',{supportingEvidence:[],contradictoryEvidence:[],excludedEvidence:[{id:'rehearsal:stale:1',reason:'STALE'}]}],
        ['PHYSICAL_REPORT_CONFLICT',{supportingEvidence:['rehearsal:physical:1'],contradictoryEvidence:['rehearsal:contradiction:1'],excludedEvidence:[]}]
      ];
      for(const [state,evidence] of definitions){
        const id=`rehearsal:${state.toLowerCase()}`,projection=structuredClone(base),unknown={id:`${id}:unknown`,classification:'DECISION_BLOCKING',whatIsUnknown:'Independent corroboration',strongerClaimBlocked:'MULTI FAMILY PHYSICAL SUPPORT',reason:'Controlled rehearsal lineage'},candidate={rank:1,candidateId:`${id}:candidate`,candidateEvidenceType:'CONFIRMED_PROVIDER_PRODUCT',eligibleSource:'rehearsal_independent_family',availabilityState:'CONFIRMED_SOURCE_OPPORTUNITY',addressesUnknown:unknown.whatIsUnknown};
        Object.assign(projection,{incidentId:id,mode:'REHEARSAL',projectionState:'CURRENT',snapshotVersion:`${id}:snapshot`,situation:{...(projection.situation||{}),state,underlyingState:state,operatorStatement:`Controlled rehearsal: ${state.replaceAll('_',' ').toLowerCase()}.`},unknowns:[unknown],nextBestEvidence:{...(projection.nextBestEvidence||{}),state:'ELIGIBLE_EVIDENCE_OPTIONS',candidates:[candidate],automaticTaskCreated:false},explanationTrace:{...(projection.explanationTrace||{}),conclusion:state,operatorCopy:`Controlled rehearsal: ${state.replaceAll('_',' ').toLowerCase()}.`,...evidence}});
        const host=document.createElement('div');host.dataset.certification='CONTROLLED_REHEARSAL_DOM_RENDER';host.innerHTML=evidenceIntelligence({runtime:{intelligenceIncidents:{[id]:projection}},session:{mutationReady:false}}, {id});document.body.append(host);const text=host.innerText.toUpperCase();
        results[state]={stateVisible:text.includes(state.replaceAll('_',' ')),supporting:evidence.supportingEvidence.every(value=>text.includes(value.toUpperCase())),contradictory:evidence.contradictoryEvidence.every(value=>text.includes(value.toUpperCase())),excluded:evidence.excludedEvidence.every(value=>text.includes(value.id.toUpperCase())&&text.includes(value.reason)),unknownLineage:text.includes('INDEPENDENT CORROBORATION')&&text.includes('MULTI FAMILY PHYSICAL SUPPORT'),eligibleCandidate:text.includes('REHEARSAL INDEPENDENT FAMILY')&&text.includes('CONFIRMED SOURCE OPPORTUNITY')};host.remove();
      }
      return results;
    }""", base)


def scenario(rows: list[dict], number: int, name: str, evidence: dict) -> None:
    rows.append({"scenario": number, "name": name, "state": "PASS", "evidence": evidence})


def main() -> int:
    global ATTESTATION_KEY, RUN_NONCE, CDP_URL
    if QA_MODE != "development":
        if os.environ.get("VIGIA_BROWSER_CERTIFICATION_CHANNEL") != "STDIN_V1":
            raise RuntimeError("browser_certification_trusted_orchestrator_required")
        channel = sys.stdin.readline(4097)
        if not channel or len(channel) > 4096:
            raise RuntimeError("browser_certification_channel_invalid")
        secret = json.loads(channel)
        ATTESTATION_KEY = str(secret.get("attestationKey") or "")
        RUN_NONCE = str(secret.get("runNonce") or "")
    if QA_MODE != "development" and (len(ATTESTATION_KEY) < 43 or len(RUN_NONCE) != 64 or any(character not in "0123456789abcdef" for character in RUN_NONCE)):
        raise RuntimeError("browser_certification_ephemeral_attestation_required")
    if QA_MODE == "development" and not cdp_available():
        raise RuntimeError(f"cdp_browser_unavailable:{CDP_URL}")
    token = access_token()
    backend_identity = read_json(f"{BACKEND}/api/v10/release")
    operator_identity = read_json(f"{UI}/__operator/ready")
    verify_listener(token, operator_identity)
    proxied_identity = read_admitted_json(f"{UI}/backend/api/v10/release", token)
    manifest = ({**backend_identity, "canonicalOperatorConsole": {"path": FRONTEND["path"], "origin": UI, "sourceHash": operator_identity.get("sourceHash")}}
                if QA_MODE == "development" else json.loads(safe_read(MANIFEST, MAX_HTTP_JSON_BYTES).decode("utf-8")))
    assert backend_identity["releaseId"] == manifest["releaseId"] == proxied_identity["releaseId"]
    assert backend_identity["codeStateHash"] == manifest["codeStateHash"] == proxied_identity["codeStateHash"]
    assert manifest.get("canonicalOperatorConsole", {}).get("path") == FRONTEND["path"]
    assert manifest.get("canonicalOperatorConsole", {}).get("origin") == UI
    expected_source_hash = manifest.get("canonicalOperatorConsole", {}).get("sourceHash")
    if QA_MODE != "development":
        assert operator_identity.get("releaseId") == manifest["releaseId"]
        assert operator_identity.get("codeStateHash") == manifest["codeStateHash"]
        assert operator_identity.get("sourceHash") == expected_source_hash
    expected_asset_entries = built_asset_entries()
    expected_asset_digest = asset_digest(expected_asset_entries)
    remote_assets = remote_asset_identity(expected_asset_entries)
    assert str(operator_identity.get("assetDigest", "")).startswith("sha256:")
    assert operator_identity.get("assetDigest") == expected_asset_digest, "operator_asset_digest_mismatch"
    assert remote_assets["assetDigest"] == expected_asset_digest, "operator_remote_asset_digest_mismatch"
    assert operator_identity.get("servedAssetFiles") == remote_assets["files"], "operator_remote_asset_file_count_mismatch"
    assert operator_identity.get("servedAssetBytes") == remote_assets["bytes"], "operator_remote_asset_byte_count_mismatch"
    frontend_identity = {**FRONTEND, "sourceHash": operator_identity.get("sourceHash"), "assetDigest": operator_identity.get("assetDigest")}
    headers = read_ui_headers()
    csp = headers.get("content-security-policy", "")
    for directive in ("default-src 'self'", "base-uri 'none'", "object-src 'none'", "frame-ancestors 'none'", "form-action 'self'", "script-src 'self'", "connect-src 'self'"):
        assert directive in csp, f"csp_directive_missing:{directive}:{csp}"
    assert "unsafe-eval" not in csp and "http:" not in csp and "https:" not in csp
    secure_directory(SHOTS)
    secure_directory(OUT.parent)
    cases: list[dict] = []
    console_errors: list[str] = []
    bad_responses: list[dict] = []
    expected_injections: set[str] = set()
    route_timings: list[float] = []
    event_timings: list[float] = []
    touch_results: list[dict] = []
    intelligence_scenarios: list[dict] = []
    intelligence_measurements: dict = {}
    prevention_visual_state = "NOT_EXERCISED"

    browser_version = "unknown"
    owned_browser = None
    browser_runtime = None
    if QA_MODE != "development":
        browser_runtime = json.loads(os.environ.get("VIGIA_BROWSER_RUNTIME_JSON", "null"))
        if not isinstance(browser_runtime, dict) or browser_runtime.get("sha256") != BROWSER_EXECUTABLE_SHA256:
            raise RuntimeError("browser_certification_browser_runtime_invalid")
        owned_browser = launch_owned_browser(browser_runtime)
        CDP_URL = owned_browser["endpoint"]
    playwright = sync_playwright().start()
    try:
        browser = playwright.chromium.connect_over_cdp(CDP_URL)
        browser_version = browser.version
        if not browser.contexts:
            raise RuntimeError("cdp_browser_has_no_context")
        context = browser.contexts[0]
        page = context.new_page()
        page.set_viewport_size({"width": 1440, "height": 900})
        page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
        page.on("pageerror", lambda error: console_errors.append(str(error)))
        page.on("response", lambda response: bad_responses.append({"status": response.status, "url": response.url}) if response.status >= 400 and response.url.startswith(UI) else None)
        page.goto(f"{UI}/?admission={quote(one_time_admission(token), safe='')}", wait_until="domcontentloaded")
        page.goto(f"{UI}/#/overview", wait_until="domcontentloaded")
        wait_ready(page)
        original_storage = page.evaluate("localStorage.getItem('vigia-mission-dark-state-v2')")
        assert_nav_scope(page)
        navigation = page.evaluate("performance.getEntriesByType('navigation')[0]?.duration ?? null")
        page.locator(".intelligence-inbox").wait_for(state="visible", timeout=30_000)
        page.locator(".intelligence-attention").first.wait_for(state="visible", timeout=30_000)
        probe = intelligence_probe(page)
        inbox, details = probe["inbox"], probe["details"]
        assert inbox["schemaVersion"] == "vigia.intelligence-inbox.v1" and len(inbox["items"]) <= 5
        assert inbox["primaryLimit"] == 5 and inbox["runtime"]["noIdleInference"] is True
        assert inbox["runtime"]["modelCalls"] == 0 and inbox["runtime"]["autonomousAgents"] == 0
        assert details and all(item["ontologyVersion"] == manifest["contracts"]["ontologyContractVersion"] for item in details)
        assert all(item["ruleSetVersion"] == manifest["contracts"]["intelligenceRuleSetVersion"] for item in details)
        assert all(item["attention"]["score"] is None and item["attention"]["probability"] is None for item in details)
        assert all(item["intelligenceIsEvidence"] is False and item["automaticHumanDecision"] is False for item in details)
        internal_cached = [item.get("computation", {}).get("durationMs") for item in details if item.get("computation", {}).get("state") == "CACHED"]
        assert internal_cached and max(internal_cached) < 25, internal_cached
        assert probe["inboxDurationMs"] < 100, probe["inboxDurationMs"]
        intelligence_measurements = {"cachedProjectionMaximumMs": max(internal_cached), "cachedHttpMeasurementsMs": probe["cachedHttpMs"], "inboxHttpMs": probe["inboxDurationMs"], "projectionP95Ms": inbox["runtime"]["timings"]["projectionP95Ms"]}
        if intelligence_measurements["projectionP95Ms"] is not None:
            assert intelligence_measurements["projectionP95Ms"] < 75, intelligence_measurements
        scenario(intelligence_scenarios,1,"Overview Intelligence Inbox",{"items":len(inbox["items"]),"schemaVersion":inbox["schemaVersion"]})
        scenario(intelligence_scenarios,2,"Top-five attention ordering",{"tiers":[item["attention"]["tier"] for item in inbox["items"]],"primaryLimit":inbox["primaryLimit"]})
        capture(page, manifest, 1, "overview-truth-first", cases, "Overview exposes physical truth, attention, evidence gaps, and governed map state.")

        route_timings.append(route(page, "detect"))
        page.locator(".detection-row").nth(2).wait_for(state="attached", timeout=30_000)
        rows = page.locator(".detection-row")
        assert rows.count() >= 3, f"three_real_portugal_events_required:{rows.count()}"
        labels = rows.locator("strong").all_inner_texts()
        assert len(set(labels[:3])) == 3 and not any("Spain" in value for value in labels), labels[:10]
        scenario(intelligence_scenarios,3,"Three real Portugal incidents",{"labels":labels[:3],"synthetic":False})
        page.locator("[data-action='toggle-detect-queue']").first.click()
        queue = page.locator("[data-scroll-key='detect-queue']")
        queue.evaluate("node => { node.scrollTop=Math.min(96, Math.max(0,node.scrollHeight-node.clientHeight)); }")
        scroll_before = queue.evaluate("node => node.scrollTop")
        _, _, latency = select_event(page, 2)
        event_timings.append(latency)
        page.locator("[data-action='toggle-detect-queue']").first.click()
        scroll_after = queue.evaluate("node => node.scrollTop")
        assert scroll_after == scroll_before, f"detect_scroll_not_preserved:{scroll_before}:{scroll_after}"
        first, center_first, latency = select_event(page, 0)
        event_timings.append(latency)
        capture(page, manifest, 2, "detect-first-event", cases, "First real Portugal event selected with canonical map context.")
        second, center_second, latency = select_event(page, 1)
        event_timings.append(latency)
        capture(page, manifest, 3, "detect-second-event", cases, "Second real event changes incident and map context.")
        third, center_third, latency = select_event(page, 2)
        event_timings.append(latency)
        assert len({first, second, third}) == 3 and len({center_first, center_second, center_third}) == 3
        selected_id = page.evaluate("JSON.parse(localStorage.getItem('vigia-mission-dark-state-v2')).selectedEventId")
        if not any(item["incidentId"] == selected_id for item in details):
            selected_detail = page.evaluate(r"""async id => {
              const response=await fetch(`/backend/api/v10/intelligence/incidents/${encodeURIComponent(id)}`,{cache:'no-store'}),body=await response.json();
              if(!response.ok)throw new Error(`selected_intelligence_${response.status}`);return body;
            }""", selected_id)
            assert selected_detail["ontologyVersion"] == manifest["contracts"]["ontologyContractVersion"]
            assert selected_detail["ruleSetVersion"] == manifest["contracts"]["intelligenceRuleSetVersion"]
            details.append(selected_detail)
        map_area = page.locator(".tile-map").first.bounding_box()
        assert map_area and map_area["width"] * map_area["height"] > 0.20 * 1440 * 900, map_area
        capture(page, manifest, 4, "detect-third-event", cases, "Third real event, persistent selection, and queue scroll retention.")
        page.locator("[data-action='detect-view:detail']").first.click()
        page.locator(".detail-inspector__hero--intelligence").wait_for(state="visible", timeout=30_000)
        detect_values=[]
        for tab in ("now","next","why"):
            page.locator(f"[data-action='detect-detail-tab:{tab}']").click()
            detect_values.append(page.locator(".detail-inspector__body").inner_text())
        assert all(value.strip() for value in detect_values) and len(set(detect_values)) == 3
        assert "WHAT CHANGED" in detect_values[-1].upper() and "DECISION-BLOCKING UNKNOWN" in detect_values[-1].upper()
        scenario(intelligence_scenarios,4,"Incident switching changes intelligence identity",{"incidentIds":[item["incidentId"] for item in details],"uniqueSnapshots":len({item["snapshotVersion"] for item in details})})
        state_counts={name:sum(1 for item in details if item["situation"]["underlyingState"]==name) for name in ["REPORT_ONLY_INCIDENT","SINGLE_FAMILY_PHYSICAL_SIGNAL","STALE_PHYSICAL_EVIDENCE","PHYSICAL_REPORT_CONFLICT"]}
        boundary_probe=rehearsal_boundary_probe(page,details[0])
        assert all(value["stateVisible"] and value["supporting"] and value["contradictory"] and value["excluded"] for value in boundary_probe.values()),boundary_probe
        controlled={"source":"CONTROLLED_REHEARSAL_DOM_RENDER","canonicalTruthMutation":False}
        scenario(intelligence_scenarios,5,"Report-only boundary",{"currentWindow":state_counts["REPORT_ONLY_INCIDENT"],"policy":"reports never become physical observations","render":boundary_probe["REPORT_ONLY_INCIDENT"],**controlled})
        scenario(intelligence_scenarios,6,"Single-family corroboration boundary",{"currentWindow":state_counts["SINGLE_FAMILY_PHYSICAL_SIGNAL"],"familyCounts":[len(item["situation"]["why"]["independentPhysicalFamilies"]) for item in details],"render":boundary_probe["SINGLE_FAMILY_PHYSICAL_SIGNAL"],**controlled})
        scenario(intelligence_scenarios,7,"Stale evidence exclusion",{"currentWindow":state_counts["STALE_PHYSICAL_EVIDENCE"],"excluded":sum(len(item["explanationTrace"]["excludedEvidence"]) for item in details),"render":boundary_probe["STALE_PHYSICAL_EVIDENCE"],**controlled})
        scenario(intelligence_scenarios,8,"Contradictory evidence visibility",{"currentWindow":state_counts["PHYSICAL_REPORT_CONFLICT"],"contradictionIds":sum(len(item["explanationTrace"]["contradictoryEvidence"]) for item in details),"render":boundary_probe["PHYSICAL_REPORT_CONFLICT"],**controlled})
        assert boundary_probe["SINGLE_FAMILY_PHYSICAL_SIGNAL"]["unknownLineage"] and boundary_probe["SINGLE_FAMILY_PHYSICAL_SIGNAL"]["eligibleCandidate"]
        scenario(intelligence_scenarios,9,"Decision-blocking unknown lineage",{"currentUnknowns":sum(len([u for u in item["unknowns"] if u["classification"]=="DECISION_BLOCKING"]) for item in details),"render":boundary_probe["SINGLE_FAMILY_PHYSICAL_SIGNAL"],**controlled})
        scenario(intelligence_scenarios,10,"Eligible next-best evidence only",{"currentCandidates":sum(len(item["nextBestEvidence"]["candidates"]) for item in details),"automaticTasks":sum(1 for item in details if item["nextBestEvidence"]["automaticTaskCreated"]),"render":boundary_probe["SINGLE_FAMILY_PHYSICAL_SIGNAL"],**controlled})
        assert all(item["nextBestEvidence"]["automaticTaskCreated"] is False for item in details)

        route_timings.append(route(page, "evidence"))
        page.locator(".evidence-route .route-heading h2").filter(has_text=third).wait_for(timeout=25_000)
        assert page.evaluate("JSON.parse(localStorage.getItem('vigia-mission-dark-state-v2')).selectedEventId") == selected_id
        page.locator(".intelligence-inspection").wait_for(state="visible", timeout=25_000)
        assert "NOT REACHED · DURATION UNAVAILABLE" in page.locator(".intelligence-inspection").inner_text().upper()
        trace=page.locator("details[data-intelligence-instrument='EXPLANATION_TRACE_OPENED']").first
        trace.locator("summary").click()
        supporting=trace.locator("code").all_inner_texts()
        expected_ids=next(item for item in details if item["incidentId"]==selected_id)["explanationTrace"]["supportingEvidence"]
        assert set(expected_ids).issubset(set(supporting)), {"expected":expected_ids,"visible":supporting}
        scenario(intelligence_scenarios,12,"TDT unavailable is not zero",{"unreached":sum(1 for item in next(row for row in details if row["incidentId"]==selected_id)["timeToDefensibleTruth"]["stages"] if item["timestamp"] is None)})
        scenario(intelligence_scenarios,13,"Decision delta provenance",{"types":sorted({delta["type"] for item in details for delta in item["decisionDelta"]})})
        scenario(intelligence_scenarios,14,"Evidence trace source identity",{"supportingEvidenceIds":expected_ids,"visibleIds":supporting})
        capture(page, manifest, 5, "evidence-selected-event", cases, "The selected event reaches attributable physical evidence without mixing public reports.")
        route_timings.append(route(page, "shift-handoff"))
        page.locator(".handoff-map h3").filter(has_text=third).wait_for(timeout=25_000)
        assert page.locator(".handoff-work article").count() <= 20
        assert page.locator(".intelligence-handoff > article").count() <= 20
        scenario(intelligence_scenarios,16,"Material-only bounded handoff",{"intelligenceEntries":page.locator(".intelligence-handoff > article").count(),"limit":20})
        capture(page, manifest, 6, "handoff-bounded-work", cases, "Handoff preserves selection and caps primary follow-up work at twenty entries.")
        page.go_back(wait_until="domcontentloaded")
        page.locator(".evidence-route .route-heading h2").filter(has_text=third).wait_for(timeout=25_000)
        page.go_forward(wait_until="domcontentloaded")
        page.locator(".handoff-map h3").filter(has_text=third).wait_for(timeout=25_000)

        route_timings.append(route(page, "prevent"))
        comparator_stage = page.locator("[data-compare-stage]")
        preview_unavailable = page.get_by_text("Scene metadata present, preview unavailable", exact=True)
        comparator_stage.or_(preview_unavailable).first.wait_for(timeout=40_000)
        if comparator_stage.count():
            compare = page.locator("[data-prevent-compare]")
            compare.focus()
            compare.evaluate("node => { node.value='20'; node.dispatchEvent(new Event('input',{bubbles:true})); }")
            assert page.locator("[data-compare-output]").inner_text() == "20%"
            compare.evaluate("node => { node.value='80'; node.dispatchEvent(new Event('input',{bubbles:true})); }")
            assert page.locator("[data-compare-output]").inner_text() == "80%"
            box = comparator_stage.bounding_box()
            assert box
            page.mouse.move(box["x"] + box["width"] * 0.25, box["y"] + box["height"] * 0.5)
            page.mouse.down()
            page.mouse.move(box["x"] + box["width"] * 0.72, box["y"] + box["height"] * 0.5, steps=8)
            page.mouse.up()
            assert 68 <= int(compare.input_value()) <= 76
            real_scenes = page.locator(".compare-map--real img.real-scene")
            assert real_scenes.count() >= 2
            for scene_index in range(real_scenes.count()):
                scene = real_scenes.nth(scene_index)
                scene.scroll_into_view_if_needed(timeout=30_000)
                scene.evaluate("image => image.complete ? undefined : image.decode()")
                assert scene.evaluate("image => image.naturalWidth") > 0, scene.get_attribute("src")
            prevention_visual_state = "REAL_SCENE_PAIR"
            prevention_slug = "prevent-real-comparator"
            prevention_note = "Real scene pair, keyboard-safe slider, direct drag, and measurement-required withholding."
        else:
            preview_unavailable.wait_for(timeout=20_000)
            page.get_by_text("VIGIA will not substitute generated imagery.", exact=True).wait_for(timeout=20_000)
            assert page.locator(".compare-map img.real-scene").count() == 0
            prevention_visual_state = "PIXEL_VERIFIED_METADATA_PREVIEW_UNAVAILABLE_NO_SUBSTITUTE"
            prevention_slug = "prevent-preview-unavailable-no-substitute"
            prevention_note = "Pixel-verified scene metadata is retained while unavailable previews are truthfully withheld without generated substitutes."
        measurement_rows = page.locator(".screening-row").filter(has=page.locator(".screening-row__status--measurement"))
        if measurement_rows.count():
            measurement_rows.first.click()
            page.get_by_text("SCREENING ESTIMATES WITHHELD", exact=True).wait_for(timeout=20_000)
            action_bar = page.locator(".prevent-action-bar")
            assert "MEASUREMENT REQUIRED" in action_bar.inner_text().upper()
        assert "NO TREATMENT RECOMMENDATION" in page.locator(".prevent-intelligence").inner_text().upper()
        scenario(intelligence_scenarios,18,"PREVENT remains measurement-safe",{"screening":page.locator(".prevent-intelligence").inner_text()})
        capture(page, manifest, 7, prevention_slug, cases, prevention_note)

        route_timings.append(route(page, "source-health"))
        source_text = page.locator(".source-route").inner_text()
        assert "HEALTHY PROVIDER" in source_text and "NO QUALIFYING OBSERVATION" in source_text
        passport=page.locator("details[data-intelligence-instrument='SOURCE_PASSPORT_OPENED']")
        passport.get_by_text("Measured sample", exact=True).first.wait_for(state="attached", timeout=25_000)
        passport.get_by_text("Missing factors", exact=True).first.wait_for(state="attached", timeout=25_000)
        passport.evaluate("node => { node.open=true; }")
        passport_text=passport.text_content()
        assert "Measured sample" in passport_text and "Missing factors" in passport_text
        scenario(intelligence_scenarios,11,"Healthy provider and zero observation semantics",{"labels":["HEALTHY PROVIDER","NO QUALIFYING OBSERVATION"]})
        scenario(intelligence_scenarios,17,"Contextual source passport limitations",{"hasSample":True,"hasMissingFactors":True})
        capture(page, manifest, 8, "source-health-semantics", cases, "Provider health stays separate from qualifying observation state.")
        page.locator("[data-action='refresh-sources']").click()
        page.locator("[data-action='refresh-sources'][disabled]").wait_for(timeout=10_000)
        page.locator("[data-action='refresh-sources']:not([disabled])").wait_for(timeout=60_000)
        source_pattern = "**/backend/api/v10/events"
        expected_injections.add("/backend/api/v10/events")
        page.route(source_pattern, lambda intercepted: intercepted.fulfill(status=503, content_type="application/json", body='{"error":"controlled_events_failure"}'))
        page.locator("[data-action='refresh-sources']").click()
        page.get_by_text("Source read is PARTIAL or FAILED", exact=False).wait_for(timeout=30_000)
        page.unroute(source_pattern)
        page.locator("[data-action='refresh-sources']").click()
        page.locator("[data-action='refresh-sources'][disabled]").wait_for(timeout=10_000)
        page.locator("[data-action='refresh-sources']:not([disabled])").wait_for(timeout=60_000)
        wait_ready(page)

        route_timings.append(route(page, "fieldnet"))
        page.get_by_text("CENTRAL READ PLANE CURRENT", exact=True).wait_for(timeout=20_000)
        field_pattern = "**/backend/api/v10/fieldnet/status"
        expected_injections.add("/backend/api/v10/fieldnet/status")
        page.route(field_pattern, lambda intercepted: intercepted.fulfill(status=503, content_type="application/json", body='{"error":"controlled_fieldnet_failure"}'))
        page.locator("[data-action='force-sync']").click()
        page.get_by_text("STALE — NOT CURRENT", exact=True).wait_for(timeout=30_000)
        page.unroute(field_pattern)
        page.locator("[data-action='force-sync']").click()
        page.get_by_text("CENTRAL READ PLANE CURRENT", exact=True).wait_for(timeout=30_000)
        capture(page, manifest, 9, "fieldnet-truth-boundary", cases, "Software-only FieldNet continuity and explicit stale-state recovery.")

        route_timings.append(route(page, "replay"))
        scrubber = page.locator("[data-replay-time]")
        scrubber.wait_for(timeout=25_000)
        before = int(scrubber.input_value())
        scrubber.focus()
        scrubber.press("ArrowRight")
        after = int(scrubber.input_value())
        assert after >= before and page.evaluate("document.activeElement?.matches('[data-replay-time]')")
        assert page.locator("[data-replay-time-output]").inner_text() == f"{after}%"
        replay_intelligence=page.locator(".replay-intelligence")
        replay_intelligence.wait_for(state="visible",timeout=25_000)
        assert "WHAT VIGIA KNEW THEN" in replay_intelligence.inner_text().upper() and "HISTORICAL" in replay_intelligence.inner_text().upper()
        scenario(intelligence_scenarios,15,"Hindsight-safe replay",{"panel":replay_intelligence.inner_text()})
        capture(page, manifest, 10, "replay-focus-continuity", cases, "Replay updates without replacing the focused range control.")

        route_timings.append(route(page, "settings"))
        density = page.locator("[data-setting='density']")
        density.select_option(label="Comfortable")
        page.locator("[data-setting='highContrast']").set_checked(True)
        page.locator("[data-setting='reduceMotion']").set_checked(True)
        page.locator("[data-action='save-settings']").click()
        page.reload(wait_until="domcontentloaded")
        wait_ready(page)
        assert page.locator("[data-setting='density']").input_value() == "Comfortable"
        assert page.locator("[data-setting='highContrast']").is_checked()
        assert page.locator("[data-setting='reduceMotion']").is_checked()
        presentation = page.evaluate("({density:document.documentElement.dataset.density,contrast:document.documentElement.dataset.contrast,motion:document.documentElement.dataset.motion})")
        assert presentation == {"density": "comfortable", "contrast": "high", "motion": "reduced"}
        capture(page, manifest, 11, "settings-persistence", cases, "Only visible presentation settings persist and take runtime effect.")

        xss = page.evaluate(r"""async () => {
          const {esc}=await import('/src/components.js?v=2.1.0');
          window.__vigiaXss=0;
          const host=document.createElement('div');
          host.innerHTML=`<section>${esc('<img src=x onerror=window.__vigiaXss=1><svg onload=window.__vigiaXss=2></svg><script>window.__vigiaXss=3</script>')}</section>`;
          document.body.append(host);
          await new Promise(resolve=>setTimeout(resolve,20));
          const result={executed:window.__vigiaXss,dangerous:host.querySelectorAll('img,svg,script').length,text:host.textContent};
          host.remove();delete window.__vigiaXss;return result;
        }""")
        assert xss["executed"] == 0 and xss["dangerous"] == 0 and "<img" in xss["text"], xss

        expected_injections.add("/backend/api/v10/intelligence/inbox")
        route(page, "overview")
        page.locator(".intelligence-attention").first.wait_for(state="visible",timeout=25_000)
        page.wait_for_load_state("networkidle",timeout=30_000)
        intelligence_pattern=re.compile(rf"^{re.escape(UI)}/backend/api/v10/intelligence/inbox(?:\?.*)?$")
        intelligence_injections={"count":0}
        def fail_intelligence(intercepted):
            intelligence_injections["count"]+=1
            intercepted.fulfill(status=503,content_type="application/json",body='{"error":"controlled_intelligence_failure"}')
        page.route(intelligence_pattern,fail_intelligence)
        if page.locator("[data-action='refresh-runtime']").count() == 0:
            route(page, "prevent")
            page.locator(".prevent-workspace").wait_for(state="visible", timeout=30_000)
        page.locator("[data-action='refresh-runtime']").first.click()
        page.locator(".toast").filter(has_text="Canonical VIGIA refreshed").wait_for(state="visible", timeout=30_000)
        assert intelligence_injections["count"] == 1, intelligence_injections
        route(page, "overview")
        page.locator(".intelligence-inbox").get_by_text("STALE",exact=True).wait_for(timeout=30_000)
        assert page.locator(".intelligence-attention").count()>0
        page.unroute(intelligence_pattern,fail_intelligence)
        route(page, "prevent")
        page.locator(".prevent-workspace").wait_for(state="visible", timeout=30_000)
        page.locator("[data-action='refresh-runtime']").first.click()
        page.locator(".toast").filter(has_text="Canonical VIGIA refreshed").wait_for(state="visible", timeout=30_000)
        route(page, "overview")
        page.locator(".intelligence-inbox").get_by_text("READY",exact=True).wait_for(timeout=30_000)
        scenario(intelligence_scenarios,19,"Failed recomputation retains explicit stale state",{"lastGoodVisible":True,"underlyingIncidentAccessible":True})

        map_asset_pattern = re.compile(rf"^{re.escape(UI)}/backend/(?:api/v1/basemap/|api/v10/events/thermal/overlay(?:\?|$)).*")
        expected_injections.update(("/backend/api/v1/basemap/","/backend/api/v10/events/thermal/overlay"))
        map_failures=[]
        def clear_map_cache():
            page.evaluate("""async () => {
              const {clearMapMemoryForRecovery}=await import('/src/map.js?v=2.1.0');
              clearMapMemoryForRecovery();
              if ('caches' in globalThis) for (const name of await caches.keys()) if (name.startsWith('vigia-governed-basemap')) await caches.delete(name);
            }""")
        def assert_no_broken_images(label):
            broken=page.evaluate("""() => [...document.images].filter(image => !image.hidden && image.hasAttribute('src') && (!image.complete || image.naturalWidth === 0)).map(image => ({src:image.getAttribute('src'),className:image.className}))""")
            assert broken == [], f"{label}:native_broken_images:{broken}"
        def run_terminal_map_failure(label,handler):
            clear_map_cache();page.route(map_asset_pattern,handler);page.reload(wait_until="domcontentloaded");wait_ready(page)
            fallback=page.locator(".tile-map[data-map-state='STRUCTURED_FALLBACK']").first
            fallback.wait_for(state="visible",timeout=30_000);page.wait_for_load_state("networkidle",timeout=30_000);assert_no_broken_images(label)
            evidence=page.evaluate("""() => { const map=document.querySelector('.tile-map'); return {state:map?.dataset.mapState,failureClass:map?.dataset.mapFailureClass,loaded:Number(map?.dataset.mapLoadedTileCount),failed:Number(map?.dataset.mapFailedTileCount),text:map?.querySelector('.tile-map__source')?.textContent}; }""")
            assert evidence["state"] == "STRUCTURED_FALLBACK" and evidence["loaded"] == 0 and evidence["failed"] > 0,evidence
            map_failures.append({"case":label,**evidence});page.unroute(map_asset_pattern);return evidence
        def terminal_http_failure(status):
            return lambda intercepted: intercepted.fulfill(status=status,content_type="application/json",body=json.dumps({"error":f"controlled_map_{status}"}))
        for status in (401,403,404,429,500,502,503):
            run_terminal_map_failure(f"HTTP_{status}",terminal_http_failure(status))
        run_terminal_map_failure("TIMEOUT",lambda intercepted:intercepted.abort("timedout"))
        run_terminal_map_failure("INVALID_MIME",lambda intercepted:intercepted.fulfill(status=200,content_type="text/plain",body="not an image"))
        def oversized_map(intercepted):
            if "/events/thermal/overlay" in intercepted.request.url: intercepted.fulfill(status=200,content_type="image/png",body=b"0"*(3*1024*1024+1))
            else: intercepted.fulfill(status=500,content_type="application/json",body='{"error":"controlled_map_oversized_sibling"}')
        oversized_evidence=run_terminal_map_failure("OVERSIZED_IMAGE",oversized_map)
        assert "OVERSIZED_IMAGE" in oversized_evidence["failureClass"],oversized_evidence

        clear_map_cache();partial_counter={"value":0}
        def partial_map(intercepted):
            partial_counter["value"]+=1
            if partial_counter["value"] % 4 == 0: intercepted.abort("failed")
            else: intercepted.continue_()
        page.route(map_asset_pattern,partial_map);page.reload(wait_until="domcontentloaded");wait_ready(page)
        page.locator(".tile-map[data-map-state='DEGRADED_PARTIAL']").first.wait_for(state="visible",timeout=30_000);page.wait_for_load_state("networkidle",timeout=30_000);assert_no_broken_images("25_PERCENT_FAILURE")
        partial_evidence=page.evaluate("""() => { const map=document.querySelector('.tile-map'); return {state:map?.dataset.mapState,loaded:Number(map?.dataset.mapLoadedTileCount),failed:Number(map?.dataset.mapFailedTileCount)}; }""")
        assert partial_evidence["loaded"] > 0 and partial_evidence["failed"] > 0,partial_evidence
        page.unroute(map_asset_pattern)

        if page.locator("[data-action='refresh-runtime']").count() == 0:
            route(page,"prevent")
        recovery_started=perf_counter();page.locator("[data-action='refresh-runtime']").first.click()
        page.locator(".toast").filter(has_text="Canonical VIGIA refreshed").wait_for(state="visible", timeout=30_000)
        route(page,"overview")
        page.locator(".tile-map[data-map-state='LIVE']").first.wait_for(state="visible",timeout=30_000)
        recovery_ms=(perf_counter()-recovery_started)*1000;assert_no_broken_images("PROVIDER_RECOVERY")
        assert page.get_by_text(re.compile("^LIVE BASEMAP · ")).first.is_visible()
        map_reliability={"terminalFailures":map_failures,"partial":partial_evidence,"providerRecoveryWithoutAppRestartMs":round(recovery_ms,3),"nativeBrokenImages":0}

        for width, height in VIEWPORTS:
            page.set_viewport_size({"width": width, "height": height})
            page.goto(f"{UI}/#/overview", wait_until="domcontentloaded")
            wait_ready(page)
            assert_nav_scope(page)
            if width <= 900:
                certify_mobile_nav(page)
            else:
                page.keyboard.press("Tab")
                assert page.evaluate("document.activeElement !== document.body && Boolean(document.activeElement)")
            touch = assert_touch_targets(page, f"{width}x{height}")
            touch_results.append({"viewport": f"{width}x{height}", "count": touch["count"], "minimumHeightPx": touch["minimum"]})
            capture(page, manifest, len(cases) + 1, f"responsive-{width}x{height}", cases, "Responsive overflow, focus, navigation, and 44px target check.")

        scenario(intelligence_scenarios,20,"Responsive matrix",{"viewports":[f"{width}x{height}" for width,height in VIEWPORTS]})
        scenario(intelligence_scenarios,21,"Keyboard and accessibility",{"touchTargets":touch_results,"mobileNavigation":"focus restored"})

        page.evaluate("value => value === null ? localStorage.removeItem('vigia-mission-dark-state-v2') : localStorage.setItem('vigia-mission-dark-state-v2', value)", original_storage)
        page.set_viewport_size({"width": 1440, "height": 900})
        page.goto(f"{UI}/#/overview", wait_until="domcontentloaded")
        wait_ready(page)
    finally:
        playwright.stop()
        if owned_browser:
            stop_owned_browser(owned_browser)

    actionable_errors = [item for item in console_errors if "favicon" not in item.lower() and "failed to load resource" not in item.lower() and "controlled_" not in item.lower()]
    allowed_tokens = ("/basemap/", "/events/thermal/overlay", "/observations/proxy")
    unexpected_responses = [item for item in bad_responses if not (
        any(token in item["url"] for token in expected_injections)
        or (item["status"] in {403, 404, 429, 502, 503} and any(token in item["url"] for token in allowed_tokens))
    )]
    assert not actionable_errors, actionable_errors
    assert not unexpected_responses, unexpected_responses
    scenario(intelligence_scenarios,22,"Console errors",{"unexpected":len(actionable_errors)})
    scenario(intelligence_scenarios,23,"Unexpected HTTP errors",{"unexpected":len(unexpected_responses)})
    scenario(intelligence_scenarios,24,"Horizontal overflow",{"maximumPx":max(item["horizontalOverflowPx"] for item in cases)})
    assert len(intelligence_scenarios)==24 and all(item["state"]=="PASS" for item in intelligence_scenarios)
    for browser_case in cases:
        browser_case["frontend"] = frontend_identity
    evidence = {
        "schemaVersion": "vigia.running-browser-certification.v6", "state": "PASS",
        "releaseId": manifest["releaseId"], "codeStateHash": manifest["codeStateHash"],
        "operationalDataHash": manifest["operationalDataHash"],
        "certifiedRuntimeReleaseStatementHash": manifest["releaseStatementHash"],
        "frontend": frontend_identity, "assetDigestVerified": True, "remoteAssetDigestVerified": True,
        "remoteAssetFiles": remote_assets["files"], "remoteAssetBytes": remote_assets["bytes"],
        "cases": cases, "realPortugalEventsVerified": 3,
        "browserTransport": "CERTIFIER_OWNED_CDP", "cdpUrl": CDP_URL, "browserRuntime": browser_runtime,
        "consoleErrors": 0, "unexpectedHttpErrors": 0, "routeNotFoundOccurrences": 0,
        "identityContradictions": 0, "csp": csp, "xssPayloadClasses": ["img-onerror", "svg-onload", "script"],
        "failureInjections": ["events-partial", "fieldnet-stale", "basemap-401", "basemap-403", "basemap-404", "basemap-429", "basemap-500", "basemap-502", "basemap-503", "basemap-timeout", "basemap-invalid-mime", "basemap-oversized", "basemap-25-percent", "basemap-recovery"],
        "mapReliability": map_reliability,
        "preventionVisualState": prevention_visual_state,
        "performanceMs": {
            "navigationCold": round(navigation, 3) if isinstance(navigation, (int, float)) else None,
            "routeSwitchMaximum": max(route_timings), "routeSwitchMeasurements": route_timings,
            "eventSelectionMaximum": max(event_timings), "eventSelectionMeasurements": event_timings,
        },
        "touchTargets": touch_results,
        "intelligenceScenarios": intelligence_scenarios,
        "intelligencePerformance": intelligence_measurements,
        "attestation": {"schemaVersion": "vigia.browser-certification-attestation.v2", "runNonce": RUN_NONCE, "producerPid": os.getpid(), "browserVersion": browser_version, "browserProcess": {"pid": owned_browser["pid"], "profileNonce": owned_browser["profileNonce"], "endpoint": owned_browser["endpoint"], "executableSha256": owned_browser["executableSha256"]} if owned_browser else None},
    }
    evidence["attestationMac"] = "hmac-sha256:" + hmac.new(ATTESTATION_KEY.encode(), canonical_json(evidence).encode(), hashlib.sha256).hexdigest()
    safe_write(OUT, (json.dumps(evidence, indent=2) + "\n").encode())
    print(json.dumps({"state": "PASS", "releaseId": manifest["releaseId"], "frontend": FRONTEND, "cases": len(cases), "transport": "CERTIFIER_OWNED_CDP"}))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # pragma: no cover - release diagnostics
        print(f"operator_console_browser_certification_failed:{error}", file=sys.stderr)
        raise
