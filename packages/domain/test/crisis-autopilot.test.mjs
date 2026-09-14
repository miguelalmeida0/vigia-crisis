import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CRISIS_AUTOPILOT_TRIGGER_TYPES,
  projectCrisisAutopilot,
  projectDecisionIntelligence,
  projectUnknownUnknownSentinel,
  projectValueOfInformation,
} from '../src/crisis-autopilot/index.mjs';

const at = '2026-09-04T12:00:00.000Z';
const councilReview = (reviewerRole, content) => ({ state: 'COMPLETE', reviewerRole, reviewedAt: '2026-09-04T11:58:00.000Z', content });

const candidate = (overrides = {}) => ({
  id: 'candidate:field-road', incidentId: 'fire:one', provider: 'FIELDNET', requirement: 'NORTHERN_ROAD_PASSABILITY',
  sourceAvailability: 'AVAILABLE', sourceHealth: 'HEALTHY', coverage: true, rights: 'READY', qualityExpectation: 'ADEQUATE',
  decisionsAffected: ['decision:route'], criticalDecisionsPotentiallyUnblocked: 1,
  contractsPotentiallySatisfied: ['contract:road-status'], hypothesesSeparated: ['ROAD_OPEN', 'ROAD_BLOCKED'],
  independentFamilyGained: true, expectedLatencyMs: 1_200_000, estimatedCostUnits: 0, expectedBytes: 2_048,
  ...overrides,
});

const decisionPacket = {
  replayFingerprint: 'crisis-decision-packet:sha256:fixture',
  decisions: {
    results: [
      { decisionId: 'decision:protect', state: 'BLOCKED_BY_AUTHORITY', blockers: [{ category: 'AUTHORITY', code: 'CAPABILITY_REQUIRED' }], actionsUnlocked: [], blockedActions: ['PREPARE_WARNING'], authorityRequirement: { capability: 'PROPOSE_OFFICIAL_WARNING' }, consequential: true },
      { decisionId: 'decision:conflict', state: 'BLOCKED_BY_EVIDENCE', blockers: [{ category: 'EVIDENCE', code: 'CONFLICT_RESOLUTION_REQUIRED' }], actionsUnlocked: [], blockedActions: ['SELECT_ROUTE'], authorityRequirement: null, consequential: false },
      { decisionId: 'decision:machine', state: 'READY', blockers: [], actionsUnlocked: ['REFRESH_SOURCE'], blockedActions: [], authorityRequirement: null, consequential: false },
    ],
  },
  acquisitionPlan: { items: [] },
};

const decisionContexts = [
  { decisionId: 'decision:protect', consequenceClass: 'LIFE_SAFETY', decisionDeadline: '2026-09-04T12:10:00Z', whyNow: 'A declared protection threshold is reached.', consequenceOfDelay: 'Authority review would start later.', recommendedAction: 'Prepare warning draft for authority review', humanDecisionRequired: true, evidenceStrength: 'GOVERNED_BUT_INCOMPLETE', uncertainty: 'Delivery and authority remain unresolved.', alternatives: ['Continue monitoring'], safetyConstraints: ['DO_NOT_SEND_WITHOUT_AUTHORITY'], councilReviews: {
    counterargument: councilReview('RED_TEAM', 'Preparing now may outrun delivery and authority evidence.'),
    evidence: councilReview('INTELLIGENCE_OFFICER', 'Governed evidence is incomplete and its blockers remain visible.'),
    authority: councilReview('PROTECTION_OFFICER', 'Draft preparation is allowed; sending remains authority-bound.'),
    safety: councilReview('SAFETY_OFFICER', 'Do not send without current authority and verified targeting.'),
    delay: councilReview('PLANNING_OFFICER', 'A later review shortens the available preparation window.'),
    alternatives: councilReview('OPERATIONS_OFFICER', ['Continue monitoring', 'Collect delivery evidence first']),
  } },
  { decisionId: 'decision:conflict', consequenceClass: 'CRITICAL', decisionDeadline: '2026-09-04T12:45:00Z', consequenceOfDelay: 'Route selection remains blocked.', humanDecisionRequired: true, evidenceStrength: 'CONFLICTING', uncertainty: 'Road state is unresolved.' },
  { decisionId: 'decision:machine', consequenceClass: 'OPERATIONAL', humanDecisionRequired: false },
];

