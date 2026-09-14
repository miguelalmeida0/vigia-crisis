import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderRoute } from '../src/routes/index.js';
import { applyIncidentSelection, createLatestIncidentRequestGuard, revalidateSelectedEvidence } from '../src/incidentSelection.js';
import { vigiaArtifactInspector, vigiaIncidentSelect, vigiaLayerPanel } from '../src/operatorPrimitives.js';
import { phaseBFixture } from './phase-b-fixture.mjs';

const routes=['command-overview','incidents','incident-detail','intelligence','operations','reports-analytics','global-awareness'];
const [appSource,primitiveSource,incidentSource,globalSource,reportsSource,componentStyles,canonicalComponentSource,mapSource]=await Promise.all([
  Promise.all(['app.js','appActionController.js'].map(file=>readFile(new URL(`../src/${file}`,import.meta.url),'utf8'))).then(parts=>parts.join('\n')),
  readFile(new URL('../src/operatorPrimitives.js',import.meta.url),'utf8'),
  readFile(new URL('../src/routes/incidents.js',import.meta.url),'utf8'),
  readFile(new URL('../src/routes/globalAwareness.js',import.meta.url),'utf8'),
  readFile(new URL('../src/routes/reportsAnalytics.js',import.meta.url),'utf8'),
  readFile(new URL('../styles/components.css',import.meta.url),'utf8'),
  readFile(new URL('../src/canonicalComponents.js',import.meta.url),'utf8'),
  Promise.all(['map.js','mapModel.js','mapRuntime.js','mapRuntimeState.js','mapStyle.js'].map(file=>readFile(new URL(`../src/${file}`,import.meta.url),'utf8'))).then(parts=>parts.join('\n')),
]);
assert.match(appSource,/event\.key==='Escape'&&state\.navOpen/,'Escape must dismiss the responsive navigation');
assert.match(appSource,/event\.key==='Escape'&&document\.querySelector\('\.vigia-dialog'\)/,'Escape must dismiss the active modal through its focus-restoring close path');
assert.match(appSource,/wrap\.addEventListener\('click',[\s\S]*?void onAction\(target\.dataset\.action\)/,'drawer controls must bridge back into the shared action controller');
assert.match(appSource,/route==='incidents'\?envelope\(state,'incidents'\)/,'Incidents map controls must inspect the Incidents envelope scene');
assert.doesNotMatch(appSource,/INCIDENT_INSPECTION:\$\{id\}/,'incident selection must retain the active backend scene identity instead of inventing a selected-only scene');
assert.match(appSource,/restoreStableSearchInput\(app,stableIncidentSearch,'\[data-input="incident-search"\]'/,'canonical refreshes must pass the live Incidents search DOM node to the identity-preserving helper');
const stableSearchSource=await readFile(new URL('../src/stableSearchInput.js',import.meta.url),'utf8');
assert.match(stableSearchSource,/fresh\.replaceWith\(stable\)/,'the shared helper must replace the fresh input with the original DOM node');
assert.match(appSource,/stableIncidentSearch\.setSelectionRange\(searchSelection\.start,searchSelection\.end,searchSelection\.direction\)/,'canonical refreshes must retain the native search selection and caret');
for(const source of [incidentSource,globalSource]){assert.match(source,/vigiaSelect/,'approved route filters must use the shared VIGIA select');assert.doesNotMatch(source,/<select|<option/,'approved route filters must not render native placeholder dropdowns');}
for(const marker of ['role="combobox"','aria-haspopup="listbox"','role="listbox"','role="option"','aria-selected'])assert.match(primitiveSource,new RegExp(marker),`shared VIGIA select is missing ${marker}`);
const switcherIncidents=Array.from({length:61},(_,index)=>({incident:{id:`incident:${index}`,label:`Incident ${index}`,status:'NEEDS_REVALIDATION'}}));
const switcherHtml=vigiaIncidentSelect({value:'incident:60',incidents:switcherIncidents,openId:'operation-incident'});
assert.match(switcherHtml,/data-action="select-operation-incident:incident:60"[\s\S]*aria-selected="true"|aria-selected="true"[\s\S]*data-action="select-operation-incident:incident:60"/,'the selected incident must remain an explicit accessible option beyond the visible cohort limit');
for(const marker of ['role="tablist"','role="tab"','role="tabpanel"','aria-controls','aria-labelledby'])assert.match(reportsSource,new RegExp(marker),`Reports controlled tabs are missing ${marker}`);
for(const heading of ['Decision Summary','Outcome Analysis','System Performance','Situation Quality'])assert.match(reportsSource,new RegExp(heading),`Reports is missing distinct ${heading} content`);
assert.match(appSource,/case'quality-drilldown'[\s\S]*incidentLabel\(incident\)/,'Situation Quality drill-downs must use the shared human incident label');
assert.doesNotMatch(appSource,/case'quality-drilldown'[\s\S]*missing:id/,'Situation Quality drill-downs must not expose raw canonical IDs as primary labels');
assert.match(canonicalComponentSource,/globalSelectionCenter=resolvedScope==='GLOBAL'&&stateSelectedId\?selectedMapCoordinate:null/,'Global marker selection must outrank a persisted world camera');
assert.match(canonicalComponentSource,/resolvedZoom=globalSelectionCenter\?Math\.max\([^)]*,7\)/,'Global marker selection must zoom to an incident-readable level');
assert.match(canonicalComponentSource,/storedAssociationMatches=!selectedId\|\|String\(storedCamera\.selectedIncidentId/,'a persisted camera must be associated with the selected canonical incident before reuse');
assert.match(appSource,/selectedIncidentId:String\(id\)/,'atomic incident selection must associate the replacement camera with the selected incident');
assert.match(mapSource,/if\(selectionChanged\)gl\.jumpTo\(\{center:next\.center,zoom:next\.zoom\}\)/,'incident selection must update camera atomically before a layout resize can interrupt it');
assert.match(mapSource,/marker\.addEventListener\('click',[\s\S]*vigia:map-action/,'selected DOM marker buttons must bypass MapLibre click interception and dispatch the shared map action');
assert.match(appSource,/case'map-focus-layer':[\s\S]*?persist\(\);let current=map,focused=focusMapLayer\(current,value\);if\(!focused\)\{render\(\);current=activeMap\(\);focused=focusMapLayer\(current,value\);\}/,'View on map must focus the retained live map immediately and reconcile first only when a hidden layer is absent');
assert.match(appSource,/mapFocus\.push\([\s\S]*?requestAnimationFrame\(\(\)=>\{[\s\S]*?requestAnimationFrame\(\(\)=>render\(\)\)/,'successful spatial focus must be measured before deferred route reconciliation');
assert.match(appSource,/refreshAfterMutation\(message\)[\s\S]*?loadIncident\(state\.selectedIncidentId,\{quiet:true,force:true\}\)/,'consequential actions must refresh the selected incident projection directly after their receipt');
assert.doesNotMatch(appSource,/refreshAfterMutation\(message\)\{[^}]*await refreshRuntime\(\{quiet:true\}\);toast/,'consequential read-after-write proof must not depend on an abortable global refresh');
assert.match(appSource,/beforeRevision===afterRevision[\s\S]*?loadIncident\(state\.selectedIncidentId,\{quiet:true,force:true\}\)/,'unchanged post-mutation revisions must trigger bounded forced revalidation');
assert.match(appSource,/CREATE_PROTECTION_WORKFLOW',revisionScope:'protection'/,'protection creation must prove its own aggregate transition rather than an unrelated operational-period revision');
assert.match(appSource,/portfolio\.current\?\?portfolio\.latestExercise\?\?null/,'post-close verification must retain the just-closed controlled exercise without treating it as the active period');
assert.match(appSource,/vigiaGlobalRefreshPending=String\(globalRefreshPending\)[\s\S]*vigiaIncidentLoadPending=String\(incidentLoadPending\)[\s\S]*hydrationIdle=!globalRefreshPending&&!incidentLoadPending/,'operator runtime must expose a truthful idle boundary for global and selected-incident hydration');
assert.match(appSource,/activeIncidentLoad\?\.id===String\(id\)&&\(!force\|\|coalesce\)/,'same-incident loads must support explicit coalescing during canonical global refresh');
assert.match(appSource,/force:true,coalesce:true/,'global refresh must not supersede an in-flight route load for the same selected incident');
assert.match(appSource,/pendingOperations\.governedMutation=true[\s\S]*finally[\s\S]*pendingOperations\.governedMutation=false[\s\S]*lastGovernedMutationCompletedAt=new Date\(\)\.toISOString\(\)/,'governed mutations must expose a foreground lifecycle boundary and record their completion');
assert.match(appSource,/function backgroundRefreshEligible\(\)[\s\S]*pendingOperations\.governedMutation\|\|activeGlobalRequest[\s\S]*Date\.now\(\)-lastMutationAt<30_000[\s\S]*\.vigia-dialog[\s\S]*state\.openSelectId[\s\S]*Date\.now\(\)-lastInteractionAt>=15_000/,'periodic global refresh must yield to foreground mutations, open controls, and recent operator interaction');
assert.match(appSource,/function noteOperatorInteraction\(\)[\s\S]*lastOperatorInteractionAt=Date\.now\(\)[\s\S]*addEventListener\('click',[\s\S]*noteOperatorInteraction\(\)[\s\S]*addEventListener\('keydown',[\s\S]*noteOperatorInteraction\(\)/,'pointer and keyboard work must reserve a bounded foreground interaction window');
assert.match(appSource,/\[type="radio"\]:checked[\s\S]*:not\(\[type="radio"\]\)/,'shared governed forms must read the checked radio before ordinary text fields');
assert.doesNotMatch(appSource,/:checked,\.vigia-overlay \[data-domain-field=/,'a broad fallback selector must never override the operator-selected radio by DOM order');
assert.match(componentStyles,/\.vigia-state-label\{[^}]*display:inline-flex[^}]*align-items:center[^}]*max-width:100%[^}]*white-space:nowrap/,'shared StateLabel must stay aligned, bounded, and single-line');
assert.doesNotMatch(componentStyles,/\.vigia-state-label(?:::before|[^,{]*::before)/,'StateLabel must not use a pseudo-element status marker');

const primitiveScene={sceneId:'INTELLIGENCE_FORECAST:incident:test',sceneType:'INTELLIGENCE_FORECAST',layerSet:['incidentPoints','observedGeometry','forecastGeometry','observations','weather','resources','roads'],currentness:{generatedAt:'2026-08-25T12:00:00.000Z'},selectionAssociation:{state:'MATCHED'},layers:{incidentPoints:{state:'READY',authority:'BACKEND_CANONICAL_MAP_SCENE',value:[{incidentId:'incident:test',coordinate:[-8.1,40.1]}]},observedGeometry:{state:'UNAVAILABLE',authority:'BACKEND_CANONICAL_MAP_SCENE',reason:'official_perimeter_not_attached',value:[]},forecastGeometry:{state:'UNAVAILABLE',authority:'FORECAST_SCIENCE_BOUNDARY',reason:'forecast_geometry_not_admitted_for_incident',value:[]},observations:{state:'READY',authority:'AGENT1_RELIABILITY_COMPATIBILITY_PROJECTION',value:[{id:'thermal:test',source:'VIIRS',platform:'NOAA-20',instrument:'VIIRS',observedAt:'2026-08-25T11:58:00.000Z',frpMw:12.5,geolocationUncertaintyM:375}]},weather:{state:'READY',authority:'AGENT1_RELIABILITY_COMPATIBILITY_PROJECTION',value:[{source:'IPMA',observedAt:'2026-08-25T11:55:00.000Z',temperatureC:31,humidityPercent:24,windSpeedKph:24}]},resources:{state:'READY',authority:'INCIDENT_COMMAND',value:[{resourceId:'resource:one'}]},roads:{state:'UNAVAILABLE',authority:'BACKEND_CANONICAL_MAP_SCENE',reason:'road_context_not_projected',value:[]}}};
const layerPanel=vigiaLayerPanel(primitiveScene,{}),layerPanelPrimary=layerPanel.split('<details class="technical-details">')[0];
for(const group of ['Incident','Observations','Environment','Operations','Context'])assert.match(layerPanel,new RegExp(`<h3>${group}</h3>`),`layer panel is missing the ${group} group`);
assert.ok(layerPanel.indexOf('Incident locations')<layerPanel.indexOf('Observed geometry'),'available incident layers must sort before unavailable incident layers');
assert.match(layerPanel,/4 of 9 available/,'layer panel must count only data-backed available layers when basemap transport health is not supplied');
for(const layerName of ['basemapImagery','basemapLabels'])assert.match(layerPanel,new RegExp(`data-layer-name="${layerName}" data-layer-state="NOT_MEASURED"`),`${layerName} must not receive synthetic READY state`);
assert.doesNotMatch(layerPanelPrimary,/BACKEND_CANONICAL_MAP_SCENE|AGENT1_RELIABILITY_COMPATIBILITY_PROJECTION|FORECAST_SCIENCE_BOUNDARY/,'raw authorities must stay out of the primary layer controls');
assert.match(layerPanel,/Technical layer provenance[\s\S]*BACKEND_CANONICAL_MAP_SCENE/,'raw authority must remain available in technical disclosure');
const fullArtifact=vigiaArtifactInspector({layerName:'observations',layer:primitiveScene.layers.observations,scene:primitiveScene}),partialArtifact=vigiaArtifactInspector({layerName:'weather',layer:{state:'DEGRADED',authority:'WEATHER_OBSERVATION',reason:'station_distance_exceeds_preferred_range',value:[{source:'IPMA'}]},scene:primitiveScene});
for(const marker of ['Thermal detections can confirm observed heat','Fire radiative power','12.5 MW','Location uncertainty','375 m','Source and limits','Technical provenance'])assert.match(fullArtifact,new RegExp(marker),`full artifact inspection is missing ${marker}`);
for(const marker of ['current environmental context','Source: IPMA','Station distance exceeds preferred range','Updated'])assert.match(partialArtifact,new RegExp(marker),`partial artifact inspection is missing ${marker}`);
let buttons=0;
for(const route of routes){
  const html=renderRoute(route,phaseBFixture());
  const rendered=[...html.matchAll(/<button\b[^>]*>/g)].map(match=>match[0]);
  const dead=rendered.filter(tag=>!tag.includes('data-action=')&&!tag.includes('disabled'));
  assert.deepEqual(dead,[],`${route} has enabled buttons without a controller`);
  assert.match(html,new RegExp(`route--${route}`));
  buttons+=rendered.length;
}

const selectionState={selectedIncidentId:'incident:A',selectedEvidenceId:'evidence:A'};
assert.equal(applyIncidentSelection(selectionState,'incident:B'),true);
assert.deepEqual({selectedIncidentId:selectionState.selectedIncidentId,selectedEvidenceId:selectionState.selectedEvidenceId},{selectedIncidentId:'incident:B',selectedEvidenceId:null},'changing incidents must clear cross-incident evidence selection');
assert.equal(selectionState.incidentWorkspaceMemory['incident:A'].selectedEvidenceId,'evidence:A','prior evidence is remembered only under its own incident');
selectionState.selectedEvidenceId='evidence:B';
const validEvidence={intelligence:{value:{data:{evidenceGraph:{value:{evidence:[{id:'evidence:B'}]}}}}}};
assert.equal(revalidateSelectedEvidence(selectionState,'incident:B',validEvidence),false,'current-incident evidence must survive revalidation');
assert.equal(revalidateSelectedEvidence(selectionState,'incident:B',{intelligence:{value:{data:{evidenceGraph:{value:{evidence:[]}}}}}}),true,'evidence absent from the selected incident must be cleared');

const guard=createLatestIncidentRequestGuard(),committed={id:null};
const a=guard.start('incident:A'),b=guard.start('incident:B'),c=guard.start('incident:C');
assert.equal(a.controller.signal.aborted,true,'B must abort A');
assert.equal(b.controller.signal.aborted,true,'C must abort B');
for(const request of [b,a,c])if(guard.isCurrent(request))committed.id=request.id;
assert.equal(committed.id,'incident:C','out-of-order A/B/C completion must leave C selected');
assert.equal(guard.complete(c),true);

const ready=value=>({state:'READY',authority:'TEST_BACKEND',value}),base=phaseBFixture(),incidentA=structuredClone(base.runtime.canonical.globals.incidents.value.data.canonicalIncidents.value.incidents[0]),incidentB=structuredClone(incidentA);
incidentA.incident.id='incident:A';incidentA.incident.label='Alpha fire';incidentA.incident.status='ACTIVE';incidentA.incident.coordinate=[-8.2,40.1];
incidentB.incident.id='incident:B';incidentB.incident.label='Bravo fire';incidentB.incident.status='CONTAINED';incidentB.incident.coordinate=[-7.8,40.5];
const points=[{incidentId:'incident:A',label:'Alpha fire',state:'ACTIVE',coordinate:[-8.2,40.1]},{incidentId:'incident:B',label:'Bravo fire',state:'CONTAINED',coordinate:[-7.8,40.5]}],layer=value=>({state:'READY',authority:'TEST_MAP_SCENE',value,inventory:{total:value.length,returned:value.length,truncated:false}}),regionalScene={sceneType:'COMMAND_SITUATION',sceneId:'backend-command-scene',scope:'REGIONAL',focusIncidentId:'incident:A',selectedIncidentId:'incident:A',camera:{center:[-8,40.3],zoom:7,bbox:{west:-8.4,south:39.9,east:-7.6,north:40.7}},bounds:{west:-8.4,south:39.9,east:-7.6,north:40.7},layerSet:['incidentPoints','observations','thermalSupport','wind','weather'],controls:['layers','focus','thermal','measure','zoom'],labelPolicy:'PRIORITY_INCIDENTS',currentness:{generatedAt:'2026-08-25T12:00:00.000Z'},layers:{incidentPoints:layer(points),observations:layer([]),thermalSupport:layer([]),wind:layer([]),weather:layer([])}},presentation={focusedIncidentId:'incident:A',priorityIncidents:points.map((point,index)=>({...point,name:point.label,priority:index+1})),activity:points.map(point=>({incidentId:point.incidentId,incident:point.label,state:point.state})),telemetry:{}};
base.selectedIncidentId='incident:B';
base.mapSceneCameras={'backend-command-scene':{center:[-7.8,40.5],selectedIncidentId:'incident:B'}};
base.runtime.canonical.globals.commandOverview.value.data.incidents=ready({incidents:[incidentA,incidentB]});
base.runtime.canonical.globals.commandOverview.value.data.commandPresentation=ready(presentation);
base.runtime.canonical.globals.commandOverview.value.data.mapScene=ready(regionalScene);
base.runtime.canonical.globals.incidents.value.data.canonicalIncidents=ready({incidents:[incidentA,incidentB],transitions:[],controlPlane:{actions:[]},governedWork:[]});
const incidentsScene={...regionalScene,sceneType:'INCIDENT_INSPECTION',sceneId:'backend-incidents-regional',scope:'INCIDENTS',camera:{...regionalScene.camera,zoom:10},layerSet:['incidentPoints','observedGeometry','thermalSupport','observations','weather','wind','contextAssets'],labelPolicy:'SELECTED_WITH_NEARBY_CONTEXT',layers:{...regionalScene.layers,observedGeometry:layer([]),contextAssets:layer([])}};
base.runtime.canonical.globals.incidents.value.data.mapScene=ready(incidentsScene);
const detailScene={...regionalScene,sceneType:'INCIDENT_TACTICAL',sceneId:'backend-incident-B-tactical',scope:'INCIDENT_DETAIL',focusIncidentId:'incident:B',selectedIncidentId:'incident:B',camera:{center:[-7.8,40.5],zoom:12,bbox:{west:-7.9,south:40.4,east:-7.7,north:40.6}},layerSet:['incidentPoints','observedGeometry','thermalSupport','observations','weather','wind','controlLines','divisions','stagingAreas','bases','resources','locations','roads','contextAssets'],labelPolicy:'TACTICAL_FEATURES',layers:{...regionalScene.layers,incidentPoints:layer([points[1]]),observedGeometry:layer([]),controlLines:layer([]),divisions:layer([]),stagingAreas:layer([]),bases:layer([]),resources:layer([]),locations:layer([]),roads:layer([]),contextAssets:layer([])}};
base.runtime.canonical.incidents['incident:B']={detail:{value:{...base.runtime.canonical.incidents['incident:phase-b'].detail.value,data:{...base.runtime.canonical.incidents['incident:phase-b'].detail.value.data,canonicalIncident:ready(incidentB),mapScene:ready(detailScene)}}}};
const commandHtml=renderRoute('command-overview',base);
assert.match(commandHtml,/data-map-selected-incident="incident:B"/,'operator selection must outrank backend command focus');
assert.match(commandHtml,/data-map-scene-identity="backend-command-scene"/,'backend scene identity must own the rendered map');
assert.match(commandHtml,/data-map-camera-source="OPERATOR_OVERRIDE"/,'in-place focus must be an explicit operator camera override');
assert.match(commandHtml,/data-map-center="-7\.8,40\.5"/,'map camera must synchronize with the selected incident');
assert.match(commandHtml,/data-map-declared-layers="incidentPoints,observations,thermalSupport,wind,weather"/,'backend Command layerSet must not be inflated by local layers');
assert.match(commandHtml,/data-map-scene-contract-source="BACKEND_MAP_SCENE"/);
assert.match(commandHtml,/priority-row[\s\S]*Bravo fire[\s\S]*data-id="incident:B" aria-pressed="true"/,'command priority rail must synchronize with the selected incident');
assert.match(commandHtml,/data-action="open-incident"[^>]*data-id="incident:B"/,'deliberate Review action must open the selected workspace');
assert.doesNotMatch(commandHtml,/data-action="select-incident:/,'command rows and markers must not navigate implicitly');
base.incidentStateFilter='ALL';
const incidentsHtml=renderRoute('incidents',base);
assert.match(incidentsHtml,/data-map-selected-incident="incident:B"/,'a filter must not fork map selection from canonical selectedIncidentId');
assert.match(incidentsHtml,/data-map-declared-layers="incidentPoints,observedGeometry,thermalSupport,observations,weather,wind,contextAssets"/,'Incidents must retain its backend-owned inspection layer set');
assert.match(incidentsHtml,/data-map-scene-identity="backend-incidents-regional"/,'Incidents must consume its own backend-owned regional inspection scene');
const incidentsMarkerConfig=incidentsHtml.match(/&quot;markers&quot;:(\{.*?\}),&quot;features&quot;:/s)?.[1]??'';
assert.equal((incidentsMarkerConfig.match(/&quot;kind&quot;:&quot;incident&quot;/g)??[]).length,2,'Incidents must preserve nearby canonical incident context in the WebGL source instead of collapsing the map to the selected detail');
assert.doesNotMatch(incidentsHtml,/data-map-scene-identity="backend-incident-B-scene"/,'Incidents must not borrow the selected Incident Detail scene');
assert.match(incidentsHtml,/incident-preview-body[\s\S]*Bravo fire/,'filtered inventory must retain the canonical selected incident context');
console.log(`Interaction contract passed: ${routes.length} routes, ${buttons} buttons, zero dead controls.`);
