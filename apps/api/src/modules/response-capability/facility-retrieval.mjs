import { haversineKm } from '../../../../../packages/domain/src/geo.mjs';
import { RESPONSE_FACILITY_KINDS } from '../../../../../packages/domain/src/response-capability/index.mjs';

const COVERAGE_BBOX = Object.freeze([-9.75, 36.7, -6, 42.3]);
const inCoverage = ([lon, lat]) => lon >= COVERAGE_BBOX[0] && lat >= COVERAGE_BBOX[1]
  && lon <= COVERAGE_BBOX[2] && lat <= COVERAGE_BBOX[3];

const limitFor = (limitPerKind, kind) => Math.max(0, Math.floor(
  typeof limitPerKind === 'object' ? Number(limitPerKind[kind] ?? 0) : Number(limitPerKind)
));

export function retrieveFacilityCandidates({ facilities, source, origin, limitPerKind, maximumDistanceKm, mustIncludeIds }) {
  if (!Array.isArray(origin) || origin.length !== 2 || !origin.every(Number.isFinite)) throw new Error('valid_coordinate_required');
  const covered = inCoverage(origin);
  const requiredIds = new Set((mustIncludeIds ?? []).map(String));
  const byKind = Object.fromEntries(RESPONSE_FACILITY_KINDS.map((kind) => [kind, []]));
  const retrieval = Object.fromEntries(RESPONSE_FACILITY_KINDS.map((kind) => [kind, {
    governedSourceRecordCount: 0,
    withinDistanceCount: 0,
    distancePrefilterLimit: limitFor(limitPerKind, kind),
    retainedCurrentReportCount: 0,
    returnedCandidateCount: 0,
    truncatedCount: 0
  }]));
  if (covered) {
    for (const facility of facilities) {
      retrieval[facility.kind].governedSourceRecordCount += 1;
      const distanceKm = haversineKm(origin, facility.coordinate);
      if (distanceKm <= maximumDistanceKm) {
        retrieval[facility.kind].withinDistanceCount += 1;
        byKind[facility.kind].push({ ...facility, distanceKm: Number(distanceKm.toFixed(2)) });
      }
    }
    for (const kind of RESPONSE_FACILITY_KINDS) {
      const ordered = byKind[kind].sort((left, right) => left.distanceKm - right.distanceKm || left.id.localeCompare(right.id));
      const distanceCohort = ordered.slice(0, limitFor(limitPerKind, kind));
      const required = ordered.filter((item) => requiredIds.has(String(item.id)) && !distanceCohort.some((candidate) => candidate.id === item.id));
      byKind[kind] = [...distanceCohort, ...required].map((facility) => ({
        ...facility,
        retrieval: {
          straightLineRank: ordered.findIndex((item) => item.id === facility.id) + 1,
          selectedBecause: requiredIds.has(String(facility.id)) ? 'CURRENT_ATTRIBUTABLE_REPORT_OR_DISTANCE_PREFILTER' : 'DISTANCE_PREFILTER',
          withinDistanceCount: ordered.length,
          distancePrefilterLimit: limitFor(limitPerKind, kind)
        }
      }));
      retrieval[kind].retainedCurrentReportCount = required.length;
      retrieval[kind].returnedCandidateCount = byKind[kind].length;
      retrieval[kind].truncatedCount = Math.max(0, ordered.length - byKind[kind].length);
      retrieval[kind].cohortPolicy = byKind[kind].length === ordered.length
        ? 'EXHAUSTIVE_WITHIN_GOVERNED_MAX_DISTANCE'
        : 'DISTANCE_PREFILTER_PLUS_CURRENT_ATTRIBUTABLE_REPORTS';
      retrieval[kind].omissionReason = retrieval[kind].truncatedCount
        ? 'Lower straight-line-ranked records without a current attributable report are outside this facility-class road-routing cohort.'
        : null;
    }
  }
  return { byKind, retrieval, covered, coverageBbox: [...COVERAGE_BBOX] };
}
