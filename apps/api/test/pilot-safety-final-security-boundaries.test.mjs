import assert from 'node:assert/strict';
import test from 'node:test';
import { CurrentImageryService } from '../src/modules/observations/current-imagery-service.mjs';
import { publicObservationProjection } from '../src/modules/observations/observation-routes.mjs';
import { policyForRoute } from '../src/http/route-security-policy.mjs';
import { DetectionService } from '../src/modules/detection/detection-service.mjs';
import { mkdir,mkdtemp,rm,writeFile } from 'node:fs/promises';
import path from 'node:path';

test('public observation projection removes provider capabilities and keeps opaque previews',()=>{
  const handle='a'.repeat(32),scene={id:'high-res',previewUrl:'https://imagery.example/a.jpg?token=secret',imageUrl:`/api/v2/observations/proxy?handle=${handle}`,visualCogUrl:'https://imagery.example/a.tif?token=secret',redCogUrl:'https://imagery.example/r.tif?token=secret',rasterAssetHosts:['imagery.example']};
  const projected=publicObservationProjection({primary:scene,comparable:scene,timeline:[scene],observations:{current:scene,comparison:scene}}),serialized=JSON.stringify(projected);
  assert.equal(serialized.includes('imagery.example'),false);assert.equal(serialized.includes('token=secret'),false);assert.equal(projected.primary.imageUrl,`/api/v2/observations/proxy?handle=${handle}`);
});

test('preview proxy exposes only expiring opaque handles',async()=>{
  const service=new CurrentImageryService({resolveHost:async()=>[{address:'93.184.216.34',family:4}],fetchImpl:async()=>new Response(Buffer.from('image'),{headers:{'content-type':'image/jpeg','content-length':'5'}})}),url=service.proxyUrl('https://earth-search.aws.element84.com/preview.jpg?signature=secret');
  assert.match(url,/^\/api\/v2\/observations\/proxy\?handle=[A-Za-z0-9_-]{32}$/);assert.equal(url.includes('signature'),false);
  const handle=new URL(url,'http://vigia.local').searchParams.get('handle'),result=await service.proxy(handle);assert.equal(result.buffer.toString(),'image');await assert.rejects(()=>service.proxy('https://earth-search.aws.element84.com/preview.jpg'),/preview_handle_invalid/);
});

test('heavy evidence endpoints are local-visualization admitted',()=>{
  assert.equal(policyForRoute('GET','/api/v10/detection/benchmark').localVisualization,true);assert.equal(policyForRoute('GET','/api/v10/pilot/report').localVisualization,true);
});

test('detection benchmark caches one immutable compact representation',async(t)=>{
  await mkdir('.tmp/test',{recursive:true});const dir=await mkdtemp(path.join('.tmp/test','benchmark-cache-')),file=path.join(dir,'benchmark.json');t.after(()=>rm(dir,{recursive:true,force:true}));
  await writeFile(file,JSON.stringify({schemaVersion:'benchmark.v1',results:[{id:1}]}));const service=new DetectionService({benchmarkFile:file});assert.equal((await service.benchmark()).resultCount,1);
  await writeFile(file,'not-json');assert.equal((await service.benchmark()).resultCount,1);
});
