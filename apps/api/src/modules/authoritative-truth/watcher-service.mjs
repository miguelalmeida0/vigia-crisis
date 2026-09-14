import { performance } from 'node:perf_hooks';
import { readJson } from '../../shared/json-file.mjs';
import { buildScientificCorpora, evaluateScience } from '../scientific-truth/science-service.mjs';
import { buildScientificTruthClosureReport } from '../scientific-truth/report-service.mjs';
import { emptyNetworkState, readNetworkState, truthPaths, writeArtifact, writeNetworkState } from './contracts.mjs';
import { PROVIDERS } from './doctrine.mjs';
import { captureArcGisProvider, captureCwfisProducts, discoverProviderCapabilities, rawPublicationIdentity } from './provider-client.mjs';
import { bootstrapScientificPerimeters, detectSourceConflicts, ingestProviderCapture, reconcileNetworkStateIdentity, recordProviderUnavailable, revisionIsAdmitted, selectWatchedIncidents } from './network-repository.mjs';
import { buildIncrementalOfficialLabels } from './label-factory.mjs';
import { scoreOfficialForecasts } from './forecast-scoring-service.mjs';
import { updateDecisionPackets } from './decision-service.mjs';
import { replayTruthNetwork } from './replay-service.mjs';
import { writeNetworkArtifacts } from './artifact-service.mjs';

const wait = (milliseconds) => new Promise((resolve) => { setTimeout(resolve, milliseconds); });
const sample = (state, name, value) => { state.performanceSamples ??= {}; const values = state.performanceSamples[name] ?? []; values.push(Number(value)); state.performanceSamples[name] = values.slice(-2_000); };
const campaignId = (at) => `authoritative-truth-${at.replaceAll(/[-:.TZ]/g, '').slice(0, 14)}`;

export async function doctorTruthNetwork({ projectRoot = process.cwd(), fetchImpl = globalThis.fetch, clock = () => new Date() } = {}) {
  const started = performance.now(), providers = await discoverProviderCapabilities({ projectRoot, fetchImpl, clock }), durationMs = Number((performance.now() - started).toFixed(3)), core = { schemaVersion: 'vigia.provider-change-capabilities.v1', generatedAt: clock().toISOString(), providers, inspectedCapabilities: ['stable object IDs', 'editor tracking', 'last-edit timestamps', 'service generation/version', 'ETag', 'change tracking', 'sync', 'replica generation', 'historicMoment', 'archived snapshots', 'query by modification time', 'query by incident', 'pagination', 'deleted-feature tracking'], secretValuesRecorded: false, durationMs, passed: providers.every((item) => item.status === 'READY') };
  return writeArtifact(truthPaths(projectRoot).doctor, 'provider-change-capabilities', core);
}

async function loadState({ projectRoot, resume, clock }) {
  const existing = await readNetworkState(projectRoot, null), now = clock().toISOString();
  if (resume && existing?.campaignId !== resume) throw new Error(`campaign_resume_not_found:${resume}`); const state = existing ?? emptyNetworkState({ campaignId: resume ?? campaignId(now), now }); await bootstrapScientificPerimeters(state, projectRoot); return reconcileNetworkStateIdentity(state);
}

async function capture(provider, options) {
  const result = provider.service ? await captureArcGisProvider(provider, options) : await captureCwfisProducts(provider, options); return { ...result, publicationFingerprint: rawPublicationIdentity(result.rawObjects), filtered: Boolean(options.incident) };
}

async function captureWithRetry(provider, options) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) try { return { result: await capture(provider, options), attempts: attempt + 1 }; } catch (error) { lastError = error; if (attempt < 2) await wait(250 * (2 ** attempt)); }
  throw Object.assign(lastError ?? new Error(`${provider.id}_capture_failed`), { attempts: 3 });
}

