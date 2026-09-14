import {
  assertAllowedKeys, assertObject, countMap, enumValue, noDefaultPii, nullableInteger,
  nullableNumber, opaqueId, optionalIso, optionalText, requiredText, textList
} from './field-report-validation.mjs';

function normalizeHospitalCapacity(input) {
  assertAllowedKeys(input, new Set([
    'facilityId', 'facilityName', 'edStatus', 'bedsAvailable', 'icuAvailability', 'staffAvailable',
    'ambulanceAccess', 'acceptingPatients', 'constraints', 'nextExpectedUpdate'
  ]), 'hospital_capacity_field_unsupported');
  return {
    facilityId: opaqueId(input.facilityId, 'hospital_capacity_facility_id_required'),
    facilityName: optionalText(input.facilityName, 'hospital_capacity_facility_name_invalid', 180),
    edStatus: enumValue(input.edStatus ?? 'UNKNOWN', new Set(['OPERATIONAL', 'LIMITED', 'DIVERTING', 'CLOSED', 'UNKNOWN']), 'hospital_capacity_ed_status_invalid'),
    bedsAvailable: nullableInteger(input.bedsAvailable, 'hospital_capacity_beds_invalid'),
    icuAvailability: enumValue(input.icuAvailability ?? 'UNKNOWN', new Set(['AVAILABLE', 'LIMITED', 'UNAVAILABLE', 'UNKNOWN']), 'hospital_capacity_icu_invalid'),
    staffAvailable: countMap(input.staffAvailable, 'hospital_capacity_staff_counts_invalid', new Set(['DOCTORS', 'NURSES', 'EMERGENCY_STAFF', 'CRITICAL_CARE_STAFF', 'TOTAL_OPERATIONAL_STAFF'])),
    ambulanceAccess: enumValue(input.ambulanceAccess ?? 'UNKNOWN', new Set(['OPEN', 'RESTRICTED', 'CLOSED', 'UNKNOWN']), 'hospital_capacity_ambulance_access_invalid'),
    acceptingPatients: enumValue(input.acceptingPatients ?? 'UNKNOWN', new Set(['YES', 'NO', 'UNKNOWN']), 'hospital_capacity_accepting_patients_invalid'),
    constraints: textList(input.constraints, 'hospital_capacity_constraints_invalid', 20),
    nextExpectedUpdate: optionalIso(input.nextExpectedUpdate, 'hospital_capacity_next_update_invalid')
  };
}

function normalizeFireStationCapacity(input) {
  assertAllowedKeys(input, new Set([
    'stationId', 'stationName', 'crewsAvailable', 'crewSize', 'enginesAvailable', 'tankersAvailable',
    'specialistCapabilities', 'estimatedMobilizationMinutes', 'alreadyCommittedResources',
    'communicationsStatus', 'constraints', 'nextExpectedUpdate'
  ]), 'fire_station_capacity_field_unsupported');
  return {
    stationId: opaqueId(input.stationId, 'fire_station_capacity_station_id_required'),
    stationName: optionalText(input.stationName, 'fire_station_capacity_station_name_invalid', 180),
    crewsAvailable: nullableInteger(input.crewsAvailable, 'fire_station_capacity_crews_invalid'),
    crewSize: nullableInteger(input.crewSize, 'fire_station_capacity_crew_size_invalid'),
    enginesAvailable: nullableInteger(input.enginesAvailable, 'fire_station_capacity_engines_invalid'),
    tankersAvailable: nullableInteger(input.tankersAvailable, 'fire_station_capacity_tankers_invalid'),
    specialistCapabilities: textList(input.specialistCapabilities, 'fire_station_capacity_specialists_invalid', 30),
    estimatedMobilizationMinutes: nullableNumber(input.estimatedMobilizationMinutes, 'fire_station_capacity_mobilization_invalid'),
    alreadyCommittedResources: countMap(input.alreadyCommittedResources, 'fire_station_capacity_committed_invalid', new Set(['CREWS', 'ENGINES', 'TANKERS', 'COMMAND_VEHICLES', 'SPECIALIST_TEAMS'])),
    communicationsStatus: enumValue(input.communicationsStatus ?? 'UNKNOWN', new Set(['OPERATIONAL', 'DEGRADED', 'UNAVAILABLE', 'UNKNOWN']), 'fire_station_capacity_communications_invalid'),
    constraints: textList(input.constraints, 'fire_station_capacity_constraints_invalid', 20),
    nextExpectedUpdate: optionalIso(input.nextExpectedUpdate, 'fire_station_capacity_next_update_invalid')
  };
}

