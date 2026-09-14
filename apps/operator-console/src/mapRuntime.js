import {
  Map as MapLibreMap, Marker as MapLibreMarker, ScaleControl,
} from '../assets/vendor/maplibre-gl/maplibre-gl.mjs';
import { esc } from './components.js?v=2.1.0';
import { basemapTileUrl } from './vigiaApi.js?v=2.1.0';
import { beginMapDragTrace, recordMapHandler } from './mapPerformance.js?v=2.2.0';
import { safeJson } from './mapModel.js?v=3.0.0';
import { mapStyle } from './mapStyle.js?v=3.0.0';
import {
  MAP_STATES, initializeMapRuntime, mapInstances, mapRuntime, parseConfig,
  persistentHosts, sceneRuntime,
} from './mapRuntimeState.js?v=3.0.0';
import { validCoordinate } from './viewModel.js?v=2.1.0';
import {observeMapSources} from './mapSourceManager.js';

function updateState(map, state, message, { failure = '', retry = false } = {}) {
  if (!MAP_STATES.includes(state)) return;
  map.dataset.mapState = state; map.dataset.basemapState = state === 'LIVE' ? 'ready' : state.toLowerCase(); map.dataset.mapFailureClass = failure;
  const scene=sceneRuntime(map);scene.state=state;scene.failureClass=failure||null;
  const source = map.querySelector('.tile-map__source'), text = source?.querySelector('span'), button = source?.querySelector('button');
  if (text) text.textContent = message; if (button) button.hidden = !retry;
  map.querySelector('[data-map-fallback-meta]')?.setAttribute('aria-hidden', ['LIVE', 'LOADING', 'DEGRADED_PARTIAL', 'STALE_LAST_GOOD'].includes(state) ? 'true' : 'false');
  map.dispatchEvent(new CustomEvent('vigia:map-state', { bubbles: true, detail: { state, sceneIdentity: map.dataset.mapSceneIdentity } }));
}

function createSelectedMarker(config, instance, map) {
  instance.selectedMarker?.remove(); instance.selectedMarker = null; map.dataset.mapDomMarkerCount = '0';
  if (!config.selected || !validCoordinate(config.selected.coordinate)) return;
  const marker = document.createElement('div'),classification=String(config.selected.classification??'').toLowerCase().replaceAll('_','-'); marker.className = `tile-map__marker tile-map__marker--${esc(config.selected.tone??'critical')} tile-map__marker--classification-${esc(classification||'unclassified')} is-selected has-visible-label`;
  marker.dataset.mapFeatureId = config.selected.identifier ?? ''; marker.setAttribute('role','group'); marker.setAttribute('aria-label', `${config.selected.label ?? 'Selected incident'} marker actions`);
  marker.innerHTML = `<button type="button" class="tile-map__marker-target" data-action="${esc(config.selected.action??'')}" aria-label="Open Quicklook for ${esc(config.selected.label??'selected incident')}"><span></span></button><b><strong>${esc(config.selected.short || config.selected.label || 'Selected incident')}</strong><small>${config.selected.status?`<em class="tile-map__marker-state">${esc(config.selected.status)}</em> · `:''}${esc(config.selected.meta||'Observation time unavailable')}</small><span class="tile-map__marker-actions"><button type="button" data-action="${esc(config.selected.openAction??'')}">Open incident workspace</button></span></b>`;
  marker.addEventListener('click',event=>{const target=event.target.closest?.('[data-action]');if(!target?.dataset.action)return;event.preventDefault();event.stopPropagation();target.focus({preventScroll:true});map.dispatchEvent(new CustomEvent('vigia:map-action',{bubbles:true,detail:{action:target.dataset.action}}));});
  instance.selectedMarker = new MapLibreMarker({ element: marker, anchor: 'center' }).setLngLat(config.selected.coordinate).addTo(instance.gl); map.dataset.mapDomMarkerCount = '1';
}

function emitCamera(map, gl, reason) {
  const center = gl.getCenter(), zoom = gl.getZoom(); map.dataset.mapCenter = `${center.lng},${center.lat}`; map.dataset.mapZoom = String(zoom); map.dataset.mapCameraChangeReason = reason; sceneRuntime(map).cameraChangeReason = reason;
  map.dispatchEvent(new CustomEvent('vigia:map-camera-change', { bubbles: true, detail: { center: [center.lng, center.lat], zoom, reason, instanceId: map.dataset.mapInstanceId, sceneIdentity: map.dataset.mapSceneIdentity, selectedIncidentId: map.dataset.mapSelectedIncident || null } }));
}

