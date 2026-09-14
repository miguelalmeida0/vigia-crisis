import test from 'node:test';
import assert from 'node:assert/strict';
import { ActivePerceptionService } from '../src/modules/sensors/active-perception-service.mjs';
import { SensorTaskService } from '../src/modules/sensors/sensor-task-service.mjs';
import { MtgFeatureInfoGateway } from '../src/modules/world/mtg/mtg-feature-info-gateway.mjs';
import { HighResStacGateway } from '../src/modules/observations/highres-stac-gateway.mjs';
import { AlertService } from '../src/modules/alerts/alert-service.mjs';
import { SensorIngestService } from '../src/modules/sensors/sensor-ingest-service.mjs';
import { createHmac } from 'node:crypto';
import { eventActionPlan } from '../src/modules/events/event-action-plan.mjs';

const event={id:'event-1',coordinate:[-8.0,40.0]};

test('V9 active perception ranks by declared availability and ETA without inventing information gain', async()=>{
  const registry={nearby:async()=>[
    {id:'team-1',name:'Centro 4',type:'field_unit',coordinate:[-8.1,40.1],status:'available',capabilities:['field'],distanceKm:18,speedKph:45,launchMinutes:5,ownerId:'actor-field'},
    {id:'cam-1',name:'Serra PTZ',type:'camera',coordinate:[-8.01,40.01],status:'online',capabilities:['optical'],distanceKm:1.2,viewRadiusKm:12,endpoint:'https://camera.example/task',ownerId:'actor-camera'}
  ]};
  const plan=await new ActivePerceptionService({registry}).plan(event);
  assert.equal(plan.state,'available');
  assert.equal(plan.recommended.id,'cam-1');
  assert.equal(plan.recommended.informationGain,undefined);
  assert.equal(plan.ranking.state,'FEASIBILITY_ONLY');
  assert.ok(plan.recommended.etaMinutes<1);
});

test('V9 sensor tasking sends a bounded request only to configured remotely taskable assets', async()=>{
  let request;
  const registry={get:(id)=>id==='cam-1'?{id,name:'Serra PTZ',type:'camera',endpoint:'https://camera.example/task'}:null};
  const fetchImpl=async(url,options)=>{request={url:String(url),options};return new Response(JSON.stringify({accepted:true,jobId:'job-7'}),{status:200,headers:{'content-type':'application/json'}});};
  const service=new SensorTaskService({registry,fetchImpl,resolveHost:async()=>[{address:'93.184.216.34',family:4}],token:'secret',clock:()=>new Date('2026-08-09T09:00:00Z')});
  const result=await service.task('cam-1',{eventId:'event-1',coordinate:[-8,40]});
  assert.equal(result.state,'accepted');
  assert.equal(request.url,'https://camera.example/task');
  assert.equal(request.options.headers.authorization,'Bearer secret');
  const body=JSON.parse(request.options.body);
  assert.equal(body.eventId,'event-1');
  assert.deepEqual(body.coordinate,[-8,40]);
});

test('V9 MTG feature-info probe turns an actual positive FRP response into structured point evidence', async()=>{
  const fetchImpl=async()=>new Response(JSON.stringify({properties:{Fire_Radiative_Power:47.5,confidence:88}}),{status:200});
  const gateway=new MtgFeatureInfoGateway({fetchImpl,clock:()=>new Date('2026-08-09T09:00:00Z')});
  const observations=await gateway.probeReports([{id:'r-1',coordinate:[-8.0,40.0]}],{providers:[{id:'mtg-frp',state:'current',baseUrl:'https://example.test/wms',layer:'MTG_FRP',latestTime:'2026-08-09T08:40:00Z',cadenceMinutes:10}]});
  assert.equal(observations.length,1);
  assert.equal(observations[0].frpMw,47.5);
  assert.equal(observations[0].confidence,.88);
  assert.equal(observations[0].queryMatchedReportId,'r-1');
});

test('V9 configured high-resolution STAC normalizes a renderable optical scene', async()=>{
  const fetchImpl=async()=>new Response(JSON.stringify({features:[{id:'hr-1',bbox:[-8.1,39.9,-7.9,40.1],properties:{datetime:'2026-08-09T07:30:00Z',platform:'municipal-aerial',gsd:.3,'eo:cloud_cover':0},assets:{visual:{href:'https://imagery.example/hr-1.tif'},thumbnail:{href:'https://imagery.example/hr-1.jpg'}}}]}),{status:200,headers:{'content-type':'application/json'}});
  const gateway=new HighResStacGateway({endpoint:'https://stac.example/search',collection:'municipal-ortho',assetHosts:['imagery.example'],fetchImpl,clock:()=>new Date('2026-08-09T09:00:00Z')});
  const scenes=await gateway.scenes({coordinate:[-8,40]});
  assert.equal(scenes.length,1);
  assert.equal(scenes[0].resolutionMeters,.3);
  assert.equal(scenes[0].visualCogUrl,'https://imagery.example/hr-1.tif');
});

