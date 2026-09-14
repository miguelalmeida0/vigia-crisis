import { createHash } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { extractTerrain } from './terrain-grid.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const incidentPath = path.resolve(root, process.env.FIELDNET_INCIDENT_PACKAGE ?? 'data/validation/fieldnet/real-incident-package.json');
const derivedDirectory = path.resolve(root, process.env.FIELDNET_GEOGRAPHY_DIRECTORY ?? 'data/validation/fieldnet/offline-geography');
const osmArchiveDirectory = path.resolve(root, 'data/replay/raw/openstreetmap/fieldnet-incident-v1');
const demArchiveDirectory = path.resolve(root, 'data/replay/raw/copernicus-dem/fieldnet-incident-v1');
const bufferKm = Math.max(2, Math.min(20, Number(process.env.FIELDNET_GEOGRAPHY_BUFFER_KM ?? 8)));
const overpassEndpoint = process.env.FIELDNET_OVERPASS_ENDPOINT ?? 'https://overpass-api.de/api/interpreter';
const demUrl = process.env.FIELDNET_DEM_URL ?? 'https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N37_00_W007_00_DEM/Copernicus_DSM_COG_10_N37_00_W007_00_DEM.tif';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const bboxFor = ([lon, lat], distanceKm) => {
  const latitudeDelta = distanceKm / 111.32;
  const longitudeDelta = distanceKm / (111.32 * Math.cos(lat * Math.PI / 180));
  return [lon - longitudeDelta, lat - latitudeDelta, lon + longitudeDelta, lat + latitudeDelta];
};
const distanceSq = ([lon, lat], [otherLon, otherLat]) => ((lon - otherLon) * Math.cos(lat * Math.PI / 180)) ** 2 + (lat - otherLat) ** 2;

function perpendicularDistance(point, start, end) {
  const dx = end[0] - start[0], dy = end[1] - start[1];
  if (dx === 0 && dy === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy));
}

function simplify(points, tolerance = 0.000035) {
  if (points.length <= 2) return points;
  let furthest = 0, index = 0;
  for (let cursor = 1; cursor < points.length - 1; cursor += 1) {
    const distance = perpendicularDistance(points[cursor], points[0], points.at(-1));
    if (distance > furthest) { furthest = distance; index = cursor; }
  }
  if (furthest <= tolerance) return [points[0], points.at(-1)];
  return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)];
}

function featureKind(tags = {}) {
  if (tags.highway) return ['ROAD', tags.highway];
  if (tags.building) return ['STRUCTURE', tags.building];
  if (tags.waterway || tags.natural === 'water' || tags.water || tags.landuse === 'reservoir') return ['WATER', tags.waterway ?? tags.water ?? tags.natural ?? tags.landuse];
  if (tags.place) return ['PLACE', tags.place];
  return [null, null];
}

function osmFeature(element, incidentCoordinate) {
  const [kind, subtype] = featureKind(element.tags);
  if (!kind) return null;
  const rawCoordinates = (element.geometry ?? []).map(({ lon, lat }) => [lon, lat]).filter((point) => point.every(Number.isFinite));
  const center = Number.isFinite(element.lon) && Number.isFinite(element.lat)
    ? [element.lon, element.lat]
    : Number.isFinite(element.center?.lon) && Number.isFinite(element.center?.lat)
      ? [element.center.lon, element.center.lat]
      : rawCoordinates[Math.floor(rawCoordinates.length / 2)];
  if (!center) return null;
  let geometry;
  if (kind === 'PLACE') geometry = { type: 'Point', coordinates: center };
  else if (kind === 'STRUCTURE' || (kind === 'WATER' && rawCoordinates.length > 3 && rawCoordinates[0][0] === rawCoordinates.at(-1)[0] && rawCoordinates[0][1] === rawCoordinates.at(-1)[1])) {
    const ring = simplify(rawCoordinates);
    if (ring.length < 4) geometry = { type: 'Point', coordinates: center };
    else geometry = { type: 'Polygon', coordinates: [ring] };
  } else if (rawCoordinates.length >= 2) geometry = { type: 'LineString', coordinates: simplify(rawCoordinates) };
  else geometry = { type: 'Point', coordinates: center };
  return {
    type: 'Feature',
    id: `osm:${element.type}/${element.id}`,
    geometry,
    properties: {
      kind,
      subtype,
      name: element.tags?.name ?? null,
      ref: element.tags?.ref ?? null,
      surface: element.tags?.surface ?? null,
      access: element.tags?.access ?? null,
      source: 'OpenStreetMap',
      sourceId: `${element.type}/${element.id}`,
      distanceRank: distanceSq(incidentCoordinate, center)
    }
  };
}

function selectBoundedFeatures(features) {
  const limits = { ROAD: 500, STRUCTURE: 360, WATER: 140, PLACE: 100 };
  const roadRank = { motorway: 0, trunk: 1, primary: 2, secondary: 3, tertiary: 4, unclassified: 5, residential: 6, service: 7, track: 8, path: 9, footway: 10 };
  return Object.entries(limits).flatMap(([kind, limit]) => features.filter((feature) => feature.properties.kind === kind).sort((left, right) => {
    if (kind === 'ROAD') {
      const rankDelta = (roadRank[left.properties.subtype] ?? 20) - (roadRank[right.properties.subtype] ?? 20);
      if (rankDelta) return rankDelta;
    }
    return left.properties.distanceRank - right.properties.distanceRank;
  }).slice(0, limit)).map((feature) => ({ ...feature, properties: Object.fromEntries(Object.entries(feature.properties).filter(([key, value]) => key !== 'distanceRank' && value != null)) }));
}

