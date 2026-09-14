import { thermalOverlayUrl } from './vigiaApi.js?v=2.1.0';
import { esc } from './components.js?v=2.1.0';
import { icon } from './icons.js?v=2.1.0';
import { validCoordinate } from './viewModel.js?v=2.1.0';
import { finiteNumberOrNull } from './truth.js?v=2.1.0';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lon2x = (lon, z) => ((lon + 180) / 360) * 2 ** z;
const lat2y = (lat, z) => (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** z;
const x2lon = (x, z) => x / 2 ** z * 360 - 180;
const y2lat = (y, z) => 180 / Math.PI * Math.atan(Math.sinh(Math.PI - 2 * Math.PI * y / 2 ** z));
const normalizedBounds = input => {
  const values = Array.isArray(input) ? input : [input?.west, input?.south, input?.east, input?.north];
  return values.length === 4 && values.every(Number.isFinite) && values[0] < values[2] && values[1] < values[3] ? values : null;
};
export const safeJson = value => JSON.stringify(value).replaceAll('<', '\\u003c');
const layerRows = (scene, name) => {
  const layer = scene?.layers?.[name];
  return ['READY', 'DEGRADED'].includes(layer?.state) && Array.isArray(layer.value) ? layer.value : [];
};

export function mapModel({ coordinate = null, zoom = 8, tiles = 4 } = {}) {
  if (!validCoordinate(coordinate)) return null;
  const center = coordinate, cx = lon2x(center[0], zoom), cy = lat2y(center[1], zoom), half = tiles / 2;
  const minX = Math.round(cx - half), minY = Math.round(cy - half), maxIndex = 2 ** zoom - 1, rows = [];
  for (let row = 0; row < tiles; row += 1) for (let col = 0; col < tiles; col += 1) rows.push({ x: clamp(minX + col, 0, maxIndex), y: clamp(minY + row, 0, maxIndex), z: zoom, col, row });
  return { center, zoom, tiles, minX, minY, rows, bbox: [x2lon(minX, zoom), y2lat(minY + tiles, zoom), x2lon(minX + tiles, zoom), y2lat(minY, zoom)], centerPx: { x: (cx - minX) * 256, y: (cy - minY) * 256 }, size: tiles * 256 };
}

export function mapZoomForBounds({ coordinate, bounds, zoom = 8, tiles = 4, minZoom = 2 } = {}) {
  const target = normalizedBounds(bounds), requested = clamp(Math.round(finiteNumberOrNull(zoom) ?? 8), minZoom, 19);
  if (!target || !validCoordinate(coordinate)) return requested;
  for (let candidate = requested; candidate >= minZoom; candidate -= 1) {
    const [west, south, east, north] = mapModel({ coordinate, zoom: candidate, tiles }).bbox;
    if (west <= target[0] && south <= target[1] && east >= target[2] && north >= target[3]) return candidate;
  }
  return minZoom;
}

export function projectCoordinate(coordinate, model) {
  if (!model || !validCoordinate(coordinate)) return null;
  return { x: (lon2x(coordinate[0], model.zoom) - model.minX) * 256 / model.size * 100, y: (lat2y(coordinate[1], model.zoom) - model.minY) * 256 / model.size * 100 };
}

const layerTimestamp = row => row?.observedAt ?? row?.updatedAt ?? row?.at ?? row?.validAt ?? null;
export function mapLayerTruth(mapScene, declaredLayers = []) {
  const layers = Object.fromEntries(declaredLayers.map(name => {
    const layer = mapScene?.layers?.[name] ?? null, values = Array.isArray(layer?.value) ? layer.value : [];
    const timestamps = values.map(layerTimestamp).filter(value => Number.isFinite(Date.parse(value))).sort((first, second) => Date.parse(second) - Date.parse(first));
    return [name, { state: layer?.state ?? 'UNAVAILABLE', authority: layer?.authority ?? null, reason: layer?.reason ?? null, returned: layer?.inventory?.returned ?? values.length, total: layer?.inventory?.total ?? (layer?.state ? values.length : null), truncated: layer?.inventory?.truncated ?? false, latestObservedAt: timestamps[0] ?? null }];
  }));
  return { generatedAt: mapScene?.currentness?.generatedAt ?? null, geometryFreshness: mapScene?.currentness?.geometryFreshness ?? null, weatherObservedAt: mapScene?.currentness?.weatherObservedAt ?? null, layers };
}

function geometryOf(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.type === 'Feature') return value.geometry ?? null;
  if (value.type && Array.isArray(value.coordinates)) return value;
  if (value.geometry?.type === 'Feature') return value.geometry.geometry ?? null;
  if (value.geometry?.type && Array.isArray(value.geometry.coordinates)) return value.geometry;
  if (validCoordinate(value.coordinate)) return { type: 'Point', coordinates: value.coordinate };
  return null;
}