test('configured STAC display metadata is control-free and length bounded before UI projection',async()=>{
  const hostile=`municipal\u0000\n${'<button data-action="acknowledge-alert:forged">'.repeat(20)}`,fetchImpl=async()=>new Response(JSON.stringify({features:[{id:'hr-hostile',bbox:[-8.1,39.9,-7.9,40.1],properties:{datetime:'2026-08-09T07:30:00Z',platform:hostile,gsd:1},assets:{}}]}),{status:200,headers:{'content-type':'application/json'}}),gateway=new HighResStacGateway({endpoint:'https://stac.example/search',collection:'municipal-ortho',fetchImpl,clock:()=>new Date('2026-08-09T09:00:00Z')});
  const [scene]=await gateway.scenes({coordinate:[-8,40]});assert.ok(scene.sensor.length<=160);assert.doesNotMatch(scene.sensor,/[\u0000-\u001f\u007f]/);
});

test('V9 persisted alerts preserve watch status and acknowledgement without inventing delivery', async()=>{
  const repository={snapshot:()=>({watchedEventIds:['event-1']})};
  const service=new AlertService({repository,clock:()=>new Date('2026-08-09T09:00:00Z')});
  await service.initialize();
  const created=await service.sync({alerts:[{id:'unreported:event-1',eventId:'event-1',severity:'high',kind:'unreported_thermal',title:'New thermal signal',reason:'No public report'}]});
  assert.equal(created.length,1);
  assert.equal(created[0].watched,true);
  const ack=await service.acknowledge(created[0].id,{id:'operator-1',role:'supervisor',capabilities:['alert:acknowledge'],incidentScopes:[created[0].eventId],authentication:{authenticated:true}});
  assert.equal(ack.acknowledgedBy,'operator-1');
  assert.ok(ack.acknowledgedAt);
});

function canonical(value){if(Array.isArray(value))return`[${value.map(canonical).join(',')}]`;if(value&&typeof value==='object')return`{${Object.keys(value).sort().map((key)=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;return JSON.stringify(value);}

test('V9 sensor ingest accepts device-specific HMAC authentication and rejects nonce replay', async()=>{
  const merged=[];
  const repository={merge:async(items)=>merged.push(...items)};
  const registry={get:(id)=>id==='cam-9'?{id:'cam-9',name:'Camera 9',type:'camera',coordinate:[-8,40],incidentIds:['incident:cam-9'],ingestSecret:'device-secret'}:null,snapshot:()=>({assets:[{id:'cam-9',type:'camera',signedIngest:true,incidentScopeCount:1}]})};
  const clock=()=>new Date('2026-08-09T09:00:00Z');
  const service=new SensorIngestService({eventRepository:repository,registry,clock});
  const body={externalObservationId:'cam-9:085930',incidentId:'incident:cam-9',type:'camera',sensorId:'cam-9',observedAt:'2026-08-09T08:59:30Z',coordinate:[-8,40],classification:'smoke_plume',confidence:.93};
  const timestamp='2026-08-09T09:00:00Z',nonce='nonce-1';
  const signature=createHmac('sha256','device-secret').update(`${timestamp}\n${nonce}\n${canonical(body)}`).digest('hex');
  const result=await service.ingest({timestamp,nonce,signature},body);
  assert.equal(result.accepted,true);
  assert.equal(result.observation.metadata.authMode,'signed_device');
  await assert.rejects(()=>service.ingest({timestamp,nonce,signature},body),/sensor_auth_replay/);
});


test('V9 event action plan recognizes attached camera and ground-sensor evidence using the normalized coverage contract',()=>{
  const plan=eventActionPlan({evidenceState:'multisource',reportState:{freshness:'current'},physicalState:{freshness:'current'},observationPlan:{options:[{id:'cam-1',label:'Camera 14',availability:'AVAILABLE_NOW'}],ranking:{state:'PARTIAL_INFORMATION_GAIN_UNMEASURED'}},actionNeed:{needsRouting:false}});
  assert.equal(plan.observationOptions[0].id,'cam-1');
  assert.equal(plan.ranking.state,'PARTIAL_INFORMATION_GAIN_UNMEASURED');
  assert.equal(plan.serviceLevel.id,'evidence-acquisition-elevated-v1');
});
