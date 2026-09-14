import path from 'node:path';
import { access } from 'node:fs/promises';
import { semanticHash } from '../../../../../packages/domain/src/intelligence/shared.mjs';
import { validateCorpusGeometry } from '../../../../../packages/domain/src/forecast-corpus/index.mjs';
import { readJson, writeJsonAtomic } from '../../shared/json-file.mjs';
import { createForecastCorpusRuntime } from '../forecast-corpus/create-runtime.mjs';
import { corpusPaths } from '../forecast-corpus/corpus-paths.mjs';
import { FedsRealityProvider } from '../reality-network/providers/official-perimeter-providers.mjs';
import { dataFoundryPaths } from './foundry-paths.mjs';

export async function materializeFedsProgression({ projectRoot = process.cwd(), incidentId, fetchImpl = globalThis.fetch, force = false } = {}) {
  const foundry = dataFoundryPaths(projectRoot), output = path.join(foundry.runtime, 'feds', `${String(incidentId).replace(/[^a-z0-9._-]/gi, '_')}.json`); if (!force) try { await access(output); return { ...(await readJson(output, null)), state: 'ALREADY_MATERIALIZED', output }; } catch {}
  const corpus = corpusPaths(projectRoot), gold = await readJson(path.join(corpus.gold, 'forecast-corpus.json'), { incidents: [] }), incident = gold.incidents.find((item) => item.id === incidentId); if (!incident) throw new Error('feds_incident_not_found');
  const geometry = incident.perimeterStates?.find((item) => validateCorpusGeometry({ geometry: item.geometry }).passed)?.geometry, qa = geometry ? validateCorpusGeometry({ geometry }) : null; if (!qa?.passed) throw new Error('feds_incident_geometry_invalid'); const bbox = [qa.bbox[0] - .25, qa.bbox[1] - .25, qa.bbox[2] + .25, qa.bbox[3] + .25];
  const runtime = await createForecastCorpusRuntime({ projectRoot, fetchImpl }), provider = new FedsRealityProvider({ rawVault: runtime.rawVault, stateStore: runtime.rawVault.stateStore, fetchImpl }), result = await provider.fetchCurrent({ bbox, resultRecordCount: 40, correlationKeys: [`incident:${incidentId}`] }); if (!['LIVE', 'DEGRADED'].includes(result.status)) throw new Error(`feds_acquisition_failed:${result.error ?? result.status}`);
  const states = (result.events ?? []).map((event) => ({ id: event.id, providerFeatureId: event.source.providerEventId, incidentId, observedAt: event.clocks.observedAt, providerPublishedAt: event.clocks.publishedAt, providerRetrievedAt: event.clocks.receivedAt, availableToVigiaAt: event.clocks.receivedAt, geometry: event.payload.perimeter, areaKm2: event.payload.areaKm2, activeFrontKm: event.payload.activeFrontKm, meanFrpMw: event.payload.meanFrpMw, causalRoot: 'VIIRS', causalFamily: 'VIIRS', derivedRole: 'VIIRS_DERIVED_EVENT_PERIMETER', bronzeRefs: event.provenance?.rawSourceProductId ? [event.provenance.rawSourceProductId] : [result.rawProduct?.id].filter(Boolean), knowledgeTimeUse: 'RETROSPECTIVE_ONLY_UNLESS_HISTORICAL_PUBLICATION_RECEIPT_IS_SUPPLIED' })).filter((item) => item.geometry);
  const core = { schemaVersion: 'vigia.feds-progression.v1', incidentId, classification: 'DERIVED_PROGRESS_SEQUENCE', provider: 'nasa-feds', causalRelationship: 'FEDS_DERIVED_FROM_VIIRS_NOT_INDEPENDENT_PHYSICAL_FAMILY', bbox, retrievedAt: result.completedAt, rawProductId: result.rawProduct?.id ?? null, states, limitations: ['NRT service retrieval time is retained as VIGIA knowledge time.', 'No historical issue-time publication receipt was available, so this product cannot leak into historical features.'] }, fingerprint = semanticHash('feds-progression', core), product = { ...core, fingerprint };
  await writeJsonAtomic(output, product); return { ...product, state: 'MATERIALIZED', output };
}
