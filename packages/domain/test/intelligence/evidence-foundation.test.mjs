import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEvidenceContract, createEvidenceGraph, evaluateEvidenceContract
} from '../../src/intelligence/index.mjs';
import { wildfireComponents, wildfireScenario } from '../fixtures/intelligence/wildfire-scenarios.mjs';

const evaluate = (name, previousEvaluation = null) => {
  const scenario = wildfireScenario(name);
  return evaluateEvidenceContract({ claim: scenario.claim, contract: scenario.contract, evidenceGraph: scenario.evidenceGraph, evaluationTime: scenario.evaluationTime, previousEvaluation });
};

function graphWith(components, { observations = components.observations, evidence = [] } = {}) {
  return createEvidenceGraph({ sourceFamilies: components.sourceFamilies, sources: components.sources, observations, evidence });
}

test('weak report remains explicit report-only evidence with contract-derived debt', () => {
  const result = evaluate('weakReport');
  assert.equal(result.state, 'REPORT_ONLY'); assert.equal(result.satisfied, false);
  assert.deepEqual(result.independentFamilies.map((item) => item.sourceFamilyId), ['public-report']);
  assert.ok(result.evidenceDebt.needs.some((item) => item.missingQuantity === 'wildfire.independent-physical-corroboration'));
  assert.ok(result.evidenceDebt.needs.every((item) => item.contract.version === '1'));
  assert.equal(result.evidenceDebt.items.length, result.evidenceDebt.needs.length);
  assert.ok(result.evidenceDebt.needs.every((item) => result.evidenceDebt.items.some((debt) => debt.id === item.evidenceDebtItemId)));
});

test('single physical family cannot silently become corroboration', () => {
  const result = evaluate('singlePhysical');
  assert.equal(result.state, 'SINGLE_FAMILY_PHYSICAL'); assert.equal(result.satisfied, false);
  assert.equal(result.independentFamilies.filter((item) => item.familyClass === 'PHYSICAL').length, 1);
});

test('three downstream representations of one VIIRS measurement remain one causal witness', () => {
  const result = evaluate('duplicateTrap');
  assert.equal(result.state, 'SINGLE_FAMILY_PHYSICAL');
  assert.equal(result.independentFamilies.filter((item) => item.familyClass === 'PHYSICAL').length, 1);
  assert.equal(result.qualifyingEvidence.filter((item) => item.sourceFamilyId === 'viirs').length, 1);
  assert.equal(result.excludedEvidence.filter((item) => item.classification === 'CAUSAL_DUPLICATE').length, 2);
});

test('genuinely independent physical families qualify separately', () => {
  const result = evaluate('genuineCorroboration');
  assert.equal(result.state, 'MULTI_FAMILY_PHYSICAL_SUPPORT'); assert.equal(result.satisfied, false);
  assert.deepEqual(result.independentFamilies.filter((item) => item.familyClass === 'PHYSICAL').map((item) => item.sourceFamilyId), ['geostationary-thermal', 'viirs']);
  assert.deepEqual(result.unmetRequirements.map((item) => item.id), ['wildfire.official-corroboration']);
});

test('physical and official causal quorum satisfies the versioned contract', () => {
  const result = evaluate('officialCorroboration');
  assert.equal(result.state, 'CORROBORATED'); assert.equal(result.satisfied, true);
  assert.equal(result.evidenceDebt.state, 'RESOLVED'); assert.equal(result.evidenceDebt.count, 0);
});

test('strong conflicting evidence remains a blocking first-class contradiction', () => {
  const result = evaluate('contradiction');
  assert.equal(result.state, 'CONTRADICTED'); assert.equal(result.satisfied, false);
  assert.equal(result.contradictions.length, 1); assert.equal(result.contradictions[0].blocking, true);
  assert.equal(result.contradictions[0].unresolved, true);
  assert.ok(result.evidenceDebt.needs.some((item) => item.missingQuantity.startsWith('contradiction.')));
});

