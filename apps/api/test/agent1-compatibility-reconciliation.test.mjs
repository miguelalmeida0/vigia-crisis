import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import {
  Agent1OperationalProjectionAdapter,
  commitOperationalEvent,
  createIngestionRejection,
  createSourceRegistry
} from '../../../packages/domain/src/event-fabric/index.mjs';
import { semanticHash, stableStringify } from '../../../packages/domain/src/intelligence/shared.mjs';
import { Agent1CompatibilityReconciler } from '../src/modules/intelligence/agent1-compatibility-reconciler.mjs';
import { AppendOnlyOperationalEventJournal } from '../src/modules/intelligence/append-only-event-journal.mjs';
import { initializeCanonicalTwin } from '../src/modules/intelligence/canonical-twin-startup.mjs';
import { MemoryOperationalEventJournal } from '../src/modules/intelligence/memory-event-journal.mjs';
import { OperationalIntelligenceService } from '../src/modules/intelligence/operational-intelligence-service.mjs';

const NOW='2026-08-24T12:10:00.000Z';
const registry=()=>createSourceRegistry([{sourceId:'agent1-operational-projection',familyId:'system.agent1-operational-projection',familyClass:'SYSTEM',staleAfterMs:120_000,registeredAt:'2026-08-24T12:00:00.000Z'}]);
const compatibilityRecord=(overrides={})=>({id:'PT-2026-DELTA',label:'Compatibility context',coordinate:[-8,40],incidentIds:['source-b','source-a'],firstSeenAt:'2026-08-24T12:00:00.000Z',lastSeenAt:'2026-08-24T12:04:00.000Z',evidenceState:'reported',knowledgeState:'report_only',...overrides});

async function harness({journal=new MemoryOperationalEventJournal({clock:()=>new Date(NOW)}),clock=()=>new Date(NOW)}={}){
  const adapter=new Agent1OperationalProjectionAdapter(),service=new OperationalIntelligenceService({journal,sourceRegistry:registry(),adapters:[adapter],clock});
  await service.initialize();
  return{adapter,journal,service,reconciler:new Agent1CompatibilityReconciler({service,journal,adapter,clock}),clock};
}

test('TEST A — 100 identical compatibility startups are event/rejection idempotent and projection deterministic',async()=>{
  const state=await harness(),hashes=new Set(),durations=[];
  for(let index=0;index<100;index++){
    const receivedAt=new Date(Date.parse(NOW)+index*1000).toISOString(),result=await state.reconciler.reconcile([compatibilityRecord()],{receivedAt,projectedAt:NOW,budgetMs:1_000});
    hashes.add(result.twin.projectionHash);durations.push(result.summary.durationMs);
  }
  assert.equal(state.journal.status().eventCount,1);assert.equal(state.journal.status().rejectionCount,0);assert.equal(hashes.size,1);
  assert.equal(durations.every((duration)=>duration<1_000),true);assert.equal((await state.service.getOperationalEvents()).length,1);
});

test('TEST B — a strictly newer Agent1 revision becomes one immutable UPDATE with inspectable lineage',async()=>{
  const state=await harness(),first=await state.reconciler.reconcile([compatibilityRecord()],{receivedAt:NOW,projectedAt:NOW}),before=structuredClone((await state.service.getOperationalEvents())[0]);
  const nextRecord=compatibilityRecord({label:'Compatibility context revised',lastSeenAt:'2026-08-24T12:11:00.000Z'}),second=await state.reconciler.reconcile([nextRecord],{receivedAt:'2026-08-24T12:12:00.000Z',projectedAt:'2026-08-24T12:13:00.000Z'}),events=await state.service.getOperationalEvents({asOf:'2026-08-24T12:13:00.000Z'});
  assert.equal(first.summary.creates,1);assert.equal(second.summary.updates,1);assert.equal(events.length,2);assert.deepEqual(events[0],before);
  assert.equal(events[1].action,'UPDATE');assert.equal(events[1].targetEventId,events[0].id);assert.deepEqual(events[1].provenance.derivedFromEventIds,[events[0].id]);
  assert.equal(second.twin.relationHistory.find((item)=>item.eventId===events[0].id).state,'SUPERSEDED');assert.equal(state.journal.status().rejectionCount,0);
});

