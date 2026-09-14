#!/usr/bin/env node
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../apps/api/src/config/env.mjs';
import { benchmarkCorpus, buildCorpusProducts, corpusPaths, createForecastCorpusRuntime, generateCorpusQualityReport, runCorpusDoctor } from '../apps/api/src/modules/forecast-corpus/index.mjs';
import { createCorpusAcquisitionManifest } from '../packages/domain/src/forecast-corpus/index.mjs';
import { writeJsonAtomic } from '../apps/api/src/shared/json-file.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), paths = corpusPaths(root), command = process.argv[2] ?? 'help', wantsHelp = process.argv.includes('--help') || process.argv.includes('-h');
const arg = (name, fallback = null) => process.argv.slice(3).find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const numberArg = (name, fallback) => { const value = Number(arg(name, fallback)); if (!Number.isInteger(value) || value < 1) throw new Error(`invalid_${name}`); return value; };
const regions = Object.freeze({
  'western-us': { id: 'western-us', jurisdiction: 'US', bbox: [-125, 31, -102, 49], estimatedAreaKm2: 1_900_000 },
  portugal: { id: 'portugal', jurisdiction: 'PT', bbox: [-9.75, 36.7, -6, 42.3], estimatedAreaKm2: 92_226 },
});
function help() {
  console.log(`Usage:
  npm run corpus:doctor
  npm run corpus:plan -- --region=western-us --from=2025-07-01 --to=2025-07-10 [--incident=2025-AZGCP-000597]
  npm run corpus:acquire -- --manifest=<plan.json>
  npm run corpus:resume -- --run=<run-id>
  npm run corpus:validate
  npm run corpus:build-forecast-examples
  npm run corpus:leakage-audit
  npm run corpus:report
  npm run corpus:benchmark
  npm run demo:forecast-corpus

All acquisition scopes are bounded. Defaults: 5 incidents, 10 days, 64 provider objects,
64 MiB downloaded, concurrency 2, runtime 180 seconds, retries 2, storage 512 MiB.`);
}
function manifestFor({ regionId = arg('region', 'western-us'), from = arg('from'), to = arg('to'), incident = arg('incident') } = {}) {
  const selected = regionId === 'both' ? [regions['western-us'], regions.portugal] : [regions[regionId]].filter(Boolean);
  if (!selected.length || !from || !to) throw new Error('region_from_to_required');
  const span = Math.max(1, Math.ceil((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1), providers = selected.some((item) => item.id === 'western-us') ? ['nifc-wfigs-daily', 'noaa-hrrr-archive', 'usfs-landfire', 'nasa-firms-archive'] : ['icnf-burned-area', 'nasa-firms-archive'];
  return createCorpusAcquisitionManifest({ from, to, regions: selected, seasons: [...new Set(selected.flatMap((item) => item.id === 'western-us' ? [from.slice(0, 4)] : ['2024']))], providers, products: ['captured-perimeter-revisions', 'issue-time-weather-ranges', 'versioned-fuel-terrain', 'physical-observation-archive'], incidentSelectionRules: { incidentIds: incident ? [incident] : [], fireType: 'WILDFIRE', selectionDefinedBeforeEvaluation: true }, budgets: { maxIncidents: numberArg('max-incidents', 5), maxDays: Math.min(366, numberArg('max-days', Math.min(10, span))), maxRegionAreaKm2: 2_000_000, maxProviderObjects: numberArg('max-provider-objects', 64), maxBytes: numberArg('max-bytes', 64 * 1024 * 1024), maxConcurrency: numberArg('max-concurrency', 2), maxRuntimeSeconds: numberArg('max-runtime-seconds', 180), maxRetries: numberArg('max-retries', 2), maxLocalStorageBytes: numberArg('max-local-storage-bytes', 512 * 1024 * 1024) }, storageTarget: paths.runtime, licences: ['NIFC-OPEN-DATA', 'NOAA-HRRR-PUBLIC-DATA', 'USFS-LANDFIRE-PUBLIC-DATA', 'NASA-FIRMS-TERMS'], expectedOutputs: ['bronze', 'silver', 'gold', 'quality-report', 'replay'], codeVersion: 'vigia-forecast-corpus-1.0.3' });
}
async function boundedManifestFile(value) { if (!value) throw new Error('manifest_path_required'); const file = path.resolve(root, value); if (!file.startsWith(`${root}${path.sep}`)) throw new Error('manifest_path_outside_repository'); return JSON.parse(await readFile(file, 'utf8')); }
async function productsAndReport() { const products = await buildCorpusProducts({ paths }), report = await generateCorpusQualityReport({ paths, products }); return { products, report }; }

try {
  if (wantsHelp || command === 'help') help();
  else if (command === 'doctor') { const report = await runCorpusDoctor(); await writeJsonAtomic(path.join(paths.reports, 'corpus-doctor.json'), report); console.log(JSON.stringify(report, null, 2)); }
  else if (command === 'plan') { const manifest = manifestFor(), file = path.join(paths.plans, `${manifest.integrity.fingerprint.split(':').at(-1)}.json`); await writeJsonAtomic(file, manifest); console.log(JSON.stringify({ manifest: file, fingerprint: manifest.integrity.fingerprint, budgets: manifest.budgets }, null, 2)); }
  else if (command === 'acquire') { const runtime = await createForecastCorpusRuntime({ projectRoot: root, config: loadConfig() }), run = await runtime.start(await boundedManifestFile(arg('manifest'))); console.log(JSON.stringify(run, null, 2)); }
  else if (command === 'resume') { const runId = arg('run'); if (!runId) throw new Error('run_id_required'); const runtime = await createForecastCorpusRuntime({ projectRoot: root, config: loadConfig() }), run = await runtime.resume(runId); console.log(JSON.stringify(run, null, 2)); }
  else if (command === 'validate') { const products = await buildCorpusProducts({ paths }); console.log(JSON.stringify({ incidents: products.incidents.length, examples: products.examples.length, rejections: products.rejections.length, leakagePassed: products.leakage.passed, rightsAllowed: products.rights.allowed, replay: products.replayVerification }, null, 2)); if (!products.leakage.passed) process.exitCode = 1; }
  else if (command === 'build') { const products = await buildCorpusProducts({ paths }); console.log(JSON.stringify({ output: path.join(paths.gold, 'forecast-corpus.json'), eligibleExamples: products.examples.length, rejectedExamples: products.rejections.length, fingerprint: products.replay.corpusFingerprint }, null, 2)); }
  else if (command === 'leakage') { const products = await buildCorpusProducts({ paths }); console.log(JSON.stringify(products.leakage, null, 2)); if (!products.leakage.passed) process.exitCode = 1; }
  else if (command === 'report') { const { report } = await productsAndReport(); console.log(JSON.stringify(report, null, 2)); }
  else if (command === 'benchmark') console.log(JSON.stringify(await benchmarkCorpus({ paths }), null, 2));
  else if (command === 'demo') {
    const doctor = await runCorpusDoctor(), manifest = manifestFor({ regionId: 'western-us', from: '2025-07-05', to: '2025-07-10', incident: '2025-AZGCP-000597' }), runtime = await createForecastCorpusRuntime({ projectRoot: root, config: loadConfig() }), run = await runtime.start(manifest), { products, report } = await productsAndReport();
    console.log(JSON.stringify({ schemaVersion: 'vigia.forecast-corpus-demo.v1', doctor: { sources: doctor.sources.length, ready: doctor.sources.filter((item) => item.accessStatus === 'READY').length }, acquisition: { runId: run.runId, state: run.state, objects: run.metrics.objects, bytes: run.metrics.downloadedBytes }, perimeterSequence: products.incidents.find((item) => item.id === '2025-AZGCP-000597')?.perimeterStates.length ?? 0, weatherRun: products.incidents.find((item) => item.id === '2025-AZGCP-000597')?.weatherRuns[0]?.runId ?? null, fuelPack: Boolean(products.incidents.find((item) => item.id === '2025-AZGCP-000597')?.fuelPack), terrainPack: Boolean(products.incidents.find((item) => item.id === '2025-AZGCP-000597')?.terrainPack), validNegativeOpportunity: report.negativeControls.valid, crosswalkIncidents: products.crosswalk.incidents.length, eligibleExamples: products.examples.length, rejectedExamples: products.rejections.length, leakagePassed: products.leakage.passed, splits: products.splits.counts, baselines: products.baselines.state, replay: products.replayVerification, fingerprint: products.replay.corpusFingerprint, decision: products.readiness.decision }, null, 2));
  } else throw new Error(`unknown_command:${command}`);
} catch (error) { console.error(JSON.stringify({ error: String(error.message ?? error), command })); process.exitCode = /required|invalid|unknown_command|outside_repository/.test(String(error.message)) ? 2 : 1; }
