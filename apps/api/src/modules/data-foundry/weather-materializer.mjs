import path from 'node:path';
import { semanticHash } from '../../../../../packages/domain/src/intelligence/shared.mjs';
import { validateCorpusGeometry } from '../../../../../packages/domain/src/forecast-corpus/index.mjs';
import { readJson, writeJsonAtomic } from '../../shared/json-file.mjs';
import { corpusPaths } from '../forecast-corpus/corpus-paths.mjs';
import { loadMergedSilverIncidents } from '../forecast-corpus/silver-loader.mjs';
import { decodeHrrrIncidentSlice } from './hrrr-decoder.mjs';

export async function materializeRetainedHrrr({ projectRoot = process.cwd(), incidentId = '2025-AZGCP-000597', gridSide = 32, pythonPath } = {}) {
  const paths = corpusPaths(projectRoot), loaded = await loadMergedSilverIncidents(paths.silver,{maximumRssBytes:512*1024*1024}), incident = loaded.incidents.find((item)=>item.id===incidentId); if (!incident) throw new Error('hrrr_incident_not_found');
  const weatherRun = (incident.weatherRuns ?? []).find((run) => run.model === 'NOAA HRRR'); if (!weatherRun) throw new Error('hrrr_retained_run_not_found');
  const current = incident.perimeterStates?.[2] ?? incident.perimeterStates?.[0], qa = current ? validateCorpusGeometry({ geometry: current.geometry }) : null; if (!qa?.passed) throw new Error('hrrr_incident_geometry_invalid');
  const bbox = [Math.max(-180, qa.bbox[0] - .12), Math.max(-90, qa.bbox[1] - .12), Math.min(180, qa.bbox[2] + .12), Math.min(90, qa.bbox[3] + .12)], state = await readJson(paths.acquisitionState, { products: {} }), rawProducts = Object.values(state.products);
  const slice = await decodeHrrrIncidentSlice({ projectRoot, bronzeDirectory: paths.bronze, weatherRun, rawProducts, incidentId, bbox, gridSide, pythonPath });
  const decodedRun = { ...weatherRun, valuesDecoded: true, missingValues: slice.missingValues, qualityState: 'CERTIFIED', decoder: { name: slice.decoder, version: slice.decoderVersion }, incidentLocalSliceIds: [slice.id], fields: weatherRun.fields.map((field) => { const decoded = slice.fields.find((item) => item.variable === field.variable); return { ...field, nativeUnits: decoded?.nativeUnits ?? field.units, normalizedUnits: decoded?.normalizedUnits ?? field.units, gridMetadata: decoded?.grid ?? null, forecastStepSeconds: decoded?.forecastStepSeconds ?? field.forecastStepHours * 3600 }; }) };
  const overlayCore = { schemaVersion: 'vigia.forecast-corpus-silver.v1', materializerVersion: 'vigia.hrrr-incident-materializer.v1', sourceManifestFingerprints: loaded.manifestFingerprints, providers: ['noaa-hrrr-archive'], incidents: [{ ...incident, weatherRuns: [decodedRun, ...(incident.weatherRuns ?? []).filter((run) => run.runId !== decodedRun.runId)] }], rawProductIds: weatherRun.fields.map((field) => field.rawProductId).concat(weatherRun.indexRawProductId).filter(Boolean), weatherSliceIds: [slice.id] }, overlayFingerprint = semanticHash('hrrr-silver-overlay', overlayCore), overlay = { ...overlayCore, overlayFingerprint };
  const sliceFile = path.join(paths.runtime, 'materialized/weather', `${slice.id.split(':').at(-1)}.json`), overlayFile = path.join(paths.silver, `weather-${overlayFingerprint.split(':').at(-1).slice(0, 24)}.json`);
  await Promise.all([writeJsonAtomic(sliceFile, slice), writeJsonAtomic(overlayFile, overlay)]);
  return { incidentId, slice, decodedRun, sliceFile, overlayFile, overlayFingerprint };
}
