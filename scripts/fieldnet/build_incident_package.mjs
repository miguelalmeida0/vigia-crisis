import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFieldIncidentPackage, verifyIncidentPackage } from '../../packages/domain/src/fieldnet/contracts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const projectionPath = path.join(root, 'data/runtime/event-projections.production.json');
const observationPath = path.join(root, 'data/runtime/fire-event-observations.production.json');
const contextPath = path.join(root, 'data/reference/portugal-thermal-context-v1.json');
const geographyPath = path.join(root, 'data/validation/fieldnet/offline-geography/incident-geography.json');
const terrainPath = path.join(root, 'data/validation/fieldnet/offline-geography/incident-terrain.json');
const measurementDebtPath = path.join(root, 'data/validation/measurement-debt/measurement-debt-handoff.json');
export const defaultOutputPath = path.join(root, 'data/validation/fieldnet/real-incident-package.json');

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const haversineKm = ([lon1, lat1], [lon2, lat2]) => {
  const rad = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * rad / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin((lon2 - lon1) * rad / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
const firstCoordinate = (value) => {
  if (Array.isArray(value) && value.length === 2 && value.every(Number.isFinite)) return value;
  if (Array.isArray(value)) for (const child of value) { const found = firstCoordinate(child); if (found) return found; }
  return null;
};
const compactObservation = (item) => ({
  observationId: item.id,
  sourceFamily: item.sourceFamily,
  independenceGroup: item.independenceGroup,
  sensor: item.sensor ?? null,
  instrument: item.instrument ?? null,
  observedAt: item.at,
  receivedAt: item.receivedAt ?? null,
  coordinate: item.coordinate,
  measurement: item.measurement ?? { frpMw: item.frpMw, brightnessK: item.brightnessK },
  frpUncertaintyMw: item.frpUncertaintyMw ?? null,
  confidence: item.confidence ?? null,
  rawSourceProductId: item.provenance?.rawSourceProductId ?? item.rawSourceProductId,
  checksumSha256: item.provenance?.checksumSha256 ?? null,
  provider: item.provenance?.provider ?? item.source,
  synthetic: item.provenance?.synthetic === true
});

export async function buildIncidentPackage({ outputPath = defaultOutputPath } = {}) {
  const [projection, observationState, siteContext, geography, terrain, measurementDebtHandoff] = await Promise.all([readJson(projectionPath), readJson(observationPath), readJson(contextPath), readJson(geographyPath), readJson(terrainPath), readJson(measurementDebtPath)]);
  const candidates = (projection.command?.events ?? []).filter((event) => event.physicalFirst && event.physicalSourceProfile?.viirsAndSentinel3);
  const selected = candidates.sort((left, right) => (right.physicalSourceProfile.observationCount ?? 0) - (left.physicalSourceProfile.observationCount ?? 0))[0];
  if (!selected) throw new Error('real_two_family_incident_not_found');
  const operator = (projection.operatorEvents ?? []).find((event) => event.id === selected.id) ?? selected;
  const observationIds = new Set(Object.entries(observationState.observationEvents ?? {}).filter(([, eventId]) => eventId === selected.id).map(([id]) => id));
  const allObservations = observationState.observations.filter((item) => observationIds.has(item.id) && ['viirs', 'sentinel3_slstr'].includes(item.sourceFamily));
  const chronological = [...allObservations].sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
  const choose = (family) => {
    const values = chronological.filter((item) => item.sourceFamily === family);
    return [values[0], values[Math.floor(values.length / 2)], values.at(-1)].filter(Boolean);
  };
  const physicalObservations = [...new Map([...choose('viirs'), ...choose('sentinel3_slstr')].map((item) => [item.id, compactObservation(item)])).values()];
  if (new Set(physicalObservations.map((item) => item.sourceFamily)).size !== 2) throw new Error('incident_package_two_family_evidence_missing');

  const coordinate = selected.coordinate;
  const monitoredAssets = (siteContext.features ?? []).map((feature) => {
    const featureCoordinate = firstCoordinate(feature.paths);
    if (!featureCoordinate) return null;
    return { assetId: feature.id, contextClass: feature.contextClass, name: feature.name ?? null, coordinate: featureCoordinate, distanceKm: Number(haversineKm(coordinate, featureCoordinate).toFixed(3)), provenanceDatasetHash: siteContext.datasetHash };
  }).filter((item) => item && item.distanceKm <= 25).sort((left, right) => left.distanceKm - right.distanceKm).slice(0, 40);

  const sourceFreshness = Object.fromEntries([
    ['viirs', { sourceFamily: 'viirs', lastObservedAt: projection.clocks?.viirs?.observedAt ?? null, lastReceivedAt: projection.clocks?.viirs?.receivedAt ?? null, freshnessContractMs: 90 * 60_000, sourceStateAtPackageTime: projection.clocks?.viirs?.state ?? 'unknown' }],
    ['sentinel3_slstr', { sourceFamily: 'sentinel3_slstr', lastObservedAt: projection.clocks?.sentinel3Pixels?.observedAt ?? null, lastReceivedAt: projection.clocks?.sentinel3Pixels?.receivedAt ?? null, freshnessContractMs: 6 * 60 * 60_000, sourceStateAtPackageTime: projection.clocks?.sentinel3Pixels?.state ?? 'unknown' }],
    ['weather', { sourceFamily: 'weather', lastObservedAt: projection.clocks?.weather?.observedAt ?? null, lastReceivedAt: projection.clocks?.weather?.receivedAt ?? null, freshnessContractMs: 3 * 60 * 60_000, sourceStateAtPackageTime: projection.clocks?.weather?.state ?? 'unknown' }]
  ]);
  const [west, south, east, north] = geography.bbox;
  const createdAt = new Date().toISOString();
  const pkg = createFieldIncidentPackage({
    incidentId: selected.id,
    createdAt,
    sourceNode: 'regional-vigia',
    lastSyncCursor: `event-projection:${projection.generatedAt}`,
    incidentState: {
      label: selected.label,
      coordinate,
      firstSeenAt: selected.firstSeenAt,
      lastSeenAt: selected.lastSeenAt,
      evidenceState: selected.evidenceState,
      knowledgeState: selected.knowledgeState,
      physicalOperationalState: selected.physicalOperationalState,
      physicalFirst: selected.physicalFirst,
      physicalSourceProfile: selected.physicalSourceProfile,
      candidateAssessment: selected.candidateAssessment,
      qualification: 'Real governed VIGIA historical incident projection; package preserves source qualifications and does not assert an active incident.'
    },
    physicalObservations,
    sourceFreshness,
    offlineMap: {
      region: { type: 'Feature', bbox: geography.bbox, properties: { incidentId: selected.id, purpose: 'FIELDNET_BOUNDED_REGION', bufferKm: geography.configurableBufferKm }, geometry: { type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] } },
      incidentAnchor: { type: 'Point', coordinates: coordinate },
      baseLayer: {
        state: 'LOCAL_OFFLINE_GEOGRAPHY_AND_TERRAIN_PACKAGED',
        format: 'MAPLIBRE_COMPATIBLE_GEOJSON_AND_INT16_DEM',
        bbox: geography.bbox,
        layers: ['terrain-hillshade', 'water', 'structures', 'roads-trails', 'places', 'monitored-assets', 'satellite-observations', 'field-observations', 'tasks', 'conflicts', 'incident-anchor'],
        featureCounts: geography.counts,
        geoJson: geography.featureCollection,
        terrain,
        remoteTileDependencies: 0,
        geographySource: geography.source,
        qualification: 'Incident-scoped OSM vectors and Copernicus DEM-derived terrain are packaged locally. Runtime map rendering performs zero remote tile requests.'
      }
    },
    monitoredAssets,
    measurementDebt: (measurementDebtHandoff.evidenceDebtItems ?? []).map((item) => {
      const campaign = (measurementDebtHandoff.campaigns ?? []).find((value) => (value.remainingDebt ?? []).includes(item.id));
      return { id:item.id, question:item.quantity_question, currentState:item.current_state, whyUnknown:item.why_unknown, whyItMatters:item.why_it_matters, howWeCanKnow:item.evidence_required, whatVigiaIsDoing:campaign?.objective ?? item.watch_state, expectedAnswer:item.next_opportunity, closesWhen:item.closure_contract, currentDenominator:item.current_denominator, targetDenominator:item.target_denominator, systemResolvable:item.system_resolvable, fieldRequired:item.field_required, watchState:item.watch_state };
    }),
    currentAlerts: (projection.command?.alerts ?? []).filter((alert) => alert.eventId === selected.id).slice(0, 10).map((alert) => ({ ...alert, version: Number(alert.version ?? 1), qualification: 'Cached regional alert included for local acknowledgement; source freshness remains explicit.' })),
    openUncertainties: [
      { id: `uncertainty:${selected.id}:field-verification`, kind: 'FIELD_VERIFICATION_REQUIRED', statement: selected.actionNeed?.reason ?? 'Independent field confirmation is required.' },
      { id: `uncertainty:${selected.id}:candidate-assessment`, kind: 'CANDIDATE_QUALIFICATION', statement: selected.candidateAssessment?.conclusion ?? 'Candidate assessment unavailable.', decision: selected.candidateAssessment?.decision ?? null },
      { id: `uncertainty:${selected.id}:alerts`, kind: 'ALERT_PACKAGE_UNAVAILABLE', statement: 'No central alert record was included in this bounded field package.' }
    ],
    tasks: [],
    decisionLedgerTail: [],
    provenanceReferences: physicalObservations.map((item) => ({ observationId: item.observationId, rawSourceProductId: item.rawSourceProductId, checksumSha256: item.checksumSha256, synthetic: item.synthetic })).concat([
      { kind: 'EVENT_PROJECTION', path: 'data/runtime/event-projections.production.json', generatedAt: projection.generatedAt },
      { kind: 'OBSERVATION_LEDGER', path: 'data/runtime/fire-event-observations.production.json', eventRecord: observationState.eventRecords?.[selected.id] },
      { kind: 'SITE_CONTEXT', path: 'data/reference/portugal-thermal-context-v1.json', datasetHash: siteContext.datasetHash }
      ,{ kind: 'OFFLINE_GEOGRAPHY', path: 'data/validation/fieldnet/offline-geography/incident-geography.json', rawSourceSha256: geography.source.rawSha256, source: geography.source.provider, license: geography.source.license }
      ,{ kind: 'OFFLINE_TERRAIN', path: 'data/validation/fieldnet/offline-geography/incident-terrain.json', rawSourceSha256: terrain.source.rawSha256, source: terrain.source.provider, product: terrain.source.product }
      ,{ kind: 'MEASUREMENT_DEBT_HANDOFF', path: 'data/validation/measurement-debt/measurement-debt-handoff.json', evidenceHash: measurementDebtHandoff.evidenceHash }
    ])
  });
  verifyIncidentPackage(pkg);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(pkg)}\n`);
  return { package: pkg, outputPath, selectedIncident: selected, operatorEvent: operator, evidenceInputCount: allObservations.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await buildIncidentPackage();
  process.stdout.write(`${JSON.stringify({ ok: true, outputPath: result.outputPath, incidentId: result.package.incidentId, byteLength: result.package.byteLength, evidenceHash: result.package.evidenceHash, physicalObservations: result.package.physicalObservations.length, sourceFamilies: [...new Set(result.package.physicalObservations.map((item) => item.sourceFamily))], evidenceInputCount: result.evidenceInputCount })}\n`);
}
