import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canonicalMap } from '../src/canonicalComponents.js';
import { focusMapLayer, layoutMapMarkers, mapAssetTruthFromHeaders, mapLayerTruth, mapModel, mapZoomForBounds, shouldPromoteMapLastGood, tileMap } from '../src/map.js';
import { vigiaArtifactInspector, vigiaLayerPanel } from '../src/operatorPrimitives.js';

const [map,canonical,operations,app,styles,html,packageJson,lock,server,visualQa,certifier,storage]=await Promise.all([
  Promise.all(['map.js','mapModel.js','mapRuntime.js','mapRuntimeState.js','mapStyle.js'].map(file=>readFile(new URL(`../src/${file}`,import.meta.url),'utf8'))).then(parts=>parts.join('\n')),
  readFile(new URL('../src/canonicalComponents.js',import.meta.url),'utf8'),
  readFile(new URL('../src/routes/operations.js',import.meta.url),'utf8'),
  Promise.all(['app.js','appActionController.js'].map(file=>readFile(new URL(`../src/${file}`,import.meta.url),'utf8'))).then(parts=>parts.join('\n')),
  readFile(new URL('../styles/components.css',import.meta.url),'utf8'),
  readFile(new URL('../index.html',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8').then(JSON.parse),
  readFile(new URL('../package-lock.json',import.meta.url),'utf8').then(JSON.parse),
  readFile(new URL('../server.mjs',import.meta.url),'utf8'),
  readFile(new URL('../../../scripts/visual-qa/final_white_capture.py',import.meta.url),'utf8'),
  Promise.all(['certify_anduril_crisis_os.mjs','certification/anduril_browser_copy_specs.mjs'].map(file=>readFile(new URL(`../../../scripts/${file}`,import.meta.url),'utf8'))).then(parts=>parts.join('\n')),
  readFile(new URL('../src/storage.js',import.meta.url),'utf8'),
]);

assert.equal(packageJson.dependencies['maplibre-gl'],'6.7.0','the recovered slippy-map engine must be exactly pinned');
assert.equal(lock.packages['node_modules/maplibre-gl'].version,'6.7.0');
assert.equal(typeof focusMapLayer,'function','the shared map facade must export every focus action consumed by the application runtime');
assert.match(map,/Map as MapLibreMap/);assert.match(map,/new MapLibreMap\(/);assert.match(map,/dragPan: true/);
assert.match(map,/import \{ esc \} from '\.\/components\.js\?v=2\.1\.0'/,'selected DOM markers must import the shared HTML encoder');
assert.match(map,/import \{ validCoordinate \} from '\.\/viewModel\.js\?v=2\.1\.0'/,'selected DOM markers must import the canonical coordinate guard');
assert.match(map,/gl\.dragPan\.isEnabled\(\)/,'native drag state must be observable');
assert.match(map,/type: 'geojson'/);assert.match(map,/cluster: true/);assert.match(map,/type: 'circle'/);
assert.match(map,/new MapLibreMarker/,'one exceptional selected marker may remain accessible in the DOM');
assert.match(map,/mapDomMarkerCount/);assert.match(map,/mapWebglMarkerCount/);
assert.doesNotMatch(map,/addEventListener\('pointermove'/,'the application must not simulate map pan');
assert.doesNotMatch(map,/--map-drag-[xy]/,'the application must not CSS-transform a stitched raster during drag');
assert.doesNotMatch(map,/\.setStyle\(/,'filter, selection, and refresh paths must not rebuild the style');
assert.match(map,/\.setData\(/,'changed canonical feature collections must update their source in place');
assert.match(map,/changed\(previous\.markers, next\.markers\)/,'identical source payloads must no-op');
assert.match(map,/if\(instance&&nextEnabled\)updateInstance\(map,next\)/,'a live map must retain its MapLibre instance while canonical state changes');
assert.match(map,/connectedMapParking/,'same-route renders must keep the persistent map connected while shell DOM is replaced');
assert.match(map,/parking\.append\(host\)/,'persistent map hosts must move through a connected parking node instead of detaching mid-interaction');
assert.doesNotMatch(canonical,/session\?\.authenticated===true&&state\?\.runtime\?\.status!=='error'/,'transient session refresh degradation must not destroy an already admitted last-good map renderer');
assert.match(canonical,/const enabled=state\?\.runtime\?\.status!=='error'&&coordinate!==null/,'retained admitted map scenes must remain renderable while refresh state is degraded');
assert.match(map,/map\.replaceWith\(next\)/,'an inactive map must atomically adopt fresh selection and availability state instead of retaining stale geography');
assert.match(map,/destroyMapInstance\(map\)/,'a live-to-unavailable transition must release the renderer before the truthful fallback replaces it');
assert.match(map,/raster-fade-duration': 0/,'governed raster layers must not fade through gray or white frames');
assert.match(storage,/mapThermal:\s*false/,'the optional external thermal raster must remain off until deliberately requested; governed thermal observations remain visible independently');
assert.match(map,/preserveDrawingBuffer: false/);
assert.match(map,/ResizeObserver/);assert.match(map,/next === size/,'map resize must be geometry-deduplicated');
assert.match(map,/beginMapDragTrace/);assert.match(map,/mapRouteRendersDuringDrag/);
assert.match(html,/maplibre-gl\.css\?v=6\.7\.0/);assert.match(styles,/\.maplibregl-canvas/);
assert.match(server,/\.mjs': 'text\/javascript; charset=utf-8'/,'the canonical nosniff server must serve MapLibre modules with JavaScript MIME');
assert.match(canonical,/map\.js\?v=3\.0\.0/,'all map consumers must share one module instance');
assert.match(operations,/canonicalMap\(\{state,incidents:\[incident\],selected:incident[\s\S]*scope:'OPERATIONS'/,'Operations must render its backend canonical map scene through the persistent shared renderer');
assert.match(operations,/vqa:'operations\.map-canvas'/,'Operations must expose a stable map target for browser certification');
assert.match(app,/'response-facility':'responseFacilities'/,'response-facility clicks must resolve against the response facility scene layer');
assert.match(app,/row\?\.properties\?\.facilityId/,'GeoJSON response facilities must resolve by their governed facility identifier');
assert.doesNotMatch(canonical,/resolvedScope==='GLOBAL'&&resolvedZoom<5/,'Global place labels must remain enabled at the default world zoom');
const dragRouteContract='["command-overview", "incidents", "incident-detail", "intelligence", "operations", "global-awareness"]';
assert.equal(visualQa.split(dragRouteContract).length-1,2,'both canonical browser capture paths must prove native drag on Operations');
assert.match(certifier,/\["command-overview", "incidents", "incident-detail", "intelligence", "operations", "global-awareness"\]\.map\(\(route\) => `map-drag-\$\{route\}-after\.png`\)/,'release certification must require Operations drag evidence');

for(const state of ['LOADING','LIVE','DEGRADED_PARTIAL','STALE_LAST_GOOD','STRUCTURED_FALLBACK','UNAVAILABLE']){
  assert.ok(map.includes(`'${state}'`),`map contract is missing ${state}`);
  assert.ok(styles.includes(`data-map-state="${state}"`),`map styles are missing ${state}`);
}
for(const sceneType of ['COMMAND_SITUATION','INCIDENT_INSPECTION','INTELLIGENCE_FORECAST','OPERATIONS_ASSIGNMENTS','INCIDENT_TACTICAL','GLOBAL_AWARENESS'])assert.ok(canonical.includes(sceneType),`canonical map component is missing ${sceneType}`);
for(const marker of ['x-vigia-provider','x-vigia-acquired-at','x-vigia-last-good-at','x-vigia-source-state','x-vigia-provenance'])assert.ok(server.includes(marker),`operator proxy is missing ${marker}`);
assert.match(map,/same-origin:\/backend\/api\/v1\/basemap/);assert.match(map,/basemapTileUrl\('imagery', '\{z\}', '\{x\}', '\{y\}'\)/);assert.match(map,/basemapTileUrl\('labels', '\{z\}', '\{x\}', '\{y\}'\)/);
assert.match(map,/raster-brightness-min': \.72/,'baked dark label pixels must receive a light, high-contrast treatment');
assert.match(map,/Retained operational context/,'a renderer failure must retain a non-blank operational fallback');

const staleHeaders=new Headers({'x-vigia-source-state':'stale','x-vigia-provider':'Governed provider','x-vigia-acquired-at':'2026-08-25T11:00:00.000Z','x-vigia-last-good-at':'2026-08-25T11:00:00.000Z','x-vigia-provenance':'governed:https://provider.example'}),staleTruth=mapAssetTruthFromHeaders(staleHeaders,{observedAt:'2026-08-25T12:00:00.000Z'});
assert.equal(staleTruth.stale,true);assert.equal(staleTruth.lastSuccessAt,null);assert.equal(staleTruth.lastGoodAt,'2026-08-25T11:00:00.000Z');
assert.equal(shouldPromoteMapLastGood({sourceState:'current',stale:false,degraded:false},{decoded:true}),true);assert.equal(shouldPromoteMapLastGood({sourceState:'stale',stale:true,degraded:false},{decoded:true}),false);

assert.equal(mapModel(),null,'missing spatial context must not resolve to a plausible default coordinate');
assert.match(tileMap({coordinate:[-8,40],zoom:5.42,fitBounds:false}),/&quot;zoom&quot;:5\.42/,'retained fitted and native cameras must not snap to an integer zoom during a route render');
assert.equal(mapZoomForBounds({coordinate:[-8,40],bounds:{west:-8.4,south:39.9,east:-7.6,north:40.7},zoom:12,tiles:4}),9);
const layer=value=>({state:'READY',authority:'TEST_CANONICAL',value,inventory:{total:value.length,returned:value.length,truncated:false}}),mapScene={schemaVersion:'vigia.operator-map-scene.v1',layers:{observedGeometry:layer([{type:'Feature',properties:{authoritativePerimeter:false},geometry:{type:'Polygon',coordinates:[[[-8.11,40.09],[-8.09,40.09],[-8.09,40.11],[-8.11,40.09]]]}}]),observations:layer([{id:'observation:one',coordinate:[-8.1,40.1]}])}};
const truth=mapLayerTruth({...mapScene,currentness:{generatedAt:'2026-08-25T12:00:00.000Z'}},['observedGeometry','forecastGeometry']);assert.equal(truth.layers.observedGeometry.authority,'TEST_CANONICAL');assert.equal(truth.layers.forecastGeometry.state,'UNAVAILABLE');
const rendered=tileMap({coordinate:[-8.1,40.1],zoom:8,enabled:true,mapScene,scope:'INCIDENTS',sceneIdentity:'INCIDENT_INSPECTION:incident:one',sceneType:'INCIDENT_INSPECTION',selectedIncidentId:'incident:one',declaredLayers:['incidentPoints','observedGeometry','observations'],visibleLayers:['incidentPoints','observations']});
assert.match(rendered,/data-map-engine="maplibre-gl"/);assert.match(rendered,/data-map-engine-version="6\.7\.0"/);assert.match(rendered,/data-map-renderer="webgl"/);assert.match(rendered,/data-map-drag-pan="enabled"/);assert.match(rendered,/data-map-marker-strategy="webgl-clustered-geojson"/);assert.match(rendered,/data-map-scene-identity="INCIDENT_INSPECTION:incident:one"/);
const responseFacility={type:'Feature',id:'response-facility:one',geometry:{type:'Point',coordinates:[-8.08,40.11]},properties:{facilityId:'facility:one',facilityKind:'FIRE_STATION',label:'Station One',source:'Governed facility source',updatedAt:'2026-08-25T11:50:00.000Z',capacityAvailability:'UNKNOWN',capacityState:'UNKNOWN'}},responseRoute={type:'Feature',id:'response-route:one',geometry:{type:'LineString',coordinates:[[-8.08,40.11],[-8.1,40.1]]},properties:{facilityId:'facility:one',travelTimeMinutes:12,routeDistanceKm:8.5,routeCheckedAt:'2026-08-25T11:55:00.000Z',routeSource:'Governed road router',roadClosureState:'CLEAR',accessConstraintState:'NOT_ROUTING_CONSTRAINED'}},responseSurface={type:'Feature',id:'response-surface:one',geometry:{type:'Polygon',coordinates:[[[-8.12,40.08],[-8.06,40.08],[-8.06,40.13],[-8.12,40.08]]]},properties:{band:'UNDER_15_MINUTES',source:'Governed road router',updatedAt:'2026-08-25T11:55:00.000Z'}},operationsScene={schemaVersion:'vigia.operator-map-scene.v1',sceneId:'OPERATIONS_ASSIGNMENTS:incident:one',sceneType:'OPERATIONS_ASSIGNMENTS',scope:'OPERATIONS',selectedIncidentId:'incident:one',selectionAssociation:{state:'MATCHED'},camera:{center:[-8.1,40.1],zoom:9},layerSet:['incidentPoints','responseCoverageSurface','responseCoverageRoutes','responseFacilities'],controls:['layers','focus','resources','zoom'],layers:{incidentPoints:layer([{incidentId:'incident:one',name:'Incident one',coordinate:[-8.1,40.1],state:'VERIFIED_CURRENT'}]),responseCoverageSurface:layer([responseSurface]),responseCoverageRoutes:layer([responseRoute]),responseFacilities:layer([responseFacility])},currentness:{generatedAt:'2026-08-25T12:00:00.000Z'}};
const operationsMap=canonicalMap({state:{selectedIncidentId:'incident:one',mapLayerVisibility:{},mapSceneCameras:{},mapFocusedLayer:{},runtime:{status:'ready',session:{authenticated:true}}},incidents:[{incident:{id:'incident:one',label:'Incident one',coordinate:[-8.1,40.1]}}],selected:{incident:{id:'incident:one',label:'Incident one',coordinate:[-8.1,40.1]}},mapScene:operationsScene,scope:'OPERATIONS',vqa:'operations.map-canvas'});
assert.match(operationsMap,/data-map-scene-owner="OPERATIONS"/);assert.match(operationsMap,/data-map-scene-type="OPERATIONS_ASSIGNMENTS"/);assert.match(operationsMap,/inspect-map-feature:response-facility:facility:one/);assert.match(operationsMap,/&quot;showLabels&quot;:true/,'global/default label visibility must be carried into renderer configuration');
const responsePanel=vigiaLayerPanel(operationsScene,{});assert.match(responsePanel,/>Response capability</);for(const label of ['Sampled road reachability','Road-routed response paths','Response facilities'])assert.match(responsePanel,new RegExp(label));assert.match(responsePanel,/map-layer-toggle:responseCoverageRoutes/);assert.match(responsePanel,/map-layer-toggle:responseFacilities/);
const responseInspector=vigiaArtifactInspector({layerName:'responseFacilities',layer:operationsScene.layers.responseFacilities,item:responseFacility,scene:operationsScene});assert.match(responseInspector,/Station One/);assert.match(responseInspector,/12 min/);assert.match(responseInspector,/Source: Governed facility source\./);assert.match(responseInspector,/does not prove current capacity, dispatch, assignment, or arrival/);
const collisionModel=mapModel({coordinate:[-8.1,40.1],zoom:8,tiles:4}),collisionLayout=layoutMapMarkers([{coordinate:[-8.1,40.1],label:'Selected',selected:true},{coordinate:[-8.1001,40.1001],label:'One'},{coordinate:[-8.1002,40.1002],label:'Two'}],collisionModel);assert.equal(collisionLayout.filter(item=>item.selected).length,1);

console.log('Map contract passed: MapLibre GL 6.7.0 native drag, persistent route instances including Operations, WebGL clustering, response-capability inspection, grouped controls, readable labels, and governed same-origin tiles are mandatory.');
