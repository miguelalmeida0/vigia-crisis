import { RESPONSE_FACILITY_KINDS } from '../../../../../packages/domain/src/response-capability/index.mjs';
import { DEFAULT_ROUTING_CANDIDATE_LIMITS } from './routing-cohort.mjs';
import { currentCapacityReportFacilityIds } from './facility-projection.mjs';

export function discoverResponseCandidates({ repository, incident, reports, clock, options }) {
  const requested = typeof options.routingCandidateLimitPerKind === 'object'
    ? options.routingCandidateLimitPerKind
    : Object.fromEntries(RESPONSE_FACILITY_KINDS.map((kind) => [kind, options.routingCandidateLimitPerKind]));
  const limitPerKind = {
    ...DEFAULT_ROUTING_CANDIDATE_LIMITS,
    ...Object.fromEntries(Object.entries(requested).filter(([, value]) => Number.isFinite(Number(value)))),
    HOSPITAL: Number.MAX_SAFE_INTEGER,
    FIRE_STATION: Number.MAX_SAFE_INTEGER
  };
  const maximumDistanceKm = options.maximumDistanceKm ?? 150;
  const discovered = repository.nearest(incident.coordinate, {
    limitPerKind,
    maximumDistanceKm,
    mustIncludeIds: currentCapacityReportFacilityIds(reports, clock())
  });
  discovered.sourceCoverage ??= {};
  discovered.retrieval ??= {
    covered: true,
    maximumDistanceKm,
    byKind: Object.fromEntries(RESPONSE_FACILITY_KINDS.map((kind) => [kind, {
      withinDistanceCount: discovered.byKind?.[kind]?.length ?? 0,
      truncatedCount: 0,
      cohortPolicy: 'REPOSITORY_DID_NOT_REPORT_DENOMINATOR'
    }]))
  };
  discovered.retrieval.byKind ??= {};
  for (const kind of RESPONSE_FACILITY_KINDS) discovered.retrieval.byKind[kind] ??= {
    withinDistanceCount: discovered.byKind?.[kind]?.length ?? 0,
    truncatedCount: 0,
    cohortPolicy: 'REPOSITORY_DID_NOT_REPORT_DENOMINATOR'
  };
  return discovered;
}
