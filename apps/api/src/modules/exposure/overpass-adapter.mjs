import { fetchJson } from '../../shared/fetch.mjs';
import { loadArchivedStructureContext } from './archived-structure-context.mjs';

const ENDPOINTS = Object.freeze([
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
]);

function coordinateOf(element) {
  const lon = Number(element.lon ?? element.center?.lon);
  const lat = Number(element.lat ?? element.center?.lat);
  return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null;
}

function assetKind(tags = {}) {
  if (tags.amenity) return tags.amenity;
  if (tags.emergency) return `emergency-${tags.emergency}`;
  if (tags.power) return `power-${tags.power}`;
  if (tags.highway) return `road-${tags.highway}`;
  return 'mapped-asset';
}

function labelFor(tags = {}, kind) {
  return tags.name ?? tags.ref ?? tags.operator ?? kind.replaceAll('-', ' ');
}

function parseAssets(payload) {
  return (Array.isArray(payload?.elements) ? payload.elements : [])
    .map((element) => {
      const coordinate = coordinateOf(element);
      if (!coordinate) return null;
      const kind = assetKind(element.tags);
      return {
        id: `osm:${element.type}:${element.id}`,
        kind,
        label: labelFor(element.tags, kind),
        coordinate,
        tags: {
          amenity: element.tags?.amenity ?? null,
          power: element.tags?.power ?? null,
          highway: element.tags?.highway ?? null,
          emergency: element.tags?.emergency ?? null
        }
      };
    })
    .filter(Boolean);
}

function parseBuildings(payload) {
  return (payload?.elements ?? []).map((element) => coordinateOf(element)).filter(Boolean).slice(0, 1200);
}

function assetQuery(lat, lon) {
  return `[out:json][timeout:12];(
    nwr["amenity"~"hospital|clinic|school|kindergarten|nursing_home|fire_station"](around:9000,${lat},${lon});
    nwr["emergency"~"ambulance_station|fire_hydrant"](around:6000,${lat},${lon});
    nwr["power"~"substation|plant|generator"](around:9000,${lat},${lon});
    way["highway"~"motorway|trunk|primary|secondary"](around:7000,${lat},${lon});
  );out center tags 160;`;
}

function buildingPointQuery(lat, lon) { return `[out:json][timeout:12];nwr["building"](around:3200,${lat},${lon});out center 1200;`; }

async function fetchAcrossEndpoints(query, { fetchImpl, timeoutMs, endpointLimit = ENDPOINTS.length }) {
  let lastError = null;
  for (const endpoint of ENDPOINTS.slice(0, endpointLimit)) {
    try {
      const payload = await fetchJson(endpoint, {
        fetchImpl,
        timeoutMs,
        method: 'POST',
        body: new URLSearchParams({ data: query }),
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' }
      });
      return { payload, endpoint };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('overpass_unavailable');
}

export async function loadOverpassStructureContext({ coordinate, fetchImpl = globalThis.fetch }) {
  const [lon, lat] = coordinate.map(Number);
  try {
    const result = await fetchAcrossEndpoints(buildingPointQuery(lat, lon), { fetchImpl, timeoutMs: 8_000, endpointLimit: 1 });
    const buildingPoints = parseBuildings(result.payload);
    if (!buildingPoints.length) throw new Error('overpass_buildings_empty');
    return {
      buildingPoints,
      buildingCount: buildingPoints.length < 1200 ? buildingPoints.length : null,
      endpoint: result.endpoint,
      provider: 'OpenStreetMap via Overpass',
      partial: buildingPoints.length >= 1200,
      archived: false,
      acquiredAt: new Date().toISOString(),
      sourceRecordCount: buildingPoints.length,
      sourceChecksum: null,
      archivePath: null,
      limitation: buildingPoints.length >= 1200
        ? 'OpenStreetMap response reached the 1,200-record cap; this is mapped context, not a structure census.'
        : 'OpenStreetMap completeness varies. Mapped structures are context, not a census.'
    };
  } catch (error) {
    const archived = await loadArchivedStructureContext(coordinate);
    if (archived) return { ...archived, liveError: String(error.message ?? error) };
    throw error;
  }
}

export async function loadOverpassExposure({ coordinate, fetchImpl = globalThis.fetch }) {
  const [lon, lat] = coordinate.map(Number);
  // Overpass applies per-client resource scheduling. Running two spatial
  // queries concurrently can queue both until our deadline. Resolve the
  // detector-critical building geometry first, then enrich with assets.
  const buildingsResult = await Promise.resolve(fetchAcrossEndpoints(buildingPointQuery(lat, lon), { fetchImpl, timeoutMs: 13_000 })).then((value)=>({status:'fulfilled',value}),(reason)=>({status:'rejected',reason}));
  const assetsResult = await Promise.resolve(fetchAcrossEndpoints(assetQuery(lat, lon), { fetchImpl, timeoutMs: 9_000 })).then((value)=>({status:'fulfilled',value}),(reason)=>({status:'rejected',reason}));
  if (assetsResult.status === 'rejected' && buildingsResult.status === 'rejected') {
    throw assetsResult.reason ?? buildingsResult.reason ?? new Error('overpass_unavailable');
  }
  const assets = assetsResult.status === 'fulfilled' ? parseAssets(assetsResult.value.payload) : [];
  const buildingPoints = buildingsResult.status === 'fulfilled' ? parseBuildings(buildingsResult.value.payload) : [];
  const buildingCount = buildingPoints.length < 1200 ? buildingPoints.length : null;
  return {
    buildingCount, buildingPoints,
    assets,
    endpoint: assetsResult.status === 'fulfilled' ? assetsResult.value.endpoint : buildingsResult.value.endpoint,
    partial: assetsResult.status === 'rejected' || buildingsResult.status === 'rejected' || buildingCount === null
  };
}
