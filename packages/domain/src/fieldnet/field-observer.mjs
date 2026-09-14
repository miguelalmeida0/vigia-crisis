import { validIso } from './contracts.mjs';
import {
  FIELD_OBSERVER_CLASSES,
  FIELD_OBSERVER_VERIFICATION_STATES,
  enumValue,
  noDefaultPii,
  opaqueId,
  requiredText
} from './field-report-validation.mjs';

export function createFieldObserver(input = {}, { now = new Date() } = {}) {
  const observerClass = enumValue(input.observerClass, new Set(FIELD_OBSERVER_CLASSES), 'field_observer_class_invalid');
  const verificationState = enumValue(input.verificationState ?? 'UNVERIFIED', new Set(FIELD_OBSERVER_VERIFICATION_STATES), 'field_observer_verification_state_invalid');
  if (observerClass === 'PUBLIC' && verificationState !== 'UNVERIFIED') throw new Error('public_observer_cannot_self_attest');
  if (['IDENTITY_ATTESTED', 'ROLE_ATTESTED'].includes(verificationState) && (!input.attestationReference || !input.attestedBy || !input.attestedAt)) throw new Error('field_observer_attestation_required');
  const registeredAt = validIso(input.registeredAt ?? now, 'field_observer_registered_at_invalid');
  const attestedAt = input.attestedAt ? validIso(input.attestedAt, 'field_observer_attested_at_invalid') : null;
  if (attestedAt && Date.parse(attestedAt) > Date.parse(registeredAt)) throw new Error('field_observer_attestation_after_registration');
  const observer = {
    schemaVersion: 'vigia.field-observer.v1',
    observerId: opaqueId(input.observerId, 'field_observer_id_required'),
    observerClass,
    verificationState,
    trustBand: verificationState === 'ROLE_ATTESTED' ? 'TRUSTED_ROLE_ATTESTED' : verificationState === 'IDENTITY_ATTESTED' ? 'IDENTIFIED_ROLE_UNVERIFIED' : verificationState === 'SUSPENDED' ? 'SUSPENDED' : 'UNVERIFIED',
    organizationId: input.organizationId ? opaqueId(input.organizationId, 'field_observer_organization_id_invalid') : null,
    attestationReference: input.attestationReference ? requiredText(input.attestationReference, 'field_observer_attestation_reference_invalid', 240) : null,
    attestedBy: input.attestedBy ? opaqueId(input.attestedBy, 'field_observer_attested_by_invalid') : null,
    attestedAt,
    registeredAt,
    active: input.active !== false && verificationState !== 'SUSPENDED',
    privacyClassification: 'OPAQUE_OPERATIONAL_IDENTITY_NO_PII'
  };
  noDefaultPii(observer);
  return Object.freeze(observer);
}
