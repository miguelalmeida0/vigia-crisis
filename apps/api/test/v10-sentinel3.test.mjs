import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { Sentinel3FrpGateway } from '../src/modules/world/sentinel3/sentinel3-frp-gateway.mjs';
import { CdseFrpAcquirer, assertTrustedCdseAssetUrl, parseBody } from '../src/modules/world/sentinel3/cdse-frp-acquirer.mjs';
import { sensorCoverageForEvent } from '../src/modules/events/sensor-coverage.mjs';
import { AcquisitionStore } from '../src/modules/acquisition/acquisition-store.mjs';

const now=new Date('2026-08-09T14:00:00Z');
const exec=promisify(execFile);

test('live acquisition filename cannot be mistaken for the FRP variable',async(t)=>{
  const tempRoot=path.resolve('.tmp/test');await mkdir(tempRoot,{recursive:true});const directory=await mkdtemp(path.join(tempRoot,'vigia-s3-parser-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const product=path.join(directory,'FRP_MWIR1km_STANDARD.nc'),python=path.resolve('.venv/bin/python'),parser=path.resolve('apps/api/src/modules/world/sentinel3/parse_sentinel3_frp.py');
  const make=`import h5py,sys\nwith h5py.File(sys.argv[1], 'w') as f:\n f.create_dataset('FRP_MWIR',data=[29.7,14.9])\n f.create_dataset('latitude',data=[37.44,37.43])\n f.create_dataset('longitude',data=[-8.32,-8.31])\n f.create_dataset('j',data=[282,282])\n f.create_dataset('i',data=[1197,1198])`;
  await exec(python,['-c',make,product]);const {stdout}=await exec(python,[parser,product]);const parsed=JSON.parse(stdout);
  assert.equal(parsed.ok,true);assert.deepEqual(parsed.detections.map((item)=>Number(item.frpMw.toFixed(1))),[29.7,14.9]);assert.equal(parsed.detections[0].nativeRow,282);
});

test('parent supervisor removes Sentinel extraction workspace after forced output termination',async(t)=>{
  const tempRoot=path.resolve('.tmp/test');await mkdir(tempRoot,{recursive:true});const directory=await mkdtemp(path.join(tempRoot,'vigia-s3-cleanup-'));t.after(()=>rm(directory,{recursive:true,force:true}));const parser=path.join(directory,'overflow-parser.sh'),work=path.join(directory,'work');await mkdir(work);await writeFile(parser,'#!/bin/sh\nmkdir -p "$3"\nprintf marker > "$3/expanded.bin"\ndd if=/dev/zero bs=1048576 count=3 2>/dev/null\nsleep 5\n');await chmod(parser,0o755);
  const result=await parseBody(Buffer.from('zip-like-body'),parser,work,{format:'zip',name:'product'});assert.equal(result.ok,false);assert.equal(result.error,'parser_output_too_large');assert.deepEqual(await readdir(work),[]);
});
test('V10 normalizes structured Sentinel-3 SLSTR FRP as an independent physical source',async()=>{
  const gateway=new Sentinel3FrpGateway({jsonUrl:'https://example.test/frp',clock:()=>now,fetchImpl:async()=>new Response(JSON.stringify({observedAt:'2026-08-09T13:55:00Z',platform:'Sentinel-3A',detections:[{latitude:40,longitude:-8,frpMw:27.4,confidence:82,uncertaintyMw:3.1,qualityFlags:['nominal']}]}),{status:200})});
  const snapshot=await gateway.snapshot(); assert.equal(snapshot.state.state,'current'); assert.equal(snapshot.data.length,1);
  const point=snapshot.data[0]; assert.equal(point.sourceFamily,'sentinel3_slstr'); assert.equal(point.independenceGroup,'sentinel_3a_slstr'); assert.equal(point.frpMw,27.4); assert.equal(point.frpUncertaintyMw,3.1);
});

test('sensor coverage never mislabels Sentinel-3 thermal evidence as VIIRS',()=>{
  const event={observations:[{id:'s3',type:'thermal',at:'2026-08-09T13:55:00Z',satellite:'Sentinel-3A',instrument:'SLSTR',sourceFamily:'sentinel3_slstr'}],reportState:{}};
  const coverage=sensorCoverageForEvent(event,{world:{sources:{firms:{state:'current',upstreamAt:'2026-08-09T13:50:00Z'}}},sentinel3Points:{state:'current',upstreamAt:'2026-08-09T13:55:00Z'},now});
  assert.equal(coverage.sentinel3.state,'point_detection_present'); assert.notEqual(coverage.viirs.state,'point_detection_present'); assert.equal(coverage.viirs.negativeEvidence,false);
});

test('official CDSE acquisition retains raw-product lineage on Sentinel-3 points',async()=>{
  const rawSourceProduct={id:'raw:cdse:sha',receivedAt:'2026-08-09T13:58:00Z',checksumSha256:'a'.repeat(64),providerProductId:'s3-product:FRP_MWIR1km_STANDARD'};
  const cdseAcquirer={configured:()=>true,acquire:async()=>({items:[{id:'S3B_SL_2_FRP_product'}],outputs:[{item:{id:'S3B_SL_2_FRP_product',properties:{platform:'sentinel-3b'}},rawSourceProduct,parsed:{observedAt:'2026-08-09T13:55:00Z',platform:'Sentinel-3',detections:[{latitude:40,longitude:-8,frpMw:41.2,confidence:91}]}}]})};
  const gateway=new Sentinel3FrpGateway({cdseAcquirer,clock:()=>now});
  const snapshot=await gateway.snapshot();
  assert.equal(snapshot.state.mode,'cdse_stac_download');assert.deepEqual(snapshot.state.rawSourceProductIds,[rawSourceProduct.id]);
  assert.equal(snapshot.data[0].rawSourceProductId,rawSourceProduct.id);assert.equal(snapshot.data[0].provenance.checksumSha256,'a'.repeat(64));assert.equal(snapshot.data[0].independenceGroup,'sentinel_3b_slstr');
});

test('public CDSE catalogue discovery is visible without download credentials',async()=>{
  let request=null;
  const item={id:'S3B_SL_2_FRP____20260811T224648_SAMPLE',collection:'sentinel-3-sl-2-frp-nrt',bbox:[-10,36,-6,43],properties:{datetime:'2026-08-11T22:46:48Z'},assets:{FRP_MWIR1km_STANDARD:{href:'s3://eodata/sample.nc',alternate:{https:{href:'https://download.dataspace.copernicus.eu/sample.nc'}},'file:size':321,'file:checksum':`d50110${'1'.repeat(32)}`}},links:[{rel:'self',href:'https://stac.dataspace.copernicus.eu/v1/items/sample'}]};
  const acquirer=new CdseFrpAcquirer({clock:()=>now,fetchImpl:async(_url,init)=>{request=JSON.parse(init.body);return new Response(JSON.stringify({features:[item]}),{status:200,headers:{'content-type':'application/json'}});}});
  const catalogue=await acquirer.catalogue({lookbackHours:24});
  assert.deepEqual(request.bbox,[-9.75,36.7,-6,42.3]);
  assert.equal(catalogue.products[0].id,item.id);assert.equal(catalogue.products[0].platform,'S3B');assert.equal(catalogue.products[0].asset.name,'FRP_MWIR1km_STANDARD');
  assert.equal(catalogue.products[0].asset.checksumIntegrity.algorithm,'md5');assert.equal(catalogue.products[0].asset.checksumIntegrity.strength,'legacy_provider_integrity');
});

test('checksum-less CDSE assets remain catalogue-only and never enter physical acquisition',async()=>{
  const item={id:'S3A_CHECKSUM_ABSENT',collection:'sentinel-3-sl-2-frp-nrt',properties:{datetime:'2026-08-11T22:46:48Z'},assets:{FRP_MWIR1km_STANDARD:{alternate:{https:{href:'https://download.dataspace.copernicus.eu/unchecked.nc'}},type:'application/netcdf','file:size':321}}};
  const acquirer=new CdseFrpAcquirer({clock:()=>now,fetchImpl:async()=>new Response(JSON.stringify({features:[item]}),{status:200,headers:{'content-type':'application/json'}})}),catalogue=await acquirer.catalogue({lookbackHours:24});
  assert.deepEqual(catalogue.items,[]);assert.deepEqual(catalogue.products,[]);
});

test('governed historical CDSE replay selects the NTC archive product explicitly',async()=>{
  let request=null;
  const item={id:'S3A_SL_2_FRP____20240918T222522_SAMPLE',collection:'sentinel-3-sl-2-frp-ntc',properties:{datetime:'2024-09-18T22:25:22Z'},assets:{FRP_in:{href:'s3://eodata/FRP_in.nc',alternate:{https:{href:'https://download.dataspace.copernicus.eu/FRP_in.nc'}},type:'application/netcdf','file:size':354337,'file:checksum':`d50110${'2'.repeat(32)}`},FRP_an:{href:'s3://eodata/FRP_an.nc',alternate:{https:{href:'https://download.dataspace.copernicus.eu/FRP_an.nc'}},type:'application/netcdf','file:size':150198,'file:checksum':`d50110${'3'.repeat(32)}`},product:{href:'https://download.dataspace.copernicus.eu/odata/v1/Products(sample)/$value',type:'application/zip','file:size':74746244,'file:checksum':`d50110${'4'.repeat(32)}`}}};
  const acquirer=new CdseFrpAcquirer({collection:'sentinel-3-sl-2-frp-ntc',clock:()=>now,fetchImpl:async(_url,init)=>{request=JSON.parse(init.body);return new Response(JSON.stringify({features:[item]}),{status:200,headers:{'content-type':'application/json'}});}});
  const catalogue=await acquirer.catalogue({start:'2024-09-16T00:00:00Z',end:'2024-09-18T23:59:59Z'});
  assert.deepEqual(request.collections,['sentinel-3-sl-2-frp-ntc']);
  assert.equal(catalogue.requestWindow.collection,'sentinel-3-sl-2-frp-ntc');
  assert.equal(catalogue.products[0].asset.name,'FRP_in');
  assert.equal(catalogue.products[0].asset.format,'netcdf');
  assert.equal(catalogue.products[0].asset.size,354337);
});

test('governed historical CDSE replay falls back to SWIR but rejects an oversized whole product',async()=>{
  const swirItem={id:'S3A_SL_2_FRP____20240918T222522_SWIR',collection:'sentinel-3-sl-2-frp-ntc',properties:{datetime:'2024-09-18T22:25:22Z'},assets:{FRP_an:{href:'s3://eodata/FRP_an.nc',alternate:{https:{href:'https://download.dataspace.copernicus.eu/FRP_an.nc'}},type:'application/netcdf','file:size':150198,'file:checksum':`d50110${'5'.repeat(32)}`},product:{href:'https://download.dataspace.copernicus.eu/odata/v1/Products(sample)/$value',type:'application/zip','file:size':74746244}}};
  const swirAcquirer=new CdseFrpAcquirer({collection:'sentinel-3-sl-2-frp-ntc',clock:()=>now,fetchImpl:async()=>new Response(JSON.stringify({features:[swirItem]}),{status:200,headers:{'content-type':'application/json'}})});
  const swirCatalogue=await swirAcquirer.catalogue({start:'2024-09-18T22:00:00Z',end:'2024-09-18T23:00:00Z'});
  assert.equal(swirCatalogue.products[0].asset.name,'FRP_an');assert.equal(swirCatalogue.products[0].asset.format,'netcdf');
  const item={id:'S3A_SL_2_FRP____20240918T222522_FALLBACK',collection:'sentinel-3-sl-2-frp-ntc',properties:{datetime:'2024-09-18T22:25:22Z'},assets:{product:{href:'https://download.dataspace.copernicus.eu/odata/v1/Products(sample)/$value',type:'application/zip','file:size':74746244}}};
  const acquirer=new CdseFrpAcquirer({collection:'sentinel-3-sl-2-frp-ntc',clock:()=>now,fetchImpl:async()=>new Response(JSON.stringify({features:[item]}),{status:200,headers:{'content-type':'application/json'}})});
  const catalogue=await acquirer.catalogue({start:'2024-09-18T22:00:00Z',end:'2024-09-18T23:00:00Z'});
  assert.equal(catalogue.products.length,0);
});

test('Sentinel-3 source health preserves provider zero-result diagnostics',async()=>{
  const rawSourceProduct={id:'raw:cdse:zero',receivedAt:'2026-08-09T13:58:00Z',checksumSha256:'c'.repeat(64),providerProductId:'s3-product:FRP_MWIR1km_STANDARD'};
  const cdseAcquirer={configured:()=>true,acquire:async()=>({items:[{id:'S3B_SL_2_FRP_zero'}],products:[{observedAt:'2026-08-09T13:55:00Z'}],requestWindow:{collection:'sentinel-3-sl-2-frp-nrt'},selectionMode:'current_recent',outputs:[{item:{id:'S3B_SL_2_FRP_zero',properties:{datetime:'2026-08-09T13:55:00Z'}},rawSourceProduct,parsed:{observedAt:'2026-08-09T13:55:00Z',detections:[],sourceRecordCount:0,positiveFrpRecordCount:0,aoiObservationCount:0,observationConclusion:'source_product_contains_no_active_fire_records'}}]})};
  const snapshot=await new Sentinel3FrpGateway({cdseAcquirer,clock:()=>now}).snapshot();
  assert.equal(snapshot.state.state,'empty');assert.equal(snapshot.state.observationConclusion,'source_product_contains_no_active_fire_records');assert.equal(snapshot.state.productDiagnostics[0].sourceRecordCount,0);assert.equal(snapshot.state.productDiagnostics[0].rawSourceProductId,rawSourceProduct.id);
});

test('CDSE FRP acquisition rejects collections outside the governed allowlist',()=>{
  assert.throws(()=>new CdseFrpAcquirer({collection:'untrusted-collection'}),/unsupported_cdse_frp_collection/);
});

test('CDSE bearer-token downloads are confined to exact provider origins',()=>{
  assert.equal(assertTrustedCdseAssetUrl('https://download.dataspace.copernicus.eu/product.nc').origin,'https://download.dataspace.copernicus.eu');
  assert.throws(()=>assertTrustedCdseAssetUrl('https://download.dataspace.copernicus.eu.attacker.test/product.nc'),/cdse_asset_url_rejected/);
  assert.throws(()=>assertTrustedCdseAssetUrl('https://download.dataspace.copernicus.eu:444/product.nc'),/cdse_asset_url_rejected/);
  assert.throws(()=>assertTrustedCdseAssetUrl('https://operator:secret@download.dataspace.copernicus.eu/product.nc'),/cdse_asset_url_rejected/);
});

test('authenticated CDSE download is archived with SHA-256 lineage and deduplicates on replay',async(t)=>{
  const tempRoot=path.resolve('.tmp/test');await mkdir(tempRoot,{recursive:true});const directory=await mkdtemp(path.join(tempRoot,'vigia-cdse-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const parser=path.join(directory,'parser');
  const parserPayload={ok:true,observedAt:'2024-09-17T11:31:38Z',platform:'Sentinel-3A',detections:[{latitude:40.89,longitude:-7.93,frpMw:18.2,uncertaintyMw:1.4,qualityFlags:['provider_quality_code:0']}]};
  await writeFile(parser,`#!/bin/sh\nprintf '%s\\n' '${JSON.stringify(parserPayload)}'\n`);await chmod(parser,0o755);
  const store=new AcquisitionStore({filePath:path.join(directory,'state.json'),archiveDir:path.join(directory,'raw'),clock:()=>now});await store.initialize();
  const body=Buffer.from('official-provider-binary');let downloads=0,tokenRequests=0,authorization=null;
  const item={id:'S3A_SL_2_FRP____20240917T113139_SAMPLE',collection:'sentinel-3-sl-2-frp-ntc',properties:{datetime:'2024-09-17T11:31:38Z',platform:'sentinel-3a'},assets:{product:{href:'https://download.dataspace.copernicus.eu/product',type:'application/zip','file:size':body.length,'file:checksum':`1220${createHash('sha256').update(body).digest('hex')}`}},links:[{rel:'self',href:'https://stac.test/item'}]};
  const fetchImpl=async(url,init={})=>{if(String(url).includes('/token')){tokenRequests+=1;return new Response(JSON.stringify({access_token:'redacted-test-token'}),{status:200,headers:{'content-type':'application/json'}});}if(String(url).includes('/search'))return new Response(JSON.stringify({features:[item]}),{status:200,headers:{'content-type':'application/json'}});downloads+=1;authorization=init.headers?.authorization;return new Response(body,{status:200,headers:{'content-type':'application/zip'}});};
  const acquirer=new CdseFrpAcquirer({username:'operator',password:'secret',collection:'sentinel-3-sl-2-frp-ntc',searchStart:'2024-09-17T11:30:00Z',searchEnd:'2024-09-17T11:35:00Z',maxProducts:1,acquisitionStore:store,fetchImpl,pythonBinary:parser,clock:()=>now,tempRoot:path.join(directory,'parse')});
  const first=await acquirer.acquire(),second=await acquirer.acquire();
  assert.equal(tokenRequests,1);assert.equal(downloads,2);assert.equal(authorization,'Bearer redacted-test-token');assert.equal(first.outputs[0].duplicate,false);assert.equal(second.outputs[0].duplicate,true);
  const products=store.products();assert.equal(products.length,1);assert.equal(products[0].checksumSha256,createHash('sha256').update(body).digest('hex'));assert.equal(products[0].processingState,'parsed');assert.equal(products[0].requestWindow.collection,'sentinel-3-sl-2-frp-ntc');
});

test('CDSE advertised checksum mismatch is rejected before immutable archival or parsing',async(t)=>{
  const tempRoot=path.resolve('.tmp/test');await mkdir(tempRoot,{recursive:true});const directory=await mkdtemp(path.join(tempRoot,'vigia-cdse-checksum-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const body=Buffer.from('tampered-provider-binary'),item={id:'S3A_CHECKSUM_MISMATCH',collection:'sentinel-3-sl-2-frp-ntc',properties:{datetime:'2024-09-17T11:31:38Z',platform:'sentinel-3a'},assets:{product:{href:'https://download.dataspace.copernicus.eu/product',type:'application/zip','file:size':body.length,'file:checksum':`1220${'0'.repeat(64)}`}},links:[]},catalogueResult={items:[item],products:[],requestWindow:{collection:'sentinel-3-sl-2-frp-ntc'},cataloguedAt:now.toISOString()};
  const store=new AcquisitionStore({filePath:path.join(directory,'state.json'),archiveDir:path.join(directory,'raw'),clock:()=>now});await store.initialize();const fetchImpl=async(url)=>String(url).includes('/token')?new Response(JSON.stringify({access_token:'redacted-test-token'}),{headers:{'content-type':'application/json'}}):new Response(body);
  const acquirer=new CdseFrpAcquirer({username:'operator',password:'secret',collection:'sentinel-3-sl-2-frp-ntc',acquisitionStore:store,fetchImpl,clock:()=>now,tempRoot:path.join(directory,'parse')});
  await assert.rejects(()=>acquirer.acquire({catalogueResult,failFast:true}),/upstream_checksum_mismatch/);assert.equal(store.products().length,0);assert.equal(store.status().rawProductCount,0);
});

test('CDSE authentication failure is explicit before product download',async()=>{
  const acquirer=new CdseFrpAcquirer({username:'operator',password:'invalid',acquisitionStore:{recordAttempt:async()=>{},recordFailure:async()=>{}},fetchImpl:async()=>new Response('{}',{status:401})});
  await assert.rejects(()=>acquirer.acquire(),/cdse_auth_http_401/);
});

test('Sentinel-3 source health separates public catalogue availability from physical observations',async()=>{
  const product={id:'S3A_SL_2_FRP____20260811T214430_SAMPLE',platform:'S3A',observedAt:'2026-08-11T21:44:30Z',asset:{name:'FRP_MWIR1km_STANDARD'}};
  const cdseAcquirer={configured:()=>false,catalogue:async()=>({items:[{id:product.id}],products:[product],requestWindow:{start:'2026-08-10T14:00:00Z',end:now.toISOString()}})};
  const gateway=new Sentinel3FrpGateway({cdseAcquirer,clock:()=>now});
  const snapshot=await gateway.snapshot();
  assert.equal(snapshot.state.state,'catalogue_available');assert.equal(snapshot.state.cataloguedProducts,1);assert.equal(snapshot.state.latestCatalogProduct.id,product.id);
  assert.equal(snapshot.state.authenticationState,'credential_required_for_download');assert.equal(snapshot.state.accepted,0);assert.equal(snapshot.data.length,0);
});

test('live Sentinel-3 catalogue checkpoint downloads only unseen product IDs',async(t)=>{
  const tempRoot=path.resolve('.tmp/test');await mkdir(tempRoot,{recursive:true});const directory=await mkdtemp(path.join(tempRoot,'vigia-s3-live-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const store=new AcquisitionStore({filePath:path.join(directory,'state.json'),archiveDir:path.join(directory,'raw'),clock:()=>now});await store.initialize();
  await store.commitProduct({sourceId:'sentinel3:nrt:sentinel-3a',provider:'copernicus-data-space',body:Buffer.from('known'),providerProductId:'known:FRP_MWIR1km_STANDARD',sourceTimestamp:'2026-08-09T13:40:00Z',requestWindow:{collection:'sentinel-3-sl-2-frp-nrt',itemId:'known'}});
  const catalogue={cataloguedAt:'2026-08-09T14:00:00Z',requestWindow:{collection:'sentinel-3-sl-2-frp-nrt'},items:[{id:'known'},{id:'new',properties:{platform:'sentinel-3b'}}],products:[{id:'new',observedAt:'2026-08-09T13:55:00Z'},{id:'known',observedAt:'2026-08-09T13:40:00Z'}]};let selected=null;
  const rawSourceProduct={id:'raw:new',receivedAt:'2026-08-09T13:59:00Z',checksumSha256:'d'.repeat(64),providerProductId:'new:FRP_MWIR1km_STANDARD',requestWindow:{providerDiscoveredAt:catalogue.cataloguedAt}};
  const cdseAcquirer={configured:()=>true,catalogue:async()=>catalogue,acquire:async(options)=>{selected=options.productIds;return{...catalogue,items:[catalogue.items[1]],outputs:[{item:catalogue.items[1],rawSourceProduct,parsed:{observedAt:'2026-08-09T13:55:00Z',detections:[{latitude:40,longitude:-8,frpMw:15}]}}],failures:[],selectionMode:'current_recent'};}};
  const snapshot=await new Sentinel3FrpGateway({cdseAcquirer,acquisitionStore:store,clock:()=>now}).snapshot();
  assert.deepEqual(selected,['new']);assert.deepEqual(snapshot.state.newProductIds,['new']);assert.equal(snapshot.state.skippedKnownProducts,1);assert.equal(snapshot.data.length,1);assert.equal(snapshot.state.catalogueCheckpoint.latestProductId,'new');
});

test('live Sentinel-3 restart rehydrates accepted observations from the immutable archive',async(t)=>{
  const tempRoot=path.resolve('.tmp/test');await mkdir(tempRoot,{recursive:true});const directory=await mkdtemp(path.join(tempRoot,'vigia-s3-rehydrate-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const parser=path.join(directory,'parser'),parserPayload={ok:true,observedAt:'2026-08-09T13:55:00Z',platform:'Sentinel-3A',sourceRecordCount:1,positiveFrpRecordCount:1,aoiObservationCount:1,observationConclusion:'positive_frp_pixels_in_portugal_aoi',detections:[{latitude:37.44,longitude:-8.32,observedAt:'2026-08-09T13:55:30Z',frpMw:29.7,confidence:97}]};
  await writeFile(parser,`#!/bin/sh\nprintf '%s\\n' '${JSON.stringify(parserPayload)}'\n`);await chmod(parser,0o755);
  const store=new AcquisitionStore({filePath:path.join(directory,'state.json'),archiveDir:path.join(directory,'raw'),clock:()=>now});await store.initialize();
  const accepted=await store.commitProduct({sourceId:'sentinel3:nrt:sentinel-3a',provider:'copernicus-data-space',body:Buffer.from('archived-netcdf'),providerProductId:'known:FRP_MWIR1km_STANDARD',sourceTimestamp:'2026-08-09T13:55:00Z',parserVersion:'sentinel3-sl2-frp-netcdf-v3',normalizerVersion:'sentinel3-slstr-frp-v3',requestWindow:{collection:'sentinel-3-sl-2-frp-nrt',itemId:'known',providerDiscoveredAt:'2026-08-09T13:58:00Z'}});await store.markProductsIngested([accepted.product.id]);
  const item={id:'known',properties:{platform:'sentinel-3a',datetime:'2026-08-09T13:55:00Z'}},catalogue={cataloguedAt:now.toISOString(),requestWindow:{collection:'sentinel-3-sl-2-frp-nrt'},items:[item],products:[{id:'known',observedAt:'2026-08-09T13:55:00Z'}]};
  const cdseAcquirer={configured:()=>true,catalogue:async()=>catalogue,acquire:async()=>{throw new Error('known_product_must_not_redownload');}};
  const snapshot=await new Sentinel3FrpGateway({cdseAcquirer,acquisitionStore:store,pythonBinary:parser,clock:()=>now}).snapshot();
  assert.equal(snapshot.state.state,'current');assert.equal(snapshot.state.rehydratedProducts,1);assert.equal(snapshot.state.acquiredProducts,0);assert.equal(snapshot.state.productDiagnostics[0].rehydratedFromArchive,true);assert.equal(snapshot.data[0].frpMw,29.7);assert.equal(snapshot.data[0].provenance.rawSourceProductId,accepted.product.id);
});
