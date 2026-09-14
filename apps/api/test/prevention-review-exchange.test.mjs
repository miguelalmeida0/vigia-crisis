import test from 'node:test';
import assert from 'node:assert/strict';
import { PreventionReviewExchange } from '../src/modules/prevention/prevention-review-exchange.mjs';

test('blinded expert review exchange resolves case IDs only against the current immutable finding version',async()=>{
  const pack={schema:'vigia.prevention.blinded-expert-review-pack.v1',evidenceHash:'sha256:pack',inventory:{cases:1},cases:[{caseId:'PREVENT-1'}]},key={schema:'vigia.prevention.blinded-expert-review-key.v1',packEvidenceHash:'sha256:pack',cases:[{caseId:'PREVENT-1',findingId:'finding-1',findingVersion:'finding-v2:1',detectorVersion:'fuel-v1'}]};
  const exchange=new PreventionReviewExchange();exchange.pack=pack;exchange.keys=new Map(key.cases.map((item)=>[item.caseId,item]));
  const payload={schema:'vigia.prevention.completed-expert-reviews.v1',reviewerType:'REMOTE_SENSING_EXPERT_REVIEW',reviews:[{caseId:'PREVENT-1',decision:'ABSTAIN',reason:'INSUFFICIENT_RESOLUTION',note:'Native pixels do not resolve the alternative.'}]};
  const rows=exchange.resolve(payload,[{findingId:'finding-1',findingVersion:'finding-v2:1',detectorVersion:'fuel-v1'}]);
  assert.equal(rows[0].findingId,'finding-1');assert.equal(rows[0].reviewerType,'REMOTE_SENSING_EXPERT_REVIEW');
  assert.throws(()=>exchange.resolve(payload,[{findingId:'finding-1',findingVersion:'finding-v2:new',detectorVersion:'fuel-v1'}]),/stale_prevention_review_case/);
});
