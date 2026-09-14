import {
  getMaxParallelImageRequests, setMaxParallelImageRequests,
} from '../assets/vendor/maplibre-gl/maplibre-gl.mjs';

export const MAP_STATES = Object.freeze(['LOADING', 'LIVE', 'DEGRADED_PARTIAL', 'STALE_LAST_GOOD', 'STRUCTURED_FALLBACK', 'UNAVAILABLE']);
export const MAP_MEMORY_TTL_MS = 45_000;

export const mapInstances = new WeakMap();
export const persistentHosts = new Map();
let mapInstanceSequence = 0;
// Match the governed proxy's bounded per-client capacity. Eight requests lets
// imagery and native-zoom labels arrive together without a serialized blank map.
setMaxParallelImageRequests(8);
export const emptyCollection = () => ({ type: 'FeatureCollection', features: [] });
export const mapRuntime = globalThis.__VIGIA_MAP_RUNTIME__ ?? {
  schemaVersion: 'vigia.map-runtime.v2', engine: 'maplibre-gl', engineVersion: '6.7.0', renderer: 'webgl', startedAt: new Date().toISOString(),
  mountCount: 0, destroyCount: 0, styleReloadCount: 0, sourceUpdateCount: 0, filterUpdateCount: 0, tileRequests: 0, cacheHits: 0, tileFailures: 0, overlayFailures: 0,
  blankFrameDurationMs: 0, longestMainThreadTaskMs: 0, scenes: {},
};
Object.assign(mapRuntime, { engine: 'maplibre-gl', engineVersion: '6.7.0', renderer: 'webgl' });
mapRuntime.rasterRequestParallelism = getMaxParallelImageRequests();
globalThis.__VIGIA_MAP_RUNTIME__ = mapRuntime;

export function sceneRuntime(map) {
  const owner = map.closest('.canonical-map')?.dataset.mapSceneOwner ?? map.dataset.mapSceneScope ?? 'UNSCOPED';
  const scene = mapRuntime.scenes[owner] ?? { owner, mountCount: 0, destroyCount: 0, styleReloadCount: 0, sourceUpdateCount: 0, filterUpdateCount: 0, cameraChangeReason: 'initial', tileRequests: 0, cacheHits: 0, failures: 0, timeToFirstBaseTileMs: null, timeToStableMapMs: null, blankFrameDurationMs: 0 };
  mapRuntime.scenes[owner] = scene;
  return scene;
}

export function initializeMapRuntime(map) {
  if (!map.dataset.mapInstanceId) { map.dataset.mapInstanceId = `vigia-map-${++mapInstanceSequence}`; map.dataset.mapMountedAt = String(performance.now()); mapRuntime.mountCount += 1; sceneRuntime(map).mountCount += 1; }
  const scene = sceneRuntime(map);
  map.dataset.mapMountCount = String(scene.mountCount); map.dataset.mapDestroyCount = String(scene.destroyCount); map.dataset.mapStyleReloadCount = String(scene.styleReloadCount);
  map.dataset.mapSourceUpdateCount = String(scene.sourceUpdateCount); map.dataset.mapFilterUpdateCount = String(scene.filterUpdateCount); map.dataset.mapBlankFrameDurationMs = '0';
}

export function parseConfig(map) { try { return JSON.parse(map.dataset.mapConfig ?? '{}'); } catch { return null; } }

