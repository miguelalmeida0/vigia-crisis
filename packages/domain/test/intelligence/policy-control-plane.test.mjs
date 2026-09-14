import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTION_SAFETY_CLASSES, assertPolicySetIntegrity, comparePolicyVersions, createActionReceipt, createAuthorityContext, createControlAction,
  createDesiredState, createPolicyVersion, createWildfireControlPolicies, evaluateActionAuthority, evaluateControlPolicy,
  evaluateKillSwitch, POLICY_KINDS, selectEvidenceSource, verifyActionReceipt
} from '../../src/control-plane/index.mjs';

const at = '2026-08-24T12:00:00.000Z';
const policies = createWildfireControlPolicies({ effectiveFrom: '2026-01-01T00:00:00Z' });
const policy = (kind) => policies.find((item) => item.kind === kind);
const need = { id: 'need:physical', missingQuantity: 'FAMILY_CLASS_QUORUM', eligibility: {
  requiredSourceFamilyClasses: ['PHYSICAL'], requiredSourceFamilyIds: [], prohibitedCausalLineages: ['causal:shared'],
  sourceHealth: { requiredStatuses: ['ACTIVE'] }, applicability: { requirementKind: 'FAMILY_CLASS_QUORUM' }, geometry: { coordinate: [-8, 40] },
  timeWindow: { from: '2026-08-24T11:00:00Z', to: '2026-08-24T13:00:00Z' }, minimumProvenanceStrength: 'ATTRIBUTED'
} };

test('versioned policies are immutable, fingerprinted, pure, and comparable', () => {
  const first = policy(POLICY_KINDS.MISSING_INDEPENDENT_CORROBORATION);
  const retry = createPolicyVersion({ ...first });
  assert.equal(first.fingerprint, retry.fingerprint); assert.equal(Object.isFrozen(first.parameters), true);
  const selection = { state: 'SELECTED', selectedSourceId: 'sensor:new', fingerprint: 'selection:1' };
  const facts = { incidentId: 'incident:1', need, sourceSelection: selection, selectedSource: { sourceId: 'sensor:new', status: 'ACTIVE' } };
  const decision = evaluateControlPolicy({ policy: first, facts, evaluatedAt: at });
  assert.equal(decision.outcome, 'APPLY'); assert.equal(decision.decisionId, evaluateControlPolicy({ policy: first, facts, evaluatedAt: at }).decisionId);
  const changed = createPolicyVersion({ ...first, version: '2.0.0', parameters: { maximumOutstandingRequestsPerNeed: 0 } });
  const comparison = comparePolicyVersions({ leftPolicy: first, rightPolicy: changed, facts, evaluatedAt: at });
  assert.equal(comparison.left.policy.fingerprint === comparison.right.policy.fingerprint, false);
  const conflicting = createPolicyVersion({ ...first, description: 'Conflicting doctrine under the same identity.' });
  assert.throws(() => assertPolicySetIntegrity([first, conflicting]), /control_policy_identity_conflict/);
});

test('source selection excludes unhealthy, non-independent, causally shared and ambiguous candidates', () => {
  const common = { familyClass: 'PHYSICAL', status: 'ACTIVE', capabilities: ['FAMILY_CLASS_QUORUM'], upstreamLineage: [], latencyMs: 20,
    geographicApplicability: { bbox: [-9, 39, -7, 41] }, metadata: { priority: 1, reliability: 0.9, cost: 1, provenanceStrength: 'VERIFIED' } };
  const selection = selectEvidenceSource({ need, existingFamilyIds: ['physical.used'], sources: [
    { ...common, sourceId: 'sensor:unhealthy', familyId: 'physical.unhealthy', status: 'UNAVAILABLE' },
    { ...common, sourceId: 'sensor:used', familyId: 'physical.used' },
    { ...common, sourceId: 'sensor:shared', familyId: 'physical.shared', upstreamLineage: ['causal:shared'] },
    { ...common, sourceId: 'sensor:best', familyId: 'physical.best', metadata: { ...common.metadata, priority: 0 } }
  ] });
  assert.equal(selection.state, 'SELECTED'); assert.equal(selection.selectedSourceId, 'sensor:best');
  assert.equal(selection.candidates.find((item) => item.sourceId === 'sensor:shared').exclusionReasons.includes('PROHIBITED_CAUSAL_LINEAGE'), true);
  const ambiguous = selectEvidenceSource({ need, sources: [{ ...common, sourceId: 'sensor:a', familyId: 'physical.a' }, { ...common, sourceId: 'sensor:b', familyId: 'physical.b' }] });
  assert.equal(ambiguous.state, 'AMBIGUOUS_BEST_SOURCE'); assert.deepEqual(ambiguous.ambiguousSourceIds, ['sensor:a', 'sensor:b']);
  const unknownApplicability = selectEvidenceSource({ need, sources: [{ ...common, sourceId: 'sensor:unknown', familyId: 'physical.unknown', geographicApplicability: null }] });
  assert.equal(unknownApplicability.state, 'NO_ELIGIBLE_SOURCE');
});

