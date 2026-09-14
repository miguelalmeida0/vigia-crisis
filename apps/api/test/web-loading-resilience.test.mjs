import test from 'node:test';
import assert from 'node:assert/strict';
import { Api } from '../../web/src/v2/api.js';
import { createRenderer } from '../../web/src/v2/app/render.js';
import { loadValidationWorkspace, loadWorkspace, preserveLazyValidationWorkspace } from '../../web/src/v2/app/workspace-load.js';
import { liveSummary, renderLiveOverlay } from '../../web/src/v2/views/live.js';

const actor={id:'shadow-operator',name:'Miguel Almeida',title:'Shadow Operator'};
const session={authenticated:true,actor};
const bootstrap = { meta: { generatedAt: '2026-08-11T08:00:00.000Z', region: 'Portugal mainland' }, actor, sources: { firms: { state: 'current' } } };

test('workspace loading isolates a failed live dependency instead of rejecting the whole shell', async () => {
  const result = await loadWorkspace({
    session:async()=>session,commandBootstrap: async () => bootstrap,
    live: async () => { throw new Error('physical_truth_persistence_failed'); },
    territory: async () => null,
    alerts: async () => { throw new Error('alerts_offline'); }
  });
  assert.equal(result.bootstrap, bootstrap);
  assert.equal(result.live.state, 'unavailable');
  assert.match(result.live.error, /physical_truth_persistence_failed/);
  assert.deepEqual(result.live.sources, bootstrap.sources);
  assert.equal(result.replay.state, 'unavailable');
  assert.equal(result.detectionBenchmark,null);
  assert.deepEqual(result.alerts, { alerts: [] });
  assert.deepEqual(result.failures, { live: 'physical_truth_persistence_failed' });
  assert.match(liveSummary({ live: result.live }), /No live event count is shown/);
  assert.match(renderLiveOverlay({ live: result.live }), /Retry live state/);
});

test('a completed physical read cannot leave Command in an indefinite loading state', async () => {
  const workspace = await loadWorkspace({
    session: async () => session,
    commandBootstrap: async () => ({ actor,meta: { mode:'production' }, sources: { firms:{state:'not_configured'} } }),
    live: async () => ({ state:'loading',events:[],summary:{},sources:{} }),
    territory: async () => ({ signals:[] })
  });
  assert.equal(workspace.live.state, 'unavailable');
  assert.match(workspace.live.error, /has not completed/);
  assert.deepEqual(workspace.live.events, []);
});

test('workspace loading reports a fatal bootstrap error explicitly', async () => {
  await assert.rejects(() => loadWorkspace({
    session:async()=>session,commandBootstrap: async () => { throw new Error('bootstrap_timeout'); },
    live: async () => ({}), territory: async () => null, alerts: async () => ({ alerts: [] })
  }), (error) => error.code === 'workspace_bootstrap_unavailable' && /bootstrap_timeout/.test(error.message));
});

test('session failure preserves public Command intelligence and disables mutation authority',async()=>{
  const result=await loadWorkspace({
    session:async()=>{throw new Error('session_timeout');},
    commandBootstrap:async()=>({...bootstrap,actor:{...actor,role:'administrator',authentication:{authenticated:true,mode:'local_shadow_session'}}}),
    live:async()=>({state:'ready',events:[],summary:{},sources:{}}),territory:async()=>({signals:[]})
  });
  assert.equal(result.bootstrap.actor.authentication.authenticated,false);
  assert.equal(result.live.state,'ready');
  assert.match(result.failures.session,/session_timeout/);
});

test('signed-out session preserves the public read projection',async()=>{
  const publicActor={id:'public-readonly',name:'Public read-only',title:'Unauthenticated territory view',role:'public_viewer',authentication:{authenticated:false,mode:'public_read_only'}};
  const result=await loadWorkspace({
    session:async()=>({authenticated:false,actor:null}),commandBootstrap:async()=>({...bootstrap,actor:publicActor}),
    live:async()=>({state:'ready',events:[],summary:{},sources:{}}),territory:async()=>({signals:[]})
  });
  assert.equal(result.bootstrap.actor.id,'public-readonly');
  assert.equal(result.bootstrap.actor.authentication.authenticated,false);
  assert.equal(result.live.state,'ready');
});

