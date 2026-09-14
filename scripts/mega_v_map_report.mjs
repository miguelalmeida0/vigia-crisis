import {readFile,writeFile} from 'node:fs/promises';
const root='/Users/malmeida/.codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259/acceleration/';
const targets={cold:2500,'detail-to-fire':1000,'fire-to-response':1000,'cached-revisit':400,'incident-switch':1500,overview:2500,national:2500};
const percentile=(xs,p)=>xs.length?[...xs].sort((a,b)=>a-b)[Math.max(0,Math.ceil(xs.length*p)-1)]:null;
const describe=xs=>({p50:percentile(xs,.5),p95:percentile(xs,.95),max:xs.length?Math.max(...xs):null});
const report={capturedAt:new Date().toISOString(),lanes:{},method:'20 independent browser contexts per lane; eight sequential routes in each context. Chromium 139 / Playwright 1.54; 1728x966; browser HTTP cache enabled through transparent local proxy. Cold uses first tile-backed render. Transitions conservatively require a post-navigation render with the imagery source loaded. No per-navigation SQL tracing; external tile and label work remains part of measured latency. Network totals attribute responses that finish during each case; a request can start in the preceding case. Repeat URL counts do not establish erroneous duplication.'};
for(const lane of ['before','after','pre-resolver','final']){
 const raw=JSON.parse(await readFile(root+'mega-v-'+lane+'-map.json','utf8')),rows={};
 for(const name of [...new Set(raw.results.map(r=>r.case))]){
  const all=raw.results.filter(r=>r.case===name),success=all.filter(r=>Number.isFinite(r.firstUsefulFrameMs)),failures=all.length-success.length;
  rows[name]={samples:all.length,successfulUsefulFrames:success.length,timeouts:failures,targetMs:targets[name]??null,usefulMs:describe(success.map(r=>r.firstUsefulFrameMs)),interactiveMs:describe(all.map(r=>r.interactiveMs).filter(Number.isFinite)),requests:describe(all.map(r=>r.requests)),bytes:describe(all.map(r=>r.bytes)),tiles:describe(all.map(r=>r.tiles)),apiCalls:describe(all.map(r=>r.apiCalls)),repeatedUrls:describe(all.map(r=>r.network.length-new Set(r.network.map(n=>n.url)).size)),gate:targets[name]?(all.length>=20&&failures===0&&percentile(success.map(r=>r.firstUsefulFrameMs),.95)<=targets[name]?'PASS':'FAIL'):'NOT_SPECIFIED'};
 }
 if(lane==='final')for(const row of Object.values(rows))if(row.samples<20){row.usefulMs.p95=null;row.interactiveMs.p95=null;row.gate='INCOMPLETE_CONTENDED_RUN';}
 report.lanes[lane]={source:root+'mega-v-'+lane+'-map.json',cases:rows,pageErrors:raw.errors,instances:[...new Set(raw.results.map(r=>r.instanceId))],maxStyleReloads:Math.max(...raw.results.map(r=>Number(r.mapState?.mapStyleReloadCount??0))),maxSourceUpdates:Math.max(...raw.results.map(r=>Number(r.mapState?.mapSourceUpdateCount??0)))};
}
await writeFile('docs/handoffs/mega-v/map-results.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(Object.fromEntries(Object.entries(report.lanes.final.cases).map(([k,v])=>[k,{p95:v.usefulMs.p95,timeouts:v.timeouts,gate:v.gate}]))));
