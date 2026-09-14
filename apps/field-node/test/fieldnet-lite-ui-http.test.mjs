import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createFieldIncidentPackage, sha256 } from '../../../packages/domain/src/fieldnet/contracts.mjs';
import { signFieldRequest } from '../../../packages/domain/src/fieldnet/request-auth.mjs';

const root=fileURLToPath(new URL('../../..',import.meta.url)),serverEntry=fileURLToPath(new URL('../src/server.mjs',import.meta.url)),launcherEntry=fileURLToPath(new URL('../src/lite-launcher.mjs',import.meta.url)),scratchRoot=path.join(root,'.tmp/test');

function listening(child){return new Promise((resolve,reject)=>{let output='',errors='';const timeout=setTimeout(()=>reject(new Error(`fieldnet_listener_timeout:${output}:${errors}`)),10_000);child.stderr.on('data',(chunk)=>{errors+=chunk;});child.once('error',reject);child.once('exit',(code)=>reject(new Error(`fieldnet_early_exit:${code}:${errors}`)));child.stdout.on('data',(chunk)=>{output+=chunk;for(const line of output.split('\n'))try{const event=JSON.parse(line);if(event.event==='FIELDNET_LISTENING'){clearTimeout(timeout);resolve(event);}}catch{}});});}

function request({socketPath,port,host='fieldnode.local',method='GET',pathname,body=null,headers={}}){
  const encoded=body===null?'':JSON.stringify(body),options={path:pathname,method,headers:{host,...headers}};if(socketPath)options.socketPath=socketPath;else Object.assign(options,{hostname:'127.0.0.1',port});if(body!==null){options.headers['content-type']='application/json';options.headers['content-length']=Buffer.byteLength(encoded);}
  return new Promise((resolve,reject)=>{const call=http.request(options,(response)=>{const chunks=[];response.on('data',(chunk)=>chunks.push(chunk));response.on('end',()=>{const raw=Buffer.concat(chunks).toString('utf8'),type=String(response.headers['content-type']??'');resolve({status:response.statusCode,headers:response.headers,raw,body:type.includes('json')&&raw?JSON.parse(raw):null});});});call.once('error',reject);call.end(encoded);});
}

