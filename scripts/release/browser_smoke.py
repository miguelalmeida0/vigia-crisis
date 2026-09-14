#!/usr/bin/env python3
"""Certify the exact running VIGIA release across the 16 required product states."""
from __future__ import annotations

import json
import os
from pathlib import Path
import sys
from urllib.request import urlopen

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
BASE = os.environ.get("VIGIA_BASE_URL", "http://127.0.0.1:4177").rstrip("/")
FIELD = os.environ.get("FIELDNET_BASE_URL", "http://127.0.0.1:4188").rstrip("/")
MANIFEST = ROOT / "data/validation/release/current-release-manifest.json"
OUT = ROOT / "data/validation/release/running-browser-certification.json"
SHOTS = ROOT / "data/validation/release/decision-os-screenshots"


def read_json(url: str) -> dict:
    with urlopen(url, timeout=12) as response:  # noqa: S310 - loopback certification
        return json.loads(response.read().decode("utf-8"))


def visible_identity(page) -> dict:
    return page.evaluate("""() => ({
      actor: document.querySelector('[data-actor-static]')?.textContent?.trim(),
      caption: document.querySelector('[data-actor-caption]')?.textContent?.trim(),
      command: document.querySelector('[data-command-identity]')?.innerText?.trim(),
      fieldActor: document.querySelector('.fieldnet-identity strong')?.textContent?.trim(),
      fieldTitle: document.querySelector('.fieldnet-identity small')?.textContent?.trim(),
      updateRequired: document.body.innerText.includes('UPDATE REQUIRED'),
      routeNotFound: document.body.innerText.includes('Route not found.'),
      resolving: document.body.innerText.includes('Resolving the territory state')
    })""")


def shot(page, manifest: dict, number: int, slug: str, state: str, cases: list[dict], note: str = "") -> None:
    path = SHOTS / f"{number:02d}-{slug}.png"
    page.screenshot(path=str(path), full_page=False)
    identity = visible_identity(page)
    assert not identity["updateRequired"], identity
    assert not identity["routeNotFound"], identity
    assert not identity["resolving"], identity
    overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    assert overflow <= 1, f"horizontal_overflow:{number}:{overflow}"
    cases.append({"case": number, "state": state, "note": note, "viewport": page.viewport_size, "identity": identity, "horizontalOverflowPx": overflow, "screenshot": str(path.relative_to(ROOT)), "releaseId": manifest["releaseId"]})


def ready(page, manifest: dict) -> None:
    page.locator("#app[data-ready='true']").wait_for(timeout=45_000)
    page.locator("[data-release-badge][data-state='current']").wait_for(state="attached", timeout=20_000)
    assert page.locator("[data-release-badge]").text_content().strip() == manifest["releaseId"]


def click_view(page, view: str) -> None:
    page.locator(f"[data-view-button='{view}']:visible").first.click()
    page.locator(f"#app[data-view='{view}'][data-ready='true']").wait_for(timeout=30_000)


def set_fieldnet_state(page, incident_id: str, state: str) -> None:
    result = page.evaluate("""async ({field, state}) => {
      const response = await fetch(`${field}/api/fieldnet/connection-state`, {
        method:'POST', headers:{'content-type':'application/json'},
        body:JSON.stringify({state,actor:'Miguel Almeida · Shadow Operator'})
      });
      return {ok:response.ok,status:response.status,body:await response.json()};
    }""", {"field": FIELD, "state": state})
    assert result["ok"], result
    page.goto(f"{BASE}/#fieldnet={incident_id}", wait_until="domcontentloaded")
    page.locator("[data-fieldnet-shell]:not([hidden])").wait_for(timeout=35_000)
    page.locator(f"[data-fieldnet-shell][data-connection-state='{state}']").wait_for(timeout=20_000)


