const REPORT_TYPES = new Set(['report', 'report_update']);

function latestReport(event) {
  return (event.observations ?? [])
    .filter((item) => REPORT_TYPES.has(item.type))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] ?? null;
}

function progression(event) {
  return (event.observations ?? [])
    .filter((item) => REPORT_TYPES.has(item.type))
    .map((item) => ({
      observedAt: item.at,
      status: item.status ?? null,
      personnel: item.resources?.available ? item.resources.operatives ?? null : null,
      groundVehicles: item.resources?.available ? item.resources.ground ?? null : null,
      aircraft: item.resources?.available ? item.resources.aerial ?? null : null
    }));
}

export function responseSnapshot(event) {
  const report = latestReport(event);
  if (!report) return {
    eventId: event.id,
    state: 'unavailable',
    source: null,
    observedAt: null,
    status: null,
    personnel: null,
    groundVehicles: null,
    aircraft: null,
    burnedArea: null,
    officialProgression: [],
    provenance: null,
    limitation: 'No public operational response record is associated with this event.'
  };
  const resourcesAvailable = report.resources?.available === true;
  return {
    eventId: event.id,
    state: resourcesAvailable ? 'available' : 'status_only',
    source: 'ANEPC-derived public operational report',
    observedAt: report.at,
    status: report.status ?? null,
    personnel: resourcesAvailable ? report.resources.operatives ?? null : null,
    groundVehicles: resourcesAvailable ? report.resources.ground ?? null : null,
    aircraft: resourcesAvailable ? report.resources.aerial ?? null : null,
    burnedArea: event.burnedAreaHa ?? report.burnedAreaHa ?? null,
    officialProgression: progression(event),
    provenance: report.provenance ?? null,
    limitation: resourcesAvailable ? null : 'Response resource counts are unavailable from connected sources.'
  };
}
