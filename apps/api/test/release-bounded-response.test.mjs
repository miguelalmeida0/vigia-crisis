import assert from 'node:assert/strict';
import test from 'node:test';
import { readBoundedResponse } from '../../../scripts/release/bounded-response.mjs';

test('release response reader accepts bounded JSON',async()=>{
  const response=new Response('{"state":"ready"}',{headers:{'content-length':'17'}});
  assert.deepEqual((await readBoundedResponse(response,{maxBytes:64})).body,{state:'ready'});
});

test('release response reader rejects declared and streamed overflow',async()=>{
  await assert.rejects(()=>readBoundedResponse(new Response('tiny',{headers:{'content-length':'1000'}}),{maxBytes:8}),/bounded_http_response_exceeded/);
  const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(6));controller.enqueue(new Uint8Array(6));controller.close();}});
  await assert.rejects(()=>readBoundedResponse(new Response(stream),{maxBytes:8}),/bounded_http_response_exceeded/);
});
