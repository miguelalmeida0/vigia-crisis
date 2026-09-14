import test from 'node:test';
import assert from 'node:assert/strict';
import { commandEvent } from '../../src/incident-command/contracts.mjs';
import { applyIncidentCommandEvent, emptyIncidentState } from '../../src/incident-command/reducer.mjs';
import { createLocationReport, projectLocation } from '../../src/incident-command/location-truth.mjs';
import { roleProjection } from '../../src/incident-command/projections.mjs';
import { targetCriticalChange } from '../../src/incident-command/targeting.mjs';
import { previewIncidentImport,validateIncidentImport } from '../../src/incident-command/ingestion.mjs';

const incidentId='PT-REAL-COMMAND-1',releaseId='test-release';
let sequence=0;
const event=(type,payload,extra={})=>{sequence+=1;const observedAt=new Date(Date.parse('2026-08-14T10:00:00Z')+sequence*1_000).toISOString();return commandEvent({incidentId,type,payload,eventId:`event-${sequence}`,releaseId,source:'TEST',author:'operator:test',responsibleOwner:'operator:test',observedAt,receivedAt:new Date(Date.parse(observedAt)+500).toISOString(),...extra});};
const seeded=()=>[
  event('INCIDENT_IMPORTED',{importHash:'hash-1',universe:'SHADOW',canonicalEventIds:[incidentId],name:'Governed exercise'}),
  event('PERSON_UPSERTED',{personId:'person:officer',name:'Officer',currentCrewId:'crew:alpha',operationalState:'WORKING'}),
  event('PERSON_UPSERTED',{personId:'person:member',name:'Member',currentCrewId:'crew:alpha',operationalState:'WORKING'}),
  event('CREW_UPSERTED',{crewId:'crew:alpha',leaderId:'person:officer',memberIds:['person:officer','person:member'],operationalAreaId:'area:north',operationalState:'WORKING'})
].reduce(applyIncidentCommandEvent,emptyIncidentState(incidentId));

test('imports are canonical-event bound and SHADOW adapters cannot enter production truth',()=>{
  const base={adapter:'SHADOW_JSON',universe:'SHADOW',sourceSystem:'exercise',incidentId,canonicalEventIds:[incidentId],sourcePayload:{id:1}};
  const validated=validateIncidentImport(base,{releaseId});assert.equal(validated.canonicalEventIds[0],incidentId);assert.match(validated.sourcePayloadHash,/^[a-f0-9]{64}$/);
  assert.equal(validated.releaseId,releaseId);
  assert.equal(validateIncidentImport({...base,releaseId},{releaseId}).releaseId,releaseId);
  assert.throws(()=>validateIncidentImport({...base,releaseId:'caller-controlled-release'},{releaseId}),/incident_import_release_identity_mismatch/);
  const mismatch=previewIncidentImport({...base,releaseId:'caller-controlled-release'},{releaseId});assert.equal(mismatch.status,'REJECTED');assert.equal(mismatch.rejections[0].code,'incident_import_release_identity_mismatch');
  assert.throws(()=>validateIncidentImport({...base,universe:'PRODUCTION'},{releaseId}),/shadow_roster_cannot_enter_production_truth/);
  assert.throws(()=>validateIncidentImport({...base,canonicalEventIds:[]},{releaseId}),/canonical_vigia_event_required/);
});

test('CAD and roster CSV adapters normalize typed records while retaining the original hash',()=>{
  const sourcePayload='record_type,entity_id,payload_json\nINCIDENT,,"{""name"":""North Ridge""}"\nPERSON,person:1,"{""name"":""FF One"",""operationalState"":""AVAILABLE""}"\nCREW,crew:1,"{""name"":""Alpha"",""memberIds"":[""person:1""]}"';
  const result=validateIncidentImport({adapter:'CAD_CSV',universe:'SHADOW',sourceSystem:'cad:exercise',incidentId,canonicalEventIds:[incidentId],sourcePayload},{releaseId});
  assert.equal(result.incident.name,'North Ridge');assert.equal(result.people[0].personId,'person:1');assert.deepEqual(result.crews[0].memberIds,['person:1']);assert.match(result.sourcePayloadHash,/^[a-f0-9]{64}$/);
});