test('TEST C — changed content under one immutable revision fails closed once across 100 retries',async()=>{
  const state=await harness();await state.reconciler.reconcile([compatibilityRecord()],{receivedAt:NOW,projectedAt:NOW});
  const bad=compatibilityRecord({label:'Illicit same-revision rewrite'});
  for(let index=0;index<100;index++)await state.reconciler.reconcile([bad],{receivedAt:new Date(Date.parse(NOW)+index*1000).toISOString(),projectedAt:NOW});
  const rejections=await state.service.rejectionLog();assert.equal(state.journal.status().eventCount,1);assert.equal(rejections.length,1);
  assert.equal(rejections[0].code,'PROVIDER_EVENT_IDENTITY_CONFLICT');assert.equal(typeof rejections[0].semanticIdentity,'string');
});

test('TEST D — provider identity collision cannot overwrite and its durable rejection is retry-idempotent',async()=>{
  const state=await harness(),accepted=state.adapter.adaptOne(compatibilityRecord(),{receivedAt:NOW}),collision=state.adapter.adaptOne(compatibilityRecord({label:'Different immutable binding'}),{receivedAt:NOW});
  assert.notEqual(accepted.id,collision.id);assert.equal((await state.service.ingestOperationalEvent(accepted,{ingestedAt:NOW,project:false})).state,'ACCEPTED');
  for(let index=0;index<100;index++)assert.equal((await state.service.ingestOperationalEvent(collision,{ingestedAt:NOW,project:false})).state,'REJECTED');
  const events=await state.service.getOperationalEvents(),rejections=await state.service.rejectionLog();assert.equal(events.length,1);assert.equal(events[0].id,accepted.id);assert.equal(rejections.length,1);assert.equal(rejections[0].code,'PROVIDER_EVENT_IDENTITY_CONFLICT');
});

test('TEST E — thousands of historical rejections are compacted to a bounded tail and accepted events alone project READY',async(t)=>{
  // A provider adapter that keeps resubmitting a conflicting event every
  // refresh cycle produces a distinct rejection identity per attempt (its raw
  // payload — and therefore rejection.id — differs each time even though the
  // underlying conflict is unchanged). Unbounded retention of these turned a
  // real deployment's journal into a multi-hundred-MB file that OOM'd the
  // process on every restart replay. Only the diagnostic REJECTION tail is
  // capped; EVENT records (authoritative canonical history) are never pruned.
  const directory=await mkdtemp(path.join(tmpdir(),'vigia-polluted-journal-')),filePath=path.join(directory,'operational-event-fabric.jsonl');t.after(()=>rm(directory,{recursive:true,force:true}));
  const adapter=new Agent1OperationalProjectionAdapter(),event=commitOperationalEvent(adapter.adaptOne(compatibilityRecord(),{receivedAt:NOW}),NOW),records=[];
  const push=(kind,value,sequence)=>{const core={schemaVersion:'vigia.operational-event-journal-record.v1',sequence,kind,recordedAt:NOW,value};records.push({...core,checksumSha256:semanticHash('journal-record',core)});};
  push('EVENT',event,1);
  for(let index=0;index<2_500;index++)push('REJECTION',createIngestionRejection({adapterId:'historical-adapter',adapterVersion:'v1',providerEventId:`historical-${index}`,providerRevision:'1',receivedAt:NOW,code:'EVENT_IDENTITY_CONFLICT',reasons:['historical_forensic_record'],rawPayloadHash:`historical:sha256:${String(index).padStart(8,'0')}`}),index+2);
  await writeFile(filePath,`${records.map(stableStringify).join('\n')}\n`,{encoding:'utf8',mode:0o600});
  const journal=new AppendOnlyOperationalEventJournal({filePath,clock:()=>new Date(NOW),maxRetainedRejections:500}),state=await harness({journal}),phases=[],started=performance.now();
  const startup=await initializeCanonicalTwin({service:state.service,journal,reconciler:state.reconciler,snapshotEvents:[compatibilityRecord()],clock:state.clock,canonicalBudgetMs:2_000,compatibilityBudgetMs:2_000,onPhase:(entry)=>phases.push(entry)});
  assert.equal(startup.state,'READY');assert.equal(journal.status().eventCount,1);assert.equal(journal.status().rejectionCount,500);assert.equal(startup.reconciliation.duplicates,1);assert.equal(performance.now()-started<2_000,true);
  assert.equal((await state.service.getCurrentTwin({asOf:NOW})).eventCount,1);assert.deepEqual([...new Set(phases.map((item)=>item.subphase))],['journal_initialize','durable_twin_projection','compatibility_diff','compatibility_persist','post_reconcile_projection']);
  // Compaction keeps the most recent rejections, not an arbitrary subset.
  const rejections=await state.service.rejectionLog();
  assert.deepEqual(rejections.map((item)=>item.providerEventId).sort(),Array.from({length:500},(_,index)=>`historical-${2_000+index}`).sort());
  // The on-disk file itself shrinks — the fix must bound bytes read on the next restart, not just in-memory retention.
  const reopened=new AppendOnlyOperationalEventJournal({filePath,clock:()=>new Date(NOW),maxRetainedRejections:500});
  assert.equal((await reopened.initialize()).recordCount,501);
});

