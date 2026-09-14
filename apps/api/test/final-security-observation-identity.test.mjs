import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SensorIngestService } from '../src/modules/sensors/sensor-ingest-service.mjs';
import { EventObservationRepository } from '../src/modules/events/event-observation-repository.mjs';

const now=new Date('2026-08-23T10:00:00.000Z');
const canonical=(value)=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map((key)=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`:JSON.stringify(value);
const body=(overrides={})=>({externalObservationId:'provider-observation:shared-1',incidentId:'incident:identity-test',type:'camera',sensorId:'camera:a',observedAt:'2026-08-23T09:59:00Z',coordinate:[-8,40],classification:'smoke_plume',confidence:.91,...overrides});
function signed(secret,payload,nonce){const timestamp=now.toISOString();return{timestamp,nonce,signature:createHmac('sha256',secret).update(`${timestamp}\n${nonce}\n${canonical(payload)}`).digest('hex')};}

test('trusted sensor boundary namespaces external IDs across principals, agencies, nodes, incidents, and source families',async()=>{
  const repository=new EventObservationRepository(),assets={
    'camera:a':{id:'camera:a',name:'Camera A',organizationId:'agency:a',type:'camera',coordinate:[-8,40],incidentIds:['incident:identity-test'],ingestSecret:'secret-a'},
    'camera:b':{id:'camera:b',name:'Camera B',organizationId:'agency:b',type:'camera',coordinate:[-8,40],incidentIds:['incident:identity-test'],ingestSecret:'secret-b'},
    'drone:a':{id:'drone:a',name:'Drone A',organizationId:'agency:a',type:'drone',coordinate:[-8,40],incidentIds:['incident:identity-test'],ingestSecret:'secret-drone'}
  },registry={get:(id)=>assets[id]??null,snapshot:()=>({assets:[]})};
  const service=new SensorIngestService({eventRepository:repository,registry,clock:()=>now,maxRequestsPerMinute:50});
  const a=body(),b=body({sensorId:'camera:b'}),otherIncident=body({incidentId:'incident:other'}),drone=body({sensorId:'drone:a',type:'drone'});
  const results=[];
  for(const [payload,secret,nonce]of[[a,'secret-a','a-1'],[b,'secret-b','b-1'],[drone,'secret-drone','d-1']])results.push(await service.ingest(signed(secret,payload,nonce),payload));
  await assert.rejects(()=>service.ingest(signed('secret-a',otherIncident,'a-2'),otherIncident),(error)=>error.message==='sensor_incident_scope_forbidden'&&error.statusCode===403);
  assert.equal(new Set(results.map((item)=>item.observation.id)).size,3);
  assert.ok(results.every((item)=>item.observation.externalObservationId==='provider-observation:shared-1'));
  assert.deepEqual(results.map((item)=>item.observation.provenance.observationIdentity.agencyId),['agency:a','agency:b','agency:a']);
});

test('exact observation replay is idempotent while payload, geometry, or observation-time rebinding fails closed',async()=>{
  const repository=new EventObservationRepository(),asset={id:'camera:a',name:'Camera A',organizationId:'agency:a',type:'camera',coordinate:[-8,40],viewRadiusKm:5,incidentIds:['incident:identity-test'],ingestSecret:'secret-a'},registry={get:(id)=>id===asset.id?asset:null,snapshot:()=>({assets:[]})},service=new SensorIngestService({eventRepository:repository,registry,clock:()=>now,maxRequestsPerMinute:50}),original=body();
  const first=await service.ingest(signed('secret-a',original,'replay-1'),original),replay=await service.ingest(signed('secret-a',original,'replay-2'),original);
  assert.equal(replay.observation.id,first.observation.id);assert.equal((await repository.merge([],now)).length,1);
  let index=0;for(const changed of [{...original,classification:'flame'}, {...original,coordinate:[-8.01,40.01]}, {...original,observedAt:'2026-08-23T09:58:00Z'}]){
    await assert.rejects(()=>service.ingest(signed('secret-a',changed,`changed-${index++}`),changed),(error)=>error.message==='observation_identity_conflict'&&error.statusCode===409);
  }
  const stored=(await repository.merge([],now))[0];assert.equal(stored.classification,'smoke_plume');assert.deepEqual(stored.coordinate,[-8,40]);assert.equal(stored.at,'2026-08-23T09:59:00.000Z');
});

test('concurrent conflicting submissions serialize to one immutable observation and persist across restart',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'vigia-observation-identity-')),filePath=path.join(directory,'event-observations.json'),original=body(),changed={...original,measurement:{temperatureC:480}};
  const asset={id:'camera:a',name:'Camera A',organizationId:'agency:a',type:'camera',coordinate:[-8,40],viewRadiusKm:5,incidentIds:['incident:identity-test'],ingestSecret:'secret-a'},registry={get:(id)=>id===asset.id?asset:null,snapshot:()=>({assets:[]})},repository=new EventObservationRepository({filePath}),service=new SensorIngestService({eventRepository:repository,registry,clock:()=>now,maxRequestsPerMinute:50});
  const settled=await Promise.allSettled([service.ingest(signed('secret-a',original,'concurrent-1'),original),service.ingest(signed('secret-a',changed,'concurrent-2'),changed)]);
  assert.equal(settled.filter((item)=>item.status==='fulfilled').length,1);assert.equal(settled.filter((item)=>item.status==='rejected'&&item.reason?.message==='observation_identity_conflict').length,1);
  const restartedRepository=new EventObservationRepository({filePath}),restartedService=new SensorIngestService({eventRepository:restartedRepository,registry,clock:()=>now,maxRequestsPerMinute:50}),persisted=(await restartedRepository.merge([],now))[0];
  const acceptedPayload=persisted.measurement?.temperatureC===480?changed:original;
  const replay=await restartedService.ingest(signed('secret-a',acceptedPayload,'restart-replay'),acceptedPayload);assert.equal(replay.observation.id,persisted.id);assert.equal((await restartedRepository.merge([],now)).length,1);
});

test('caller-selected canonical IDs and malformed external IDs are rejected before repository mutation',async()=>{
  let mutations=0;const asset={id:'camera:a',name:'Camera A',organizationId:'agency:a',type:'camera',coordinate:[-8,40],incidentIds:['incident:identity-test'],ingestSecret:'secret-a'},registry={get:(id)=>id===asset.id?asset:null,snapshot:()=>({assets:[]})},service=new SensorIngestService({eventRepository:{merge:async()=>{mutations+=1;}},registry,clock:()=>now});
  const selected={...body(),canonicalObservationId:'victim:id'};await assert.rejects(()=>service.ingest(signed('secret-a',selected,'malformed-1'),selected),/sensor_canonical_observation_id_forbidden/);
  const malformed={...body(),externalObservationId:{toString:()=> 'victim:id'}};await assert.rejects(()=>service.ingest(signed('secret-a',malformed,'malformed-2'),malformed),/sensor_external_observation_id_invalid/);
  assert.equal(mutations,0);
});

test('legacy shared tokens cannot mint sensor identities or independent evidence families',async()=>{
  let mutations=0;const service=new SensorIngestService({eventRepository:{merge:async()=>{mutations+=1;}},token:'shared-secret',clock:()=>now});
  await assert.rejects(()=>service.ingest('shared-secret',body()),(error)=>error.message==='forbidden'&&error.statusCode===403);
  assert.equal(service.status().sharedTokenFallback,false);assert.equal(mutations,0);
});