test('manual import preview isolates malformed records without discarding valid rows',()=>{
  const sourcePayload='record_type,entity_id,payload_json\nINCIDENT,,"{""name"":""North Ridge""}"\nPERSON,person:1,"{""name"":""FF One""}"\nPERSON,,"{""name"":""Missing identity""}"\nRESOURCE,engine:1,{broken\nALIEN,row:1,"{""value"":1}"';
  const preview=previewIncidentImport({adapter:'CAD_CSV',universe:'SHADOW',sourceSystem:'MANUAL_IMPORT:CAD_CSV:test.csv',incidentId,canonicalEventIds:[incidentId],sourcePayload},{releaseId});
  assert.equal(preview.status,'PARTIALLY_VALID');
  assert.equal(preview.recordCounts.incident,1);
  assert.equal(preview.recordCounts.people,1);
  assert.ok(preview.rejections.some((item)=>item.code==='personId_required'));
  assert.ok(preview.rejections.some((item)=>item.code==='invalid_payload_json'));
  assert.ok(preview.rejections.some((item)=>item.code==='unsupported_record_type'));
  assert.equal(preview.validated.people[0].personId,'person:1');
});

test('manual import preview rejects unsupported adapters and oversized payloads',()=>{
  assert.equal(previewIncidentImport({adapter:'XLSX',sourcePayload:''},{releaseId}).status,'UNSUPPORTED');
  const preview=previewIncidentImport({adapter:'ROSTER_JSON',universe:'SHADOW',sourceSystem:'MANUAL_IMPORT:ROSTER_JSON:test.json',incidentId,canonicalEventIds:[incidentId],sourcePayload:{people:[{personId:'person:1'}],padding:'x'.repeat(100)}},{releaseId,maxPayloadBytes:20});
  assert.equal(preview.status,'REJECTED');
  assert.equal(preview.rejections[0].code,'incident_import_payload_too_large');
});

test('manual imports reject reserved identifiers and bounded-row amplification',()=>{
  const reserved=previewIncidentImport({adapter:'ROSTER_JSON',universe:'SHADOW',sourceSystem:'MANUAL_IMPORT:ROSTER_JSON:reserved.json',incidentId,canonicalEventIds:[incidentId],sourcePayload:{incident:{name:'Reserved probe'},people:[{personId:'__proto__',name:'Unsafe'}]}},{releaseId});
  assert.equal(reserved.status,'PARTIALLY_VALID');
  assert.equal(reserved.recordCounts.people,0);
  assert.ok(reserved.rejections.some(item=>item.code==='incident_import_identifier_reserved'));
  assert.throws(()=>applyIncidentCommandEvent(emptyIncidentState(incidentId),event('PERSON_UPSERTED',{personId:'constructor',name:'Unsafe'})),/incident_command_identifier_invalid/);
  const rows=['record_type,entity_id,payload_json',...Array.from({length:2_001},(_,index)=>`PERSON,person:${index},"{""name"":""Row ${index}""}"`)].join('\n');
  const amplified=previewIncidentImport({adapter:'ROSTER_CSV',universe:'SHADOW',sourceSystem:'MANUAL_IMPORT:ROSTER_CSV:many.csv',incidentId,canonicalEventIds:[incidentId],sourcePayload:rows},{releaseId});
  assert.equal(amplified.status,'REJECTED');
  assert.equal(amplified.rejections[0].code,'incident_import_record_limit_exceeded');
});

test('OUT requires attributable checkpoint evidence and geofences cannot assert exit',()=>{
  const state=seeded();
  assert.throws(()=>applyIncidentCommandEvent(state,event('PERSON_STATE_TRANSITIONED',{personId:'person:member',state:'OUT'})),/attributable_exit_checkpoint_required/);
  const next=applyIncidentCommandEvent(state,event('EXIT_CHECKPOINT_CONFIRMED',{personId:'person:member',checkpointId:'checkpoint:west',checkpointEvidence:{observerId:'officer',method:'VISUAL_CONFIRMED'}}));
  assert.equal(next.persons['person:member'].operationalState,'OUT');
});

