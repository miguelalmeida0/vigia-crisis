import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreventionReview, preventionFindingVersion, preventionValidationMetrics } from '../src/prevention-review.mjs';

const finding = {
  findingId:'finding-1', detectorVersion:'fuel-v1', currentObservationId:'s2-current', comparisonObservationId:'s2-prior',
  geometry:{type:'Polygon',coordinates:[[[-8,37],[-7.99,37],[-7.99,37.01],[-8,37]]]}, affectedAreaHa:1.1, corridorLengthM:220,
  nearestStructureM:18, structuresWithinPolicyRadius:2, sourceQuality:{state:'PIXEL_VERIFIED'}, firstObservableInterval:{start:'2025-08-06T11:30:00Z',end:'2026-08-08T11:31:00Z'}
};
const review = (overrides = {}) => createPreventionReview({
  id:'review-1', findingId:'finding-1', detectorVersion:'fuel-v1', reviewerType:'DEVELOPER_REVIEW',
  modelVersion:'fuel-v1', findingVersion:preventionFindingVersion(finding), scenePair:{currentObservationId:'s2-current',comparisonObservationId:'s2-prior'},
  reviewerId:'operator-1', reviewerQualifications:[], decision:'REJECT_CANDIDATE', reason:'SEASONAL_VEGETATION', sourceQuality:{state:'PIXEL_VERIFIED'}, landCoverContext:{state:'UNMEASURED'}, reviewedAt:'2026-08-12T08:00:00Z', ...overrides
});

test('developer review remains distinct from expert validation', () => {
  const metrics = preventionValidationMetrics([finding], [review()]);
  assert.equal(metrics.developerReviewCount, 1);
  assert.equal(metrics.domainExpertReviewCount, 0);
  assert.equal(metrics.candidatePrecision, null);
  assert.equal(metrics.developerAcceptanceRate, 0);
  assert.equal(metrics.rejectedCount, 1);
  assert.equal(metrics.sourceQualityBreakdown.PIXEL_VERIFIED.rejected, 1);
  assert.equal(metrics.recall, null);
});

test('candidate precision is computed only from domain-expert decisions', () => {
  const metrics = preventionValidationMetrics([finding], [
    review(),
    review({ id:'review-2', reviewerType:'DOMAIN_EXPERT_REVIEW', reviewerQualifications:['wildfire_prevention_domain_expert'], decision:'ACCEPT_CANDIDATE', reason:'TRUE_FUEL_CONTINUITY_CHANGE' })
  ]);
  assert.equal(metrics.candidatePrecision, 1);
  assert.equal(metrics.falseCandidateRate, 0);
  assert.equal(metrics.precisionBasis, 'DOMAIN_EXPERT_REVIEW');
});

test('expert reviewer classes remain separate while sharing the expert precision denominator',()=>{
  const metrics=preventionValidationMetrics([finding],[review({id:'review-remote',reviewerType:'REMOTE_SENSING_EXPERT_REVIEW',reviewerQualifications:['remote_sensing_expert'],decision:'REJECT_CANDIDATE',reason:'REGISTRATION_FAILURE'})]);
  assert.equal(metrics.remoteSensingExpertReviewCount,1);assert.equal(metrics.wildfireExpertReviewCount,0);assert.equal(metrics.forestryExpertReviewCount,0);assert.equal(metrics.domainExpertReviewCount,1);assert.equal(metrics.candidatePrecision,0);assert.equal(metrics.precisionBasis,'QUALIFIED_DOMAIN_EXPERT_REVIEW');
});

test('reviews are excluded when the physical finding version changes', () => {
  const metrics = preventionValidationMetrics([{...finding,affectedAreaHa:2.2}], [review()]);
  assert.equal(metrics.reviewedCount, 0);
  assert.equal(metrics.candidatePrecision, null);
});

test('prevention review rejects unsupported labels', () => {
  assert.throws(() => review({ reviewerType:'EXPERT' }), /invalid_prevention_reviewer_type/);
  assert.throws(() => review({ reason:'LOOKS_FINE' }), /invalid_prevention_review_reason/);
});
