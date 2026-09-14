import { semanticHash } from '../intelligence/shared.mjs';
import { canonicalKnowledgeTime } from './as-of-projection.mjs';

export const OUTCOME_STATES = new Set(['SUCCESS', 'PARTIAL', 'FAILED', 'INDETERMINATE', 'INSUFFICIENT_EVIDENCE']);

export const rows = (value) => Array.isArray(value) ? value.filter(Boolean) : [];
export const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
export const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
export const instant = (value) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
export const state = (value) => String(value ?? 'UNKNOWN').trim().toUpperCase();
export const strategicId = (prefix, value) => `${prefix}:${semanticHash(prefix, value).split(':').at(-1).slice(0, 24)}`;

export function unavailable(schemaVersion, reason, unlockCondition) {
  return {
    schemaVersion,
    state: 'NO_GOVERNED_INPUT',
    value: null,
    reason,
    unlockCondition,
    owner: 'VIGIA_STRATEGIC_INTELLIGENCE_PROJECTOR',
    source: 'CANONICAL_ATTRIBUTABLE_STRATEGIC_INPUTS',
  };
}

export function truthSource(value) {
  const source = object(value?.source);
  const sourceName = text(source.name ?? source.provider ?? value?.provider ?? value?.sourceName);
  const reference = text(source.reference ?? source.id ?? value?.sourceReference ?? value?.reference);
  return sourceName && reference ? { name: sourceName, reference } : null;
}

export function visibleAt(value, asOf, explicitTime = null) {
  const at = instant(explicitTime) ?? canonicalKnowledgeTime(value);
  return !at || Date.parse(at) <= Date.parse(asOf);
}

export function certifiedOutcome(value, asOf) {
  const observedAt = instant(value?.observedAt ?? value?.measuredAt);
  const source = truthSource(value), outcomeState = state(value?.state ?? value?.outcome);
  return observedAt && Date.parse(observedAt) <= Date.parse(asOf) && source && OUTCOME_STATES.has(outcomeState)
    ? { ...structuredClone(value), state: outcomeState, observedAt, source }
    : null;
}
