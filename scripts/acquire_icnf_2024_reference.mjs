import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const yearArgument = process.argv.find((item) => item.startsWith('--year='));
const year = Number(yearArgument?.slice('--year='.length) ?? 2024);
if (!Number.isInteger(year) || year < 2001 || year > new Date().getUTCFullYear()) throw new Error('icnf_reference_invalid_year');
const outputDirectory = path.join(root, 'data', 'replay', 'raw', 'ptdata', `fires-${year}-all`);
const manifestPath = path.join(outputDirectory, 'manifest.json');
const endpoint = 'https://api.ptdata.org/v1/civil-protection/fires';
const pageSize = 100;
const sha256 = (body) => createHash('sha256').update(body).digest('hex');

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchPage(offset) {
  const url = `${endpoint}?year=${year}&min_area=0&limit=${pageSize}&offset=${offset}`;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'VIGIA/10.0 governed-reference-acquirer' } });
    if (response.ok) {
      const body = Buffer.from(await response.arrayBuffer());
      const payload = JSON.parse(body.toString('utf8'));
      if (!Array.isArray(payload?.data?.fires)) throw new Error(`icnf_reference_invalid_payload_offset_${offset}`);
      return { url, body, payload };
    }
    if (response.status !== 429 && response.status < 500) throw new Error(`icnf_reference_http_${response.status}_offset_${offset}`);
    const retryAfterSeconds = Number(response.headers.get('retry-after'));
    const delay = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1_000 : Math.min(15_000, 500 * 2 ** attempt);
    await wait(Math.max(500, delay));
  }
  throw new Error(`icnf_reference_retry_exhausted_offset_${offset}`);
}

async function existingPage(offset) {
  const filename = `offset-${String(offset).padStart(5, '0')}.json`;
  try {
    const body = await readFile(path.join(outputDirectory, filename));
    const payload = JSON.parse(body.toString('utf8'));
    if (Number(payload?.data?.offset) !== offset || !Array.isArray(payload?.data?.fires)) return null;
    const url = `${endpoint}?year=${year}&min_area=0&limit=${pageSize}&offset=${offset}`;
    return { url, body, payload };
  } catch {
    return null;
  }
}

await mkdir(outputDirectory, { recursive: true });
const first = await existingPage(0) ?? await fetchPage(0);
const total = Number(first.payload.data.total);
if (!Number.isInteger(total) || total < 1) throw new Error('icnf_reference_invalid_total');
const offsets = Array.from({ length: Math.ceil(total / pageSize) }, (_, index) => index * pageSize);
const pages = [];

for (const offset of offsets) {
  const page = offset === 0 ? first : await existingPage(offset) ?? await fetchPage(offset);
  const filename = `offset-${String(offset).padStart(5, '0')}.json`;
  const checksumSha256 = sha256(page.body);
  await writeFile(path.join(outputDirectory, filename), page.body);
  pages.push({
    offset,
    count: page.payload.data.fires.length,
    total: Number(page.payload.data.total),
    url: page.url,
    file: path.relative(root, path.join(outputDirectory, filename)),
    checksumSha256,
    providerTimestamp: page.payload.meta?.timestamp ?? null,
    providerVersion: page.payload.meta?.version ?? null
  });
}

const recordsById = new Map();
let providerRows = 0;
for (const page of pages) {
  const payload = JSON.parse(await readFile(path.join(root, page.file), 'utf8'));
  for (const fire of payload.data.fires) {
    providerRows += 1;
    const id = String(fire.id);
    const encoded = JSON.stringify(fire);
    if (recordsById.has(id) && recordsById.get(id) !== encoded) throw new Error(`icnf_reference_conflicting_duplicate_${id}`);
    recordsById.set(id, encoded);
  }
}
if (providerRows !== total) throw new Error(`icnf_reference_incomplete_expected_${total}_received_${providerRows}`);
const duplicateRows = providerRows - recordsById.size;

const manifest = {
  schema: 'vigia.icnf-reference-archive.v1',
  acquiredAt: new Date().toISOString(),
  provider: 'api.ptdata.org',
  upstreamAuthority: 'Instituto da Conservacao da Natureza e das Florestas (ICNF) SGIF',
  year,
  selection: `All provider records returned for year=${year} and min_area=0, paginated without performance-based selection.`,
  providerRows,
  uniqueRecords: recordsById.size,
  duplicateRows,
  duplicatePolicy: 'Exact duplicate natural IDs are retained in the immutable page archive and de-duplicated by ID for evaluation. Conflicting duplicate payloads fail acquisition.',
  pageSize,
  pages
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ manifestPath, pages: pages.length, providerRows, uniqueRecords: recordsById.size, duplicateRows }, null, 2));