test('explicitly permitted contradictions stay visible without silently blocking doctrine', () => {
  const scenario = wildfireScenario('contradiction');
  const contract = createEvidenceContract({
    ...scenario.contract, version: '1-permitted-ground-optical',
    contradictions: { ...scenario.contract.contradictions, permittedSourceFamilyIds: ['ground-optical'] }
  });
  const claim = { ...scenario.claim, contract: { id: contract.id, version: contract.version } };
  const result = evaluateEvidenceContract({ claim, contract, evidenceGraph: scenario.evidenceGraph, evaluationTime: scenario.evaluationTime });
  assert.equal(result.state, 'CORROBORATED'); assert.equal(result.satisfied, true);
  assert.equal(result.contradictions[0].blocking, false); assert.equal(result.contradictions[0].unresolved, true);
});

test('NOT_OBSERVED is not converted into negative evidence', () => {
  const result = evaluate('noObservationOpportunity');
  assert.equal(result.state, 'SINGLE_FAMILY_PHYSICAL'); assert.equal(result.contradictions.length, 0);
  assert.equal(result.excludedEvidence.find((item) => item.evidenceId === 'ev:no-opportunity').classification, 'NO_OBSERVATION_OPPORTUNITY');
});

test('stale, temporally incompatible, and spatially incompatible evidence fail closed for distinct reasons', () => {
  const components = wildfireComponents(), viirs = components.evidenceByKey.viirs;
  const replace = (patch) => components.observations.map((item) => item.id === 'obs:viirs-root' ? { ...item, ...patch } : item);
  const claimWide = { ...components.claim, validTime: { from: '2026-08-24T09:00:00.000Z', to: components.claim.validTime.to } };
  const staleGraph = graphWith(components, { observations: replace({ observedAt: '2026-08-24T10:30:00.000Z' }), evidence: [viirs] });
  const stale = evaluateEvidenceContract({ claim: claimWide, contract: components.contract, evidenceGraph: staleGraph, evaluationTime: '2026-08-24T12:30:00Z' });
  assert.equal(stale.excludedEvidence[0].classification, 'STALE'); assert.equal(stale.state, 'STALE');
  const temporalGraph = graphWith(components, { observations: replace({ observedAt: '2026-08-24T09:00:00.000Z' }), evidence: [viirs] });
  const temporal = evaluateEvidenceContract({ claim: components.claim, contract: components.contract, evidenceGraph: temporalGraph, evaluationTime: '2026-08-24T12:30:00Z' });
  assert.equal(temporal.excludedEvidence[0].classification, 'TEMPORALLY_INCOMPATIBLE');
  const farLocation = { ...components.observations.find((item) => item.id === 'obs:viirs-root').location, geometry: { type: 'Point', coordinates: [-8.2, 40] } };
  const spatialGraph = graphWith(components, { observations: replace({ location: farLocation }), evidence: [viirs] });
  const spatial = evaluateEvidenceContract({ claim: components.claim, contract: components.contract, evidenceGraph: spatialGraph, evaluationTime: '2026-08-24T12:30:00Z' });
  assert.equal(spatial.excludedEvidence[0].classification, 'SPATIALLY_INCOMPATIBLE');
});

test('weak provenance and compromised sources cannot satisfy a contract', () => {
  const components = wildfireComponents();
  const weakGraph = graphWith(components, { evidence: [{ ...components.evidenceByKey.viirs, provenanceStrength: 'ASSERTED' }] });
  const weak = evaluateEvidenceContract({ claim: components.claim, contract: components.contract, evidenceGraph: weakGraph, evaluationTime: '2026-08-24T12:30:00Z' });
  assert.equal(weak.excludedEvidence[0].classification, 'INSUFFICIENT_PROVENANCE');
  const compromisedGraph = graphWith(components, { evidence: [components.evidenceByKey.compromised] });
  const compromised = evaluateEvidenceContract({ claim: components.claim, contract: components.contract, evidenceGraph: compromisedGraph, evaluationTime: '2026-08-24T12:30:00Z' });
  assert.equal(compromised.excludedEvidence[0].classification, 'SOURCE_EXCLUDED');
});

test('state transitions explain exactly what changed', () => {
  const before = evaluate('singlePhysical');
  const after = evaluate('genuineCorroboration', before);
  assert.equal(after.transitionExplanation.from, 'SINGLE_FAMILY_PHYSICAL');
  assert.equal(after.transitionExplanation.to, 'MULTI_FAMILY_PHYSICAL_SUPPORT');
  assert.deepEqual(after.transitionExplanation.addedQualifyingEvidence, ['ev:geo']);
});
