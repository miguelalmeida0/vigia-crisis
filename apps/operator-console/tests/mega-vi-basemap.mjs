import test from 'node:test';
import assert from 'node:assert/strict';
import {createBasemapDelivery} from '../basemap-delivery.mjs';
test('isolated tile delivery preserves bytes, provenance and private caching',async()=>{
 let request,headers,body,status;const tile={buffer:Buffer.from('tile'),contentType:'image/png',state:'current',provider:'governed',acquiredAt:'2026-09-13T10:00:00Z',lastGoodAt:'2026-09-13T10:00:00Z',provenance:'source'};
 const deliver=createBasemapDelivery({service:{tile:async input=>{request=input;return tile;}}}),res={writeHead:(code,value)=>{status=code;headers=value;},end:value=>body=value};
 assert.equal(await deliver({method:'GET',socket:{remoteAddress:'local'}},res,'/backend/api/v1/basemap/imagery/11/980/786'),true);
 assert.equal(status,200);assert.equal(body,tile.buffer);assert.equal(headers['x-vigia-acquired-at'],tile.acquiredAt);assert.match(headers['cache-control'],/^private/);assert.deepEqual(request,{kind:'imagery',z:'11',x:'980',y:'786',clientKey:'local'});
 assert.equal(await deliver({method:'GET'},res,'/backend/api/v1/basemap/imagery/http/example'),false);
});
test('provider failure is explicit and never cached as current imagery',async()=>{
 let status,headers,body;const deliver=createBasemapDelivery({service:{tile:async()=>{throw Object.assign(new Error('upstream_timeout'),{statusCode:503});}}});
 await deliver({method:'GET',socket:{}},{writeHead:(s,h)=>{status=s;headers=h;},end:b=>body=b},'/backend/api/v1/basemap/labels/11/980/786');
 assert.equal(status,503);assert.equal(headers['cache-control'],'no-store');assert.equal(JSON.parse(body).error,'basemap_unavailable');
});