function operationalFeatures(scene, visibleLayers) {
  const features = [];
  for (const name of visibleLayers) {
    if (['incidentPoints', 'resources', 'contextAssets', 'locations', 'stagedResources'].includes(name)) continue;
    layerRows(scene, name).forEach((row, index) => {
      const geometry = geometryOf(row);
      if (!geometry) return;
      const source = row?.type === 'Feature' ? row.properties ?? {} : row;
      const responseSurfaceProperties = name === 'responseCoverageSurface' ? {
        coverageState: String(source?.coverageState ?? 'UNKNOWN'),
        responseMinutes: finiteNumberOrNull(source?.responseMinutes),
        fastestFacilityId: String(source?.fastestFacilityId ?? ''),
        fastestFacilityLabel: String(source?.fastestFacilityLabel ?? ''),
        availableFacilityCount: finiteNumberOrNull(source?.availableFacilityCount),
        dynamicUnknownCount: finiteNumberOrNull(source?.dynamicUnknownCount),
        committedFacilityCount: finiteNumberOrNull(source?.committedFacilityCount),
        explanation: String(source?.explanation ?? '')
      } : {};
      features.push({ type: 'Feature', id: `${name}:${source?.id ?? source?.sampleId ?? source?.featureId ?? index}`, properties: { layer: name, authoritative: source?.authoritativePerimeter === true, state: String(source?.state ?? source?.status ?? ''), ...responseSurfaceProperties }, geometry });
    });
  }
  return { type: 'FeatureCollection', features };
}

function markerFeatures(markers) {
  return { type: 'FeatureCollection', features: markers.filter(item => validCoordinate(item.coordinate)).map((item, index) => ({
    type: 'Feature', id: String(item.identifier || `${item.kind ?? 'marker'}:${index}`),
    properties: { identifier: String(item.identifier ?? ''), kind: String(item.kind ?? 'incident'), classification: String(item.classification??''), tone: String(item.tone ?? 'warning'), label: String(item.label ?? ''), short: String(item.short ?? ''), meta: String(item.meta ?? ''), status: String(item.status ?? ''), action: String(item.action ?? ''), openAction: String(item.openAction ?? ''), selected: item.selected===true },
    geometry: { type: 'Point', coordinates: item.coordinate },
  })) };
}

function mapConfig({ model, thermal, time, markers, presentation, mapScene, functionalLayers, showLabels, fitBounds, sceneBounds }) {
  const bbox = normalizedBounds(sceneBounds) ?? model.bbox;
  return {
    center: model.center, zoom: model.zoom, fitBounds: fitBounds && normalizedBounds(sceneBounds) ? normalizedBounds(sceneBounds) : null, showLabels,
    markers: markerFeatures(markers), features: operationalFeatures(mapScene, functionalLayers), selected: markers.find(item => item.selected === true && validCoordinate(item.coordinate)) ?? null,
    thermal: thermal ? { url: thermalOverlayUrl({ bbox, time, width: 640, height: 640 }), coordinates: [[bbox[0], bbox[3]], [bbox[2], bbox[3]], [bbox[2], bbox[1]], [bbox[0], bbox[1]]] } : null,
    wind: presentation?.wind ?? null, scaleLabel: presentation?.scaleLabel ?? null,
  };
}

function commonAttributes({ sceneId, resolvedSceneType, resolvedScope, focusId, declaredLayers, functionalLayers, featureSet, layerTruth, sceneBounds }) {
  return `data-map-scene-identity="${esc(sceneId)}" data-map-scene-type="${esc(resolvedSceneType)}" data-map-scene-scope="${esc(resolvedScope)}" data-map-focus-incident="${esc(focusId)}" data-map-selected-incident="${esc(focusId)}" data-map-declared-layers="${esc(declaredLayers.join(','))}" data-map-visible-layers="${esc(functionalLayers.join(','))}" data-map-rendered-feature-set="${esc(safeJson(featureSet))}" data-map-layer-truth="${esc(safeJson(layerTruth))}" data-map-scene-bounds="${esc(sceneBounds ? safeJson(sceneBounds) : '')}" data-map-functional-layer-count="${functionalLayers.length}"`;
}

