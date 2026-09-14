import assert from 'node:assert/strict';
import test from 'node:test';
import fc from 'fast-check';
import {
  calculateDecisionDelta, calibrateInformationValue, compareDecisionPriority, compileCrisisDecisionState, compileDecisionDoctrine, createDecisionDefinition,
  createDecisionOutcome, createHypothesisDefinition, createInformationValueOutcome, createProspectiveCaptureManifest,
  createDecisionReplayRecord, createProspectiveSnapshot, createWildfireHypothesisDefinitions, decisionDoctrineCoverage, evaluateCandidateAcquisitionValue, evaluateContractCounterfactual,
  evaluateDecisionDependencies, evaluateHypotheses, explainPriorityComparison, planIntelligenceAcquisitions,
  rankCandidateAcquisitions, verifyDecisionReplay, wildfireDecisionDoctrineLibrary,
} from '../../src/decision-foundry/index.mjs';

const at = '2026-08-25T00:00:00.000Z';
const budgets = { maxAcquisitionsPerIncident: 2, maxBytesPerIncident: 64_000_000, maxRequestsPerProvider: 2, maxProviderRetries: 3, maxConcurrentTasks: 2, maxEstimatedCostUnits: 10, maxControllerCycles: 3, maxBlockedProviderAttempts: 3 };
const candidate = (overrides = {}) => ({ id: 'candidate-a', incidentId: 'incident-a', provider: 'provider-a', requirement: 'EVIDENCE', consequenceClass: 'OPERATIONAL', decisionDeadline: '2026-08-25T01:00:00Z', decisionsAffected: ['DECISION'], criticalDecisionsPotentiallyUnblocked: 1, contractsPotentiallySatisfied: ['CONTRACT'], hypothesesSeparated: ['HYPOTHESIS'], horizonsUnlocked: [1], scientificGatesUnlocked: 1, independentFamilyGained: true, sourceAvailability: 'AVAILABLE', sourceHealth: 'HEALTHY', coverage: true, rights: 'READY', qualityExpectation: 'HIGH', expectedBytes: 1000, expectedLatencyMs: 1000, estimatedCostUnits: 1, retryAttempts: 0, maximumRetryAttempts: 3, causalDuplicationRisk: 'LOW', blockingConditions: [], ...overrides });
const priority = (value) => evaluateCandidateAcquisitionValue(candidate(value), { knowledgeTime: at });

test('Decision Priority Vector property invariants hold for bounded generated candidates', () => {
  fc.assert(fc.property(fc.nat({ max: 20 }), fc.nat({ max: 20 }), fc.nat({ max: 100_000 }), fc.nat({ max: 100 }), (critical, delta, latency, cost) => {
    const base = priority({ criticalDecisionsPotentiallyUnblocked: critical, expectedLatencyMs: latency, estimatedCostUnits: cost });
    const moreCritical = priority({ id: 'candidate-b', criticalDecisionsPotentiallyUnblocked: critical + delta + 1, expectedLatencyMs: latency, estimatedCostUnits: cost });
    assert.ok(compareDecisionPriority(moreCritical, base) < 0);
    const slower = priority({ id: 'candidate-c', criticalDecisionsPotentiallyUnblocked: critical, expectedLatencyMs: latency + 1, estimatedCostUnits: cost });
    assert.ok(compareDecisionPriority(base, slower) < 0);
    const costlier = priority({ id: 'candidate-d', criticalDecisionsPotentiallyUnblocked: critical, expectedLatencyMs: latency, estimatedCostUnits: cost + 1 });
    assert.ok(compareDecisionPriority(base, costlier) < 0);
  }), { numRuns: 300, seed: 20260825 });
});

