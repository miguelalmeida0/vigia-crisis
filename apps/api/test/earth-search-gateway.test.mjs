import test from 'node:test';
import assert from 'node:assert/strict';
import { EarthSearchGateway } from '../src/modules/observations/earth-search-gateway.mjs';

function feature(id, acquiredAt) {
  return {
    id,
    bbox: [-9,36.9,-7.7,37.9],
    properties: { datetime:acquiredAt, 'eo:cloud_cover':5, 'mgrs:utm_zone':29, 'mgrs:latitude_band':'S', 'mgrs:grid_square':'NB' },
    assets: { visual:{href:`https://example.test/${id}/visual.tif`},red:{href:`https://example.test/${id}/red.tif`},nir:{href:`https://example.test/${id}/nir.tif`},swir16:{href:`https://example.test/${id}/swir.tif`},scl:{href:`https://example.test/${id}/scl.tif`} }
  };
}

test('Earth Search acquisition keeps current and annual Sentinel-2 windows independently bounded', async () => {
  const calls=[];
  const fetchImpl=async(_url,options)=>{
    const body=JSON.parse(options.body);calls.push(body);
    const annual=body.datetime.includes('2025-');
    return {ok:true,json:async()=>({features:[annual?feature('annual','2025-08-06T11:30:59Z'):feature('current','2026-08-08T11:31:15Z')]})};
  };
  const gateway=new EarthSearchGateway({fetchImpl,clock:()=>new Date('2026-08-11T12:00:00Z')});
  const scenes=await gateway.scenes({coordinate:[-8.0202,37.1397],radiusKm:3});
  assert.equal(calls.length,2);
  assert.ok(calls.some((call)=>call.datetime.startsWith('2025-06-07')));
  assert.deepEqual(scenes.map((scene)=>scene.id),['current','annual']);
  assert.equal(scenes.every((scene)=>scene.visualCogUrl===null&&scene.redCogUrl===null),true);
});

test('Earth Search rejects provider raster assets outside the exact governed COG host',async()=>{
  const hostile=feature('hostile','2026-08-08T11:31:15Z');hostile.assets.red.href='http://127.0.0.1:4177/private.tif';hostile.assets.visual.href='https://sentinel-cogs.s3.us-west-2.amazonaws.com.evil.test/visual.tif';
  const fetchImpl=async()=>({ok:true,json:async()=>({features:[hostile]})}),gateway=new EarthSearchGateway({fetchImpl,clock:()=>new Date('2026-08-11T12:00:00Z')}),scenes=await gateway.scenes({coordinate:[-8.0202,37.1397],radiusKm:3});
  assert.equal(scenes[0].visualCogUrl,null);assert.equal(scenes[0].redCogUrl,null);
});
