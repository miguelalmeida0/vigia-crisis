import { immutable, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';

export const COMPARTMENT_DIMENSIONS = Object.freeze(['organization', 'region', 'incident', 'resource', 'classification', 'rights', 'actionClass', 'principal', 'device', 'session']);
export const ACCESS_OPERATIONS = Object.freeze(['READ', 'READ_PROPERTY', 'EXPORT', 'EXPLORE_LINEAGE', 'EXECUTE_ACTION']);
const CLASSIFICATION_RANK = Object.freeze({ PUBLIC: 0, PARTNER: 1, SENSITIVE: 2, RESTRICTED: 3 });
const RIGHTS = Object.freeze({ READ: 'view', READ_PROPERTY: 'view', EXPORT: 'export', EXPLORE_LINEAGE: 'lineage', EXECUTE_ACTION: 'execute' });
const list = (value) => uniqueSorted(Array.isArray(value) ? value.map(String) : []);
const covers = (allowed, value) => allowed.includes('*') || allowed.includes(value);
const required = (value, code) => { const text = String(value ?? '').trim(); if (!text) throw new Error(code); return text; };

export function createResourceMarking(input = {}) {
  const classification = String(input.classification ?? '').toUpperCase();
  if (!(classification in CLASSIFICATION_RANK)) throw new Error('compartment_classification_invalid');
  const rights = { view: list(input.rights?.view), export: list(input.rights?.export), lineage: list(input.rights?.lineage), execute: list(input.rights?.execute) };
  if (!rights.view.length) throw new Error('compartment_view_right_required');
  const core = {
    schemaVersion: 'vigia.resource-marking.v1', organizationId: required(input.organizationId, 'compartment_organization_required'),
    regionId: required(input.regionId, 'compartment_region_required'), incidentId: required(input.incidentId, 'compartment_incident_required'),
    resourceId: required(input.resourceId, 'compartment_resource_required'), classification, rights,
    actionClasses: list(input.actionClasses), propertyMarkings: Object.fromEntries(Object.entries(input.propertyMarkings ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => [name, { classification: String(value.classification ?? classification).toUpperCase(), view: list(value.view ?? rights.view), export: list(value.export ?? rights.export) }])),
  };
  for (const value of Object.values(core.propertyMarkings)) if (!(value.classification in CLASSIFICATION_RANK)) throw new Error('compartment_property_classification_invalid');
  return immutable({ ...core, fingerprint: semanticHash('resource-marking', core) });
}

export function createAccessContext(input = {}) {
  const clearance = String(input.clearance ?? '').toUpperCase();
  if (!(clearance in CLASSIFICATION_RANK)) throw new Error('compartment_clearance_invalid');
  const core = {
    schemaVersion: 'vigia.access-context.v1', principalId: required(input.principalId, 'compartment_principal_required'),
    deviceId: required(input.deviceId, 'compartment_device_required'), sessionId: required(input.sessionId, 'compartment_session_required'),
    organizations: list(input.organizations), regions: list(input.regions), incidents: list(input.incidents), resources: list(input.resources),
    rights: list(input.rights), actionClasses: list(input.actionClasses), clearance,
    principalState: input.principalState ?? 'ACTIVE', deviceState: input.deviceState ?? 'ATTESTED', sessionState: input.sessionState ?? 'ACTIVE',
    validFrom: new Date(input.validFrom ?? '1970-01-01T00:00:00.000Z').toISOString(), validUntil: new Date(input.validUntil ?? '9999-12-31T23:59:59.999Z').toISOString(),
    revokedAt: input.revokedAt ? new Date(input.revokedAt).toISOString() : null,
  };
  if (![core.validFrom, core.validUntil].every((value) => Number.isFinite(Date.parse(value))) || Date.parse(core.validUntil) <= Date.parse(core.validFrom)) throw new Error('compartment_context_time_invalid');
  return immutable({ ...core, fingerprint: semanticHash('access-context', core) });
}

export function authorizeCompartment({ context, marking, operation = 'READ', property = null, actionClass = null, at = '1970-01-01T00:00:00.000Z' } = {}) {
  const reasons = [], evaluatedAt = new Date(at).toISOString(), normalized = String(operation).toUpperCase();
  if (!ACCESS_OPERATIONS.includes(normalized)) throw new Error('compartment_operation_invalid');
  if (!context?.fingerprint) reasons.push('ACCESS_CONTEXT_MISSING');
  if (!marking?.fingerprint) reasons.push('RESOURCE_MARKING_MISSING');
  if (reasons.length) return immutable({ allowed: false, state: 'DENIED', operation: normalized, property, actionClass, reasons, evaluatedAt });
  if (context.principalState !== 'ACTIVE') reasons.push('PRINCIPAL_NOT_ACTIVE');
  if (context.deviceState !== 'ATTESTED') reasons.push('DEVICE_NOT_ATTESTED');
  if (context.sessionState !== 'ACTIVE') reasons.push('SESSION_NOT_ACTIVE');
  if (Date.parse(evaluatedAt) < Date.parse(context.validFrom) || Date.parse(evaluatedAt) >= Date.parse(context.validUntil)) reasons.push('SESSION_OUTSIDE_VALIDITY');
  if (context.revokedAt && Date.parse(context.revokedAt) <= Date.parse(evaluatedAt)) reasons.push('AUTHORITY_REVOKED');
  if (!covers(context.organizations, marking.organizationId)) reasons.push('ORGANIZATION_SCOPE_MISMATCH');
  if (!covers(context.regions, marking.regionId)) reasons.push('REGION_SCOPE_MISMATCH');
  if (!covers(context.incidents, marking.incidentId)) reasons.push('INCIDENT_SCOPE_MISMATCH');
  if (!covers(context.resources, marking.resourceId)) reasons.push('RESOURCE_SCOPE_MISMATCH');
  let classification = marking.classification, requiredPrincipals = marking.rights[RIGHTS[normalized]] ?? [];
  if (property) {
    const propertyMarking = marking.propertyMarkings[property];
    if (!propertyMarking) reasons.push('PROPERTY_MARKING_MISSING');
    else { classification = propertyMarking.classification; requiredPrincipals = propertyMarking[normalized === 'EXPORT' ? 'export' : 'view']; }
  }
  if (CLASSIFICATION_RANK[context.clearance] < CLASSIFICATION_RANK[classification]) reasons.push('CLASSIFICATION_CLEARANCE_INSUFFICIENT');
  if (!requiredPrincipals.length || (!requiredPrincipals.includes('*') && !requiredPrincipals.includes(context.principalId) && !requiredPrincipals.some((right) => context.rights.includes(right)))) reasons.push('RIGHTS_MARKING_DENIED');
  if (normalized === 'EXECUTE_ACTION') {
    const action = String(actionClass ?? '');
    if (!action || !covers(marking.actionClasses, action) || !covers(context.actionClasses, action)) reasons.push('ACTION_CLASS_DENIED');
  }
  const core = { schemaVersion: 'vigia.compartment-authorization.v1', allowed: reasons.length === 0, state: reasons.length ? 'DENIED' : 'AUTHORIZED', operation: normalized, property, actionClass, principalId: context.principalId, resourceId: marking.resourceId, evaluatedAt, reasons: uniqueSorted(reasons), dimensionsEvaluated: COMPARTMENT_DIMENSIONS };
  return immutable({ ...core, decisionFingerprint: semanticHash('compartment-authorization', core) });
}

export function redactUnauthorizedProperties(value, { context, marking, operation = 'READ_PROPERTY', at } = {}) {
  return Object.fromEntries(Object.entries(value ?? {}).filter(([property]) => !marking.propertyMarkings[property] || authorizeCompartment({ context, marking, operation, property, at }).allowed));
}