async function acquireOsm(incidentCoordinate, bbox) {
  const [west, south, east, north] = bbox;
  const query = `[out:json][timeout:90];(way["highway"](${south},${west},${north},${east});way["building"](${south},${west},${north},${east});way["waterway"](${south},${west},${north},${east});way["natural"="water"](${south},${west},${north},${east});way["landuse"="reservoir"](${south},${west},${north},${east});node["place"](${south},${west},${north},${east}););out tags center geom;`;
  const started = performance.now();
  const response = await fetch(overpassEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', 'user-agent': 'VIGIA-FieldNet/1.1 (bounded incident geography)' },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(120_000)
  });
  if (!response.ok) throw new Error(`overpass_http_${response.status}`);
  const rawBuffer = Buffer.from(await response.arrayBuffer());
  const raw = JSON.parse(rawBuffer.toString('utf8'));
  const acquiredAt = new Date().toISOString();
  await mkdir(osmArchiveDirectory, { recursive: true });
  const rawPath = path.join(osmArchiveDirectory, 'incident-osm-response.json');
  await writeFile(rawPath, rawBuffer);
  const allFeatures = (raw.elements ?? []).map((element) => osmFeature(element, incidentCoordinate)).filter(Boolean);
  const features = selectBoundedFeatures(allFeatures);
  const counts = Object.fromEntries(['ROAD', 'STRUCTURE', 'WATER', 'PLACE'].map((kind) => [kind.toLowerCase(), features.filter((feature) => feature.properties.kind === kind).length]));
  const output = {
    schemaVersion: 'vigia.fieldnet-offline-geography.v1',
    acquiredAt,
    bbox,
    configurableBufferKm: bufferKm,
    source: { provider: 'OpenStreetMap via Overpass API', endpoint: overpassEndpoint, license: 'ODbL', copyright: raw.osm3s?.copyright ?? 'OpenStreetMap contributors', providerTimestamp: raw.osm3s?.timestamp_osm_base ?? null, rawSha256: `sha256:${sha256(rawBuffer)}`, rawRecordCount: raw.elements?.length ?? 0 },
    counts,
    featureCollection: { type: 'FeatureCollection', features },
    qualification: 'Bounded incident-scoped vector geography derived from archived OSM records. No remote tile request is required at runtime.'
  };
  await writeFile(path.join(osmArchiveDirectory, 'manifest.json'), json({ ...output, featureCollection: undefined, query, rawPath: path.relative(root, rawPath) }));
  return { output, durationMs: Number((performance.now() - started).toFixed(1)) };
}

async function downloadIfMissing(url, outputPath) {
  const head = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(30_000) });
  if (!head.ok) throw new Error(`copernicus_dem_head_http_${head.status}`);
  const expectedBytes = Number(head.headers.get('content-length'));
  if (!existsSync(outputPath) || (await stat(outputPath)).size !== expectedBytes) {
    const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok || !response.body) throw new Error(`copernicus_dem_http_${response.status}`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(outputPath));
  }
  return { expectedBytes, etag: head.headers.get('etag'), lastModified: head.headers.get('last-modified') };
}

async function acquireTerrain(bbox) {
  const started = performance.now();
  await mkdir(demArchiveDirectory, { recursive: true });
  const rawPath = path.join(demArchiveDirectory, 'Copernicus_DSM_COG_10_N37_00_W007_00_DEM.tif');
  const remote = await downloadIfMissing(demUrl, rawPath);
  const rawBuffer = await readFile(rawPath);
  const source = {
    provider: 'Copernicus DEM GLO-30 via Copernicus DEM public object storage',
    product: 'Copernicus_DSM_COG_10_N37_00_W007_00_DEM',
    url: demUrl,
    rawSha256: `sha256:${sha256(rawBuffer)}`,
    rawByteLength: rawBuffer.length,
    etag: remote.etag,
    lastModified: remote.lastModified,
    rawArchivePath: path.relative(root, rawPath)
  };
  const output = extractTerrain(rawBuffer, bbox, source);
  await writeFile(path.join(demArchiveDirectory, 'manifest.json'), json({ ...source, bbox, derivedGrid: { width: output.width, height: output.height, statistics: output.statistics } }));
  return { output, durationMs: Number((performance.now() - started).toFixed(1)) };
}

export async function acquireIncidentGeography() {
  const incident = await readJson(incidentPath);
  const coordinate = incident.incidentState?.coordinate ?? incident.offlineMap?.incidentAnchor?.coordinates;
  if (!Array.isArray(coordinate) || !coordinate.every(Number.isFinite)) throw new Error('incident_coordinate_required');
  const bbox = bboxFor(coordinate, bufferKm);
  const [osm, terrain] = await Promise.all([acquireOsm(coordinate, bbox), acquireTerrain(bbox)]);
  await mkdir(derivedDirectory, { recursive: true });
  const geographyPath = path.join(derivedDirectory, 'incident-geography.json');
  const terrainPath = path.join(derivedDirectory, 'incident-terrain.json');
  await Promise.all([writeFile(geographyPath, json(osm.output)), writeFile(terrainPath, json(terrain.output))]);
  const geographyBytes = (await stat(geographyPath)).size, terrainBytes = (await stat(terrainPath)).size;
  const result = {
    ok: true,
    incidentId: incident.incidentId,
    bbox,
    bufferKm,
    geographyPath,
    terrainPath,
    counts: osm.output.counts,
    terrain: terrain.output.statistics,
    bytes: { derivedGeography: geographyBytes, derivedTerrain: terrainBytes, rawDem: terrain.output.source.rawByteLength },
    durationMs: { geography: osm.durationMs, terrain: terrain.durationMs }
  };
  await writeFile(path.join(derivedDirectory, 'acquisition-summary.json'), json(result));
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await acquireIncidentGeography();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
