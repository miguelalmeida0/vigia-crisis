import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildConsensusCounterfactual,
  buildConsensusInterventionZone,
  calibrateConsensusPromotionPolicy,
  evaluateFrozenConsensus,
  finalizeConsensusClaims
} from '../src/validation/consensus-intervention-zone.mjs';
import { finalizeConsensusAssessments } from '../src/validation/consensus-intervention-assessment.mjs';

const origin = [-8, 39];
const lonMeters = (meters) => origin[0] + meters / (111_320 * Math.cos(origin[1] * Math.PI / 180));
const latMeters = (meters) => origin[1] + meters / 110_540;
const member = (id, xMeters, axis = 'PARAMETER') => {
  const geometry = { type: 'LineString', coordinates: [[lonMeters(xMeters), origin[1]], [lonMeters(xMeters), latMeters(50)]] };
  return {
    id,
    evidenceAxis: axis,
    state: 'MEASURED',
    candidateSurvived: true,
    geometryIou: .8,
    assetPathStability: 1,
    rankStability: .9,
    sourceQuality: { state: 'PIXEL_VERIFIED', validPixelFraction: .95 },
    graph: { version: `graph-${id}`, edges: [{ id: `edge-${id}`, distanceMeters: 50, geometry }] },
    intervention: { geometry, connectedFuelAreaHa: { before: 10, after: 6 }, assetConnectedPaths: { before: 4, after: 2 }, modeledConnectivityReduction: .5, reviewPriorityScore: 70, claimBoundary: 'not risk reduction' }
  };
};
const finding = (repeatX = 15) => ({
  findingId: 'finding-1',
  coordinate: origin,
  parameterVariants: [member('BASELINE', 0), member('P1', 5), member('P2', 10)],
  repeatSceneVariants: [member('S1', repeatX, 'SCENE')],
  dimensions: { landCoverConcordance: { state: 'MEASURED_REFERENCE_CONCORDANCE', concordance: .9, disagreementRate: .02, managedTransitionRisk: 0, referenceDependency: { state: 'DEPENDENT_REFERENCE' } } }
});

test('promotion calibration ignores final repeat-scene realizations and freezes an evidence hash', () => {
  const a = calibrateConsensusPromotionPolicy({ findings: [finding(15)], frozenAt: '2026-08-14T00:00:00.000Z' });
  const b = calibrateConsensusPromotionPolicy({ findings: [finding(500)], frozenAt: '2026-08-14T00:00:00.000Z' });
  assert.deepEqual(a, b);
  assert.match(a.policyHash, /^sha256:/);
  assert.equal(a.calibrationSplit, 'DEVELOPMENT_REVIEW_PARAMETER_REALIZATIONS_ONLY');
  assert.equal(a.thresholds.minimumHeldoutZoneOverlap, .25);
});

test('consensus emits spatial support and distributions, never an exact intervention point', () => {
  const policy = calibrateConsensusPromotionPolicy({ findings: [finding()], frozenAt: '2026-08-14T00:00:00.000Z' });
  const zone = buildConsensusInterventionZone({ finding: finding(), policy });
  assert.equal(zone.geometry.type, 'MultiPolygon');
  assert.equal(zone.exact_breakpoint_emitted, false);
  assert.equal('candidateBreakLocation' in zone, false);
  assert.equal(zone.parameter_support.fraction, 1);
  assert.equal(zone.counterfactual.modeled_connectivity_change.median, .5);
  assert.equal(zone.claim_state, 'MIXED_ZONE');
});

test('frozen scene evaluation compares exact baseline with the development-only zone', () => {
  const input = finding();
  const policy = calibrateConsensusPromotionPolicy({ findings: [input], frozenAt: '2026-08-14T00:00:00.000Z' });
  const evaluation = evaluateFrozenConsensus({ findings: [input], policy, negativeControls: { falseCandidateRate: null } });
  assert.equal(evaluation.aggregate.baseline.spatial_retention, 0);
  assert.equal(evaluation.aggregate.consensus.spatial_retention, 1);
  assert.equal(evaluation.aggregate.false_robust_zone_rate, null);
  assert.equal(evaluation.aggregate.material_stability_improvement, true);
  const [zone] = finalizeConsensusClaims({ findings: [input], policy, frozenEvaluation: evaluation, negativeControls: { falseCandidateRate: null } });
  assert.notEqual(zone.claim_state, 'ROBUST_ZONE');
  assert.equal(zone.failure_type, 'ROBUST_PHYSICAL_CHANGE / UNSTABLE_INTERVENTION');
});

test('counterfactual uses ensemble intervals and never labels the quantity as risk', () => {
  const value = buildConsensusCounterfactual(finding().parameterVariants);
  assert.equal(value.member_count, 3);
  assert.deepEqual(value.connected_fuel_area_after_ha.interval, { p05: 6, p95: 6 });
  assert.match(value.qualification, /not wildfire risk/);
});

test('non-promoted consensus becomes measurement-required and cannot expose intervention geometry', () => {
  const input = finding(500);
  const policy = calibrateConsensusPromotionPolicy({ findings: [input], frozenAt: '2026-08-14T00:00:00.000Z' });
  const evaluation = evaluateFrozenConsensus({ findings: [input], policy, negativeControls: { falseCandidateRate: null } });
  const [assessment] = finalizeConsensusAssessments({ findings: [input], policy, frozenEvaluation: evaluation, negativeControls: { falseCandidateRate: null } });
  assert.equal(assessment.schema, 'vigia.consensus-intervention-assessment.v1');
  assert.equal(assessment.claim_state, 'UNSTABLE_INTERVENTION_GEOMETRY');
  assert.equal(assessment.workflow.disposition, 'MEASUREMENT_REQUIRED');
  assert.equal(assessment.workflow.interventionReviewEligible, false);
  assert.equal(assessment.geometry, null);
  assert.equal(assessment.intervention_geometry, null);
  assert.equal(assessment.measurement_support_geometry.type, 'MultiPolygon');
  assert.equal(assessment.evidence_debt.measurement_plan_id, assessment.measurement_plan.id);
  assert.equal(assessment.measurement_plan.frozen_policy_hash, policy.policyHash);
  assert.equal(assessment.ensemble_provenance.member_ids.length, 4);
  assert.equal(assessment.claim_level.level, 2);
});
