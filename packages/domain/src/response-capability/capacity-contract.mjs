import { immutable } from '../intelligence/shared.mjs';

export const RESPONSE_FACILITY_KINDS = Object.freeze([
  'HOSPITAL',
  'FIRE_STATION',
  'EMS_BASE',
  'CIVIL_PROTECTION',
  'POLICE',
  'PUBLIC_INSTITUTION',
  'SHELTER',
  'WATER_POINT',
  'AIR_SUPPORT_BASE'
]);

export const CAPACITY_TRUTH_STATES = Object.freeze([
  'LIVE_CONFIRMED',
  'DISPATCH_CONFIRMED',
  'PARTNER_REPORTED',
  'FIELD_REPORTED',
  'SCHEDULED_ESTIMATE',
  'STATIC_CAPABILITY',
  'UNKNOWN'
]);

const CAPACITY_FIELDS = Object.freeze({
  HOSPITAL: Object.freeze([
    'bedsAvailable', 'emergencyDepartmentStatus', 'emergencyDepartmentLoad', 'icuAvailability', 'icuAvailableBeds',
    'ambulanceDiversionState', 'activeIncidentCapacity', 'staffingLevel',
    'doctorsOnDuty', 'nursesOnDuty', 'emergencyStaff', 'criticalCareStaff',
    'estimatedSurgeCapacity', 'acceptingPatients', 'ambulanceAccess', 'constraints'
  ]),
  FIRE_STATION: Object.freeze([
    'firefightersOnDuty', 'crewsAvailable', 'crewsAssigned', 'crewSize',
    'wildfireCrewsAvailable',
    'enginesAvailable', 'tankersAvailable', 'commandVehiclesAvailable',
    'specialistTeamsAvailable', 'estimatedMobilizationMinutes',
    'stationReadiness', 'communicationsStatus', 'specialistCapabilities', 'constraints'
  ]),
  EMS_BASE: Object.freeze(['unitsAvailable', 'crewsAvailable', 'estimatedMobilizationMinutes', 'communicationsStatus', 'constraints']),
  CIVIL_PROTECTION: Object.freeze(['teamsAvailable', 'vehiclesAvailable', 'estimatedMobilizationMinutes', 'communicationsStatus', 'constraints']),
  POLICE: Object.freeze(['unitsAvailable', 'teamsAvailable', 'estimatedMobilizationMinutes', 'communicationsStatus', 'constraints']),
  PUBLIC_INSTITUTION: Object.freeze([]),
  SHELTER: Object.freeze(['spacesAvailable', 'acceptingPeople', 'staffingLevel', 'constraints']),
  WATER_POINT: Object.freeze(['waterAvailableLitres', 'tankerFillPointsAvailable', 'accessState', 'constraints']),
  AIR_SUPPORT_BASE: Object.freeze(['aircraftAvailable', 'crewsAvailable', 'flightStatus', 'estimatedMobilizationMinutes', 'constraints'])
});

export const FACILITY_ROUTE_BANDS = Object.freeze({
  HOSPITAL: Object.freeze([15, 30, 45, 60]),
  FIRE_STATION: Object.freeze([10, 20, 30, 45, 60]),
  EMS_BASE: Object.freeze([10, 20, 30, 45, 60]),
  CIVIL_PROTECTION: Object.freeze([15, 30, 45, 60]),
  POLICE: Object.freeze([15, 30, 45, 60]),
  PUBLIC_INSTITUTION: Object.freeze([]),
  SHELTER: Object.freeze([15, 30, 45, 60]),
  WATER_POINT: Object.freeze([15, 30, 45, 60]),
  AIR_SUPPORT_BASE: Object.freeze([15, 30, 45, 60])
});

export const FIRE_SURGE_RESOURCE_TYPES = Object.freeze([
  'engines', 'tankers', 'crews', 'commandUnits', 'medicalSupport', 'waterSupport', 'airSupport'
]);

export const CONFIRMED_CAPACITY_STATES = new Set([
  'LIVE_CONFIRMED', 'DISPATCH_CONFIRMED', 'PARTNER_REPORTED', 'FIELD_REPORTED'
]);

export const finiteCount = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const booleanOrNull = (value) => typeof value === 'boolean' ? value : null;
export const textOrNull = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
export const isoOrNull = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
};

function normalizeCapacityValue(field, value) {
  if (['specialistCapabilities', 'constraints'].includes(field)) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()).slice(0, 30))];
  }
  if (['acceptingPatients', 'acceptingPeople'].includes(field)) {
    if (typeof value === 'boolean') return value;
    if (String(value).toUpperCase() === 'YES') return true;
    if (String(value).toUpperCase() === 'NO') return false;
    return null;
  }
  if (['ambulanceAccess', 'emergencyDepartmentStatus', 'icuAvailability', 'ambulanceDiversionState', 'staffingLevel', 'stationReadiness', 'communicationsStatus', 'accessState', 'flightStatus'].includes(field)) return typeof value === 'boolean' ? value : textOrNull(value);
  return finiteCount(value);
}

