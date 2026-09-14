#!/usr/bin/env node
import { benchmarkCorpus } from '../forecast-corpus/corpus-benchmark.mjs';
import { corpusPaths } from '../forecast-corpus/corpus-paths.mjs';
import { buildDataFoundryCatalog } from './catalog-builder.mjs';
import { materializeRetainedHrrr } from './weather-materializer.mjs';

const phase = process.argv[2], projectRoot = process.argv[3];
const peak = () => process.resourceUsage().maxRSS * 1024;

let result;
if (phase === 'MATERIALIZE_HRRR') {
  const started = performance.now(), value = await materializeRetainedHrrr({ projectRoot, incidentId: process.argv[4] });
  result = { elapsedMs: Number((performance.now() - started).toFixed(3)), fields: value.slice.fields.length, cells: value.slice.fields.reduce((sum, item) => sum + item.slice.shape[0] * item.slice.shape[1], 0) };
} else if (phase === 'CORPUS_BENCHMARK') result = await benchmarkCorpus({ paths: corpusPaths(projectRoot) });
else if (phase === 'CATALOG_REBUILD') {
  const started = performance.now(); await buildDataFoundryCatalog({ projectRoot });
  result = { elapsedMs: Number((performance.now() - started).toFixed(3)) };
} else throw new Error(`unknown_benchmark_phase:${phase}`);

process.stdout.write(`${JSON.stringify({ phase, peakRssBytes: peak(), result })}\n`);
