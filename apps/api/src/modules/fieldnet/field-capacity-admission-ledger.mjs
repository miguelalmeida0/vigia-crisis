import { readFile } from 'node:fs/promises';
import { canonical, sha256, stableId } from '../../../../../packages/domain/src/fieldnet/contracts.mjs';
import { assertNoDefaultFieldPii } from '../../../../../packages/domain/src/fieldnet/field-reports.mjs';

export const FIELD_CAPACITY_ADMISSION_STORE_SCHEMA = 'vigia.field-capacity-admission-ledger.v1';
export const FIELD_CAPACITY_ADMISSION_SCHEMA = 'vigia.field-capacity-admission.v1';
export const FIELD_CAPACITY_REVOCATION_SCHEMA = 'vigia.field-capacity-admission-revocation.v1';
export const FIELD_CAPACITY_ADMISSION_SCOPE = 'AGGREGATE_OPERATIONAL_CAPACITY';
export const FIELD_CAPACITY_AUTHORIZATION_SCOPE = 'FIELD_CAPACITY_ADMISSION';
export const FIELD_CAPACITY_REPORT_TYPES = new Set(['HOSPITAL_CAPACITY_UPDATE', 'FIRE_STATION_CAPACITY_UPDATE']);
export const FIELD_CAPACITY_ENVIRONMENTS = new Set(['LIVE_OPERATIONAL', 'ISOLATED_EXERCISE']);
export const FIELD_CAPACITY_REVOCATION_REASONS = new Set(['SOURCE_RETRACTED', 'INCORRECT_BINDING', 'AUTHORITY_REVOKED', 'SUPERSEDED', 'OTHER_GOVERNED_REASON']);
export const FIELD_CAPACITY_ADMISSION_INPUT = new Set(['incidentId', 'observationId', 'expectedReportType', 'expectedRawEvidenceHash', 'truthEnvironment', 'decisionReference']);
export const FIELD_CAPACITY_REVOCATION_INPUT = new Set(['incidentId', 'observationId', 'truthEnvironment', 'admissionReference', 'reasonCode', 'decisionReference']);

const EMPTY = Object.freeze({ schemaVersion: FIELD_CAPACITY_ADMISSION_STORE_SCHEMA, admissions: {}, revocations: {}, current: {}, audit: [], updatedAt: null });

export function emptyFieldCapacityAdmissionLedger() {
  return structuredClone(EMPTY);
}

export function fieldCapacityOpaque(value, code) {
  const result = typeof value === 'string' ? value.trim() : '';
  if (!result || result.length > 300 || /[\s@|]/.test(result)) throw new Error(code);
  return result;
}

function validOpaque(value) {
  return typeof value === 'string' && value === value.trim() && value.length > 0 && value.length <= 300 && !/[\s@|]/.test(value);
}

export function fieldCapacityIso(value, code) {
  const parsed = new Date(value ?? '');
  if (!Number.isFinite(parsed.getTime())) throw new Error(code);
  return parsed.toISOString();
}

export function fieldCapacityEnvironment(value) {
  const result = String(value ?? '').toUpperCase();
  if (!FIELD_CAPACITY_ENVIRONMENTS.has(result)) throw new Error('field_capacity_truth_environment_invalid');
  return result;
}

export function assertFieldCapacityInput(input, allowed, code) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(code);
  const unsupported = Object.keys(input).filter((key) => !allowed.has(key));
  if (unsupported.length) throw Object.assign(new Error(code), { details: { unsupportedFields: unsupported.sort() } });
  assertNoDefaultFieldPii(input);
}

function withoutHash(value, field) {
  const copy = structuredClone(value);
  delete copy[field];
  return copy;
}

export function fieldCapacityStateKey(truthEnvironment, incidentId, observationId) {
  return `${truthEnvironment}|${incidentId}|${observationId}`;
}

export async function readFieldCapacityAdmissionLedger(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return emptyFieldCapacityAdmissionLedger();
    if (error instanceof SyntaxError) throw new Error('field_capacity_admission_ledger_corrupt');
    throw error;
  }
}