function activateMap(map) {
  if (mapInstances.has(map) || map.dataset.mapEnabled !== 'true') return;
  initializeMapRuntime(map); const config = parseConfig(map), container = map.querySelector('.tile-map__gl');
  if (!config || !container) { updateState(map, 'UNAVAILABLE', 'Map configuration unavailable', { failure: 'INVALID_MAP_CONFIG', retry: true }); return; }
  const startedAt = performance.now(), scene = sceneRuntime(map); map.dataset.mapShellAt=String(startedAt); let gl;
  try { gl = new MapLibreMap({ container, style: mapStyle(config,{tier:0}), center: config.center, zoom: config.zoom, ...(config.fitBounds?{bounds:[[config.fitBounds[0],config.fitBounds[1]],[config.fitBounds[2],config.fitBounds[3]]],fitBoundsOptions:{padding:34,maxZoom:config.zoom}}:{}), minZoom: 2, maxZoom: 18, dragPan: true, keyboard: true, doubleClickZoom: true, scrollZoom: false, touchZoomRotate: true, attributionControl: false, fadeDuration: 0, preserveDrawingBuffer: false, trackResize: true }); }
  catch (error) { scene.failures += 1; updateState(map, 'STRUCTURED_FALLBACK', 'Governed map renderer unavailable', { failure: String(error?.message ?? error), retry: true }); return; }
  const instance = { gl, config, overlaysReady:false, baseTileReady:false, selectedMarker: null, resizeObserver: null, dragging: false, pointerPostRenderPending: false, pointerPostRenderSamples: [], rendered: 0, sourceDataEvents: 0 };
  const loadContext=()=>{if(instance.overlaysReady||!gl.getStyle())return;const full=mapStyle(instance.config);for(const [id,source]of Object.entries(full.sources)){if(!gl.getSource(id))gl.addSource(id,source);else if(source.type==='geojson')gl.getSource(id).setData(source.data);}for(let i=0;i<full.layers.length;i++){const layer=full.layers[i];if(!gl.getLayer(layer.id))gl.addLayer(layer,full.layers.slice(i+1).find(l=>gl.getLayer(l.id))?.id);}instance.overlaysReady=true;map.dataset.mapOverlaysSubmittedAt=String(performance.now());map.dataset.mapTier='3';};
  map.dataset.mapInstanceCreatedAt=String(performance.now());map.dataset.mapCameraReadyAt=String(performance.now());map.dataset.mapTier='0';
  gl.once('load',()=>{instance.contextTimer=setTimeout(loadContext,1500);});
  observeMapSources(gl,map,instance);
  gl.addControl(new ScaleControl({maxWidth:80,unit:'metric'}),'bottom-left');
  mapInstances.set(map, instance); map.dataset.mapDragPanEnabled = String(gl.dragPan.isEnabled()); map.dataset.mapNativeDrag = 'true'; map.dataset.mapTouchZoomEnabled = String(gl.touchZoomRotate.isEnabled()); map.dataset.mapKeyboardEnabled = String(gl.keyboard.isEnabled()); map.dataset.mapCanvasPersistence = 'persistent';
  map.dataset.mapWheelZoomPolicy='focus-or-click';map.dataset.mapWheelZoomEnabled='false';
  map.dataset.mapDomMarkerCount = '0'; map.dataset.mapWebglMarkerCount = String(config.markers?.features?.length ?? 0); map.dataset.mapRouteRendersDuringDrag = '0';
  gl.on('dragstart', () => { instance.dragging = true; map.classList.add('is-dragging'); map.dataset.mapDragRouteRenderStart = document.querySelector('#app')?.dataset.routeRenderCount ?? '0'; beginMapDragTrace(map, { engine: 'maplibre-gl-6.7.0-native-drag' }); });
  gl.on('dragend', () => { instance.dragging = false; map.classList.remove('is-dragging'); const start = Number(map.dataset.mapDragRouteRenderStart) || 0, end = Number(document.querySelector('#app')?.dataset.routeRenderCount) || 0; map.dataset.mapRouteRendersDuringDrag = String(end - start); });
  gl.on('movestart', event => { if (event.originalEvent) beginMapDragTrace(map, { engine: 'maplibre-gl-6.7.0-native-drag' }); });
  gl.on('move', () => { const handlerStarted = performance.now(); recordMapHandler('MapLibre move telemetry', handlerStarted); });
  // Keep the operator-facing camera contract synchronized with the renderer
  // throughout wheel/pinch animation. `moveend` remains the durable camera
  // commit, but it can be delayed under a busy render queue and must not make
  // a successful native zoom look inert to accessibility and QA consumers.
  gl.on('zoom', () => { map.dataset.mapZoom = String(gl.getZoom()); });
  gl.on('render', () => { const handlerStarted = performance.now(); instance.rendered += 1; recordMapHandler('MapLibre render telemetry', handlerStarted);if(!map.dataset.mapFirstUsefulFrame&&instance.baseTileReady){map.dataset.mapFirstUsefulFrame=String(performance.now());map.dispatchEvent(new CustomEvent('vigia:map-first-frame',{bubbles:true}));requestAnimationFrame(()=>requestAnimationFrame(()=>loadContext()));} });
  gl.on('moveend', event => emitCamera(map, gl, event.originalEvent ? 'native-moveend' : 'programmatic-moveend'));
  gl.on('sourcedataloading', event => { if (event.sourceId?.startsWith('vigia-')) { instance.sourceDataEvents += 1; mapRuntime.tileRequests += 1; scene.tileRequests += 1; } });
  gl.on('styledata',()=>{map.dataset.mapBaseStyleReadyAt??=String(performance.now());});
  gl.on('sourcedata',event=>{if(event.isSourceLoaded){const fields={'vigia-labels':'mapLabelsReadyAt','vigia-operational':'mapOverlaysReadyAt','vigia-markers':'mapIncidentGeometryReadyAt'};if(fields[event.sourceId])map.dataset[fields[event.sourceId]]=String(performance.now());}if(event.sourceId==='vigia-imagery'&&event.tile?.state==='loaded')instance.baseTileReady=true;if(scene.timeToFirstBaseTileMs===null&&['vigia-imagery','vigia-labels'].includes(event.sourceId)&&event.isSourceLoaded){scene.timeToFirstBaseTileMs=Math.round(performance.now()-startedAt);map.dataset.mapTimeToFirstBaseTile=String(scene.timeToFirstBaseTileMs);}});
  gl.on('error', event => { const sourceId=String(event?.sourceId??event?.error?.sourceId??''),baseTileFailure=sourceId==='vigia-imagery'||sourceId==='vigia-labels';scene.failures += 1;if(baseTileFailure)mapRuntime.tileFailures += 1;else mapRuntime.overlayFailures=(Number(mapRuntime.overlayFailures)||0)+1;map.dataset.mapFailureSource=sourceId||'unknown';map.dataset.mapFailureClass = String(event?.error?.message ?? 'MAPLIBRE_SOURCE_ERROR').slice(0, 120); updateState(map, 'DEGRADED_PARTIAL', baseTileFailure?'Retained map · basemap source recovering':'Basemap live · optional context layer recovering', { failure: map.dataset.mapFailureClass, retry: true }); });
  gl.on('load', () => {
    map.dataset.mapInteractiveAt=String(performance.now());map.dataset.mapStyleLoaded = String(gl.isStyleLoaded()); map.dataset.mapCanvasCount = String(container.querySelectorAll('canvas').length); createSelectedMarker(instance.config, instance, map);
    gl.once('idle',()=>{scene.timeToStableMapMs=Math.round(performance.now()-startedAt);map.dataset.mapTimeToStableMap=String(scene.timeToStableMapMs);if(scene.timeToFirstBaseTileMs===null){scene.timeToFirstBaseTileMs=scene.timeToStableMapMs;map.dataset.mapTimeToFirstBaseTile=String(scene.timeToFirstBaseTileMs);}const failed=Boolean(map.dataset.mapFailureClass);updateState(map,failed?'DEGRADED_PARTIAL':'LIVE',failed?'Retained map · one or more sources recovering':`Basemap current · imagery${config.showLabels?' and readable labels':''}${config.thermal?' · thermal visible':''}`,{failure:map.dataset.mapFailureClass,retry:failed});});
  });
  gl.on('click', 'vigia-clusters', event => { const clusterId = event.features?.[0]?.properties?.cluster_id, source = gl.getSource('vigia-markers'); if (clusterId === undefined || !source?.getClusterExpansionZoom) return; source.getClusterExpansionZoom(clusterId).then(zoom => gl.easeTo({ center: event.lngLat, zoom, duration: 220 })).catch(() => undefined); });
  gl.on('click', 'vigia-unclustered', event => { const action = event.features?.[0]?.properties?.action; if (action) map.dispatchEvent(new CustomEvent('vigia:map-action', { bubbles: true, detail: { action } })); });
  for (const layer of ['vigia-clusters', 'vigia-unclustered']) { gl.on('mouseenter', layer, () => { gl.getCanvas().style.cursor = 'pointer'; }); gl.on('mouseleave', layer, () => { gl.getCanvas().style.cursor = ''; }); }
  if (typeof ResizeObserver === 'function') { let size = ''; instance.resizeObserver = new ResizeObserver(entries => { const rect = entries[0]?.contentRect, next = rect ? `${Math.round(rect.width)}x${Math.round(rect.height)}` : ''; if (!next || next === size) return; size = next; map.dataset.mapContainerSize = next; gl.resize(); }); instance.resizeObserver.observe(map); }
  const enableWheel=()=>{gl.scrollZoom.enable();map.dataset.mapWheelZoomEnabled='true';};
  const disableWheel=()=>{gl.scrollZoom.disable();map.dataset.mapWheelZoomEnabled='false';};
  map.addEventListener('focus',enableWheel);map.addEventListener('pointerdown',enableWheel);map.addEventListener('mouseleave',()=>{if(document.activeElement!==map)disableWheel();});map.addEventListener('blur',disableWheel);
  gl.on('mousemove', event => {
    if (!instance.dragging || event.originalEvent?.buttons !== 1 || instance.pointerPostRenderPending) return;
    const pointerAt = performance.now();
    instance.pointerPostRenderPending = true;
    // The first frame timestamps MapLibre's render scheduled by this input;
    // the nested frame commits the sample only after that frame was presented.
    requestAnimationFrame(postRenderAt => requestAnimationFrame(() => {
      const duration = Number((postRenderAt - pointerAt).toFixed(2));
      instance.pointerPostRenderPending = false;
      instance.pointerPostRenderSamples.push(duration);
      if (instance.pointerPostRenderSamples.length > 512) instance.pointerPostRenderSamples.shift();
      map.dataset.mapPointerToPostRenderMs = String(duration);
      map.dataset.mapPointerToPostRenderSamples = JSON.stringify(instance.pointerPostRenderSamples);
      // Compatibility alias for existing non-certifying diagnostics.
      map.dataset.mapPointerToFirstPaintMs = String(duration);
    }));
  });
  map.addEventListener('keydown', event => {
    if(event.key==='Escape'){disableWheel();map.blur();return;}
    if (event.shiftKey && event.key.toUpperCase() === 'D') { event.preventDefault(); beginMapDragTrace(map, { engine: 'maplibre-gl-6.7.0-controlled-pan' }); gl.panBy([220, 0], { duration: 5_000 }); return; }
    if (['+', '='].includes(event.key)) { event.preventDefault(); gl.zoomIn({ duration: 120 }); return; } if (event.key === '-') { event.preventDefault(); gl.zoomOut({ duration: 120 }); return; }
    const delta = { ArrowLeft: [-80, 0], ArrowRight: [80, 0], ArrowUp: [0, -80], ArrowDown: [0, 80] }[event.key]; if (delta) { event.preventDefault(); gl.panBy(delta, { duration: 100 }); }
  });
}

