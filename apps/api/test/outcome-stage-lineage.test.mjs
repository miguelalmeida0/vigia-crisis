import test from 'node:test';
import assert from 'node:assert/strict';
import { OutcomeService } from '../src/modules/outcomes/outcome-service.mjs';

const actor={id:'operator:lineage-test',role:'administrator',incidentScopes:['*'],authentication:{authenticated:true,mode:'local_shadow_session'}};

test('outcome lineage counts only distinct persisted records and never aliases resolution requirements',()=>{
  const interventions=[
    {id:'action:one',state:'open',expectedPostconditionId:'postcondition:one'},
    {id:'action:one',state:'open',expectedPostconditionId:'postcondition:one'},
    {id:'action:two',state:'open'},
  ];
  const fieldOperationReceipts=[
    {id:'ack:one',actionId:'action:one'},
    {id:'ack:one',actionId:'action:one'},
    {id:'ack:two',actionId:'action:two'},
  ];
  const reobservations=[
    {id:'observation:one',interventionId:'action:one'},
    {id:'observation:one',interventionId:'action:one'},
  ];
  const service=new OutcomeService({repository:{snapshot:()=>({interventions,fieldOperationReceipts,reobservations,hazards:[],evidencePackages:[],evidenceRequests:[]})}});
  const result=service.snapshot(actor),audit=result.lineageAudit;
  assert.deepEqual(audit.stages.map(stage=>[stage.key,stage.count]),[
    ['INITIATED',2],
    ['ACKNOWLEDGED',2],
    ['POSTCONDITION_DEFINED',1],
    ['POSTCONDITION_OBSERVED',1],
    ['OUTCOME_MEASURED',0],
  ]);
  assert.deepEqual(audit.stages[0].distinctRecordIds,['action:one','action:two']);
  assert.deepEqual(audit.stages[1].distinctRecordIds,['ack:one','ack:two']);
  assert.match(audit.truthBoundary,/Derived work requirements.*excluded/);
});
