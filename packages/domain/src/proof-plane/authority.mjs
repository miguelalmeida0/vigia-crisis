import { immutable, isoTime, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';
import { evaluateCapability } from './capability.mjs';
import { applyTrustRestriction } from './continuous-trust.mjs';

export function evaluateAuthority(input = {}) {
  const at = isoTime(input.at, 'authority_decision_time_required'), reasons = [];
  const proofChecks = input.proofChecks ?? {};
  for (const [name, check] of Object.entries(proofChecks)) if (check?.status !== 'VALID' && check?.valid !== true) reasons.push(`${name.toUpperCase()}_${check?.status ?? check?.state ?? 'INVALID'}`);
  const credential = input.credentialCheck, session = input.sessionCheck, device = input.deviceCheck;
  if (!credential?.valid) reasons.push(...(credential?.reasons ?? ['CREDENTIAL_INVALID']));
  if (!session?.valid) reasons.push(...(session?.reasons ?? ['SESSION_INVALID']));
  if (device && !device.valid && device.state !== 'STEP_UP_REQUIRED') reasons.push(...device.reasons);
  const capability = evaluateCapability(input.grants, input.request, at);
  if (!capability.allowed) reasons.push(...capability.reasons);
  let baseDecision = reasons.length ? 'DENIED' : device?.state === 'STEP_UP_REQUIRED' ? 'STEP_UP_REQUIRED' : 'AUTHORIZED';
  if (input.quarantine === true) baseDecision = 'QUARANTINED';
  const decision = applyTrustRestriction(baseDecision, input.continuousTrust?.decision ?? 'DENY');
  const core = { schemaVersion: 'vigia.authority-decision.v1', decision, baseDecision, principalId: input.principalId ?? null,
    organizationId: input.organizationId ?? null, request: structuredClone(input.request ?? {}), evaluatedAt: at,
    capability, continuousTrust: input.continuousTrust ?? null, proofFingerprints: uniqueSorted(input.proofFingerprints),
    credentialId: input.credentialId ?? null, sessionId: input.sessionId ?? null, deviceId: input.deviceId ?? null,
    reasons: uniqueSorted([...reasons, ...(input.continuousTrust?.reasons ?? []), ...(device?.state === 'STEP_UP_REQUIRED' ? device.reasons : [])]) };
  return immutable({ ...core, decisionId: semanticHash('authority-decision', core) });
}