function coordinatesInGeometry(geometry,result=[]){if(!geometry)return result;const values=geometry.coordinates;if(!Array.isArray(values))return result;if(values.length===2&&values.every(Number.isFinite)){result.push(values);return result;}for(const value of values)coordinatesInGeometry({coordinates:value},result);return result;}
function focusBounds(features){const coordinates=features.flatMap(feature=>coordinatesInGeometry(feature?.geometry));if(!coordinates.length)return null;const xs=coordinates.map(item=>item[0]),ys=coordinates.map(item=>item[1]);return[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];}
export function focusMapLayer(map,layerName,{duration=1800}={}){
  const instance=mapInstances.get(map),name=String(layerName??'');if(!instance||!name)return false;
  const gl=instance.gl,operational=instance.config.features?.features?.filter(feature=>feature?.properties?.layer===name)??[],kind={observations:'observation',incidentPoints:'incident',resources:'resource',contextAssets:'asset'}[name],markers=kind?instance.config.markers?.features?.filter(feature=>feature?.properties?.kind===kind)??[]:[],features=[...operational,...markers];if(!features.length)return false;
  for(const id of ['vigia-focused-fill','vigia-focused-line']){if(gl.getLayer(id)){gl.setFilter(id,['==',['get','layer'],name]);gl.setPaintProperty(id,id.endsWith('fill')?'fill-opacity':'line-opacity',id.endsWith('fill') ? .42 : 1);}}
  if(gl.getLayer('vigia-focused-points')){gl.setFilter('vigia-focused-points',['==',['get','kind'],kind??'__none__']);gl.setPaintProperty('vigia-focused-points','circle-opacity',kind?1:0);}
  const bounds=focusBounds(features);if(bounds){if(bounds[0]===bounds[2]&&bounds[1]===bounds[3])gl.easeTo({center:[bounds[0],bounds[1]],zoom:Math.max(12,gl.getZoom()),duration:260});else gl.fitBounds([[bounds[0],bounds[1]],[bounds[2],bounds[3]]],{padding:70,duration:260,maxZoom:14});}
  const scene=sceneRuntime(map);scene.filterUpdateCount+=1;mapRuntime.filterUpdateCount+=1;map.dataset.mapFocusedLayer=name;map.dataset.mapFocusedFeatureCount=String(features.length);map.dataset.mapFocusVisualAt=String(performance.now());map.dataset.mapFilterUpdateCount=String(scene.filterUpdateCount);
  clearTimeout(instance.focusTimer);instance.focusTimer=setTimeout(()=>{if(!map.isConnected)return;for(const id of ['vigia-focused-fill','vigia-focused-line'])if(gl.getLayer(id))gl.setPaintProperty(id,id.endsWith('fill')?'fill-opacity':'line-opacity',id.endsWith('fill') ? .12 : .35);if(gl.getLayer('vigia-focused-points'))gl.setPaintProperty('vigia-focused-points','circle-opacity',.35);map.dataset.mapFocusPulseComplete='true';},duration);
  return true;
}

