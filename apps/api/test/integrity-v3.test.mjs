import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { FixtureGateway } from './fixtures/runtime/fixture-gateway.mjs';
import { createPilotAuditSeed } from './fixtures/runtime/pilot-audit-seed.mjs';
import { fixtureFindingFor } from './fixtures/runtime/fixture-finding-catalog.mjs';

test('generated observation fixtures are location-specific and stored only under test', async () => {
  const snapshot=await new FixtureGateway({clock:()=>new Date('2026-08-08T12:00:00Z')}).snapshot();
  const first=snapshot.copernicus.data.find((item)=>item.municipalityCode==='1013');
  const second=snapshot.copernicus.data.find((item)=>item.municipalityCode==='0603');
  assert.notEqual(first.latest.previewUrl,second.latest.previewUrl);
  assert.equal(first.latest.provenance.synthetic,true);
  const root=path.resolve('apps/api/test/fixtures/web-assets/fixtures/locations');
  await access(path.join(root,'1013-current.webp'));await access(path.join(root,'0603-current.webp'));
  await assert.rejects(()=>access(path.resolve('apps/web/assets/fixtures/locations/1013-current.webp')));
});

test('cached real preview responses preserve their source-state header contract', async () => {
  const { CurrentImageryService } = await import('../src/modules/observations/current-imagery-service.mjs');
  let fetches=0;
  const service=new CurrentImageryService({resolveHost:async()=>[{address:'93.184.216.34'}],fetchImpl:async()=>{fetches+=1;return new Response(Uint8Array.from([255,216,255,217]),{status:200,headers:{'content-type':'image/jpeg'}})}});
  const href='https://sentinel-cogs.s3.us-west-2.amazonaws.com/example/preview.jpg';
  const handle=new URL(service.proxyUrl(href),'http://vigia.local').searchParams.get('handle'),first=await service.proxy(handle),second=await service.proxy(handle);
  assert.equal(first.sourceState,'current');
  assert.equal(second.sourceState,'current');
  assert.deepEqual(second.buffer,first.buffer);
  assert.equal(fetches,1);
});

test('TEST audit seed is internally chained without entering production state', () => {
  const events=[...createPilotAuditSeed(new Date('2026-08-08T12:00:00Z'))].reverse();let previous='GENESIS';
  for(const event of events){const{hash,...base}=event;assert.equal(base.previousHash,previous);assert.equal(hash,createHash('sha256').update(JSON.stringify(base)).digest('hex'));previous=hash;}
  assert.ok(events.length>0);
});

test('TEST detector outputs remain explicitly synthetic and non-operational', () => {
  const findings=fixtureFindingFor('1816','2026-08-08T10:00:00Z');
  assert.equal(findings.length,1);
  assert.equal(findings[0].fixtureDemo,true);
  assert.equal(findings[0].state,'requires_review');
  assert.match(findings[0].qualityFlags.join(' '),/synthetic/);
});

test('Sentinel metadata never silently renders VIIRS pixels', async () => {
  const { decorateScene } = await import('../src/modules/observations/observation-scene.mjs');
  const scene = { id: 'S2-METADATA-ONLY', sensor: 'Sentinel-2', acquiredAt: '2026-08-08T08:00:00Z', bbox: [-8.3,39.7,-7.9,40.1], previewUrl: null, cloudCover: 12, resolutionMeters: 10 };
  const decorated = decorateScene(scene, { coordinate: [-8.1,39.9], radiusKm: 9, currentImageryService: { proxyUrl: () => null, frameUrl: () => { throw new Error('cross_sensor_fallback_must_not_run'); } }, clock: () => new Date('2026-08-08T12:00:00Z') });
  assert.equal(decorated.imageUrl, null);
  assert.equal(decorated.renderState, 'metadata_only');
  assert.equal(decorated.evidenceBinding.catalogCoversSelection, true);
  assert.equal(decorated.evidenceBinding.pixelVerified, false);
  assert.equal(decorated.evidenceBinding.bindingHash.length, 64);
});

