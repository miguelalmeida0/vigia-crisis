const iso = (value) => Number.isFinite(Date.parse(value ?? ''))
  ? new Date(value).toISOString()
  : null;

const addMinutes = (value, minutes) => value
  ? new Date(Date.parse(value) + minutes * 60_000).toISOString()
  : null;

export function recommendationValidity(facility) {
  const routeCheckedAt = iso(facility?.reachability?.checkedAt);
  const capacityObservedAt = iso(facility?.dynamicCapacity?.lastUpdatedAt);
  const capacityNextUpdate = iso(facility?.dynamicCapacity?.nextExpectedUpdateAt);
  const routeExpiry = addMinutes(routeCheckedAt, 15);
  const capacityExpiry = capacityObservedAt
    ? capacityNextUpdate ?? addMinutes(capacityObservedAt, 30)
    : null;
  const expiries = [routeExpiry, capacityExpiry].filter(Boolean).sort();
  const validUntil = expiries[0] ?? null;
  return {
    validFrom: [routeCheckedAt, capacityObservedAt].filter(Boolean).sort().at(-1) ?? null,
    validUntil,
    nextInvalidatingCondition: 'A route, capacity, incident-demand, commitment, staging-safety, or source-admission change invalidates this recommendation.',
    nextSourceUpdate: capacityNextUpdate,
    freshnessRequirement: {
      routeMaximumAgeMinutes: 15,
      capacityMaximumAgeMinutes: 30,
      rule: 'The recommendation expires at the earliest governing support deadline; a passive read never extends it.'
    },
    supportEpoch: {
      routeCheckedAt,
      capacityObservedAt,
      capacityReportId: facility?.dynamicCapacity?.reportId ?? facility?.dynamicCapacity?.source?.reference ?? null
    }
  };
}

export function recommendationReviewState(validity, generatedAt) {
  return Number.isFinite(Date.parse(validity?.validUntil ?? ''))
    && Date.parse(validity.validUntil) > Date.parse(generatedAt)
    ? 'PROPOSED_FOR_COMMAND_REVIEW'
    : 'WITHHELD_STALE_OR_UNTIMED_SUPPORT';
}
