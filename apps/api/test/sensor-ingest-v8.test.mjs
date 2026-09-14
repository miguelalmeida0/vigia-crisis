import test from 'node:test';
import assert from 'node:assert/strict';
import { SensorIngestService } from '../src/modules/sensors/sensor-ingest-service.mjs';
import { EventObservationRepository } from '../src/modules/events/event-observation-repository.mjs';
import { sensorCoverageForEvent } from '../src/modules/events/sensor-coverage.mjs';
import { analyseSpreadExposure } from '../src/modules/response/exposure-analysis.mjs';
import { buildSpreadScenario } from '../../../packages/domain/src/spread-envelope.mjs';
import { trackFireEvents } from '../../../packages/domain/src/fire-event-tracker.mjs';
import { destinationPoint } from '../../../packages/domain/src/geo.mjs';
import { createHmac } from 'node:crypto';

const now=new Date('2026-08-08T18:00:00Z');
const canonical=(value)=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map((key)=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`:JSON.stringify(value);

test('V8 external physical-observation ingress is authenticated and joins the fire event graph', async () => {
  const repository=new EventObservationRepository();
  const asset={id:'ptz-14',name:'PTZ 14',type:'camera',coordinate:[-8.001,40.001],incidentIds:['incident:r'],ingestSecret:'device-secret'},registry={get:(id)=>id===asset.id?asset:null,snapshot:()=>({assets:[]})},changes=[],service=new SensorIngestService({eventRepository:repository,registry,clock:()=>now,onChanged:(event)=>changes.push(event)}),payload={externalObservationId:'ptz-14:1758',incidentId:'incident:r',type:'camera',sensorId:'ptz-14',observedAt:'2026-08-08T17:58:00Z',coordinate:[-8.001,40.001],classification:'smoke_plume',confidence:.95},timestamp=now.toISOString(),nonce='ptz-14-1';
  await assert.rejects(()=>service.ingest({timestamp,nonce,signature:'bad'},payload),/forbidden/);
  const signature=createHmac('sha256','device-secret').update(`${timestamp}\n${nonce}\n${canonical(payload)}`).digest('hex'),response=await service.ingest({timestamp,nonce,signature},payload);
  assert.equal(response.accepted,true);
  const physical=(await repository.merge([],now))[0];
  const report={id:'report:r',type:'report',source:'civil-protection',at:'2026-08-08T17:55:00Z',coordinate:[-8,40],incidentId:'r',municipality:'Example',district:'Coimbra',status:'active'};
  const [event]=trackFireEvents([report,physical],{now});
  assert.equal(event.evidenceState,'multisource');
  assert.equal(event.physicalState.sensor,'ptz-14');
  assert.deepEqual(changes.map((item)=>item.incidentId),['r']);
});

test('sensor admission and repository quotas reject an abusive principal without consuming another principal capacity',async()=>{
  const repository=new EventObservationRepository({maxPrincipalObservations:1,maxPrincipalBytes:64*1024,maxObservations:10,maxStateBytes:1024*1024});
  const body=(id,sensorId)=>({externalObservationId:id,incidentId:'incident:quota',type:'camera',sensorId,observedAt:'2026-08-08T17:58:00Z',coordinate:[-8.001,40.001],classification:'smoke_plume',confidence:.95});
  const assets={'cam-1':{id:'cam-1',name:'Camera 1',type:'camera',coordinate:[-8.001,40.001],incidentIds:['incident:quota'],ingestSecret:'device-secret-1'},'cam-2':{id:'cam-2',name:'Camera 2',type:'camera',coordinate:[-8.001,40.001],incidentIds:['incident:quota'],ingestSecret:'device-secret-2'}},registry={get:(id)=>assets[id]??null,snapshot:()=>({assets:[]})};
  const signed=new SensorIngestService({eventRepository:repository,registry,clock:()=>now});
  const authenticate=(payload,secret,nonce)=>({timestamp:now.toISOString(),nonce,signature:createHmac('sha256',secret).update(`${now.toISOString()}\n${nonce}\n${canonical(payload)}`).digest('hex')}),first=body('cam-1:first','cam-1'),second=body('cam-1:second','cam-1'),peer=body('cam-2:first','cam-2');
  await signed.ingest(authenticate(first,'device-secret-1','cam-1-1'),first);
  await assert.rejects(()=>signed.ingest(authenticate(second,'device-secret-1','cam-1-2'),second),(error)=>error.message==='sensor_principal_capacity_exceeded'&&error.statusCode===429);
  await signed.ingest(authenticate(peer,'device-secret-2','cam-2-1'),peer);
  const stored=await repository.merge([],now);assert.equal(stored.length,2);assert.ok(stored.some((item)=>item.externalObservationId==='cam-1:first'));assert.ok(stored.some((item)=>item.externalObservationId==='cam-2:first'));
});

test('sensor admission rate and replay memory remain bounded before persistence',async()=>{
  const body={externalObservationId:'signed:bounded',incidentId:'incident:bounded',type:'camera',sensorId:'cam-9',observedAt:'2026-08-08T17:58:00Z',coordinate:[-8,40],classification:'smoke'};
  const registry={get:()=>({id:'cam-9',name:'Camera 9',type:'camera',coordinate:[-8,40],incidentIds:['incident:bounded'],ingestSecret:'device-secret'}),snapshot:()=>({assets:[]})},repository={merge:async()=>[]};
  const signed=(nonce,payload=body)=>({timestamp:now.toISOString(),nonce,signature:createHmac('sha256','device-secret').update(`${now.toISOString()}\n${nonce}\n${canonical(payload)}`).digest('hex')});
  const nonceBounded=new SensorIngestService({eventRepository:repository,registry,clock:()=>now,maxNonces:1,maxRequestsPerMinute:10});
  await nonceBounded.ingest(signed('nonce-1'),body);
  await assert.rejects(()=>nonceBounded.ingest(signed('nonce-2'),body),/sensor_auth_nonce_capacity_exceeded/);
  await assert.rejects(()=>nonceBounded.ingest(signed('nonce-1'),body),/sensor_auth_replay/);
  const rateBounded=new SensorIngestService({eventRepository:repository,registry,clock:()=>now,maxRequestsPerMinute:1}),first={...body,externalObservationId:'signed:rate-1'},second={...body,externalObservationId:'signed:rate-2'};
  await rateBounded.ingest(signed('rate-1',first),first);
  await assert.rejects(()=>rateBounded.ingest(signed('rate-2',second),second),/sensor_ingest_capacity_exceeded/);
});

test('registered sensors cannot cross incident scope, geometry coverage, or caller-selected evidence family',async()=>{
  const stored=[],base={sensorId:'fixed-1',observedAt:'2026-08-08T17:58:00Z',coordinate:[-8,40],classification:'smoke'},asset={id:'fixed-1',name:'Fixed 1',type:'camera',coordinate:[-8,40],viewRadiusKm:.2,incidentIds:['incident:allowed'],ingestSecret:'device-secret'},registry={get:(id)=>id===asset.id?asset:null,snapshot:()=>({assets:[]})},service=new SensorIngestService({eventRepository:{merge:async(items)=>{stored.push(...items);return items;}},registry,clock:()=>now}),sign=(payload,nonce)=>({timestamp:now.toISOString(),nonce,signature:createHmac('sha256','device-secret').update(`${now.toISOString()}\n${nonce}\n${canonical(payload)}`).digest('hex')});
  const cross={...base,externalObservationId:'cross',incidentId:'incident:forbidden'};await assert.rejects(()=>service.ingest(sign(cross,'cross'),cross),/sensor_incident_scope_forbidden/);
  const outside={...base,externalObservationId:'outside',incidentId:'incident:allowed',coordinate:[-8.1,40.1]};await assert.rejects(()=>service.ingest(sign(outside,'outside'),outside),/sensor_coordinate_outside_registered_coverage/);
  const selected={...base,externalObservationId:'selected',incidentId:'incident:allowed',type:'ground_sensor',coordinate:[-8,40]};await service.ingest(sign(selected,'selected'),selected);assert.equal(stored[0].type,'camera');assert.equal(stored[0].sourceFamily,'registered_camera');assert.equal(stored[0].independenceGroup,'registered_sensor:fixed-1');
});

test('V8 sensor coverage never treats an absent FIRMS point as negative evidence when exact overpass coverage is unknown', () => {
  const event={observations:[],reportState:{sourceActivity:'current',lastAt:'2026-08-08T17:55:00Z',ageMinutes:5}};
  const coverage=sensorCoverageForEvent(event,{world:{sources:{firms:{state:'current',upstreamAt:'2026-08-08T17:45:00Z'}}},thermal:{selected:null},now});
  assert.equal(coverage.viirs.state,'feed_available_coverage_unknown');
  assert.equal(coverage.viirs.negativeEvidence,false);
  assert.match(coverage.viirs.note,/not negative evidence/i);
});

test('exposure analysis returns monotonic deterministic sensitivity counts', () => {
  const origin=[-8,40];
  const spread=buildSpreadScenario({coordinate:origin,riskLevel:5,windSpeedKph:25,windDirectionDeg:90,humidityPercent:20,minutes:[30]});
  const points=[destinationPoint(origin,.2,90),destinationPoint(origin,.6,90),destinationPoint(origin,1.1,90),destinationPoint(origin,1.8,90)];
  const [analysis]=analyseSpreadExposure({buildingPoints:points,buildingCountWithin3Km:4,assets:[]},spread);
  assert.ok(analysis.low.buildings<=analysis.central.buildings);
  assert.ok(analysis.central.buildings<=analysis.high.buildings);
});
