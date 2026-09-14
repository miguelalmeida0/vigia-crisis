import { immutable, isoTime, requiredText, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';

export const ATTESTATION_LEVELS = Object.freeze(['UNKNOWN', 'SOFTWARE', 'HARDWARE_BOUND', 'MEASURED_BOOT']);

export function createDeviceIdentity(input = {}) {
  const core = { schemaVersion: 'vigia.device-identity.v1', id: requiredText(input.id, 'device_identity_required'),
    principalId: requiredText(input.principalId, 'device_principal_required'), organizationId: input.organizationId ? String(input.organizationId) : null,
    hardwareIdentity: requiredText(input.hardwareIdentity, 'hardware_identity_required'), deviceClass: requiredText(input.deviceClass, 'device_class_required').toUpperCase(),
    publicKeyIds: uniqueSorted(input.publicKeyIds), registeredAt: isoTime(input.registeredAt, 'device_registered_at_required'),
    status: String(input.status ?? 'ACTIVE').toUpperCase(), metadata: structuredClone(input.metadata ?? {}) };
  return immutable({ ...core, fingerprint: semanticHash('device-identity', core) });
}

export function createDeviceAttestationPayload(input = {}) {
  const level = String(input.level ?? 'UNKNOWN').toUpperCase();
  if (!ATTESTATION_LEVELS.includes(level)) throw new Error('invalid_attestation_level');
  return immutable({ schemaVersion: 'vigia.device-attestation-claim.v1', deviceId: requiredText(input.deviceId, 'attestation_device_required'),
    hardwareIdentity: requiredText(input.hardwareIdentity, 'attestation_hardware_required'), level,
    measurements: structuredClone(input.measurements ?? {}), firmwareVersion: input.firmwareVersion ? String(input.firmwareVersion) : null,
    bootState: String(input.bootState ?? 'UNKNOWN').toUpperCase(), attestedAt: isoTime(input.attestedAt, 'attested_at_required') });
}

export function evaluateDeviceAttestation({ verification, statement, device, requiredLevel = 'SOFTWARE', principalId, at } = {}) {
  const reasons = [], claim = statement?.payload ?? {}, evaluatedAt = isoTime(at, 'device_evaluation_time_required');
  if (verification?.status !== 'VALID' || statement?.statementType !== 'DEVICE_ATTESTATION') reasons.push('VALID_DEVICE_ATTESTATION_REQUIRED');
  if (!device || device.status !== 'ACTIVE') reasons.push('DEVICE_NOT_ACTIVE');
  if (claim.deviceId !== device?.id || statement?.deviceId !== device?.id) reasons.push('DEVICE_BINDING_MISMATCH');
  if (claim.hardwareIdentity !== device?.hardwareIdentity) reasons.push('HARDWARE_IDENTITY_MISMATCH');
  if (principalId && device?.principalId !== principalId) reasons.push('DEVICE_PRINCIPAL_MISMATCH');
  if (claim.attestedAt > evaluatedAt) reasons.push('ATTESTATION_FROM_FUTURE');
  if (ATTESTATION_LEVELS.indexOf(claim.level) < ATTESTATION_LEVELS.indexOf(requiredLevel)) reasons.push('ATTESTATION_LEVEL_INSUFFICIENT');
  return immutable({ valid: reasons.length === 0, state: reasons.length ? 'STEP_UP_REQUIRED' : 'VALID', level: claim.level ?? 'UNKNOWN', reasons });
}
