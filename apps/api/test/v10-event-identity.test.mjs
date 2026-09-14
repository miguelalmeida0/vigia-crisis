import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { EventObservationRepository } from '../src/modules/events/event-observation-repository.mjs';
import { trackFireEvents } from '../../../packages/domain/src/fire-event-tracker.mjs';

test('physical-first event keeps its identity when an earlier public report arrives later',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'vigia-event-')); const file=path.join(dir,'events.json'); const now=new Date('2026-08-09T13:00:00Z'); const repo=new EventObservationRepository({filePath:file});
  try{
    const thermal={id:'thermal:x1',type:'thermal',source:'NASA FIRMS',at:'2026-08-09T12:10:00Z',receivedAt:'2026-08-09T12:11:00Z',coordinate:[-8,40],satellite:'VIIRS NOAA-20'};
    let observations=await repo.merge([thermal],now); let events=await repo.reconcileEvents(trackFireEvents(observations,{now}),now); const original=events[0].id;
    const report={id:'report:r7:start',type:'report',source:'civil-protection',at:'2026-08-09T12:05:00Z',receivedAt:'2026-08-09T12:30:00Z',coordinate:[-8.002,40.001],incidentId:'r7',municipality:'Test'};
    observations=await repo.merge([thermal,report],now); events=await repo.reconcileEvents(trackFireEvents(observations,{now}),now);
    assert.equal(events.length,1); assert.equal(events[0].id,original); assert.equal(events[0].evidenceState,'multisource');
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('a historical heuristic merge cannot emit duplicate event identities after evidence separates',async()=>{
  const now=new Date('2026-08-09T13:00:00Z'),repo=new EventObservationRepository();
  const first={id:'report:first:start',type:'report',source:'civil-protection',at:'2026-08-09T12:00:00Z',coordinate:[-8,40],incidentId:'first',municipality:'Test',parish:'North'};
  const second={id:'report:second:start',type:'report',source:'civil-protection',at:'2026-08-09T12:05:00Z',coordinate:[-8.001,40.001],incidentId:'second',municipality:'Test',parish:'South'};
  let observations=await repo.merge([first,second],now),events=await repo.reconcileEvents([{observations,firstSeenAt:first.at,lastSeenAt:second.at}],now);assert.equal(events.length,1);const original=events[0].id;
  observations=await repo.merge([first,{...second,coordinate:[-8.4,40.4]}],now);events=await repo.reconcileEvents(trackFireEvents(observations,{now}),now);
  assert.equal(events.length,2);assert.equal(new Set(events.map((item)=>item.id)).size,2);assert(events.some((item)=>item.id===original));
  const repeated=await repo.reconcileEvents(trackFireEvents(await repo.merge([first,{...second,coordinate:[-8.4,40.4]}],now),{now}),now);
  assert.deepEqual(new Set(repeated.map((item)=>item.id)),new Set(events.map((item)=>item.id)));
});

test('repeat provider products preserve the first prospective acquisition clock',async()=>{
  const repo=new EventObservationRepository(),first={id:'thermal:stable',type:'thermal',source:'NASA FIRMS',at:'2026-08-09T12:00:00Z',receivedAt:'2026-08-09T12:10:00Z',vigiaAcquiredAt:'2026-08-09T12:10:00Z',vigiaParsedAt:'2026-08-09T12:10:01Z',coordinate:[-8,40],provenance:{rawSourceProductId:'raw:first',synthetic:false}},repeat={...first,receivedAt:'2026-08-09T13:10:00Z',vigiaAcquisitionStartedAt:'2026-08-09T13:09:58Z',downloadStartedAt:'2026-08-09T13:09:59Z',downloadCompletedAt:'2026-08-09T13:10:00Z',archivePersistedAt:'2026-08-09T13:10:00Z',parseStartedAt:'2026-08-09T13:10:00Z',vigiaAcquiredAt:'2026-08-09T13:10:00Z',vigiaParsedAt:'2026-08-09T13:10:01Z',vigiaCanonicalizedAt:'2026-08-09T13:10:02Z',provenance:{rawSourceProductId:'raw:first',synthetic:false}};
  await repo.merge([first],new Date('2026-08-09T12:10:00Z'));const [stored]=await repo.merge([repeat],new Date('2026-08-09T13:10:00Z'));
  assert.equal(stored.receivedAt,'2026-08-09T12:10:00Z');assert.equal(stored.vigiaAcquiredAt,'2026-08-09T12:10:00Z');assert.equal(stored.vigiaParsedAt,'2026-08-09T12:10:01Z');assert.equal(stored.parseStartedAt,null);assert.equal(stored.vigiaCanonicalizedAt,null);assert.equal(stored.vigiaObservationPersistedAt,'2026-08-09T12:10:00.000Z');assert.equal(stored.provenance.rawSourceProductId,'raw:first');assert.equal(stored.latestAcquisition.rawSourceProductId,'raw:first');assert.equal(stored.latestAcquisition.parseStartedAt,'2026-08-09T13:10:00Z');
});
