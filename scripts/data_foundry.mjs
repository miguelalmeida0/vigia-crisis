#!/usr/bin/env node
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../apps/api/src/config/env.mjs';
import { benchmarkDataFoundry, buildDataFoundryCatalog, buildObservationOpportunityLedger, certifyRetainedContextPacks, DataFoundryQueryService, materializeFedsProgression, materializeRetainedHrrr, reconcileDataFoundryOnce, runDataFoundryDoctor, writeConsumerSnapshots, writeDataFoundryReport, writePortugalPartnerDossier } from '../apps/api/src/modules/data-foundry/index.mjs';
import { buildCorpusProducts, corpusPaths, createForecastCorpusRuntime } from '../apps/api/src/modules/forecast-corpus/index.mjs';
import { createCorpusAcquisitionManifest } from '../packages/domain/src/forecast-corpus/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), command = process.argv[2] ?? 'help', args = process.argv.slice(3), wantsHelp = args.includes('--help') || args.includes('-h'), value = (name, fallback = null) => args.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback, json = (item) => console.log(JSON.stringify(item, null, 2));
const TARGETS = Object.freeze([{ id: '2025-AZGCP-000597', from: '2025-07-05', to: '2025-07-10', season: '2025' }, { id: '2026-WACOA-260140', from: '2026-07-16', to: '2026-08-24', season: '2026' }]);
function help() { console.log(`Usage:
  npm run foundry:doctor
  npm run foundry:lineage -- --incident=<id>
  npm run foundry:gaps [-- --incident=<id>]
  npm run foundry:plan-gap-closure [-- --incident=<id>]
  npm run foundry:reconcile -- --once
  npm run hrrr:decode-and-certify [-- --incident=<id>]
  npm run corpus:expand-wfigs
  npm run corpus:build-negatives
  npm run corpus:materialize-inputs
  npm run corpus:build-examples
  npm run corpus:baseline-eval
  npm run corpus:readiness
  npm run report:data-foundry
  npm run benchmark:data-foundry
  npm run demo:crisis-data-foundry

Defaults are bounded: two selected WFIGS incidents, 40 revisions/page, 64 MiB/run,
two reconciliation tasks, 32x32 maximum HRRR incident window, no background workers.`); }
function manifest(target, paths) { return createCorpusAcquisitionManifest({ from: target.from, to: target.to, regions: [{ id: 'western-us', jurisdiction: 'US', bbox: [-125, 31, -102, 49], estimatedAreaKm2: 1_900_000 }], seasons: [target.season], providers: ['nifc-wfigs-daily', 'noaa-hrrr-archive', 'usfs-landfire', 'nasa-firms-archive'], products: ['captured-perimeter-revisions', 'issue-time-weather-ranges', 'versioned-fuel-terrain', 'physical-observation-archive'], incidentSelectionRules: { incidentIds: [target.id], fireType: 'WILDFIRE', selectionDefinedBeforeEvaluation: true }, budgets: { maxIncidents: 1, maxDays: 40, maxRegionAreaKm2: 2_000_000, maxProviderObjects: 64, maxBytes: 64 * 1024 * 1024, maxConcurrency: 2, maxRuntimeSeconds: 180, maxRetries: 2, maxLocalStorageBytes: 512 * 1024 * 1024 }, storageTarget: paths.runtime, licences: ['NIFC-OPEN-DATA', 'NOAA-HRRR-PUBLIC-DATA', 'USFS-LANDFIRE-PUBLIC-DATA', 'NASA-FIRMS-TERMS'], expectedOutputs: ['bronze', 'silver', 'gold', 'quality-report', 'replay'], codeVersion: 'vigia-crisis-data-foundry-1.0.0' }); }
async function expandWfigs() { const paths = corpusPaths(root), current = await buildCorpusProducts({ paths }), acquired = []; for (const target of TARGETS) { const incident = current.incidents.find((item) => item.id === target.id); if ((incident?.perimeterStates?.length ?? 0) >= 40) { acquired.push({ incidentId: target.id, season: target.season, state: 'ALREADY_MATERIALIZED', revisions: incident.perimeterStates.length }); continue; } const runtime = await createForecastCorpusRuntime({ projectRoot: root, config: loadConfig() }), run = await runtime.start(manifest(target, paths)); acquired.push({ incidentId: target.id, season: target.season, state: run.state, revisions: run.metrics.objects, runId: run.runId, bytes: run.metrics.downloadedBytes }); } return { schemaVersion: 'vigia.wfigs-expansion.v1', boundedSelection: TARGETS.map((item) => item.id), seasons: TARGETS.map((item) => item.season), incidents: acquired, classification: 'ARCHIVED_OPERATIONAL_SNAPSHOT' }; }
async function materializeInputs() { const context = await certifyRetainedContextPacks({ projectRoot: root }), outputs = [], feds = []; const corpus = await buildCorpusProducts({ paths: corpusPaths(root) }); for (const incident of corpus.incidents.filter((item) => item.weatherRuns?.length)) { outputs.push(await materializeRetainedHrrr({ projectRoot: root, incidentId: incident.id })); feds.push(await materializeFedsProgression({ projectRoot: root, incidentId: incident.id })); } return { context, weather: outputs.map((item) => ({ incidentId: item.incidentId, sliceId: item.slice.id, missingValues: item.slice.missingValues, variables: item.slice.fields.map((field) => field.variable) })), feds: feds.map((item) => ({ incidentId: item.incidentId, states: item.states.length, causalRelationship: item.causalRelationship, state: item.state })) }; }
async function report() { const { report: foundryReport, built } = await writeDataFoundryReport({ projectRoot: root }), snapshots = await writeConsumerSnapshots({ projectRoot: root, report: foundryReport, built }), portugalDossier = await writePortugalPartnerDossier({ projectRoot: root }); return { report: foundryReport, snapshots: Object.keys(snapshots), portugalDossier }; }
async function demo() { const paths = corpusPaths(root), sourceSilvers = ['06216fa59dafa2c5d0ef2fea.json', '2a865118f757b1ed0f82cd5b.json'], retained = []; for (const file of sourceSilvers) { try { const value = JSON.parse(await readFile(path.join(paths.silver, file), 'utf8')); retained.push(...value.incidents); } catch {} } const incidentId = value('incident', '2025-AZGCP-000597'), before = retained.find((item) => item.id === incidentId), preGap = before?.weatherRuns?.some((run) => run.valuesDecoded !== true) ? 'GRIB_FIELD_UNDECODED_OR_UNCERTIFIED' : 'NO_RETAINED_UNDECODED_RUN', decoded = await materializeRetainedHrrr({ projectRoot: root, incidentId }), context = await certifyRetainedContextPacks({ projectRoot: root }), corpus = await buildCorpusProducts({ paths }), built = await buildDataFoundryCatalog({ projectRoot: root }), query = new DataFoundryQueryService({ projectRoot: root }), lineage = await query.getProductLineage(`version:${decoded.slice.id}`), replay = await query.verifyProductReplay(), next = (await query.getMissingIncidentInputs(incidentId))[0] ?? null, example = corpus.examples.find((item) => item.incidentId === incidentId); return { schemaVersion: 'vigia.crisis-data-foundry-demo.v1', incidentId, before: { gap: preGap, retainedRun: before?.weatherRuns?.[0]?.runId ?? null }, gapClosure: { weatherSliceId: decoded.slice.id, variables: decoded.slice.fields.map((item) => item.variable), missingValues: decoded.slice.missingValues, quality: decoded.slice.qualityState }, nextHighestValueGap: next, context: { terrainCertification: context.fingerprint }, forecastInputPackage: built.registry.packages.find((item) => item.incidentId === incidentId)?.id ?? null, corpusExample: example?.id ?? null, lineage: { nodes: lineage.nodes.length, edges: lineage.edges.length, verification: built.graph.verification }, rights: corpus.rights, leakage: corpus.leakage, baseline: corpus.baselines, replay: { corpus: corpus.replayVerification, foundryLineage: replay }, identicalFingerprints: corpus.replayVerification?.identical === true, readinessDecision: corpus.readiness.decision }; }