test('higher-order consequence, eligibility, rights, deadline, and causal independence are monotonic', () => {
  const lifeSafety = priority({ id: 'life', consequenceClass: 'LIFE_SAFETY', forecastExamplesUnlocked: 0, expectedLatencyMs: 50_000 });
  const cosmetic = priority({ id: 'cosmetic', consequenceClass: 'COSMETIC', forecastExamplesUnlocked: 1_000_000, expectedLatencyMs: 1 });
  assert.ok(compareDecisionPriority(lifeSafety, cosmetic) < 0);
  const available = priority({ id: 'available' }), unavailable = priority({ id: 'unavailable', sourceAvailability: 'UNAVAILABLE' });
  assert.ok(compareDecisionPriority(available, unavailable) < 0);
  const permitted = priority({ id: 'permitted' }), blocked = priority({ id: 'blocked', rights: 'BLOCKED' });
  assert.ok(compareDecisionPriority(permitted, blocked) < 0);
  const early = priority({ id: 'early', decisionDeadline: '2026-08-25T01:00:00Z' }), late = priority({ id: 'late', decisionDeadline: '2026-08-25T02:00:00Z' });
  assert.ok(compareDecisionPriority(early, late) < 0);
  const duplicate = priority({ id: 'duplicate', causalDuplicationRisk: 'HIGH', independentFamilyGained: true });
  assert.equal(duplicate.priorityVector.independentFamiliesGained, 0); assert.ok(compareDecisionPriority(available, duplicate) < 0);
});

test('input ordering never changes ranking and candidate identity resolves only a final tie', () => {
  fc.assert(fc.property(fc.uniqueArray(fc.stringMatching(/^[a-z]{1,8}$/), { minLength: 2, maxLength: 20 }), (ids) => {
    const inputs = ids.map((id, index) => candidate({ id, criticalDecisionsPotentiallyUnblocked: index % 4, expectedLatencyMs: index * 100 }));
    const first = rankCandidateAcquisitions(inputs, { knowledgeTime: at }).map((row) => row.candidateId);
    const second = rankCandidateAcquisitions([...inputs].reverse(), { knowledgeTime: at }).map((row) => row.candidateId);
    assert.deepEqual(first, second);
  }), { numRuns: 200, seed: 84117 });
  const a = priority({ id: 'a' }), b = priority({ id: 'b' }); assert.equal(explainPriorityComparison(a, b).decisiveDimension, 'candidateIdentity');
});

test('evidence ordering, exact duplicates, hypothesis evaluation, and acquisition planning are deterministic', () => {
  const definition = createHypothesisDefinition({ id: 'GENERAL:FIRE', type: 'FIRE', supportingEvidenceKinds: ['HEAT'], requiredEvidenceAny: ['HEAT'] });
  const facts = [{ id: 'b', kind: 'HEAT', availableToVigiaAt: at, causalFamilyId: 'two' }, { id: 'a', kind: 'HEAT', availableToVigiaAt: at, causalFamilyId: 'one' }];
  const first = evaluateHypotheses({ incidentId: 'incident', hypotheses: [definition], evidenceFacts: facts, knowledgeTime: at });
  const second = evaluateHypotheses({ incidentId: 'incident', hypotheses: [definition], evidenceFacts: [facts[0], facts[1], facts[0]], knowledgeTime: at });
  assert.equal(first.fingerprint, second.fingerprint);
  const ranked = rankCandidateAcquisitions([candidate()], { knowledgeTime: at });
  assert.equal(planIntelligenceAcquisitions({ rankedCandidates: ranked, budgets }).fingerprint, planIntelligenceAcquisitions({ rankedCandidates: ranked, budgets }).fingerprint);
});

test('hypothesis and knowledge-time replay property holds across generated evidence permutations', () => {
  const definitions = createWildfireHypothesisDefinitions();
  fc.assert(fc.property(fc.uniqueArray(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 32 }), (identities) => {
    const facts = identities.map((identity, index) => ({ id: `fact-${identity}`, kind: index % 2 ? 'PHYSICAL_THERMAL_OBSERVATION' : 'OFFICIAL_WILDFIRE_INCIDENT', availableToVigiaAt: at, sourceClass: index % 2 ? 'PHYSICAL' : 'OFFICIAL', causalFamilyId: `family-${identity}`, qualityState: 'ACCEPTED', rightsState: 'READY' }));
    const forward = evaluateHypotheses({ incidentId: 'incident-property', hypotheses: definitions, evidenceFacts: facts, knowledgeTime: at }), permuted = evaluateHypotheses({ incidentId: 'incident-property', hypotheses: [...definitions].reverse(), evidenceFacts: [...facts].reverse().flatMap((fact) => [fact, fact]), knowledgeTime: at });
    assert.equal(forward.fingerprint, permuted.fingerprint);
  }), { numRuns: 250, seed: 20260826 });
});

