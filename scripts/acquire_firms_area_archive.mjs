#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argument = (name, fallback = null) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const start = argument('start');
const end = argument('end');
const key = process.env.NASA_FIRMS_MAP_KEY;
const bbox = argument('bbox', '-9.75,36.7,-6,42.3');
const sources = argument('sources', 'VIIRS_NOAA20_SP,VIIRS_SNPP_SP').split(',').map((item) => item.trim()).filter(Boolean);
const outputName = argument('name', `${start}_${end}`);
const outputDirectory = path.join(root, 'data', 'replay', 'raw', 'nasa-firms', 'area-archive', outputName);
const DAY = 86_400_000;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const date = (value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || !Number.isFinite(parsed.getTime())) throw new Error(`invalid_date_${value}`);
  return parsed;
};
if (!key) throw new Error('NASA_FIRMS_MAP_KEY_not_configured');
const first = date(start), last = date(end);
if (first > last) throw new Error('start_after_end');
if (!sources.length || sources.some((source) => !/^VIIRS_(?:NOAA20|SNPP)_SP$/.test(source))) throw new Error('unsupported_source');
if (!/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(bbox)) throw new Error('invalid_bbox');

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const windows = [];
for (let cursor = first.getTime(); cursor <= last.getTime(); cursor += 5 * DAY) {
  const from = new Date(cursor);
  const remaining = Math.floor((last.getTime() - cursor) / DAY) + 1;
  windows.push({ from: from.toISOString().slice(0, 10), days: Math.min(5, remaining) });
}

async function acquire(source, window) {
  const filename = `${source}_${window.from}_${window.days}d.csv`;
  const target = path.join(outputDirectory, filename);
  try {
    const existing = await readFile(target);
    if (existing.toString('utf8').startsWith('latitude,longitude,')) return { source, window, filename, body: existing, resumed: true };
  } catch {}
  const endpoint = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/${source}/${bbox}/${window.days}/${window.from}`;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await fetch(endpoint, { headers: { accept: 'text/csv', 'user-agent': 'VIGIA/10.0 governed-area-archive' } });
    if (response.ok) {
      const body = Buffer.from(await response.arrayBuffer());
      if (!body.toString('utf8').startsWith('latitude,longitude,')) throw new Error(`firms_invalid_csv_${source}_${window.from}`);
      await writeFile(target, body);
      return { source, window, filename, body, resumed: false };
    }
    if (response.status !== 429 && response.status < 500) throw new Error(`firms_http_${response.status}_${source}_${window.from}`);
    const retryAfter = Number(response.headers.get('retry-after'));
    await wait(Number.isFinite(retryAfter) ? retryAfter * 1_000 : Math.min(15_000, 500 * 2 ** attempt));
  }
  throw new Error(`firms_retry_exhausted_${source}_${window.from}`);
}

await mkdir(outputDirectory, { recursive: true });
const tasks = sources.flatMap((source) => windows.map((window) => ({ source, window })));
const results = [];
for (let index = 0; index < tasks.length; index += 2) {
  const batch = await Promise.all(tasks.slice(index, index + 2).map(({ source, window }) => acquire(source, window)));
  results.push(...batch);
}
const products = results.map((item) => ({
  source: item.source,
  start: item.window.from,
  days: item.window.days,
  file: path.relative(root, path.join(outputDirectory, item.filename)),
  checksumSha256: sha256(item.body),
  bytes: item.body.length,
  rows: Math.max(0, item.body.toString('utf8').trim().split(/\r?\n/).length - 1),
  resumed: item.resumed
}));
const manifest = {
  schema: 'vigia.firms-area-archive.v1',
  acquiredAt: new Date().toISOString(),
  provider: 'NASA LANCE FIRMS',
  products: 'VIIRS standard active-fire CSV area products',
  region: { bbox, qualification: 'Bounding-box acquisition; downstream reference matching determines evaluation eligibility.' },
  timeRange: { start, end },
  selection: 'Every provider row returned in consecutive non-overlapping windows; no outcome-based selection.',
  sources,
  requestWindowMaximumDays: 5,
  keyPresentDuringAcquisition: true,
  productsInventory: products,
  totals: { products: products.length, rows: products.reduce((sum, item) => sum + item.rows, 0), bytes: products.reduce((sum, item) => sum + item.bytes, 0) }
};
await writeFile(path.join(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ outputDirectory, timeRange: manifest.timeRange, sources, totals: manifest.totals, resumed: products.filter((item) => item.resumed).length }, null, 2));
