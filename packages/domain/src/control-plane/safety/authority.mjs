import { immutable, isoTime, requiredText, uniqueSorted } from '../../intelligence/shared.mjs';
import { ACTION_SAFETY_CLASSES } from '../action/action-model.mjs';

export function createAuthorityContext(input = {}) {
  const context = { schemaVersion: 'vigia.control-authority.v1', principalId: requiredText(input.principalId, 'authority_principal_required'),
    grantedCapabilities: uniqueSorted(input.grantedCapabilities), validFrom: isoTime(input.validFrom, 'authority_valid_from_required'),
    validUntil: input.validUntil ? isoTime(input.validUntil, 'invalid_authority_valid_until') : null, authorityRef: requiredText(input.authorityRef, 'authority_reference_required') };
  if (context.validUntil && context.validUntil <= context.validFrom) throw new Error('invalid_authority_window');
  return immutable(context);
}

export function evaluateActionAuthority(action, authority, at) {
  const evaluatedAt = isoTime(at, 'authority_evaluation_time_required');
  if (authority?.schemaVersion !== 'vigia.control-authority.v1' || !authority.principalId || !authority.authorityRef || !Array.isArray(authority.grantedCapabilities)
    || !Number.isFinite(Date.parse(authority.validFrom))) return immutable({ allowed: false, state: 'AUTHORITY_REQUIRED', reasons: ['AUTHORITY_CONTEXT_MISSING_OR_INVALID'] });
  if (authority.validFrom > evaluatedAt || authority.validUntil && authority.validUntil <= evaluatedAt) return immutable({ allowed: false, state: 'AUTHORITY_REQUIRED', reasons: ['AUTHORITY_NOT_EFFECTIVE'] });
  if (action.safetyClass === ACTION_SAFETY_CLASSES.CONSEQUENTIAL) return immutable({ allowed: false, state: 'AUTHORITY_REQUIRED', reasons: ['CONSEQUENTIAL_EXECUTION_OUT_OF_SCOPE'] });
  const granted = new Set(authority.grantedCapabilities), missing = action.requiredCapabilities.filter((capability) => !granted.has(capability));
  return immutable({ allowed: missing.length === 0, state: missing.length ? 'AUTHORITY_REQUIRED' : 'AUTHORIZED', reasons: missing.map((item) => `MISSING_CAPABILITY:${item}`) });
}
