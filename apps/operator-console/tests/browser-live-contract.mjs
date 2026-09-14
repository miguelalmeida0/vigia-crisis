import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [capture,finalWhiteCapture,runner,packageJson,lockedRunner]=await Promise.all([
  readFile(new URL('../../../scripts/visual-qa/capture.py',import.meta.url),'utf8'),
  readFile(new URL('../../../scripts/visual-qa/final_white_capture.py',import.meta.url),'utf8'),
  readFile(new URL('../../../scripts/visual-qa/run.mjs',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8').then(JSON.parse),
  readFile(new URL('../../../scripts/release/locked_frontend_visual_qa.py',import.meta.url),'utf8'),
]);

const viewports=['(1672, 941)','(1600, 1000)','(1440, 900)','(1280, 800)','(1024, 768)','(768, 1024)','(430, 932)','(390, 844)','(320, 568)'];
for(const viewport of viewports){
  assert.ok(finalWhiteCapture.includes(viewport),`final white deterministic QA missing ${viewport}`);
  assert.ok(lockedRunner.includes(viewport),`release visual QA missing ${viewport}`);
}
for(const route of ['command-overview','incidents','incident-detail','intelligence','operations','reports-analytics','global-awareness'])assert.ok(finalWhiteCapture.includes(`\"${route}\"`),`final white capture missing ${route}`);
for(const marker of ['target.png','current.png','overlay-50.png','difference.png','metrics.json','geometry-report.json','style-report.json','responsiveMatrix','horizontalOverflow','sevenPrimaryRoutes','noRouteNumbers','removedPrimaryRoutesAbsent'])assert.ok(finalWhiteCapture.includes(marker),`final white browser acceptance missing ${marker}`);
for(const marker of ['state-labels-200-percent-text-spacing.png','state-labels-400-percent-text-spacing.png','stateLabelsAt200Percent','stateLabelsAt400Percent'])assert.ok(finalWhiteCapture.includes(marker),`final white status-label zoom acceptance missing ${marker}`);
for(const marker of [
  'responsive_matrix(page, origin, active, lane, final_identifier',
  'OUTPUT_ROOT / lane / "responsive"',
  'responsive_navigation_contract',
  'selection_contract(page, route, selected_identifier)',
  'operatorTypography',
  'stableScreenshot',
  'required_route_files = ("reference.png", "runtime.png", "overlay-50.png", "difference.png", "metrics.json", "geometry-report.json", "style-report.json")',
  'scene_playwright_acceptance',
  'rapidABCExactFinalC',
  'staleResponseCannotOverwrite',
  'allSixRoutesRetainFinalC',
  'evidenceGraphMatchesFinalC',
  'governed_map_reliability',
  'lastGoodPresented',
  'recoveredLive',
  'uniqueRouteLayerSets',
  'uniqueRouteCameras',
])assert.ok(capture.includes(marker),`browser acceptance missing ${marker}`);

assert.match(capture,/for route in \["command-overview", "incidents", "intelligence", "evidence", "operations", "incident-detail"\]/);
assert.match(capture,/len\(summary\.get\("responsiveOverflowMatrix", \[\]\)\) == len\(RESPONSIVE_VIEWPORTS\) \* len\(ROUTES\)/);
assert.match(runner,/VIGIA_VQA_SOURCE_SERVE:\s*["']1["']/,'golden lane must support repository-local source serving');
assert.match(runner,/canonicalTruthSubstituted:\s*false/,'blocked canonical lane must not substitute golden truth');
assert.ok(runner.includes('currentOperatorSourceHash()')&&runner.includes('canonical_runtime_source_mismatch'),'canonical lane must bind the served runtime source hash to the current operator source tree');
assert.ok(runner.includes("final_white_capture.py")&&runner.includes("07-global-awareness"),'canonical lane must execute the seven-route final white acceptance harness');
assert.ok(finalWhiteCapture.includes('def admitted_operator_fetch('),'controlled exercise preflight must use the admitted browser document transport');
assert.ok(finalWhiteCapture.includes("credentials: 'same-origin'")&&finalWhiteCapture.includes("'x-vigia-operator-intent': 'operator-console'"),'admitted Operator mutations must preserve same-origin credentials and explicit operator intent');
assert.ok(!finalWhiteCapture.includes('page.request.get(f"{origin}/backend/api/v10/operator/operational-periods"'),'controlled exercise must not bypass browser fetch metadata through APIRequestContext');
assert.ok(finalWhiteCapture.includes('.vigia-overlay__panel [data-dialog-close]:visible')&&finalWhiteCapture.includes('page.keyboard.press("Escape")'),'controlled exercise teardown must use an unobscured dialog control with the governed Escape fallback');
assert.ok(finalWhiteCapture.includes('timeout_ms: int = 12_000')&&finalWhiteCapture.includes('30_000'),'safe controlled-exercise abort must have a longer bounded mutation timeout than ordinary preflight reads');
assert.ok(finalWhiteCapture.includes('def wait_for_operator_hydration_idle()')&&finalWhiteCapture.includes("app?.dataset.vigiaGlobalRefreshPending==='false'")&&finalWhiteCapture.includes("app?.dataset.vigiaIncidentLoadPending==='false'")&&finalWhiteCapture.includes('runtime?.hydrationIdle===true'),'controlled exercise must wait for both global and selected-incident hydration to be idle before consequential actions');
assert.ok(finalWhiteCapture.includes("document.body.dataset.vigiaRoute==='intelligence'")&&finalWhiteCapture.includes("dataset.vigiaIncidentLoadPending==='false'"),'direct Intelligence route proof must await the selected incident load boundary before evaluating the route projection');
assert.ok(finalWhiteCapture.includes('fieldnet_authority = f"127.0.0.1:{fieldnet_url.port or 4188}"')&&finalWhiteCapture.includes('headers=fieldnet_headers'),'container evidence must retain FieldNet configured listener authority instead of confusing Docker host routing with service identity');
assert.doesNotMatch(runner,/missingArtifactSets:\[[^\]]*04-evidence/,'canonical blocker evidence must not restore the removed Evidence route');
assert.match(runner,/prepareLaneOutput\(["']golden["']\)[\s\S]*prepareLaneOutput\(["']canonical["']\)/,'each visual lane must invalidate prior artifact bundles before certification');
assert.match(runner,/selected\s*===\s*["']golden["'][\s\S]*runLocalCanonical\(runtime\)/,'local runner must keep golden and canonical lanes separate');
assert.equal(packageJson.scripts['test:browser:fixture'],'VIGIA_VQA_EXECUTION=local node ../../scripts/visual-qa/run.mjs golden');
assert.equal(packageJson.scripts['test:browser:live'],'VIGIA_VQA_EXECUTION=local node ../../scripts/visual-qa/run.mjs canonical');
assert.doesNotMatch(packageJson.scripts['test:browser:live'],/operator_console_browser_smoke|detect/i);
console.log('Browser QA contract passed: final seven-route white certification and legacy canonical scene safeguards remain mandatory.');
