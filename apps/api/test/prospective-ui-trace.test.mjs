import test from 'node:test';
import assert from 'node:assert/strict';
import { EventObservationRepository } from '../src/modules/events/event-observation-repository.mjs';

test('browser-visible acknowledgement is trace-bound, causal, and idempotent',async()=>{
  const repository=new EventObservationRepository();
  await repository.persistDerivedStates([{id:'event-1',observations:[{id:'physical-1'}],prospectiveDetectionTiming:{traceId:'prospective:event-1:physical-1',apiAvailableAt:'2026-08-13T10:00:00.000Z',uiFirstSeenAt:null,uiAvailableAt:null}}],new Date('2026-08-13T10:00:00.000Z'));
  const first=await repository.recordUiFirstSeen({eventId:'event-1',traceId:'prospective:event-1:physical-1',clientObservedAt:'2026-08-13T10:00:00.900Z'},new Date('2026-08-13T10:00:01.000Z'));
  const second=await repository.recordUiFirstSeen({eventId:'event-1',traceId:'prospective:event-1:physical-1',clientObservedAt:'2026-08-13T10:00:02.000Z'},new Date('2026-08-13T10:00:03.000Z'));
  assert.equal(first.uiFirstSeenAt,'2026-08-13T10:00:01.000Z');
  assert.equal(first.source,'same_origin_browser_visible_render_ack');
  assert.equal(second.uiFirstSeenAt,first.uiFirstSeenAt);
  assert.equal(second.uiClientObservedAt,first.uiClientObservedAt);
  assert.equal(second.idempotent,true);
  await assert.rejects(()=>repository.recordUiFirstSeen({eventId:'event-1',traceId:'wrong'},new Date('2026-08-13T10:00:04.000Z')),/prospective_trace_mismatch/);
});

test('projection refresh preserves a measured browser-visible clock',async()=>{
  const repository=new EventObservationRepository(),event={id:'event-2',observations:[{id:'physical-2'}],prospectiveDetectionTiming:{traceId:'prospective:event-2:physical-2',apiAvailableAt:'2026-08-13T11:00:00.000Z',uiFirstSeenAt:null,uiAvailableAt:null}};
  await repository.persistDerivedStates([event],new Date('2026-08-13T11:00:00.000Z'));
  await repository.recordUiFirstSeen({eventId:'event-2',traceId:event.prospectiveDetectionTiming.traceId},new Date('2026-08-13T11:00:01.000Z'));
  await repository.persistDerivedStates([event],new Date('2026-08-13T11:00:02.000Z'));
  assert.equal(repository.derivedStates()['event-2'].prospectiveDetectionTiming.uiFirstSeenAt,'2026-08-13T11:00:01.000Z');
});