test('Value of Information reuses Decision Foundry ordering while selecting the best executable source', () => {
  const result = projectValueOfInformation({
    candidateAcquisitions: [
      candidate({ id: 'candidate:blocked-official', consequenceClass: 'LIFE_SAFETY', sourceAvailability: 'UNAVAILABLE', sourceHealth: 'FAILED', coverage: false, blockingConditions: ['PARTNER_REQUIRED'], expectedLatencyMs: 300_000 }),
      candidate(),
      candidate({ id: 'candidate:satellite', provider: 'SATELLITE', consequenceClass: 'OPERATIONAL', independentFamilyGained: false, criticalDecisionsPotentiallyUnblocked: 0, expectedLatencyMs: 3_600_000 }),
    ],
    collectionWork: [{ id: 'task:road', candidateId: 'candidate:field-road', state: 'IN_PROGRESS', ownerId: 'field:municipal', sourceId: 'FIELDNET', updatedAt: '2026-09-04T11:55:00Z', nextCheckAt: '2026-09-04T12:15:00Z' }],
    asOf: at,
  });
  assert.equal(result.bestNextCollectionAction.candidateId, 'candidate:field-road');
  assert.equal(result.bestNextCollectionAction.state, 'ACTIVE');
  assert.equal(result.bestNextCollectionAction.expectedWait.expectedMs, 1_200_000);
  assert.deepEqual(result.bestNextCollectionAction.expectedDecisionImpact.decisionsPotentiallyUnblocked, ['decision:route']);
  assert.equal(result.highestValueBlockedCandidate.candidateId, 'candidate:blocked-official');
  assert.equal(result.automaticTaskCreated, false);
  assert.equal('probability' in result.bestNextCollectionAction.expectedDecisionImpact, false);
  assert.equal(result.rankingDoctrine.ordering, 'LEXICOGRAPHIC');
});

test('Value of Information keeps missing latency unknown instead of converting it to zero', () => {
  const result = projectValueOfInformation({ candidateAcquisitions: [candidate({ expectedLatencyMs: undefined })], asOf: at });
  assert.equal(result.bestNextCollectionAction.expectedWait.state, 'UNKNOWN');
  assert.equal(result.bestNextCollectionAction.expectedWait.expectedMs, null);
});

test('decision compression never truncates critical required-human decisions and separates machine work', () => {
  const result = projectDecisionIntelligence({
    decisionPacket, decisionContexts,
    collectionWork: [{ id: 'task:road', state: 'IN_PROGRESS', ownerId: 'field:one', sourceId: 'FIELDNET', nextCheckAt: '2026-09-04T12:20:00Z' }],
    displayTargets: { decisionsNow: 1, blockedAuthority: 1 }, asOf: at,
  });
  assert.deepEqual(result.decisionCompression.decisionsNow.map((item) => item.decisionId), ['decision:protect', 'decision:conflict']);
  assert.deepEqual(result.decisionCompression.missedRequiredHumanDecisions, []);
  assert.equal(result.decisionCompression.criticalItemsMayExceedDisplayTarget, true);
  assert.ok(result.decisionCompression.machineWork.some((item) => item.id === 'decision:machine'));
  assert.ok(result.decisionCompression.machineWork.some((item) => item.id === 'task:road'));
  assert.equal(result.regretRadar.items.find((item) => item.decisionId === 'decision:protect').state, 'ACT_NOW');
  assert.equal(result.regretRadar.items.every((item) => item.probability === null && item.expectedLoss === null), true);
});

test('decision half-life expires stale support and withholds recommendations without a validity contract', () => {
  const result = projectDecisionIntelligence({
    decisionPacket, decisionContexts, asOf: at,
    recommendations: [
      { id: 'recommendation:valid', decisionId: 'decision:protect', recommendation: 'Prepare warning draft for authority review', evidenceValidUntil: '2026-09-04T12:30:00Z', invalidatingConditions: ['NEW_AUTHORITY_OR_INCIDENT_EVIDENCE'], freshnessRequirement: 'Supporting evidence must remain current.' },
      { id: 'recommendation:stale', decisionId: 'decision:conflict', recommendation: 'Use route A', evidenceValidUntil: '2026-09-04T13:00:00Z', invalidatingConditions: ['ROAD_STATUS_CHANGED'], supportingEvidence: [{ id: 'evidence:road', state: 'STALE', validUntil: '2026-09-04T13:00:00Z' }] },
      { id: 'recommendation:unbounded', decisionId: 'decision:machine', recommendation: 'Continue forever' },
    ],
  });
  const byId = new Map(result.decisionHalfLife.items.map((item) => [item.recommendationId, item]));
  assert.equal(byId.get('recommendation:valid').state, 'VALID');
  assert.equal(byId.get('recommendation:stale').state, 'EXPIRED');
  assert.equal(byId.get('recommendation:unbounded').state, 'WITHHELD_NO_VALIDITY_WINDOW');
  assert.equal(byId.get('recommendation:unbounded').recommendation, null);
});