test('TEST F — Agent1 compatibility remains SYSTEM/CONTEXT and cannot satisfy authoritative truth',async()=>{
  const state=await harness(),result=await state.reconciler.reconcile([compatibilityRecord()],{receivedAt:NOW,projectedAt:NOW}),event=(await state.service.getOperationalEvents())[0],incident=result.twin.incidents[0],family=incident.evidenceGraph.sourceFamilies[0];
  assert.equal(event.source.familyClass,'SYSTEM');assert.notEqual(event.source.familyClass,'PHYSICAL');assert.notEqual(event.source.familyClass,'OFFICIAL');
  assert.equal(event.payload.compatibilityProjection,true);assert.equal(event.payload.stance,'IRRELEVANT');assert.equal(event.proof.parallelTruthOwner,false);assert.equal(event.provenance.proofStatus,'COMPATIBILITY_BOUNDARY');
  assert.equal(family.familyClass,'CONTEXT');assert.equal(family.metadata.operationalFamilyClass,'SYSTEM');assert.equal(incident.evaluation.state,'INSUFFICIENT');assert.equal(incident.evaluation.satisfied,false);
});

test('bounded startup retains the durable Twin and degrades only compatibility when reconciliation exceeds budget',async()=>{
  const state=await harness();await state.service.ingestOperationalEvent(state.adapter.adaptOne(compatibilityRecord(),{receivedAt:NOW}),{ingestedAt:NOW,project:false});
  let degraded=null;const stalled={diff:()=>new Promise(()=>{}),persist:()=>{throw new Error('persist_must_not_run');},markDegraded:(error,summary)=>{degraded={error,summary};},status:()=>({state:'DEGRADED'})},started=performance.now();
  const result=await initializeCanonicalTwin({service:state.service,journal:state.journal,reconciler:stalled,snapshotEvents:[compatibilityRecord()],clock:state.clock,canonicalBudgetMs:1_000,compatibilityBudgetMs:25});
  assert.equal(result.state,'READY_WITH_DEGRADED_COMPATIBILITY');assert.equal(result.compatibilityState,'DEGRADED');assert.equal(result.journal.eventCount,1);assert.equal(Boolean(degraded),true);assert.equal(performance.now()-started<500,true);
});
