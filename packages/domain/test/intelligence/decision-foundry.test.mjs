import assert from 'node:assert/strict';
import test from 'node:test';
import { assignCorpusSplitsV2 } from '../../src/forecast-corpus/index.mjs';
import {
  assessBaselineSafety, buildHorizonLabels, calculateDecisionDelta, certifyNegativeAtlas,
  compileCrisisDecisionState, createCrisisDecisionPacket, createDecisionDefinition,
  createDecisionReplayRecord, createHypothesisDefinition, createNegativeAtlasEntry,
  createWildfireHypothesisDefinitions, evaluateContractCounterfactual,
  evaluateDecisionDependencies, evaluateHypotheses, materializeProgressionSequence,
  planIntelligenceAcquisitions, rankCandidateAcquisitions, selectSecondRegion,
  adjudicateRegion, sourceMarginalValue, verifyCounterfactualSeparation, verifyDecisionReplay,
} from '../../src/decision-foundry/index.mjs';

const at = '2026-08-24T00:00:00.000Z';
const evidence = [{ id: 'official', kind: 'OFFICIAL_WILDFIRE_INCIDENT', availableToVigiaAt: at, sourceClass: 'OFFICIAL', causalFamilyId: 'WFIGS', qualityState: 'ACCEPTED', rightsState: 'READY' }, { id: 'physical', kind: 'PHYSICAL_THERMAL_OBSERVATION', availableToVigiaAt: at, sourceClass: 'PHYSICAL', causalFamilyId: 'VIIRS', qualityState: 'ACCEPTED', rightsState: 'READY' }];
const budgets = { maxAcquisitionsPerIncident: 2, maxBytesPerIncident: 64_000_000, maxRequestsPerProvider: 2, maxProviderRetries: 3, maxConcurrentTasks: 2, maxEstimatedCostUnits: 10, maxControllerCycles: 3, maxBlockedProviderAttempts: 3 };
const square = (x = 0) => ({ type: 'Polygon', coordinates: [[[x, 0], [x + .01, 0], [x + .01, .01], [x, .01], [x, 0]]] });

test('multi-hypothesis evaluation is deterministic, knowledge-time bounded, and complete', () => {
  const definitions = createWildfireHypothesisDefinitions(), first = evaluateHypotheses({ incidentId: 'fire', hypotheses: definitions, evidenceFacts: [...evidence, { ...evidence[1], id: 'future', availableToVigiaAt: '2026-08-25T00:00:00Z' }], knowledgeTime: at }), second = evaluateHypotheses({ incidentId: 'fire', hypotheses: [...definitions].reverse(), evidenceFacts: [...evidence].reverse(), knowledgeTime: at });
  assert.equal(first.results.length, 10); assert.equal(first.results.find((x) => x.hypothesisId === 'WILDFIRE:ACTIVE_WILDFIRE').state, 'STRONGLY_SUPPORTED'); assert.equal(first.excludedEvidence[0].reason, 'FUTURE_AT_CUTOFF'); assert.deepEqual(first.results.map((x) => [x.hypothesisId, x.state]), second.results.map((x) => [x.hypothesisId, x.state]));
});

test('malicious or executable hypothesis configuration cannot enter the compiler', () => {
  assert.throws(() => createHypothesisDefinition({ id: 'X;DROP TABLE', type: 'BAD' }), /hypothesis_id_invalid/);
  assert.throws(() => createHypothesisDefinition({ id: 'SAFE', type: 'SAFE', supportingEvidenceKinds: [() => true] }));
  assert.throws(() => createHypothesisDefinition({ id: 'SAFE', type: 'SAFE', supportingEvidenceKinds: Array(65).fill('FACT') }), /bounds/);
});

test('decision graph preserves blocker categories and authority separately', () => {
  const definition = createDecisionDefinition({ id: 'WARN', requiredFacts: ['IMPACT'], requiredDataProducts: ['PERIMETER'], authorityRequirement: { capability: 'WARN' }, actionsUnlocked: ['WARN'], consequential: true });
  const result = evaluateDecisionDependencies({ definitions: [definition], facts: [], dataProducts: [], authority: {} }).results[0]; assert.equal(result.state, 'BLOCKED_BY_DATA'); assert.deepEqual(new Set(result.blockers.map((x) => x.category)), new Set(['EVIDENCE', 'DATA', 'AUTHORITY']));
  assert.equal(evaluateDecisionDependencies({ definitions: [definition], facts: ['IMPACT'], dataProducts: ['PERIMETER'], authority: {} }).results[0].state, 'BLOCKED_BY_AUTHORITY');
});

