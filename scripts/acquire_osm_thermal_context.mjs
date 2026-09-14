#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'data', 'replay', 'raw', 'openstreetmap', 'portugal-thermal-context-v1');
const featurePath = path.join(outputDirectory, 'thermal-context-features.json');
const boundaryPath = path.join(outputDirectory, 'portugal-boundary.json');
const manifestPath = path.join(outputDirectory, 'manifest.json');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const headers = { accept: 'application/json', 'user-agent': 'VIGIA/10.0 governed-detector-validation' };

async function existing(pathname, validator) {
  try {
    const body = await readFile(pathname);
    const payload = JSON.parse(body.toString('utf8'));
    return validator(payload) ? { body, payload, resumed: true } : null;
  } catch { return null; }
}

async function fetchJson(url, options, validator) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(url, options);
    if (response.ok) {
      const body = Buffer.from(await response.arrayBuffer());
      const payload = JSON.parse(body.toString('utf8'));
      if (!validator(payload)) throw new Error(`invalid_payload_${new URL(url).hostname}`);
      return { body, payload, resumed: false };
    }
    if (response.status !== 429 && response.status < 500) throw new Error(`http_${response.status}_${new URL(url).hostname}`);
    await new Promise((resolve) => setTimeout(resolve, Math.min(20_000, 1_000 * 2 ** attempt)));
  }
  throw new Error(`retry_exhausted_${new URL(url).hostname}`);
}

await mkdir(outputDirectory, { recursive: true });
const query = `[out:json][timeout:180];(
  nwr["landuse"~"^(industrial|quarry|landfill)$"](36.7,-9.75,42.3,-6);
  nwr["power"~"^(plant|generator)$"](36.7,-9.75,42.3,-6);
  nwr["man_made"~"^(works|kiln|flare|wastewater_plant)$"](36.7,-9.75,42.3,-6);
  nwr["industrial"](36.7,-9.75,42.3,-6);
  nwr["amenity"~"^(waste_transfer_station|waste_disposal)$"](36.7,-9.75,42.3,-6);
);out tags center geom;`;
const features = await existing(featurePath, (value) => Array.isArray(value?.elements)) ?? await fetchJson(
  'https://overpass-api.de/api/interpreter',
  { method: 'POST', headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: new URLSearchParams({ data: query }) },
  (value) => Array.isArray(value?.elements)
);
if (!features.resumed) await writeFile(featurePath, features.body);

const boundary = await existing(boundaryPath, (value) => Array.isArray(value) && value.some((item) => item?.geojson)) ?? await fetchJson(
  'https://nominatim.openstreetmap.org/search?country=Portugal&countrycodes=pt&format=jsonv2&polygon_geojson=1&limit=1',
  { headers },
  (value) => Array.isArray(value) && value.some((item) => item?.geojson?.type === 'MultiPolygon' || item?.geojson?.type === 'Polygon')
);
if (!boundary.resumed) await writeFile(boundaryPath, boundary.body);

const manifest = {
  schema: 'vigia.osm-thermal-context-archive.v1',
  acquiredAt: new Date().toISOString(),
  provider: 'OpenStreetMap contributors via Overpass API and Nominatim',
  license: 'ODbL 1.0 attribution required',
  selection: 'All returned Portugal-bbox OSM features matching the frozen heat-context tag query; no detector outcomes entered selection.',
  referenceQualification: 'Collaboratively mapped land-use/site context. It is an input feature, not fire/non-fire ground truth and may be incomplete or stale.',
  query,
  files: [
    { role: 'thermal_context_features', file: path.relative(root, featurePath), checksumSha256: sha256(features.body), bytes: features.body.length, elements: features.payload.elements.length, resumed: features.resumed },
    { role: 'country_boundary', file: path.relative(root, boundaryPath), checksumSha256: sha256(boundary.body), bytes: boundary.body.length, results: boundary.payload.length, resumed: boundary.resumed }
  ]
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ outputDirectory, files: manifest.files }, null, 2));