export function clearMapFocus(map){const instance=mapInstances.get(map);if(!instance)return false;const gl=instance.gl;for(const id of ['vigia-focused-fill','vigia-focused-line'])if(gl.getLayer(id)){gl.setFilter(id,['==',['get','layer'],'__none__']);gl.setPaintProperty(id,id.endsWith('fill')?'fill-opacity':'line-opacity',0);}if(gl.getLayer('vigia-focused-points')){gl.setFilter('vigia-focused-points',['==',['get','kind'],'__none__']);gl.setPaintProperty('vigia-focused-points','circle-opacity',0);}map.dataset.mapFocusedLayer='';return true;}

export function fitMapContents(map){const instance=mapInstances.get(map);if(!instance)return false;const features=instance.config.markers?.features??[],bounds=focusBounds(features);if(!bounds)return false;if(bounds[0]===bounds[2]&&bounds[1]===bounds[3])instance.gl.easeTo({center:[bounds[0],bounds[1]],zoom:Math.max(9,instance.gl.getZoom()),duration:240});else instance.gl.fitBounds([[bounds[0],bounds[1]],[bounds[2],bounds[3]]],{padding:54,duration:240,maxZoom:11});map.dataset.mapFitFeatureCount=String(features.length);map.dataset.mapFitAt=String(performance.now());return true;}

