import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync,mkdtempSync } from 'node:fs';
import path from 'node:path';
import { CentralFieldNetService } from '../src/modules/fieldnet/central-fieldnet-service.mjs';
import { canonical,sha256 } from '../../../packages/domain/src/fieldnet/contracts.mjs';

const base=path.join(process.cwd(),'.tmp/test');
const mutation=(payload,id='mutation:command-1')=>({id,incidentId:'COMMAND-1',originNode:'field-node:1',actor:'field:officer',type:'COMMAND_SURVIVAL_EVENT',priority:'P0_LIFE_SAFETY',localSequence:id.endsWith('1')?1:2,wallClockAt:'2026-08-14T10:01:00Z',clockQuality:'SYNCED',causalMetadata:{nodeSequence:1},payloadHash:sha256(canonical(payload)),payload});
const request=(item)=>({schemaVersion:'vigia.fieldnet-sync-request.v1',nodeId:'field-node:1',cursor:'0',mutations:[item]});

test('offline command reconciles from its persisted canonical link when the current projection is unavailable',async()=>{
  mkdirSync(base,{recursive:true});const filePath=path.join(mkdtempSync(path.join(base,'central-command-')),'ledger.json'),accepted=[];
  const incidentCommandService={repository:{async state(id){return id==='COMMAND-1'?{incident:{canonicalEventIds:['PT-REAL-1'],lastUpdatedAt:'2026-08-14T10:00:00Z'}}:null;}},async acceptOfflineMutation(item){accepted.push({id:item.id,actor:item.actor,claimedActor:item.claimedActor});return{state:'APPLIED',eventId:item.payload.event.eventId};}},service=new CentralFieldNetService({filePath,operationalEventService:{async operatorEvent(){return null;}},incidentCommandService});await service.initialize();
  const payload={event:{eventId:'command:event:1',incidentId:'COMMAND-1',type:'MAYDAY_ACTIVATED',payload:{maydayId:'mayday:1'}}},result=await service.sync(request(mutation(payload)));
  assert.deepEqual(result.acceptedMutationIds,['mutation:command-1']);assert.deepEqual(accepted,[{id:'mutation:command-1',actor:'fieldnet-node:field-node:1',claimedActor:'field:officer'}]);const retained=service.snapshot('COMMAND-1').mutations[0];assert.equal(retained.actor,'fieldnet-node:field-node:1');assert.equal(retained.claimedActor,'field:officer');assert.equal(result.updates[0].payload.canonicalEventId,'PT-REAL-1');assert.equal(result.updates[0].payload.knowledgeState,'CURRENT_REGIONAL_PROJECTION_UNAVAILABLE');
});

test('offline command conflicts are preserved centrally instead of overwritten',async()=>{
  mkdirSync(base,{recursive:true});const filePath=path.join(mkdtempSync(path.join(base,'central-command-conflict-')),'ledger.json'),incidentCommandService={repository:{async state(){return{incident:{canonicalEventIds:['PT-REAL-1']}};}},async acceptOfflineMutation(){return{state:'CONFLICTED',eventId:'command:event:2',reason:'invalid_resource_transition'};}},service=new CentralFieldNetService({filePath,operationalEventService:{async operatorEvent(id){return id==='PT-REAL-1'?{event:{id}}:null;}},incidentCommandService});await service.initialize();
  const payload={event:{eventId:'command:event:2',incidentId:'COMMAND-1',type:'RESOURCE_TRANSITIONED',payload:{resourceId:'engine:1',state:'WORKING'}}};await service.sync(request(mutation(payload,'mutation:command-2')));const snapshot=service.snapshot('COMMAND-1');
  assert.equal(snapshot.conflicts.length,1);assert.equal(snapshot.conflicts[0].state,'OPEN');assert.equal(snapshot.conflictPlans[0].state,'OPEN_PRESERVED');
});