test('location truth preserves uncertainty, staleness and unknown position',()=>{
  const report=createLocationReport({incidentId,personId:'person:member',verificationState:'DEVICE_ESTIMATED',geometry:{type:'Point',coordinates:[-8.1,39.7]},horizontalUncertaintyM:120,source:'FIELD_DEVICE',observedAt:'2026-08-14T10:00:00Z'},{now:new Date('2026-08-14T10:00:05Z'),releaseId,actor:'operator:test'});
  assert.equal(projectLocation(report,{now:new Date('2026-08-14T10:01:00Z')}).display,'UNCERTAINTY_REGION');
  assert.equal(projectLocation(report,{now:new Date('2026-08-14T10:10:00Z')}).verificationState,'STALE');
  assert.throws(()=>createLocationReport({incidentId,personId:'person:member',verificationState:'UNKNOWN',geometry:{type:'Point',coordinates:[0,0]},source:'RADIO'},{releaseId}),/unknown_location_cannot_have_exact_geometry/);
});

test('confirmed location requires a governed checkpoint transition and projections distrust an unverified envelope',()=>{
  const input={incidentId,personId:'person:member',verificationState:'CONFIRMED',geometry:{type:'Point',coordinates:[-8.1,39.7]},source:'ACCOUNTABILITY_CHECKPOINT',observedAt:'2026-08-14T10:00:00Z',checkpointId:'checkpoint:west',observerId:'claimed:observer'};
  assert.throws(()=>createLocationReport(input,{releaseId,actor:'operator:test',eventVerificationState:'VERIFIED'}),/confirmed_location_transition_required/);
  const report=createLocationReport(input,{releaseId,actor:'operator:test',eventVerificationState:'VERIFIED',confirmationAuthority:{validated:true,checkpointId:'checkpoint:west',observerId:'operator:test'}});
  assert.equal(report.observerId,'operator:test');assert.equal(report.claimedObserverId,'claimed:observer');assert.equal(projectLocation(report,{now:new Date('2026-08-14T10:01:00Z')}).display,'CONFIRMED_POINT');
  const malicious={...report,eventVerificationState:'UNVERIFIED'},state=applyIncidentCommandEvent(seeded(),event('LOCATION_REPORTED',malicious,{verificationState:'UNVERIFIED'}));
  assert.equal(state.locations['person:member'].claimedVerificationState,'CONFIRMED');assert.equal(state.locations['person:member'].verificationState,'REPORTED');assert.equal(projectLocation(state.locations['person:member'],{now:new Date('2026-08-14T10:01:00Z')}).display,'APPROXIMATE_POINT');
});

test('closed-loop order acknowledgement is not completion',()=>{
  let state=seeded();state=applyIncidentCommandEvent(state,event('ORDER_CREATED',{orderId:'order:evac',orderType:'EVACUATE',intendedRecipients:['crew:alpha']}));
  for(const step of ['AUTHORIZED','SENT','DELIVERED','ACKNOWLEDGED'])state=applyIncidentCommandEvent(state,event('ORDER_TRANSITIONED',{orderId:'order:evac',state:step,recipientId:step==='ACKNOWLEDGED'?'crew:alpha':undefined,acknowledgement:step==='ACKNOWLEDGED'?{actor:'person:officer'}:undefined}));
  assert.equal(state.orders['order:evac'].state,'ACKNOWLEDGED');assert.notEqual(state.orders['order:evac'].state,'COMPLETED');
  state=applyIncidentCommandEvent(state,event('ORDER_TRANSITIONED',{orderId:'order:evac',state:'ACTION_UNDERWAY',progress:{report:'WITHDRAWING'}}));
  assert.throws(()=>applyIncidentCommandEvent(state,event('ORDER_TRANSITIONED',{orderId:'order:evac',state:'COMPLETED'})),/order_completion_evidence_required/);
});