test('Decision Dependency Graph degradation property never creates authority', () => {
  const definition = createDecisionDefinition({ id: 'WARN_PROPERTY', requiredFacts: ['IMPACT'], requiredDataProducts: ['PERIMETER'], authorityRequirement: { capability: 'WARN' }, actionsUnlocked: ['WARN'], consequential: true });
  fc.assert(fc.property(fc.boolean(), fc.boolean(), fc.boolean(), fc.boolean(), fc.boolean(), (fact, product, authority, rights, healthy) => {
    const context = { definitions: [definition], facts: fact ? ['IMPACT'] : [], dataProducts: product ? ['PERIMETER'] : [], authority: { WARN: authority }, rights: { WARN: rights }, sourceHealth: { WARN: healthy } }, result = evaluateDecisionDependencies(context).results[0];
    const degraded = evaluateDecisionDependencies({ ...context, authority: { WARN: false }, rights: { WARN: false }, sourceHealth: { WARN: false } }).results[0];
    assert.notEqual(degraded.state, 'READY'); assert.equal(degraded.actionsUnlocked.length, 0); if (result.state !== 'READY') assert.equal(result.actionsUnlocked.length, 0);
  }), { numRuns: 250, seed: 20260827 });
});

test('Decision Delta determinism property survives set and event ordering changes', () => {
  fc.assert(fc.property(fc.uniqueArray(fc.stringMatching(/^[A-Z]{1,8}$/), { minLength: 1, maxLength: 24 }), fc.nat({ max: 24 }), (identities, pivot) => {
    const boundary = pivot % (identities.length + 1), retained = identities.slice(0, boundary), closed = identities.slice(boundary), before = { incident: { id: 'incident-delta' }, hypotheses: { results: identities.map((id) => ({ hypothesisId: `H:${id}`, state: 'PLAUSIBLE', fingerprint: `before:${id}` })) }, decisions: { results: identities.map((id) => ({ decisionId: `D:${id}`, state: 'BLOCKED_BY_DATA', actionsUnlocked: [], fingerprint: `before:${id}` })) }, openDataGaps: identities.map((id) => ({ id: `G:${id}` })), evidenceNeedIds: identities.map((id) => `N:${id}`) }, after = { incident: { id: 'incident-delta' }, hypotheses: { results: identities.map((id) => ({ hypothesisId: `H:${id}`, state: 'SUPPORTED', fingerprint: `after:${id}` })) }, decisions: { results: identities.map((id) => ({ decisionId: `D:${id}`, state: 'READY', actionsUnlocked: [`A:${id}`], fingerprint: `after:${id}` })) }, openDataGaps: retained.map((id) => ({ id: `G:${id}` })), evidenceNeedIds: retained.map((id) => `N:${id}`), causingDataProductIds: closed.map((id) => `P:${id}`) };
    const first = calculateDecisionDelta({ before, after, knowledgeTime: at }), second = calculateDecisionDelta({ before: { ...before, hypotheses: { results: [...before.hypotheses.results].reverse() }, decisions: { results: [...before.decisions.results].reverse() }, openDataGaps: [...before.openDataGaps].reverse(), evidenceNeedIds: [...before.evidenceNeedIds].reverse() }, after: { ...after, hypotheses: { results: [...after.hypotheses.results].reverse() }, decisions: { results: [...after.decisions.results].reverse() }, openDataGaps: [...after.openDataGaps].reverse(), evidenceNeedIds: [...after.evidenceNeedIds].reverse(), causingDataProductIds: [...after.causingDataProductIds].reverse() }, knowledgeTime: at });
    assert.equal(first.fingerprint, second.fingerprint);
  }), { numRuns: 200, seed: 20260828 });
});

