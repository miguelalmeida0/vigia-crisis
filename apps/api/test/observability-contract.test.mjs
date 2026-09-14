import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('pilot HTTP observability binds correlation, incident, release, status and latency without query strings',async()=>{const source=await readFile(new URL('../src/server.mjs',import.meta.url),'utf8');for(const marker of ['X-VIGIA-Correlation-ID','X-VIGIA-Release-ID','correlationId','incidentId','releaseId','durationMs','component:\'http_request\''])assert.ok(source.includes(marker),marker);assert.match(source,/new URL\(req\.url,'http:\/\/localhost'\)\.pathname/);assert.doesNotMatch(source,/component:'http_request'[^\n]+searchParams/);});
