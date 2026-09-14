import { immutable, isoTime, requiredText, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';

export function createDelegation(input = {}) {
  const core = { schemaVersion: 'vigia.delegation.v1', delegatorPrincipalId: requiredText(input.delegatorPrincipalId, 'delegator_required'),
    delegatePrincipalId: requiredText(input.delegatePrincipalId, 'delegate_required'), organizationId: requiredText(input.organizationId, 'delegation_organization_required'),
    parentCredentialId: requiredText(input.parentCredentialId, 'parent_credential_required'), grants: structuredClone(input.grants ?? []),
    depth: Math.max(1, Number(input.depth ?? 1)), validFrom: isoTime(input.validFrom, 'delegation_valid_from_required'),
    validUntil: isoTime(input.validUntil, 'delegation_valid_until_required'), purpose: requiredText(input.purpose, 'delegation_purpose_required') };
  if (core.validUntil <= core.validFrom) throw new Error('invalid_delegation_window');
  return immutable({ ...core, id: semanticHash('delegation', core) });
}

function subset(child = [], parent = []) { return parent.includes('*') || !child.includes('*') && child.every((value) => parent.includes(value)); }
function geographySubset(child, parent) {
  if (!child) return true;
  if (!parent) return false;
  const [cw, cs, ce, cn] = child.coordinates, [pw, ps, pe, pn] = parent.coordinates;
  return cw >= pw && cs >= ps && ce <= pe && cn <= pn;
}
function grantSubset(child, parent, depth) {
  const scope = child.scope ?? {}, parentScope = parent.scope ?? {};
  return parent.capability === child.capability && parent.delegable === true && parent.maxDelegationDepth >= depth &&
    parent.validFrom <= child.validFrom && (!parent.validUntil || child.validUntil && child.validUntil <= parent.validUntil) &&
    (!parentScope.organizationId || parentScope.organizationId === scope.organizationId) && subset(scope.incidentIds, parentScope.incidentIds) &&
    subset(scope.resourceTypes, parentScope.resourceTypes) && subset(scope.resourceIds, parentScope.resourceIds) && subset(scope.actionClasses, parentScope.actionClasses) &&
    geographySubset(scope.geography, parentScope.geography);
}

export function validateDelegation(delegation, parentGrants = [], at, options = {}) {
  const evaluatedAt = isoTime(at, 'delegation_evaluation_time_required'), reasons = [];
  if (!delegation || delegation.validFrom > evaluatedAt || delegation.validUntil <= evaluatedAt) reasons.push('DELEGATION_NOT_EFFECTIVE');
  if (options.parentCredentialId && delegation?.parentCredentialId !== options.parentCredentialId) reasons.push('DELEGATION_PARENT_CREDENTIAL_MISMATCH');
  for (const grant of delegation?.grants ?? []) {
    const parent = parentGrants.find((item) => grantSubset(grant, item, delegation.depth));
    if (!parent) reasons.push(`DELEGATION_EXCEEDS_PARENT:${grant.capability}`);
  }
  return immutable({ valid: reasons.length === 0, state: reasons.length ? 'DENIED' : 'VALID', reasons: uniqueSorted(reasons) });
}