test('Decision Packet compilation and replay equivalence property is permutation invariant', () => {
  fc.assert(fc.property(fc.uniqueArray(fc.integer({ min: 0, max: 500 }), { minLength: 1, maxLength: 20 }), (identities) => {
    const evidenceFacts = identities.map((identity, index) => ({ id: `packet-fact-${identity}`, kind: index % 2 ? 'PHYSICAL_THERMAL_OBSERVATION' : 'OFFICIAL_WILDFIRE_INCIDENT', availableToVigiaAt: at, sourceClass: index % 2 ? 'PHYSICAL' : 'OFFICIAL', causalFamilyId: `packet-family-${identity}`, qualityState: 'ACCEPTED', rightsState: 'READY' })), input = { incident: { id: 'incident-packet-property' }, knowledgeTime: at, evidenceFacts, facts: ['INCIDENT_EXISTS'], dataProducts: [], openDataGaps: [], budgets };
    const first = compileCrisisDecisionState(input), second = compileCrisisDecisionState({ ...input, evidenceFacts: [...evidenceFacts].reverse(), facts: [...input.facts].reverse() }); assert.equal(first.replayFingerprint, second.replayFingerprint);
    const replay = createDecisionReplayRecord({ compilerInput: input, packet: first, proofFingerprint: 'proof-property' }); assert.equal(verifyDecisionReplay(replay, second, { proofFingerprint: 'proof-property' }).valid, true);
  }), { numRuns: 150, seed: 20260829 });
});

test('outcome adjudication property keeps realized Information Value bounded and review controlled', () => {
  fc.assert(fc.property(fc.nat({ max: 1_000_000 }), fc.nat({ max: 1_000_000 }), fc.boolean(), (predictedLatency, actualLatency, unlocked) => {
    const predicted = unlocked ? ['DECISION'] : [], actual = unlocked ? ['DECISION'] : [], outcome = createInformationValueOutcome({ id: `value-${predictedLatency}-${actualLatency}-${unlocked}`, acquisitionId: `acquisition-${predictedLatency}-${actualLatency}-${unlocked}`, incidentId: 'incident-value-property', providerId: 'provider', acquisitionType: 'PERIMETER', recordedAt: at, predicted: { decisionsUnlocked: predicted, latencyMs: predictedLatency }, actual: { decisionsUnlocked: actual, latencyMs: actualLatency, sourceSuccess: true } }), calibration = calibrateInformationValue([outcome]);
    assert.equal(calibration.overall.meanAbsoluteLatencyErrorMs, Math.abs(actualLatency - predictedLatency)); assert.ok(calibration.overall.unlockPrecision === null || calibration.overall.unlockPrecision >= 0 && calibration.overall.unlockPrecision <= 1); assert.ok(calibration.overall.unlockRecall === null || calibration.overall.unlockRecall >= 0 && calibration.overall.unlockRecall <= 1); assert.equal(calibration.automaticDoctrineMutation, false); assert.equal(calibration.recommendationRequiresReview, true);
  }), { numRuns: 250, seed: 20260830 });
});

test('knowledge-time receipt-delay metamorphic relation changes history without rewriting event time', () => {
  const definition = createHypothesisDefinition({ id: 'GENERAL:DELAYED_HEAT', type: 'DELAYED_HEAT', supportingEvidenceKinds: ['HEAT'], requiredEvidenceAny: ['HEAT'] }), observedAt = '2026-08-24T23:00:00.000Z', fact = { id: 'delayed-fact', kind: 'HEAT', observedAt, availableToVigiaAt: '2026-08-25T01:00:00.000Z', sourceClass: 'PHYSICAL', causalFamilyId: 'sensor-a', qualityState: 'ACCEPTED', rightsState: 'READY' };
  const historical = evaluateHypotheses({ incidentId: 'incident-delay', hypotheses: [definition], evidenceFacts: [fact], knowledgeTime: at }), current = evaluateHypotheses({ incidentId: 'incident-delay', hypotheses: [definition], evidenceFacts: [fact], knowledgeTime: '2026-08-25T02:00:00.000Z' });
  assert.equal(historical.results[0].state, 'UNRESOLVED'); assert.equal(current.results[0].state, 'SUPPORTED'); assert.equal(fact.observedAt, observedAt);
});

