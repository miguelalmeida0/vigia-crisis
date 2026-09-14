import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { liveSummary } from '../../web/src/v2/views/live.js';
import { renderQueue } from '../../web/src/v2/components/queue.js';
import { validationWorkbench } from '../../web/src/v2/views/validation.js';
import { loadOperationsWorkspace } from '../../web/src/v2/app/workspace-load.js';

test('primary information architecture is Mission Dark overview through evidence',async()=>{
  const html=await readFile(new URL('../../web/index.html',import.meta.url),'utf8');
  const top=html.match(/<nav class="gt-nav"[\s\S]*?<\/nav>/)?.[0]??'',labels=[...top.matchAll(/<b>([^<]+)<\/b>/g)].map((match)=>match[1]);
  assert.deepEqual(labels,['Overview','Detect','Prevent','Respond','Resources','Evidence']);
  assert.match(html,/md-utility-nav/);assert.match(html,/Source health/);assert.match(html,/FieldNet/);assert.match(html,/System proof/);
  assert.match(html,/mission-dark\.css/);
  assert.match(html,/data-action="work"/);assert.doesNotMatch(html,/Operator access code/);
});

test('Command opens with one physical conclusion and only non-zero attention lanes',()=>{
  const html=liveSummary({live:{summary:{activeCurrentPhysicalEvents:2,currentPhysicalCandidates:1,currentMultisourcePhysicalEvents:1},events:[{reportState:{sourceActivity:'current'},physicalState:{freshness:'unobserved'}}]},territory:{summary:{delayedPhysicalEvents:3}},bootstrap:{prevention:{findings:[{reviewSummary:{count:0}},{reviewSummary:{count:1}}]}}});
  for(const label of ['2 CURRENT PHYSICAL FIRE DETECTIONS','Delayed physical candidates','Physical-first candidates','Prevention measurements / reviews','Public report needs corroboration'])assert.match(html,new RegExp(label));
  assert.doesNotMatch(html,/six operational quantities/i);assert.match(html,/operator review required/);
});

test('Command attention rows answer what, where, why, freshness, sources and next action',()=>{
  const html=renderQueue([{id:'event-1',queueKind:'event',title:'Sabugal physical candidate',municipality:'Sabugal',physicalState:{freshness:'current',lastAt:'2026-08-13T00:00:00Z'},reportState:{sourceActivity:'no_report'},physicalSourceProfile:{families:['viirs']},actionNeed:{reason:'Monitor the next physical observation.'}}],null,{command:true});
  assert.match(html,/What \/ where/);assert.match(html,/Why now/);assert.match(html,/Freshness \/ sources/);assert.match(html,/Next action/);assert.match(html,/VIIRS/);assert.match(html,/Sabugal/);
});

test('Validation has bounded loading, failure and ready states',()=>{
  const loading=validationWorkbench({validationState:'loading'});
  assert.match(loading,/Resolving independent validation artifacts/);
  assert.doesNotMatch(loading,/PostGIS operations not currently measurable/);

  const failed=validationWorkbench({validationState:'unavailable',validationError:'benchmark_timeout'});
  assert.match(failed,/Governed validation evidence could not be resolved/);
  assert.match(failed,/Retry validation/);

  const ready=validationWorkbench({validationState:'ready',detectionBenchmark:{v4:{eligibleCases:10,precision:.9,recall:.8,falsePositives:1}},operationsState:'unavailable',operationsError:'postgis_offline'});
  assert.match(ready,/Independent validation artifacts resolved/);
  assert.match(ready,/10 frozen confirmatory cases/);
  assert.match(ready,/PostGIS operations not currently measurable/);
});

test('operations loading settles unavailable without blocking physical work',async()=>{
  const offline=async()=>{throw new Error('postgis_offline');};
  const result=await loadOperationsWorkspace({alerts:offline,operationsStatus:offline,operationsMetrics:offline,notifications:offline});
  assert.equal(result.operationsState,'unavailable');
  assert.equal(result.persistentAlerts.length,0);
  assert.match(result.operationsError,/postgis_offline/);
  assert.ok(result.operationsCheckedAt);
});
