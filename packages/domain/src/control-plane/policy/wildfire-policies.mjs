import { createPolicyVersion, POLICY_KINDS } from './policy-model.mjs';

export function createWildfireControlPolicies({ effectiveFrom = '2025-01-01T00:00:00.000Z' } = {}) {
  const shared = { effectiveFrom, priority: 100, scope: { hazardTypes: ['wildfire'], claimTypes: ['wildfire.presence'] }, doctrineReference: 'wildfire-detection@operational-twin-1' };
  return Object.freeze([
    createPolicyVersion({ ...shared, id: 'wildfire.acquire-independent-corroboration', version: '1.0.0', priority: 10,
      kind: POLICY_KINDS.MISSING_INDEPENDENT_CORROBORATION,
      description: 'Acquire the best available independent evidence when a resolvable contract debt remains.',
      parameters: { maximumOutstandingRequestsPerNeed: 1 },
      actionTemplate: { type: 'CREATE_ACQUISITION_REQUEST', safetyClass: 'BOUNDED_OPERATIONAL', requiredCapabilities: ['control:evidence-acquisition'] } }),
    createPolicyVersion({ ...shared, id: 'wildfire.replace-stale-source', version: '1.0.0', priority: 20,
      kind: POLICY_KINDS.SOURCE_STALE,
      description: 'Recompute or select an alternative when a source becomes stale.',
      actionTemplate: { type: 'RECOMPUTE_SOURCE_SELECTION', safetyClass: 'REVERSIBLE', requiredCapabilities: ['control:reversible'] } }),
    createPolicyVersion({ ...shared, id: 'wildfire.provider-unavailable', version: '1.0.0', priority: 30,
      kind: POLICY_KINDS.PROVIDER_UNAVAILABLE,
      description: 'Stop repeated attempts, apply backoff, and select an alternative when a provider is unavailable.',
      parameters: { baseBackoffMs: 30_000, maximumBackoffMs: 900_000 },
      actionTemplate: { type: 'BACKOFF_PROVIDER', safetyClass: 'REVERSIBLE', requiredCapabilities: ['control:reversible'] } }),
    createPolicyVersion({ ...shared, id: 'wildfire.blocking-contradiction', version: '1.0.0', priority: 40,
      kind: POLICY_KINDS.BLOCKING_CONTRADICTION,
      description: 'Open contradiction work and prevent escalation while material evidence conflicts.',
      actionTemplate: { type: 'OPEN_CONTRADICTION_WORK', safetyClass: 'BOUNDED_OPERATIONAL', requiredCapabilities: ['control:contradiction-work'] } }),
    createPolicyVersion({ ...shared, id: 'wildfire.close-resolved-work', version: '1.0.0', priority: 50,
      kind: POLICY_KINDS.SATISFIED_WORK_CLOSURE,
      description: 'Close or supersede acquisition work after stronger evidence resolves the debt.',
      actionTemplate: { type: 'CLOSE_RESOLVED_WORK', safetyClass: 'REVERSIBLE', requiredCapabilities: ['control:reversible'] } }),
    createPolicyVersion({ ...shared, id: 'wildfire.consequential-boundary', version: '1.0.0', priority: 1,
      kind: POLICY_KINDS.CONSEQUENTIAL_WARNING_GUARD,
      description: 'Require explicit authority for consequential public warning or dispatch actions.',
      actionTemplate: { type: 'ISSUE_PUBLIC_WARNING', safetyClass: 'CONSEQUENTIAL', requiredCapabilities: ['control:consequential'] } })
  ]);
}
