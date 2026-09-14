import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFuelConnectivityGraph } from '../src/fuel-connectivity-graph.mjs';
import { measurePreventionEnsembleMember, preventionGeometryIou, preventionPointDistanceMeters } from '../src/validation/prevention-ensemble-member.mjs';

const square = (x = -8, y = 39, size = .001) => ({ type: 'Polygon', coordinates: [[[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]] });
const finding = {
  findingId: 'finding-1',
  geometry: square(),
  affectedAreaHa: 1.2,
  corridorLengthM: 90,
  nearestStructureM: 40,
  structuresWithinPolicyRadius: 3,
  detectorVersion: 'detector-v1',
  currentObservationId: 'current-1',
  comparisonObservationId: 'comparison-1',
  sourceQuality: { state: 'PIXEL_VERIFIED', validPixelFraction: .95 }
};

test('ensemble member persists physical geometry, graph topology and bounded counterfactual quantities', () => {
  const baseGraph = buildFuelConnectivityGraph(finding);
  const value = measurePreventionEnsembleMember({
    finding,
    baseGraph,
    baseRank: 1,
    groupSize: 1,
    variantId: 'BASELINE',
    evidenceAxis: 'PARAMETER',
    parameters: { ndviMin: .28 },
    result: {
      state: 'screened',
      validFraction: .91,
      validationComponents: [{ geometry: square(), areaM2: 12_000, corridorLengthM: 90, passesNewFuelGate: true, reachesBoundary: true }]
    }
  });
  assert.equal(value.state, 'MEASURED');
  assert.equal(value.candidateSurvived, true);
  assert.equal(value.evidenceAxis, 'PARAMETER');
  assert.equal(value.geometryIou, 1);
  assert.ok(value.graph.nodes.length > 0);
  assert.ok(value.graph.edges.length > 0);
  assert.equal(value.intervention.claimBoundary.includes('not fire-risk reduction'), true);
  assert.equal(value.sourceQuality.validPixelFraction, .91);
});

test('ensemble member preserves abstention instead of fabricating geometry', () => {
  const value = measurePreventionEnsembleMember({ finding, baseGraph: buildFuelConnectivityGraph(finding), baseRank: 1, groupSize: 1, variantId: 'SCENE-1', evidenceAxis: 'SCENE', result: { state: 'abstained', reason: 'cloud' } });
  assert.equal(value.state, 'UNMEASURED');
  assert.equal(value.candidateSurvived, false);
  assert.equal(value.reason, 'cloud');
  assert.equal('candidateGeometry' in value, false);
});

test('spatial helpers are deterministic and reject absent geometry honestly', () => {
  assert.equal(preventionGeometryIou(square(), square()), 1);
  assert.equal(preventionGeometryIou(square(), null), 0);
  assert.equal(preventionPointDistanceMeters([-8, 39], [-8, 39]), 0);
  assert.equal(preventionPointDistanceMeters(null, [-8, 39]), Infinity);
});
