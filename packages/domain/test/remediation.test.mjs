import test from 'node:test';
import assert from 'node:assert/strict';
import { createRemediation, transitionRemediation } from '../src/remediation.mjs';

test('remediation closure requires completion evidence and re-observation', () => {
  const item = createRemediation({ id: 'm1', hazardId: 'h1', ownerId: 'field', createdAt: '2026-08-07T12:00:00Z' });
  const assigned = transitionRemediation(item, 'assigned', { actorId: 'sup' });
  const active = transitionRemediation(assigned, 'in_progress', { actorId: 'field' });
  assert.throws(() => transitionRemediation(active, 'awaiting_reobservation', { actorId: 'field' }), /completion_evidence_required/);
  const waiting = transitionRemediation(active, 'awaiting_reobservation', { actorId: 'field', completionEvidencePackageId: 'p2' });
  assert.throws(() => transitionRemediation(waiting, 'verified', { actorId: 'sup' }), /reobservation_required/);
});
