import assert from 'node:assert/strict';
import test from 'node:test';
import { appendPilotRecord,createPilotSession,endPilotSession,pilotSessionCsv } from '../../operator-console/src/pilotSession.js';
import { deriveRuntimeChanges,humanDecisionChange } from '../../operator-console/src/decisionDelta.js';
import { buildHandoffSnapshot,buildIncidentBrief,canonicalJson,safeExportName,sha256 } from '../../operator-console/src/operationalExports.js';
import { commandProjection } from '../src/modules/mission/command-projection-routes.mjs';

test('pilot session exports only actual bounded records and neutralizes spreadsheet formulas',()=>{
  let session=createPilotSession({id:'=pilot:test',startedAt:'2026-08-21T12:00:00Z'});
  session=appendPilotRecord(session,'TASK_MARKER',{task:'=IMPORT("secret")'},'2026-08-21T12:01:00Z');
  session=endPilotSession(session,'2026-08-21T12:02:00Z');
  assert.deepEqual(session.records.map(item=>item.type),['SESSION_STARTED','TASK_MARKER','SESSION_ENDED']);
  const csv=pilotSessionCsv(session);
  assert.match(csv,/"'=pilot:test"/);
  assert.doesNotMatch(csv,/success|rating/i);
});

test('pilot facilitator observations remain explicitly human-entered and bounded',()=>{
  let session=createPilotSession({id:'pilot:human',startedAt:'2026-08-21T12:00:00Z'});
  session=appendPilotRecord(session,'FACILITATOR_OBSERVATION',{task:'Find evidence gap',completed:true,trustRating:4,notes:'Authorization: Bearer do-not-export',secret:'token=do-not-export',nested:{apiKey:'also-secret'}},'2026-08-21T12:01:00Z');
  const observation=session.records.at(-1);
  assert.equal(observation.type,'FACILITATOR_OBSERVATION');
  assert.equal(observation.data.trustRating,4);
  assert.equal(observation.data.secret,'[REDACTED]');
  assert.equal(observation.data.nested.apiKey,'[REDACTED]');
  assert.doesNotMatch(observation.data.notes,/do-not-export/);
});

test('decision delta separates new facts, recomputed views, source changes and human decisions',()=>{
  const previous={events:{events:[{id:'PT-1',lastSeenAt:'2026-08-21T12:00:00Z',knowledgeState:'UNKNOWN',physicalSourceProfile:{observationCount:1}}],sources:{firms:{label:'FIRMS',state:'stale'}}}};
  const current={events:{events:[{id:'PT-1',lastSeenAt:'2026-08-21T12:01:00Z',knowledgeState:'CURRENT',physicalSourceProfile:{observationCount:2}},{id:'PT-2',lastSeenAt:'2026-08-21T12:01:00Z'}],sources:{firms:{label:'FIRMS',state:'current'}}}};
  const rows=deriveRuntimeChanges(previous,current,'2026-08-21T12:02:00Z');
  assert.ok(rows.some(item=>item.category==='NEW FACT'&&item.entityId==='PT-1'));
  assert.ok(rows.some(item=>item.category==='NEW FACT'&&item.entityId==='PT-2'));
  assert.ok(rows.some(item=>item.category==='SOURCE STATUS CHANGE'));
  assert.equal(humanDecisionChange({entityId:'PT-1',label:'Alert acknowledged',to:'ACKNOWLEDGED',basis:'Canonical API receipt',changedAt:'2026-08-21T12:02:00Z'}).category,'HUMAN DECISION');
});

test('incident brief and handoff preserve unavailable truth boundaries',async()=>{
  const event={id:'PT-1',label:'Real event',coordinate:[-8,40],physicalOperationalState:'UNKNOWN',physicalState:{freshness:'delayed'},physicalSourceProfile:{families:['VIIRS']},observations:[]};
  const brief=buildIncidentBrief({event,operations:null,needs:[],requests:[],sources:[],changes:[],generatedAt:'2026-08-21T12:00:00Z'});
  assert.equal(brief.command.state,'NOT CONFIGURED');
  assert.ok(brief.unknowns.includes('INCIDENT_COMMAND_NOT_LINKED'));
  assert.equal(brief.incident.missingQuantity,null);
  const handoff=buildHandoffSnapshot({events:[event],selectedEvent:event,fieldnet:null,createdAt:'2026-08-21T12:00:00Z'});
  assert.equal(handoff.fieldnet.state,'UNAVAILABLE');
  assert.match(await sha256(handoff),/^sha256:[a-f0-9]{64}$/);
  assert.equal(canonicalJson({b:1,a:2}),'{"a":2,"b":1}');
  assert.equal(safeExportName('../../=danger'),'danger');
});

test('public command projection minimizes credential-bearing provenance',()=>{
  const projected=commandProjection({meta:{},actor:{id:'public'},control:{actors:[]},sources:{},prevention:{findings:[{findingId:'finding-1',provenance:{previewUrl:'https://assets.example.test/a.tif?X-Amz-Credential=secret&X-Amz-Signature=value',authorization:'Bearer secret',nested:{cookie:'secret',provider:'Sentinel-2'}}}]},operations:{evidenceNeeds:[],evidenceRequests:[]}});
  const provenance=projected.prevention.findings[0].provenance;
  assert.equal(provenance.previewUrl,'https://assets.example.test/a.tif');
  assert.equal(provenance.authorization,undefined);
  assert.equal(provenance.nested.cookie,undefined);
  assert.equal(provenance.nested.provider,'Sentinel-2');
  assert.doesNotMatch(JSON.stringify(provenance),/secret|x-amz/i);
});
