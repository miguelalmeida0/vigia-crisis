import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(path,import.meta.url),'utf8');

test('Mission Dark keeps one responsive shell and mobile lifecycle navigation',async()=>{
  const [html,css]=await Promise.all([read('../../web/index.html'),read('../../web/styles/v2/mission-dark.css')]);
  assert.match(html,/class="md-rail"/);assert.match(html,/class="md-shell"/);
  const mobile=html.match(/<nav class="gt-mobile-nav"[\s\S]*?<\/nav>/)?.[0]??'';
  for(const label of ['Overview','Detect','Prevent','Respond','Resources','Evidence'])assert.match(mobile,new RegExp(`>${label}<`));
  assert.match(css,/@media\(max-width:880px\)/);assert.match(css,/--md-teal:#53d0cc/);
  assert.match(css,/\.fireground-workspace\{--fg-canvas:#050a0f/);
});

test('FieldNode absence is degraded without masking the central command runtime',async()=>{
  const source=await read('../../web/src/v2/release-compatibility.js');
  assert.match(source,/component==='fieldnode'\)degraded\.push/);
  assert.match(source,/fieldNode&&fieldNode\.contracts/);
  assert.match(source,/schemaVersion:'vigia\.browser-release-handshake\.v2'/);
});

test('Mission Dark names its operator surfaces and fail-closed empty states',async()=>{
  const source=await read('../../web/src/v2/app/render.js');
  for(const label of ['OVERVIEW · OPERATIONAL BRIEFING','DETECT · LIVE PHYSICAL FIRES','PREVENT · MEASUREMENT INTELLIGENCE','EVIDENCE · SYSTEM PROOF','SYSTEM PROOF · GOVERNED REPLAY'])assert.match(source,new RegExp(label));
  assert.match(source,/Current quantities are withheld/);assert.match(source,/Unavailable, not zero/);assert.match(source,/Historical substitution/);
});
