import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync,mkdtempSync } from 'node:fs';
import path from 'node:path';
import { FieldNodeStore } from '../src/sqlite-store.mjs';
import { FieldNetService } from '../src/service.mjs';
import { createFieldIncidentPackage } from '../../../packages/domain/src/fieldnet/contracts.mjs';
import { commandEvent } from '../../../packages/domain/src/incident-command/contracts.mjs';

const base=path.join(process.cwd(),'.tmp/test');mkdirSync(base,{recursive:true});
const incidentId='PT-FIELD-COMMAND-1',releaseId='release:test';
const seed=commandEvent({incidentId,type:'INCIDENT_IMPORTED',eventId:'seed:incident',payload:{importHash:'seed',universe:'SHADOW',canonicalEventIds:[incidentId]},source:'TEST',author:'central',responsibleOwner:'central',releaseId,observedAt:'2026-08-14T10:00:00Z',receivedAt:'2026-08-14T10:00:01Z'});

test('FieldNode validates and durably queues command-survival events with life-safety priority',()=>{
  const directory=mkdtempSync(path.join(base,'field-command-')),store=new FieldNodeStore({filePath:path.join(directory,'node.sqlite'),nodeId:'field-node:test',clock:()=>new Date('2026-08-14T10:01:00Z')});
  const service=new FieldNetService({store,releaseIdentity:{releaseId,codeStateHash:'hash',contracts:{fieldNodeContractVersion:'v1'}},clock:()=>new Date('2026-08-14T10:01:00Z')});
  service.importPackage(createFieldIncidentPackage({incidentId,createdAt:'2026-08-14T10:00:30Z',commandSurvival:{events:[seed]}}),'central');
  const result=service.addCommandSurvivalEvent(incidentId,{type:'MAYDAY_ACTIVATED',eventId:'mayday:offline',payload:{maydayId:'mayday:offline',personId:'person:missing',timers:{}}},'firefighter:1');
  assert.equal(result.state.operatingState,'MAYDAY');assert.equal(result.mutation.priority,'P0_LIFE_SAFETY');
  const queued=store.pendingSync({mode:'RECOVERING'});assert.equal(queued.items[0].mutation.type,'COMMAND_SURVIVAL_EVENT');assert.equal(queued.items[0].priority,'P0_LIFE_SAFETY');assert.equal(store.verifyAudit().valid,true);
  store.close();
});

test('FieldNode rejects invalid offline state transitions before they enter the queue',()=>{
  const directory=mkdtempSync(path.join(base,'field-command-invalid-')),store=new FieldNodeStore({filePath:path.join(directory,'node.sqlite'),nodeId:'field-node:test-invalid'}),service=new FieldNetService({store,releaseIdentity:{releaseId}});
  service.importPackage(createFieldIncidentPackage({incidentId,createdAt:'2026-08-14T10:00:30Z',commandSurvival:{events:[seed]}}),'central');
  assert.throws(()=>service.addCommandSurvivalEvent(incidentId,{type:'PERSON_STATE_TRANSITIONED',payload:{personId:'unknown',state:'OUT'}},'operator:1'),/person_not_found/);
  assert.equal(store.pendingSync({mode:'RECOVERING'}).items.length,0);store.close();
});
