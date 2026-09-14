import { createHash } from 'node:crypto';

const HORIZONS = Object.freeze([
  ['NOW', 0], ['NEXT_30_MIN', 30], ['NEXT_3_HOURS', 180], ['NEXT_12_HOURS', 720]
]);
const WINDOW_TYPES = new Set(['PREDICTED_ORBITAL_PASS', 'EXPECTED_CADENCE', 'CONFIRMED_PROVIDER_PRODUCT', 'UNKNOWN']);

function id(prefix, value) { return `${prefix}:${createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32)}`; }
function valid(value) { return Number.isFinite(Date.parse(value ?? '')); }
function geometry(value) { return value?.type && Array.isArray(value.coordinates) ? value : null; }
function overlaps(item, from, until) {
  if (!valid(item.windowStart) || !valid(item.windowEnd)) return false;
  return Date.parse(item.windowEnd) >= from && Date.parse(item.windowStart) <= until;
}

export function createCoverageIntelligence({ subject = {}, opportunities = [], sourceStates = {}, now = new Date(), calculationVersion = 'vigia.coverage-intelligence.v1' } = {}) {
  const generatedAt = new Date(now).toISOString(), nowMs = Date.parse(generatedAt), subjectType = String(subject.type ?? 'EVENT').toUpperCase();
  const subjectId = String(subject.id ?? 'unknown'), point = Array.isArray(subject.coordinate) && subject.coordinate.length === 2 ? { type: 'Point', coordinates: subject.coordinate } : null;
  const regionGeometry = geometry(subject.geometry) ?? point;
  const region = {
    id: id('coverage-region', { subjectType, subjectId }), subjectType, subjectId,
    label: String(subject.label ?? subjectId), geometry: regionGeometry,
    authority: subject.geometryAuthority ?? (point ? 'SUBJECT_REFERENCE_POINT_ONLY' : 'NO_AUTHORITATIVE_GEOMETRY'),
    calculationVersion, createdAt: generatedAt, updatedAt: generatedAt,
    qualification: point ? 'A reference point is not an observed swath or territory coverage geometry.' : 'No authoritative subject geometry is available.'
  };
  const windows = opportunities.map((item) => {
    const type = WINDOW_TYPES.has(item.opportunityType) ? item.opportunityType : 'UNKNOWN';
    const coverageGeometry = geometry(item.coverageAssumptions?.geometry);
    return {
      id: id('coverage-window', { regionId: region.id, opportunityId: item.id }), regionId: region.id,
      sourceFamily: item.sourceFamily, opportunityId: item.id, opportunityType: type,
      windowStart: item.windowStart ?? null, windowEnd: item.windowEnd ?? null,
      geometry: coverageGeometry, trackGeometry: geometry(item.coverageAssumptions?.trackGeometry), authority: item.authority ?? 'VIGIA_UNKNOWN',
      orbitSource: item.coverageAssumptions?.orbitSource ?? null,
      calculationVersion: item.calculationVersion ?? calculationVersion,
      uncertainty: item.coverageAssumptions?.uncertainty ?? { state: 'UNQUANTIFIED' },
      expiresAt: item.expiresAt, canCloseEvidenceNeed: item.canCloseEvidenceNeed === true,
      pointIntersection: item.coverageAssumptions?.eventPointIntersection === true || ['WITHIN_NOMINAL_NADIR_SWATH','WITHIN_GEOMETRY_UNCERTAINTY_MARGIN'].includes(item.coverageAssumptions?.swathRelation ?? item.swathRelation),
      closestGroundTrackDistanceKm: item.coverageAssumptions?.closestGroundTrackDistanceKm ?? item.closestGroundTrackDistanceKm ?? null,
      geometryQualification: coverageGeometry ? 'PROVIDER_OR_CALCULATION_AREA_GEOMETRY_PRESENT' : geometry(item.coverageAssumptions?.trackGeometry) ? 'GROUND_TRACK_PRESENT_SWATH_WIDTH_SEPARATE' : 'NO_SWATH_GEOMETRY_ASSERTED'
    };
  });
  const families = new Set([...Object.keys(sourceStates), ...windows.map((item) => item.sourceFamily)]);
  const cells = [{
    id: id('coverage-cell', { regionId: region.id, cell: 'subject-reference' }), regionId: region.id,
    cellKey: 'subject-reference', geometry: point, coverageState: 'UNKNOWN', sourceFamilies: [],
    validFrom: generatedAt, validUntil: null,
    qualification: 'A subject reference cell is tracked, but observed coverage requires attributable swath geometry.'
  }];
  const forecasts = HORIZONS.map(([horizon, minutes], index) => {
    const from = index === 0 ? nowMs - 60_000 : nowMs, until = nowMs + Math.max(1, minutes) * 60_000;
    const candidates = windows.filter((item) => overlaps(item, from, until));
    const geometryBacked = candidates.filter((item) => item.geometry), pointIntersections = candidates.filter((item) => item.pointIntersection);
    return {
      horizon, from: new Date(from).toISOString(), until: new Date(until).toISOString(),
      sourceFamilies: [...new Set(candidates.map((item) => item.sourceFamily))], opportunityCount: candidates.length,
      independentSourceFamilyCount: new Set(candidates.map((item) => item.sourceFamily)).size,
      geometryBackedWindowCount: geometryBacked.length, pointIntersectionCount: pointIntersections.length,
      pointCoverageState: pointIntersections.length ? 'PREDICTED_INTERSECTION' : candidates.length ? 'OPPORTUNITY_WITHOUT_EVENT_INTERSECTION_PROOF' : 'NO_GOVERNED_OPPORTUNITY', coveragePercent: null,
      percentageState: geometryBacked.length && region.geometry?.type !== 'Point' ? 'POSTGIS_INTERSECTION_REQUIRED' : 'UNAVAILABLE_NO_COMPARABLE_AREA_GEOMETRY',
      qualification: 'No percentage is emitted without authoritative area geometry and a PostGIS intersection denominator.'
    };
  });
  const gaps = [];
  for (const family of families) {
    const source = sourceStates[family] ?? {}, familyWindows = windows.filter((item) => item.sourceFamily === family && Date.parse(item.expiresAt) > nowMs);
    const hasGeometry = familyWindows.some((item) => item.geometry);
    const hasPointIntersection = familyWindows.some((item) => item.pointIntersection);
    if (!familyWindows.length || (!hasGeometry && !hasPointIntersection)) gaps.push({
      id: id('coverage-gap', { regionId: region.id, family, horizon: 'NEXT_12_HOURS', reason: familyWindows.length ? 'NO_AUTHORITATIVE_SWATH_GEOMETRY' : 'NO_GOVERNED_OPPORTUNITY' }),
      regionId: region.id, sourceFamily: family, horizon: 'NEXT_12_HOURS',
      reasonCode: familyWindows.length ? 'NO_AUTHORITATIVE_SWATH_GEOMETRY' : source.state === 'unavailable' ? 'SOURCE_FAILURE' : 'NO_GOVERNED_OPPORTUNITY',
      geometry: null, identifiedAt: generatedAt, expiresAt: new Date(nowMs + 12 * 3_600_000).toISOString(),
      providerState: source.state ?? 'unknown', assetsInGap: (subject.assets ?? []).filter((asset) => asset.sourceFamily === family || !asset.sourceFamily).map((asset) => asset.id),
      gapPriority: { score: (!familyWindows.length ? 40 : 20) + (source.state === 'unavailable' ? 30 : 0) + ((subject.assets ?? []).length ? 20 : 0),
        factors: [!familyWindows.length ? 'NO_GOVERNED_OPPORTUNITY' : 'NO_EVENT_INTERSECTION_PROOF', source.state === 'unavailable' ? 'SOURCE_UNAVAILABLE' : 'SOURCE_STATE_NOT_FAILED', (subject.assets ?? []).length ? 'MONITORED_ASSET_CONTEXT_PRESENT' : 'NO_ASSET_CONTEXT'],
        qualification: 'Transparent ordinal triage score; not probability, risk, or coverage percentage.' }
    });
  }
  return Object.freeze({ schemaVersion: 'vigia.coverage-intelligence.v1', generatedAt, region, cells, windows, gaps, forecasts,
    opportunitySemantics: ['PREDICTED_ORBITAL_PASS', 'EXPECTED_CADENCE', 'CONFIRMED_PROVIDER_PRODUCT', 'UNKNOWN'],
    notice: 'Acquisition, delivery, usable coverage and signal remain distinct. No poll interval is represented as an orbital pass.' });
}
