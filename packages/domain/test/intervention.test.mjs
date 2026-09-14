import test from 'node:test';
import assert from 'node:assert/strict';
import { createIntervention, transitionIntervention } from '../src/intervention.mjs';

test('intervention lifecycle is explicit and audited', () => {
  const created = createIntervention({
    id: 'task:1', targetType: 'prevention', targetId: 'candidate:1', title: 'Inspect access road', createdAt: '2026-08-07T10:00:00Z'
  });
  assert.equal(created.state, 'queued');
  const assigned = transitionIntervention(created, 'assigned', { actor: 'miguel', reason: 'crew selected', at: '2026-08-07T10:05:00Z', patch: { assignee: 'Crew A' } });
  assert.equal(assigned.state, 'assigned');
  assert.equal(assigned.assignee, 'Crew A');
  assert.equal(assigned.events.length, 2);
  assert.throws(() => transitionIntervention(assigned, 'verified'), /invalid_intervention_transition/);
});
