import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { RasterAssetBroker,rasterAssetUrl,rasterBindingExtends } from '../src/modules/observations/raster-asset-broker.mjs';

const hosts=['sentinel-cogs.s3.us-west-2.amazonaws.com'];

test('provider raster policy requires exact HTTPS authority and GeoTIFF path',()=>{
  assert.equal(rasterAssetUrl('https://sentinel-cogs.s3.us-west-2.amazonaws.com/tile/red.tif',{allowedHosts:hosts}),'https://sentinel-cogs.s3.us-west-2.amazonaws.com/tile/red.tif');
  for(const value of ['http://sentinel-cogs.s3.us-west-2.amazonaws.com/tile/red.tif','https://127.0.0.1/red.tif','https://sentinel-cogs.s3.us-west-2.amazonaws.com.evil.test/red.tif','https://user:pass@sentinel-cogs.s3.us-west-2.amazonaws.com/red.tif','https://sentinel-cogs.s3.us-west-2.amazonaws.com/red.tif#fragment','https://sentinel-cogs.s3.us-west-2.amazonaws.com/metadata.json'])assert.equal(rasterAssetUrl(value,{allowedHosts:hosts}),null);
});

function rasterRequest(versions,seen=[]){return(options,callback)=>{seen.push(options);const request=new EventEmitter();request.setTimeout=()=>{};request.destroy=(error)=>request.emit('error',error);request.end=()=>queueMicrotask(()=>{const version=versions.shift()??{},match=String(options.headers.range??'bytes=0-3').match(/^bytes=(\d+)-(\d+)$/),start=Number(match?.[1]??0),end=Number(match?.[2]??3),body=Buffer.from(version.body??'TIFF'),response=Readable.from([body]);response.statusCode=version.status??206;response.headers={'content-type':'image/tiff',...(!version.omitLength?{'content-length':String(body.length)}:{}),'content-range':`bytes ${start}-${end}/${version.total??Math.max(end+1,body.length)}`,...(version.etag?{etag:version.etag}:{})};callback(response);});return request;};}

test('raster broker pins a strong object version and sends If-Match on later ranges',async()=>{
  const seen=[],broker=new RasterAssetBroker({resolveHost:async()=>[{address:'93.184.216.34',family:4}],requestImpl:rasterRequest([{etag:'"v1"',body:'TIFF',total:8},{etag:'"v1"',body:'DATA',total:8}],seen)});
  try{const localized=await broker.localizeAsset('https://sentinel-cogs.s3.us-west-2.amazonaws.com/tile/red.tif',{allowedHosts:hosts});for(const range of ['bytes=0-3','bytes=4-7']){const response=await fetch(localized.href,{headers:{range}});assert.equal(response.status,206);await response.arrayBuffer();}const binding=broker.bindingFor(localized.href);assert.equal(binding.contentLength,8);assert.equal(binding.byteRanges.length,2);assert.match(binding.objectVersionHash,/^[a-f0-9]{64}$/);assert.equal(seen[0].headers['if-match'],undefined);assert.equal(seen[1].headers['if-match'],'"v1"');}finally{broker.close();}
});

test('raster broker pinned lookup supports scalar and all-address client requests',async()=>{
  const seen=[],broker=new RasterAssetBroker({resolveHost:async()=>[{address:'93.184.216.34',family:4}],requestImpl:rasterRequest([{etag:'"v1"'}],seen)});
  try{const localized=await broker.localizeAsset('https://sentinel-cogs.s3.us-west-2.amazonaws.com/tile/red.tif',{allowedHosts:hosts});await (await fetch(localized.href,{headers:{range:'bytes=0-3'}})).arrayBuffer();await new Promise((resolve,reject)=>seen[0].lookup('ignored',{all:true},(error,addresses)=>{if(error)return reject(error);assert.deepEqual(addresses,[{address:'93.184.216.34',family:4}]);resolve();}));await new Promise((resolve,reject)=>seen[0].lookup('ignored',{},(error,address,family)=>{if(error)return reject(error);assert.equal(address,'93.184.216.34');assert.equal(family,4);resolve();}));}finally{broker.close();}
});

