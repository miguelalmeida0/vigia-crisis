import test from 'node:test';
import assert from 'node:assert/strict';
import { DeliveryAdapters } from '../src/modules/notifications/delivery-adapters.mjs';
import { AlertDeliveryWorker } from '../src/modules/notifications/alert-delivery-worker.mjs';
import { ObservationOpportunityService } from '../src/modules/observations/observation-opportunity-service.mjs';
import { AlertService } from '../src/modules/alerts/alert-service.mjs';

test('delivery adapters keep unconfigured external channels explicit and deliver durable local channels', async () => {
  const adapters = new DeliveryAdapters();
  const base = { id: 'delivery-1', alert_id: 'alert-1', evidence_version: 'v1', alert: {}, recipient: {} };
  assert.equal((await adapters.deliver({ ...base, channel: 'IN_APP' })).state, 'DELIVERED');
  assert.equal((await adapters.deliver({ ...base, channel: 'BROWSER_NOTIFICATION' })).state, 'DELIVERED');
  assert.equal((await adapters.deliver({ ...base, channel: 'WEBHOOK' })).state, 'CONFIGURED_OFF');
  assert.equal((await adapters.deliver({ ...base, channel: 'EMAIL' })).state, 'CONFIGURED_OFF');
});

test('delivery worker isolates a failing transport and schedules bounded retry', async () => {
  const completed = [];
  const store = { claimDeliveries: async () => [{ id: 'd1', channel: 'WEBHOOK', attempt_count: 1, max_attempts: 3 }], completeDelivery: async (id, result) => completed.push({ id, ...result }) };
  const worker = new AlertDeliveryWorker({ store, adapters: { deliver: async () => { throw Object.assign(new Error('provider unavailable'), { code: 'PROVIDER_DOWN' }); } }, clock: () => new Date('2026-08-13T10:00:00Z'), baseRetryMs: 1000 });
  const result = await worker.drain();
  assert.equal(result.retrying, 1); assert.equal(completed[0].state, 'RETRY_WAIT'); assert.equal(completed[0].failureCode, 'PROVIDER_DOWN');
});

test('configured email provider receives a bounded recipient payload without exposing configuration',async()=>{
  let request=null;const adapters=new DeliveryAdapters({emailProviderUrl:'https://email.example/send',emailToken:'provider-secret',emailFrom:'vigia@example.test',emailTo:'operator@example.test',fetchImpl:async(url,options)=>{request={url:String(url),options};return new Response('',{status:202,headers:{'x-request-id':'email-7'}});}});
  const result=await adapters.deliver({id:'d-email',alert_id:'alert-1',evidence_version:'v1',channel:'EMAIL',alert:{title:'Physical candidate',priority:'HIGH',reason_code:'CURRENT_PHYSICAL_PRECEDES_REPORT'},recipient:{actor_id:'operator-1',actor_role:'operator'}});
  assert.equal(result.state,'DELIVERED');assert.equal(result.providerReference,'email-7');assert.equal(request.url,'https://email.example/send');assert.equal(request.options.headers.authorization,'Bearer provider-secret');
  assert.deepEqual(adapters.configuration().EMAIL,{configured:true,transport:'https_email_provider'});
});

test('external notification delivery uses pinned HTTPS transport and rejects redirects',async()=>{
  let request=null;const adapters=new DeliveryAdapters({webhookUrl:'https://webhook.example/vigia',fetchImpl:async()=>{throw new Error('unpinned_transport_used');},pinnedHttpsFetch:async(url,options)=>{request={url:String(url),options};return new Response('',{status:302,headers:{location:'https://redirect.example/collect'}});}}),base={id:'d-webhook',alert_id:'alert-1',evidence_version:'v1',channel:'WEBHOOK',alert:{title:'Physical candidate',priority:'HIGH',reason_code:'CURRENT_PHYSICAL_PRECEDES_REPORT'},recipient:{actor_id:'operator-1',actor_role:'operator'}};
  await assert.rejects(()=>adapters.deliver(base),error=>error.code==='PROVIDER_REDIRECT_REJECTED');assert.equal(request.url,'https://webhook.example/vigia');assert.equal(request.options.redirect,'manual');
});

test('notification feeds are actor-scoped and require the authenticated boundary',async()=>{
  const calls=[];const notifications=[{deliveryId:'a',alert:{eventId:'PT-A'}},{deliveryId:'b',alert:{eventId:'PT-B'}}],service=new AlertService({store:{listNotificationFeed:async(options)=>{calls.push(options);return notifications;}},requireAuthenticatedMutations:true});
  await assert.rejects(()=>service.notificationFeed('IN_APP',{id:'public'}),/forbidden/);
  const result=await service.notificationFeed('BROWSER_NOTIFICATION',{id:'operator-1',incidentScopes:['incident:PT-A'],authentication:{authenticated:true}},{limit:20});
  assert.equal(result.channel,'BROWSER_NOTIFICATION');assert.equal(calls[0].actorId,'operator-1');assert.ok(calls[0].incidentIds.includes('PT-A'));assert.deepEqual(result.notifications.map((item)=>item.deliveryId),['a']);
  const global=await service.notificationFeed('IN_APP',{id:'operator-1',incidentScopes:['*'],authentication:{authenticated:true}});assert.equal(calls[1].incidentIds,null);assert.equal(global.notifications.length,2);
});

test('opportunity v2 does not turn provider polling into a claimed overpass', async () => {
  const persisted = [];
  const service = new ObservationOpportunityService({ reader: async () => ({ opportunities: [] }), clock: () => new Date('2026-08-13T10:00:00Z'), operationsStore: { upsertOpportunities: async (items) => persisted.push(...items) } });
  await service.refresh();
  const plan = await service.plan({ id: 'event-1', coordinate: [-8, 40] }, {}, { firms: { state: 'current', nextPollAt: '2026-08-13T10:05:00Z' }, sentinel3: { state: 'current' }, sentinel2: { state: 'catalogue_available' } });
  assert.equal(plan.opportunitiesV2.length, 3);
  assert.ok(plan.opportunitiesV2.every((item) => item.opportunityType === 'UNKNOWN' && item.windowStart === null && item.canCloseEvidenceNeed === false));
  assert.equal(persisted.length, 3);
});

test('opportunity v2 binds actionable unknowns and exposes attributable result reconciliation', async () => {
  const service = new ObservationOpportunityService({ reader: async () => ({ opportunities: [] }), clock: () => new Date('2026-08-13T10:00:00Z'), operationsStore: { reconcileOpportunityResults: async () => [{ id: 'result-1', result_state: 'SATISFIED_BY_ATTRIBUTABLE_OBSERVATION' }], upsertOpportunities: async () => {} } });
  await service.refresh();
  const plan=await service.plan({id:'event-need',coordinate:[-8,40],actionNeed:{needsRouting:true,kind:'resolve_evidence_conflict'}},{},{firms:{state:'current'},sentinel3:{state:'current'},sentinel2:{state:'catalogue_available'}});
  assert.equal(plan.opportunityResults[0].id,'result-1');
  assert.ok(plan.opportunitiesV2.every((item)=>item.evidenceNeedId?.startsWith('evidence-need:')));
});
