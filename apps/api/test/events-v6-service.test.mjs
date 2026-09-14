import test from 'node:test';
import assert from 'node:assert/strict';
import { FireEventService } from '../src/modules/events/fire-event-service.mjs';

const now = new Date('2026-08-08T15:00:00Z');

test('Operational Fire OS reports early satellite lead time without converting MTG raster into point evidence', async () => {
  const world = {
    meta:{mode:'public-sources'},
    sources:{
      fires:{state:'current',upstreamAt:'2026-08-08T14:58:00Z',fetchedAt:'2026-08-08T14:59:00Z'},
      firms:{state:'current',upstreamAt:'2026-08-08T14:35:00Z',fetchedAt:'2026-08-08T14:50:00Z'},
      weather:{state:'current',upstreamAt:'2026-08-08T14:00:00Z',fetchedAt:'2026-08-08T14:10:00Z'},
      riskToday:{state:'current',upstreamAt:'2026-08-08T08:00:00Z',fetchedAt:'2026-08-08T08:05:00Z'}
    },
    fires:[{id:'report-1',municipality:'Monchique',district:'Faro',coordinate:[-8.49,37.32],startedAt:'2026-08-08T14:18:00Z',updatedAt:'2026-08-08T14:58:00Z',operatives:22,ground:7,aerial:1}],
    thermalDetections:[{id:'v1',coordinate:[-8.491,37.321],observedAt:'2026-08-08T14:10:00Z',frpMw:18,satellite:'NOAA-20'},{id:'v2',coordinate:[-8.492,37.322],observedAt:'2026-08-08T14:35:00Z',frpMw:57,satellite:'NOAA-21'}],
    weather:[{id:'w',name:'Foia',coordinate:[-8.5,37.31],temperatureC:35,humidityPercent:18,windSpeedKph:31}],
    riskToday:[{id:'0809',name:'Monchique',coordinate:[-8.49,37.32],level:5}]
  };
  const service = new FireEventService({
    worldService:{snapshot:async()=>structuredClone(world)},
    thermalAdapter:{metadata:async()=>({state:'current',fetchedAt:'2026-08-08T14:59:00Z',selectedProvider:'mtg-frp',selected:{id:'mtg-frp',latestTime:'2026-08-08T14:40:00Z',cadenceMinutes:10,nominalResolutionKm:1,productStatus:'demonstration',timeSlots:['2026-08-08T14:30:00Z','2026-08-08T14:40:00Z']},providers:[]})},
    clock:()=>now
  });
  const snapshot = await service.snapshot();
  assert.equal(snapshot.events.length,1);
  assert.equal(snapshot.events[0].evidenceState,'multisource');
  assert.equal(snapshot.events[0].evolutionState,'growing');
  assert.equal(snapshot.events[0].leadTime.minutes,8);
  assert.equal(snapshot.events[0].mtg.pointMeasurementAvailable,false);
  assert.equal(snapshot.summary.detectedBeforeReport,1);
  assert.equal(snapshot.summary.medianLeadMinutes,8);
});

test('prospective raw-product ingest timing is attached only to physical observations', async () => {
  const products={report:{id:'report',sourceId:'reports',processingState:'parsed'},thermal:{id:'thermal',sourceId:'firms',processingState:'parsed'}},commits=[];
  const physicalTruthStore={
    status:()=>({configured:true,state:'ready',lastCommitAt:'2026-08-08T15:00:01.000Z'}),
    commitSnapshot:async(value)=>{commits.push(value);return{products:value.products.length,observations:1,events:value.events.length,checkpoints:value.checkpoints.length};}
  };
  const service=new FireEventService({
    worldService:{snapshot:async()=>({meta:{mode:'public-sources'},sources:{fires:{state:'current',rawSourceProductId:'report'},firms:{state:'current',rawSourceProductIds:['thermal']}},fires:[{id:'report-2',municipality:'Monchique',coordinate:[-8.49,37.32],startedAt:'2026-08-08T14:18:00Z',updatedAt:'2026-08-08T14:58:00Z',provenance:{rawSourceProductId:'report'}}],thermalDetections:[{id:'v3',coordinate:[-7.1,39.1],observedAt:'2026-08-08T14:35:00Z',receivedAt:'2026-08-08T14:50:00Z',frpMw:57,satellite:'NOAA-21',sourceFamily:'viirs',provenance:{rawSourceProductId:'thermal'}}],weather:[],riskToday:[]})},
    thermalAdapter:{metadata:async()=>({state:'unavailable',selected:null,providers:[]})},
    acquisitionStore:{getProduct:(id)=>products[id],getCheckpoint:(id)=>({sourceId:id}),markProductsIngested:async(ids)=>{for(const id of ids)products[id].processingState='ingested';return{};}},
    physicalTruthStore,
    clock:()=>now
  });
  const snapshot=await service.snapshot(),report=snapshot.events.find((event)=>!event.observations.some((item)=>item.type==='thermal')),physical=snapshot.events.find((event)=>event.observations.some((item)=>item.type==='thermal'));
  assert.equal(report.prospectiveDetectionTiming.observationPersistedAt,null);
  assert.equal(report.prospectiveDetectionTiming.vigiaRawProductIngestedAt,null);
  assert.equal(physical.prospectiveDetectionTiming.observationPersistedAt,'2026-08-08T15:00:01.000Z');
  assert.equal(physical.prospectiveDetectionTiming.vigiaRawProductIngestedAt,'2026-08-08T15:00:01.000Z');
  assert.equal(physical.prospectiveDetectionTiming.candidateDecisionAt,'2026-08-08T15:00:00.000Z');
  await service.snapshot();assert.equal(commits.length,2);assert.equal(commits[0].products.length,2);assert.ok(commits[0].events.length>0);
  assert.equal(commits[1].products.length,2,'current ingested products remain inside the idempotent correction boundary');
});