test('consequential actions cannot execute and receipts are hash-bound to decisions and desired state', () => {
  const guard = policy(POLICY_KINDS.CONSEQUENTIAL_WARNING_GUARD), decision = evaluateControlPolicy({ policy: guard, facts: { incidentId: 'incident:1', consequentialIntent: true }, evaluatedAt: at });
  const desired = createDesiredState({ subjectType: 'INCIDENT', subjectId: 'incident:1', state: 'CONSEQUENTIAL_ACTION_HELD', policy: guard, effectiveAt: at, reasons: decision.reasons });
  const action = createControlAction({ incidentId: 'incident:1', subjectType: 'INCIDENT', subjectId: 'incident:1', type: 'ISSUE_PUBLIC_WARNING',
    desiredStateId: desired.id, policy: guard, plannedAt: at, safetyClass: ACTION_SAFETY_CLASSES.CONSEQUENTIAL, requiredCapabilities: ['control:consequential'] });
  const authority = createAuthorityContext({ principalId: 'operator:1', grantedCapabilities: ['control:consequential'], validFrom: at, authorityRef: 'exercise-authority' });
  assert.deepEqual(evaluateActionAuthority(action, authority, at).state, 'AUTHORITY_REQUIRED');
  assert.equal(evaluateKillSwitch({ engaged: true, scopes: ['CONSEQUENTIAL'], reason: 'class disabled' }, action, at).state, 'ENGAGED');
  const receipt = createActionReceipt({ action, decision, desiredState: desired, outcome: 'AUTHORITY_REQUIRED', at, postcondition: null, executor: 'none' });
  assert.equal(verifyActionReceipt(receipt, { action, decision, desiredState: desired }), true);
  assert.equal(verifyActionReceipt(receipt, { action: { ...action, type: 'OTHER' }, decision, desiredState: desired }), false);
});

test('expired authority fails closed for bounded operational actions', () => {
  const acquisition = policy(POLICY_KINDS.MISSING_INDEPENDENT_CORROBORATION), desired = createDesiredState({ subjectType: 'EVIDENCE_NEED', subjectId: need.id,
    state: 'ACQUISITION_ACTIVE', policy: acquisition, effectiveAt: at, reasons: ['test'] });
  const action = createControlAction({ incidentId: 'incident:1', subjectType: 'EVIDENCE_NEED', subjectId: need.id, type: 'CREATE_ACQUISITION_REQUEST',
    desiredStateId: desired.id, policy: acquisition, plannedAt: at, safetyClass: ACTION_SAFETY_CLASSES.BOUNDED_OPERATIONAL, requiredCapabilities: ['control:evidence-acquisition'] });
  const expired = createAuthorityContext({ principalId: 'runtime:old', grantedCapabilities: ['control:evidence-acquisition'], validFrom: '2026-08-23T00:00:00Z',
    validUntil: '2026-08-24T11:59:00Z', authorityRef: 'expired-delegation' });
  assert.equal(evaluateActionAuthority(action, expired, at).state, 'AUTHORITY_REQUIRED');
});
