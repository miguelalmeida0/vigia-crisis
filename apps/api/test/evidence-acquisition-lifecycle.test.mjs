import test from 'node:test';
import assert from 'node:assert/strict';
import { EvidenceNeedService } from '../src/modules/verification/evidence-need-service.mjs';

class MemoryRepository {
  constructor(state) { this.state = structuredClone(state);this.chain=Promise.resolve(); }
  snapshot() { return structuredClone(this.state); }
  mutate(mutator) { const operation=this.chain.then(async()=>{this.state = await mutator(structuredClone(this.state)); return this.snapshot();});this.chain=operation.catch(()=>undefined);return operation; }
}

const clock = () => new Date('2026-08-09T12:00:00.000Z');
const event = {
  id: 'PT-2026-UNKNOWN',
  label: 'Unconfirmed public fire report',
  coordinate: [-8.1, 40.1],
  priority: { level: 'high' },
  actionNeed: {
    kind: 'confirm_public_report',
    needsRouting: true,
    reason: 'A current public report has no independent physical observation attached.'
  },
  observationPlan: {
    state: 'no_connected_asset',
    recommended: null,
    options: [],
    reason: 'No connected taskable asset can currently observe this event.'
  }
};

function state(actors) {
  return {
    actors,
    evidenceNeeds: [],
    evidenceRequests: [],
    evidencePackages: [],
    fieldOperationReceipts: [],
    audit: []
  };
}

test('an unresolved event becomes owner-backed field-capacity configuration work', async () => {
  const repository = new MemoryRepository(state([
    { id: 'supervisor-1', role: 'supervisor', name: 'Duty supervisor', status: 'active' }
  ]));
  const audit = [];
  const service = new EvidenceNeedService({
    repository,
    clock,
    auditService: { async record(entry) { audit.push(entry); } }
  });

  await service.sync([event]);
  await service.sync([event]);

  const persisted = repository.snapshot();
  assert.equal(persisted.evidenceNeeds.length, 1);
  assert.equal(persisted.evidenceRequests.length, 1);
  assert.equal(persisted.evidenceNeeds[0].state, 'FIELD_CAPACITY_NOT_CONFIGURED');
  assert.equal(persisted.evidenceNeeds[0].ownerId, 'supervisor-1');
  assert.equal(persisted.evidenceNeeds[0].evidenceRequestId, persisted.evidenceRequests[0].id);
  assert.equal(persisted.evidenceRequests[0].targetId, 'event:PT-2026-UNKNOWN');
  assert.equal(persisted.evidenceRequests[0].evidenceNeedId, persisted.evidenceNeeds[0].id);
  assert.equal(persisted.evidenceRequests[0].missingQuantity, 'confirm_public_report');
  assert.equal(audit.filter((entry) => entry.type === 'evidence_need.created').length, 1);
});

test('recomputed resolution cancels the linked unevidenced request instead of leaving stale overdue work',async()=>{
  const repository=new MemoryRepository(state([{id:'supervisor-1',role:'supervisor',name:'Duty supervisor',status:'active'}])),audit=[];
  const service=new EvidenceNeedService({repository,clock,auditService:{async record(entry){audit.push(entry);}}});
  await service.sync([event]);
  await service.sync([]);
  const persisted=repository.snapshot();
  assert.equal(persisted.evidenceNeeds[0].state,'RESOLVED');
  assert.equal(persisted.evidenceRequests[0].state,'cancelled');
  assert.match(persisted.evidenceRequests[0].history.at(-1).note,/linked unknown/);
  assert.equal(audit.filter((entry)=>entry.type==='evidence.cancelled').length,1);
});

test('an unresolved event with no responsible actor states that field capacity is not configured', async () => {
  const repository = new MemoryRepository(state([]));
  const service = new EvidenceNeedService({
    repository,
    clock,
    auditService: { async record() {} }
  });

  await service.sync([event]);

  const persisted = repository.snapshot();
  assert.equal(persisted.evidenceNeeds[0].state, 'FIELD_CAPACITY_NOT_CONFIGURED');
  assert.equal(persisted.evidenceRequests.length, 0);
  assert.equal(persisted.evidenceNeeds[0].ownerId, null);
});

