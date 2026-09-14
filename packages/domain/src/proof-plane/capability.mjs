import { immutable, isoTime, requiredText, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';

function normalizedScope(scope = {}) {
  const geography = scope.geography ? structuredClone(scope.geography) : null;
  if (geography && (geography.type !== 'BBox' || !Array.isArray(geography.coordinates) || geography.coordinates.length !== 4 || !geography.coordinates.every(Number.isFinite))) throw new Error('invalid_capability_geography');
  return { organizationId: scope.organizationId ? String(scope.organizationId) : null, incidentIds: uniqueSorted(scope.incidentIds),
    resourceTypes: uniqueSorted(scope.resourceTypes), resourceIds: uniqueSorted(scope.resourceIds), actionClasses: uniqueSorted(scope.actionClasses), geography };
}

export function createCapabilityGrant(input = {}) {
  const core = { schemaVersion: 'vigia.capability-grant.v1', capability: requiredText(input.capability, 'capability_required'),
    scope: normalizedScope(input.scope), validFrom: isoTime(input.validFrom, 'capability_valid_from_required'),
    validUntil: input.validUntil ? isoTime(input.validUntil, 'invalid_capability_valid_until') : null,
    delegable: input.delegable === true, maxDelegationDepth: Math.max(0, Number(input.maxDelegationDepth ?? 0)), constraints: structuredClone(input.constraints ?? {}) };
  if (core.validUntil && core.validUntil <= core.validFrom) throw new Error('invalid_capability_window');
  return immutable({ ...core, id: semanticHash('capability-grant', core) });
}

function allows(values, requested) { return requested == null || values.includes('*') || values.includes(String(requested)); }
function geographicMatch(box, coordinate) {
  if (!coordinate) return true;
  if (!box) return false;
  const [west, south, east, north] = box.coordinates, [longitude, latitude] = coordinate;
  return longitude >= west && longitude <= east && latitude >= south && latitude <= north;
}

export function evaluateCapability(grants = [], request = {}, at) {
  const evaluatedAt = isoTime(at, 'capability_evaluation_time_required'), reasons = [];
  const candidates = grants.filter((grant) => grant?.capability === request.capability);
  if (!candidates.length) return immutable({ allowed: false, state: 'DENIED', reasons: [`MISSING_CAPABILITY:${request.capability}`], matchedGrantId: null });
  for (const grant of candidates) {
    const scope = grant.scope ?? {}, failed = [];
    if (grant.validFrom > evaluatedAt || grant.validUntil && grant.validUntil <= evaluatedAt) failed.push('CAPABILITY_NOT_EFFECTIVE');
    if (scope.organizationId && scope.organizationId !== request.organizationId) failed.push('ORGANIZATION_SCOPE_MISMATCH');
    if (!allows(scope.incidentIds ?? [], request.incidentId)) failed.push('INCIDENT_SCOPE_MISMATCH');
    if (!allows(scope.resourceTypes ?? [], request.resourceType)) failed.push('RESOURCE_TYPE_SCOPE_MISMATCH');
    if (!allows(scope.resourceIds ?? [], request.resourceId)) failed.push('RESOURCE_SCOPE_MISMATCH');
    if (!allows(scope.actionClasses ?? [], request.actionClass)) failed.push('ACTION_CLASS_SCOPE_MISMATCH');
    if (!geographicMatch(scope.geography, request.coordinate)) failed.push('GEOGRAPHIC_SCOPE_MISMATCH');
    if (!failed.length) return immutable({ allowed: true, state: 'AUTHORIZED', reasons: [], matchedGrantId: grant.id });
    reasons.push(...failed);
  }
  return immutable({ allowed: false, state: 'DENIED', reasons: uniqueSorted(reasons), matchedGrantId: null });
}

export function capabilityRequestFingerprint(request = {}) { return semanticHash('capability-request', request); }
