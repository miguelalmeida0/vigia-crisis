function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function durationHours(start, end) {
  const a = Date.parse(start); const b = Date.parse(end);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, (b - a) / 3_600_000) : null;
}

export function computeOutcomeMetrics(state) {
  const accepted = (state.evidenceRequests ?? []).filter((item) => item.state === 'accepted');
  const remediations = state.interventions ?? [];
  const closed = remediations.filter((item) => item.state === 'closed');
  const confirmationHours = accepted.map((item) => durationHours(item.createdAt, item.resolvedAt)).filter(Number.isFinite);
  const remediationHours = closed.map((item) => durationHours(item.createdAt, item.closedAt ?? item.updatedAt)).filter(Number.isFinite);
  return {
    verifiedHazards: (state.hazards ?? []).filter((item) => item.state === 'verified_hazard').length,
    openActions: remediations.filter((item) => item.state !== 'closed').length,
    closedActions: closed.length,
    verifiedRemovals: (state.reobservations ?? []).filter((item) => item.outcome === 'verified_removed').length,
    exposureChange: { state: 'UNMEASURED', sampleSize: 0, reason: 'No versioned pre-action and post-action exposure sets are compared.' },
    medianConfirmationHours: median(confirmationHours),
    medianRemediationHours: median(remediationHours),
    closedLoops: closed.filter((item) => item.reobservationId).length
  };
}
