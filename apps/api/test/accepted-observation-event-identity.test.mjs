import test from 'node:test';
import assert from 'node:assert/strict';
import { EventObservationRepository } from '../src/modules/events/event-observation-repository.mjs';
import { trackFireEvents } from '../../../packages/domain/src/fire-event-tracker.mjs';

test('accepted evidence attachment binds the retained event instead of creating a duplicate event identity',async()=>{
  const stored=[];
  const repository=new EventObservationRepository({writer:async(_path,value)=>{stored.push(structuredClone(value));},filePath:'memory.json'});
  const now=new Date('2026-08-09T12:00:00.000Z');
  const report={id:'report:1',type:'report',source:'civil-protection',incidentId:'1',at:'2026-08-09T11:50:00.000Z',receivedAt:'2026-08-09T11:51:00.000Z',coordinate:[-8.145,39.92]};
  let observations=await repository.merge([report],now);
  let events=await repository.reconcileEvents(trackFireEvents(observations,{now}),now);
  const eventId=events[0].id;
  const field={id:'field:1',type:'field',source:'Accepted field evidence',sourceFamily:'field_evidence',independenceGroup:'field_observer:1',at:'2026-08-09T11:58:00.000Z',receivedAt:'2026-08-09T11:59:00.000Z',coordinate:[-8.1451,39.9201],classification:'smoke_observed'};
  await repository.attachObservationToEvent(field,eventId,now);
  observations=await repository.merge([],now);
  events=await repository.reconcileEvents(trackFireEvents(observations,{now}),now);
  assert.equal(events.length,1);
  assert.equal(events[0].id,eventId);
  assert.deepEqual(events[0].observations.map((item)=>item.type),['report','field']);
  assert.ok(stored.length>=4);
});
