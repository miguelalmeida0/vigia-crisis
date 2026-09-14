import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {phaseBFixture} from './phase-b-fixture.mjs';
import {renderRoute} from '../src/routes/index.js';
import {bindShellState} from '../src/components.js?v=2.1.0';
import {canManageWork,permittedWorkMarkup} from '../src/operatorTaskView.js';
import {parseRouteUrl} from '../src/routeState.js';
const ready=value=>({state:'READY',value});
const previewPrefix=process.env.VIGIA_TEST_RENDER_BUILD==='dist'?'../dist/':'../';
const previewRenderer=(await import(new URL(`${previewPrefix}src/routes/index.js`,import.meta.url))).renderRoute;
const previewBind=(await import(new URL(`${previewPrefix}src/components.js?v=2.1.0`,import.meta.url))).bindShellState;
export function usableFixture(mode='populated'){
 const state=phaseBFixture('ISOLATED TEST — Candidate observation');
 const scoped=state.runtime.canonical.incidents[state.selectedIncidentId];
 state.runtime.session.actor={id:'test:operator',name:'Test operator',role:'supervisor',capabilities:['command:incident'],incidentScopes:[state.selectedIncidentId]};
 const requirements=Array.from({length:4},(_,i)=>({id:`test:request:${i}`,question:i===2?'Independent thermal observation required':'Official incident confirmation required',reason:`Distinct test requirement ${i}`,state:'ESCALATED',currentAssessment:{nextCheckAt:'2026-09-07T13:00:00Z',lastCheckedAt:'2026-09-07T12:00:00Z'},humanAttention:{attentionId:`test:attention:${i}`,owner:i?'Test colleague':'test:operator',state:'ESCALATED'},collectionTasks:[{provider:{label:'Isolated test source'},state:'NO_COVERAGE',lastAttempt:'2026-09-07T12:00:00Z',nextAttempt:'2026-09-07T13:00:00Z'}]}));
 if(mode!=='limited'){
  scoped.operations.value.data.informationCollection=ready({requirements});
  scoped.operations.value.data.responseOperations=ready({items:[]});
  scoped.operations.value.data.protectWorkflows=ready({workflows:[]});
  scoped.operations.value.data.humanAttention=ready({count:4,items:requirements.map(x=>x.humanAttention)});
  scoped.operations.value.data.operationalPeriod=ready({current:null});
  scoped.intelligence.value.data.informationCollection=ready({requirements});
 }
 scoped.detail.value.data.canonicalIncident.value.claim.proposition='A wildfire is present.';
 scoped.detail.value.data.operationalTruth=ready({classification:'DETECTION_CANDIDATE',axes:{verification:{state:'NOT_VERIFIED'},freshness:{state:'CURRENT'}},lastObservedAt:'2026-08-25T11:56:00Z'});
 state.runtime.canonical.globals.reports.value.data.outcomeMeasurementPlan=ready({coverage:{currentActions:0,outcomeMeasurable:0},lastEvaluatedAt:'2026-09-07T12:00:00Z'});
 if(mode==='readonly')state.runtime.session.mutationReady=false;
 return state;
}
let checks=0;const check=(fn)=>{fn();checks++};
for(const mode of ['populated','limited','readonly']){
 const state=usableFixture(mode);bindShellState(state);const html=renderRoute('operations',state);
 check(()=>assert.match(html,mode==='limited'?/Tasks could not be loaded/:/Confirm the incident with an official source/));
 if(mode==='limited')check(()=>assert.doesNotMatch(html,/>Not started<|>0 items</));
 if(mode==='readonly')check(()=>assert.doesNotMatch(html,/data-action="human-attention-(assume|reassign|escalate|release)/));
 if(mode==='populated')check(()=>assert.doesNotMatch(html,/human-attention-assume:test/));
 const intel=renderRoute('intelligence',state);
 if(mode!=='limited')for(let i=0;i<4;i++){check(()=>assert.ok(intel.includes(`data-id="test:request:${i}"`),'Every distinct question remains selectable'));state.approvedQuestionId=`test:request:${i}`;check(()=>assert.ok(renderRoute('intelligence',state).includes(`open-collection-plan:test:request:${i}`),'Selecting each question exposes its exact persisted collection plan'));}
 const detail=renderRoute('incident-detail',state),primary=detail.split('<summary>Recorded claim and source interpretation')[0];
 check(()=>assert.match(primary,/A wildfire is not yet verified/));
 check(()=>assert.doesNotMatch(primary,/A wildfire is present\./));
 state.reportsTab='outcomes';const outcome=renderRoute('reports-analytics',state);
 check(()=>assert.match(outcome,/No qualifying live outcomes measured/));
 check(()=>assert.doesNotMatch(outcome,/class="outcome-funnel"/));
 if(process.env.VIGIA_TEST_RENDER_DIR){
  const path=process.env.VIGIA_TEST_RENDER_DIR;await mkdir(path,{recursive:true});
  const css=(await Promise.all(['tokens','base','components','routes','responsive'].map(name=>readFile(new URL(`${previewPrefix}styles/${name}.css`,import.meta.url),'utf8')))).join('\n');
  for(const route of ['operations','intelligence','reports-analytics']){
   state.reportsTab='summary';previewBind(state);
   await writeFile(`${path}/${route}-${mode}.html`,`<!doctype html><html lang="en"><meta charset="utf-8"><title>ISOLATED TEST VIEW — ${route}</title><style>${css}\n.test-banner{position:fixed;bottom:0;left:0;right:0;z-index:9999;padding:8px;background:#fff0cc;color:#182342;font:14px sans-serif;text-align:center}</style><body><div id="app">${previewRenderer(route,state)}</div><div class="test-banner">ISOLATED TEST VIEW — ${mode} — not live incident data</div></body></html>`);
  }
 }
}
check(()=>assert.equal(canManageWork({authenticated:true,mutationReady:true,actor:{role:'supervisor',capabilities:['command:incident'],incidentScopes:['other']}},'selected'),false));
check(()=>assert.equal(parseRouteUrl('http://localhost/#/national-awareness?region=Porto').route,'global-awareness'));
for(const action of ['planning-proposal-review','planning-approved-apply'])check(()=>assert.equal(permittedWorkMarkup(`<button data-action="${action}:test">Change</button>`,false),''));
{
 const state=usableFixture();bindShellState(state);
 state.runtime.canonical.incidents[state.selectedIncidentId].detail.value.data.operationalTruth.value.classification=null;
 const primary=renderRoute('incident-detail',state).split('<summary>Recorded claim and source interpretation')[0];
 check(()=>assert.match(primary,/classification was not returned/));
 check(()=>assert.doesNotMatch(primary,/A candidate observation is recorded/));
 state.runtime.canonical.globals.reports.value.data.crisisAutopilot=ready({strategicIntelligence:{nearMissIntelligence:{},resilienceCampaigns:{}}});
 check(()=>assert.doesNotMatch(renderRoute('reports-analytics',state),/(?:Near misses<\/dt><dd>0|0 near misses)/i,'Approved reports must not turn missing near-miss measurements into zero'));
}
bindShellState(null);console.log(`Usable-product contract passed: ${checks} state, ownership, distinct-request, candidate-truth, outcome and alias assertions.`);