test('raster broker fails closed on missing or changing object validators',async()=>{
  for(const versions of [[{}],[{etag:'"v1"',body:'TIFF',total:8},{etag:'"v2"',body:'DATA',total:8}]]){const changing=versions.length===2,broker=new RasterAssetBroker({resolveHost:async()=>[{address:'93.184.216.34',family:4}],requestImpl:rasterRequest(versions)});try{const localized=await broker.localizeAsset('https://sentinel-cogs.s3.us-west-2.amazonaws.com/tile/red.tif',{allowedHosts:hosts}),first=await fetch(localized.href,{headers:{range:'bytes=0-3'}});if(changing){assert.equal(first.status,206);await first.arrayBuffer();const second=await fetch(localized.href,{headers:{range:'bytes=4-7'}});assert.equal(second.status,502);}else assert.equal(first.status,502);}finally{broker.close();}}
});

test('raster broker reuses exact bytes and rejects changed overlapping bytes',async()=>{
  const seen=[],broker=new RasterAssetBroker({resolveHost:async()=>[{address:'93.184.216.34',family:4}],requestImpl:rasterRequest([{etag:'"v1"',body:'ABCD',total:8},{etag:'"v1"',body:'ZZEF',total:8}],seen)});
  try{const localized=await broker.localizeAsset('https://sentinel-cogs.s3.us-west-2.amazonaws.com/tile/red.tif',{allowedHosts:hosts}),first=await fetch(localized.href,{headers:{range:'bytes=0-3'}});assert.equal(Buffer.from(await first.arrayBuffer()).toString(),'ABCD');const repeated=await fetch(localized.href,{headers:{range:'bytes=0-3'}});assert.equal(Buffer.from(await repeated.arrayBuffer()).toString(),'ABCD');assert.equal(seen.length,1);const changed=await fetch(localized.href,{headers:{range:'bytes=2-5'}});assert.equal(changed.status,502);}finally{broker.close();}
});

test('raster byte binding grows only by compatible immutable ranges',async()=>{
  const broker=new RasterAssetBroker({resolveHost:async()=>[{address:'93.184.216.34',family:4}],requestImpl:rasterRequest([{etag:'"v1"',body:'ABCD',total:8},{etag:'"v1"',body:'EFGH',total:8}])});
  try{const localized=await broker.localizeAsset('https://sentinel-cogs.s3.us-west-2.amazonaws.com/tile/red.tif',{allowedHosts:hosts});await (await fetch(localized.href,{headers:{range:'bytes=0-3'}})).arrayBuffer();const verified=broker.bindingFor(localized.href);await (await fetch(localized.href,{headers:{range:'bytes=4-7'}})).arrayBuffer();const analysed=broker.bindingFor(localized.href);assert.notEqual(verified.objectVersionHash,analysed.objectVersionHash);assert.equal(rasterBindingExtends(verified,analysed),true);assert.equal(rasterBindingExtends(analysed,verified),false);}finally{broker.close();}
});

test('raster broker preserves bounded chunked range responses',async()=>{
  const broker=new RasterAssetBroker({resolveHost:async()=>[{address:'93.184.216.34',family:4}],requestImpl:rasterRequest([{etag:'"v1"',body:'TIFF',total:4,omitLength:true}])});
  try{const localized=await broker.localizeAsset('https://sentinel-cogs.s3.us-west-2.amazonaws.com/tile/red.tif',{allowedHosts:hosts}),response=await fetch(localized.href,{headers:{range:'bytes=0-3'}});assert.equal(response.status,206);assert.equal(Buffer.from(await response.arrayBuffer()).toString(),'TIFF');}finally{broker.close();}
});

function hangingRequest(onDestroy){return(options,callback)=>{const request=new EventEmitter();let response=null,timer=null;request.setTimeout=()=>{};request.destroy=(error)=>{clearInterval(timer);onDestroy(error);request.emit('error',error);response?.destroy(error);};request.end=()=>queueMicrotask(()=>{response=new Readable({read(){}});response.statusCode=206;response.headers={'content-type':'image/tiff','content-length':'4','content-range':'bytes 0-3/4',etag:'"v1"'};callback(response);timer=setInterval(()=>response.push(Buffer.from('A')),5);});return request;};}

test('raster broker applies a non-resetting upstream deadline',async()=>{
  let destroyed=null;const broker=new RasterAssetBroker({resolveHost:async()=>[{address:'93.184.216.34',family:4}],requestImpl:hangingRequest((error)=>destroyed=error),timeoutMs:1_000,absoluteTimeoutMs:20});
  try{const localized=await broker.localizeAsset('https://sentinel-cogs.s3.us-west-2.amazonaws.com/tile/red.tif',{allowedHosts:hosts}),response=await fetch(localized.href,{headers:{range:'bytes=0-3'}});assert.equal(response.status,502);assert.match(String(destroyed?.message),/deadline_exceeded/);}finally{broker.close();}
});