test('evacuation requires every exit, reunion and PAR before completion',()=>{
  let state=seeded();state=applyIncidentCommandEvent(state,event('EVACUATION_CREATED',{evacuationId:'evac:1',crewIds:['crew:alpha']}));
  for(const step of ['ORDER_SENT','ORDER_DELIVERED','CREW_ACKNOWLEDGED','CREW_WITHDRAWING'])state=applyIncidentCommandEvent(state,event('EVACUATION_TRANSITIONED',{evacuationId:'evac:1',state:step}));
  assert.throws(()=>applyIncidentCommandEvent(state,event('EVACUATION_TRANSITIONED',{evacuationId:'evac:1',state:'MEMBERS_EXIT_CONFIRMED',evidence:{allMembersExited:false}})),/all_member_exit/);
  assert.throws(()=>applyIncidentCommandEvent(state,event('EVACUATION_TRANSITIONED',{evacuationId:'evac:1',state:'MEMBERS_EXIT_CONFIRMED',evidence:{allMembersExited:true,memberIds:['person:officer','person:member']}})),/all_member_exit/);
  for(const personId of ['person:officer','person:member'])state=applyIncidentCommandEvent(state,event('EXIT_CHECKPOINT_CONFIRMED',{personId,checkpointId:'checkpoint:west',checkpointEvidence:{observerId:'accountability:1',method:'VISUAL_PASSPORT_MATCH'}}));
  for(const [step,evidence] of [['MEMBERS_EXIT_CONFIRMED',{memberIds:['person:officer','person:member'],confirmedBy:'accountability:1'}],['CREW_REUNITED',{crewReunited:true}],['PAR_CONFIRMED',{parConfirmed:true}],['COMPLETE',{}]])state=applyIncidentCommandEvent(state,event('EVACUATION_TRANSITIONED',{evacuationId:'evac:1',state:step,evidence}));
  assert.equal(state.evacuations['evac:1'].state,'COMPLETE');
  assert.deepEqual(Object.keys(state.evacuations['evac:1'].memberExitConfirmations).sort(),['person:member','person:officer']);
});

test('PAR completion is derived from every scoped response, never a caller completion flag',()=>{
  let state=seeded();state=applyIncidentCommandEvent(state,event('PAR_REQUESTED',{parRequestId:'par:1',subjectIds:['crew:alpha','crew:rit']}));
  state=applyIncidentCommandEvent(state,event('PAR_RESPONDED',{parRequestId:'par:1',subjectId:'crew:alpha',accounted:true,complete:true}));
  assert.equal(state.parRequests['par:1'].state,'OPEN');
  state=applyIncidentCommandEvent(state,event('PAR_RESPONDED',{parRequestId:'par:1',subjectId:'crew:rit',accounted:true}));
  assert.equal(state.parRequests['par:1'].state,'COMPLETE');
});

test('Mayday remains pinned and suppresses nonessential information until physical recovery',()=>{
  let state=seeded();state=applyIncidentCommandEvent(state,event('MAYDAY_ACTIVATED',{maydayId:'mayday:1',personId:'person:member',timers:{}}));
  assert.equal(roleProjection(state,'INCIDENT_COMMAND',{now:new Date('2026-08-14T11:00:00Z')}).priority.suppressNonessential,true);
  for(const step of ['ACKNOWLEDGED','RESCUE_ASSIGNED','RESCUE_ENTRY'])state=applyIncidentCommandEvent(state,event('MAYDAY_TRANSITIONED',{maydayId:'mayday:1',state:step}));
  assert.throws(()=>applyIncidentCommandEvent(state,event('MAYDAY_TRANSITIONED',{maydayId:'mayday:1',state:'PHYSICALLY_RECOVERED'})),/physical_recovery_evidence/);
  state=applyIncidentCommandEvent(state,event('MAYDAY_TRANSITIONED',{maydayId:'mayday:1',state:'PHYSICALLY_RECOVERED',physicalRecoveryEvidence:{checkpointId:'checkpoint:west',confirmedBy:'rescue:leader'}}));
  assert.equal(state.maydays['mayday:1'].pinned,false);assert.equal(state.persons['person:member'].operationalState,'OUT');assert.equal(state.operatingState,'NORMAL');
});

