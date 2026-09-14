import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { OperationalIntelligenceService } from '../src/modules/intelligence/operational-intelligence-service.mjs';
import { MemoryOperationalEventJournal } from '../src/modules/intelligence/memory-event-journal.mjs';
import { OperatorStateRepository } from '../src/modules/interventions/operator-state-repository.mjs';
import { HumanAttentionService } from '../src/modules/operator/human-attention-service.mjs';
import { withOperatorIntelligence } from '../src/modules/operator/operator-intelligence-projection.mjs';
import { at, actor, registry, event, health, requirement } from '../../../packages/domain/test/intelligence/operational-intelligence-fixture.mjs';
import { projectOperationalTwin } from '../../../packages/domain/src/operational-twin/project-operational-twin.mjs';
import { recorded } from '../../../packages/domain/test/intelligence/operational-intelligence-fixture.mjs';

test('isolated T0–T13 loop uses event admission, evidence contract, persisted human ownership and changed next action',async()=>{
  let minute=0;const clock=()=>new Date(at(minute));
  const service=new OperationalIntelligenceService({journal:new MemoryOperationalEventJournal({clock}),sourceRegistry:registry(),clock,currentTwinCacheMs:0});
  const dir=await mkdtemp(path.join(tmpdir(),'vigia-intelligence-loop-')),filePath=path.join(dir,'operator.json');
  const repository=new OperatorStateRepository({filePath,clock});await repository.initialize();
  const attention={attentionId:'attention:test',incidentId:'incident:test-fire',state:'ACKNOWLEDGEMENT_REQUIRED',sourceId:'official',deadline:at(30)};
  const recovery={async project(){const saved=repository.snapshot().humanAttentionWorkStates.find(w=>w.attentionId===attention.attentionId);return{humanAttention:{items:[{...attention,...saved}],truthBoundary:'Isolated test work lifecycle'}};}};
  const human=new HumanAttentionService({repository,operationalIntelligenceService:service,operationalRecoveryService:recovery,clock});
  const projection=async()=>withOperatorIntelligence({}, {...await service.getCurrentTwin(),informationCollection:{requirements:[requirement()]},humanAttention:(await recovery.project()).humanAttention},actor,'incident:test-fire').operationalIntelligence.value;
  assert.equal((await service.ingestOperationalEvent(event('thermal',0))).state,'ACCEPTED'); // T0
  let result=await projection();assert.equal(result.incidents.length,1); // T1
  assert.equal(result.incidents[0].assessment.corroborationState,'SINGLE_SOURCE'); // T2
  minute=1;await service.ingestOperationalEvent(health('UNAVAILABLE',1)); // T3
  result=await projection();assert.deepEqual(result.sourceBlastRadius[0].taskIds,['task:test']); // T4
  assert.ok(result.incidents[0].recommendations.some(r=>r.what==='Request official confirmation')); // T5
  minute=2;const receipt=await human.action(actor,'attention:test',{action:'ASSUME_OWNERSHIP',idempotencyKey:'isolated-loop:owner'}); // T6
  assert.equal(receipt.workItem.owner,actor.id);assert.equal(receipt.receipt.truthEffect,'WORK_STATE_ONLY');
  const disk=JSON.parse(await readFile(filePath,'utf8'));assert.equal(disk.humanAttentionActions.length,1);
  const captured=disk.humanAttentionActions[0].decisionContext;
  assert.equal(captured.asOf,at(2));assert.equal(captured.stateAtDecision[0].assessment,'SINGLE_SOURCE');
  minute=3;await service.ingestOperationalEvent(event('optical',3)); // T7
  result=await projection();assert.equal(result.incidents[0].assessment.corroborationState,'MULTI_SOURCE'); // T8
  assert.ok(result.changes.some(c=>c.type==='corroboration_changed'&&c.after==='MULTI_SOURCE')); // T9
  assert.ok(result.changes.some(c=>c.type==='decision_changed'));
  minute=4;await service.ingestOperationalEvent(health('ACTIVE',4));await service.ingestOperationalEvent(event('official',4)); // T10
  result=await projection();assert.equal(result.incidents[0].assessment.corroborationState,'OFFICIAL_CONFIRMED'); // T11
  assert.ok(!result.incidents[0].recommendations.some(r=>r.what==='Request official confirmation')); // T12
  assert.equal(repository.snapshot().humanAttentionWorkStates[0].state,'IN_PROGRESS','Evidence does not fabricate task completion');
  assert.ok(result.incidents[0].explanation.evidenceIds.length>=3);assert.ok(result.incidents[0].explanation.ruleIds.length); // T13
  assert.equal(repository.snapshot().productionActions.length,0);
  assert.deepEqual(repository.snapshot().humanAttentionActions[0].decisionContext,captured,'later corroboration never rewrites the decision-time snapshot');
  await assert.rejects(()=>human.action({...actor,capabilities:['read:incident_command']},'attention:test',{action:'ASSUME_OWNERSHIP',idempotencyKey:'denied'}),/forbidden/);
});
test('operator intelligence bounds evidence references without falsifying totals or supplying a fallback',()=>{
  const twin=structuredClone(projectOperationalTwin({events:[recorded('thermal',0)],sourceRegistry:registry(),asOf:at(5)}));
  const ids=Array.from({length:2000},(_,i)=>`evidence:isolated-size-test:${i}`);
  twin.incidents[0].assessment.evidenceIds=ids;
  twin.incidents[0].assessment.explanation.evidenceIds=ids;
  const result=withOperatorIntelligence({},twin,actor,null).operationalIntelligence.value;
  assert.equal(result.incidents[0].assessment.evidenceIds.length,20);
  assert.equal(result.incidents[0].assessment.evidenceIdsTotal,2000);
  assert.equal(result.incidents[0].recommendations[0].explanation.evidenceIdsTotal,2000);
  assert.ok(Buffer.byteLength(JSON.stringify(result))<30_000);
  assert.deepEqual(withOperatorIntelligence({},null,actor,null).operationalIntelligence.value,null);
  const decision=withOperatorIntelligence({},twin,actor,null).decisionIntelligence.value;
  assert.equal(decision.assessments[0].transitionConditions.evidenceIds.length,20);
  assert.equal(decision.assessments[0].transitionConditions.evidenceIdsTotal,2000);
  assert.ok(Buffer.byteLength(JSON.stringify(decision))<60_000);
});
