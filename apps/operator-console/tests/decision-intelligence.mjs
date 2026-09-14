import test from 'node:test';
import assert from 'node:assert/strict';
import { approvedController } from '../src/approved/controller.js';
import { decisionIntelligenceMarkup,intelligenceAnswerMarkup } from '../src/approved/ui/decision-intelligence.js';
import { compactDecisionIntelligence } from '../../api/src/modules/operator/decision-intelligence-projection.mjs';
import { projectDecisionSuperiority } from '../../../packages/domain/src/operational-twin/decision-superiority.mjs';
import { projectOperationalTwin } from '../../../packages/domain/src/operational-twin/project-operational-twin.mjs';
import { recorded,registry,actor,at } from '../../../packages/domain/test/intelligence/operational-intelligence-fixture.mjs';

test('decision disclosure uses native accessible controls, real gap text, and escaped answers',()=>{
  const twin=projectOperationalTwin({events:[recorded('thermal',0)],sourceRegistry:registry(),asOf:at(5)});
  const html=decisionIntelligenceMarkup(compactDecisionIntelligence(projectDecisionSuperiority({twin,actor})));
  assert.match(html,/<details><summary>/);assert.match(html,/name="intelligence-question" maxlength="240"/);
  assert.match(html,/aria-live="polite"/);assert.match(html,/independent current physical corroboration/i);
  assert.match(html,/data-query-incident="incident:test-fire"/);assert.doesNotMatch(html,/<canvas|maplibre|<style/);
  const answer=intelligenceAnswerMarkup({answer:'<img onerror=evil>',results:[],reasons:[],evidenceIds:[],asOf:at(5)});
  assert.match(answer,/&lt;img/);assert.doesNotMatch(answer,/<img/);
});

test('Ask uses authenticated GET and updates only the answer; later query wins without a map or app render',async()=>{
  const saved={document:globalThis.document,fetch:globalThis.fetch},pending=[];
  const answer={isConnected:true,textContent:'',innerHTML:''},input={value:'What is blocking verification?'},root={dataset:{queryIncident:'incident:test-fire'},querySelector:s=>s.includes('answer')?answer:s.includes('question')?input:{value:''}};
  globalThis.document={querySelector:()=>root};
  globalThis.fetch=(url,options)=>new Promise(resolve=>pending.push({url,options,resolve}));
  try{
    const state={selectedIncidentId:'incident:test-fire'},controller=approvedController({state,render:()=>assert.fail('No rerender'),commit:()=>assert.fail('No app mutation')});
    const first={dataset:{action:'intelligence-ask'}},second={dataset:{action:'intelligence-history'}};
    const a=controller.action(first),b=controller.action(second);
    assert.equal(pending[0].options.method,'GET');assert.equal(pending[0].options.credentials,'same-origin');assert.match(pending[0].url,/intelligence-query/);
    const respond=(request,text)=>request.resolve(new Response(JSON.stringify({answer:text,results:[],reasons:[],evidenceIds:[],asOf:at(5)}),{headers:{'content-type':'application/json'}}));
    respond(pending[1],'Newer response');await b;respond(pending[0],'Older response');await a;
    assert.match(answer.innerHTML,/Newer response/);assert.doesNotMatch(answer.innerHTML,/Older response/);
    assert.equal(root.querySelector('[name="intelligence-question"]'),input);assert.equal(input.value,'What is blocking verification?');assert.equal(first.disabled,false);
  }finally{globalThis.document=saved.document;globalThis.fetch=saved.fetch;}
});

test('query failures stay explicit and responses from a previous incident cannot replace current context',async()=>{
  const saved={document:globalThis.document,fetch:globalThis.fetch};
  const answer={isConnected:true,textContent:'',innerHTML:''},root={querySelector:s=>s.includes('answer')?answer:{value:''}},state={selectedIncidentId:'incident:test-fire'};
  globalThis.document={querySelector:()=>root};
  try{
    globalThis.fetch=async()=>new Response(JSON.stringify({error:'source_unavailable'}),{status:503,headers:{'content-type':'application/json'}});
    const controller=approvedController({state});await controller.action({dataset:{action:'intelligence-ask'}});
    assert.match(answer.textContent,/No substitute answer/);assert.equal(answer.innerHTML,'');
    let resolve;globalThis.fetch=()=>new Promise(r=>{resolve=r;});
    const pending=controller.action({dataset:{action:'intelligence-ask'}});state.selectedIncidentId='incident:other';
    resolve(new Response(JSON.stringify({answer:'Old incident',results:[],reasons:[],evidenceIds:[],asOf:at(5)}),{headers:{'content-type':'application/json'}}));await pending;assert.equal(answer.innerHTML,'');
  }finally{globalThis.document=saved.document;globalThis.fetch=saved.fetch;}
});
