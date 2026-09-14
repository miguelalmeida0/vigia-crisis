const text = (value) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
};

const aggregateCount = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const safeOperationalList = (value) => !Array.isArray(value) ? [] : [...new Set(value.map(text).filter(Boolean)
  .filter((item) => !/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(item) && !/(?:^|\D)(?:\+?\d[\d ().-]{7,}\d)(?:\D|$)/.test(item))
  .map((item) => item.slice(0, 160)))].slice(0, 30);

export function hospitalCapacityProjection(answers) {
  return {
    facilityId: text(answers.facilityId), edStatus: answers.edStatus ?? 'UNKNOWN', bedsAvailable: answers.bedsAvailable ?? null,
    icuAvailability: answers.icuAvailability ?? 'UNKNOWN',
    staffAvailable: {
      DOCTORS: aggregateCount(answers.staffAvailable?.DOCTORS), NURSES: aggregateCount(answers.staffAvailable?.NURSES),
      EMERGENCY_STAFF: aggregateCount(answers.staffAvailable?.EMERGENCY_STAFF), CRITICAL_CARE_STAFF: aggregateCount(answers.staffAvailable?.CRITICAL_CARE_STAFF)
    },
    ambulanceAccess: answers.ambulanceAccess ?? 'UNKNOWN', acceptingPatients: answers.acceptingPatients ?? 'UNKNOWN',
    constraints: safeOperationalList(answers.constraints), nextExpectedUpdate: answers.nextExpectedUpdate ?? null
  };
}

export function fireStationCapacityProjection(answers) {
  return {
    facilityId: text(answers.stationId), crewsAvailable: answers.crewsAvailable ?? null, crewSize: answers.crewSize ?? null,
    enginesAvailable: answers.enginesAvailable ?? null, tankersAvailable: answers.tankersAvailable ?? null,
    estimatedMobilizationMinutes: answers.estimatedMobilizationMinutes ?? null,
    commandVehiclesAvailable: aggregateCount(answers.commandVehiclesAvailable), specialistTeamsAvailable: aggregateCount(answers.specialistTeamsAvailable),
    alreadyCommittedResources: { CREWS: aggregateCount(answers.alreadyCommittedResources?.CREWS) },
    specialistCapabilities: safeOperationalList(answers.specialistCapabilities), communicationsStatus: answers.communicationsStatus ?? 'UNKNOWN',
    constraints: safeOperationalList(answers.constraints), nextExpectedUpdate: answers.nextExpectedUpdate ?? null
  };
}
