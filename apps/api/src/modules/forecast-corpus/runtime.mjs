import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { verifyCorpusAcquisitionManifest, validateCorpusGeometry } from '../../../../../packages/domain/src/forecast-corpus/index.mjs';
import { writeJsonAtomic } from '../../shared/json-file.mjs';
import { acquireFirmsArchive } from './firms-archive-provider.mjs';
import { acquireHrrrIssueRun } from './hrrr-archive-provider.mjs';
import { acquireLandfireContext } from './landfire-context-provider.mjs';
import { fetchWfigsArchive } from './wfigs-archive-provider.mjs';

const digest = (fingerprint) => fingerprint.split(':').at(-1);
const bufferBbox = (bbox, amount = .12) => [Math.max(-180, bbox[0] - amount), Math.max(-90, bbox[1] - amount), Math.min(180, bbox[2] + amount), Math.min(90, bbox[3] + amount)];
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
function permanentHttpFailure(error) { const status = Number(String(error?.message ?? error).match(/(?:http_|:)(\d{3})(?::|$)/)?.[1]); return status >= 400 && status < 500 && ![408, 429].includes(status); }
async function retry(operation, maximum) {
  for (let attempt = 0; ; attempt += 1) {
    try { return await operation(); } catch (error) {
      if (attempt >= maximum || permanentHttpFailure(error)) throw error;
      await wait(Math.min(2_000, 250 * (2 ** attempt)));
    }
  }
}
function incidentsFrom(states, maximum) {
  const groups = new Map(); for (const state of states) { const rows = groups.get(state.providerIncidentId) ?? []; rows.push(state); groups.set(state.providerIncidentId, rows); }
  return [...groups].slice(0, maximum).map(([providerIncidentId, rows]) => { const ordered = rows.sort((a, b) => a.revision - b.revision), first = ordered[0]; return { id: providerIncidentId, providerIncidentId, region: 'western-us', season: String(first.discoveryTime ?? first.clocks.observedAt).slice(0, 4), jurisdiction: first.jurisdiction, name: first.incidentName, discoveryTime: first.discoveryTime ?? first.clocks.observedAt, perimeterSourceClass: 'ARCHIVED_OPERATIONAL_SNAPSHOT', perimeterStates: ordered, associationState: 'UNAMBIGUOUS_OFFICIAL_ID', identifiers: first.identifiers, weatherRuns: [], physicalObservations: [], fuelPack: null, terrainPack: null, acquisitionBlockers: [] }; });
}
export class CorpusAcquisitionRuntime {
  constructor(input) { Object.assign(this, input); }
  ensureBudgets(manifest, stateCount, rawIds, startedAt) {
    const uniqueIds = [...new Set(rawIds)], downloadedBytes = uniqueIds.reduce((sum, id) => sum + Number(this.acquisitionStore.getProduct(id)?.byteLength ?? 0), 0), storedBytes = this.acquisitionStore.status().archiveBytes;
    if (stateCount + uniqueIds.length > manifest.budgets.maxProviderObjects) throw new Error('corpus_run_provider_object_budget_exceeded');
    if (downloadedBytes > manifest.budgets.maxBytes) throw new Error('corpus_run_byte_budget_exceeded');
    if (storedBytes > manifest.budgets.maxLocalStorageBytes) throw new Error('corpus_run_storage_budget_exceeded');
    if (Date.now() - startedAt > manifest.budgets.maxRuntimeSeconds * 1_000) throw new Error('corpus_run_runtime_budget_exceeded');
    return { uniqueIds, downloadedBytes, storedBytes };
  }
  async start(value) {
    const manifest = verifyCorpusAcquisitionManifest(value), planFile = path.join(this.paths.plans, `${digest(manifest.integrity.fingerprint)}.json`); await writeJsonAtomic(planFile, manifest);
    const run = await this.runStore.create(manifest); await this.runStore.update(run.runId, (state) => ({ ...state, outputs: { ...state.outputs, planFile } })); return this.execute(run.runId, manifest);
  }
  async resume(runId) {
    const run = await this.runStore.read(runId); if (!run) throw new Error('corpus_run_not_found');
    const planFile = run.outputs?.planFile; if (!planFile || path.dirname(planFile) !== this.paths.plans) throw new Error('corpus_run_plan_path_invalid');
    return this.execute(runId, JSON.parse(await readFile(planFile, 'utf8')));
  }
  async execute(runId, value) {
    const manifest = verifyCorpusAcquisitionManifest(value), existing = await this.runStore.read(runId), startedAt = Date.now(); if (existing?.state === 'COMPLETED') return existing;
    await this.runStore.update(runId, (state) => ({ ...state, state: 'RUNNING' }));
    try {
      const page = await retry(() => fetchWfigsArchive({ manifest, rawVault: this.rawVault, fetchImpl: this.fetchImpl, clock: this.clock, offset: 0 }), manifest.budgets.maxRetries), incidents = incidentsFrom(page.states, manifest.budgets.maxIncidents), rawIds = [page.rawProduct.id];
      this.ensureBudgets(manifest, page.states.length, rawIds, startedAt);
      for (const incident of incidents.slice(0, 1)) await this.enrich(incident, manifest, rawIds, page.states.length, startedAt);
      const budget = this.ensureBudgets(manifest, page.states.length, rawIds, startedAt);
      const silver = { schemaVersion: 'vigia.forecast-corpus-silver.v1', manifestFingerprint: manifest.integrity.fingerprint, providers: manifest.providers, incidents, sourceWarnings: ['WFIGS Daily Perimeters is an automated captured-geometry history and NIFC says it is not an official progression.'], rawProductIds: [...new Set(rawIds)].sort() }, silverFile = path.join(this.paths.silver, `${runId}.json`);
      await writeJsonAtomic(silverFile, silver); await this.acquisitionStore.markProductsIngested(silver.rawProductIds);
      return this.runStore.update(runId, (state) => ({ ...state, state: 'COMPLETED', cursor: { stage: 'COMPLETE', pageOffset: page.nextOffset }, completedStages: ['WFIGS', 'SILVER'], attemptedStages: ['WFIGS', 'WEATHER', 'CONTEXT', 'PHYSICAL', 'SILVER'], outputs: { ...state.outputs, silverFile }, metrics: { requests: silver.rawProductIds.length, downloadedBytes: budget.downloadedBytes, uniqueStoredBytes: budget.storedBytes, duplicates: rawIds.length - budget.uniqueIds.length, objects: page.states.length + budget.uniqueIds.length }, failures: incidents.flatMap((incident) => incident.acquisitionBlockers) }));
    } catch (error) {
      await this.runStore.update(runId, (state) => ({ ...state, state: 'FAILED', failures: [...state.failures, String(error.message ?? error)] })); throw error;
    }
  }
  async enrich(incident, manifest, rawIds, stateCount, startedAt) {
    const third = incident.perimeterStates[2], qa = third ? validateCorpusGeometry({ geometry: third.geometry }) : null, bbox = qa?.passed ? bufferBbox(qa.bbox) : null;
    if (!third || !bbox) { incident.acquisitionBlockers.push('INSUFFICIENT_VALID_PERIMETER_HISTORY_FOR_ENRICHMENT'); return; }
    if (manifest.providers.includes('noaa-hrrr-archive')) try { const hrrr = await retry(() => acquireHrrrIssueRun({ cutoff: third.clocks.availableToVigiaAt, rawVault: this.rawVault, manifest, fetchImpl: this.fetchImpl }), manifest.budgets.maxRetries); incident.weatherRuns.push(hrrr.weatherRun); rawIds.push(...hrrr.rawProducts.map((item) => item.id)); this.ensureBudgets(manifest, stateCount, rawIds, startedAt); } catch (error) { incident.acquisitionBlockers.push(`HRRR:${error.message}`); }
    if (manifest.providers.includes('usfs-landfire')) try { const context = await retry(() => acquireLandfireContext({ bbox, rawVault: this.rawVault, manifest, fetchImpl: this.fetchImpl }), manifest.budgets.maxRetries); incident.fuelPack = context.fuelPack; incident.terrainPack = context.terrainPack; rawIds.push(...context.rawProducts.map((item) => item.id)); this.ensureBudgets(manifest, stateCount, rawIds, startedAt); } catch (error) { incident.acquisitionBlockers.push(`LANDFIRE:${error.message}`); }
    if (manifest.providers.includes('nasa-firms-archive')) try { const start = incident.discoveryTime.slice(0, 10), firms = await retry(() => acquireFirmsArchive({ bbox, from: start, days: 5, mapKey: this.config.firmsMapKey, rawVault: this.rawVault, manifest, fetchImpl: this.fetchImpl, clock: this.clock }), manifest.budgets.maxRetries); incident.physicalObservations = firms.observations; incident.upstreamObservationIds = firms.observations.map((item) => item.causalRoot); incident.physicalPixelIds = firms.observations.map((item) => item.causalRoot); incident.causalFamilies = firms.observations.length ? ['VIIRS'] : []; rawIds.push(...firms.rawProducts.map((item) => item.id)); this.ensureBudgets(manifest, stateCount, rawIds, startedAt); if (firms.blocker) incident.acquisitionBlockers.push(`FIRMS:${firms.blocker}`); } catch (error) { incident.acquisitionBlockers.push(`FIRMS:${error.message}`); }
  }
}
