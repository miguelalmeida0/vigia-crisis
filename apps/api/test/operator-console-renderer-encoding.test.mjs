import assert from 'node:assert/strict';
import test from 'node:test';
import { renderRoute } from '../../operator-console/src/routes/index.js';
import { intelligenceDecisionSystem } from '../../operator-console/src/crisisOperatingSystem.js';
import { phaseBFixture } from '../../operator-console/tests/phase-b-fixture.mjs';

const routes=['command-overview','incidents','incident-detail','intelligence','operations','reports-analytics','global-awareness'];
const payloads=['<img src=x onerror="globalThis.__vigiaXss=1">','<script>globalThis.__vigiaXss=2</script>','"><svg onload=globalThis.__vigiaXss=3>','<div><math><mtext></div><img src=x onerror=globalThis.__vigiaXss=4>'];

test('every canonical operator route keeps adversarial backend text inert',()=>{
  for(const hostile of payloads)for(const route of routes){
    const html=renderRoute(route,phaseBFixture(hostile));
    assert.equal(html.includes(hostile),false,`${route} retained hostile markup`);
    assert.doesNotMatch(html,/<script[^>]*>[^<]*globalThis\.__vigiaXss|<(?:img|svg)[^>]+on(?:error|load)\s*=\s*[^>]*globalThis\.__vigiaXss/i,`${route} exposed executable hostile text`);
  }
});

test('decision council renders the bounded review tuple instead of generic advisory fields',()=>{
  const review=(content,reviewerRole='RED_TEAM')=>({state:'COMPLETE',content,reviewerRole,reviewedAt:'2026-09-04T11:58:00Z'});
  const html=intelligenceDecisionSystem({decisionCouncil:{items:[{
    decisionId:'decision:protect',proposal:{state:'PRESENT',content:'Prepare warning draft'},
    counterargument:review('Preparation may outrun verified targeting.'),evidenceReview:review('Evidence remains incomplete.','INTELLIGENCE_OFFICER'),
    authorityReview:review('Sending remains authority-bound.','PROTECTION_OFFICER'),safetyReview:review('Do not send without authority.','SAFETY_OFFICER'),
    consequenceOfDelay:review('Delay reduces preparation time.','PLANNING_OFFICER'),alternatives:review(['Continue monitoring','Collect targeting evidence'],'OPERATIONS_OFFICER'),
    validityReview:{state:'VALID',content:'Valid until 12:30 UTC.'},missingReviews:['SAFETY_REVIEW'],finalRecommendation:null,finalRecommendationState:'WITHHELD_INCOMPLETE_COUNCIL_TUPLE',
  }]}});
  for(const expected of ['Adversarial decision council','Final recommendation withheld','Inspect council tuple','Proposal','Counterargument','Evidence review','Authority review','Safety review','Consequence of delay','Alternatives','Preparation may outrun verified targeting.','Sending remains authority-bound.','Missing: Safety review'])assert.match(html,new RegExp(expected));
  assert.doesNotMatch(html,/Advisory role|Role abstained/);
});
