import test from 'node:test';
import assert from 'node:assert/strict';
import { previewIncidentImport } from '../../../packages/domain/src/incident-command/ingestion.mjs';
import { hash } from '../../../packages/domain/src/incident-command/contracts.mjs';
import { evidenceKind,isOpenEvidenceNeed,openEvidenceNeeds,physicalEvidenceGroups } from '../../operator-console/src/viewModel.js';

test('only explicit unresolved evidence states enter open projections',()=>{
  const needs=[{id:'open',state:'REQUEST_ACTIVE',subjectId:'PT-1'},{id:'capacity',state:'FIELD_CAPACITY_NOT_CONFIGURED',subjectId:'PT-1'},{id:'resolved',state:'RESOLVED',subjectId:'PT-1'},{id:'cancelled',state:'CANCELLED',subjectId:'PT-1'},{id:'unknown',subjectId:'PT-1'}];
  assert.deepEqual(needs.map(isOpenEvidenceNeed),[true,true,false,false,false]);
  assert.deepEqual(openEvidenceNeeds({runtime:{evidenceNeeds:{needs}}},{eventId:'PT-1'}).map((item)=>item.id),['open','capacity']);
});

test('evidence kinds are mechanically exclusive and report repetition never becomes physical independence',()=>{
  assert.equal(evidenceKind({type:'report',sourceIdentity:{kind:'HUMAN'}}),'PUBLIC_REPORT');
  assert.equal(evidenceKind({type:'field_report',sourceIdentity:{kind:'HUMAN',field:true}}),'FIELD_REPORT');
  assert.equal(evidenceKind({type:'imported_record',importMode:'MANUAL_SHADOW_NOT_LIVE_SYNCED'}),'IMPORTED_RECORD');
  assert.equal(evidenceKind({type:'screening_result'}),'SCREENING_RESULT');
  assert.equal(evidenceKind({type:'thermal',sourceFamily:'viirs'}),'PHYSICAL_OBSERVATION');
  const groups=physicalEvidenceGroups({observations:[{id:'r1',type:'report',sourceFamily:'civil-protection'},{id:'r2',type:'report',sourceFamily:'civil-protection'},{id:'p1',type:'thermal',sourceFamily:'viirs'},{id:'p2',type:'thermal',sourceFamily:'viirs'}]});
  assert.equal(groups.length,1);assert.equal(groups[0].key,'viirs');assert.equal(groups[0].rows.length,2);
});

test('incident import receipt hash binds effective accepted/rejected envelope and incident identity',()=>{
  const base={adapter:'ROSTER_JSON',universe:'SHADOW',sourceSystem:'MANUAL_IMPORT:ROSTER_JSON:pilot.json',sourceFilename:'../../<img onerror=alert(1)>.json',incidentId:'incident:one',canonicalEventIds:['PT-1'],reportRecordIds:[],sourcePayload:{people:[{personId:'person:one',name:'Operator One'}]}};
  const first=previewIncidentImport(base,{releaseId:'release:test'}),replay=previewIncidentImport(base,{releaseId:'release:test'});
  assert.equal(first.status,'VALID');assert.equal(first.sourcePayloadHash,replay.sourcePayloadHash);assert.equal(first.sourcePayloadHash,hash(first.validated.receiptEnvelope));assert.equal(first.sourceFilename,'_img_onerror_alert_1_.json');assert.equal(first.importMode,'MANUAL_SHADOW_NOT_LIVE_SYNCED');
  assert.equal(first.validated.releaseId,'release:test');assert.equal(first.validated.receiptEnvelope.releaseId,'release:test');
  const forgedRelease=previewIncidentImport({...base,releaseId:'release:forged'},{releaseId:'release:test'});assert.equal(forgedRelease.status,'REJECTED');assert.equal(forgedRelease.sourcePayloadHash,null);assert.equal(forgedRelease.rejections[0].code,'incident_import_release_identity_mismatch');
  assert.notEqual(previewIncidentImport({...base,incidentId:'incident:two'},{releaseId:'release:test'}).sourcePayloadHash,first.sourcePayloadHash);
  assert.notEqual(previewIncidentImport({...base,people:[{personId:'person:one',name:'Changed accepted value'}]},{releaseId:'release:test'}).sourcePayloadHash,first.sourcePayloadHash);
  const partial=previewIncidentImport({...base,sourcePayload:{people:[{personId:'person:one',name:'Operator One'},{name:'Rejected'}]}},{releaseId:'release:test'});assert.equal(partial.status,'PARTIALLY_VALID');assert.notEqual(partial.sourcePayloadHash,first.sourcePayloadHash);assert.equal(partial.validated.receiptEnvelope.rejected[0].code,'personId_required');
});
