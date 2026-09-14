import { immutable, requiredText, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';

const PRINCIPAL_TYPES = new Set(['HUMAN', 'SERVICE', 'DEVICE', 'CONTROLLER', 'ORGANIZATION']);

export function createOrganization(input = {}) {
  const id = requiredText(input.id, 'organization_id_required');
  const core = { schemaVersion: 'vigia.organization.v1', id, legalName: requiredText(input.legalName, 'organization_name_required'),
    jurisdiction: String(input.jurisdiction ?? 'UNSPECIFIED'), status: String(input.status ?? 'ACTIVE').toUpperCase(), metadata: structuredClone(input.metadata ?? {}) };
  return immutable({ ...core, fingerprint: semanticHash('organization', core) });
}

export function createPrincipal(input = {}) {
  const type = String(input.type ?? '').toUpperCase();
  if (!PRINCIPAL_TYPES.has(type)) throw new Error('invalid_principal_type');
  const core = { schemaVersion: 'vigia.principal.v1', id: requiredText(input.id, 'principal_id_required'), type,
    displayName: requiredText(input.displayName ?? input.id, 'principal_name_required'), organizationIds: uniqueSorted(input.organizationIds),
    attributes: structuredClone(input.attributes ?? {}), status: String(input.status ?? 'ACTIVE').toUpperCase() };
  return immutable({ ...core, fingerprint: semanticHash('principal', core) });
}

export function createRole(input = {}) {
  const core = { schemaVersion: 'vigia.role.v1', id: requiredText(input.id, 'role_id_required'),
    organizationId: requiredText(input.organizationId, 'role_organization_required'), label: requiredText(input.label ?? input.id, 'role_label_required'),
    capabilityTemplates: uniqueSorted(input.capabilityTemplates), metadata: structuredClone(input.metadata ?? {}) };
  return immutable({ ...core, fingerprint: semanticHash('role', core) });
}
