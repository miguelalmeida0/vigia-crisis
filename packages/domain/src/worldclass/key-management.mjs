import { immutable, semanticHash } from '../intelligence/shared.mjs';

const required = (value, code) => { const text = String(value ?? '').trim(); if (!text) throw new Error(code); return text; };
export function createTenantKeyReference(input = {}) {
  const core = { schemaVersion: 'vigia.tenant-key-reference.v1', organizationId: required(input.organizationId, 'tenant_key_organization_required'), keyId: required(input.keyId, 'tenant_key_id_required'), provider: required(input.provider, 'tenant_key_provider_required'), algorithm: input.algorithm ?? 'AES-256-GCM', version: Number(input.version ?? 1), state: input.state ?? 'ACTIVE', createdAt: new Date(input.createdAt).toISOString(), rotatedFrom: input.rotatedFrom ?? null, keyMaterialExported: false };
  if (!Number.isSafeInteger(core.version) || core.version < 1) throw new Error('tenant_key_version_invalid');
  return immutable({ ...core, fingerprint: semanticHash('tenant-key-reference', core) });
}
export function createKmsAdapter({ id, wrap, unwrap, rotate, health } = {}) {
  if (!id || ![wrap, unwrap, rotate, health].every((item) => typeof item === 'function')) throw new Error('kms_adapter_contract_invalid');
  return Object.freeze({ id, async health() { const result = await health(); if (!['READY', 'DEGRADED', 'UNAVAILABLE'].includes(result?.state)) throw new Error('kms_health_result_invalid'); return immutable({ adapterId: id, ...result, secretsRecorded: false }); }, async wrap(input) { return wrap(input); }, async unwrap(input) { return unwrap(input); }, async rotate(reference) { const result = await rotate(reference); if (!result?.keyId || result.keyMaterial) throw new Error('kms_rotation_result_invalid'); return createTenantKeyReference({ ...result, organizationId: reference.organizationId, provider: id, version: reference.version + 1, createdAt: result.createdAt, rotatedFrom: reference.keyId }); } });
}
