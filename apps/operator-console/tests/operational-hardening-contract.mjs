import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { migrateLegacyRouteState, parseRouteUrl, updateRouteParameter } from '../src/routeState.js';
import { incidentChangedAt,operatorText,routeProjectionDependency } from '../src/canonicalViewModel.js';
import { renderBootRoute } from '../src/bootSkeleton.js';
import { bindShellState } from '../src/components.js?v=2.1.0';

const [app,map,boot,operations,reports,incidents,intelligence,globalAwareness,command,executive,shellComponents,components,routesCss,responsiveCss]=await Promise.all([
  Promise.all(['app.js','appActionController.js'].map(file=>readFile(new URL(`../src/${file}`,import.meta.url),'utf8'))).then(parts=>parts.join('\n')),
  Promise.all(['map.js','mapModel.js','mapRuntime.js','mapRuntimeState.js','mapStyle.js'].map(file=>readFile(new URL(`../src/${file}`,import.meta.url),'utf8'))).then(parts=>parts.join('\n')),
  readFile(new URL('../src/bootSkeleton.js',import.meta.url),'utf8'),
  readFile(new URL('../src/routes/operations.js',import.meta.url),'utf8'),
  readFile(new URL('../src/routes/reportsAnalytics.js',import.meta.url),'utf8'),
  readFile(new URL('../src/routes/incidents.js',import.meta.url),'utf8'),
  readFile(new URL('../src/routes/intelligenceEvidence.js',import.meta.url),'utf8'),
  readFile(new URL('../src/routes/globalAwareness.js',import.meta.url),'utf8'),
  readFile(new URL('../src/routes/commandOverview.js',import.meta.url),'utf8'),
  readFile(new URL('../src/executiveComponents.js',import.meta.url),'utf8'),
  readFile(new URL('../src/components.js',import.meta.url),'utf8'),
  readFile(new URL('../styles/components.css',import.meta.url),'utf8'),
  readFile(new URL('../styles/routes.css',import.meta.url),'utf8'),
  readFile(new URL('../styles/responsive.css',import.meta.url),'utf8'),
]);

const reportsLegacy=migrateLegacyRouteState('http://127.0.0.1:4190/?view=quality#/reports-analytics');
assert.equal(reportsLegacy.url.search,'','legacy report state must leave the document query');
assert.equal(reportsLegacy.url.hash,'#/reports-analytics?view=quality','legacy report state must migrate after the route hash');

const globalLegacy=migrateLegacyRouteState('http://127.0.0.1:4190/?view=quality&type=wildfire&region=Portugal+mainland#/global-awareness');
assert.equal(globalLegacy.url.search,'','legacy global state must leave the document query');
const globalParsed=parseRouteUrl(globalLegacy.url);
assert.equal(globalParsed.params.has('view'),false);
assert.equal(globalParsed.params.get('region'),'Portugal mainland');
assert.equal(globalParsed.params.get('type'),'wildfire');

const updated=updateRouteParameter('http://127.0.0.1:4190/#/reports-analytics','view','outcomes',{defaultValue:'summary'});
assert.equal(updated.pathname,'/');
assert.equal(updated.search,'');
assert.equal(updated.hash,'#/reports-analytics?view=outcomes');

