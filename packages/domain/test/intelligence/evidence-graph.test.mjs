import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ONTOLOGY_KINDS, createEvidence, createEvidenceGraph, createObservation, createSource,
  createSourceFamily, evidenceLineage, evaluateEvidenceContract
} from '../../src/intelligence/index.mjs';
import { wildfireComponents, wildfireScenario } from '../fixtures/intelligence/wildfire-scenarios.mjs';

test('canonical ontology exposes operational objects without hazard-specific graph semantics', () => {
  for (const kind of ['Incident', 'Claim', 'Observation', 'Evidence', 'Source', 'SourceFamily', 'EvidenceLineage', 'EvidenceContract', 'EvidenceNeed', 'Contradiction', 'Location', 'Asset', 'Organization', 'Action', 'PolicyReference', 'Outcome']) assert.ok(ONTOLOGY_KINDS.includes(kind));
});

test('lineage preserves endpoint, publisher, sensor, observation, and root measurement identity', () => {
  const scenario = wildfireScenario('duplicateTrap');
  const lineage = evidenceLineage(scenario.evidenceGraph, 'ev:website-c');
  assert.deepEqual(lineage.causalKeys, ['measurement:viirs-measurement-x']);
  assert.deepEqual(lineage.rootObservationIds, ['obs:viirs-root']);
  assert.deepEqual(lineage.sourceIds, ['api-a', 'viirs-sensor', 'website-c']);
});

test('duplicate ingestion is idempotent and conflicting identity is rejected', () => {
  const components = wildfireComponents(), row = components.evidenceByKey.viirs;
  const graph = createEvidenceGraph({ sourceFamilies: components.sourceFamilies, sources: components.sources, observations: components.observations, evidence: [row, row, structuredClone(row)] });
  assert.equal(graph.evidence.length, 1);
  assert.throws(() => createEvidenceGraph({ sourceFamilies: components.sourceFamilies, sources: components.sources, observations: components.observations, evidence: [row, { ...row, stance: 'CONTRADICTING' }] }), /conflicting_duplicate_evidence/);
});

test('one upstream measurement cannot be laundered into conflicting source families', () => {
  const sourceFamilies = [createSourceFamily({ id: 'family-a', familyClass: 'PHYSICAL' }), createSourceFamily({ id: 'family-b', familyClass: 'PHYSICAL' })];
  const sources = [createSource({ id: 'source-a', familyId: 'family-a', kind: 'SENSOR' }), createSource({ id: 'source-b', familyId: 'family-b', kind: 'SENSOR' })];
  const observations = ['source-a', 'source-b'].map((sourceId, index) => createObservation({ id: `obs-${index}`, sourceId, observedAt: '2026-08-24T12:00:00Z', state: 'OBSERVED_POSITIVE', location: { coordinate: [-8, 40] }, opportunity: { state: 'VALID' }, upstreamMeasurementId: 'same-measurement' }));
  assert.throws(() => createEvidenceGraph({ sourceFamilies, sources, observations, evidence: [] }), /causal_lineage_family_conflict/);
});

test('evidence graph and evaluation are immutable snapshots', () => {
  const scenario = wildfireScenario('officialCorroboration');
  const result = evaluateEvidenceContract({ claim: scenario.claim, contract: scenario.contract, evidenceGraph: scenario.evidenceGraph, evaluationTime: scenario.evaluationTime });
  assert.throws(() => { scenario.evidenceGraph.evidence.push(createEvidence({ id: 'later', claimId: scenario.claim.id, observationId: 'obs:report', stance: 'SUPPORTING' })); }, TypeError);
  assert.throws(() => { result.state = 'FORGED'; }, TypeError);
  assert.equal(result.state, 'CORROBORATED');
});

test('missing optional provenance fails safely and explicitly', () => {
  const components = wildfireComponents();
  const unknown = createEvidence({ id: 'ev:unknown-provenance', claimId: components.claim.id, observationId: 'obs:viirs-root', stance: 'SUPPORTING' });
  const graph = createEvidenceGraph({ sourceFamilies: components.sourceFamilies, sources: components.sources, observations: components.observations, evidence: [unknown] });
  const result = evaluateEvidenceContract({ claim: components.claim, contract: components.contract, evidenceGraph: graph, evaluationTime: '2026-08-24T12:30:00Z' });
  assert.equal(result.excludedEvidence[0].classification, 'INSUFFICIENT_PROVENANCE');
});
