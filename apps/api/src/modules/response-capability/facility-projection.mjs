import { normalizeDynamicCapacity } from '../../../../../packages/domain/src/response-capability/index.mjs';

function latestReport(reports, facilityId) {
  return reports
    .filter((report) => String(report.facilityId) === String(facilityId))
    .sort((left, right) => Date.parse(right.observedAt ?? right.lastUpdatedAt ?? '') - Date.parse(left.observedAt ?? left.lastUpdatedAt ?? ''))[0] ?? null;
}

export function currentCapacityReportFacilityIds(reports, now, staleAfterMs = 30 * 60_000) {
  const nowMs = new Date(now).getTime();
  return [...new Set((reports ?? []).filter((report) => {
    const observedAt = Date.parse(report?.observedAt ?? report?.lastUpdatedAt ?? '');
    return report?.admitted === true
      && Number.isFinite(observedAt)
      && observedAt <= nowMs + 60_000
      && Math.max(0, nowMs - observedAt) <= staleAfterMs;
  }).map((report) => String(report.facilityId ?? '')).filter(Boolean))];
}

function sortReachability(items) {
  const rank = { ROUTED: 0, DISTANCE_ONLY_FALLBACK: 1, UNREACHABLE: 2 };
  return [...items].sort((left, right) =>
    (rank[left.reachability?.state] ?? 3) - (rank[right.reachability?.state] ?? 3)
    || (left.reachability?.travelTimeMinutes ?? Number.POSITIVE_INFINITY) - (right.reachability?.travelTimeMinutes ?? Number.POSITIVE_INFINITY)
    || left.distanceKm - right.distanceKm
    || left.id.localeCompare(right.id));
}

export function projectRoutedFacilities({ kind, routed, reports, clock }) {
  return sortReachability(routed.map((facility) => {
    const dynamicCapacity = normalizeDynamicCapacity(kind, latestReport(reports, facility.id), { now: clock() });
    const statusValue = kind === 'HOSPITAL'
      ? dynamicCapacity.fields.emergencyDepartmentStatus ?? dynamicCapacity.fields.ambulanceDiversionState ?? null
      : kind === 'FIRE_STATION' ? dynamicCapacity.fields.stationReadiness ?? null : null;
    return {
      ...facility,
      dynamicCapacity,
      lastKnownOperationalStatus: statusValue === null ? {
        state: 'UNKNOWN', value: null, observedAt: null, source: null,
        reason: 'Static facility mapping does not establish current operational status.'
      } : {
        state: dynamicCapacity.state, value: statusValue, observedAt: dynamicCapacity.lastUpdatedAt,
        source: dynamicCapacity.source, reason: dynamicCapacity.reason
      }
    };
  }));
}

export function responseDecisionContext(normalized, options = {}) {
  const operational = ['VERIFIED_CURRENT', 'verified'].includes(String(normalized?.truthState ?? normalized?.operationalTruth?.classification ?? normalized?.truthStage ?? ''));
  const source = options.decisionContext ?? {};
  return {
    fireCapacityRequired: source.fireCapacityRequired ?? operational,
    medicalCapacityRequired: source.medicalCapacityRequired ?? operational,
    fireDecision: source.fireDecision,
    medicalDecision: source.medicalDecision,
    requiredFacilityKinds: source.requiredFacilityKinds,
    resourceDemand: source.resourceDemand,
    currentCommitments: source.currentCommitments,
    stagingConstraints: source.stagingConstraints,
    coverageTradeoffs: source.coverageTradeoffs,
    medicalSurgeInput: source.medicalSurgeInput,
    fireResponseSurgeInput: source.fireResponseSurgeInput
  };
}