export function verifyFieldCapacityAdmissionLedger(state) {
  const failures = [];
  if (!state || state.schemaVersion !== FIELD_CAPACITY_ADMISSION_STORE_SCHEMA || !state.admissions || !state.revocations || !state.current || !Array.isArray(state.audit)) {
    return { valid: false, failures: ['LEDGER_SCHEMA_INVALID'] };
  }
  for (const [id, record] of Object.entries(state.admissions)) {
    if (id !== record.admissionReference || record.recordHash !== sha256(canonical(withoutHash(record, 'recordHash')))) failures.push(`ADMISSION_HASH_INVALID:${id}`);
    if (record?.schemaVersion !== FIELD_CAPACITY_ADMISSION_SCHEMA || record?.state !== 'ADMITTED' || record?.scope !== FIELD_CAPACITY_ADMISSION_SCOPE || !FIELD_CAPACITY_ENVIRONMENTS.has(record?.truthEnvironment) || !validOpaque(record?.incidentId) || !validOpaque(record?.observationId) || !/^sha256:[a-f0-9]{64}$/.test(record?.sourceEvidenceHash ?? '')) failures.push(`ADMISSION_CONTRACT_INVALID:${id}`);
    if (id !== stableId('field-capacity-admission', record?.truthEnvironment, record?.incidentId, record?.observationId, record?.sourceEvidenceHash)) failures.push(`ADMISSION_IDENTITY_INVALID:${id}`);
  }
  for (const [id, record] of Object.entries(state.revocations)) {
    if (id !== record.revocationReference || record.recordHash !== sha256(canonical(withoutHash(record, 'recordHash')))) failures.push(`REVOCATION_HASH_INVALID:${id}`);
    const admission = state.admissions[record?.admissionReference];
    if (record?.schemaVersion !== FIELD_CAPACITY_REVOCATION_SCHEMA || record?.state !== 'REVOKED' || !FIELD_CAPACITY_ENVIRONMENTS.has(record?.truthEnvironment) || !FIELD_CAPACITY_REVOCATION_REASONS.has(record?.reasonCode) || !validOpaque(record?.incidentId) || !validOpaque(record?.observationId) || !admission) failures.push(`REVOCATION_CONTRACT_INVALID:${id}`);
    if (admission && (record.incidentId !== admission.incidentId || record.observationId !== admission.observationId || record.truthEnvironment !== admission.truthEnvironment)) failures.push(`REVOCATION_BINDING_INVALID:${id}`);
    if (id !== stableId('field-capacity-revocation', record?.admissionReference, record?.reasonCode)) failures.push(`REVOCATION_IDENTITY_INVALID:${id}`);
  }
  let previousHash = null;
  state.audit.forEach((record, index) => {
    if (record.sequence !== index + 1 || record.previousHash !== previousHash || record.auditHash !== sha256(canonical(withoutHash(record, 'auditHash')))) failures.push(`AUDIT_CHAIN_INVALID:${index + 1}`);
    previousHash = record.auditHash;
  });
  for (const [key, value] of Object.entries(state.current)) {
    const admission = state.admissions[value?.admissionReference];
    if (!value || !['ADMITTED', 'REVOKED'].includes(value.state) || !admission) failures.push(`CURRENT_REFERENCE_INVALID:${key}`);
    if (admission && (key !== fieldCapacityStateKey(admission.truthEnvironment, admission.incidentId, admission.observationId) || value.truthEnvironment !== admission.truthEnvironment)) failures.push(`CURRENT_BINDING_INVALID:${key}`);
    if (value?.state === 'REVOKED') {
      const revocation = state.revocations[value.revocationReference];
      if (!revocation) failures.push(`CURRENT_REVOCATION_INVALID:${key}`);
      else if (revocation.admissionReference !== value.admissionReference || revocation.incidentId !== admission?.incidentId || revocation.observationId !== admission?.observationId || revocation.truthEnvironment !== admission?.truthEnvironment) failures.push(`CURRENT_REVOCATION_BINDING_INVALID:${key}`);
    } else if (value?.revocationReference) failures.push(`CURRENT_ADMITTED_REVOCATION_INVALID:${key}`);
  }
  return { valid: failures.length === 0, failures };
}

export function appendFieldCapacityAudit(state, { type, reference, incidentId, observationId, truthEnvironment, principalId, at }) {
  const prior = state.audit.at(-1);
  const record = {
    schemaVersion: 'vigia.field-capacity-admission-audit.v1',
    sequence: Number(prior?.sequence ?? 0) + 1,
    type, reference, incidentId, observationId, truthEnvironment, principalId, at,
    previousHash: prior?.auditHash ?? null
  };
  state.audit.push({ ...record, auditHash: sha256(canonical(record)) });
}