const changed = (left, right) => safeJson(left ?? null) !== safeJson(right ?? null);
function syncThermalSource(gl, previous, next, scene) {
  if (!changed(previous?.thermal, next?.thermal) || !gl.isStyleLoaded()) return;
  const layerId = 'vigia-thermal', sourceId = 'vigia-thermal', existing = gl.getSource(sourceId);
  if (!next?.thermal?.url) {
    if (gl.getLayer(layerId)) gl.removeLayer(layerId);
    if (existing) gl.removeSource(sourceId);
  } else if (existing?.updateImage) {
    existing.updateImage({ url: next.thermal.url, coordinates: next.thermal.coordinates });
  } else {
    gl.addSource(sourceId, { type: 'image', url: next.thermal.url, coordinates: next.thermal.coordinates });
    gl.addLayer({ id: layerId, type: 'raster', source: sourceId, paint: { 'raster-opacity': .46, 'raster-fade-duration': 0 } }, gl.getLayer('vigia-labels') ? 'vigia-labels' : undefined);
  }
  scene.sourceUpdateCount += 1; mapRuntime.sourceUpdateCount += 1;
}
function updateInstance(map, fresh) {
  const instance = mapInstances.get(map), next = parseConfig(fresh); if (!instance || !next) return;
  const previous = instance.config, gl = instance.gl, scene = sceneRuntime(map);
  instance.restoreSituationScene?.();
  if (instance.overlaysReady&&changed(previous.markers, next.markers)) { gl.getSource('vigia-markers')?.setData(next.markers); scene.sourceUpdateCount += 1; mapRuntime.sourceUpdateCount += 1; }
  if (instance.overlaysReady&&changed(previous.features, next.features)) { gl.getSource('vigia-operational')?.setData(next.features); scene.sourceUpdateCount += 1; mapRuntime.sourceUpdateCount += 1; }
  if (previous.showLabels !== next.showLabels && gl.getLayer('vigia-labels')) { gl.setLayoutProperty('vigia-labels', 'visibility', next.showLabels ? 'visible' : 'none'); scene.filterUpdateCount += 1; mapRuntime.filterUpdateCount += 1; }
  if(instance.overlaysReady)syncThermalSource(gl, previous, next, scene);
  const selectionChanged=changed(previous.selected,next.selected);
  if (selectionChanged) createSelectedMarker(next, instance, map);
  if ((changed(previous.center, next.center) || previous.zoom !== next.zoom || changed(previous.fitBounds,next.fitBounds)) && !instance.dragging) {
    // Returning to a regional scene can invalidate an incident-associated
    // camera. Apply its backend bounds again, just as on the initial load.
    if(next.fitBounds)gl.fitBounds([[next.fitBounds[0],next.fitBounds[1]],[next.fitBounds[2],next.fitBounds[3]]],{padding:34,duration:0,maxZoom:next.zoom});
    else if(selectionChanged)gl.jumpTo({center:next.center,zoom:next.zoom});
    else gl.easeTo({ center: next.center, zoom: next.zoom, duration: 160 });
  }
  map.dataset.mapInstanceReusedAt=String(performance.now());map.dataset.mapCameraReadyAt=String(performance.now());instance.config = next;
  for (const name of ['mapConfig', 'mapRenderedFeatureSet', 'mapVisibleLayers', 'mapLayerTruth', 'mapSelectedIncident', 'mapFocusIncident', 'mapSceneIdentity','mapSceneScope','mapSceneType']) map.dataset[name] = fresh.dataset[name] ?? '';
  map.dataset.mapWebglMarkerCount = String(next.markers?.features?.length ?? 0); map.dataset.mapSourceUpdateCount = String(scene.sourceUpdateCount); map.dataset.mapFilterUpdateCount = String(scene.filterUpdateCount); map.dataset.mapStyleReloadCount = String(scene.styleReloadCount);
  requestAnimationFrame(() => gl.resize());
}

