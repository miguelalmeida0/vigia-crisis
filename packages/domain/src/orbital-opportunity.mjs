import { createHash } from 'node:crypto';
import { degreesLat, degreesLong, eciToGeodetic, gstime, propagate, twoline2satrec } from 'satellite.js';

const EARTH_RADIUS_KM = 6371.0088;
function iso(value) { const date = new Date(value); if (!Number.isFinite(date.getTime())) throw new Error('valid_time_required'); return date.toISOString(); }
function hash(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32); }
function distanceKm([lon1, lat1], [lon2, lat2]) { const rad = Math.PI / 180, p1 = lat1 * rad, p2 = lat2 * rad, dp = (lat2 - lat1) * rad, dl = (lon2 - lon1) * rad; const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2; return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a))); }
function groundPoint(satrec, date) { const state = propagate(satrec, date); if (!state.position) return null; const point = eciToGeodetic(state.position, gstime(date)); return [degreesLong(point.longitude), degreesLat(point.latitude)]; }
function tleEpoch(line1) { const token = line1.slice(18, 32), yy = Number(token.slice(0, 2)), year = yy < 57 ? 2000 + yy : 1900 + yy, day = Number(token.slice(2)); return new Date(Date.UTC(year, 0, 1) + (day - 1) * 86_400_000).toISOString(); }

export function predictOrbitalPasses({ eventId, coordinate, orbitSnapshot, from = new Date(), until = null, horizonHours = 12, stepSeconds = 15, swathWidthKm = 1400, geometryUncertaintyKm = 35 } = {}) {
  if (!eventId || !Array.isArray(coordinate) || coordinate.length !== 2) throw new Error('event_coordinate_required');
  if (!Array.isArray(orbitSnapshot?.satellites)) throw new Error('orbit_snapshot_required');
  const calculatedAt = new Date().toISOString(), start = Date.parse(iso(from)), end = until ? Date.parse(iso(until)) : start + horizonHours * 3_600_000;
  const halfSwathKm = swathWidthKm / 2, thresholdKm = halfSwathKm + geometryUncertaintyKm, passes = [];
  for (const element of orbitSnapshot.satellites) {
    const satrec = twoline2satrec(element.line1, element.line2), samples = [];
    for (let time = start; time <= end; time += stepSeconds * 1000) {
      const point = groundPoint(satrec, new Date(time)); if (!point) continue;
      samples.push({ time, point, distanceKm: distanceKm(coordinate, point) });
    }
    let active = [];
    const flush = () => {
      if (!active.length) return;
      const closest = active.reduce((best, item) => item.distanceKm < best.distanceKm ? item : best);
      const windowStart = new Date(Math.max(start, active[0].time - stepSeconds * 1000)).toISOString(), windowEnd = new Date(Math.min(end, active.at(-1).time + stepSeconds * 1000)).toISOString();
      const stable = { eventId, platform: element.platform, windowStart, windowEnd, orbitHash: element.checksumSha256 };
      passes.push(Object.freeze({ id: `orbital-pass:${hash(stable)}`, eventId: String(eventId), sourceFamily: 'sentinel3_slstr', platform: element.platform,
        opportunityType: 'PREDICTED_ORBITAL_PASS', authority: `CELESTRAK_GP_TLE:${element.noradId}:${element.checksumSha256}`,
        windowStart, windowEnd, closestApproachAt: new Date(closest.time).toISOString(), closestGroundTrackDistanceKm: Number(closest.distanceKm.toFixed(3)),
        swathRelation: closest.distanceKm <= halfSwathKm ? 'WITHIN_NOMINAL_NADIR_SWATH' : 'WITHIN_GEOMETRY_UNCERTAINTY_MARGIN',
        coverageAssumptions: { eventCoordinate: [...coordinate], eventPointIntersection: true, closestGroundTrackDistanceKm: Number(closest.distanceKm.toFixed(3)), swathRelation: closest.distanceKm <= halfSwathKm ? 'WITHIN_NOMINAL_NADIR_SWATH' : 'WITHIN_GEOMETRY_UNCERTAINTY_MARGIN', orbitSource: element.sourceUrl, orbitDatasetHash: orbitSnapshot.datasetHash, tleEpoch: tleEpoch(element.line1), tleAgeAtCalculationHours: Number(((Date.parse(calculatedAt) - Date.parse(tleEpoch(element.line1))) / 3_600_000).toFixed(3)), swathWidthKm, halfSwathKm, geometryUncertaintyKm,
          intersectionMethod: 'SGP4 ground-track great-circle distance <= SLSTR half-swath plus explicit geometry uncertainty', trackGeometry: { type: 'LineString', coordinates: active.map((item) => item.point) },
          uncertainty: { state: 'BOUNDED_MODEL_ASSUMPTION', crossTrackKm: geometryUncertaintyKm, sampleIntervalSeconds: stepSeconds, note: 'TLE/SGP4 ground track with nominal SLSTR nadir swath; product acquisition, view selection, cloud, quality and signal remain unproven.' } },
        qualityDependencies: { requiresSuccessfulAcquisition: true, requiresEventInsideProductFootprint: true, requiresUsableCoverage: true, requiresQualityReview: true },
        blockerReason: null, evidenceNeedId: null, createdAt: calculatedAt, expiresAt: windowEnd,
        calculationVersion: 'vigia.sgp4-slstr-swath-intersection.v1', canCloseEvidenceNeed: true }));
      active = [];
    };
    for (const sample of samples) { if (sample.distanceKm <= thresholdKm) active.push(sample); else flush(); }
    flush();
  }
  return passes.sort((a, b) => Date.parse(a.windowStart) - Date.parse(b.windowStart) || a.platform.localeCompare(b.platform));
}

