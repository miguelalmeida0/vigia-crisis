#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compactThermalContext } from '../packages/domain/src/thermal-site-context.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'data', 'replay', 'raw', 'openstreetmap', 'portugal-thermal-context-v1');
const outputPath = path.join(root, 'data', 'reference', 'portugal-thermal-context-v1.json');
const sourcePaths = [path.join(directory, 'thermal-context-features.json'), path.join(directory, 'portugal-boundary.json')];
const bodies = await Promise.all(sourcePaths.map((item) => readFile(item)));
const compact = compactThermalContext(JSON.parse(bodies[0]), JSON.parse(bodies[1]));
compact.generatedAt = new Date().toISOString();
compact.provenance = sourcePaths.map((item, index) => ({ file: path.relative(root, item), checksumSha256: createHash('sha256').update(bodies[index]).digest('hex') }));
compact.referenceQualification = 'OSM context is a causal detector feature, never a fire/non-fire reference label. Missing or stale mapping is possible.';
compact.datasetHash = `sha256:${createHash('sha256').update(JSON.stringify({ features: compact.features, portugalBoundary: compact.portugalBoundary })).digest('hex')}`;
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(compact)}\n`);
console.log(JSON.stringify({ outputPath, datasetHash: compact.datasetHash, features: compact.features.length, classes: Object.fromEntries([...new Set(compact.features.map((item) => item.contextClass))].sort().map((name) => [name, compact.features.filter((item) => item.contextClass === name).length])) }, null, 2));
