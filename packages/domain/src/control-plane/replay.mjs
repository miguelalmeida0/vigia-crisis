import { immutable, semanticHash } from '../intelligence/shared.mjs';
import { projectOperationalTwin } from '../operational-twin/project-operational-twin.mjs';
import { planControlCycle } from './controllers/plan-control-cycle.mjs';
import { verifyRecordedPolicyDecision } from './policy/policy-evaluation.mjs';

export function createControlPlaneReplay({ events, sourceRegistry, policies, asOf, consequentialIntentByIncident = {} } = {}) {
  const twin = projectOperationalTwin({ events, sourceRegistry, asOf }), nextPlan = planControlCycle({ twin, policies, at: twin.asOf, consequentialIntentByIncident });
  const policyByFingerprint = new Map(policies.map((policy) => [policy.fingerprint, policy]));
  const policyDecisionVerification = twin.controlPlane.decisions.map((decision) => verifyRecordedPolicyDecision(decision, policyByFingerprint.get(decision.policy.fingerprint)));
  const controlEventIds = events.filter((event) => event.hazardType === 'control-plane' && Date.parse(event.clocks.ingestedAt) <= Date.parse(twin.asOf)).map((event) => event.id).sort();
  const manifest = { schemaVersion: 'vigia.control-plane-replay.v1', asOf: twin.asOf, sourceRegistryFingerprint: sourceRegistry.fingerprint,
    controlEventIds, controlProjection: twin.controlPlane, policyDecisionVerification, nextPlanHash: nextPlan.planHash };
  return immutable({ ...manifest, replayHash: semanticHash('control-plane-replay', manifest), nextPlan });
}

export function verifyControlPlaneReplay(replay, input) {
  const rebuilt = createControlPlaneReplay({ ...input, asOf: replay.asOf });
  return immutable({ valid: replay.replayHash === rebuilt.replayHash && replay.nextPlanHash === rebuilt.nextPlanHash && rebuilt.policyDecisionVerification.every((item) => item.valid),
    expectedReplayHash: replay.replayHash, actualReplayHash: rebuilt.replayHash,
    expectedNextPlanHash: replay.nextPlanHash, actualNextPlanHash: rebuilt.nextPlanHash });
}