test('phone UI is control-listener-only and uses an incident-scoped keyless browser session',async(t)=>{
  await mkdir(scratchRoot,{recursive:true});const directory=await mkdtemp(path.join(scratchRoot,'fieldnet-lite-ui-')),socketPath=path.join(directory,'control.sock'),key='fieldnet-lite-ui-control-key-32-bytes',incidentId='incident:lite-ui';
  const child=spawn(process.execPath,[serverEntry],{cwd:root,env:{...process.env,FIELDNET_CONTROL_SOCKET:socketPath,FIELDNET_CONTROL_KEY:key,FIELDNET_CONTROL_INCIDENT_SCOPES:incidentId,FIELDNET_DB_PATH:path.join(directory,'field.sqlite'),FIELDNET_HOST:'127.0.0.1',FIELDNET_NODE_ID:'field-node:lite-ui',FIELDNET_PORT:'0'},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{if(child.exitCode===null){child.kill('SIGTERM');await new Promise((resolve)=>child.once('exit',resolve));}await rm(directory,{recursive:true,force:true});});
  const ready=await listening(child);let nonce=0;
  const signed=({method='GET',pathname,body=null})=>request({socketPath,method,pathname,body,headers:signFieldRequest({method,path:pathname,keyId:'field-operator',key,body,nonce:`ui-test-${++nonce}`})});
  assert.equal((await signed({method:'POST',pathname:'/api/fieldnet/incidents/import',body:{package:createFieldIncidentPackage({incidentId,createdAt:'2026-09-04T00:00:00Z'})}})).status,201);
  assert.equal((await signed({method:'POST',pathname:'/api/fieldnet/devices',body:{device:{deviceId:'device:lite-ui',deviceType:'PHONE',hardwareIdentity:'hardware:lite-ui',ownerOperator:'observer:lite-ui',capabilities:['STRUCTURED_FIELD_REPORT','TASK_ACK'],timeQuality:'SYNCED',observer:{observerId:'observer:lite-ui',observerClass:'AUTHORIZED_RESPONDER',verificationState:'ROLE_ATTESTED',organizationId:'fire-service:lite-ui',attestationReference:'attestation:lite-ui',attestedBy:'field-operator',attestedAt:'2026-09-04T00:00:00Z'}}}})).status,201);

  const shell=await request({socketPath,pathname:'/fieldnet-lite/'});assert.equal(shell.status,200);assert.match(shell.raw,/Report from field/i);assert.equal(shell.raw.includes(key),false);
  const scripts=await Promise.all(['app.js','core.js','report.js','tasks.js'].map((asset)=>request({socketPath,pathname:`/fieldnet-lite/${asset}`})));
  assert.equal(scripts.every((script)=>script.status===200),true);const source=scripts.map((script)=>script.raw).join('\n');assert.match(source,/indexedDB\.open/);assert.match(source,/navigator\.geolocation/);assert.match(source,/CONFLICT_REQUIRES_REVIEW/);assert.match(source,/Voice note|audio/);assert.equal(source.includes(key),false);
  const publicAttempt=await request({port:ready.port,host:`127.0.0.1:${ready.port}`,pathname:'/fieldnet-lite/'});assert.equal(publicAttempt.status,404);

  const bootstrap=await signed({method:'POST',pathname:'/api/fieldnet/ui-sessions',body:{incidentId,deviceId:'device:lite-ui'}});assert.equal(bootstrap.status,201);assert.equal(JSON.stringify(bootstrap.body).includes(key),false);assert.equal(bootstrap.body.session.principalId,'observer:lite-ui');assert.equal(bootstrap.body.session.incidentId,incidentId);assert.match(bootstrap.headers['set-cookie'][0],/HttpOnly/);
  const cookie=bootstrap.headers['set-cookie'][0].split(';')[0];
  const refreshed=await request({socketPath,pathname:'/api/fieldnet/ui-session',headers:{cookie}});assert.equal(refreshed.status,200);const csrf=refreshed.body.csrfToken;
  const forbidden=await request({socketPath,pathname:'/api/fieldnet/devices',headers:{cookie}});assert.equal(forbidden.status,403);assert.equal(forbidden.body.error,'fieldnet_ui_route_forbidden');
  const noCsrf=await request({socketPath,method:'POST',pathname:'/api/fieldnet/reports',headers:{cookie},body:{report:{incidentId}}});assert.equal(noCsrf.status,403);assert.equal(noCsrf.body.error,'fieldnet_ui_csrf_rejected');

  const report={reportId:'report:lite-ui',reportType:'ROAD_ACCESS',incidentId,deviceId:'device:lite-ui',sessionId:refreshed.body.session.sessionId,observedAt:'2026-09-04T00:10:00Z',receivedAt:'2026-09-04T00:11:00Z',connectivityAtCapture:'OFFLINE',geometry:{type:'Point',coordinates:[-8.6,41.1]},horizontalUncertaintyM:7,bearingDegrees:185,rawEvidenceHash:sha256('lite-ui-road'),structuredAnswers:{roadId:'N2:lite-ui',accessState:'RESTRICTED',vehicleClasses:['EMERGENCY'],direction:'BOTH',alternativeRouteKnown:'YES'}};
  const submitted=await request({socketPath,method:'POST',pathname:'/api/fieldnet/reports',headers:{cookie,'x-vigia-field-csrf':csrf},body:{report}});assert.equal(submitted.status,201);assert.equal(submitted.body.observation.capture.bearingDegrees,185);assert.equal(submitted.body.observation.provenance.observerId,'observer:lite-ui');
  assert.equal(submitted.body.observation.reportState,'OBSERVATION_PENDING_GOVERNED_ADMISSION');

  const launcher=spawn(process.execPath,[launcherEntry],{cwd:root,env:{...process.env,FIELDNET_CONTROL_SOCKET:socketPath,FIELDNET_CONTROL_KEY:key,FIELDNET_CONTROL_INCIDENT_SCOPES:incidentId,FIELDNET_LITE_DEVICE_ID:'device:lite-ui',FIELDNET_LITE_PORT:'0'},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{if(launcher.exitCode===null){launcher.kill('SIGTERM');await new Promise((resolve)=>launcher.once('exit',resolve));}});
  const launched=await new Promise((resolve,reject)=>{let output='',errors='';const timeout=setTimeout(()=>reject(new Error(`launcher_timeout:${output}:${errors}`)),10_000);launcher.stderr.on('data',(chunk)=>{errors+=chunk;});launcher.once('exit',(code)=>reject(new Error(`launcher_early_exit:${code}:${errors}`)));launcher.stdout.on('data',(chunk)=>{output+=chunk;for(const line of output.split('\n'))try{const event=JSON.parse(line);if(event.event==='FIELDNET_LITE_READY'){clearTimeout(timeout);resolve(event);}}catch{}});});
  assert.equal(launched.controlKeyExposedToBrowser,false);assert.equal(JSON.stringify(launched).includes(key),false);
  const launchUrl=new URL(launched.url),launcherPort=Number(launchUrl.port);
  assert.equal((await request({port:launcherPort,host:`127.0.0.1:${launcherPort}`,pathname:'/fieldnet-lite/'})).status,403);
  const claimed=await request({port:launcherPort,host:`127.0.0.1:${launcherPort}`,pathname:`${launchUrl.pathname}${launchUrl.search}`});assert.equal(claimed.status,303);assert.equal(claimed.headers['set-cookie'].length,2);
  const launcherCookies=claimed.headers['set-cookie'].map((value)=>value.split(';')[0]).join('; ');
  const launchedShell=await request({port:launcherPort,host:`127.0.0.1:${launcherPort}`,pathname:'/fieldnet-lite/',headers:{cookie:launcherCookies}});assert.equal(launchedShell.status,200);assert.match(launchedShell.raw,/Report from field/i);
  const launchedSession=await request({port:launcherPort,host:`127.0.0.1:${launcherPort}`,pathname:'/api/fieldnet/ui-session',headers:{cookie:launcherCookies}});assert.equal(launchedSession.status,200);assert.equal(launchedSession.body.session.deviceId,'device:lite-ui');
});