assert.match(app,/retainPersistentMaps\(app\)[\s\S]*?app\.replaceChildren\(template\.content\)[\s\S]*?restorePersistentMaps\(app\)/,'render must reattach the same map host around route DOM replacement');
assert.doesNotMatch(app,/disposeMaps\(app\)|app\.innerHTML\s*=/,'ordinary renders must not destroy the map runtime');
assert.match(app,/HYDRATED_LAST_GOOD|REFRESHING|READY_STALE|DEGRADED_PARTIAL/,'resource lifecycle must retain and describe last-good content');
assert.match(app,/delivery\?\.state==='LAST_GOOD_REFRESHING'/,'last-good projection delivery must remain visibly stale while refresh is in flight');
assert.match(app,/settleRefresh:false/,'last-good delivery must perform one bounded settlement read after the background refresh');
assert.match(app,/data-vigia-select-trigger=\"\$\{CSS\.escape\(id\)\}\"/,'shared dropdown selection must return focus to the rebuilt trigger');
assert.match(shellComponents,/A governed refresh is running/,'refreshing last-good content must not be described as a failed refresh');
assert.match(boot,/Connecting map/);
const connectingState={runtime:{status:'loading',resourceState:'BOOTSTRAPPING',showSkeleton:true}};
bindShellState(connectingState);
for(const route of ['command-overview','incidents','incident-detail','intelligence','operations','reports-analytics','global-awareness']){
  const rendered=renderBootRoute(route,connectingState);
  assert.doesNotMatch(rendered.replace(/<[^>]*>/g,' '),/Unavailable/i,'the rendered startup skeleton must not flash an unavailable verdict');
  if(['intelligence','operations'].includes(route))assert.match(rendered,/class="reference-map-unavailable"/,'loading copy must preserve the styled map-fallback class');
}
bindShellState(null);

for(const marker of ['MapLibreMap','dragPan: true','vigia:map-camera-change','retainPersistentMaps','restorePersistentMaps','getSource','setData','sourceUpdateCount','styleReloadCount','mapPointerToFirstPaintMs'])assert.ok(map.includes(marker),`persistent map runtime missing ${marker}`);
assert.match(map,/setMaxParallelImageRequests\(8\)/,'MapLibre raster concurrency must match the governed basemap proxy capacity');
assert.doesNotMatch(map,/addEventListener\(['"]pointer(?:move|up)['"]/,'application code must not replace native map drag with pointer-motion handlers');
assert.match(map,/addEventListener\('pointerdown',enableWheel\)/,'pointer activation may opt into focused trackpad zoom without simulating drag');
assert.doesNotMatch(map,/tile-map__grid--incoming|replaceMapGrid/,'native WebGL map must not retain the retired raster-grid swap path');
assert.match(map,/same-origin:\/backend\/api\/v1\/basemap/,'map assets must remain on the governed same-origin proxy');

assert.match(operations,/incidentContextSwitcher/,'Operations requires the shared searchable incident context switcher');
assert.match(operations,/value\(rawSource,'sourceResolution'\)/,'Operations must render persisted source-resolution jobs separately');
assert.match(operations,/value\(rawSource,'responseOperations'\)/,'Operations must keep response operations separate from source resolution');
assert.match(operations,/value\(rawSource,'protectWorkflow'\)/,'Operations must expose the governed Protect\/Recover workflow without mixing truth universes');
for(const label of ['Retry','Escalates when','Complete when','Receipt','Last checked'])assert.match(operations,new RegExp(label),`Operations lifecycle missing ${label}`);
const fallbackState={selectedIncidentId:'incident:one',runtime:{status:'ready',canonical:{incidents:{'incident:one':{operations:{value:null,dependency:{state:'FAILED'}},detail:{value:{data:{governedWork:{state:'READY',value:[]}}}}}}}}};
assert.equal(routeProjectionDependency(fallbackState,'operations').state,'DEGRADED','backend-owned incident governed work must prevent a false Operations-unavailable flash');
for(const panel of ['report-panel-summary','report-panel-outcomes','report-panel-performance','report-panel-quality'])assert.match(reports,new RegExp(panel),`Reports controlled panel missing ${panel}`);
for(const marker of ['Information requests and exercises are excluded','resolutionWorkItems','Measurement boundary and exclusions','Historical exercises and replays','quality-drilldown'])assert.match(reports,new RegExp(marker,'i'),`outcome analysis missing ${marker}`);
assert.match(reports,/decision-ready changes/i,'Reports must distinguish decision-ready records from state transitions');
assert.match(reports,/State transitions over time/,'Reports must name the transition series truthfully');
assert.doesNotMatch(reports,/Material decisions/,'Reports must not relabel raw transitions as decisions');
assert.match(incidents,/else result\.sort\(priorityOrder\)/,'default incident ordering must apply canonical priority');
for(const saved of ['NEW_CANDIDATES','NEEDS_REVALIDATION','OFFICIAL_VERIFIED','STALE_HIGH_PRIORITY','HUMAN_DECISION_DUE'])assert.match(incidents,new RegExp(saved),`Incidents saved operational filter missing ${saved}`);
assert.match(incidents,/canonicalIncidents:\{state:'READY'/,'saved-filter counts must evaluate a ready canonical section');
assert.match(executive,/orderedIncidents\(incidents\)/,'shared context switcher must use the same priority ordering');
assert.equal(incidentChangedAt({operationalTruth:{lastObservedAt:'2026-09-03T07:10:00.000Z'}}),'2026-09-03T07:10:00.000Z','shared incident context must use the governed observation timestamp');
assert.match(intelligence,/artifactItems\(scene,'observations'\)\.length\?'Thermal observations'/,'scientific boundary must advertise thermal support only when returned for the selected incident');
assert.match(intelligence,/Regional context — not incident evidence/,'Intelligence must not describe regional weather as incident-associated evidence');
assert.doesNotMatch(intelligence,/Selected incident association\$\{item\.incidentId/,'primary weather copy must not expose a canonical incident ID');
assert.doesNotMatch(intelligence,/governed_terrain_provider_not_integrated/,'raw terrain integration enums must stay out of Intelligence route copy');
assert.equal(operatorText('governed_terrain_provider_not_integrated_for_valid_incident_coordinate'),'Terrain provider not integrated for this incident','raw map-layer reason must resolve to operator language');
assert.doesNotMatch(reports,/sentence\(item\.incidentLabel,item\.incidentId/,'Reports must not fall back to a raw incident ID for grouped provider attention');
assert.match(reports,/item\.ownerPolicy\?\.defaultOwner/,'Reports grouped attention must display the governed default owner policy when no person is assigned');
assert.match(reports,/State classification unavailable/,'Reports transition fallback must describe the missing dimension rather than expose an engineering enum');
assert.match(globalAwareness,/global-region-focus/,'regional summaries must produce an observable map and filter action');
for(const label of ['Lifecycle','Freshness','Verification','Coverage','Provider degradation'])assert.match(globalAwareness,new RegExp(label),`Global strategic summary missing ${label}`);
assert.match(globalAwareness,/!providers\.length\?'NOT_MEASURED'/,'an absent provider inventory must never be projected as ready');
assert.match(globalAwareness,/Provider inventory not reported/,'provider-health absence must be explicit to the operator');
assert.match(reports,/measuredNumber\(map\.tileFailures\)/,'missing basemap failure telemetry must remain unmeasured instead of becoming zero');
assert.match(reports,/measuredNumber\(map\.overlayFailures\)/,'missing overlay failure telemetry must remain unmeasured instead of becoming zero');
assert.doesNotMatch(reports,/Number\(map\.(?:tileFailures|overlayFailures)\?\?0\)/,'missing map failure telemetry must not produce a false operational state');
assert.match(command,/eoc-period-strip/,'Command must project the current EOC operational period without adding a new route');
assert.match(operations,/operations-period-context/,'Operations must project EOC owner, decisions, actions, and handoff context');
assert.match(operations,/operations-command-intent/,'Operations must expose the persisted command-intent boundary');
assert.match(operations,/commandLedgerAvailable=\['READY','DEGRADED'\]/,'Operations must distinguish an unavailable command ledger from an uninitialized command context');
assert.match(operations,/commandContextReady=commandLedgerAvailable&&Boolean\(incidentCommand\?\.incidentId\)/,'Operations must recognize the canonical top-level incident-command identity only when its governed section is available');
assert.match(operations,/if\(!available\)return[\s\S]*data-command-context-state="LEDGER_UNAVAILABLE"[\s\S]*data-action="refresh-runtime"/,'an unavailable command ledger must offer governed refresh, never exercise initialization');
assert.match(operations,/ready\?'command-intent-create':'command-context-initialize'/,'Command-by-Intent must expose initialization until an available governed command context exists, then provide the controlled intent action');
assert.match(app,/currentIncidentCommand\(\)\?\.incidentId/,'the initialization guard must use the canonical top-level incident-command identity');
assert.doesNotMatch(app,/currentIncidentCommand\(\)\?\.incident\?\.incidentId/,'command actions must not use the nonexistent nested incident-command identity');
assert.match(app,/vigiaApi\.proposeCommandIntent[\s\S]*Command intent confirmed for planning compilation/,'Command-by-Intent must persist through the governed API before success is shown');
assert.match(app,/Confirmation does not approve or apply a plan/,'Command-by-Intent must keep compilation separate from approval and mutation');
assert.match(app,/case'planning-proposal-review'[/\s\S]*vigiaApi\.recordPlanningDecision/,'planning proposals must use the governed human-review receipt endpoint');
assert.match(app,/Proposal approved for planning only; nothing was dispatched/,'planning review success must not imply application or dispatch');

assert.match(components,/\.vigia-state-label\{[^}]*display:inline-flex[^}]*align-items:center[^}]*max-width:100%[^}]*white-space:nowrap/,'shared StateLabel must stay aligned, bounded, and single-line');
assert.doesNotMatch(components,/\.vigia-state-label(?:::before|[^,{]*::before)/,'StateLabel must never reintroduce a circular pseudo-element marker');
assert.match(components,/touch-action:none/,'maps must own touch dragging without page-scroll interference');
assert.match(routesCss,/\.vigia-boot-map\{[^}]*background:#253a3b/,'cold-start map placeholders must use a map-toned surface rather than a gray or white flash');
assert.match(routesCss,/\.situation-map__canvas,\.incidents-map__canvas,\.incident-detail-map__canvas,\.intelligence-map__canvas,\.global-map__canvas\{padding:0/,'map canvases must fill their approved route surfaces');
assert.match(responsiveCss,/max-width:340px[\s\S]*?grid-template-columns:minmax\(0,1fr\)/,'320px and 200% zoom composition must reflow to one column');
assert.match(responsiveCss,/\.eoc-period-strip,\.operations-period-context,\.incident-saved-filters\{grid-template-columns:1fr\}/,'new operational context must reflow to one column on narrow viewports');
assert.match(responsiveCss,/prefers-reduced-motion:reduce/,'reduced-motion behavior must be explicit');

console.log('Operational hardening contract passed: route-owned hash state, retained map runtime, last-good startup, lifecycle UX, outcome funnel, and responsive integrity are enforced.');