test('aligned Sentinel-2 browse previews cannot enable V10 scientific change screening', async () => {
  const { ObservationFabricService } = await import('../src/modules/observations/observation-fabric-service.mjs');
  const coordinate = [-7.18, 41.48];
  const scenes = [
    { id:'S2-CURRENT', sensor:'Sentinel-2', acquiredAt:'2026-08-06T10:00:00Z', cloudCover:8, bbox:[-7.4,41.3,-7.0,41.7], gridId:'29TPF', previewUrl:'https://example.test/current.jpg', resolutionMeters:10, renderProduct:'browse_preview' },
    { id:'S2-BEFORE', sensor:'Sentinel-2', acquiredAt:'2026-08-01T10:00:00Z', cloudCover:12, bbox:[-7.4,41.3,-7.0,41.7], gridId:'29TPF', previewUrl:'https://example.test/before.jpg', resolutionMeters:10, renderProduct:'browse_preview' }
  ];
  const service = new ObservationFabricService({
    worldService:{ snapshot:async()=>({ meta:{mode:'public-sources'}, earthObservations:[] }) },
    sentinel1Gateway:{ snapshot:async()=>[] },
    earthSearchGateway:{ scenes:async()=>scenes },
    currentImageryService:{ proxyUrl:(href)=>`/proxy?href=${encodeURIComponent(href)}`, frameDescriptor:()=>({}) },
    imageryService:{ observationPair:()=>({ beforeDate:'2025-01-01', afterDate:'2026-01-01' }) },
    clock:()=>new Date('2026-08-08T12:00:00Z')
  });
  const result = await service.resolve({ coordinate });
  assert.equal(result.primary.id, 'S2-CURRENT');
  assert.equal(result.comparable.id, 'S2-BEFORE');
  assert.equal(result.changeScreening.eligible, false);
  assert.equal(result.changeScreening.method, null);
  assert.match(result.changeScreening.reason, /Browse previews|integrity|renderable/i);
  assert.equal(result.changeScreening.confirmsHazard, false);
  assert.equal(result.primary.renderProduct, 'browse_preview');
});

test('persisted detector scene IDs remain pinned during finding review', async () => {
  const { ObservationFabricService } = await import('../src/modules/observations/observation-fabric-service.mjs');
  const coordinate = [-8.02,37.14];
  const scenes = [
    { id:'S2-NEWER-METADATA', sensor:'Sentinel-2', acquiredAt:'2026-08-11T11:00:00Z', cloudCover:0, bbox:[-9,36.9,-7.7,38], gridId:'29SNB', resolutionMeters:10 },
    { id:'S2-DETECTOR-CURRENT', sensor:'Sentinel-2', acquiredAt:'2026-08-08T11:00:00Z', cloudCover:1, bbox:[-9,36.9,-7.7,38], gridId:'29SNB', previewUrl:'https://example.test/current.jpg', resolutionMeters:10 },
    { id:'S2-DETECTOR-COMPARISON', sensor:'Sentinel-2', acquiredAt:'2025-08-06T11:00:00Z', cloudCover:10, bbox:[-9,36.9,-7.7,38], gridId:'29SNB', previewUrl:'https://example.test/comparison.jpg', resolutionMeters:10 }
  ];
  const service = new ObservationFabricService({
    worldService:{ snapshot:async()=>({ meta:{mode:'public-sources'}, earthObservations:[] }) },sentinel1Gateway:{ snapshot:async()=>[] },earthSearchGateway:{ scenes:async()=>scenes },
    currentImageryService:{ proxyUrl:(href)=>`/proxy?href=${encodeURIComponent(href)}`,frameDescriptor:()=>({}) },imageryService:{ observationPair:()=>({}) },clock:()=>new Date('2026-08-11T12:00:00Z')
  });
  const result=await service.resolve({coordinate,primaryId:'S2-DETECTOR-CURRENT',comparableId:'S2-DETECTOR-COMPARISON'});
  assert.equal(result.primary.id,'S2-DETECTOR-CURRENT');
  assert.equal(result.comparable.id,'S2-DETECTOR-COMPARISON');
  assert.match(result.selectionReason.selected[0],/Pinned to persisted detector evidence/);
});
