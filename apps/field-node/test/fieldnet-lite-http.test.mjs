import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createFieldIncidentPackage, sha256 } from '../../../packages/domain/src/fieldnet/contracts.mjs';
import { signFieldRequest } from '../../../packages/domain/src/fieldnet/request-auth.mjs';

const root=fileURLToPath(new URL('../../..',import.meta.url)),serverEntry=fileURLToPath(new URL('../src/server.mjs',import.meta.url)),scratchRoot=path.join(root,'.tmp/test');

function listening(child) {
  return new Promise((resolve,reject)=>{
    let output='',errors='';const timeout=setTimeout(()=>reject(new Error(`fieldnet_listener_timeout:${output}:${errors}`)),10_000);
    child.stderr.on('data',(chunk)=>{errors+=chunk;});child.once('error',(error)=>{clearTimeout(timeout);reject(error);});child.once('exit',(code)=>{clearTimeout(timeout);reject(new Error(`fieldnet_exited_before_listen:${code}:${output}:${errors}`));});
    child.stdout.on('data',(chunk)=>{output+=chunk;for(const line of output.split('\n'))try{const event=JSON.parse(line);if(event.event==='FIELDNET_LISTENING'){clearTimeout(timeout);resolve(event);return;}}catch{}});
  });
}

function request(port,authority,key,{method='GET',pathname,body=null,nonce}) {
  const encoded=body===null?'':JSON.stringify(body),headers={host:authority,...signFieldRequest({method,path:pathname,keyId:'field-operator',key,body,nonce})};
  if(body!==null){headers['content-type']='application/json';headers['content-length']=Buffer.byteLength(encoded);}
  return new Promise((resolve,reject)=>{const call=http.request({hostname:'127.0.0.1',port,path:pathname,method,headers},(response)=>{const chunks=[];response.on('data',(chunk)=>chunks.push(chunk));response.on('end',()=>{const raw=Buffer.concat(chunks).toString('utf8');resolve({status:response.statusCode,body:raw?JSON.parse(raw):null});});});call.once('error',reject);call.end(encoded);});
}