function copyHostChrome(host, fresh) {
  for (const attribute of [...host.attributes]) host.removeAttribute(attribute.name); for (const attribute of fresh.attributes) host.setAttribute(attribute.name, attribute.value);
  for (const selector of ['.canonical-map__controls', '.canonical-map__tools', '.canonical-map__zoom', '.canonical-map__legend', '.map-layer-legend', '.canonical-map__focus-chip']) { host.querySelectorAll(`:scope > ${selector}`).forEach(node => node.remove()); for (const node of fresh.querySelectorAll(`:scope > ${selector}`)) host.append(node.cloneNode(true)); }
}
function destroyMapInstance(map) {
  const instance=mapInstances.get(map);if(!instance)return false;
  clearTimeout(instance.focusTimer);clearTimeout(instance.contextTimer);instance.disposeSources?.();instance.resizeObserver?.disconnect();instance.selectedMarker?.remove();
  const scene=sceneRuntime(map);try{instance.gl.remove();}finally{mapInstances.delete(map);scene.destroyCount+=1;mapRuntime.destroyCount+=1;map.dataset.mapDestroyCount=String(scene.destroyCount);}return true;
}
function reconcileMapHost(host, fresh) {
  const map=host.querySelector('.tile-map'),next=fresh.querySelector('.tile-map');copyHostChrome(host,fresh);if(!map||!next)return host;
  const instance=mapInstances.get(map),nextEnabled=next.dataset.mapEnabled==='true';
  if(instance&&nextEnabled)updateInstance(map,next);
  else{
    if(instance)destroyMapInstance(map);
    next.dataset.mapRuntimeTransition=instance?'LIVE_TO_UNAVAILABLE':map.dataset.mapEnabled==='true'?'RETRY_INSTANCE':'INACTIVE_REFRESH';
    map.replaceWith(next);
  }
  return host;
}
export function reconcileVisibleMap(host, fresh) { return host && fresh ? reconcileMapHost(host, fresh) : host; }
const MAP_PARKING_ID='vigia-connected-map-parking';
function connectedMapParking(){let parking=document.getElementById(MAP_PARKING_ID);if(parking)return parking;parking=document.createElement('div');parking.id=MAP_PARKING_ID;parking.hidden=true;parking.setAttribute('aria-hidden','true');document.body.append(parking);return parking;}
const runtimeOwner=host=>host.closest('main')?'APPLICATION_WORKSPACE':host.dataset.mapSceneOwner;
export function retainPersistentMaps(root = document) { let parking=null;for (const host of root.querySelectorAll?.('.canonical-map[data-map-scene-owner]') ?? []) { const owner = runtimeOwner(host); if (!owner) continue;parking??=connectedMapParking();parking.append(host);persistentHosts.set(owner, host); } }
export function restorePersistentMaps(root = document) { for (const fresh of [...(root.querySelectorAll?.('.canonical-map[data-map-scene-owner]') ?? [])]) { const owner = runtimeOwner(fresh), host = persistentHosts.get(owner); if (host && host !== fresh) { reconcileMapHost(host, fresh); fresh.replaceWith(host); } else persistentHosts.set(owner, fresh); } }