export function validateOrbitalPredictions({ eventId, coordinate, orbitSnapshot, actualProducts = [], stepSeconds = 5, swathWidthKm = 1400 } = {}) {
  const cases = actualProducts.map((product) => {
    const actualAt = iso(product.observedAt ?? product.sourceTimestamp), from = new Date(Date.parse(actualAt) - 90 * 60_000), until = new Date(Date.parse(actualAt) + 90 * 60_000);
    const scoped = { ...orbitSnapshot, satellites: orbitSnapshot.satellites.filter((item) => String(item.platform).toLowerCase() === String(product.platform).toLowerCase()) };
    const predicted = predictOrbitalPasses({ eventId, coordinate, orbitSnapshot: scoped, from, until, stepSeconds, swathWidthKm });
    const nearest = predicted.sort((a, b) => Math.abs(Date.parse(a.closestApproachAt) - Date.parse(actualAt)) - Math.abs(Date.parse(b.closestApproachAt) - Date.parse(actualAt)))[0] ?? null;
    return { productId: product.productId, rawSourceProductId: product.rawSourceProductId ?? null, platform: product.platform, actualAt,
      actualProductWindow: product.windowStart && product.windowEnd ? { start: iso(product.windowStart), end: iso(product.windowEnd) } : null,
      predictedPassId: nearest?.id ?? null, predictedClosestApproachAt: nearest?.closestApproachAt ?? null,
      temporalErrorSeconds: nearest ? Math.round(Math.abs(Date.parse(nearest.closestApproachAt) - Date.parse(actualAt)) / 1000) : null,
      closestGroundTrackDistanceKm: nearest?.closestGroundTrackDistanceKm ?? null, nominalSwathIntersectionPredicted: nearest?.swathRelation === 'WITHIN_NOMINAL_NADIR_SWATH', missedActualPass: !nearest,
      geometryValidation: { actualPixelCoordinate: product.coordinate ?? null, actualPixelIsProductEvidence: Boolean(product.coordinate), predictedRelation: nearest?.swathRelation ?? 'NO_PREDICTED_INTERSECTION' } };
  });
  const errors = cases.map((item) => item.temporalErrorSeconds).filter(Number.isFinite).sort((a, b) => a - b), median = errors.length ? errors[Math.floor(errors.length / 2)] : null;
  return Object.freeze({ schemaVersion: 'vigia.orbital-prediction-validation.v1', generatedAt: new Date().toISOString(), cohort: { definition: 'All attributable Sentinel-3 SLSTR products associated to the selected production event', products: cases.length },
    metrics: { predictedForActualPasses: cases.filter((item) => item.predictedPassId).length, actualPasses: cases.length, missedActualPasses: cases.filter((item) => item.missedActualPass).length,
      medianAbsoluteTemporalErrorSeconds: median, maxAbsoluteTemporalErrorSeconds: errors.length ? Math.max(...errors) : null,
      falseOpportunityRate: null, falseOpportunityQualification: 'UNMEASURED: retained FRP products prove positive product passages but are not a complete no-signal pass archive.' }, cases,
    limitation: 'Current TLEs are propagated backward for historical validation. Measured error is retained and current forward predictions are not promoted to acquisitions.' });
}