function invalidDripRequest(onDestroy){return(_options,callback)=>{const request=new EventEmitter();let response=null,timer=null,stopped=false;request.setTimeout=()=>{};request.destroy=(error)=>{stopped=true;clearInterval(timer);onDestroy({error,responseDestroyed:response?.destroyed===true});response?.destroy(error);queueMicrotask(()=>request.emit('error',error));};request.end=()=>queueMicrotask(()=>{response=new Readable({read(){}});response.statusCode=200;response.headers={'content-type':'image/tiff','content-range':'bytes 0-3/4',etag:'"v1"'};callback(response);if(!stopped)timer=setInterval(()=>response.push(Buffer.from('A')),5);});return request;};}

test('raster broker destroys malformed slow-drip responses before releasing admission',async()=>{
  let destroyed=null;const broker=new RasterAssetBroker({resolveHost:async()=>[{address:'93.184.216.34',family:4}],requestImpl:invalidDripRequest((value)=>destroyed=value),timeoutMs:1_000,absoluteTimeoutMs:1_000});
  try{const localized=await broker.localizeAsset('https://sentinel-cogs.s3.us-west-2.amazonaws.com/tile/red.tif',{allowedHosts:hosts}),response=await fetch(localized.href,{headers:{range:'bytes=0-3'}});assert.equal(response.status,502);for(let attempt=0;attempt<20&&!destroyed;attempt+=1)await new Promise((resolve)=>setTimeout(resolve,5));assert.match(String(destroyed?.error?.message),/version_rejected/);assert.equal(destroyed?.responseDestroyed,true);}finally{broker.close();}
});

test('raster broker cancels upstream work when the local client disconnects',async()=>{
  let destroyed=null;const broker=new RasterAssetBroker({resolveHost:async()=>[{address:'93.184.216.34',family:4}],requestImpl:hangingRequest((error)=>destroyed=error),timeoutMs:1_000,absoluteTimeoutMs:2_000}),controller=new AbortController();
  try{const localized=await broker.localizeAsset('https://sentinel-cogs.s3.us-west-2.amazonaws.com/tile/red.tif',{allowedHosts:hosts}),pending=fetch(localized.href,{headers:{range:'bytes=0-3'},signal:controller.signal});setTimeout(()=>controller.abort(),20);await assert.rejects(pending,/abort/i);for(let attempt=0;attempt<20&&!destroyed;attempt+=1)await new Promise((resolve)=>setTimeout(resolve,5));assert.match(String(destroyed?.message),/local_client_disconnected/);}finally{broker.close();}
});

test('raster broker rejects non-finite object lengths before creating a proof binding',async()=>{
  const broker=new RasterAssetBroker({resolveHost:async()=>[{address:'93.184.216.34',family:4}],requestImpl:rasterRequest([{etag:'"v1"',total:'9'.repeat(400)}])});try{const localized=await broker.localizeAsset('https://sentinel-cogs.s3.us-west-2.amazonaws.com/tile/red.tif',{allowedHosts:hosts}),response=await fetch(localized.href,{headers:{range:'bytes=0-3'}});assert.equal(response.status,502);assert.equal(broker.bindingFor(localized.href),null);}finally{broker.close();}
});

test('raster broker rejects private DNS and returns only opaque loopback capabilities for public destinations',async()=>{
  const privateBroker=new RasterAssetBroker({resolveHost:async()=>[{address:'127.0.0.1',family:4}]});
  await assert.rejects(()=>privateBroker.localizeAsset('https://sentinel-cogs.s3.us-west-2.amazonaws.com/tile/red.tif',{allowedHosts:hosts}),/destination_not_public/);
  const broker=new RasterAssetBroker({resolveHost:async()=>[{address:'93.184.216.34',family:4}]});
  try{const localized=await broker.localizeAsset('https://sentinel-cogs.s3.us-west-2.amazonaws.com/tile/red.tif',{allowedHosts:hosts});assert.match(localized.href,/^http:\/\/127\.0\.0\.1:\d+\/raster\/[A-Za-z0-9_-]{32}$/);assert.equal(localized.brokerOrigin,new URL(localized.href).origin);}finally{broker.close();}
});