try {
  if (wantsHelp || command === 'help') help();
  else if (command === 'doctor') json(await runDataFoundryDoctor({ projectRoot: root }));
  else if (command === 'hrrr') { const result = await materializeRetainedHrrr({ projectRoot: root, incidentId: value('incident', '2025-AZGCP-000597') }); json({ incidentId: result.incidentId, slice: result.slice, overlayFingerprint: result.overlayFingerprint }); }
  else if (command === 'expand-wfigs') json(await expandWfigs());
  else if (command === 'negatives') json(await buildObservationOpportunityLedger({ projectRoot: root }));
  else if (command === 'materialize-inputs') json(await materializeInputs());
  else if (command === 'build-examples') { const corpus = await buildCorpusProducts({ paths: corpusPaths(root) }); json({ examples: corpus.examples.length, rejections: corpus.rejections.length, fingerprint: corpus.replay.corpusFingerprint }); }
  else if (command === 'baseline-eval') { const corpus = await buildCorpusProducts({ paths: corpusPaths(root) }); json(corpus.baselines); }
  else if (command === 'readiness') { const corpus = await buildCorpusProducts({ paths: corpusPaths(root) }); json(corpus.readiness); }
  else if (command === 'gaps') { await buildDataFoundryCatalog({ projectRoot: root }); const query = new DataFoundryQueryService({ projectRoot: root }), incident = value('incident'); json(incident ? await query.getMissingIncidentInputs(incident) : JSON.parse(await readFile(query.paths.gaps, 'utf8'))); }
  else if (command === 'plan') { await buildDataFoundryCatalog({ projectRoot: root }); json(await new DataFoundryQueryService({ projectRoot: root }).getAcquisitionPlan(value('incident'))); }
  else if (command === 'lineage') { await buildDataFoundryCatalog({ projectRoot: root }); const query = new DataFoundryQueryService({ projectRoot: root }), incident = value('incident'); if (!incident) throw new Error('incident_required'); const products = await query.getIncidentDataProducts(incident); if (!products) throw new Error('incident_not_found'); json({ incidentId: incident, products, lineage: await Promise.all(products.versions.map((item) => query.getProductLineage(item.id))) }); }
  else if (command === 'reconcile') { if (!args.includes('--once')) throw new Error('bounded_once_required'); json(await reconcileDataFoundryOnce({ projectRoot: root })); }
  else if (command === 'report') json(await report());
  else if (command === 'benchmark') json(await benchmarkDataFoundry({ projectRoot: root }));
  else if (command === 'demo') json(await demo());
  else throw new Error(`unknown_command:${command}`);
} catch (error) { console.error(JSON.stringify({ command, error: String(error.message ?? error) })); process.exitCode = /required|unknown_command|bounded_once/.test(String(error.message)) ? 2 : 1; }
