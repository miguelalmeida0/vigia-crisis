import { semanticHash } from '../intelligence/shared.mjs';
import {
  CONFIRMED_CAPACITY_STATES, finiteCount, textOrNull,
} from './capacity-contract.mjs';

export function facilitiesInside(facilities, minutes) {
  const matched = facilities.filter((facility) => facility.reachability?.state === 'ROUTED' && facility.reachability.travelTimeMinutes <= minutes);
  return { minutes, count: matched.length, facilityIds: matched.map((facility) => facility.id) };
}

export function hasCurrentCapacityReport(facility) {
  return CONFIRMED_CAPACITY_STATES.has(facility.dynamicCapacity?.state);
}

export function hasKnownFireCapacity(facility) {
  if (!hasCurrentCapacityReport(facility)) return false;
  const values = facility.dynamicCapacity.fields ?? {};
  return [values.crewsAvailable, values.wildfireCrewsAvailable, values.enginesAvailable, values.tankersAvailable]
    .some((value) => finiteCount(value) !== null);
}

export function hasAvailableFireCapacity(facility) {
  if (!CONFIRMED_CAPACITY_STATES.has(facility.dynamicCapacity?.state)) return false;
  const values = facility.dynamicCapacity.fields ?? {};
  return [values.crewsAvailable, values.wildfireCrewsAvailable, values.enginesAvailable, values.tankersAvailable].some((value) => Number(value) > 0);
}

export function hasKnownHospitalCapacity(facility) {
  if (!hasCurrentCapacityReport(facility)) return false;
  const values = facility.dynamicCapacity.fields ?? {};
  return typeof values.acceptingPatients === 'boolean'
    || [values.bedsAvailable, values.icuAvailableBeds].some((value) => finiteCount(value) !== null)
    || ['CLOSED', 'DIVERTING'].includes(String(values.emergencyDepartmentStatus ?? values.ambulanceDiversionState ?? '').toUpperCase());
}

export function hasAvailableHospitalCapacity(facility) {
  if (!hasCurrentCapacityReport(facility)) return false;
  const values = facility.dynamicCapacity.fields ?? {};
  return values.acceptingPatients === true || Number(values.bedsAvailable) > 0 || Number(values.icuAvailableBeds) > 0;
}

export function responseCapabilityQualified(facility) {
  if (facility.kind === 'HOSPITAL') {
    return facility.dynamicCapacity?.fields?.acceptingPatients === true
      || facility.staticCapability?.emergencyDepartment?.value === true;
  }
  if (facility.kind === 'FIRE_STATION') {
    return Number(facility.dynamicCapacity?.fields?.wildfireCrewsAvailable) > 0
      || facility.staticCapability?.wildfireCapability?.value === true;
  }
  return facilityCapacityAvailability(facility) === 'CONFIRMED_AVAILABLE';
}

export function knownCapacityFor(facility) {
  if (!hasCurrentCapacityReport(facility)) return false;
  if (facility.kind === 'HOSPITAL') return hasKnownHospitalCapacity(facility);
  if (facility.kind === 'FIRE_STATION') return hasKnownFireCapacity(facility);
  return Object.values(facility.dynamicCapacity?.fields ?? {}).some((value) =>
    value !== null && value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0));
}

export function availableCapacityFor(facility) {
  if (!knownCapacityFor(facility)) return false;
  return facilityCapacityAvailability(facility) === 'CONFIRMED_AVAILABLE';
}

const AVAILABLE_RESOURCE_FIELDS = Object.freeze({
  HOSPITAL: Object.freeze({ BEDS: 'bedsAvailable', ICU_BEDS: 'icuAvailableBeds', SURGE_SPACES: 'estimatedSurgeCapacity' }),
  FIRE_STATION: Object.freeze({ WILDFIRE_CREWS: 'wildfireCrewsAvailable', CREWS: 'crewsAvailable', ENGINES: 'enginesAvailable', TANKERS: 'tankersAvailable', COMMAND_UNITS: 'commandVehiclesAvailable', SPECIALIST_TEAMS: 'specialistTeamsAvailable' }),
  EMS_BASE: Object.freeze({ UNITS: 'unitsAvailable', CREWS: 'crewsAvailable' }),
  CIVIL_PROTECTION: Object.freeze({ TEAMS: 'teamsAvailable', VEHICLES: 'vehiclesAvailable' }),
  POLICE: Object.freeze({ UNITS: 'unitsAvailable', TEAMS: 'teamsAvailable' }),
  SHELTER: Object.freeze({ SPACES: 'spacesAvailable' }),
  WATER_POINT: Object.freeze({ TANKER_FILL_POINTS: 'tankerFillPointsAvailable', WATER_LITRES: 'waterAvailableLitres' }),
  AIR_SUPPORT_BASE: Object.freeze({ AIRCRAFT: 'aircraftAvailable', CREWS: 'crewsAvailable' })
});