test('uncertainty budget distinguishes collection, blocking, acceptable, unavailable, known, and generic unknown states', () => {
  const result = projectDecisionIntelligence({
    asOf: at, decisionPacket: { decisions: { results: [] } },
    knowns: [{ id: 'known:location', whatIsUnknown: 'Location' }],
    unknowns: [
      { id: 'unknown:collecting', whatIsUnknown: 'Road status', classification: 'DECISION_BLOCKING' },
      { id: 'unknown:blocking', whatIsUnknown: 'Authority', classification: 'DECISION_BLOCKING', strongerClaimBlocked: 'PROTECTION_ACTION' },
      { id: 'unknown:acceptable', whatIsUnknown: 'Secondary context', classification: 'CONTEXTUAL', acceptableForCurrentDecision: true },
      { id: 'unknown:terminal', whatIsUnknown: 'Partner capacity', classification: 'DECISION_MATERIAL', state: 'PARTNER_REQUIRED', terminalReason: 'No partner interface is configured.' },
      { id: 'unknown:generic', whatIsUnknown: 'Context detail', classification: 'CONTEXTUAL' },
    ],
    collectionWork: [{ id: 'task:collecting', evidenceNeedId: 'unknown:collecting', state: 'IN_PROGRESS', ownerId: 'field:one', sourceId: 'FIELDNET', nextCheckAt: '2026-09-04T12:20:00Z' }],
  });
  assert.deepEqual(result.uncertaintyBudget.counts, {
    KNOWN: 1, UNKNOWN: 1, UNKNOWN_BUT_ACCEPTABLE: 1, UNKNOWN_BLOCKING_ACTION: 1,
    UNKNOWN_BEING_COLLECTED: 1, UNKNOWN_CURRENTLY_UNOBTAINABLE: 1,
  });
  assert.equal(result.uncertaintyBudget.items.find((item) => item.id === 'unknown:terminal').terminalReason, 'No partner interface is configured.');
  assert.equal(result.uncertaintyBudget.items.find((item) => item.id === 'unknown:blocking').nextStep, 'CREATE_OR_UPDATE_INFORMATION_REQUIREMENT');
});

test('Unknown-Unknown Sentinel emits indicator-only anomalies with explicit resolution state', () => {
  const result = projectUnknownUnknownSentinel({
    incident: { id: 'fire:one', priorityState: 'P1' },
    intelligence: { situation: { state: 'PHYSICAL_REPORT_CONFLICT', contradictingEvidenceIds: ['evidence:a', 'evidence:b'] } },
    sourceStates: [{ sourceId: 'provider:firms', state: 'READY', nextExpectedAt: '2026-09-04T11:30:00Z', lastObservationAt: '2026-09-04T11:00:00Z' }],
    assignments: [{ assignmentId: 'assignment:one', state: 'ASSIGNED', acknowledgementDueAt: '2026-09-04T11:45:00Z' }],
    requiredContext: { roads: { required: true, available: false, reason: 'No governed road context.' }, weather: { required: true, available: false } },
    protection: { thresholdReached: true, authorityItem: null, thresholdEvidenceIds: ['threshold:one'] },
    resolutionWork: [{ id: 'task:provider', state: 'IN_PROGRESS', sourceId: 'provider:firms', ownerId: 'resolver:one', nextCheckAt: '2026-09-04T12:10:00Z' }],
    asOf: at,
  });
  const types = new Set(result.anomalies.map((item) => item.type));
  for (const type of ['EXPECTED_PROVIDER_SILENT', 'ATTRIBUTABLE_SOURCE_CONFLICT', 'RESOURCE_ACKNOWLEDGEMENT_MISSING', 'HIGH_PRIORITY_INCIDENT_WITHOUT_OWNER', 'ROADS_CONTEXT_MISSING', 'WEATHER_CONTEXT_MISSING', 'PROTECTION_THRESHOLD_WITHOUT_AUTHORITY_ITEM']) assert.equal(types.has(type), true, type);
  assert.equal(result.anomalies.every((item) => item.truthEffect === 'NONE' && item.state === 'OPEN_INDICATOR'), true);
  assert.equal(result.anomalies.find((item) => item.type === 'EXPECTED_PROVIDER_SILENT').currentWork.id, 'task:provider');
});