test('an environment-configured supervisor owns capacity work without a fabricated roster entry', async () => {
  const repository=new MemoryRepository(state([])),service=new EvidenceNeedService({repository,auditService:{async record(){}},clock,fallbackOwner:{id:'env-supervisor',name:'Configured supervisor',role:'supervisor'}});
  await service.sync([event]);
  const persisted=repository.snapshot();
  assert.equal(persisted.actors.length,0);
  assert.equal(persisted.evidenceNeeds[0].state,'FIELD_CAPACITY_NOT_CONFIGURED');
  assert.equal(persisted.evidenceNeeds[0].ownerId,'env-supervisor');
  assert.equal(persisted.evidenceRequests[0].ownerId,'env-supervisor');
});

test('a configured field actor receives an active manual-dispatch request without assumed availability', async () => {
  const repository = new MemoryRepository(state([
    { id: 'supervisor-1', role: 'supervisor', name: 'Duty supervisor' },
    { id: 'field-1', role: 'field_inspector', name: 'Field lead' }
  ]));
  const service = new EvidenceNeedService({ repository, clock, auditService: { async record() {} } });

  await service.sync([event]);

  const persisted = repository.snapshot();
  assert.equal(persisted.evidenceNeeds[0].state, 'REQUEST_ACTIVE');
  assert.equal(persisted.evidenceNeeds[0].ownerId, 'field-1');
  assert.equal(persisted.evidenceRequests[0].ownerId, 'field-1');
  assert.equal(persisted.evidenceNeeds[0].candidateMethods[0].availability, 'MANUAL_REQUEST');
});

test('a confirmed future observation prevents no-asset termination and creates waiting work', async () => {
  const repository = new MemoryRepository(state([
    { id: 'supervisor-1', role: 'supervisor', name: 'Duty supervisor' },
    { id: 'source-operator', role: 'integration_service', name: 'Satellite ingest owner' }
  ]));
  const service = new EvidenceNeedService({ repository, clock, auditService: { async record() {} } });
  const scheduled = structuredClone(event);
  scheduled.observationPlan = {
    state: 'FUTURE_SCHEDULED',
    options: [{
      id: 'sentinel3:next', label: 'Next Sentinel-3 opportunity', kind: 'FUTURE', methodType: 'satellite_thermal',
      availability: 'SCHEDULED_CONFIRMED', ownerId: 'source-operator', scheduledAt: '2026-08-09T13:00:00.000Z',
      commitment: { id: 'schedule:1', confirmedAt: '2026-08-09T11:50:00.000Z', scheduleState: 'confirmed' },
      informationGain: { state: 'UNMEASURED', value: null }, latency: { state: 'SCHEDULED', value: 60 }, reliability: { state: 'UNMEASURED', value: null }, cost: { state: 'UNMEASURED', value: null }
    }],
    ranking: { state: 'PARTIAL_INFORMATION_GAIN_UNMEASURED', basis: ['confirmed_availability'], missingDimensions: ['validated_information_gain'] }
  };

  await service.sync([scheduled]);

  const persisted = repository.snapshot();
  assert.equal(persisted.evidenceNeeds[0].state, 'WAITING_FOR_SCHEDULED_OBSERVATION');
  assert.equal(persisted.evidenceNeeds[0].nextObservationAt, '2026-08-09T13:00:00.000Z');
  assert.equal(persisted.evidenceRequests[0].state, 'acknowledged');
  assert.equal(persisted.evidenceRequests[0].scheduleCommitment.id, 'schedule:1');
});