function normalizeRoadAccess(input) {
  assertAllowedKeys(input, new Set(['roadId', 'roadName', 'accessState', 'vehicleClasses', 'direction', 'constraints', 'alternativeRouteKnown', 'nextExpectedUpdate']), 'road_access_field_unsupported');
  return {
    roadId: opaqueId(input.roadId, 'road_access_road_id_required'),
    roadName: optionalText(input.roadName, 'road_access_road_name_invalid', 180),
    accessState: enumValue(input.accessState, new Set(['PASSABLE', 'RESTRICTED', 'BLOCKED', 'UNKNOWN']), 'road_access_state_invalid'),
    vehicleClasses: textList(input.vehicleClasses, 'road_access_vehicle_classes_invalid', 20),
    direction: enumValue(input.direction ?? 'BOTH', new Set(['BOTH', 'FORWARD', 'REVERSE', 'UNKNOWN']), 'road_access_direction_invalid'),
    constraints: textList(input.constraints, 'road_access_constraints_invalid', 20),
    alternativeRouteKnown: enumValue(input.alternativeRouteKnown ?? 'UNKNOWN', new Set(['YES', 'NO', 'UNKNOWN']), 'road_access_alternative_invalid'),
    nextExpectedUpdate: optionalIso(input.nextExpectedUpdate, 'road_access_next_update_invalid')
  };
}

function normalizeGeneric(reportType, input) {
  assertAllowedKeys(input, new Set(['subjectId', 'status', 'details', 'quantity', 'unit', 'nextExpectedUpdate']), 'field_report_field_unsupported');
  return {
    subjectId: opaqueId(input.subjectId, 'field_report_subject_id_required'),
    status: requiredText(input.status, 'field_report_status_required', 100).toUpperCase(),
    details: optionalText(input.details, 'field_report_details_invalid', 500),
    quantity: nullableNumber(input.quantity, 'field_report_quantity_invalid'),
    unit: optionalText(input.unit, 'field_report_unit_invalid', 40),
    nextExpectedUpdate: optionalIso(input.nextExpectedUpdate, 'field_report_next_update_invalid'),
    reportType
  };
}

export function normalizeStructuredAnswers(reportType, value) {
  const input = assertObject(value, 'field_report_structured_answers_required');
  noDefaultPii(input);
  if (reportType === 'HOSPITAL_CAPACITY_UPDATE') return normalizeHospitalCapacity(input);
  if (reportType === 'FIRE_STATION_CAPACITY_UPDATE') return normalizeFireStationCapacity(input);
  if (reportType === 'ROAD_ACCESS') return normalizeRoadAccess(input);
  return normalizeGeneric(reportType, input);
}

export function reportClaim(reportType, answers) {
  const qualified = (prefix, id) => String(id).startsWith(`${prefix}:`) ? String(id) : `${prefix}:${id}`;
  if (reportType === 'ROAD_ACCESS') return { subjectKey: qualified('road', answers.roadId), claimField: 'accessState', claimValue: answers.accessState };
  if (reportType === 'HOSPITAL_CAPACITY_UPDATE') return { subjectKey: qualified('hospital', answers.facilityId), claimField: 'operationalCapacity', claimValue: answers };
  if (reportType === 'FIRE_STATION_CAPACITY_UPDATE') return { subjectKey: qualified('fire-station', answers.stationId), claimField: 'operationalCapacity', claimValue: answers };
  return { subjectKey: `${reportType.toLowerCase()}:${answers.subjectId}`, claimField: 'reportedStatus', claimValue: answers.status };
}
