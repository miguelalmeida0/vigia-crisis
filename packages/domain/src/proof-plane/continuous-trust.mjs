import { immutable, isoTime, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';

export function createTrustPolicy(input = {}) {
  const core = { schemaVersion: 'vigia.continuous-trust-policy.v1', id: String(input.id ?? 'vigia-default-trust'), version: String(input.version ?? '1'),
    validFrom: isoTime(input.validFrom, 'trust_policy_valid_from_required'), validUntil: input.validUntil ? isoTime(input.validUntil, 'invalid_trust_policy_valid_until') : null,
    requiredAttestationBySensitivity: structuredClone(input.requiredAttestationBySensitivity ?? { LOW: 'SOFTWARE', MEDIUM: 'HARDWARE_BOUND', HIGH: 'MEASURED_BOOT' }),
    stepUpSignals: uniqueSorted(input.stepUpSignals ?? ['NEW_DEVICE', 'LOCATION_MISMATCH', 'HIGH_FAILURE_VELOCITY']),
    denySignals: uniqueSorted(input.denySignals ?? ['IMPOSSIBLE_TRAVEL', 'SESSION_ANOMALY']),
    quarantineSignals: uniqueSorted(input.quarantineSignals ?? ['DEVICE_COMPROMISED', 'PROOF_SUBSTITUTION']),
    maximumSessionAgeMs: Number(input.maximumSessionAgeMs ?? 8 * 60 * 60_000), maximumAttestationAgeMs: Number(input.maximumAttestationAgeMs ?? 24 * 60 * 60_000) };
  return immutable({ ...core, fingerprint: semanticHash('continuous-trust-policy', core) });
}

const DECISION_RANK = Object.freeze({ ALLOW: 0, LIMIT: 1, STEP_UP: 2, DENY: 3, QUARANTINE: 4 });
function mostRestrictive(states) { return states.sort((left, right) => DECISION_RANK[right] - DECISION_RANK[left])[0] ?? 'ALLOW'; }

export function evaluateContinuousTrust(input = {}) {
  const at = isoTime(input.at, 'continuous_trust_time_required'), policy = input.policy, hard = input.hardPrerequisites ?? {}, reasons = [];
  if (!policy?.fingerprint) throw new Error('versioned_trust_policy_required');
  const hardFailures = Object.entries(hard).filter(([, value]) => value !== true).map(([key]) => `HARD_PREREQUISITE_FAILED:${key.toUpperCase()}`);
  if (hardFailures.length) return immutable({ decision: hard.quarantineSafe === false ? 'QUARANTINE' : 'DENY', evaluatedAt: at, policy: { id: policy.id, version: policy.version, fingerprint: policy.fingerprint }, hardFailures, softSignals: [], reasons: hardFailures });
  const signals = uniqueSorted(input.softSignals), dispositions = [];
  for (const signal of signals) {
    if (policy.quarantineSignals.includes(signal)) dispositions.push('QUARANTINE');
    else if (policy.denySignals.includes(signal)) dispositions.push('DENY');
    else if (policy.stepUpSignals.includes(signal)) dispositions.push('STEP_UP');
    else dispositions.push('LIMIT');
    reasons.push(`SOFT_RISK:${signal}`);
  }
  const decision = mostRestrictive(dispositions);
  return immutable({ decision, evaluatedAt: at, policy: { id: policy.id, version: policy.version, fingerprint: policy.fingerprint },
    hardFailures: [], softSignals: signals, reasons, doctrine: 'Soft risk can only preserve or reduce independently proven authority; it never creates authority.' });
}

export function applyTrustRestriction(authorityDecision, trustDecision) {
  if (authorityDecision !== 'AUTHORIZED') return authorityDecision;
  return ({ ALLOW: 'AUTHORIZED', STEP_UP: 'STEP_UP_REQUIRED', LIMIT: 'LIMITED', DENY: 'DENIED', QUARANTINE: 'QUARANTINED' })[trustDecision] ?? 'DENIED';
}