test('Decision Delta is stable under evidence ordering and reports exact transitions', () => {
  const before = { incident: { id: 'fire' }, hypotheses: { results: [{ hypothesisId: 'H', state: 'PLAUSIBLE', fingerprint: 'a' }] }, decisions: { results: [{ decisionId: 'D', state: 'BLOCKED_BY_DATA', actionsUnlocked: [], fingerprint: 'b' }] }, openDataGaps: [{ id: 'G' }], evidenceNeedIds: ['N'] }, after = { incident: { id: 'fire' }, hypotheses: { results: [{ hypothesisId: 'H', state: 'SUPPORTED', fingerprint: 'c' }] }, decisions: { results: [{ decisionId: 'D', state: 'READY', actionsUnlocked: ['ACT'], fingerprint: 'd' }] }, openDataGaps: [], evidenceNeedIds: [], causingDataProductIds: ['P'] };
  const delta = calculateDecisionDelta({ before, after, knowledgeTime: at }); assert.deepEqual(delta.actionsBecameAvailable, ['ACT']); assert.deepEqual(delta.dataGapsClosed, ['G']); assert.deepEqual(delta.evidenceNeedsClosed, ['N']); assert.equal(delta.fingerprint, calculateDecisionDelta({ before, after, knowledgeTime: at }).fingerprint);
});

test('Decision Value exposes components and prioritizes decision-critical measured unlocks', () => {
  const base = { incidentId: 'fire', requirement: 'LABEL', sourceAvailability: 'AVAILABLE', sourceHealth: 'HEALTHY', coverage: true, rights: 'READY', qualityExpectation: 'ADEQUATE', expectedBytes: 1, expectedLatencyMs: 1, estimatedCostUnits: 0, maximumRetryAttempts: 3, retryAttempts: 0 };
  const rows = rankCandidateAcquisitions([{ ...base, id: 'context', decisionsAffected: [], forecastExamplesUnlocked: 0 }, { ...base, id: 'critical', decisionsAffected: ['D'], contractsPotentiallySatisfied: ['C'], forecastExamplesUnlocked: 40, horizonsUnlocked: [3] }], { knowledgeTime: at });
  assert.equal(rows[0].candidateId, 'critical'); assert.equal(rows[0].priorityVector.forecastHorizonsUnlocked, 1); assert.equal(rows[0].orderingDoctrine.ordering, 'LEXICOGRAPHIC'); assert.equal('totalRank' in rows[0], false); assert.match(rows[0].explanation, /CRITICAL consequence/);
  const republisher = sourceMarginalValue({ sourceId: 'feds', sourceFamily: 'VIIRS', contributions: [{ rootMeasurementId: 'viirs-root', sourceFamily: 'VIIRS', independent: false, republished: true }] }); assert.equal(republisher.uniqueRootMeasurements, 0); assert.equal(republisher.causalDuplicates, 1); assert.equal(republisher.qualification, 'NO_UNIQUE_MEASURED_VALUE');
});

test('planner fails closed on missing budgets, rights, opportunity, and duplicate lineage', () => {
  const base = { candidateId: 'c', incidentId: 'fire', provider: 'p', requirement: 'R', blockingConditions: [], components: { coverageReady: 1, sourceAvailable: 1, sourceHealthy: 1, causalDuplicationRisk: 0 }, rights: 'READY', cost: { expectedBytes: 1, estimatedCostUnits: 0 }, risk: { retryAttempts: 0 }, decisionsAffected: [], hypothesesSeparated: [], contractsPotentiallySatisfied: [], horizonsUnlocked: [], forecastExamplesUnlocked: 0, fingerprint: 'f', explanation: 'x' };
  assert.throws(() => planIntelligenceAcquisitions({ rankedCandidates: [base] }), /budget_state_required/);
  assert.equal(planIntelligenceAcquisitions({ rankedCandidates: [{ ...base, rights: 'BLOCKED' }], budgets }).items[0].state, 'RIGHTS_BLOCKED');
  assert.equal(planIntelligenceAcquisitions({ rankedCandidates: [{ ...base, blockingConditions: ['NO_VALID_OBSERVATION_OPPORTUNITY'] }], budgets }).items[0].state, 'NO_VALID_OBSERVATION_OPPORTUNITY');
  assert.equal(planIntelligenceAcquisitions({ rankedCandidates: [{ ...base, components: { ...base.components, causalDuplicationRisk: 1 } }], budgets }).items[0].state, 'CAUSAL_DUPLICATE');
});

test('counterfactuals are contract-only and cannot mutate operational evidence', () => {
  const packet = compileCrisisDecisionState({ incident: { id: 'fire' }, knowledgeTime: at, evidenceFacts: evidence, facts: ['INCIDENT_EXISTS'], dataProducts: [], openDataGaps: [{ id: 'gap', requirement: 'FUTURE_LABEL', unlocks: [3] }], candidateAcquisitions: [{ id: 'c', incidentId: 'fire', gapId: 'gap', requirement: 'FUTURE_LABEL', sourceAvailability: 'BLOCKED', sourceHealth: 'DEGRADED', coverage: false, rights: 'READY', blockingConditions: ['NO_VALID_OBSERVATION_OPPORTUNITY'] }], budgets });
  const result = evaluateContractCounterfactual({ decisionPacket: packet, assumption: { type: 'SATISFY_DATA_GAP', gapId: 'gap' } }); assert.equal(result.evidenceAdmissions.length, 0); assert.equal(result.operationalTruthMutation, false); assert.equal(verifyCounterfactualSeparation(result, { nodes: [] }).valid, true); assert.throws(() => evaluateContractCounterfactual({ decisionPacket: packet, assumption: { type: 'INJECT_EVIDENCE' } }), /type_invalid/);
});