export function availableQuantitiesFor(facility) {
  const fields = facility.dynamicCapacity?.fields ?? {};
  return Object.fromEntries(Object.entries(AVAILABLE_RESOURCE_FIELDS[facility.kind] ?? {}).flatMap(([resourceType, field]) => {
    const quantity = finiteCount(fields[field]);
    return quantity === null ? [] : [[resourceType, quantity]];
  }));
}

export function committedQuantitiesFor(facility) {
  const fields = facility.dynamicCapacity?.fields ?? {}, crewsAssigned = finiteCount(fields.crewsAssigned);
  return crewsAssigned === null ? {} : { CREWS: crewsAssigned, WILDFIRE_CREWS: crewsAssigned };
}

export function availableQuantityFor(facility) {
  const values = Object.values(availableQuantitiesFor(facility));
  return values.length ? Math.max(...values) : null;
}

export function candidateCapabilities(facility) {
  return Object.entries(facility.staticCapability ?? {}).filter(([, value]) => value?.value === true).map(([key]) => key).sort();
}

export function candidateConstraints(facility) {
  const source = {
    sourceId: textOrNull(facility.dynamicCapacity?.source?.name ?? facility.provenance?.provider),
    reference: textOrNull(facility.dynamicCapacity?.source?.reference ?? facility.provenance?.sourceRecordId ?? facility.provenance?.archiveSha256),
  };
  const reported = Array.isArray(facility.dynamicCapacity?.fields?.constraints) ? facility.dynamicCapacity.fields.constraints : [];
  const constraints = reported.map((description, index) => ({ constraintId: semanticHash('response-candidate-constraint', { facilityId: facility.id, description, index }).slice(0, 52), state: 'REQUIRES_REVIEW', description, source, truthBoundary: 'An unstructured reported constraint cannot be treated as cleared by the optimizer.' }));
  const closureState = String(facility.reachability?.roadClosureImpact?.state ?? '').toUpperCase();
  if (['BLOCKED', 'CLOSED', 'UNSAFE', 'PROHIBITED'].includes(closureState)) constraints.push({ constraintId: semanticHash('response-candidate-constraint', { facilityId: facility.id, closureState }).slice(0, 52), state: closureState, description: 'The current routed path is constrained by governed road context.', source: facility.reachability?.source ?? null });
  return constraints;
}

export function facilityCapacityAvailability(facility) {
  if (!hasCurrentCapacityReport(facility)) return 'UNKNOWN';
  if (facility.kind === 'HOSPITAL') return hasAvailableHospitalCapacity(facility) ? 'CONFIRMED_AVAILABLE' : 'CONFIRMED_NO_AVAILABLE_CAPACITY';
  if (facility.kind === 'FIRE_STATION') return hasAvailableFireCapacity(facility) ? 'CONFIRMED_AVAILABLE' : 'CONFIRMED_NO_AVAILABLE_CAPACITY';
  const values = Object.values(facility.dynamicCapacity?.fields ?? {}).filter((value) => value !== null && value !== undefined && value !== '' && !Array.isArray(value));
  const numeric = values.filter((value) => (typeof value === 'number' || typeof value === 'string') && Number.isFinite(Number(value))).map(Number);
  if (values.includes(true) || numeric.some((value) => value > 0)) return 'CONFIRMED_AVAILABLE';
  if (values.includes(false) || numeric.some((value) => value === 0)) return 'CONFIRMED_NO_AVAILABLE_CAPACITY';
  return 'UNKNOWN';
}

