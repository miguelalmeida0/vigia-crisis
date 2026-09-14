import test from 'node:test';
import assert from 'node:assert/strict';
import { landCoverConcordance, thresholdStability, counterfactualRobustness, classifyFalseNegative, engineeringEvidenceStatus, scientificClaimLevel } from '../src/validation/prevention-machine-validation.mjs';

test('land-cover agreement remains a declared dependent reference rather than ground truth', () => {
  const value = landCoverConcordance({ state: 'MEASURED_GEOMETRY_BOUND', samplePixels: 100, composition: { tree_cover: .65, shrubland: .2, built_up: .1, permanent_water: .05 } });
  assert.equal(value.concordance, .85);
  assert.equal(value.disagreementRate, .15);
  assert.equal(value.referenceDependency.state, 'DEPENDENT_REFERENCE');
});

test('threshold stability measures survival and geometry without hiding instability', () => {
  const variants = [
    { state: 'MEASURED', candidateSurvived: true, geometryIou: .9, nodeStability: 1, edgeStability: 1, breakpointStability: .9, assetPathStability: 1, rankStability: 1 },
    { state: 'MEASURED', candidateSurvived: true, geometryIou: .7, nodeStability: .8, edgeStability: .8, breakpointStability: .7, assetPathStability: 1, rankStability: .5 },
    { state: 'MEASURED', candidateSurvived: false, geometryIou: 0, nodeStability: 0, edgeStability: 0, breakpointStability: 0, assetPathStability: 0, rankStability: 0 }
  ];
  const value = thresholdStability({ variants });
  assert.equal(value.state, 'MEASURED');
  assert.equal(value.candidateSurvival, .6667);
  assert.equal(value.classification, 'SENSITIVE');
});

test('counterfactual robustness is deterministic, bounded, and refuses invalid trials', () => {
  const input = { finding: { findingId: 'f-1', structuresWithinPolicyRadius: 3 }, graph: { edges: [{ id: 'a', distanceMeters: 10 }, { id: 'b', distanceMeters: 12 }] }, trials: 101, uncertaintyMeters: 10 };
  assert.deepEqual(counterfactualRobustness(input), counterfactualRobustness(input));
  assert.throws(() => counterfactualRobustness({ ...input, trials: 0 }), /trials_invalid/);
  assert.throws(() => counterfactualRobustness({ ...input, uncertaintyMeters: -1 }), /uncertainty_invalid/);
});

test('false-negative recovery distinguishes policy-recoverable heat context from sensing debt', () => {
  assert.equal(classifyFalseNegative({ observations: [{ frp: 20 }], decision: 'SUPPRESS_MAPPED_PERSISTENT_HEAT', maxFrpMw: 20 }).recovery, 'RECOVERABLE_WITH_CURRENT_DATA');
  assert.equal(classifyFalseNegative({ observations: [{ frp: 2 }], flags: ['low_frp'], maxFrpMw: 2 }).recovery, 'REQUIRES_NEW_SENSING');
});

test('engineering evidence and claim levels never substitute for human or retrospective authority', () => {
  const dimensions = {
    sceneQuality: { state: 'PIXEL_VERIFIED' },
    landCoverConcordance: { state: 'MEASURED_REFERENCE_CONCORDANCE', concordance: .9, referenceCoverage: 1, referenceDependency: { state: 'DEPENDENT_REFERENCE' } },
    repeatSceneStability: { state: 'MEASURED', classification: 'ROBUST' },
    thresholdStability: { state: 'MEASURED', classification: 'ROBUST' },
    counterfactualRobustness: { state: 'MEASURED', classification: 'MODERATE' },
    retrospectiveStructuralRelevance: { state: 'EXTERNALLY_BLOCKED' },
    humanFieldValidation: { state: 'UNMEASURED' }, outcomeEvaluation: { state: 'UNMEASURED' }
  };
  assert.equal(engineeringEvidenceStatus(dimensions).status, 'STRONG');
  const claim = scientificClaimLevel(dimensions);
  assert.equal(claim.level, 2);
  assert.equal(claim.noSkippingEnforced, true);
});