test('negative atlas refuses empty-response, downtime, and incomplete proof labels', () => {
  const entry = createNegativeAtlasEntry({ id: 'n', geometry: { type: 'Point', coordinates: [0, 0] }, timeWindow: { from: at, to: at }, sourceFamily: 'VIIRS', label: 'VALID_NO_WILDFIRE', proof: { coverage: true, providerHealthy: false }, knowledgeTimeCutoff: at, hardNegativeCategory: 'INDUSTRIAL' }), atlas = certifyNegativeAtlas([entry]);
  assert.equal(entry.label, 'UNKNOWN'); assert.equal(entry.certified, false); assert.equal(atlas.certifiedNegatives, 0); assert.equal(atlas.validHardNegatives, 0); assert.match(entry.rejectionReasons.join(','), /MISSING_OBSERVATIONOPPORTUNITY/);
});

test('progression and future-label factories reject noncausal clocks and retain causal horizons', () => {
  const state = (id, hour, availableHour, x = 0) => ({ id, geometry: square(x), originalGeometryHash: id, clocks: { observedAt: `2026-08-24T${String(hour).padStart(2, '0')}:00:00Z`, availableToVigiaAt: `2026-08-24T${String(availableHour).padStart(2, '0')}:05:00Z` } });
  const incident = { id: 'fire', perimeterSourceClass: 'ARCHIVED_OPERATIONAL_SNAPSHOT', perimeterStates: [state('a', 0, 0), state('b', 1, 1, .001), state('bad', 3, 2, .002), state('c', 3, 3, .003)] }, geometryResults = incident.perimeterStates.map((s, i) => ({ stateId: s.id, areaRatio: i ? 1.1 : null, centroidDisplacementKm: .1, failures: [] })), sequence = materializeProgressionSequence({ incident, geometryResults }), labels = buildHorizonLabels({ incident, sequence });
  assert.equal(sequence.revisions.find((x) => x.stateId === 'bad').classification, 'CLOCK_ANOMALY'); assert.ok(labels.horizonCounts[1] >= 1); assert.ok(labels.labels.every((x) => x.knowledgeTimeValidity === 'CAUSAL'));
  assert.match(assessBaselineSafety({ currentAreaKm2: 2, previousAreaKm2: 1, deltaHours: 1, horizonHours: 24, boundaryVelocityKmH: .1, revisionClassification: 'NORMAL_PROGRESSION', geometryValid: true }).failures.join(','), /EXTRAPOLATION/);
});

test('split factory v2 binds all causally connected examples to one split', () => {
  const base = { id: 'a', incidentId: 'one', region: 'r', season: 's', upstreamObservationIds: ['root'] }, rows = assignCorpusSplitsV2([base, { ...base, id: 'b', incidentId: 'two' }]); assert.equal(rows.schemaVersion, 'vigia.corpus-splits.v2'); assert.equal(new Set(rows.cases.map((x) => x.split)).size, 1); assert.equal(rows.assignments[0].incidentIds.length, 2);
});

test('region adjudication does not convert final-only data into progression', () => {
  const finalOnly = adjudicateRegion({ regionId: 'pt', progressionSequence: 'FINAL_ONLY', futureLabels: 'FINAL_ONLY', rights: 'ADEQUATE' }), partner = adjudicateRegion({ regionId: 'ca', partnerRequired: true, authoritativeIncidentIdentity: 'READY', issueTimeWeather: 'AVAILABLE', fuelTerrainContext: 'READY', rights: 'ADEQUATE', physicalObservations: 'AVAILABLE' }), selection = selectSecondRegion([finalOnly, partner]); assert.equal(finalOnly.state, 'FINAL_ONLY'); assert.equal(partner.state, 'PARTNER_REQUIRED'); assert.equal(selection.selectedRegionId, 'ca');
});

test('decision packet replay detects compiler input, packet, ranking, and proof substitution', () => {
  const input = { incident: { id: 'fire' }, knowledgeTime: at, evidenceFacts: evidence, facts: ['INCIDENT_EXISTS'], dataProducts: [], openDataGaps: [], budgets }, packet = compileCrisisDecisionState(input), record = createDecisionReplayRecord({ compilerInput: input, packet, proofFingerprint: 'proof' }); assert.equal(verifyDecisionReplay(record, packet, { proofFingerprint: 'proof' }).valid, true); assert.match(verifyDecisionReplay(record, { ...packet, replayFingerprint: 'tampered' }, { proofFingerprint: 'wrong' }).reasons.join(','), /DECISION_PACKET_MISMATCH/);
  assert.equal(createCrisisDecisionPacket({ incident: { id: 'fire' }, knowledgeTime: at, hypotheses: {}, decisions: {} }).schemaVersion, 'vigia.crisis-decision-packet.v1');
});