test('raster broker enforces a global cached-byte ceiling across distinct assets',async()=>{
  const broker=new RasterAssetBroker({resolveHost:async()=>[{address:'93.184.216.34',family:4}],requestImpl:rasterRequest([{etag:'"a"',body:'AAAA',total:4},{etag:'"b"',body:'BBBB',total:4}]),maxCachedBytes:6});
  try{
    const first=await broker.localizeAsset('https://sentinel-cogs.s3.us-west-2.amazonaws.com/tile/a.tif',{allowedHosts:hosts});assert.equal((await fetch(first.href,{headers:{range:'bytes=0-3'}})).status,206);
    const second=await broker.localizeAsset('https://sentinel-cogs.s3.us-west-2.amazonaws.com/tile/b.tif',{allowedHosts:hosts});assert.equal((await fetch(second.href,{headers:{range:'bytes=0-3'}})).status,507);
    assert.deepEqual(broker.status(),{entries:2,cachedBytes:4,reservedBytes:0,maxEntries:64,maxCachedBytes:6});
  }finally{broker.close();}
});

function reservingRequest(){
  let call=0,releaseFirst=null,readyResolve;const ready=new Promise((resolve)=>readyResolve=resolve);
  const requestImpl=(options,callback)=>{const request=new EventEmitter();let response=null;request.setTimeout=()=>{};request.destroy=(error)=>{request.emit('error',error);response?.destroy(error);};request.end=()=>queueMicrotask(()=>{call+=1;response=new Readable({read(){}});response.statusCode=206;response.headers={'content-type':'image/tiff','content-length':'4','content-range':'bytes 0-3/4',etag:`"v${call}"`};callback(response);if(call===1){releaseFirst=()=>{response.push(Buffer.from('AAAA'));response.push(null);};readyResolve();}else{response.push(Buffer.from('BBBB'));response.push(null);}});return request;};
  return{requestImpl,ready,release:()=>releaseFirst?.()};
}

test('raster broker counts concurrent in-flight reservations against its aggregate memory ceiling',async()=>{
  const controlled=reservingRequest(),broker=new RasterAssetBroker({resolveHost:async()=>[{address:'93.184.216.34',family:4}],requestImpl:controlled.requestImpl,maxCachedBytes:6});
  try{
    const first=await broker.localizeAsset('https://sentinel-cogs.s3.us-west-2.amazonaws.com/tile/reserved-a.tif',{allowedHosts:hosts}),firstFetch=fetch(first.href,{headers:{range:'bytes=0-3'}});await controlled.ready;assert.equal(broker.status().reservedBytes,4);
    const second=await broker.localizeAsset('https://sentinel-cogs.s3.us-west-2.amazonaws.com/tile/reserved-b.tif',{allowedHosts:hosts});assert.equal((await fetch(second.href,{headers:{range:'bytes=0-3'}})).status,507);
    controlled.release();assert.equal((await firstFetch).status,206);assert.deepEqual({cachedBytes:broker.status().cachedBytes,reservedBytes:broker.status().reservedBytes},{cachedBytes:4,reservedBytes:0});
  }finally{controlled.release();broker.close();}
});

test('raster broker evicts least-recent inactive capabilities at its entry ceiling',async()=>{
  const broker=new RasterAssetBroker({resolveHost:async()=>[{address:'93.184.216.34',family:4}],maxEntries:2,ttlMs:1_000});
  try{
    const first=await broker.localizeAsset('https://sentinel-cogs.s3.us-west-2.amazonaws.com/tile/entry-a.tif',{allowedHosts:hosts});await new Promise((resolve)=>setTimeout(resolve,2));
    await broker.localizeAsset('https://sentinel-cogs.s3.us-west-2.amazonaws.com/tile/entry-b.tif',{allowedHosts:hosts});await new Promise((resolve)=>setTimeout(resolve,2));
    await broker.localizeAsset('https://sentinel-cogs.s3.us-west-2.amazonaws.com/tile/entry-c.tif',{allowedHosts:hosts});assert.equal(broker.status().entries,2);assert.equal((await fetch(first.href,{headers:{range:'bytes=0-3'}})).status,404);
  }finally{broker.close();}
});

test('raster broker expires idle entries without requiring another request',async()=>{
  const broker=new RasterAssetBroker({resolveHost:async()=>[{address:'93.184.216.34',family:4}],ttlMs:10,pruneIntervalMs:3});
  try{await broker.localizeAsset('https://sentinel-cogs.s3.us-west-2.amazonaws.com/tile/expiring.tif',{allowedHosts:hosts});await new Promise((resolve)=>setTimeout(resolve,35));assert.equal(broker.status().entries,0);}finally{broker.close();}
});
