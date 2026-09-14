import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { LiveShadowCampaignService } from '../src/modules/campaign/live-shadow-campaign-service.mjs';

test('prospective campaign gates events by provider time, hash-chains evidence, and appends outcomes', async () => {
  const base=path.join(process.cwd(),'.tmp/test');mkdirSync(base,{recursive:true});const filePath=path.join(mkdtempSync(path.join(base,'campaign-')),'campaign.json');
  let now=new Date('2026-08-14T10:00:00Z'),fieldnetMutations=17;
  const acquisitionStore={products:()=>[
    {id:'raw:before',receivedAt:'2026-08-14T09:59:00Z',sourceTimestamp:'2026-08-14T09:58:00Z',sourceId:'viirs',provider:'NASA',processingState:'ingested',checksumSha256:'before'},
    {id:'raw:historical-after',receivedAt:'2026-08-14T10:01:00Z',sourceTimestamp:'2023-01-01T00:00:00Z',sourceId:'viirs-history',provider:'NASA',processingState:'ingested',checksumSha256:'historical'}
  ]};
  const alertService={snapshot:()=>({alerts:[{id:'alert:after',eventId:'event:after',openedAt:'2026-08-14T10:02:00Z',deliveryState:'DELIVERED',deliveredAt:'2026-08-14T10:02:30Z',acknowledgedAt:'2026-08-14T10:03:00Z',acknowledgedBy:'shadow:operator'}]})};
  const centralFieldNetService={status:()=>({persistedMutations:fieldnetMutations,canonicalIncidents:1,cursor:String(fieldnetMutations)}),snapshot:()=>({observations:[{}],conflicts:[]})};
  const evidenceClosureService={status:async()=>({open:1,closed:2,preserved:1})};
  const service=new LiveShadowCampaignService({filePath,acquisitionStore,alertService,centralFieldNetService,evidenceClosureService,releaseId:'vigia-10.0.0:test',clock:()=>now});
  await service.initialize();
  now=new Date('2026-08-14T10:04:00Z');fieldnetMutations=19;
  await service.capture({live:{sources:{firms:{state:'REACHABLE'},sentinel3Pixels:{state:'STALE'}},events:[
    {id:'event:before',createdAt:'2026-08-14T10:01:00Z',prospectiveDetectionTiming:{providerObservationAt:'2026-08-14T09:58:00Z',eventCreatedAt:'2026-08-14T10:01:00Z'},physicalFirst:true,physicalSourceProfile:{families:['viirs']}},
    {id:'event:after',createdAt:'2026-08-14T10:01:30Z',prospectiveDetectionTiming:{providerObservationAt:'2026-08-14T10:01:00Z',eventCreatedAt:'2026-08-14T10:01:30Z'},physicalFirst:true,actionNeed:{needsRouting:true},physicalSourceProfile:{families:['viirs','sentinel3_slstr']}}
  ]}});
  now=new Date('2026-08-14T10:05:00Z');
  const outcome=await service.appendOutcome({eventId:'event:after',outcomeState:'CONFIRMED_COMPATIBLE',referenceId:'official:report-1',referenceAuthority:'ICNF',referenceObservedAt:'2026-08-14T10:04:30Z'});
  const conflict=await service.appendOutcome({eventId:'event:after',outcomeState:'DUPLICATE_IDENTITY_CONFLICT',referenceId:'official:report-2',referenceAuthority:'ICNF',referenceObservedAt:'2026-08-14T10:04:45Z'});
  assert.equal(outcome.data.originalDecisionRecordHash.startsWith('sha256:'),true);
  assert.equal(conflict.data.outcomeState,'IDENTITY_CONFLICT');
  const score=service.scorecards().windows[0];
  assert.equal(service.status().prospectiveBoundaryAt,'2026-08-14T10:00:00.000Z');
  assert.equal(service.status().chainIntegrity.state,'VERIFIED');
  assert.equal(score.metrics.physicalCandidates.numerator,1);
  assert.equal(score.metrics.physicalFirst.denominator,1);
  assert.equal(score.metrics.multisource.value,1);
  assert.equal(score.metrics.delivered.value,1);
  assert.equal(score.metrics.acknowledged.value,1);
  assert.equal(score.metrics.outcomes.numerator,2);
  const persisted=JSON.parse(readFileSync(filePath));
  assert.equal(persisted.records.some((record)=>record.type==='PHYSICAL_EVENT'&&record.sourceId==='event:before'),false);
  assert.equal(persisted.records.some((record)=>record.type==='SOURCE_ACQUISITION'&&record.data.sourceTimestamp.startsWith('2023')),true);
  assert.equal(persisted.records.find((record)=>record.type==='SOURCE_ACQUISITION').metricEligibility,'ACQUISITION_ONLY');
  assert.equal(persisted.records.every((record,index)=>record.sequence===index+1),true);
  assert.equal(service.outcomes().outcomes.length,2);

  const restarted=new LiveShadowCampaignService({filePath,acquisitionStore,alertService,centralFieldNetService,evidenceClosureService,releaseId:'vigia-10.0.1:test',clock:()=>now});
  await restarted.initialize();
  assert.equal(restarted.status().prospectiveBoundaryAt,'2026-08-14T10:00:00.000Z');
  assert.equal(restarted.status().recordCount,service.status().recordCount);
  assert.equal(restarted.status().releases.length,2);
  assert.equal(restarted.status().chainIntegrity.state,'VERIFIED');
});

test('prospective outcome join refuses missing events, invalid states, and pre-boundary references', async () => {
  const base=path.join(process.cwd(),'.tmp/test');mkdirSync(base,{recursive:true});const filePath=path.join(mkdtempSync(path.join(base,'campaign-reject-')),'campaign.json');
  const service=new LiveShadowCampaignService({filePath,clock:()=>new Date('2026-08-14T10:00:00Z')});
  await service.initialize();
  await assert.rejects(()=>service.appendOutcome({eventId:'missing',outcomeState:'CONFIRMED_COMPATIBLE',referenceId:'r1',referenceObservedAt:'2026-08-14T10:01:00Z'}),/event_record_required/);
  await assert.rejects(()=>service.appendOutcome({eventId:'missing',outcomeState:'MADE_UP',referenceId:'r1',referenceObservedAt:'2026-08-14T10:01:00Z'}),/state_invalid/);
});