test('session identity mismatch degrades mutations without blanking intelligence',async()=>{
  const result=await loadWorkspace({
    session:async()=>session,commandBootstrap:async()=>({...bootstrap,actor:{...actor,name:'Different projection',authentication:{authenticated:true}}}),
    live:async()=>({state:'ready',events:[],summary:{},sources:{}}),territory:async()=>({signals:[]})
  });
  assert.equal(result.bootstrap.actor.authentication.authenticated,false);
  assert.equal(result.session.authenticated,false);
  assert.equal(result.live.state,'ready');
  assert.match(result.failures.session,/differs/);
});

test('Validation keeps resolved domains visible when one independent artifact fails',async()=>{
  const api={
    detectionBenchmark:async()=>({v4:{eligibleCases:12}}),measurementDebt:async()=>({items:[]}),preventionMachineEvidence:async()=>({metrics:{}}),
    measurementCampaigns:async()=>({campaigns:[]}),falseNegativeTaxonomy:async()=>{throw new Error('taxonomy_timeout');},
    liveCampaignScorecards:async()=>({windows:[]}),pilotDefinition:async()=>({organization:'Unassigned'}),pilotReport:async()=>({kpis:{}})
  };
  const result=await loadValidationWorkspace(api);
  assert.equal(result.v4.eligibleCases,12);
  assert.deepEqual(result.measurementDebt,{items:[]});
  assert.equal(result.availability.state,'partially_available');
  assert.deepEqual(result.availability.unavailable,['falseNegativeTaxonomy']);
  assert.match(result.availability.failures.falseNegativeTaxonomy,/taxonomy_timeout/);
});

test('a background workspace refresh preserves an already loaded validation workspace',()=>{
  const governed={availability:{state:'ready'},measurementDebt:{items:[{id:'debt:1'}]}};
  assert.equal(preserveLazyValidationWorkspace(governed,null),governed);
  const refreshed={availability:{state:'ready'},measurementDebt:{items:[]}};
  assert.equal(preserveLazyValidationWorkspace(governed,refreshed),refreshed);
});

test('API requests abort a non-responsive dependency at the declared deadline', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_path, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true }));
  try {
    const started = Date.now();
    await assert.rejects(() => new Api().request('/never', { timeoutMs: 25 }), /Request timed out/);
    assert.ok(Date.now() - started < 500, 'request deadline was not enforced');
  } finally { globalThis.fetch = originalFetch; }
});

test('initial read retries the listener-first runtime until local services are ready',async()=>{
  const originalFetch=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls+=1;return calls===1?new Response(JSON.stringify({error:'runtime_starting',message:'Retry shortly.'}),{status:503,headers:{'content-type':'application/json'}}):new Response(JSON.stringify({ready:true}),{status:200,headers:{'content-type':'application/json'}});};
  try{assert.deepEqual(await new Api().request('/api/v2/bootstrap',{timeoutMs:1_000}),{ready:true});assert.equal(calls,2);}finally{globalThis.fetch=originalFetch;}
});

test('fatal startup failure replaces the spinner with a retryable error surface', () => {
  const attrs = {}, classes = new Map();
  const loading = { dataset: {}, innerHTML: '', setAttribute(name, value) { attrs[name] = value; }, classList: { toggle(name, value) { classes.set(name, value); } } };
  const ui = { root: { dataset: {} }, observation: { childElementCount: 0, replaceChildren() {} }, loading, viewButtons: [] };
  const render = createRenderer({ ui, map: {} });
  render({ view: 'live', selected: null, loading: false, loadError: 'Workspace bootstrap unavailable', bootstrap: null });
  assert.equal(ui.root.dataset.startupState, 'failed');
  assert.equal(attrs.role, 'alert');
  assert.equal(attrs['aria-hidden'], 'false');
  assert.equal(classes.get('is-failed'), true);
  assert.match(loading.innerHTML, /Territory state unavailable/);
  assert.match(loading.innerHTML, /data-action="refresh"/);
});