async function runCycle(state, options) {
  const cycleStarted = performance.now(), at = options.clock().toISOString(), providerResults = [], dueProviders = PROVIDERS.filter((provider) => options.forcePoll || !state.cursors?.[provider.id]?.nextPollAt || Date.parse(state.cursors[provider.id].nextPollAt) <= Date.parse(at));
  for (let offset = 0; offset < dueProviders.length; offset += 2) {
    const batch = dueProviders.slice(offset, offset + 2), settled = await Promise.all(batch.map(async (provider) => { const started = performance.now(); try { const captured = await captureWithRetry(provider, options); sample(state, 'providerFetch', performance.now() - started); return { provider, result: captured.result, attempts: captured.attempts }; } catch (error) { return { provider, error, attempts: error.attempts ?? 3 }; } })); providerResults.push(...settled);
  }
  const touched = [], cycleRevisions = [];
  for (const item of providerResults) if (item.error) recordProviderUnavailable(state, item.provider, item.error, at); else { const update = ingestProviderCapture(state, item.provider, item.result, at); touched.push(...update.touchedIncidentIds); cycleRevisions.push(...update.revisions); sample(state, 'sequenceUpdate', update.durationMs); for (const value of update.revisionClassificationMs) sample(state, 'revisionClassification', value); for (const feature of item.result.features) sample(state, 'featureProcessing', feature.processingMs ?? 0); }
  reconcileNetworkStateIdentity(state);
  const selectionStarted = performance.now(); selectWatchedIncidents(state, { allActive: options.allActive, incident: options.incident, region: options.region, at }); sample(state, 'incidentSelection', performance.now() - selectionStarted); detectSourceConflicts(state, at);
  const labelStarted = performance.now(), labelResult = buildIncrementalOfficialLabels(state, touched, at); sample(state, 'labelGeneration', performance.now() - labelStarted); const decisionStarted = performance.now(), deltas = updateDecisionPackets(state, cycleRevisions, at); sample(state, 'decisionPacket', performance.now() - decisionStarted);
  let scoring = { evaluationExecuted: false, results: [] }; if (labelResult.created.length) { const scoringStarted = performance.now(); scoring = await scoreOfficialForecasts(state, { projectRoot: options.projectRoot, clock: options.clock }); sample(state, 'forecastScoring', performance.now() - scoringStarted); await rebuildScientificClosure(options.projectRoot, options.clock); }
  state.informationValueOutcomes ??= []; for (const item of providerResults) { const actualRevisions = item.error ? 0 : cycleRevisions.filter((revision) => revision.providerId === item.provider.id && revisionIsAdmitted(state, revision.revisionId) && !['INITIAL_PROVIDER_STATE', 'INVALID_GEOMETRY', 'DUPLICATE', 'CLOCK_ANOMALY'].includes(revision.revisionClassification)).length, core = { providerId: item.provider.id, cycle: state.metrics.cycles + 1, predictedUnlock: 'AUTHORITATIVE_GEOMETRY_REVISION_OR_CONFIRMED_NO_CHANGE', actualUnlock: actualRevisions ? 'AUTHORITATIVE_GEOMETRY_REVISION' : item.error ? 'PROVIDER_UNAVAILABLE' : 'CONFIRMED_NO_CHANGE', predictedSourceSuccess: true, actualSourceSuccess: !item.error, predictedLatencyMs: item.provider.cadenceSeconds * 1_000, actualLatencyMs: item.result?.latencyMs ?? null, predictedDecisionDelta: 'RECOMPILE_IF_CHANGED', actualDecisionDeltas: deltas.filter((delta) => cycleRevisions.some((revision) => revision.revisionId === delta.causingRevisionId && revision.providerId === item.provider.id)).length, automaticDoctrineModification: false }; state.informationValueOutcomes.push({ ...core, outcomeId: `information-value:${item.provider.id}:${state.metrics.cycles + 1}` }); }
  state.metrics.cycles += 1; state.updatedAt = at; state.checkpoints.push({ cycle: state.metrics.cycles, at, providersDue: dueProviders.map((item) => item.id), pollObservationCount: state.pollObservations.length, revisionCount: state.revisions.length, labelCount: state.labels.length }); sample(state, 'pollCycle', performance.now() - cycleStarted); return { at, labelResult, scoring, deltas, providerResults };
}

async function rebuildScientificClosure(projectRoot, clock) { await buildScientificCorpora({ projectRoot, clock }); await evaluateScience({ projectRoot, clock }); await buildScientificTruthClosureReport({ projectRoot, clock }); }

export async function watchTruthNetwork({ projectRoot = process.cwd(), fetchImpl = globalThis.fetch, clock = () => new Date(), once = true, durationMs = 0, incident = null, region = null, allActive = false, resume = null } = {}) {
  const state = await loadState({ projectRoot, resume, clock }), options = { projectRoot, fetchImpl, clock, incident, region, allActive, forcePoll: once }; let stop = false; const shutdown = () => { stop = true; }; process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown); state.running = true; state.shutdownClean = false; await writeNetworkState(projectRoot, state);
  const startedAt = clock().getTime(), maximum = once ? 1 : Math.max(1, Math.min(86_400_000, durationMs)); let cycles = 0;
  try { do { await runCycle(state, options); cycles += 1; await writeNetworkState(projectRoot, state); if (once || stop) break; const remaining = maximum - (clock().getTime() - startedAt); if (remaining <= 0) break; await wait(Math.min(30_000, remaining)); } while (!stop); } finally { state.running = false; state.shutdownClean = true; state.updatedAt = clock().toISOString(); await writeNetworkState(projectRoot, state); process.removeListener('SIGINT', shutdown); process.removeListener('SIGTERM', shutdown); }
  const replay = await replayTruthNetwork({ projectRoot, clock, state }); await writeNetworkState(projectRoot, state); const artifacts = await writeNetworkArtifacts(state, { projectRoot, clock, replay }); return { schemaVersion: 'vigia.authoritative-truth-watch-result.v1', campaignId: state.campaignId, cycles, state: 'STOPPED_CLEANLY_RESUMABLE', activeIncidentsWatched: state.selectedIncidents.length, newOfficialLabels: state.labels.length, replayPassed: replay.passed, statusFingerprint: artifacts.status.fingerprint, resumeCommand: `npm run truth-network:watch -- --resume=${state.campaignId} --all-active` };
}

export async function truthNetworkStatus({ projectRoot = process.cwd(), clock = () => new Date() } = {}) { const state = await readNetworkState(projectRoot); if (!state) throw new Error('authoritative_truth_state_required'); reconcileNetworkStateIdentity(state); await writeNetworkState(projectRoot, state); const replay = await readJson(truthPaths(projectRoot).replay, null); return (await writeNetworkArtifacts(state, { projectRoot, clock, replay })).status; }
