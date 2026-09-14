const CALIBRATION_STATES = new Set(['SCREENING_CANDIDATE', 'HUMAN_ACCEPTED', 'HUMAN_REJECTED']);

function finite(value, name, { min = -Infinity } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min) throw new Error(`invalid_${name}`);
  return number;
}

function geometry(value) {
  const candidate = value?.type === 'Feature' ? value.geometry : value;
  if (!['Polygon', 'MultiPolygon'].includes(candidate?.type) || !Array.isArray(candidate.coordinates)) throw new Error('invalid_fuel_continuity_geometry');
  return structuredClone(candidate);
}

export function createFuelContinuityFinding(input) {
  const calibrationState = String(input?.calibrationState ?? 'SCREENING_CANDIDATE');
  if (!input?.findingId || !CALIBRATION_STATES.has(calibrationState)) throw new Error('invalid_fuel_continuity_finding');
  const start = String(input.firstObservableInterval?.start ?? '');
  const end = String(input.firstObservableInterval?.end ?? '');
  if (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(start) >= Date.parse(end)) throw new Error('invalid_first_observable_interval');
  return {
    findingId: String(input.findingId),
    kind: 'FUEL_CONTINUITY_CHANGE',
    place: String(input.place ?? 'Selected territory').slice(0,180),
    municipality: String(input.place ?? 'Selected territory').slice(0,180),
    state: String(input.state ?? 'open'),
    geometry: geometry(input.geometry),
    coordinate: [finite(input.coordinate?.[0], 'longitude'), finite(input.coordinate?.[1], 'latitude')],
    currentObservationId: String(input.currentObservationId),
    comparisonObservationId: String(input.comparisonObservationId),
    firstObservableInterval: { start, end },
    affectedAreaHa: finite(input.affectedAreaHa, 'affected_area', { min: 0.0001 }),
    corridorLengthM: finite(input.corridorLengthM, 'corridor_length', { min: 0 }),
    nearestStructureM: finite(input.nearestStructureM, 'nearest_structure', { min: 0 }),
    structuresWithinPolicyRadius: Math.max(0, Math.trunc(finite(input.structuresWithinPolicyRadius, 'structures_within_policy_radius', { min: 0 }))),
    newFuelFraction: input.newFuelFraction === null || input.newFuelFraction === undefined ? null : finite(input.newFuelFraction, 'new_fuel_fraction', { min: 0 }),
    medianNdmi: input.medianNdmi === null || input.medianNdmi === undefined ? null : finite(input.medianNdmi, 'median_ndmi'),
    roadCrossings: input.roadCrossings === null || input.roadCrossings === undefined ? null : Math.max(0,Math.trunc(finite(input.roadCrossings,'road_crossings',{min:0}))),
    criticalAssetProximityM: input.criticalAssetProximityM === null || input.criticalAssetProximityM === undefined ? null : finite(input.criticalAssetProximityM,'critical_asset_proximity',{min:0}),
    terrainContext: structuredClone(input.terrainContext ?? { state:'UNMEASURED' }),
    landCoverContext: structuredClone(input.landCoverContext ?? { state:'UNMEASURED' }),
    rationale: structuredClone(input.rationale ?? {}),
    attentionPriority: structuredClone(input.attentionPriority ?? null),
    infrastructureInteractions: (input.infrastructureInteractions ?? []).slice(0, 24).map((item) => structuredClone(item)),
    sourceQuality: structuredClone(input.sourceQuality ?? {}),
    detectorVersion: String(input.detectorVersion),
    calibrationState,
    provenance: structuredClone(input.provenance ?? {}),
    validation: structuredClone(input.validation ?? { state: 'UNMEASURED' }),
    evidenceNeedId: input.evidenceNeedId ? String(input.evidenceNeedId) : null,
    evidenceRequestId: input.evidenceRequestId ? String(input.evidenceRequestId) : null,
    createdAt: String(input.createdAt),
    updatedAt: String(input.updatedAt ?? input.createdAt)
  };
}
