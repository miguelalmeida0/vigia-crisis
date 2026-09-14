import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createPinnedHttpsFetch } from '../../apps/api/src/shared/pinned-https-fetch.mjs';
import { signOperatorProxyRequest } from '../../packages/domain/src/operator-proxy/request-auth.mjs';
import { createGovernedContextArchiveClient } from './governed-context-archive-client.mjs';
import { acquireTerrainSamples, buildTerrainSamples, projectTerrain } from './governed-terrain-context.mjs';
const root = process.cwd();
const rawRoot = path.join(root, 'data', 'reference', 'operational-proof', 'raw');
const outputFile = path.join(root, 'data', 'reference', 'operational-proof', 'governed-incident-context.json');
const apiOrigin = 'http://127.0.0.1:4177';
const operatorOrigin = 'http://127.0.0.1:4190';
const manifest = JSON.parse(await readFile(path.join(root, 'data', 'validation', 'release', 'current-release-manifest.json'), 'utf8'));
const operatorKey = String(await readFile(path.join(root, '.tmp', 'release', 'operator-token'), 'utf8')).trim();
const pinnedFetch = createPinnedHttpsFetch({ timeoutMs: 180_000 });
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const rows = (value) => Array.isArray(value) ? value : [];
async function retainedResponseFacilityMetadata(){try{const existing=JSON.parse(await readFile(outputFile,'utf8')),openStreetMap=existing?.sources?.openStreetMap??{};return{archives:rows(openStreetMap.archives).filter((entry)=>entry?.purpose==='RESPONSE_FACILITIES'),query:openStreetMap.queries?.responseFacilities??null,retrievedAt:openStreetMap.responseFacilitiesRetrievedAt??null,counts:openStreetMap.featureCounts?.responseFacilitiesByKind??null};}catch(error){if(error.code==='ENOENT')return{archives:[],query:null,retrievedAt:null,counts:null};throw error;}}
async function operatorRequest(route) {
  const headers = {
    accept: 'application/json',
    origin: operatorOrigin,
    'sec-fetch-site': 'same-origin',
    'x-vigia-ui-proxy': 'mission-dark-realdata-2.0',
    ...signOperatorProxyRequest({
      key: operatorKey,
      releaseId: manifest.releaseId,
      method: 'GET',
      path: route,
      bodyBytes: Buffer.alloc(0),
      intent: '',
    }),
  };
  const response = await fetch(`${apiOrigin}${route}`, { headers, signal: AbortSignal.timeout(30_000) });
  const payload = await response.json();
  if (!response.ok) throw new Error(`operator_request_failed:${route}:${response.status}:${payload.error ?? 'unknown'}`);
  return payload;
}
const archiveClient = createGovernedContextArchiveClient({ root, rawRoot, pinnedFetch, sha256, sleep });
function coordinateOfOsm(element) {
  const lat = finite(element.lat ?? element.center?.lat);
  const lon = finite(element.lon ?? element.center?.lon);
  return lat === null || lon === null ? null : [lon, lat];
}
function distanceKm(left, right) {
  if (!left || !right) return null;
  const radians = Math.PI / 180;
  const lat1 = left[1] * radians;
  const lat2 = right[1] * radians;
  const dLat = (right[1] - left[1]) * radians;
  const dLon = (right[0] - left[0]) * radians;
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}
function nearest(items, coordinate, predicate = () => true) {
  return items.filter(predicate).map((item) => ({ item, distanceKm: distanceKm(coordinate, item.coordinate) })).filter((entry) => entry.distanceKm !== null).sort((left, right) => left.distanceKm - right.distanceKm)[0] ?? null;
}
const incidentsPayload = await operatorRequest('/api/v10/operator/incidents');
const incidentRows = rows(incidentsPayload?.data?.canonicalIncidents?.value?.incidents);
const incidents = incidentRows.map((row) => ({
  incidentId: String(row?.incident?.id ?? ''),
  label: row?.incident?.label ?? row?.incident?.location?.label ?? null,
  coordinate: rows(row?.incident?.coordinate).length === 2 ? row.incident.coordinate.map(Number) : null,
  classification: row?.operationalTruth?.classification ?? null,
  lastObservedAt: row?.operationalTruth?.lastObservedAt ?? row?.incident?.updatedAt ?? null,
})).filter((row) => row.incidentId && row.coordinate?.every(Number.isFinite));
const cellMetres = 25;
const terrainSamples = buildTerrainSamples(incidents, cellMetres);
const { terrainArchives, terrainResults } = await acquireTerrainSamples({
  samples: terrainSamples,
  archiveClient,
  pinnedFetch,
  sha256,
  sleep,
});
const osmContextQuery = '[out:json][timeout:150];(nwr["amenity"~"^(hospital|clinic|fire_station)$"](36.7,-9.75,42.3,-6);node["place"~"^(city|town|village)$"](36.7,-9.75,42.3,-6);relation["boundary"="protected_area"](36.7,-9.75,42.3,-6););out center tags qt;';
const contextResult = await archiveClient.overpass('osm-community-medical-fire-protected.json', osmContextQuery, path.join(root, '.artifacts', 'operational-proof-field-deployment', 'baseline', 'osm-context-probe.json'));
const roadBands = [[36.7, 38.1, -9.75, -6]];
for (let south = 38.1; south < 42.3; south += 0.7) {
  const north = Math.min(42.3, Number((south + 0.7).toFixed(1)));
  roadBands.push([Number(south.toFixed(1)), north, -9.75, -7.875], [Number(south.toFixed(1)), north, -7.875, -6]);
}
const roadResults = [];
for (const [index, [south, north, west, east]] of roadBands.entries()) {
  const query = `[out:json][timeout:150];way["highway"~"^(motorway|trunk|primary|secondary)$"](${south},${west},${north},${east});out center tags qt;`;
  const seed = index === 0 ? path.join(root, '.artifacts', 'operational-proof-field-deployment', 'baseline', 'osm-road-probe.json') : null;
  roadResults.push(await archiveClient.overpass(`osm-major-roads-band-${index + 1}.json`, query, seed));
  if (!seed) await sleep(2_500);
}
const osmRows = rows(contextResult.payload.elements).map((element) => ({
  id: `${element.type}/${element.id}`,
  coordinate: coordinateOfOsm(element),
  name: element.tags?.name ?? element.tags?.short_name ?? null,
  category: element.tags?.amenity ?? element.tags?.place ?? (element.tags?.boundary === 'protected_area' ? 'protected_area' : null),
  tags: element.tags ?? {},
})).filter((item) => item.coordinate && item.category);
const roads = roadResults.flatMap((result) => rows(result.payload.elements)).map((element) => ({
  id: `${element.type}/${element.id}`,
  coordinate: coordinateOfOsm(element),
  name: element.tags?.name ?? element.tags?.ref ?? null,
  category: element.tags?.highway ?? null,
  tags: element.tags ?? {},
})).filter((item) => item.coordinate && item.category);
const retainedIndustrial = JSON.parse(await readFile(path.join(root, 'data', 'reference', 'portugal-thermal-context-v1.json'), 'utf8'));
const industrial = rows(retainedIndustrial.features).map((item) => ({ id: item.id, coordinate: item.paths?.[0]?.[0] ?? null, name: item.name ?? null, category: item.contextClass, tags: item.tags ?? {} })).filter((item) => item.coordinate?.length === 2);
const retrievedAt = new Date().toISOString();
const responseFacilityMetadata = await retainedResponseFacilityMetadata();
const contexts = incidents.map((incident) => {
  const terrain = projectTerrain(incident, terrainResults, cellMetres);
  const community = nearest(osmRows, incident.coordinate, (item) => ['city', 'town', 'village'].includes(item.category));
  const medical = nearest(osmRows, incident.coordinate, (item) => ['hospital', 'clinic'].includes(item.category));
  const fireStation = nearest(osmRows, incident.coordinate, (item) => item.category === 'fire_station');
  const protectedArea = nearest(osmRows, incident.coordinate, (item) => item.category === 'protected_area');
  const road = nearest(roads, incident.coordinate);
  const criticalAsset = nearest(industrial, incident.coordinate);
  const contextual = (entry, kind, fallback) => entry ? {
    id: entry.item.id,
    label: entry.item.name ?? fallback,
    kind,
    coordinate: entry.item.coordinate,
    distanceKm: Number(entry.distanceKm.toFixed(2)),
    source: 'OpenStreetMap contributors',
    sourceObservedAt: null,
    retrievedAt,
    preliminary: true,
    method: 'GREAT_CIRCLE_TO_OSM_POINT_OR_FEATURE_CENTER',
    limitation: 'Point-based proximity context only; mapping completeness and feature-center distance may differ from access or travel distance.',
  } : null;
  return {
    incidentId: incident.incidentId,
    incidentLabel: incident.label,
    coordinate: incident.coordinate,
    classificationAtAcquisition: incident.classification,
    incidentLastObservedAt: incident.lastObservedAt,
    terrain: terrain.state === 'AVAILABLE' ? {
      ...terrain,
      provider: 'OpenTopoData public API',
      sourceOwner: 'European Union / European Environment Agency',
      product: 'EU-DEM',
      productVersion: '1.1',
      productReferenceYear: 2011,
      resolutionM: 25,
      horizontalCrs: 'EPSG:3035 source; WGS84 query coordinates',
      verticalDatum: 'EVRS2000',
      verticalAccuracy: '±7 m RMSE stated by EEA',
      retrievedAt,
      license: 'Copernicus full, open and free access; source attribution required',
      computation: '3×3 bilinear elevation samples at 25 m spacing; Horn finite-difference slope/aspect; local relief and mean center-neighbor ruggedness.',
      precisionBoundary: 'Elevation and relief are rounded to whole metres; slope to 0.1 degree; source is a digital surface model, not a local survey.',
      decisionBoundary: 'Static context only. Does not prove fire behavior, accessibility, exposure, or current surface conditions.',
    } : terrain,
    pointContext: {
      community: contextual(community, 'COMMUNITY', 'Mapped community'),
      medicalAccess: contextual(medical, 'MEDICAL_ACCESS', 'Mapped medical facility'),
      fireStation: contextual(fireStation, 'FIRE_STATION', 'Mapped fire station'),
      protectedArea: contextual(protectedArea, 'PROTECTED_AREA', 'Mapped protected area'),
      majorRoad: contextual(road, 'MAJOR_ROAD', 'Mapped major road'),
      wildfireRelevantAsset: contextual(criticalAsset, 'WILDFIRE_RELEVANT_LAND_CONTEXT', 'Mapped industrial or heat-source context'),
    },
  };
});
const output = {
  schemaVersion: 'vigia.governed-incident-context.v1',
  generatedAt: retrievedAt,
  acquisitionReleaseId: manifest.releaseId,
  scope: `${incidents.length} canonical Portugal-mainland incident coordinates present in the running operator projection at acquisition time`,
  sources: {
    terrain: {
      provider: 'OpenTopoData public API',
      dataset: 'EU-DEM v1.1',
      owner: 'European Union / European Environment Agency',
      sourceMetadata: ['https://www.opentopodata.org/datasets/eudem/', 'https://cis2.eea.europa.eu/data/42/'],
      retrievedAt,
      archives: terrainArchives,
    },
    openStreetMap: {
      provider: 'OpenStreetMap contributors via Overpass API',
      license: 'ODbL 1.0; attribution required',
      retrievedAt,
      queries: {
        context: osmContextQuery,
        roadBands,
        ...(responseFacilityMetadata.query ? { responseFacilities: responseFacilityMetadata.query } : {}),
      },
      ...(responseFacilityMetadata.retrievedAt ? { responseFacilitiesRetrievedAt: responseFacilityMetadata.retrievedAt } : {}),
      archives: [contextResult.archive, ...roadResults.map((result) => result.archive), ...responseFacilityMetadata.archives],
      featureCounts: {
        communityMedicalFireProtected: osmRows.length,
        majorRoadSegments: roads.length,
        retainedIndustrialContext: industrial.length,
        ...(responseFacilityMetadata.counts ? { responseFacilitiesByKind: responseFacilityMetadata.counts } : {}),
      },
    },
  },
  coverage: {
    validCoordinates: incidents.length,
    terrainAvailable: contexts.filter((item) => item.terrain.state === 'AVAILABLE').length,
    terrainUnavailable: contexts.filter((item) => item.terrain.state !== 'AVAILABLE').length,
    community: contexts.filter((item) => item.pointContext.community).length,
    medicalAccess: contexts.filter((item) => item.pointContext.medicalAccess).length,
    fireStation: contexts.filter((item) => item.pointContext.fireStation).length,
    protectedArea: contexts.filter((item) => item.pointContext.protectedArea).length,
    majorRoad: contexts.filter((item) => item.pointContext.majorRoad).length,
    wildfireRelevantAsset: contexts.filter((item) => item.pointContext.wildfireRelevantAsset).length,
  },
  incidents: contexts,
  truthBoundary: 'Terrain is retained static context. OpenStreetMap rows are preliminary point-based proximity context. Neither source is incident verification, official authority, observed impact, travel-time truth, or forecast geometry.',
};
await mkdir(path.dirname(outputFile), { recursive: true });
await writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ output: path.relative(root, outputFile), coverage: output.coverage, archives: { terrain: terrainArchives.length, osm: output.sources.openStreetMap.archives.length } }, null, 2)}\n`);