test('critical change targeting is explainable and all seven role projections exist',()=>{
  const state=seeded(),change=targetCriticalChange({incidentId,type:'WATER_LOST',owner:'water:officer',affectedOperationalAreaIds:['area:north']},state);
  assert.ok(change.targeting.recipients.includes('crew:alpha'));assert.ok(change.targeting.recipients.includes('WATER_SUPPLY'));
  for(const role of ['FIREFIGHTER','COMPANY_OFFICER','DIVISION_SUPERVISOR','INCIDENT_COMMAND','DISPATCH_EOC','ACCOUNTABILITY','MAYDAY_RESCUE'])assert.equal(roleProjection(state,role,{subjectId:role==='FIREFIGHTER'?'person:member':role==='COMPANY_OFFICER'?'crew:alpha':null}).role,role);
});

test('water flow, supporting entities, critical delivery and organization advisories are explicit',()=>{
  let state=seeded();
  assert.throws(()=>applyIncidentCommandEvent(state,event('WATER_STATE_RECORDED',{waterSupplyStateId:'water:state:1',flowState:'FLOWING',pumpState:'ENGAGED'})),/water_flow_evidence_required/);
  state=applyIncidentCommandEvent(state,event('WATER_STATE_RECORDED',{waterSupplyStateId:'water:state:1',flowState:'FLOWING',pumpState:'ENGAGED',flowEvidence:{source:'FLOW_METER',observerId:'water:officer'}}));
  state=applyIncidentCommandEvent(state,event('SEARCH_SECTOR_UPSERTED',{searchSectorId:'sector:1',name:'North search'}));
  state=applyIncidentCommandEvent(state,event('EVACUATION_ZONE_UPSERTED',{evacuationZoneId:'zone:1',name:'West egress'}));
  state=applyIncidentCommandEvent(state,event('WELFARE_EVENT_RECORDED',{welfareEventId:'welfare:1',personId:'person:member',state:'CHECK_REQUIRED'}));
  const change=targetCriticalChange({incidentId,type:'WATER_LOST',criticalChangeId:'change:1',owner:'water:officer',affectedCrewIds:['crew:alpha']},state);
  state=applyIncidentCommandEvent(state,event('CRITICAL_CHANGE_RECORDED',change));
  state=applyIncidentCommandEvent(state,event('CRITICAL_CHANGE_DELIVERY_RECORDED',{criticalChangeId:'change:1',recipientId:'crew:alpha',deliveryState:'ACKNOWLEDGED'}));
  state=applyIncidentCommandEvent(state,event('ASSIGNMENT_ISSUED',{assignmentId:'assignment:1',operationalAreaId:'area:south',supervisorId:'person:officer'}));
  state=applyIncidentCommandEvent(state,event('CREW_UPSERTED',{crewId:'crew:alpha',assignmentId:'assignment:1'}));
  state=applyIncidentCommandEvent(state,event('COMMAND_ORGANIZATION_SET',{incidentCommanderId:'person:officer',commandRoles:[{commandRoleId:'role:operations',directReportIds:['1','2','3','4','5','6','7','8']}]}));
  const projection=roleProjection(state,'INCIDENT_COMMAND',{now:new Date('2026-08-14T10:10:00Z')});
  assert.equal(state.criticalChanges['change:1'].targeting.deliveryState['crew:alpha'],'ACKNOWLEDGED');
  assert.deepEqual([Object.keys(state.searchSectors).length,Object.keys(state.evacuationZones).length,Object.keys(state.welfareEvents).length],[1,1,1]);
  assert.ok(projection.advisories.some((item)=>item.rule==='AREA_CHANGE_WITHOUT_ASSIGNMENT'));
  assert.ok(projection.advisories.some((item)=>item.rule==='SPAN_OF_CONTROL_WARNING'));
});