export function tileMap({ coordinate, zoom = 8, thermal = false, time = 'latest', markers = [], presentation = null, mapScene = null, scope = null, sceneIdentity = '', sceneType = '', selectedIncidentId = '', declaredLayers = [], visibleLayers = null, showLabels = true, className = '', label = 'Operational map', layers = true, enabled = true, fitBounds = true } = {}) {
  const sceneBounds = mapScene?.bounds ?? mapScene?.camera?.bbox ?? null, requestedZoom = clamp(finiteNumberOrNull(zoom) ?? 8, 2, 19);
  const fittedZoom = fitBounds ? mapZoomForBounds({ coordinate, bounds: sceneBounds, zoom: requestedZoom, tiles: 4 }) : requestedZoom, model = mapModel({ coordinate, zoom: fittedZoom, tiles: 4 });
  const resolvedScope = String(scope ?? mapScene?.scope ?? 'UNSCOPED'), focusId = String(selectedIncidentId || mapScene?.selectedIncidentId || mapScene?.focusIncidentId || '');
  const resolvedSceneType = String(sceneType || mapScene?.sceneType || 'UNSCOPED_SCENE'), sceneId = sceneIdentity || mapScene?.sceneId || `${resolvedSceneType}:${focusId || 'regional'}`;
  const sceneLayerEntries = Object.entries(mapScene?.layers ?? {}), strictLayers = Array.isArray(visibleLayers);
  const functionalLayers = (strictLayers ? visibleLayers : sceneLayerEntries.filter(([, layer]) => ['READY', 'DEGRADED'].includes(layer?.state) && (Array.isArray(layer?.value) ? layer.value.length > 0 : layer?.value !== null)).map(([name]) => name)).filter(Boolean);
  const featureSet = Object.fromEntries(functionalLayers.map(name => [name, Array.isArray(mapScene?.layers?.[name]?.value) ? mapScene.layers[name].value.length : 0])), layerTruth = mapLayerTruth(mapScene, declaredLayers);
  const attributes = commonAttributes({ sceneId, resolvedSceneType, resolvedScope, focusId, declaredLayers, functionalLayers, featureSet, layerTruth, sceneBounds });
  if (!model || enabled !== true) return `<div class="tile-map ${className}" role="group" aria-label="${esc(label)}" ${attributes} data-map-engine="maplibre-gl" data-map-engine-version="6.7.0" data-map-renderer="webgl" data-map-enabled="false" data-map-state="UNAVAILABLE" data-basemap-state="unavailable"><div class="tile-map__gl" aria-hidden="true"></div><div class="tile-map__fallback-meta"><strong>Map unavailable</strong><span>Incident map context unavailable</span></div>${layers ? '<div class="tile-map__source" role="status"><span>Map unavailable</span><button type="button" data-action="map-recover">Retry map</button></div>' : ''}</div>`;
  const config = mapConfig({ model, thermal, time, markers, presentation, mapScene, functionalLayers, showLabels, fitBounds, sceneBounds });
  return `<div class="tile-map ${className}" role="group" aria-label="${esc(label)}" tabindex="0" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight + -" ${attributes} data-map-config="${esc(safeJson(config))}" data-map-engine="maplibre-gl" data-map-engine-version="6.7.0" data-map-renderer="webgl" data-map-marker-strategy="webgl-clustered-geojson" data-map-enabled="true" data-map-state="LOADING" data-basemap-state="loading" data-map-center="${model.center.join(',')}" data-map-requested-zoom="${requestedZoom}" data-map-zoom="${model.zoom}" data-map-bbox="${model.bbox.join(',')}" data-map-drag-pan="enabled" data-map-style-reload-count="0" data-map-source-update-count="0" data-map-filter-update-count="0" data-map-destroy-count="0" data-map-provenance="same-origin:/backend/api/v1/basemap">
    <div class="tile-map__gl" aria-hidden="true"></div><div class="tile-map__shade"></div>
    <div class="tile-map__fallback-meta" data-map-fallback-meta aria-hidden="true"><strong>Retained operational context</strong><span>${esc(model.center.map(value => value.toFixed(4)).join(', '))}</span></div>
    <div class="tile-map__north" aria-label="North">${icon('arrow', 13)}<strong>N</strong></div>
    ${presentation?.wind ? presentation.wind.realWorldValue?`<div class="tile-map__wind-callout">${icon('wind',15)}<span><strong>${esc(presentation.wind.display)} km/h ${esc(presentation.wind.direction??'')}</strong><small>${esc(presentation.wind.location??'Regional station')} · ${esc(presentation.wind.freshnessLabel)}</small></span></div>`:`<div class="tile-map__wind-callout">${icon('wind', 15)}<span><strong>${esc(`${presentation.wind.bearingLabel ?? '—'} ${presentation.wind.speedMph ?? '—'} mph`)}</strong><small>GUSTS ${esc(presentation.wind.gustMph ?? '—')} mph</small></span></div>` : ''}
    ${presentation?.scaleLabel ? `<div class="tile-map__scale"><span>0</span><span>5</span><span>${esc(presentation.scaleLabel)}</span><i></i></div>` : ''}
    ${layers ? '<div class="tile-map__source" role="status" aria-live="polite"><span>Loading governed map</span><button type="button" data-action="map-recover" hidden>Retry map</button></div>' : ''}
  </div>`;
}
