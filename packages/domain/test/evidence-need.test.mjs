import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVIDENCE_NEED_STATES,
  createEvidenceNeed,
  transitionEvidenceNeed
} from '../src/evidence-need.mjs';

test('evidence needs preserve unknown ranking dimensions instead of inventing scores', () => {
  const need = createEvidenceNeed({
    id: 'evidence-need:event-1:confirm_public_report',
    subjectType: 'fire_event',
    subjectId: 'event-1',
    missingQuantity: 'confirm_public_report',
    reason: 'A public report has no independent physical observation.',
    state: EVIDENCE_NEED_STATES.MANUAL_ESCALATION_REQUIRED,
    candidateMethods: [{
      id: 'manual-field-dispatch',
      label: 'Manual field dispatch',
      availability: 'manual_escalation',
      informationGain: { state: 'UNMEASURED', value: null },
      latency: { state: 'UNMEASURED', value: null },
      reliability: { state: 'UNMEASURED', value: null },
      cost: { state: 'UNMEASURED', value: null }
    }],
    ranking: {
      state: 'PARTIAL',
      basis: ['availability'],
      missingDimensions: ['information_gain', 'latency', 'reliability', 'cost']
    },
    createdAt: '2026-08-09T12:00:00.000Z'
  });

  assert.equal(need.state, EVIDENCE_NEED_STATES.MANUAL_ESCALATION_REQUIRED);
  assert.equal(need.candidateMethods[0].informationGain.state, 'UNMEASURED');
  assert.equal(need.candidateMethods[0].informationGain.value, null);
  assert.deepEqual(need.ranking.missingDimensions, ['information_gain', 'latency', 'reliability', 'cost']);

  const resolved = transitionEvidenceNeed(need, EVIDENCE_NEED_STATES.RESOLVED, {
    at: '2026-08-09T12:10:00.000Z',
    reason: 'Independent physical observation accepted.'
  });
  assert.equal(resolved.resolvedAt, '2026-08-09T12:10:00.000Z');
  assert.equal(resolved.history.at(-1).state, EVIDENCE_NEED_STATES.RESOLVED);
});