test('Sentinel detects attributable thermal disappearance and official-stale versus satellite-active without inferring extinction or confirmation', () => {
  const result = projectUnknownUnknownSentinel({
    incident: { id: 'fire:one', priorityState: 'P2', owner: 'commander:one' },
    sourceStates: [
      { sourceId: 'cap-authority', familyClass: 'OFFICIAL', state: 'STALE', healthEventId: 'health:cap-stale', lastSuccessAt: '2026-09-04T10:00:00Z' },
      { sourceId: 'nasa-firms', familyClass: 'PHYSICAL', familyId: 'physical.viirs', state: 'ACTIVE', lastPositiveAt: '2026-09-04T11:10:00Z', lastPositiveObservationId: 'thermal:positive', latestObservationAt: '2026-09-04T11:40:00Z', latestObservationState: 'NO_DETECTION', latestObservationId: 'thermal:zero', lastCompletedOpportunityAt: '2026-09-04T11:40:00Z', latestOpportunityId: 'opportunity:viirs', expectedCadenceMs: 30 * 60_000 },
      { sourceId: 'future-clock-source', familyClass: 'PHYSICAL', familyId: 'physical.satellite', state: 'ACTIVE', lastObservationAt: '2026-09-04T12:30:00Z', healthEventId: 'health:future' },
    ],
    asOf: at,
  });
  const thermal = result.anomalies.find((item) => item.type === 'THERMAL_SIGNAL_DISAPPEARED');
  assert.ok(thermal);
  assert.match(thermal.reason, /does not establish fire extinction/i);
  assert.deepEqual(thermal.evidenceReferences, ['opportunity:viirs', 'thermal:positive', 'thermal:zero']);
  const disagreement = result.anomalies.find((item) => item.type === 'OFFICIAL_FEED_STALE_WHILE_SATELLITE_ACTIVE');
  assert.ok(disagreement);
  assert.match(disagreement.reason, /cannot substitute for official confirmation/i);
  assert.ok(result.anomalies.some((item) => item.type === 'SOURCE_STATE_FUTURE_DATED'));
  assert.equal(result.anomalies.every((item) => item.truthEffect === 'NONE'), true);
});

