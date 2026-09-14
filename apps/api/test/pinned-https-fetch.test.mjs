import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { createPinnedHttpsFetch,pinnedAddressLookup } from '../src/shared/pinned-https-fetch.mjs';

const fakeRequest=(seen)=>((options,callback)=>{seen.push(options);const request=new EventEmitter();request.setTimeout=()=>{};request.destroy=(error)=>queueMicrotask(()=>request.emit('error',error));request.end=(body)=>queueMicrotask(()=>{seen.push(body);const response=Readable.from([Buffer.from('{"ok":true}')]);response.statusCode=200;response.statusMessage='OK';response.headers={'content-type':'application/json','content-length':'11'};callback(response);});return request;});

test('pinned HTTPS transport binds the approved public address while preserving TLS hostname identity',async()=>{
  const seen=[],fetchImpl=createPinnedHttpsFetch({resolveHost:async()=>[{address:'93.184.216.34',family:4}],requestImpl:fakeRequest(seen)}),response=await fetchImpl('https://provider.example.test/data?x=1',{method:'POST',headers:{authorization:'Bearer test'},body:'{}'});
  assert.deepEqual(await response.json(),{ok:true});assert.equal(seen[0].hostname,'provider.example.test');assert.equal(seen[0].servername,'provider.example.test');assert.equal(seen[0].rejectUnauthorized,true);assert.equal(seen[0].headers.host,'provider.example.test');assert.equal(seen[0].headers.authorization,'Bearer test');
  let address;seen[0].lookup('provider.example.test',{},(_error,value,family)=>{address={value,family};});assert.deepEqual(address,{value:'93.184.216.34',family:4});assert.equal(seen[1].toString(),'{}');
});

test('pinned address lookup supports Node scalar and all-address callback contracts',async()=>{
  const lookup=pinnedAddressLookup({address:'93.184.216.34',family:4});
  await new Promise((resolve,reject)=>lookup('ignored',{},(error,address,family)=>{if(error)return reject(error);assert.equal(address,'93.184.216.34');assert.equal(family,4);resolve();}));
  await new Promise((resolve,reject)=>lookup('ignored',{all:true},(error,addresses)=>{if(error)return reject(error);assert.deepEqual(addresses,[{address:'93.184.216.34',family:4}]);resolve();}));
});

test('pinned HTTPS transport rejects private, mixed, mapped, credentialed and non-TLS destinations before socket creation',async()=>{
  let requests=0;const requestImpl=()=>{requests+=1;throw new Error('must_not_connect');};
  for(const addresses of [[{address:'127.0.0.1',family:4}],[{address:'93.184.216.34',family:4},{address:'10.0.0.1',family:4}],[{address:'::ffff:127.0.0.1',family:6}]])await assert.rejects(()=>createPinnedHttpsFetch({resolveHost:async()=>addresses,requestImpl})('https://provider.example.test/data'),/destination_not_public/);
  for(const url of ['http://provider.example.test/data','https://user:secret@provider.example.test/data','https://127.0.0.1/data','https://provider.example.test:444/data'])await assert.rejects(()=>createPinnedHttpsFetch({resolveHost:async()=>[{address:'93.184.216.34',family:4}],requestImpl})(url),/url_rejected/);
  assert.equal(requests,0);
});

test('pinned HTTPS transport keeps the abort binding active while a response body is streaming',async()=>{
  let response;const requestImpl=(_options,callback)=>{const request=new EventEmitter();request.setTimeout=()=>{};request.end=()=>queueMicrotask(()=>{response=new Readable({read(){}});response.statusCode=200;response.statusMessage='OK';response.headers={'content-type':'application/octet-stream'};callback(response);});request.destroy=(error)=>{response?.destroy(error);request.emit('error',error);};return request;},controller=new AbortController(),fetchImpl=createPinnedHttpsFetch({resolveHost:async()=>[{address:'93.184.216.34',family:4}],requestImpl}),result=await fetchImpl('https://provider.example.test/slow',{signal:controller.signal}),reading=result.arrayBuffer();
  controller.abort(new Error('controlled_abort'));
  await assert.rejects(()=>reading,/controlled_abort/);
});

test('pinned HTTPS transport single-flights and briefly caches validated DNS answers',async()=>{
  let resolutions=0;const seen=[],fetchImpl=createPinnedHttpsFetch({resolveHost:async()=>{resolutions+=1;await new Promise(resolve=>setTimeout(resolve,10));return[{address:'93.184.216.34',family:4}];},requestImpl:fakeRequest(seen),dnsCacheTtlMs:60_000});
  await Promise.all([fetchImpl('https://provider.example.test/a'),fetchImpl('https://provider.example.test/b')]);
  await fetchImpl('https://provider.example.test/c');
  assert.equal(resolutions,1);
});

test('pinned HTTPS transport deadline covers DNS resolution and prevents a late socket',async()=>{
  let requests=0;const fetchImpl=createPinnedHttpsFetch({resolveHost:async()=>{await new Promise(resolve=>setTimeout(resolve,120));return[{address:'93.184.216.34',family:4}];},requestImpl:()=>{requests+=1;throw new Error('late_socket_must_not_open');},timeoutMs:20});
  const startedAt=Date.now();
  await assert.rejects(()=>fetchImpl('https://provider.example.test/slow-dns'),/pinned_https_timeout/);
  assert(Date.now()-startedAt<100);assert.equal(requests,0);
});
