import { createHash } from 'node:crypto';

export const FIELDNET_STATES = Object.freeze(['FULL', 'REGIONAL_DISCONNECTED', 'LOW_BANDWIDTH', 'ISOLATED', 'RECOVERING']);
export const OBSERVATION_TYPES = Object.freeze(['VISUAL_SMOKE', 'VISUAL_FLAME', 'THERMAL_READING', 'WEATHER', 'ROAD_OBSTRUCTION', 'ACCESS_CONDITION', 'FIELD_NOTE', 'FIRE_SMOKE', 'ROAD_ACCESS', 'COMMUNITY_STATUS', 'RESOURCE_STATUS', 'INFRASTRUCTURE', 'FIELD_BOUNDARY_POINT', 'PROTECTION_ACK', 'OTHER', 'HOSPITAL_CAPACITY_UPDATE', 'FIRE_STATION_CAPACITY_UPDATE']);
export const DEVICE_TYPES = Object.freeze(['PHONE', 'THERMAL_SENSOR', 'WEATHER_SENSOR', 'FIELD_SENSOR', 'OTHER_FIELD_DEVICE']);
export const SENSOR_QUALIFICATION_STATES = Object.freeze(['REGISTERED', 'CALIBRATION_UNKNOWN', 'CALIBRATED', 'LOCATION_UNVERIFIED', 'TIME_UNVERIFIED', 'QUALIFIED_FIELD_SENSOR', 'FAILED_QUALITY']);
export const TASK_STATES = Object.freeze(['OPEN', 'ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'BLOCKED', 'EVIDENCE_SUBMITTED', 'COMPLETED', 'CANCELLED']);
export const TRUTH_RELATIONS = Object.freeze(['SUPPORTS', 'CONTRADICTS', 'SUPERSEDES', 'REFINES', 'STALE_RELATIVE_TO', 'LOCAL_ONLY', 'REGIONAL_MATCH', 'UNRELATED', 'UNRESOLVED']);
export const PRIORITY_CLASSES = Object.freeze(['P0_LIFE_SAFETY', 'P1_COMMAND', 'P2_POSITION', 'P3_TASK', 'P4_TELEMETRY', 'P5_THUMBNAIL', 'P6_BULK_MEDIA']);
const CLOCK_QUALITY = new Set(['SYNCED', 'ESTIMATED', 'SKEWED', 'UNKNOWN']);
const CALIBRATION = new Set(['CALIBRATED', 'UNCALIBRATED', 'NOT_APPLICABLE', 'UNKNOWN']);

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function sha256(value) { return `sha256:${createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex')}`; }
export function stableId(prefix, ...parts) { return `${prefix}:${createHash('sha256').update(parts.map(canonical).join('|')).digest('hex').slice(0, 32)}`; }
export function validIso(value, code = 'valid_time_required') { const date = new Date(value); if (!Number.isFinite(date.getTime())) throw new Error(code); return date.toISOString(); }
function required(value, code) { if (value === undefined || value === null || value === '') throw new Error(code); return String(value); }
function point(value) { if (value?.type !== 'Point' || !Array.isArray(value.coordinates) || value.coordinates.length !== 2 || !value.coordinates.every(Number.isFinite)) throw new Error('valid_point_geometry_required'); return structuredClone(value); }

export function createFieldIncidentPackage(input = {}, { maxBytes = 1_048_576 } = {}) {
  const incidentId = required(input.incidentId ?? input.canonicalEventId, 'canonical_event_id_required'), createdAt = validIso(input.createdAt ?? new Date());
  const packageBody = { schemaVersion: 'vigia.field-incident-package.v1', packageId: input.packageId ?? stableId('field-package', incidentId, createdAt, input.lastSyncCursor ?? 'origin'),
    incidentId, canonicalEventId: incidentId, incidentState: input.incidentState ?? {}, physicalObservations: (input.physicalObservations ?? []).slice(0, 40),
    sourceFreshness: input.sourceFreshness ?? {}, offlineMap: input.offlineMap ?? {}, monitoredAssets: (input.monitoredAssets ?? []).slice(0, 100),
    currentAlerts: (input.currentAlerts ?? []).slice(0, 50), openUncertainties: (input.openUncertainties ?? []).slice(0, 50), tasks: (input.tasks ?? []).slice(0, 100),
    measurementDebt: (input.measurementDebt ?? []).slice(0, 25), decisionLedgerTail: (input.decisionLedgerTail ?? []).slice(-100), provenanceReferences: (input.provenanceReferences ?? []).slice(0, 100),
    commandSurvival: input.commandSurvival ? { schemaVersion: 'vigia.field-command-survival-package.v1', events: (input.commandSurvival.events ?? []).slice(-500), exportedAt: validIso(input.commandSurvival.exportedAt ?? createdAt) } : null,
    lastSyncCursor: input.lastSyncCursor ?? null,
    createdAt, sourceNode: String(input.sourceNode ?? 'regional-vigia'), qualification: 'Bounded incident-edge package; not a replacement for the regional canonical event record.' };
  const body = canonical(packageBody), bytes = Buffer.byteLength(body); if (bytes > maxBytes) throw new Error(`incident_package_too_large:${bytes}`);
  return Object.freeze({ ...packageBody, byteLength: bytes, evidenceHash: sha256(body) });
}

export function verifyIncidentPackage(value, { maxBytes = 1_048_576 } = {}) {
  if (value?.schemaVersion !== 'vigia.field-incident-package.v1' || value.incidentId !== value.canonicalEventId) throw new Error('invalid_incident_package');
  const { evidenceHash, byteLength, ...body } = value, calculated = sha256(canonical(body)), bytes = Buffer.byteLength(canonical(body));
  if (evidenceHash !== calculated) throw new Error('incident_package_hash_mismatch'); if (bytes !== byteLength || bytes > maxBytes) throw new Error('incident_package_size_mismatch');
  return true;
}

export function createDevice(input = {}, { now = new Date() } = {}) {
  if (!DEVICE_TYPES.includes(input.deviceType)) throw new Error('invalid_device_type');
  if (input.observer && input.observer.schemaVersion !== 'vigia.field-observer.v1') throw new Error('invalid_field_observer_contract');
  if (input.observer && input.ownerOperator !== input.observer.observerId) throw new Error('device_observer_owner_mismatch');
  return Object.freeze({ schemaVersion: 'vigia.field-device.v1', deviceId: required(input.deviceId, 'device_id_required'), deviceType: input.deviceType,
    hardwareIdentity: required(input.hardwareIdentity, 'hardware_identity_required'), ownerOperator: required(input.ownerOperator, 'owner_operator_required'),
    capabilities: [...new Set(input.capabilities ?? [])], calibrationStatus: CALIBRATION.has(input.calibrationStatus) ? input.calibrationStatus : 'UNKNOWN',
    timeQuality: CLOCK_QUALITY.has(input.timeQuality) ? input.timeQuality : 'UNKNOWN', locationQuality: String(input.locationQuality ?? 'UNKNOWN'),
    trustQualification: String(input.observer?.trustBand ?? input.trustQualification ?? 'UNASSESSED'), observer: input.observer ? structuredClone(input.observer) : null,
    privacyPolicy: input.observer ? 'OPAQUE_OPERATIONAL_IDENTITY_NO_PII' : 'LEGACY_DEVICE_REGISTRATION', lastSeenAt: validIso(input.lastSeenAt ?? now), active: input.active !== false });
}

export function createFieldSensorRegistration(input = {}, { now = new Date(), originNode } = {}) {
  const registeredAt = validIso(input.registeredAt ?? now), sensorId = required(input.sensorId ?? input.deviceId, 'sensor_id_required');
  const hardwareIdentity = required(input.hardwareIdentity, 'hardware_identity_required'), sensorFamily = required(input.sensorFamily, 'sensor_family_required'), measurementType = required(input.measurementType, 'measurement_type_required');
  const unit = required(input.unit, 'sensor_unit_required'), calibration = input.calibration ?? {}, location = input.location ?? {}, time = input.time ?? {};
  const samplingIntervalMs = Number(input.samplingIntervalMs), freshnessContractMs = Number(input.freshnessContractMs);
  const blockers = [];
  const stableHardwareIdentity = input.stableHardwareIdentity === true && input.mode !== 'EXERCISE' && input.mode !== 'TEST';
  if (!stableHardwareIdentity) blockers.push('STABLE_HARDWARE_IDENTITY_REQUIRED');
  const calibrated = calibration.status === 'CALIBRATED' && Boolean(calibration.recordId) && Boolean(calibration.calibratedAt);
  if (!calibrated) blockers.push('CALIBRATION_RECORD_REQUIRED');
  const locationVerified = location.verified === true && location.geometry?.type === 'Point' && Array.isArray(location.geometry.coordinates) && location.geometry.coordinates.every(Number.isFinite);
  if (!locationVerified) blockers.push('VERIFIED_LOCATION_REQUIRED');
  const timeVerified = ['SYNCED', 'VERIFIED'].includes(time.quality) && Boolean(time.source);
  if (!timeVerified) blockers.push('VERIFIED_TIME_REQUIRED');
  if (!Number.isFinite(samplingIntervalMs) || samplingIntervalMs <= 0) blockers.push('SAMPLING_INTERVAL_REQUIRED');
  if (!Number.isFinite(freshnessContractMs) || freshnessContractMs <= 0) blockers.push('FRESHNESS_CONTRACT_REQUIRED');
  if (input.rawPayloadPolicy !== 'PRESERVE') blockers.push('RAW_PAYLOAD_PRESERVATION_REQUIRED');
  if (!input.failureMode?.independentFromRegionalSources) blockers.push('SEPARATE_FAILURE_MODE_REQUIRED');
  if (input.qualityFailure) blockers.push('DECLARED_QUALITY_FAILURE');
  const qualificationTrail = ['REGISTERED', calibrated ? 'CALIBRATED' : 'CALIBRATION_UNKNOWN', ...(locationVerified ? [] : ['LOCATION_UNVERIFIED']), ...(timeVerified ? [] : ['TIME_UNVERIFIED'])];
  const currentQualification = input.qualityFailure ? 'FAILED_QUALITY' : blockers.length ? qualificationTrail.at(-1) : 'QUALIFIED_FIELD_SENSOR';
  if (!SENSOR_QUALIFICATION_STATES.includes(currentQualification)) throw new Error('invalid_sensor_qualification_state');
  if (currentQualification === 'QUALIFIED_FIELD_SENSOR') qualificationTrail.push('QUALIFIED_FIELD_SENSOR');
  if (currentQualification === 'FAILED_QUALITY') qualificationTrail.push('FAILED_QUALITY');
  return Object.freeze({
    schemaVersion: 'vigia.field-sensor-registration.v1', sensorId, deviceId: sensorId, deviceType: input.deviceType ?? 'FIELD_SENSOR', hardwareIdentity, stableHardwareIdentity,
    sensorFamily, measurementType, unit, calibration, location, time, samplingIntervalMs, freshnessContractMs, rawPayloadPolicy: input.rawPayloadPolicy ?? 'REJECT',
    firmware: input.firmware ?? null, model: input.model ?? null, failureMode: input.failureMode ?? null, transport: input.transport ?? 'HTTP_LOCAL_REST', websocketUrl:input.websocketUrl??null, mode: input.mode ?? 'PRODUCTION',
    originNode: required(input.originNode ?? originNode, 'origin_node_required'), ownerOperator: input.ownerOperator ?? 'FieldSensorGateway', capabilities: ['SENSOR_OBSERVATION', `MEASURES_${measurementType}`],
    calibrationStatus: calibrated ? 'CALIBRATED' : 'UNKNOWN', timeQuality: timeVerified ? 'SYNCED' : 'UNKNOWN', locationQuality: locationVerified ? 'VERIFIED' : 'UNVERIFIED',
    trustQualification: currentQualification, currentQualification, qualificationTrail, qualificationBlockers: blockers, physicalFamilyEligible: currentQualification === 'QUALIFIED_FIELD_SENSOR', registeredAt, lastSeenAt: validIso(input.lastSeenAt ?? now), active: input.active !== false
  });
}

export function qualifyProductionFieldSensor({ hardwareInventory = {}, registration = null, heldOutValidation = null, now = new Date() } = {}) {
  const assessedAt = validIso(now), blockers = [];
  if (hardwareInventory.sensorHardware !== 'PRESENT') {
    return Object.freeze({ schemaVersion:'vigia.field-sensor-production-gate.v1', assessedAt, state:'HARDWARE_NOT_PRESENT', physicalFamilyEligible:false, blockers:['HARDWARE_NOT_PRESENT'], hardwareInventory:structuredClone(hardwareInventory), qualification:'No production sensor is inferred from gateway capability or controlled-exercise evidence.' });
  }
  if (!registration || registration.schemaVersion !== 'vigia.field-sensor-registration.v1') blockers.push('GOVERNED_REGISTRATION_REQUIRED');
  if (registration?.stableHardwareIdentity !== true) blockers.push('STABLE_HARDWARE_IDENTITY_REQUIRED');
  if (registration?.calibrationStatus !== 'CALIBRATED') blockers.push('VALID_CALIBRATION_REQUIRED');
  const calibrationUntil = registration?.calibration?.validUntil;
  if (!validTimestampAfter(calibrationUntil, assessedAt)) blockers.push('CURRENT_CALIBRATION_WINDOW_REQUIRED');
  if (registration?.timeQuality !== 'SYNCED') blockers.push('VERIFIED_TIME_REQUIRED');
  if (registration?.locationQuality !== 'VERIFIED') blockers.push('VERIFIED_LOCATION_REQUIRED');
  if (registration?.rawPayloadPolicy !== 'PRESERVE') blockers.push('RAW_PAYLOAD_PRESERVATION_REQUIRED');
  if (registration?.failureMode?.independentFromRegionalSources !== true) blockers.push('SEPARATE_FAILURE_MODE_REQUIRED');
  const ageMs = Date.parse(assessedAt) - Date.parse(registration?.lastSeenAt ?? '');
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > Number(registration?.freshnessContractMs)) blockers.push('FRESHNESS_CONTRACT_NOT_MET');
  const heldOutMeasured = heldOutValidation?.split === 'HELD_OUT' && heldOutValidation?.state === 'MEASURED' && Number(heldOutValidation?.denominator) > 0;
  if (!heldOutMeasured) blockers.push('HELD_OUT_VALIDATION_REQUIRED');
  else if (heldOutValidation.passed !== true) blockers.push('HELD_OUT_VALIDATION_FAILED');
  const state = blockers.length ? 'NOT_QUALIFIED' : 'PRODUCTION_QUALIFIED';
  return Object.freeze({ schemaVersion:'vigia.field-sensor-production-gate.v1', assessedAt, state, physicalFamilyEligible:state === 'PRODUCTION_QUALIFIED', sensorId:registration?.sensorId ?? null, sensorFamily:registration?.sensorFamily ?? null, blockers, gates:{ hardwareIdentity:registration?.stableHardwareIdentity === true, calibrationCurrent:validTimestampAfter(calibrationUntil, assessedAt), timeQuality:registration?.timeQuality ?? 'UNKNOWN', locationQuality:registration?.locationQuality ?? 'UNKNOWN', rawEvidenceRetained:registration?.rawPayloadPolicy === 'PRESERVE', freshnessAgeMs:Number.isFinite(ageMs) ? ageMs : null, independentFailureMode:registration?.failureMode?.independentFromRegionalSources === true, heldOutValidation:heldOutMeasured ? structuredClone(heldOutValidation) : { state:'UNMEASURED' } }, qualification:'A field sensor becomes an independent physical family only after every production gate passes.' });
}

function validTimestampAfter(value, lowerBound) { return Number.isFinite(Date.parse(value ?? '')) && Date.parse(value) > Date.parse(lowerBound); }

export function createFieldObservation(input = {}, { now = new Date(), originNode } = {}) {
  if (!OBSERVATION_TYPES.includes(input.observationType)) throw new Error('invalid_observation_type');
  const receivedAt = validIso(input.receivedAt ?? now), observedAt = validIso(input.observedAt), deviceClockQuality = CLOCK_QUALITY.has(input.deviceClockQuality) ? input.deviceClockQuality : 'UNKNOWN';
  const chronologyAgeMs = Date.parse(receivedAt) - Date.parse(observedAt);
  if (chronologyAgeMs < 0) throw new Error('field_observation_future_timestamp');
  const rawEvidenceHash = required(input.rawEvidenceHash, 'raw_evidence_hash_required'); if (!/^sha256:[a-f0-9]{64}$/.test(rawEvidenceHash)) throw new Error('invalid_raw_evidence_hash');
  const sourceKind = String(input.sourceIdentity?.kind ?? 'HUMAN').toUpperCase(), sensorDerived = sourceKind === 'SENSOR';
  const observation = { schemaVersion: 'vigia.field-observation.v1', observationId: required(input.observationId, 'observation_id_required'), incidentId: required(input.incidentId, 'incident_id_required'),
    sourceIdentity: input.sourceIdentity ?? { kind: 'HUMAN' }, deviceId: required(input.deviceId, 'device_id_required'), observerIdentity: input.observerIdentity ?? null,
    observedAt, receivedAt, deviceClockQuality, geometry: point(input.geometry), horizontalUncertaintyM: Number(input.horizontalUncertaintyM), observationType: input.observationType,
    payload: input.payload ?? {}, evidenceReference: input.evidenceReference ?? null, calibrationState: CALIBRATION.has(input.calibrationState) ? input.calibrationState : sensorDerived ? 'UNKNOWN' : 'NOT_APPLICABLE',
    rawEvidenceHash, freshness: chronologyAgeMs <= Number(input.freshnessContractMs ?? 15 * 60_000) ? 'CURRENT_LOCAL' : 'STALE_AT_RECEIPT', originNode: required(input.originNode ?? originNode, 'origin_node_required'),
    causalMetadata: input.causalMetadata ?? {}, syncState: 'PENDING', physicalFamilyQualification: sensorDerived ? String(input.physicalFamilyQualification ?? 'FIELD_SENSOR_REQUIRES_GOVERNED_INDEPENDENCE_REVIEW') : 'HUMAN_FIELD_REPORT_NOT_PHYSICAL_SENSOR_FAMILY' };
  if (!Number.isFinite(observation.horizontalUncertaintyM) || observation.horizontalUncertaintyM < 0) throw new Error('horizontal_uncertainty_required');
  if (!sensorDerived && !observation.observerIdentity) throw new Error('human_observer_identity_required');
  return Object.freeze(observation);
}

export function createFieldTask(input = {}, { now = new Date() } = {}) {
  const createdAt = validIso(input.createdAt ?? now), state = input.state ?? (input.owner ? 'ASSIGNED' : 'OPEN'); if (!TASK_STATES.includes(state)) throw new Error('invalid_task_state');
  return Object.freeze({ schemaVersion: 'vigia.field-task.v1', taskId: required(input.taskId, 'task_id_required'), incidentId: required(input.incidentId, 'incident_id_required'),
    subject: input.subject ?? {}, requiredAction: required(input.requiredAction, 'required_action_required'), owner: input.owner ?? null, priority: PRIORITY_CLASSES.includes(input.priority) ? input.priority : 'P3_TASK',
    createdAt, dueAt: input.dueAt ? validIso(input.dueAt) : null, acknowledgedAt: null, state, requiredEvidence: input.requiredEvidence ?? [], completionEvidence: [], dependencies: input.dependencies ?? [], version: 1, audit: [] });
}

export function sourceFreshness(source = {}, { now = new Date() } = {}) {
  const lastReceivedAt = source.lastReceivedAt ? validIso(source.lastReceivedAt) : null, ageMs = lastReceivedAt ? Math.max(0, now.getTime() - Date.parse(lastReceivedAt)) : null, contractMs = Number(source.freshnessContractMs);
  return { sourceFamily: source.sourceFamily, lastReceivedAt, ageMs, freshnessContractMs: Number.isFinite(contractMs) ? contractMs : null,
    state: !lastReceivedAt ? 'UNKNOWN' : Number.isFinite(contractMs) && ageMs <= contractMs ? 'LAST_KNOWN_WITHIN_CONTRACT' : 'STALE', qualification: 'Cached regional data is never CURRENT_LOCAL.' };
}

export function priorityDisposition(priority, mode) {
  const rank = PRIORITY_CLASSES.indexOf(priority); if (rank < 0) throw new Error('invalid_priority_class');
  if (mode === 'FULL' || mode === 'RECOVERING') return 'SEND_IMMEDIATELY';
  if (mode === 'LOW_BANDWIDTH') return rank <= 3 ? 'SEND_IMMEDIATELY' : rank <= 4 ? 'BATCH' : 'DEFER';
  return 'QUEUE_LOCAL';
}
