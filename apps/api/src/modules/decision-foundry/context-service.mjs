import path from 'node:path';
import { semanticHash, uniqueSorted } from '../../../../../packages/domain/src/intelligence/shared.mjs';
import { readJson, writeJsonAtomic } from '../../shared/json-file.mjs';
import { corpusPaths } from '../forecast-corpus/corpus-paths.mjs';
import { decisionFoundryPaths } from './decision-foundry-paths.mjs';

function coverageSummary(incident, examples) {
  const weather = (incident.weatherRuns ?? []).filter((item) => item.valuesDecoded && item.qualityState === 'CERTIFIED');
  return {
    incidentId: incident.id,
    certifiedSlices: weather.length,
    issueTimes: weather.map((item) => item.issueTime ?? item.run).filter(Boolean).sort(),
    variables: uniqueSorted(weather.flatMap((item) => item.variables ?? ['temperature', 'relativeHumidity', 'uWind', 'vWind', 'precipitation'])),
    steps: uniqueSorted(weather.flatMap((item) => item.steps ?? [])).map(Number),
    incidentGeometryCovered: weather.length > 0,
    supportedHorizons: uniqueSorted(examples.map((item) => item.horizonHours)).map(Number).sort((a, b) => a - b),
    exampleIssueTimes: uniqueSorted(examples.map((item) => item.informationCutoff)),
    missingProducts: weather.length ? [] : ['DECODED_WEATHER'],
    gustState: weather.some((item) => item.variables?.includes('gust')) ? 'AVAILABLE' : 'NOT_CLAIMED',
  };
}

export async function materializeWeatherAvailabilityGraph({ projectRoot = process.cwd() } = {}) {
  const corpus = corpusPaths(projectRoot), paths = decisionFoundryPaths(projectRoot), gold = await readJson(path.join(corpus.gold, 'forecast-corpus.json'), { incidents: [], examples: [] });
  const incidents = gold.incidents.map((incident) => coverageSummary(incident, gold.examples.filter((item) => item.incidentId === incident.id))).sort((a, b) => a.incidentId.localeCompare(b.incidentId));
  const core = { schemaVersion: 'vigia.weather-availability-graph.v1', incidents, certifiedSlices: incidents.reduce((sum, item) => sum + item.certifiedSlices, 0), doctrine: 'Only decoded, quality-certified incident-local slices support a horizon; missing gust is never fabricated.' };
  const graph = { ...core, fingerprint: semanticHash('weather-availability-graph', core) };
  await writeJsonAtomic(paths.weatherAvailability, graph);
  return graph;
}

export async function materializeFuelTerrainScale({ projectRoot = process.cwd() } = {}) {
  const corpus = corpusPaths(projectRoot), paths = decisionFoundryPaths(projectRoot), gold = await readJson(path.join(corpus.gold, 'forecast-corpus.json'), { incidents: [] });
  const rows = gold.incidents.filter((item) => item.fuelPack || item.terrainPack).map((incident) => ({
    incidentId: incident.id,
    fuel: Boolean(incident.fuelPack),
    terrain: Boolean(incident.terrainPack),
    vegetationClass: incident.fuelPack?.vegetationClass ?? 'MISSING_EXPLICIT',
    disturbance: incident.fuelPack?.disturbance ?? 'MISSING_EXPLICIT',
    crs: incident.fuelPack?.crs ?? incident.terrainPack?.crs ?? null,
    verticalDatum: incident.terrainPack?.verticalDatum ?? null,
    resolution: incident.fuelPack?.resolution ?? incident.terrainPack?.resolution ?? null,
    rights: incident.fuelPack?.rights ?? incident.terrainPack?.rights ?? 'RECORDED_IN_PRODUCT_REGISTRY',
  })).sort((a, b) => a.incidentId.localeCompare(b.incidentId));
  const core = { schemaVersion: 'vigia.fuel-terrain-scale-report.v1', materializedPacks: rows.length, rows, missingVegetationClass: rows.filter((item) => item.vegetationClass === 'MISSING_EXPLICIT').length, missingDisturbance: rows.filter((item) => item.disturbance === 'MISSING_EXPLICIT').length };
  const report = { ...core, fingerprint: semanticHash('fuel-terrain-scale-report', core) };
  await writeJsonAtomic(path.join(paths.runtime, 'fuel-terrain-scale.json'), report);
  return report;
}
