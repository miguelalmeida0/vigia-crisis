import { validIso } from './contracts.mjs';

export const FIELD_REPORT_TYPES = Object.freeze([
  'FIRE_SMOKE', 'ROAD_ACCESS', 'COMMUNITY_STATUS', 'RESOURCE_STATUS', 'INFRASTRUCTURE',
  'FIELD_BOUNDARY_POINT', 'PROTECTION_ACK', 'OTHER', 'HOSPITAL_CAPACITY_UPDATE',
  'FIRE_STATION_CAPACITY_UPDATE'
]);

export const FIELD_OBSERVER_CLASSES = Object.freeze([
  'AUTHORIZED_RESPONDER', 'MUNICIPAL_OPERATOR', 'UTILITY_OPERATOR', 'TRAINED_VOLUNTEER',
  'RESEARCH_PARTNER', 'PUBLIC', 'AUTOMATED_SENSOR'
]);

export const FIELD_OBSERVER_VERIFICATION_STATES = Object.freeze([
  'UNVERIFIED', 'IDENTITY_ATTESTED', 'ROLE_ATTESTED', 'SUSPENDED'
]);

export const FIELD_TASK_ACKNOWLEDGEMENT_DISPOSITIONS = Object.freeze([
  'ACCEPTED', 'DECLINED_UNSAFE', 'DECLINED_UNAVAILABLE'
]);

export const CONNECTIVITY_STATES = new Set(['ONLINE', 'OFFLINE', 'DEGRADED']);
export const ACK_SAFETY_STATES = new Set(['SAFE_TO_PROCEED', 'NOT_SAFE', 'CANNOT_ASSESS']);
export const PUBLIC_SAFE_MODES = new Set(['REMOTE_ONLY']);
export const SAFE_ZONE_MODES = new Set(['REMOTE_ONLY', 'KNOWN_SAFE_POINT', 'DO_NOT_APPROACH_HAZARD', 'OPERATIONALLY_ASSESSED']);

const PII_KEY_NAMES = new Set([
  'firstname', 'lastname', 'fullname', 'personname', 'staffnames', 'doctornames', 'nursenames',
  'personalphone', 'phonenumber', 'mobilephone', 'email', 'emailaddress', 'homeaddress',
  'personid', 'employeeid', 'individualschedule', 'staffschedule', 'personalcontact', 'contactdetails'
]);
const SENSITIVE_FREE_TEXT_KEYS = new Set(['note', 'notes', 'constraint', 'constraints', 'details', 'instruction', 'reason']);
const EMAIL_PATTERN = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/i;
const PHONE_PATTERN = /(?:^|\D)(?:\+?\d[\d ().-]{7,}\d)(?:\D|$)/;

export function requiredText(value, code, maxLength = 240) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(code);
  if (text.length > maxLength) throw new Error(`${code}_too_long`);
  return text;
}

export function optionalText(value, code, maxLength = 500) {
  if (value === undefined || value === null || value === '') return null;
  return requiredText(value, code, maxLength);
}

export function opaqueId(value, code) {
  const id = requiredText(value, code, 160);
  if (/\s|@/.test(id)) throw new Error(`${code}_must_be_opaque`);
  return id;
}

export function assertObject(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value;
}

export function assertAllowedKeys(value, allowed, code) {
  const unsupported = Object.keys(value).filter((key) => !allowed.has(key));
  if (unsupported.length) throw Object.assign(new Error(code), { details: { fields: unsupported.sort() } });
}

export function noDefaultPii(value, path = [], depth = 0) {
  if (depth > 10) throw new Error('field_report_payload_too_deep');
  if (Array.isArray(value)) {
    if (value.length > 100) throw new Error('field_report_array_too_large');
    value.forEach((entry, index) => noDefaultPii(entry, [...path, String(index)], depth + 1));
    return;
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && path.some((part) => SENSITIVE_FREE_TEXT_KEYS.has(String(part).toLowerCase()))) {
      if (EMAIL_PATTERN.test(value) || PHONE_PATTERN.test(value)) throw new Error('field_report_pii_rejected');
    }
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (PII_KEY_NAMES.has(normalized)) throw Object.assign(new Error('field_report_pii_field_rejected'), { details: { field: [...path, key].join('.') } });
    noDefaultPii(nested, [...path, key], depth + 1);
  }
}

export function enumValue(value, allowed, code) {
  const normalized = String(value ?? '').toUpperCase();
  if (!allowed.has(normalized)) throw new Error(code);
  return normalized;
}

export function nullableInteger(value, code) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 0) throw new Error(code);
  return numeric;
}

export function nullableNumber(value, code) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) throw new Error(code);
  return numeric;
}

export function optionalIso(value, code) {
  return value === undefined || value === null || value === '' ? null : validIso(value, code);
}

export function textList(value, code, maxItems = 30) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(code);
  return [...new Set(value.map((item) => requiredText(item, code, 160)))];
}

export function countMap(value, code, allowedKeys = null) {
  if (value === undefined || value === null) return {};
  assertObject(value, code);
  const entries = Object.entries(value);
  if (entries.length > 20) throw new Error(code);
  return Object.fromEntries(entries.map(([key, count]) => {
    const normalized = requiredText(key, code, 80).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    if (allowedKeys && !allowedKeys.has(normalized)) throw Object.assign(new Error(code), { details: { field: key } });
    return [normalized, nullableInteger(count, code)];
  }));
}

export function point(value, code = 'field_task_location_invalid') {
  if (value === undefined || value === null) return null;
  if (value?.type !== 'Point' || !Array.isArray(value.coordinates) || value.coordinates.length !== 2 || !value.coordinates.every(Number.isFinite)) throw new Error(code);
  const [longitude, latitude] = value.coordinates;
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) throw new Error(code);
  return { type: 'Point', coordinates: [longitude, latitude] };
}

export function mediaReferences(value, observedAt) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 6) throw new Error('field_report_media_references_invalid');
  return value.map((item) => {
    assertObject(item, 'field_report_media_reference_invalid');
    assertAllowedKeys(item, new Set(['kind', 'evidenceHash', 'contentType', 'byteLength', 'capturedAt']), 'field_report_media_reference_field_unsupported');
    const evidenceHash = requiredText(item.evidenceHash, 'field_report_media_evidence_hash_required', 80);
    if (!/^sha256:[a-f0-9]{64}$/.test(evidenceHash)) throw new Error('field_report_media_evidence_hash_invalid');
    return {
      kind: enumValue(item.kind, new Set(['PHOTO', 'VIDEO', 'AUDIO', 'DOCUMENT']), 'field_report_media_kind_invalid'),
      evidenceHash,
      contentType: optionalText(item.contentType, 'field_report_media_content_type_invalid', 120),
      byteLength: nullableInteger(item.byteLength, 'field_report_media_byte_length_invalid'),
      capturedAt: validIso(item.capturedAt ?? observedAt, 'field_report_media_timestamp_invalid')
    };
  });
}

export function assertNoDefaultFieldPii(value) {
  noDefaultPii(value);
  return true;
}
