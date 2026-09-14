import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTOR, AT, INCIDENT_ID, OperationalPeriodService, ProtectionWorkflowService, SCENARIO_NAMES,
  activeCollection, autopilot, buildHumanAttention, buildResponseCapabilityProjection, candidate,
  createFieldObserver, createFieldTaskAcknowledgement, createFieldTaskCompletion,
  createFieldVerificationTask, createStructuredFieldReport, emitGoldenReceipt, hospital,
  decisionPacket, normalizeDynamicCapacity, projectCrisisPlanning, reachability, repository, station,
} from './anduril-crisis-os-golden-fixture.mjs';

test(SCENARIO_NAMES.GOLDEN_6, async (t) => {
  const machineTasks = Array.from({ length: 25 }, (_, index) => activeCollection({
    id: `task:golden:alternative:${index}`, sourceId: index === 0 ? 'provider:firms' : `provider:alternative:${index}`,
    title: `Alternative source collection ${index}`, candidateId: `candidate:golden:${index}`
  }));
  const projected = autopilot({
    sourceStates: [{ sourceId: 'provider:firms', state: 'READY', nextExpectedAt: '2026-09-04T11:30:00.000Z', lastObservationAt: '2026-09-04T11:00:00.000Z' }],
    collectionTasks: machineTasks,
    decisionPacket: decisionPacket([{ decisionId: 'decision:golden:provider', state: 'BLOCKED_BY_EVIDENCE', blockers: [{ category: 'EVIDENCE', code: 'PROVIDER_SILENT' }], actionsUnlocked: [], blockedActions: ['INCIDENT_REVISION'], authorityRequirement: null, consequential: true }]),
    decisionDefinitions: [{ decisionId: 'decision:golden:provider', consequenceClass: 'OPERATIONAL', humanDecisionRequired: true }],
    decisionContexts: [{ decisionId: 'decision:golden:provider', consequenceClass: 'OPERATIONAL', humanDecisionRequired: true, consequenceOfDelay: 'Incident revision remains blocked.', whyNow: 'The expected provider update is overdue.' }]
  });
  const anomaly = projected.sentinel.anomalies.find((item) => item.type === 'EXPECTED_PROVIDER_SILENT');
  assert.ok(anomaly);
  assert.equal(anomaly.truthEffect, 'NONE');
  assert.ok(anomaly.currentWork);
  assert.equal(projected.decisionCompression.missedRequiredHumanDecisions.length, 0);
  assert.ok(projected.decisionCompression.machineToHumanConversionPercent < 5);
  const attention = buildHumanAttention([{ jobId: 'resolver:golden:provider', incidentId: INCIDENT_ID, selectedSourceId: 'provider:firms', state: 'ESCALATED', providerHealth: 'SILENT', lastResult: { failureClass: 'EXPECTED_PROVIDER_SILENT' }, deadlineAt: '2026-09-04T11:45:00.000Z', nextCheckAt: '2026-09-04T12:05:00.000Z', lastCheckAt: '2026-09-04T11:55:00.000Z', decisionImpact: 'Incident revision is materially blocked.', escalation: { state: 'ESCALATED' } }], { generatedAt: AT });
  assert.equal(attention.items.length, 1);
  assert.ok(attention.items[0].consequenceOfDelay);
  await emitGoldenReceipt(t, {
    scenarioId: 'GOLDEN_6', service: 'projectCrisisAutopilot + buildHumanAttention', before: { providerState: 'READY', tasks: [] }, after: { projected, attention },
    transitions: [
      { objectType: 'PROVIDER_STATE', objectId: 'provider:firms', fromState: 'READY', toState: anomaly.type },
      { objectType: 'COLLECTION_TASK_SET', objectId: INCIDENT_ID, fromState: 'NO_ALTERNATIVE_TASK', toState: 'ALTERNATIVE_SOURCE_TASK_PRESENT' },
      { objectType: 'HUMAN_ATTENTION', objectId: attention.items[0].attentionId ?? 'attention:golden:provider', fromState: 'ABSENT', toState: attention.items[0].state ?? 'REQUIRED' }
    ],
    claims: ['PROVIDER_SILENCE_DETECTED', 'ALTERNATIVE_SOURCE_TASK_PRESENT', 'MATERIAL_HUMAN_ATTENTION_PRESENT']
  });
});

test(SCENARIO_NAMES.GOLDEN_7, async (t) => {
  const projected = autopilot({
    intelligence: {
      mode: 'CONTROLLED_TEST_FIXTURE', snapshotVersion: 'snapshot:conflict', projectionHash: 'fixture:not-production:conflict',
      situation: { state: 'PHYSICAL_REPORT_CONFLICT', underlyingState: 'PHYSICAL_REPORT_CONFLICT', freshness: 'CURRENT', contradictingEvidenceIds: ['field:golden:open', 'satellite:golden:conflict'] },
      unknowns: [{ id: 'unknown:golden:conflict', whatIsUnknown: 'Which attributable observation reflects the current road state?', classification: 'DECISION_BLOCKING', strongerClaimBlocked: 'ROUTE_SELECTION' }]
    },
    collectionTasks: [activeCollection({ id: 'task:golden:conflict', evidenceNeedId: 'unknown:golden:conflict', title: 'Resolve source conflict', sourceId: 'SOURCE_CONFLICT' })]
  });
  const anomaly = projected.sentinel.anomalies.find((item) => item.type === 'ATTRIBUTABLE_SOURCE_CONFLICT');
  assert.ok(anomaly);
  assert.deepEqual(anomaly.evidenceReferences, ['field:golden:open', 'satellite:golden:conflict']);
  assert.equal(anomaly.truthEffect, 'NONE');
  assert.equal(projected.livingTwin.truth.value.situation.state, 'PHYSICAL_REPORT_CONFLICT');
  assert.equal(projected.uncertaintyBudget.items[0].state, 'UNKNOWN_BEING_COLLECTED');
  assert.ok(projected.autopilot.nextActions.some((item) => item.actionType === 'RANK_CONFLICT_RESOLUTION_COLLECTION'));
  await emitGoldenReceipt(t, {
    scenarioId: 'GOLDEN_7', service: 'projectCrisisAutopilot', before: { situation: 'UNASSESSED', collection: 'ABSENT' }, after: projected,
    transitions: [
      { objectType: 'INCIDENT_SITUATION', objectId: INCIDENT_ID, fromState: 'UNASSESSED', toState: projected.livingTwin.truth.value.situation.state },
      { objectType: 'UNCERTAINTY_COLLECTION', objectId: 'unknown:golden:conflict', fromState: 'NOT_COLLECTING', toState: projected.uncertaintyBudget.items[0].state }
    ],
    claims: ['SOURCE_CONFLICT_PRESERVED', 'TARGETED_COLLECTION_PRESENT', 'FAKE_CONSENSUS_FALSE']
  });
});