function capacityReportValue(report, field) {
  const aliases = {
    emergencyDepartmentStatus: ['emergencyDepartmentStatus', 'edStatus'],
    nextExpectedUpdateAt: ['nextExpectedUpdateAt', 'nextExpectedUpdate'],
    doctorsOnDuty: ['doctorsOnDuty'],
    nursesOnDuty: ['nursesOnDuty'],
    emergencyStaff: ['emergencyStaff'],
    criticalCareStaff: ['criticalCareStaff'],
    crewsAssigned: ['crewsAssigned'],
    commandVehiclesAvailable: ['commandVehiclesAvailable'],
    specialistTeamsAvailable: ['specialistTeamsAvailable']
  };
  for (const key of aliases[field] ?? [field]) if (report[key] !== undefined) return report[key];
  const staffKey = { doctorsOnDuty: 'DOCTORS', nursesOnDuty: 'NURSES', emergencyStaff: 'EMERGENCY_STAFF', criticalCareStaff: 'CRITICAL_CARE_STAFF' }[field];
  if (staffKey && report.staffAvailable?.[staffKey] !== undefined) return report.staffAvailable[staffKey];
  const committedKey = { crewsAssigned: 'CREWS', commandVehiclesAvailable: 'COMMAND_VEHICLES', specialistTeamsAvailable: 'SPECIALIST_TEAMS' }[field];
  if (committedKey && report.alreadyCommittedResources?.[committedKey] !== undefined) return field === 'crewsAssigned' ? report.alreadyCommittedResources[committedKey] : null;
  return undefined;
}

function emptyCapacity(kind, reason = null) {
  return {
    state: 'UNKNOWN',
    truthState: 'UNKNOWN',
    fields: Object.fromEntries((CAPACITY_FIELDS[kind] ?? []).map((field) => [field, null])),
    lastUpdatedAt: null,
    nextExpectedUpdateAt: null,
    source: null,
    confidence: { state: 'UNKNOWN', score: null },
    reason: reason ?? `No admitted current ${kind === 'HOSPITAL' ? 'hospital' : 'response-facility'} capacity report is connected.`
  };
}

/**
 * Converts only explicitly reported aggregate capacity fields. Unknown values
 * remain null and unrecognised/PII fields never enter the projection.
 */
export function normalizeDynamicCapacity(kind, report, { now = new Date(), staleAfterMs = 30 * 60_000 } = {}) {
  if (!report) return immutable(emptyCapacity(kind));
  const reportedState = String(report.state ?? '').toUpperCase().replace('SCHEDULE_ESTIMATE', 'SCHEDULED_ESTIMATE');
  const observedAt = isoOrNull(report.observedAt ?? report.lastUpdatedAt);
  const sourceName = textOrNull(report.source?.name ?? report.source);
  const sourceReference = textOrNull(report.source?.reference ?? report.sourceReference);
  const nowMs = new Date(now).getTime();
  const admitted = report.admitted === true || String(report.admissionState ?? '').toUpperCase() === 'ADMITTED';
  const admissionReference = textOrNull(report.admissionReference);
  if (!CAPACITY_TRUTH_STATES.includes(reportedState) || reportedState === 'UNKNOWN' || !observedAt || !sourceName || !sourceReference || !admitted || !admissionReference || Date.parse(observedAt) > nowMs + 60_000) {
    return immutable(emptyCapacity(kind, 'The capacity report lacks admission, an attributable source/reference, a supported truth state, or a valid non-future observation time.'));
  }
  const ageMs = Math.max(0, nowMs - Date.parse(observedAt));
  const fields = Object.fromEntries((CAPACITY_FIELDS[kind] ?? []).map((field) => [field, normalizeCapacityValue(field, capacityReportValue(report, field))]));
  const stale = ageMs > staleAfterMs;
  return immutable({
    state: stale ? 'STALE' : reportedState,
    truthState: reportedState,
    fields,
    lastUpdatedAt: observedAt,
    nextExpectedUpdateAt: isoOrNull(capacityReportValue(report, 'nextExpectedUpdateAt')),
    source: { name: sourceName, reference: sourceReference, reporterRole: textOrNull(report.reporterRole), admissionReference },
    confidence: {
      state: stale ? 'STALE_SOURCE' : CONFIRMED_CAPACITY_STATES.has(reportedState) ? 'ATTRIBUTABLE_REPORT' : 'ESTIMATE_ONLY',
      score: null
    },
    reason: stale ? `The last capacity report is older than ${Math.round(staleAfterMs / 60_000)} minutes.` : null
  });
}
