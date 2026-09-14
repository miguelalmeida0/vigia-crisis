#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LiveShadowCampaignService } from '../../apps/api/src/modules/campaign/live-shadow-campaign-service.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),temporaryRoot=path.join(root,'.tmp');
await mkdir(temporaryRoot,{recursive:true});
const directory=await mkdtemp(path.join(temporaryRoot,'prospective-proof-')),filePath=path.join(directory,'campaign.json');
let now=new Date('2026-08-14T10:00:00Z'),fieldnetMutations=0,evidenceDebt={open:3,closed:0,preserved:0};
const acquisitionStore={products:()=>[{id:'raw:history-acquired-now',receivedAt:'2026-08-14T10:01:00Z',sourceTimestamp:'2023-08-14T10:00:00Z',sourceId:'viirs-history',provider:'NASA FIRMS',processingState:'ingested',checksumSha256:'sha256:historical'}]};
const alertService={snapshot:()=>({alerts:[{id:'alert:prospective',eventId:'event:prospective',openedAt:'2026-08-14T10:02:00Z',deliveredAt:'2026-08-14T10:02:20Z',deliveryState:'DELIVERED',acknowledgedAt:'2026-08-14T10:03:00Z',acknowledgedBy:'operator:proof'}]})};
const centralFieldNetService={status:()=>({persistedMutations:fieldnetMutations,canonicalIncidents:fieldnetMutations?1:0,cursor:String(fieldnetMutations)}),snapshot:()=>({observations:fieldnetMutations?[{}]:[],conflicts:[]})};
const evidenceClosureService={status:async()=>structuredClone(evidenceDebt)};
const service=new LiveShadowCampaignService({filePath,acquisitionStore,alertService,centralFieldNetService,evidenceClosureService,releaseId:'vigia-10.0.0:consensus-proof',clock:()=>now});
await service.initialize();
now=new Date('2026-08-14T10:04:00Z');fieldnetMutations=2;evidenceDebt={open:2,closed:1,preserved:1};
await service.capture({live:{sources:{firms:{state:'REACHABLE'},sentinel3Pixels:{state:'STALE'}},events:[
  {id:'event:retrospective',prospectiveDetectionTiming:{providerObservationAt:'2026-08-14T09:00:00Z',eventCreatedAt:'2026-08-14T10:01:00Z'},physicalFirst:true,physicalSourceProfile:{families:['viirs']}},
  {id:'event:prospective',prospectiveDetectionTiming:{providerObservationAt:'2026-08-14T10:01:00Z',eventCreatedAt:'2026-08-14T10:01:30Z'},physicalFirst:true,actionNeed:{needsRouting:true},physicalSourceProfile:{families:['viirs','sentinel3_slstr']}}
]}});
await service.appendOutcome({eventId:'event:prospective',outcomeState:'CONFIRMED_COMPATIBLE',referenceId:'reference:proof',referenceAuthority:'CONTROLLED_CONTRACT_PROOF',referenceObservedAt:'2026-08-14T10:03:30Z'});
await service.recordOperationalEvidence({type:'OPERATOR_CORRECTION',sourceId:'correction:proof',observedAt:'2026-08-14T10:03:40Z',data:{qualification:'Controlled contract proof'}});
await service.recordOperationalEvidence({type:'FIELDNET_OFFLINE_STARTED',sourceId:'field-node:proof',observedAt:'2026-08-14T10:02:00Z'});
await service.recordOperationalEvidence({type:'FIELDNET_OFFLINE_ENDED',sourceId:'field-node:proof',observedAt:'2026-08-14T10:03:00Z'});
await service.recordOperationalEvidence({type:'FIELDNET_SYNC_SUCCEEDED',sourceId:'field-node:proof',observedAt:'2026-08-14T10:03:10Z'});
const firstStatus=service.status(),scorecards=service.scorecards(),outcomes=service.outcomes();
const state=JSON.parse(await readFile(filePath,'utf8'));
const successor=new LiveShadowCampaignService({filePath,releaseId:'vigia-10.0.1:consensus-proof',clock:()=>now});await successor.initialize();
const successorStatus=successor.status(),window24=scorecards.windows.find((item)=>item.label==='LAST_24_HOURS');
const assertions={
  immutableBoundary:firstStatus.prospectiveBoundaryAt==='2026-08-14T10:00:00.000Z'&&successorStatus.prospectiveBoundaryAt===firstStatus.prospectiveBoundaryAt,
  releaseSuccessor:successorStatus.releases.length===2,
  chainVerified:firstStatus.chainIntegrity.state==='VERIFIED'&&successorStatus.chainIntegrity.state==='VERIFIED',
  retrospectivePhysicalRejected:!state.records.some((record)=>record.type==='PHYSICAL_EVENT'&&record.sourceId==='event:retrospective'),
  historicalAcquisitionIsNotEvent:state.records.some((record)=>record.type==='SOURCE_ACQUISITION'&&record.metricEligibility==='ACQUISITION_ONLY')&&window24.metrics.physicalCandidates.numerator===1,
  outcomeAppendOnly:outcomes.outcomes.length===1&&outcomes.outcomes[0].data.originalDecisionRecordHash?.startsWith('sha256:'),
  rollingWindows:scorecards.windows.map((item)=>item.label).join('|')==='LAST_24_HOURS|LAST_7_DAYS|LAST_30_DAYS',
  alertDenominators:window24.metrics.alertsOpened.numerator===1&&window24.metrics.delivered.value===1&&window24.metrics.acknowledged.value===1,
  evidenceDebtObserved:window24.metrics.evidenceDebtOpen.value===2,
  operatorCorrectionObserved:window24.metrics.operatorCorrections.numerator===1,
  offlineMeasured:window24.metrics.offlineMinutes.value===1
};
if(Object.values(assertions).some((value)=>value!==true))throw new Error(`prospective_campaign_proof_failed:${Object.entries(assertions).filter(([,value])=>value!==true).map(([key])=>key).join(',')}`);
let liveRuntime={state:'NOT_PRESENT'};try{const live=JSON.parse(await readFile(path.join(root,'data/runtime/live-shadow-campaign.json'),'utf8'));liveRuntime={state:'OBSERVED_READ_ONLY',schemaVersion:live.schemaVersion,prospectiveBoundaryAt:live.prospectiveBoundaryAt,recordCount:live.records?.length??0,qualification:'Existing Agent 1 runtime file was inspected but not migrated or restarted by this proof.'};}catch{}
const core={schemaVersion:'vigia.prospective-campaign-hardening-proof.v1',generatedAt:new Date().toISOString(),proofKind:'CONTROLLED_PERSISTENCE_CONTRACT_PROOF_NOT_LIVE_EVENT_EVIDENCE',assertions,campaign:firstStatus,successor:successorStatus,scorecards,outcomes,liveRuntime,admissionPolicy:{physicalEvent:'providerObservationAt must exist and be at/after the immutable boundary',acquisition:'receivedAt may qualify acquisition evidence; historical sourceTimestamp never qualifies a physical event',outcome:'append-only and bound to the original event record hash'},qualification:'This proves persistence and denominator behavior deterministically. It does not claim a new live fire, alert, customer, or external outcome.'};
const artifact={...core,evidenceHash:`sha256:${createHash('sha256').update(JSON.stringify(core)).digest('hex')}`},output=path.join(root,'data/validation/operations/prospective-campaign-hardening-proof.json');
await mkdir(path.dirname(output),{recursive:true});await writeFile(output,`${JSON.stringify(artifact,null,2)}\n`);await rm(directory,{recursive:true,force:true});
console.log(JSON.stringify({output:path.relative(root,output),verdict:'PASS',assertions,evidenceHash:artifact.evidenceHash},null,2));
