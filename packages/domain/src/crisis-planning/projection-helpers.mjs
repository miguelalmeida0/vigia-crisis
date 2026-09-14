import { optionalInstant } from './contracts.mjs';

export const CURRENT_PLANNING_CONTEXT_MAX_AGE_MS = 30 * 60_000;

export function rows(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === 'object') return Object.values(value).filter(Boolean);
  return [];
}

export function text(value) {
  const result = String(value ?? '').trim();
  return result || null;
}

export function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

export function isFuture(value, asOf) {
  const instant = optionalInstant(value);
  return Boolean(instant && Date.parse(instant) > Date.parse(asOf));
}

export function isCurrentPlanningContext(value, asOf, maxAgeMs = CURRENT_PLANNING_CONTEXT_MAX_AGE_MS) {
  const instant = optionalInstant(value?.updatedAt ?? value?.checkedAt ?? value?.retrievedAt ?? value?.observedAt
    ?? value?.provenance?.retrievedAt ?? value?.provenance?.observedAt
    ?? value?.freshness?.retrievedAt ?? value?.freshness?.observedAt);
  if (!instant) return false;
  const asOfMs = Date.parse(asOf);
  const instantMs = Date.parse(instant);
  if (instantMs > asOfMs || asOfMs - instantMs > maxAgeMs) return false;
  const freshness = value?.freshness && typeof value.freshness === 'object'
    ? value.freshness.state ?? value.freshness.classification
    : value?.freshness ?? value?.freshnessState;
  if (/STALE|EXPIRED|HISTORICAL|UNAVAILABLE/.test(String(freshness ?? '').toUpperCase())) return false;
  const validUntil = optionalInstant(value?.validUntil);
  return !validUntil || Date.parse(validUntil) > asOfMs;
}

export function idOf(value, fallback = null) {
  return text(value?.id ?? value?.assetId ?? value?.facilityId ?? value?.roadId
    ?? value?.communityId ?? value?.shelterId ?? value?.nodeId ?? fallback);
}

export function unique(values) {
  return [...new Set(values.filter(Boolean).map(String))].sort((left, right) => left.localeCompare(right));
}

export function truthUnknown(reason, extras = {}) {
  return { state: 'UNKNOWN', value: null, reason, ...extras };
}

export function admissionState(value = {}) {
  return value.admitted === true || String(value.admissionState ?? '').toUpperCase() === 'ADMITTED';
}

export function projectionEnvelope(schemaVersion, state, value, reason = null) {
  return {
    schemaVersion,
    ...(value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
    state,
    value,
    reason,
  };
}

export function withResolutionLifecycle(section, asOf, unlockCondition) {
  if (!section || !/(NO_|WITHHELD|UNKNOWN|BLOCKED|INCOMPLETE|REQUIRED|INVALID|UNAVAILABLE|INSUFFICIENT)/.test(String(section.state ?? ''))) return section;
  const fallbackReasons = {
    NO_GOVERNED_EDGES: 'No attributable context coordinate or explicit governed exposure relation currently satisfies the exposure-edge contract.',
    NO_GOVERNED_DEPENDENCIES: 'No explicit governed dependency or applicable scenario dependency currently satisfies the graph contract.',
    NO_ATTRIBUTABLE_DISAGREEMENT_DETECTED: 'Fewer than two attributable time-bound claims disagree on the same subject and quantity.',
    NO_ESTIMATE_OBSERVATION_PAIRS: 'No expected estimate is paired with an attributable observed value.',
    NO_REPLAN_TRIGGER: 'No governed trigger requiring plan recomputation is present.',
    NO_ELIGIBLE_RECOMMENDATION: 'No task requirement currently has an eligible routed candidate with attributable current incident-relevant capacity.',
  };
  const reason = section.reason ?? fallbackReasons[section.state]
    ?? `Canonical governed inputs do not currently satisfy the ${section.state} section contract.`;
  return {
    ...section,
    reason,
    owner: 'crisis-planning-projection',
    source: 'CANONICAL_GOVERNED_INPUTS',
    checkedAt: asOf,
    nextCheckAt: null,
    terminalReason: reason,
    unlockCondition,
  };
}

