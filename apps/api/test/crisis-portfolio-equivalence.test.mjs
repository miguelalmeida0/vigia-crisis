import test from 'node:test';
import assert from 'node:assert/strict';
import {crisisPortfolio,crisisProjectionForIncident} from '../src/modules/operator/canonical-operator-crisis-projection.mjs';
import {OperationalPeriodService} from '../src/modules/operator/operational-period-service.mjs';

const asOf='2026-09-14T12:00:00Z';
const source=(id,state)=>({incident:{id,label:id,location:{coordinate:[-8,40]}},
  operationalTruth:{classification:'DETECTION_CANDIDATE'},
  informationRequirements:[{id:'requirement:'+id,incidentId:id,state:'UNSATISFIED',question:'Check road access',decisionBlocked:true,collectionTasks:[{id:'task:'+id,incidentId:id,state,owner:'field-team',lastCheckedAt:'2026-09-14T11:50:00Z',nextCheckAt:'2026-09-14T12:10:00Z',source:'FIELDNET'}]}],
  humanAttention:[{id:'attention:'+id,state:'PENDING_HUMAN_DECISION',reason:'Reported obstruction',recommendedOptions:['Check route'],authorityRequirement:{capability:'REVIEW_ROUTE'}}],
  roads:[{id:'road:'+id,source:'Field report',observedAt:'2026-09-14T11:50:00Z',state:'CLOSED'}],
  evidenceGraph:{observations:[]},
});

test('portfolio result equals full incident projection aggregation across active and terminal work',()=>{
  const incidents=['IN_PROGRESS','COMPLETED','BLOCKED','CANCELLED'].map((state,n)=>source('incident:'+n,state));
  const twin={asOf,incidents},before=structuredClone(twin);
  const expected=crisisPortfolio({...twin,incidents:incidents.map(item=>({...item,crisisAutopilot:crisisProjectionForIncident(item,{asOf})}))});
  assert.deepEqual(crisisPortfolio(twin),expected);
  assert.deepEqual(twin,before);
});

test('full incident detail retains immutable temporal sections and projection hashes',()=>{
  const full=crisisProjectionForIncident(source('incident:one','IN_PROGRESS'),{asOf});
  assert.ok(full.projectionHash);assert.ok(full.livingTwin.projectionHash);
  assert.equal(full.livingTwin.temporalIntegrity.state,'AS_OF_BOUNDARY_ENFORCED');
  assert.ok(Object.isFrozen(full));assert.ok(Object.isFrozen(full.livingTwin));
});

test('portfolio preserves supplied projections and empty inventory',()=>{
  assert.equal(crisisPortfolio({asOf,incidents:[]}).autopilot.counts.incidentProjections,0);
  const item=source('incident:one','IN_PROGRESS'),projection=crisisProjectionForIncident(item,{asOf});
  assert.deepEqual(crisisPortfolio({asOf,incidents:[{...item,crisisAutopilot:projection}]}),crisisPortfolio({asOf,incidents:[item]}));
});

test('period portfolio reads only its owned collection and retains snapshot isolation',()=>{
  const periods=[{periodId:'one',state:'ACTIVE',roles:[{person:'Test commander'}]}];
  const repository={snapshot(){throw Error('Unrelated state must not be cloned');},snapshotFields(fields){assert.deepEqual(fields,['operationalPeriods']);return {operationalPeriods:structuredClone(periods)};}};
  const service=new OperationalPeriodService({repository,clock:()=>new Date(asOf)});
  const result=service.snapshot({id:'test',role:'administrator',incidentScopes:['*']});
  assert.equal(result.current.periodId,'one');assert.equal(result.readiness.roleRoster,true);
  result.current.roles[0].person='Changed snapshot';
  assert.equal(periods[0].roles[0].person,'Test commander');
});
