import test from 'node:test';
import assert from 'node:assert/strict';
import { EventObservationRepository } from '../src/modules/events/event-observation-repository.mjs';
import { EventCorrectionService } from '../src/modules/events/event-correction-service.mjs';
import { trackFireEvents } from '../../../packages/domain/src/fire-event-tracker.mjs';

const now = new Date('2026-08-09T13:00:00Z');
const thermal = (id, lon, at) => ({ id, type:'thermal', source:'NASA FIRMS', sourceFamily:'viirs', independenceGroup:'viirs:NOAA20', at, coordinate:[lon,40], satellite:'VIIRS NOAA-20' });
const report = { id:'report:r1:start', type:'report', source:'civil-protection', at:'2026-08-09T12:07:00Z', coordinate:[-8.001,40], incidentId:'r1', municipality:'Test' };
async function snapshot(repo, incoming) { const observations=await repo.merge(incoming,now); return repo.reconcileEvents(trackFireEvents(observations,{now}),now); }

test('operator merge persists across event reconstruction even when events are geographically separate', async () => {
  const repo=new EventObservationRepository(); const incoming=[thermal('thermal:a',-8,'2026-08-09T12:05:00Z'),thermal('thermal:b',-8.3,'2026-08-09T12:06:00Z')];
  let events=await snapshot(repo,incoming); assert.equal(events.length,2); const [first,second]=events;
  await repo.mergeEvents({sourceEventId:second.id,targetEventId:first.id,actorId:'operator',reason:'Same event verified by operator'},now);
  events=await snapshot(repo,incoming); assert.equal(events.length,1); assert.equal(events[0].id,first.id); assert.equal(events[0].operatorCorrected,true);
});

test('operator split persists and prevents heuristic re-merge of manually separated evidence', async () => {
  const repo=new EventObservationRepository(); const incoming=[thermal('thermal:a',-8,'2026-08-09T12:05:00Z'),report];
  let events=await snapshot(repo,incoming); assert.equal(events.length,1); const original=events[0].id;
  const correction=await repo.splitEvent({sourceEventId:original,observationIds:[report.id],actorId:'operator',reason:'Report refers to separate ignition'},now);
  events=await snapshot(repo,incoming); assert.equal(events.length,2); assert.deepEqual(new Set(events.map((item)=>item.id)),new Set([original,correction.targetEventId]));
});

test('reject association records an explicit durable correction', async () => {
  const repo=new EventObservationRepository(); const incoming=[thermal('thermal:a',-8,'2026-08-09T12:05:00Z'),report];
  const [event]=await snapshot(repo,incoming); const correction=await repo.rejectAssociation({sourceEventId:event.id,observationId:report.id,actorId:'operator',reason:'Conflicting field confirmation'},now);
  assert.equal(correction.kind,'reject_association'); assert.deepEqual(correction.observationIds,[report.id]);
  const log=await repo.corrections(); assert.equal(log[0].kind,'reject_association'); assert.equal((await snapshot(repo,incoming)).length,2);
});

test('event correction service enforces role authorization and emits audit evidence', async () => {
  const repo=new EventObservationRepository(); const incoming=[thermal('thermal:a',-8,'2026-08-09T12:05:00Z'),thermal('thermal:b',-8.3,'2026-08-09T12:06:00Z')]; const events=await snapshot(repo,incoming); const audits=[];
  const service=new EventCorrectionService({eventRepository:repo,auditService:{record:async(item)=>audits.push(item)},clock:()=>now});
  await assert.rejects(()=>service.merge({id:'viewer',role:'viewer'},{sourceEventId:events[1].id,targetEventId:events[0].id,reason:'No'}),/forbidden/);
  const analyst={id:'analyst',role:'analyst',incidentScopes:events.map((item)=>item.id)};
  const correction=await service.merge(analyst,{sourceEventId:events[1].id,targetEventId:events[0].id,reason:'Cross-source evidence reviewed'});
  assert.equal(correction.actorId,'analyst'); assert.equal(audits[0].type,'event.association.merge'); assert.equal((await service.list(analyst)).corrections.length,1);
  await assert.rejects(()=>service.split({...analyst,incidentScopes:[events[0].id]},{sourceEventId:events[1].id,observationIds:['thermal:b'],reason:'Out of scope'}),/incident_scope_forbidden/);
});