def main() -> int:
    manifest = json.loads(MANIFEST.read_text())
    assert read_json(f"{BASE}/api/v10/release")["releaseId"] == manifest["releaseId"]
    assert read_json(f"{FIELD}/api/fieldnet/release")["releaseId"] == manifest["releaseId"]
    incidents = read_json(f"{FIELD}/api/fieldnet/incidents").get("incidents", [])
    assert incidents, "fieldnet_incident_not_available"
    incident_id = incidents[0]["incidentId"]
    zones = read_json(f"{BASE}/api/v10/validation/prevention-consensus/zones").get("zones", [])
    unstable = next((item for item in zones if item.get("claim_state") in {"UNSTABLE_GEOMETRY", "UNSTABLE_INTERVENTION_GEOMETRY"}), None)
    assert unstable, "unstable_prevention_case_not_available"
    SHOTS.mkdir(parents=True, exist_ok=True)
    cases: list[dict] = []
    console_errors: list[str] = []
    bad_responses: list[dict] = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        desktop = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = desktop.new_page()
        page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
        page.on("pageerror", lambda error: console_errors.append(str(error)))
        page.on("response", lambda response: bad_responses.append({"status": response.status, "url": response.url}) if response.status >= 400 and response.url.startswith((BASE, FIELD)) else None)

        page.goto(BASE, wait_until="domcontentloaded")
        ready(page, manifest)
        page.get_by_text("NO CURRENT PHYSICAL FIRE DETECTIONS", exact=True).wait_for(timeout=30_000)
        signed = visible_identity(page)
        assert signed["actor"] == "Miguel Almeida" and "Shadow Operator" in (signed["command"] or ""), signed
        shot(page, manifest, 1, "command", "Command", cases)

        page.evaluate("async () => { const response=await fetch('/api/v10/session',{method:'DELETE'}); if(!response.ok) throw new Error(`signout_${response.status}`); }")
        page.reload(wait_until="domcontentloaded")
        ready(page, manifest)
        page.get_by_text("NO CURRENT PHYSICAL FIRE DETECTIONS", exact=True).wait_for(timeout=30_000)
        readonly = visible_identity(page)
        assert readonly["actor"] == "Public read-only" and "Read-only viewer" in (readonly["command"] or ""), readonly
        shot(page, manifest, 2, "command-read-only", "Command without authenticated mutation access", cases)

        page.evaluate("async () => { const response=await fetch('/api/v10/session',{method:'POST'}); if(!response.ok) throw new Error(`resume_${response.status}`); }")
        page.reload(wait_until="domcontentloaded")
        ready(page, manifest)
        restored = visible_identity(page)
        assert restored["actor"] == "Miguel Almeida" and "Shadow Operator" in (restored["command"] or ""), restored
        shot(page, manifest, 3, "command-signed-in", "Command signed-in", cases)

        click_view(page, "observe")
        page.get_by_text("No robust consensus zone is promoted in the current governed corpus.", exact=True).wait_for(timeout=30_000)
        page.locator(".avoidance-workbench").wait_for(timeout=35_000)
        shot(page, manifest, 4, "prevention-robust-consensus", "Prevention robust consensus", cases, "Governed corpus honestly reports zero promoted robust zones.")

        unstable_id = unstable["finding_id"]
        page.locator(f"[data-select-kind='finding'][data-select-id='{unstable_id}']").first.click()
        page.get_by_text("INTERVENTION GEOMETRY UNSTABLE", exact=True).wait_for(timeout=35_000)
        assert page.get_by_text("UNSTABLE ZONE", exact=True).count() == 0
        shot(page, manifest, 5, "prevention-unstable-geometry", "Prevention unstable geometry", cases)

        page.get_by_text("View measurement plan", exact=True).last.click()
        page.locator("#app[data-view='validation']").wait_for(timeout=30_000)
        page.locator(".validation-state-banner.is-ready,.validation-state-banner.is-partial").wait_for(timeout=35_000)
        debt_chapter = page.locator("details.validation-chapter").filter(has_text="MEASUREMENT DEBT")
        if debt_chapter.count() and not debt_chapter.first.get_attribute("open"):
            debt_chapter.first.locator("summary").click()
        page.locator("#validation-evidence-debt").scroll_into_view_if_needed()
        shot(page, manifest, 6, "prevention-measurement-plan", "Prevention measurement plan", cases)

        click_view(page, "live")
        event_row = page.locator("[data-select-kind='event']").first
        event_row.wait_for(timeout=30_000)
        event_row.click()
        page.locator(".incident-workspace-banner").wait_for(timeout=30_000)
        shot(page, manifest, 7, "incident", "Incident", cases)

        click_view(page, "validation")
        page.get_by_text("VALIDATION 3.1", exact=True).wait_for(timeout=35_000)
        page.locator(".validation-state-banner.is-ready").wait_for(timeout=35_000)
        shot(page, manifest, 8, "validation-ready", "Validation ready", cases)
        page.locator("#validation-failure-clusters").scroll_into_view_if_needed()
        shot(page, manifest, 9, "validation-failure-cluster", "Validation failure cluster", cases)
        debt_chapter = page.locator("details.validation-chapter").filter(has_text="MEASUREMENT DEBT")
        if debt_chapter.count() and not debt_chapter.first.get_attribute("open"):
            debt_chapter.first.locator("summary").click()
        page.locator("#validation-evidence-debt").scroll_into_view_if_needed()
        shot(page, manifest, 10, "evidence-debt", "Evidence Debt", cases)

        set_fieldnet_state(page, incident_id, "FULL")
        page.get_by_text("Miguel Almeida", exact=True).last.wait_for(timeout=20_000)
        shot(page, manifest, 11, "fieldnet-connected", "FieldNet connected", cases)
        set_fieldnet_state(page, incident_id, "REGIONAL_DISCONNECTED")
        page.get_by_text("Local incident operational", exact=True).wait_for(timeout=20_000)
        shot(page, manifest, 12, "fieldnet-disconnected", "FieldNet disconnected", cases)

        page.locator("[data-fieldnet-close]").click()
        page.locator("[data-action='alerts']:visible").first.click()
        page.locator("[data-drawer][aria-hidden='false']").wait_for(timeout=20_000)
        page.get_by_text("ALERT INBOX 2.0", exact=True).wait_for(timeout=20_000)
        shot(page, manifest, 13, "alerts", "Alerts", cases)
        desktop.close()

        mobile = browser.new_context(viewport={"width": 390, "height": 844})
        mobile_page = mobile.new_page()
        mobile_page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
        mobile_page.on("pageerror", lambda error: console_errors.append(str(error)))
        mobile_page.on("response", lambda response: bad_responses.append({"status": response.status, "url": response.url}) if response.status >= 400 and response.url.startswith((BASE, FIELD)) else None)
        mobile_page.goto(BASE, wait_until="domcontentloaded")
        ready(mobile_page, manifest)
        mobile_page.get_by_text("NO CURRENT PHYSICAL FIRE DETECTIONS", exact=True).wait_for(timeout=30_000)
        shot(mobile_page, manifest, 14, "mobile-command", "mobile Command", cases)
        click_view(mobile_page, "observe")
        mobile_page.locator(".avoidance-workbench").wait_for(timeout=35_000)
        shot(mobile_page, manifest, 15, "mobile-prevention", "mobile Prevention", cases)
        mobile_page.goto(f"{BASE}/#fieldnet={incident_id}", wait_until="domcontentloaded")
        mobile_page.locator("[data-fieldnet-shell][data-connection-state='REGIONAL_DISCONNECTED']").wait_for(timeout=35_000)
        shot(mobile_page, manifest, 16, "mobile-fieldnet", "mobile FieldNet", cases)
        mobile.close()
        browser.close()

    actionable_errors = [item for item in console_errors if "favicon" not in item.lower()]
    allowed_tokens = ("/basemap/", "/operations/", "/alerts", "/notifications", "/events/ui-first-seen")
    unexpected_responses = [item for item in bad_responses if not (item["status"] in {403, 429, 503} and any(token in item["url"] for token in allowed_tokens))]
    assert not actionable_errors, actionable_errors
    assert not unexpected_responses, unexpected_responses
    evidence = {"schemaVersion": "vigia.running-browser-certification.v2", "state": "PASS", "releaseId": manifest["releaseId"], "codeStateHash": manifest["codeStateHash"], "cases": cases, "consoleErrors": 0, "unexpectedHttpErrors": 0, "routeNotFoundOccurrences": 0, "identityContradictions": 0}
    OUT.write_text(json.dumps(evidence, indent=2) + "\n")
    print(json.dumps({"state": "PASS", "releaseId": manifest["releaseId"], "cases": len(cases), "consoleErrors": 0}))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # pragma: no cover - release diagnostics
        print(f"browser_release_certification_failed:{error}", file=sys.stderr)
        raise
