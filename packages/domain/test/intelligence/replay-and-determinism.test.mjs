import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEvidenceContract, createEvidenceGraph, createEvidenceReplay, createWildfireDetectionContract,
  evaluateEvidenceContract, resolveEvidenceContract, verifyEvidenceReplay
} from '../../src/intelligence/index.mjs';
import { wildfireScenario } from '../fixtures/intelligence/wildfire-scenarios.mjs';

test('ordering is non-semantic and repeated evaluation is byte-equivalent', () => {
  const scenario = wildfireScenario('officialCorroboration');
  const reversed = createEvidenceGraph({
    sourceFamilies: [...scenario.sourceFamilies].reverse(), sources: [...scenario.sources].reverse(),
    observations: [...scenario.observations].reverse(), evidence: [...scenario.evidenceGraph.evidence].reverse()
  });
  const first = evaluateEvidenceContract({ claim: scenario.claim, contract: scenario.contract, evidenceGraph: scenario.evidenceGraph, evaluationTime: scenario.evaluationTime });
  const second = evaluateEvidenceContract({ claim: scenario.claim, contract: scenario.contract, evidenceGraph: reversed, evaluationTime: scenario.evaluationTime });
  assert.deepEqual(second, first);
  assert.equal(JSON.stringify(second), JSON.stringify(first));
});

test('replay record is serializable, hash-bound, and independently verifiable', () => {
  const scenario = wildfireScenario('officialCorroboration');
  const record = createEvidenceReplay(scenario);
  const restored = JSON.parse(JSON.stringify(record));
  const verification = verifyEvidenceReplay(restored);
  assert.equal(verification.verified, true); assert.equal(verification.result.state, 'CORROBORATED');
  restored.input.evidenceGraph.evidence[0].provenanceStrength = 'UNKNOWN';
  const tampered = verifyEvidenceReplay(restored);
  assert.equal(tampered.verified, false); assert.equal(tampered.inputHashMatches, false);
});

test('contract versions are resolved exactly and replay their original doctrine', () => {
  const scenario = wildfireScenario('officialCorroboration');
  const v2 = createWildfireDetectionContract({ version: '2', requiredPhysicalFamilies: 3 });
  assert.equal(resolveEvidenceContract([scenario.contract, v2], { id: 'wildfire-detection', version: '1' }).fingerprint, scenario.contract.fingerprint);
  assert.equal(resolveEvidenceContract([scenario.contract, v2], { id: 'wildfire-detection', version: '2' }).fingerprint, v2.fingerprint);
  assert.throws(() => resolveEvidenceContract([scenario.contract, v2], { id: 'wildfire-detection', version: '3' }), /version_not_found/);
  const claimV2 = { ...scenario.claim, contract: { id: v2.id, version: v2.version } };
  const v1Replay = createEvidenceReplay(scenario);
  const v2Replay = createEvidenceReplay({ ...scenario, claim: claimV2, contract: v2 });
  assert.equal(v1Replay.result.state, 'CORROBORATED'); assert.equal(v2Replay.result.state, 'MULTI_FAMILY_PHYSICAL_SUPPORT');
  assert.equal(verifyEvidenceReplay(v1Replay).verified, true); assert.equal(verifyEvidenceReplay(v2Replay).verified, true);
});

test('one contract identity and version cannot resolve to conflicting doctrine', () => {
  const scenario = wildfireScenario('officialCorroboration');
  const conflict = createEvidenceContract({ ...scenario.contract, doctrine: 'Conflicting doctrine under a reused version.' });
  assert.throws(() => resolveEvidenceContract([scenario.contract, conflict], { id: scenario.contract.id, version: scenario.contract.version }), /version_conflict/);
});

test('mutated contract content cannot evaluate under an unchanged fingerprint', () => {
  const scenario = wildfireScenario('officialCorroboration');
  const mutated = { ...scenario.contract, doctrine: 'Mutated after contract creation.' };
  assert.throws(() => evaluateEvidenceContract({ claim: scenario.claim, contract: mutated, evidenceGraph: scenario.evidenceGraph, evaluationTime: scenario.evaluationTime }), /fingerprint_mismatch/);
});

test('future evidence never leaks into an earlier replay time', () => {
  const scenario = wildfireScenario('officialCorroboration');
  const result = evaluateEvidenceContract({ claim: scenario.claim, contract: scenario.contract, evidenceGraph: scenario.evidenceGraph, evaluationTime: '2026-08-24T12:17:00Z' });
  assert.equal(result.excludedEvidence.find((item) => item.evidenceId === 'ev:official').classification, 'TEMPORALLY_INCOMPATIBLE');
  assert.notEqual(result.state, 'CORROBORATED');
});
