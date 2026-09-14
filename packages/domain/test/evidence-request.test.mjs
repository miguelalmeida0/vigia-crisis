import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceRequest, transitionEvidenceRequest } from '../src/evidence-request.mjs';
import { createEvidenceEnvelope } from '../src/evidence-envelope.mjs';

test('evidence requests enforce lifecycle and package submission', () => {
  const request = createEvidenceRequest({ id: 'r1', targetId: 't1', ownerId: 'field', requestedBy: 'sup', dueAt: '2026-08-08T12:00:00Z', createdAt: '2026-08-07T12:00:00Z' });
  const acknowledged = transitionEvidenceRequest(request, 'acknowledged', { actorId: 'field', at: '2026-08-07T12:05:00Z' });
  const active = transitionEvidenceRequest(acknowledged, 'in_progress', { actorId: 'field' });
  assert.throws(() => transitionEvidenceRequest(active, 'submitted', { actorId: 'field' }), /evidence_package_required/);
  const submitted = transitionEvidenceRequest(active, 'submitted', { actorId: 'field', evidencePackageId: 'p1' });
  const accepted = transitionEvidenceRequest(submitted, 'accepted', { actorId: 'sup', review: { note: 'Accepted' } });
  assert.equal(accepted.state, 'accepted');
});

test('numeric accuracy never invents device-GPS provenance',()=>{
  const envelope=createEvidenceEnvelope({id:'p1',requestId:'r1',observerId:'field',capturedAt:'2026-08-09T12:00:00Z',coordinate:[-8.1,40.1],accuracyMeters:8});
  assert.equal(envelope.provenance.locationSource,'unknown');
  const device=createEvidenceEnvelope({id:'p2',requestId:'r1',observerId:'field',capturedAt:'2026-08-09T12:00:00Z',coordinate:[-8.1,40.1],accuracyMeters:8,provenance:{locationSource:'device_gps'}});
  assert.equal(device.provenance.locationSource,'device_gps');
});
