import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import path from 'node:path';

import { createPinnedHttpsFetch } from '../../apps/api/src/shared/pinned-https-fetch.mjs';

export const root = process.cwd();
export const rawRoot = path.join(root, 'data/reference/operational-proof/raw');
export const collectionRoot = path.join(root, '.artifacts/anduril-class-crisis-os/collection');
export const segmentCacheRoot = path.join(collectionRoot, 'response-facility-segments');
export const runEvidenceRoot = path.join(collectionRoot, 'response-facility-acquisition-runs');
export const contextPath = path.join(root, 'data/reference/operational-proof/governed-incident-context.json');
export const baselineArchivePath = path.join(rawRoot, 'osm-community-medical-fire-protected.json');
export const evidencePath = path.join(collectionRoot, 'response-facility-acquisition.json');
export const endpoints = Object.freeze([
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]);

const acquisitionBands = Object.freeze([
  [36.7, -9.75, 38.0, -6],
  [38.0, -9.75, 39.0, -6],
  [39.0, -9.75, 40.0, -6],
  [40.0, -9.75, 41.0, -6],
  [41.0, -9.75, 42.3, -6],
]);
const queryGroups = Object.freeze([
  ['response-support', (bbox) => [
    `nwr["amenity"="ambulance_station"](${bbox.join(',')});`,
    `nwr["emergency"="ambulance_station"](${bbox.join(',')});`,
    `nwr["amenity"="police"](${bbox.join(',')});`,
    `nwr["amenity"="shelter"](${bbox.join(',')});`,
    `nwr["emergency"="shelter"](${bbox.join(',')});`,
    `nwr["amenity"="social_facility"]["social_facility"="shelter"](${bbox.join(',')});`,
  ].join('')],
  ['civil-protection', (bbox) => [
    `nwr["government"="civil_protection"](${bbox.join(',')});`,
    `nwr["emergency"="civil_protection"](${bbox.join(',')});`,
    `nwr["office"="government"](${bbox.join(',')});`,
  ].join('')],
  ['air-support', (bbox) => [
    `nwr["aeroway"="heliport"](${bbox.join(',')});`,
    `nwr["aeroway"="helipad"](${bbox.join(',')});`,
  ].join('')],
  ['water-support', (bbox) => [
    `node["emergency"="fire_hydrant"](${bbox.join(',')});`,
    `node["emergency"="water_tank"](${bbox.join(',')});`,
  ].join('')],
]);
const queryGroupByName = Object.freeze(Object.fromEntries(queryGroups));
const makeSegment = (group, bbox) => ({
  group,
  bbox,
  query: `[out:json][timeout:60];(${queryGroupByName[group](bbox)});out center tags qt;`,
});
const splitLongitude = ([south, west, north, east]) => {
  const midpoint = Number(((west + east) / 2).toFixed(6));
  if (south < 39) return [[south, west, north, midpoint], [south, midpoint, north, east]];
  if (south === 39) {
    const easternMidpoint = Number(((midpoint + east) / 2).toFixed(6));
    return [[south, west, north, midpoint], [south, midpoint, north, easternMidpoint], [south, easternMidpoint, north, east]];
  }
  const westernMidpoint = Number(((west + midpoint) / 2).toFixed(6));
  const easternMidpoint = Number(((midpoint + east) / 2).toFixed(6));
  return [
    [south, west, north, westernMidpoint],
    [south, westernMidpoint, north, midpoint],
    [south, midpoint, north, easternMidpoint],
    [south, easternMidpoint, north, east],
  ];
};

export const acquisitionSegments = Object.freeze(acquisitionBands.flatMap((bbox) => [
  makeSegment('response-support', bbox),
  makeSegment('civil-protection', bbox),
  ...splitLongitude(bbox).map((airBbox) => makeSegment('air-support', airBbox)),
  makeSegment('water-support', bbox),
]));
export const classificationPolicy = Object.freeze({
  version: 'vigia.response-facility-local-classification.v2',
  civilProtectionSourceTags: ['office', 'government', 'emergency', 'name'],
  airSupportSourceTags: ['aeroway', 'operator', 'name', 'description'],
  truthBoundary: 'Only explicit mapped tags and locally matched operational-response terms classify a facility; mapped presence does not establish current availability or capacity.',
});
export const query = JSON.stringify({ baseline: 'osm-community-medical-fire-protected.json', classificationPolicy, segments: acquisitionSegments });
export const digest = (value) => createHash('sha256').update(value).digest('hex');
export const sha256 = (value) => `sha256:${digest(value)}`;
export const fullQueryHash = sha256(query);
const queryHash = digest(query).slice(0, 16);
export const archivePath = path.join(rawRoot, `osm-response-facilities-${queryHash}.json`);
export const archiveReference = path.relative(root, archivePath).replaceAll(path.sep, '/');
export const facilityKinds = Object.freeze(['HOSPITAL', 'FIRE_STATION', 'EMS_BASE', 'CIVIL_PROTECTION', 'POLICE', 'SHELTER', 'WATER_POINT', 'AIR_SUPPORT_BASE']);
export const pinnedFetch = createPinnedHttpsFetch({
  timeoutMs: 75_000,
  resolveHost: async (hostname) => (await lookup(hostname, { all: true, verbatim: true }))
    .sort((left, right) => Number(right.family === 4) - Number(left.family === 4)),
});

const lastEndpointAttemptAt = new Map();
export async function paceEndpoint(endpoint) {
  const minimumIntervalMs = endpoint.includes('overpass-api.de') ? 20_000 : 1_000;
  const waitMs = Math.max(0, minimumIntervalMs - (Date.now() - (lastEndpointAttemptAt.get(endpoint) ?? 0)));
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastEndpointAttemptAt.set(endpoint, Date.now());
}

export function facilityKind(tags = {}) {
  if (tags.amenity === 'hospital') return 'HOSPITAL';
  if (tags.amenity === 'fire_station') return 'FIRE_STATION';
  if (tags.emergency === 'ambulance_station' || tags.amenity === 'ambulance_station') return 'EMS_BASE';
  if (tags.amenity === 'police') return 'POLICE';
  if (tags.amenity === 'shelter' || tags.emergency === 'shelter' || (tags.amenity === 'social_facility' && tags.social_facility === 'shelter')) return 'SHELTER';
  if (['fire_hydrant', 'water_tank'].includes(tags.emergency)) return 'WATER_POINT';
  if (tags.office === 'government' && /civil.?protection|prote[cç][aã]o civil|emergency/i.test(`${tags.government ?? ''} ${tags.name ?? ''}`)) return 'CIVIL_PROTECTION';
  if (['heliport', 'helipad'].includes(tags.aeroway)
    && /fire|wildfire|civil.?protection|prote[cç][aã]o civil|emergency|emerg[eê]ncia|rescue|socorro|military|meios?\s+a[eé]reos?|defesa\s+florestal|defensa\s+forestal/i.test(`${tags.operator ?? ''} ${tags.name ?? ''} ${tags.description ?? ''}`)) return 'AIR_SUPPORT_BASE';
  return null;
}

export function validatePayload(payload, label) {
  if (!payload || !Array.isArray(payload.elements)) throw new Error(`${label}:missing_elements`);
  return payload;
}
