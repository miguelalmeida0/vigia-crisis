import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'data/reference/orbits/sentinel3-current.json');
const satellites = [
  { platform: 'Sentinel-3A', noradId: 41335 },
  { platform: 'Sentinel-3B', noradId: 43437 }
];
const fetchedAt = new Date().toISOString();
const records = [];
for (const satellite of satellites) {
  const url = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${satellite.noradId}&FORMAT=TLE`;
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { 'user-agent': 'VIGIA-Physical-Truth-Autopilot/10.0' } });
  if (!response.ok) throw new Error(`celestrak_tle_http_${response.status}`);
  const lines = (await response.text()).trim().split(/\r?\n/).map((line) => line.trimEnd());
  if (lines.length < 3 || !lines[1].startsWith('1 ') || !lines[2].startsWith('2 ')) throw new Error(`invalid_tle:${satellite.noradId}`);
  const material = `${lines[1]}\n${lines[2]}`;
  records.push({ ...satellite, name: lines[0].trim(), line1: lines[1], line2: lines[2], sourceUrl: url,
    tleEpochToken: lines[1].slice(18, 32).trim(), checksumSha256: createHash('sha256').update(material).digest('hex') });
}
const artifact = { schemaVersion: 'vigia.authoritative-orbit-elements.v1', fetchedAt,
  authority: 'CelesTrak current GP element sets sourced from US Space Force 18th Space Defense Squadron data',
  calculationUse: 'SGP4 event-specific prediction; never proof of acquisition, usable coverage, or signal', satellites: records };
artifact.datasetHash = `sha256:${createHash('sha256').update(JSON.stringify(artifact)).digest('hex')}`;
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(root, output), fetchedAt, satellites: records.map(({ platform, noradId, tleEpochToken, checksumSha256 }) => ({ platform, noradId, tleEpochToken, checksumSha256 })), datasetHash: artifact.datasetHash }, null, 2));