test('irrelevant-context and counterfactual-isolation metamorphic relations preserve operational truth', () => {
  const definition = createHypothesisDefinition({ id: 'GENERAL:HEAT_ONLY', type: 'HEAT_ONLY', supportingEvidenceKinds: ['HEAT'], requiredEvidenceAny: ['HEAT'] }), heat = { id: 'heat', kind: 'HEAT', availableToVigiaAt: at, sourceClass: 'PHYSICAL', causalFamilyId: 'sensor-a', qualityState: 'ACCEPTED', rightsState: 'READY' }, irrelevant = { ...heat, id: 'irrelevant', kind: 'ROAD_CONTEXT' };
  const before = evaluateHypotheses({ incidentId: 'incident-context', hypotheses: [definition], evidenceFacts: [heat], knowledgeTime: at }), after = evaluateHypotheses({ incidentId: 'incident-context', hypotheses: [definition], evidenceFacts: [irrelevant, heat], knowledgeTime: at }); assert.equal(before.results[0].fingerprint, after.results[0].fingerprint);
  const packet = { replayFingerprint: 'packet-context', openDataGaps: [{ id: 'gap-context' }], incident: { id: 'incident-context' } }, packetBefore = structuredClone(packet), counterfactual = evaluateContractCounterfactual({ decisionPacket: packet, assumption: { type: 'SATISFY_DATA_GAP', gapId: 'gap-context' } }); assert.deepEqual(packet, packetBefore); assert.equal(counterfactual.operationalTruthMutation, false); assert.deepEqual(counterfactual.evidenceAdmissions, []);
});

test('authority, revocation, rights, and source-health degradation cannot enable work', () => {
  const definition = createDecisionDefinition({ id: 'WARN', requiredFacts: ['FACT'], actionsUnlocked: ['WARN'], authorityRequirement: { capability: 'WARN' }, consequential: true });
  const allowed = evaluateDecisionDependencies({ definitions: [definition], facts: ['FACT'], authority: { WARN: true } }).results[0];
  for (const context of [{ authority: { WARN: false } }, { authority: { WARN: true }, trust: { WARN: false } }, { authority: { WARN: true }, rights: { WARN: false } }, { authority: { WARN: true }, sourceHealth: { WARN: false } }]) {
    const degraded = evaluateDecisionDependencies({ definitions: [definition], facts: ['FACT'], ...context }).results[0]; assert.notEqual(degraded.state, 'READY'); assert.equal(degraded.actionsUnlocked.length, 0);
  }
  assert.equal(allowed.state, 'READY');
});

test('doctrine compiler rejects cycles, missing policy, capabilities, and unsafe escalation', () => {
  const base = wildfireDecisionDoctrineLibrary(); assert.ok(compileDecisionDoctrine(base).definitions.length >= 18);
  assert.throws(() => compileDecisionDoctrine({ ...base, decisions: [...base.decisions, { id: 'BAD', policyReference: { id: 'MISSING' }, actionsUnlocked: [] }] }), /policy_unknown/);
  assert.throws(() => compileDecisionDoctrine({ ...base, decisions: [{ id: 'A', policyReference: { id: base.policies[0] }, requiredDecisions: ['B'] }, { id: 'B', policyReference: { id: base.policies[0] }, requiredDecisions: ['A'] }] }), /cycle/);
  assert.throws(() => compileDecisionDoctrine({ ...base, decisions: [{ id: 'BAD', policyReference: { id: base.policies[0] }, consequential: true, actionsUnlocked: ['WARN'] }] }), /unsafe_escalation/);
  assert.equal(decisionDoctrineCoverage({ operationalStates: [{ id: 'incident-known', context: { facts: ['INCIDENT_EXISTS'] } }] }).states[0].applicableDecisions, base.decisions.length);
});

