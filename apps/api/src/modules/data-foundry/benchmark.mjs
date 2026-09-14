import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { affectedMaterializations, deriveIncidentDataGaps, planDataGapResolution, traverseLineage } from '../../../../../packages/domain/src/data-foundry/index.mjs';
import { readJson, writeJsonAtomic } from '../../shared/json-file.mjs';
import { corpusPaths } from '../forecast-corpus/corpus-paths.mjs';
import { buildDataFoundryCatalog } from './catalog-builder.mjs';
import { dataFoundryPaths } from './foundry-paths.mjs';

const execFileAsync = promisify(execFile);
async function isolatedPhase(projectRoot, phase, ...args) {
  const worker = path.join(projectRoot, 'apps/api/src/modules/data-foundry/benchmark-worker.mjs'), { stdout } = await execFileAsync(process.execPath, ['--expose-gc', worker, phase, projectRoot, ...args], { timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(stdout);
}

const percentile = (values, ratio) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * ratio))];
async function chunks(total, size, operation) { const samples = [], started = performance.now(); for (let offset = 0; offset < total; offset += size) { const mark = performance.now(); for (let index = offset; index < Math.min(total, offset + size); index += 1) await operation(index); samples.push((performance.now() - mark) / Math.min(size, total - offset)); } const elapsedMs = performance.now() - started; return { operations: total, elapsedMs: Number(elapsedMs.toFixed(3)), throughputPerSecond: Number((total / (elapsedMs / 1_000)).toFixed(3)), p50Ms: Number(percentile(samples, .5).toFixed(6)), p95Ms: Number(percentile(samples, .95).toFixed(6)) }; }
export async function benchmarkDataFoundry({ projectRoot = process.cwd() } = {}) {
  const paths = dataFoundryPaths(projectRoot), corpus = corpusPaths(projectRoot), memorySamples = [{ stage: 'START', rssBytes: process.memoryUsage().rss }], sample = (stage) => memorySamples.push({ stage, rssBytes: process.memoryUsage().rss });
  let built = await buildDataFoundryCatalog({ projectRoot }); sample('CATALOG_BUILT');
  const graph = built.graph, startId = graph.nodes.at(-1)?.id;
  let incident = built.gold.incidents.find((item) => item.id === '2025-AZGCP-000597') ?? built.gold.incidents[0];
  const capabilities = [{ provider: 'noaa-hrrr-archive', requirement: 'DECODED_WEATHER', covered: true, expectedBytes: 8_000_000, expectedLatencyMs: 2_000 }];
  const lineageTraversal = await chunks(100_000, 1_000, () => traverseLineage(graph, startId)), dataGapEvaluation = await chunks(10_000, 100, () => deriveIncidentDataGaps({ incident })), gaps = deriveIncidentDataGaps({ incident }), acquisitionPlanEvaluation = await chunks(1_000, 50, () => planDataGapResolution({ gaps, providerCapabilities: capabilities, coverage: { 'noaa-hrrr-archive': ['western-us'] }, costBudget: { maxBytes: 64 * 1024 * 1024 }, timeBudget: { maxLatencyMs: 60_000 } }));
  const incidentId = incident.id, weatherWorker = await isolatedPhase(projectRoot, 'MATERIALIZE_HRRR', incidentId), weather = weatherWorker.result; sample('WORKLOADS_COMPLETE');
  built = null; incident = null; globalThis.gc?.(); sample('CATALOG_RELEASED');
  const corpusWorker = await isolatedPhase(projectRoot, 'CORPUS_BENCHMARK'), corpusBenchmark = corpusWorker.result; sample('CORPUS_BENCHMARK_COMPLETE'); globalThis.gc?.();
  const rebuildWorker = await isolatedPhase(projectRoot, 'CATALOG_REBUILD'), fullRebuildMs = rebuildWorker.result.elapsedMs; sample('FULL_REBUILD_COMPLETE'); globalThis.gc?.();
  const incrementalStarted = performance.now(); const affected = affectedMaterializations([graph.nodes[0]?.id], graph.edges); const incrementalMs = performance.now() - incrementalStarted, sustainedStartRss = process.memoryUsage().rss, sustainedStarted = performance.now(); for (let iteration = 0; iteration < 10_000; iteration += 1) affectedMaterializations([graph.nodes[iteration % graph.nodes.length]?.id], graph.edges); globalThis.gc?.(); const sustainedEndRss = process.memoryUsage().rss, sustainedElapsedMs = performance.now() - sustainedStarted, sustainedGrowthBytes = sustainedEndRss - sustainedStartRss, provider = await readJson(corpus.providerState, { retrievals: [] }), acquisition = await readJson(corpus.acquisitionState, { products: {} }), downloadedBytes = Object.values(provider.retrievals ?? {}).reduce((sum, item) => sum + Number(item.contentLength ?? 0), 0), uniqueStoredBytes = Object.values(acquisition.products ?? {}).reduce((sum, item) => sum + Number(item.byteLength ?? 0), 0); sample('COMPLETE');
  const stageProcesses = [{ stage: weatherWorker.phase, peakRssBytes: weatherWorker.peakRssBytes }, { stage: corpusWorker.phase, peakRssBytes: corpusWorker.peakRssBytes }, { stage: rebuildWorker.phase, peakRssBytes: rebuildWorker.peakRssBytes }], peakMemoryBytes = Math.max(...memorySamples.map((item) => item.rssBytes), ...stageProcesses.map((item) => item.peakRssBytes));
  const report = { schemaVersion: 'vigia.data-foundry-benchmark.v3', boundedStageRelease: true, isolatedMemoryHeavyStages: true, memorySamples, stageProcesses, workloads: { lineageTraversal, dataGapEvaluation, acquisitionPlanEvaluation, hrrrGribDecoding: { operations: weather.fields, elapsedMs: weather.elapsedMs, throughputFieldsPerSecond: Number((weather.fields / (weather.elapsedMs / 1_000)).toFixed(3)) }, incidentLocalWeatherMaterialization: { elapsedMs: weather.elapsedMs, cells: weather.cells }, fuelTerrainMaterialization: corpusBenchmark.timings.fuelTerrainExtraction, forecastExampleGeneration: corpusBenchmark.timings.forecastExampleGeneration, leakageAudit: corpusBenchmark.timings.leakageAudit, fullCorpusReplay: corpusBenchmark.timings.fullCorpusReplay, incrementalMaterialization: { elapsedMs: Number(incrementalMs.toFixed(6)), affectedProducts: affected.length }, sustainedIncrementalInvalidation: { operations: 10_000, elapsedMs: Number(sustainedElapsedMs.toFixed(3)), rssStartBytes: sustainedStartRss, rssEndBytes: sustainedEndRss, rssGrowthBytes: sustainedGrowthBytes, stableMemory: sustainedGrowthBytes < 32 * 1024 * 1024 }, fullFoundryRebuild: { elapsedMs: Number(fullRebuildMs.toFixed(3)) } }, peakMemoryBytes, downloadedBytes, uniqueStoredBytes, deduplicationSavingsBytes: Math.max(0, downloadedBytes - uniqueStoredBytes), incrementalVsFullCostRatio: fullRebuildMs ? Number((incrementalMs / fullRebuildMs).toFixed(9)) : null };
  await writeJsonAtomic(path.join(paths.benchmarks, 'data-foundry-benchmark.json'), report); return report;
}