test('an acknowledgement deadline breach becomes durable manual escalation', async () => {
  let current = new Date('2026-08-09T12:00:00.000Z');
  const repository = new MemoryRepository(state([
    { id: 'supervisor-1', role: 'supervisor', name: 'Duty supervisor' },
    { id: 'field-1', role: 'field_inspector', name: 'Field lead' }
  ]));
  const service = new EvidenceNeedService({ repository, clock: () => current, auditService: { async record() {} } });
  await service.sync([event]);
  current = new Date('2026-08-09T12:21:00.000Z');
  await service.sync([event]);

  const persisted = repository.snapshot();
  assert.equal(persisted.evidenceNeeds[0].state, 'MANUAL_ESCALATION_REQUIRED');
  assert.equal(persisted.evidenceNeeds[0].escalationReason, 'acknowledgement_sla_breached');
  assert.equal(persisted.evidenceNeeds[0].ownerId, 'supervisor-1');
  assert.equal(persisted.evidenceRequests[0].escalation.reason, 'acknowledgement_sla_breached');
});

test('a terminal request that did not resolve the quantity returns the need to supervisor escalation', async () => {
  const repository = new MemoryRepository(state([
    { id: 'supervisor-1', role: 'supervisor', name: 'Duty supervisor' },
    { id: 'field-1', role: 'field_inspector', name: 'Field lead' }
  ]));
  const service = new EvidenceNeedService({ repository, clock, auditService: { async record() {} } });
  await service.sync([event]);
  repository.state.evidenceRequests[0].state = 'accepted';

  await service.sync([event]);

  const persisted = repository.snapshot();
  assert.equal(persisted.evidenceNeeds[0].state, 'MANUAL_ESCALATION_REQUIRED');
  assert.equal(persisted.evidenceNeeds[0].ownerId, 'supervisor-1');
  assert.equal(persisted.evidenceRequests[0].state, 'accepted');
});

test('only accepted, device-located field evidence enters the fire event graph', async () => {
  const repository = new MemoryRepository({
    evidenceNeeds: [],
    evidenceRequests: [
      { id: 'request:device', targetType: 'fire_event', targetId: 'event:PT-1', state: 'accepted', evidencePackageId: 'package:device' },
      { id: 'request:fallback', targetType: 'fire_event', targetId: 'event:PT-2', state: 'accepted', evidencePackageId: 'package:fallback' }
    ],
    evidencePackages: [
      { id: 'package:device', state: 'accepted', observerId: 'field-1', capturedAt: '2026-08-09T11:50:00.000Z', receivedAt: '2026-08-09T11:51:00.000Z', coordinate: [-8.1, 40.1], accuracyMeters: 18, observations: ['smoke_observed'], attachments: [], provenance: { locationSource: 'device_gps' }, checksum: 'a' },
      { id: 'package:fallback', state: 'accepted', observerId: 'field-1', capturedAt: '2026-08-09T11:50:00.000Z', receivedAt: '2026-08-09T11:51:00.000Z', coordinate: [-8.2, 40.2], accuracyMeters: null, observations: ['smoke_observed'], attachments: [], provenance: { locationSource: 'assignment_coordinate' }, checksum: 'b' }
    ]
  });
  const attached = [];
  const service = new EvidenceNeedService({
    repository,
    eventRepository: { async attachObservationToEvent(observation, eventId) { attached.push({ observation, eventId }); } },
    auditService: { async record() {} },
    clock
  });

  const result = await service.ingestAcceptedEvidence();

  assert.equal(result.considered, 2);
  assert.equal(result.attached, 1);
  assert.equal(result.ineligible, 1);
  assert.equal(attached[0].eventId, 'PT-1');
  assert.deepEqual(attached[0].observation.qualityFlags, []);
});

test('prevention work is not misclassified as an orphaned fire-event need', () => {
  const repository = new MemoryRepository({ evidenceNeeds: [{ id:'need:prevention',subjectType:'prevention_finding',subjectId:'finding-1',state:'FIELD_CAPACITY_NOT_CONFIGURED' }], evidenceRequests: [] });
  const service = new EvidenceNeedService({ repository, clock, auditService: { async record() {} } });
  const enriched = service.enrich({ events:[], summary:{} });
  assert.equal(enriched.summary.unresolvedEvidenceNeeds,1);
  assert.equal(enriched.summary.orphanedEvidenceNeeds,0);
  assert.equal(enriched.summary.acquisitionInvariantHolds,true);
});