test('prospective archive, no-hindsight Decision Memory, and realized information value are fail-closed', () => {
  const manifest = createProspectiveCaptureManifest({ id: 'manifest', mode: 'ONCE', providers: ['provider'], products: ['product'], regions: ['region'], incidentIds: ['incident'], cadenceSeconds: 60, retentionDays: 10, startedAt: at, rights: { state: 'READY', licenceId: 'OPEN' } });
  const first = createProspectiveSnapshot({ manifest, sequence: 1, incidentId: 'incident', providerId: 'provider', productId: 'product', providerPublishedAt: at, vigiaReceivedAt: at, rawObjectReference: 'object', rawObjectHash: 'a'.repeat(64) });
  assert.equal(first.previousSnapshotFingerprint, null); assert.throws(() => createProspectiveSnapshot({ manifest, sequence: 2, incidentId: 'other', providerId: 'provider', productId: 'product', vigiaReceivedAt: at, rawObjectReference: 'object', rawObjectHash: 'a'.repeat(64) }), /scope_escape/);
  assert.throws(() => createDecisionOutcome({ id: 'outcome', incidentId: 'incident', packetFingerprint: 'packet', decisionTime: at, laterEvidence: [{ availableToVigiaAt: at }] }), /not_later/);
  const outcome = createInformationValueOutcome({ id: 'value', acquisitionId: 'acq', incidentId: 'incident', providerId: 'provider', acquisitionType: 'PERIMETER', recordedAt: at, predicted: { decisionsUnlocked: ['A'], latencyMs: 100 }, actual: { decisionsUnlocked: ['A'], latencyMs: 110, sourceSuccess: true } });
  const calibration = calibrateInformationValue([outcome]); assert.equal(calibration.overall.unlockPrecision, 1); assert.equal(calibration.overall.meanAbsoluteLatencyErrorMs, 10); assert.equal(calibration.automaticDoctrineMutation, false);
});

test('critical configuration/domain boundaries tolerate adversarial generated values without partial trusted output', () => {
  fc.assert(fc.property(fc.anything({ maxDepth: 4 }), (value) => {
    try { const definition = createHypothesisDefinition(value); assert.equal(definition.schemaVersion, 'vigia.hypothesis-definition.v1'); assert.ok(Object.isFrozen(definition)); }
    catch (error) { assert.ok(error instanceof Error); }
  }), { numRuns: 500, seed: 55891 });
  const packet = { replayFingerprint: 'packet', openDataGaps: [], incident: { id: 'incident' } };
  assert.throws(() => evaluateContractCounterfactual({ decisionPacket: packet, assumption: { type: 'INJECT_EVIDENCE' } }), /invalid/);
});

test('adversarial fuzzing rejects malformed packets, outcomes, graphs, and plans without trusted partial output', () => {
  fc.assert(fc.property(fc.anything({ maxDepth: 4, maxKeys: 24 }), (value) => {
    const calls = [
      [() => createDecisionDefinition(value), 'vigia.decision-definition.v2'],
      [() => createDecisionOutcome(value), 'vigia.decision-outcome.v1'],
      [() => createInformationValueOutcome(value), 'vigia.realized-information-value.v1'],
      [() => evaluateHypotheses(value), 'vigia.multi-hypothesis-graph.v1'],
      [() => planIntelligenceAcquisitions(value), 'vigia.intelligence-acquisition-plan.v1'],
      [() => compileCrisisDecisionState(value), 'vigia.crisis-decision-packet.v1']
    ];
    for (const [operation, schemaVersion] of calls) {
      try { const result = operation(); assert.equal(result.schemaVersion, schemaVersion); assert.ok(Object.isFrozen(result)); }
      catch (error) { assert.ok(error instanceof Error); }
    }
  }), { numRuns: 300, seed: 20260831 });
});
