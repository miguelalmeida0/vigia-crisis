import path from 'node:path';
import { semanticHash } from '../../../../../packages/domain/src/intelligence/shared.mjs';
import { writeJsonAtomic } from '../../shared/json-file.mjs';
import { corpusPaths } from '../forecast-corpus/corpus-paths.mjs';
import { loadMergedSilverIncidents } from '../forecast-corpus/silver-loader.mjs';

export async function certifyRetainedContextPacks({ projectRoot = process.cwd() } = {}) {
  const paths = corpusPaths(projectRoot), loaded = await loadMergedSilverIncidents(paths.silver,{include:(file)=>file.endsWith('.json')&&!file.startsWith('context-certified-')}), selected = new Map();
  for (const incident of loaded.incidents) if (incident.terrainPack?.datasetId === 'USGS-LANDFIRE-LF2020-TOPO') selected.set(incident.id, incident);
  const incidents = [...selected.values()].sort((a, b) => a.id.localeCompare(b.id)).map((incident) => ({ ...incident, terrainPack: { ...incident.terrainPack, verticalDatum: 'NAVD88 (CONUS LANDFIRE LF2020 elevation source)', horizontalCrs: 'EPSG:4326 bounded export from native EPSG:5070', solverCompatibility: 'CERTIFIED_CONTEXT_INPUT', certificationBasis: ['LANDFIRE LF2020 Elevation product metadata', 'LANDFIRE Technical Documentation: CONUS elevation metres referenced to NAVD88', 'Retained GeoTIFF hashes, transformation and nodata policy'], limitations: ['Topography is static context.', 'NAVD88 applies to elevation; slope and aspect are angular derived products.'] } }));
  const core = { schemaVersion: 'vigia.forecast-corpus-silver.v1', materializerVersion: 'vigia.landfire-context-certifier.v1', providers: ['usfs-landfire'], incidents, rawProductIds: [...new Set(incidents.flatMap((incident) => [...(incident.fuelPack?.layers ?? []), ...(incident.terrainPack?.layers ?? [])].map((layer) => layer.rawProductId).filter(Boolean)))].sort() }, fingerprint = semanticHash('context-certification-overlay', core), file = path.join(paths.silver, `context-certified-${fingerprint.split(':').at(-1).slice(0, 24)}.json`);
  await writeJsonAtomic(file, { ...core, overlayFingerprint: fingerprint }); return { file, fingerprint, incidents: incidents.map((item) => item.id), terrainPacksCertified: incidents.length, rawProductIds: core.rawProductIds };
}