test('full Crisis Autopilot projection binds the living twin and segregates active work from proposals', () => {
  const input = {
    asOf: at,
    incident: { id: 'fire:one', label: 'Governed incident', priorityState: 'P1', coordinate: [-8, 40], observations: [{ id: 'thermal:one', type: 'THERMAL', observedAt: '2026-09-04T11:50:00Z' }] },
    intelligence: { snapshotVersion: 'intelligence:one', projectionHash: 'intelligence:hash', mode: 'LIVE', situation: { state: 'SINGLE_FAMILY_PHYSICAL_SIGNAL', underlyingState: 'SINGLE_FAMILY_PHYSICAL_SIGNAL', freshness: 'CURRENT', why: { independentPhysicalFamilies: ['VIIRS'] } }, unknowns: [{ id: 'unknown:road', whatIsUnknown: 'Northern road passability', classification: 'DECISION_BLOCKING', strongerClaimBlocked: 'ROUTE_SELECTION' }] },
    decisionPacket,
    decisionContexts,
    candidateAcquisitions: [candidate()],
    evidenceRequests: [{ id: 'task:road', incidentId: 'fire:one', evidenceNeedId: 'unknown:road', candidateId: 'candidate:field-road', state: 'IN_PROGRESS', title: 'Verify northern road', ownerId: 'observer:one', sourceId: 'FIELDNET', updatedAt: '2026-09-04T11:55:00Z', nextCheckAt: '2026-09-04T12:15:00Z', unlockCondition: 'Route selection may be reviewed.' }],
    informationRequirements: [{ id: 'unknown:road', incidentId: 'fire:one', state: 'REQUEST_ACTIVE', missingQuantity: 'NORTHERN_ROAD_PASSABILITY' }],
    triggers: [{ id: 'trigger:thermal', type: 'NEW_THERMAL_DETECTION', observedAt: '2026-09-04T11:50:00Z', evidenceReferences: ['thermal:one'] }],
    contexts: { terrain: { state: 'GOVERNED', elevationM: 421 } },
    nearMisses: [{ id: 'near-miss:one', lesson: 'Keep alternate access independently verified.' }],
    preventionRecommendations: [{ id: 'prevention:one', recommendation: 'Review vegetation management at the access chokepoint.' }],
    recommendations: [{ id: 'recommendation:protect', decisionId: 'decision:protect', recommendation: 'Prepare warning draft for authority review', evidenceValidUntil: '2026-09-04T12:30:00Z', invalidatingConditions: ['NEW_EVIDENCE'] }],
  };
  const before = structuredClone(input), first = projectCrisisAutopilot(input), second = projectCrisisAutopilot(input);
  assert.deepEqual(input, before);
  assert.equal(first.projectionHash, second.projectionHash);
  assert.equal(first.livingTwin.incidentId, 'fire:one');
  assert.equal(first.livingTwin.terrain.state, 'AVAILABLE');
  assert.equal(first.livingTwin.weather.state, 'UNAVAILABLE');
  assert.equal(first.livingTwin.thermal.value[0].id, 'thermal:one');
  assert.equal(first.livingTwin.nearMisses.value[0].id, 'near-miss:one');
  assert.equal(first.livingTwin.prevention.value[0].id, 'prevention:one');
  assert.equal(first.autopilot.doingNow.length, 1);
  assert.equal(first.autopilot.doingNow[0].backingObjectIds[0], 'task:road');
  assert.equal(first.autopilot.nextActions.every((item) => item.executionState === 'PROPOSED' && item.canonicalTruthMutation === false && item.consequentialExecution === false), true);
  assert.equal(first.autopilot.mutationsExecuted, false);
  assert.equal(first.truthBoundary.unknownIsNotNegative, true);
  assert.equal(first.commandStaff.advisories.every((item) => item.canMutateCanonicalTruth === false && item.canApproveAuthority === false && item.canClaimExecution === false), true);
  const council = first.decisionCouncil.items.find((item) => item.decisionId === 'decision:protect');
  assert.equal(first.decisionCouncil.schemaVersion, 'vigia.adversarial-decision-council.v2');
  assert.equal(council.finalRecommendationState, 'ADVISORY_VALID_WITHIN_WINDOW');
  assert.equal(council.missingReviews.length, 0);
  assert.equal(council.counterargument.content, 'Preparing now may outrun delivery and authority evidence.');
});

test('decision council withholds its final recommendation until every explicit review is complete', () => {
  const base = structuredClone(decisionContexts[0]);
  for (const missing of ['counterargument', 'evidence', 'authority', 'safety', 'delay', 'alternatives']) {
    const context = structuredClone(base); delete context.councilReviews[missing];
    const projection = projectCrisisAutopilot({ asOf: at, incident: { id: 'fire:one' }, decisionPacket: { decisions: { results: [decisionPacket.decisions.results[0]] } }, decisionContexts: [context], recommendations: [{ decisionId: 'decision:protect', recommendation: context.recommendedAction, evidenceValidUntil: '2026-09-04T12:30:00Z', invalidatingConditions: ['NEW_EVIDENCE'] }] });
    const item = projection.decisionCouncil.items[0];
    assert.equal(item.finalRecommendation, null, missing);
    assert.equal(item.finalRecommendationState, 'WITHHELD_INCOMPLETE_COUNCIL_TUPLE', missing);
    assert.ok(item.missingReviews.length === 1, missing);
  }
  const future = structuredClone(base); future.councilReviews.safety.reviewedAt = '2026-09-04T12:01:00Z';
  const projected = projectCrisisAutopilot({ asOf: at, incident: { id: 'fire:one' }, decisionPacket: { decisions: { results: [decisionPacket.decisions.results[0]] } }, decisionContexts: [future], recommendations: [{ decisionId: 'decision:protect', recommendation: future.recommendedAction, evidenceValidUntil: '2026-09-04T12:30:00Z', invalidatingConditions: ['NEW_EVIDENCE'] }] });
  assert.equal(projected.decisionCouncil.items[0].finalRecommendation, null);
  assert.ok(projected.decisionCouncil.items[0].safetyReview.missing.includes('REVIEW_TIME_INVALID_OR_FUTURE'));
});
