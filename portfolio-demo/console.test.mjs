import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createDemoSession} from './scenario.mjs';
import {consoleState} from './projection.mjs';
import {renderApprovedRoute} from '../apps/operator-console/src/approved/index.js';
import {teamRequest,vigiaApi} from './unavailable-api.mjs';

test('six original routes accept the explicit synthetic projection',()=>{
 for(const route of ['command-overview','incidents','incident-detail','intelligence','operations','global-awareness']){
  const state=consoleState(createDemoSession().snapshot());
  assert.equal(state.runtime.session.authenticated,false);
  const markup=renderApprovedRoute(route,state);
  assert.match(markup,/<main /);
  assert.match(markup,/Synthetic data/);
 }
});
test('public transport fails closed for reads and writes',()=>{
 assert.throws(()=>teamRequest('report',{note:'test'}),/not connected/);
 assert.throws(()=>vigiaApi.createSession(),/not connected/);
});
test('deploy directory contains only allowlisted static assets',async()=>{
 assert.deepEqual((await readdir(new URL('./dist/',import.meta.url))).sort(),['_headers','demo.css','demo.js','index.html','maplibre-gl-shared.mjs','maplibre-gl-worker.mjs']);
 for(const name of ['demo.js','demo.css','index.html']){
  const source=await readFile(new URL('./dist/'+name,import.meta.url),'utf8');
  assert.equal(/\/Users\/|VIGIA_TEST_ONLY|BEGIN (?:RSA |EC )?PRIVATE KEY|sourceMappingURL|\/backend\/|\/__operator\//.test(source),false,`${name}: unexpected private or operational reference`);
 }
 const headers=await readFile(new URL('./dist/_headers',import.meta.url),'utf8');
 assert.match(headers,/connect-src 'self'/);
});