test('signed FieldNet Lite HTTP flow persists report, task receipt, evidence-bound completion and privacy rejection',async(t)=>{
  await mkdir(scratchRoot,{recursive:true});const directory=await mkdtemp(path.join(scratchRoot,'fieldnet-lite-http-')),authority='fieldnet-lite.test',key='fieldnet-lite-control-key-32-bytes',incidentId='incident:http:lite';
  const child=spawn(process.execPath,[serverEntry],{cwd:root,env:{...process.env,FIELDNET_ALLOW_SHARED_CONTROL_LISTENER:'1',FIELDNET_CONTROL_KEY:key,FIELDNET_CONTROL_INCIDENT_SCOPES:incidentId,FIELDNET_DB_PATH:path.join(directory,'fieldnet.sqlite'),FIELDNET_HOST:'127.0.0.1',FIELDNET_NODE_ID:'field-node:http-lite',FIELDNET_PORT:'0',FIELDNET_PUBLIC_AUTHORITY:authority},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{if(child.exitCode===null){child.kill('SIGTERM');await new Promise((resolve)=>child.once('exit',resolve));}await rm(directory,{recursive:true,force:true});});
  const {port}=await listening(child);let sequence=0;const call=(options)=>request(port,authority,key,{...options,nonce:`fieldnet-lite-http-${String(++sequence).padStart(4,'0')}`});
  const imported=await call({method:'POST',pathname:'/api/fieldnet/incidents/import',body:{package:createFieldIncidentPackage({incidentId,createdAt:'2026-09-04T00:00:00Z'})}});assert.equal(imported.status,201);
  const registered=await call({method:'POST',pathname:'/api/fieldnet/devices',body:{device:{deviceId:'device:http:lite',deviceType:'PHONE',hardwareIdentity:'hardware:http:lite',ownerOperator:'observer:http:lite',capabilities:['STRUCTURED_FIELD_REPORT','TASK_ACK'],timeQuality:'SYNCED',observer:{observerId:'observer:http:lite',observerClass:'AUTHORIZED_RESPONDER',verificationState:'ROLE_ATTESTED',organizationId:'fire-service:http',attestationReference:'attestation:http:lite',attestedBy:'field-operator',attestedAt:'2026-09-04T00:00:00Z'}}}});assert.equal(registered.status,201);assert.equal(registered.body.device.observer.trustBand,'TRUSTED_ROLE_ATTESTED');
  const created=await call({method:'POST',pathname:'/api/fieldnet/verification-tasks',body:{task:{taskId:'task:http:road',incidentId,objective:'Confirm road access from the governed safe point.',owner:'team:http:field',dueAt:'2099-09-04T01:00:00Z',acknowledgeBy:'2099-09-04T00:30:00Z',location:{type:'Point',coordinates:[-8.6,41.1]},safeZoneConstraint:{mode:'KNOWN_SAFE_POINT',instruction:'Remain at the governed safe point.',hazardExclusionM:500},targetObserverClasses:['AUTHORIZED_RESPONDER'],expectedReportTypes:['ROAD_ACCESS'],requiredEvidence:['CURRENT_ACCESS_STATE','GNSS_POINT'],completionCriteria:'One linked attributable road report is persisted.'}}});assert.equal(created.status,201);assert.equal(created.body.task.taskType,'FIELD_VERIFICATION');
  const ackPath='/api/fieldnet/tasks/task%3Ahttp%3Aroad/verification-acknowledgements',ack=await call({method:'POST',pathname:ackPath,body:{taskVersion:1,deviceId:'device:http:lite',sessionId:'session:http:lite',disposition:'ACCEPTED',safetyState:'SAFE_TO_PROCEED'}});assert.equal(ack.status,201);assert.equal(ack.body.task.state,'ACKNOWLEDGED');
  const reportBody={report:{reportId:'report:http:road',reportType:'ROAD_ACCESS',incidentId,deviceId:'device:http:lite',sessionId:'session:http:lite',observedAt:'2026-09-04T00:10:00Z',receivedAt:'2026-09-04T00:11:00Z',connectivityAtCapture:'OFFLINE',geometry:{type:'Point',coordinates:[-8.6,41.1]},horizontalUncertaintyM:6,rawEvidenceHash:sha256('http-road-report'),linkedTaskId:'task:http:road',structuredAnswers:{roadId:'N2:http',accessState:'PASSABLE',vehicleClasses:['EMERGENCY'],alternativeRouteKnown:'UNKNOWN'}}};
  const reported=await call({method:'POST',pathname:'/api/fieldnet/reports',body:reportBody});assert.equal(reported.status,201);assert.equal(reported.body.observation.reportState,'OBSERVATION_PENDING_GOVERNED_ADMISSION');
  const completed=await call({method:'POST',pathname:'/api/fieldnet/tasks/task%3Ahttp%3Aroad/completion',body:{taskVersion:2,evidenceObservationIds:['report:http:road']}});assert.equal(completed.status,201);assert.equal(completed.body.task.state,'COMPLETED');
  const receipts=await call({pathname:'/api/fieldnet/tasks/task%3Ahttp%3Aroad/acknowledgements'});assert.equal(receipts.status,200);assert.equal(receipts.body.acknowledgements[0].disposition,'ACCEPTED');
  const pii=await call({method:'POST',pathname:'/api/fieldnet/reports',body:{report:{...reportBody.report,reportId:'report:http:pii',rawEvidenceHash:sha256('http-pii-report'),note:'Call +351 912 345 678.'}}});assert.equal(pii.status,409);assert.equal(pii.body.error,'field_report_pii_rejected');
  const observations=await call({pathname:`/api/fieldnet/incidents/${encodeURIComponent(incidentId)}/observations`});assert.equal(observations.status,200);assert.deepEqual(observations.body.observations.map((item)=>item.observationId),['report:http:road']);
});