export function hydrateMaps(root = document) {
  for (const map of root.querySelectorAll?.('.tile-map') ?? []) activateMap(map);
  for (const image of root.querySelectorAll?.('img[data-preview-source]') ?? []) if (!image.dataset.previewHydrated) {
    image.dataset.previewHydrated = 'true'; const source = image.dataset.previewSource; if (!source?.startsWith('/backend/')) continue;
    fetch(source, { credentials: 'same-origin', headers: { accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8' } }).then(async response => { if (!response.ok || !String(response.headers.get('content-type') ?? '').startsWith('image/')) throw new Error(`HTTP_${response.status}`); image.src = URL.createObjectURL(await response.blob()); image.hidden = false; image.dataset.previewState = 'READY'; }).catch(error => { image.hidden = true; image.dataset.previewState = 'UNAVAILABLE'; image.dataset.previewFailureClass = String(error?.message ?? error); });
  }
}

export async function recoverMap(map) {
  const instance = mapInstances.get(map); if (!instance) { activateMap(map); return mapInstances.has(map); }
  const retryCount=(Number(map.dataset.mapRetryCount)||0)+1,scene=sceneRuntime(map);map.dataset.mapRetryCount=String(retryCount);map.dataset.mapFailureClass='';updateState(map,'LOADING','Rechecking governed map sources');
  instance.gl.once('idle',()=>updateState(map,map.dataset.mapFailureClass?'DEGRADED_PARTIAL':'LIVE',map.dataset.mapFailureClass?'Retained map · one or more layers still recovering':'Basemap current · imagery and readable labels',{failure:map.dataset.mapFailureClass,retry:Boolean(map.dataset.mapFailureClass)}));
  for(const [sourceId,kind] of [['vigia-imagery','imagery'],['vigia-labels','labels']]){const source=instance.gl.getSource(sourceId),tiles=[`${basemapTileUrl(kind,'{z}','{x}','{y}')}?retry=${retryCount}`];if(source?.setTiles){source.setTiles(tiles);scene.sourceUpdateCount+=1;mapRuntime.sourceUpdateCount+=1;}else source?.reload?.();}
  instance.gl.getSource('vigia-thermal')?.reload?.();map.dataset.mapSourceUpdateCount=String(scene.sourceUpdateCount);
  instance.gl.triggerRepaint();return true;
}

export function mapRuntimeSnapshot() { return JSON.parse(JSON.stringify(mapRuntime)); }

export function showSituationMapScene(host,snapshot,{mode='FACILITY',entityId=null,road=null,label='Retained geometry',coverage=null,picture=null}={}) {
  const map=host?.matches?.('.tile-map')?host:host?.querySelector?.('.tile-map'),instance=mapInstances.get(map);
  if(!instance||!snapshot||!instance.overlaysReady)return false;
  const features=[],feature=(geometry,kind,entityId=null)=>{if(geometry)features.push({type:'Feature',geometry,properties:{kind,entityId}});};
  const routeRows=snapshot.routes.filter(r=>mode==='HISTORICAL'||entityId&&r.facilityId===entityId||road&&r.roads.some(x=>String(x.ref??x.name).replace(/\s/g,'').toUpperCase()===String(road).replace(/\s/g,'').toUpperCase()));
  if(mode==='COVERAGE'&&!coverage?.relationships?.some(r=>r.geometry))return false;
  if(!picture&&!['HISTORICAL','COVERAGE'].includes(mode)&&!routeRows.length&&!snapshot.facilities.some(f=>f.id===entityId))return false;
  feature({type:'Point',coordinates:snapshot.incident.coordinate},'incident');
  for(const f of snapshot.facilities.filter(f=>mode==='HISTORICAL'||f.id===entityId||routeRows.some(r=>r.facilityId===f.id)))feature({type:'Point',coordinates:f.coordinate},'facility');
  for(const r of routeRows)feature(r.geometry,'route');
  if(mode==='COVERAGE')for(const r of coverage.relationships){feature(r.geometry,'calculated_coverage');const f=snapshot.facilities.find(f=>f.id===r.facilityId);if(f)feature({type:'Point',coordinates:f.coordinate},'verified_facility');const p=snapshot.places.find(p=>p.id===r.settlementId),coordinate=p?.coordinate??(p?.geometry?.type==='Point'?p.geometry.coordinates:null);if(coordinate)feature({type:'Point',coordinates:coordinate},'settlement',r.settlementId);}
  if(mode==='HISTORICAL')feature(snapshot.perimeter?.geometry,'admitted');
  if(picture)features.splice(0,features.length,...picture.features);
  const gl=instance.gl;instance.restoreSituationScene?.();const previousCamera={center:gl.getCenter(),zoom:gl.getZoom()},visibility=[];
  for(const layer of gl.getStyle().layers??[])if(layer.source==='vigia-operational'||layer.source==='vigia-markers'||layer.source==='vigia-thermal'){visibility.push([layer.id,gl.getLayoutProperty(layer.id,'visibility')??'visible']);gl.setLayoutProperty(layer.id,'visibility','none');}
  const marker=instance.selectedMarker?.getElement();if(marker)marker.hidden=true;
  gl.addSource('vigia-situation-focus',{type:'geojson',data:{type:'FeatureCollection',features}});
  gl.addLayer({id:'vigia-situation-line',type:'line',source:'vigia-situation-focus',filter:['==',['geometry-type'],'LineString'],paint:{'line-color':['match',['get','state'],'lost','#965006','#175bb0'],'line-width':4,'line-opacity':.85}});
  gl.addLayer({id:'vigia-situation-lost',type:'line',source:'vigia-situation-focus',filter:['all',['==',['geometry-type'],'LineString'],['==',['get','state'],'lost']],paint:{'line-color':'#ffffff','line-width':2,'line-dasharray':[2,2]}});
  gl.addLayer({id:'vigia-situation-area',type:'fill',source:'vigia-situation-focus',filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':'#d63a2e','fill-opacity':.24}});
  gl.addLayer({id:'vigia-situation-points',type:'circle',source:'vigia-situation-focus',filter:['==',['geometry-type'],'Point'],paint:{'circle-color':['case',['==',['get','kind'],'incident'],'#d51d32',['==',['get','kind'],'community'],['match',['get','band'],'no_route','#50617b','long','#965006','activation_unconfirmed','#965006','no_designation','#50617b','middle','#68a7df','#175bb0'],'#087d50'],'circle-radius':['match',['get','kind'],'incident',11,'community',8,6],'circle-stroke-color':'#ffffff','circle-stroke-width':2}});
  gl.addLayer({id:'vigia-situation-labels',type:'symbol',source:'vigia-situation-focus',filter:['==',['geometry-type'],'Point'],layout:{'text-field':['get','name'],'text-size':12,'text-offset':[0,1.4],'text-anchor':'top','text-max-width':14},paint:{'text-color':'#101d43','text-halo-color':'#ffffff','text-halo-width':2}});
  const selectCommunity=event=>{const p=event.features?.[0]?.properties;if(picture){map.dispatchEvent(new CustomEvent('vigia:operational-select',{bubbles:true,detail:p}));return;}if(p?.kind==='settlement'&&p.entityId)map.dispatchEvent(new CustomEvent('vigia:map-action',{bubbles:true,detail:{action:'inspect-community:'+p.entityId}}));};
  gl.on('click','vigia-situation-points',selectCommunity);
  const selectRoad=event=>{const p=event.features?.[0]?.properties;if(picture&&p?.road)map.dispatchEvent(new CustomEvent('vigia:operational-select',{bubbles:true,detail:{kind:'road',road:p.road}}));};gl.on('click','vigia-situation-line',selectRoad);
  const chip=document.createElement('div');chip.className='situation-map-mode';chip.setAttribute('role','status');chip.innerHTML=`<strong>${esc(label)}</strong><button type="button" class="btn">Return to current map</button>`;map.append(chip);map.dataset.situationMode=mode;
  if(mode==='COVERAGE'){const description=document.createElement('span'),latest=coverage.relationships.map(r=>r.calculatedAt).filter(v=>Number.isFinite(Date.parse(v))).sort().at(-1),date=latest?new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'UTC'}).format(new Date(latest))+' UTC':'time unavailable';description.textContent=`Latest calculation: ${date} · OSRM · paths only`;chip.insertBefore(description,chip.querySelector('button'));}
  instance.restoreSituationScene=()=>{gl.off('click','vigia-situation-points',selectCommunity);gl.off('click','vigia-situation-line',selectRoad);for(const id of ['vigia-situation-labels','vigia-situation-lost','vigia-situation-line','vigia-situation-area','vigia-situation-points'])if(gl.getLayer(id))gl.removeLayer(id);if(gl.getSource('vigia-situation-focus'))gl.removeSource('vigia-situation-focus');for(const [id,v]of visibility)if(gl.getLayer(id))gl.setLayoutProperty(id,'visibility',v);if(marker)marker.hidden=false;chip.remove();delete map.dataset.situationMode;instance.restoreSituationScene=null;gl.resize();gl.jumpTo(previousCamera);};
  chip.querySelector('button').addEventListener('click',()=>{instance.restoreSituationScene?.();map.dispatchEvent(new CustomEvent('vigia:current-map',{bubbles:true}));map.focus();});
  gl.resize();const bounds=focusBounds(features);if(bounds)gl.fitBounds([[bounds[0],bounds[1]],[bounds[2],bounds[3]]],{padding:{top:48,left:48,right:48,bottom:Math.max(65,gl.getContainer().getBoundingClientRect().bottom-chip.getBoundingClientRect().top+16)},maxZoom:14,duration:0});return true;
}
export function classifyMapSourceState(input, { cacheFallback = false } = {}) { const normalized = String(input ?? '').trim().toLowerCase(), sourceState = cacheFallback ? 'stale_cache_last_good' : normalized || 'unknown'; const stale = cacheFallback || sourceState === 'stale' || /(?:^|[_-])stale(?:$|[_-])|last[_-]?good/.test(sourceState), current = sourceState === 'current'; return { sourceState, stale, current, degraded: !current && !stale }; }
export function mapAssetTruthFromHeaders(headers, { cacheFallback = false, observedAt = new Date().toISOString() } = {}) { const read = name => headers?.get?.(name) ?? null, classification = classifyMapSourceState(read('x-vigia-source-state'), { cacheFallback }), acquiredAt = read('x-vigia-acquired-at'); return { provider: read('x-vigia-provider') ?? 'VIGIA GOVERNED PROXY', provenance: read('x-vigia-provenance'), sourceState: classification.sourceState, acquiredAt, lastSuccessAt: classification.current ? acquiredAt ?? observedAt : null, lastGoodAt: read('x-vigia-last-good-at') ?? (classification.current ? acquiredAt ?? observedAt : acquiredAt), stale: classification.stale, degraded: classification.degraded }; }
export function shouldPromoteMapLastGood(asset, { decoded = false } = {}) { return decoded === true && asset?.sourceState === 'current' && asset?.stale === false && asset?.degraded === false; }
