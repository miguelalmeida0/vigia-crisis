import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTOR, AT, INCIDENT_ID, OperationalPeriodService, ProtectionWorkflowService, SCENARIO_NAMES,
  activeCollection, autopilot, buildHumanAttention, buildResponseCapabilityProjection, candidate,
  createFieldObserver, createFieldTaskAcknowledgement, createFieldTaskCompletion,
  createFieldVerificationTask, createStructuredFieldReport, emitGoldenReceipt, hospital,
  normalizeDynamicCapacity, projectCrisisPlanning, reachability, repository, station,
} from './anduril-crisis-os-golden-fixture.mjs';

test(SCENARIO_NAMES.GOLDEN_3, async (t) => {
  const capacity = normalizeDynamicCapacity('FIRE_STATION', {
    state: 'FIELD_REPORTED', admitted: true, admissionReference: 'admission:golden:station', observedAt: '2026-09-04T11:58:00.000Z',
    source: { name: 'Trusted FieldNet fixture', reference: 'field-report:golden:station' }, crewsAvailable: 2, enginesAvailable: 1, tankersAvailable: 1
  }, { now: new Date(AT) });
  const before = buildResponseCapabilityProjection({
    incident: { id: INCIDENT_ID, coordinate: [-8.61, 41.15] }, generatedAt: AT,
    facilitiesByKind: { FIRE_STATION: [station('station:A', 11, capacity), station('station:B', 18, capacity)] }
  });
  const stationAClosed = station('station:A', 29, capacity);
  stationAClosed.reachability = reachability(29, 24, { roadClosureImpact: { state: 'CONFIRMED_CONTEXT', closures: ['road:N2:golden'] } });
  const after = buildResponseCapabilityProjection({
    incident: { id: INCIDENT_ID, coordinate: [-8.61, 41.15] }, generatedAt: AT,
    facilitiesByKind: { FIRE_STATION: [station('station:B', 18, capacity), stationAClosed] },
    roadContext: { state: 'FIELD_REPORTED', source: 'report:golden:road', closures: ['road:N2:golden'] }
  });
  assert.equal(before.recommendations[0].facilityId, 'station:A');
  assert.equal(after.recommendations[0].facilityId, 'station:B');
  assert.equal(after.recommendations[0].authority, 'PLANNING_SUPPORT_ONLY');
  const projected = autopilot({ triggers: [{ id: 'trigger:road:golden', type: 'ROAD_CLOSURE', observedAt: AT, evidenceReferences: ['report:golden:road'] }] });
  const actions = new Map(projected.autopilot.nextActions.map((item) => [item.actionType, item]));
  assert.ok(actions.has('RECOMPUTE_RESPONSE_REACHABILITY'));
  assert.ok(actions.has('REPLAN_OPERATIONS'));
  assert.equal(actions.get('REPLAN_OPERATIONS').executionState, 'PROPOSED');
  assert.equal(actions.get('REPLAN_OPERATIONS').consequentialExecution, false);
  assert.equal(projected.autopilot.consequentialActionsExecuted, false);
  await emitGoldenReceipt(t, {
    scenarioId: 'GOLDEN_3', service: 'buildResponseCapabilityProjection + projectCrisisAutopilot', before, after: { after, projected },
    transitions: [
      { objectType: 'ROUTED_FACILITY_RANK', objectId: INCIDENT_ID, fromState: before.recommendations[0].facilityId, toState: after.recommendations[0].facilityId },
      { objectType: 'OPERATIONS_PLAN', objectId: 'plan:golden:response', fromState: 'CURRENT', toState: actions.get('REPLAN_OPERATIONS').executionState }
    ],
    claims: ['ROUTE_ORDER_CHANGED', 'REPLAN_PROPOSED', 'CONSEQUENTIAL_EXECUTION_FALSE']
  });
});

test(SCENARIO_NAMES.GOLDEN_4, async (t) => {
  const store = repository({ protectionWorkflows: [], audit: [] });
  const initial = store.snapshot();
  const service = new ProtectionWorkflowService({ repository: store, clock: () => new Date(AT) });
  const created = await service.create(ACTOR, INCIDENT_ID, {
    workflowId: 'protect:golden', universe: 'EXERCISE', targetPopulationOrArea: { areaDesc: 'Isolated exercise area', geocode: [{ valueName: 'EXERCISE_ONLY', value: 'golden-area' }] },
    exposureAssessment: 'Controlled fixture threshold for a no-send exercise.', protectionThreshold: 'Controlled fixture threshold reached.',
    recommendation: 'Prepare an exercise warning; do not send.', authorityRequirement: 'Named exercise protection authority',
    authorityOwner: 'Exercise protection authority', authorityValidUntil: '2026-09-04T12:45:00.000Z', expiresAt: '2026-09-04T12:45:00.000Z',
    expectedPostcondition: 'Exercise warning draft validated without external delivery.', provenanceRefs: ['fixture:threshold:golden']
  });
  assert.equal(created.workflow.state, 'DRAFT');
  const review = await service.transition(ACTOR, INCIDENT_ID, created.workflow.workflowId, { state: 'REVIEW' });
  const approved = await service.transition(ACTOR, INCIDENT_ID, created.workflow.workflowId, { state: 'APPROVED' });
  const eligible = await service.transition(ACTOR, INCIDENT_ID, created.workflow.workflowId, { state: 'DISPATCH_ELIGIBLE' });
  const cap = service.capDraft(ACTOR, INCIDENT_ID, created.workflow.workflowId, {
    sender: 'exercise-authority@example.invalid', urgency: 'Immediate', severity: 'Severe', certainty: 'Possible',
    headline: 'Exercise wildfire protection notice', instruction: 'Exercise only. Take no public action.'
  });
  assert.equal(cap.cap.status, 'Exercise');
  assert.equal(cap.validation.valid, true);
  assert.equal(cap.transport.state, 'DISPATCH_DISABLED');
  assert.equal(cap.transport.exerciseDeliveryState, 'AVAILABLE');
  const delivered = await service.dispatchCap(ACTOR, INCIDENT_ID, created.workflow.workflowId, {
    exerciseAction: 'SEND',
    exerciseTarget: { type: 'EXERCISE_CONTROL', id: 'exercise-inbox:golden', label: 'Golden scenario isolated inbox' },
    idempotencyKey: 'golden:exercise-send', status: 'Exercise',
    sender: 'exercise-authority@example.invalid', urgency: 'Immediate', severity: 'Severe', certainty: 'Possible',
    headline: 'Exercise wildfire protection notice', instruction: 'Exercise only. Take no public action.'
  });
  assert.equal(delivered.workflow.state, 'EXERCISE_SENT');
  assert.equal(delivered.delivery.deliveryMode, 'ISOLATED_EXERCISE_REPOSITORY');
  assert.equal(delivered.delivery.productionTruth, false);
  assert.equal(delivered.delivery.externalTransportInvoked, false);
  assert.ok(delivered.receipt.receiptId);
  const acknowledged = await service.transition(ACTOR, INCIDENT_ID, created.workflow.workflowId, {
    state: 'ACKNOWLEDGED', source: 'Golden scenario exercise controller',
    receiptId: delivered.delivery.receiptId, idempotencyKey: 'golden:exercise-ack'
  });
  assert.equal(acknowledged.workflow.state, 'ACKNOWLEDGED');
  assert.equal(acknowledged.workflow.acknowledgement.receiptId, delivered.delivery.receiptId);
  assert.ok(acknowledged.receipt.receiptId);
  await assert.rejects(() => service.dispatchCap(ACTOR, INCIDENT_ID, created.workflow.workflowId, {
    urgency: 'Immediate', severity: 'Severe', certainty: 'Possible', headline: 'Exercise', instruction: 'Exercise only.', idempotencyKey: 'golden:live-dispatch-attempt'
  }), /isolated_exercise_target|exercise_target/);
  const projected = autopilot({ protection: { thresholdReached: true, thresholdEvidenceIds: ['fixture:threshold:golden'] } });
  assert.ok(projected.autopilot.nextActions.some((item) => item.actionType === 'PREPARE_PROTECTION_ACTION_FOR_AUTHORITY_REVIEW'));
  assert.equal(projected.truthBoundary.automaticAuthorityApproval, false);
  const final = store.snapshot();
  assert.equal(final.audit.length, 6);
  await emitGoldenReceipt(t, {
    scenarioId: 'GOLDEN_4', service: 'ProtectionWorkflowService', before: initial, after: final,
    transitions: [
      { objectType: 'PROTECTION_WORKFLOW', objectId: created.workflow.workflowId, fromState: 'ABSENT', toState: created.workflow.state, source: { kind: 'SERVICE_RECEIPT', reference: created.receipt.receiptId }, receiptReference: created.receipt.receiptId },
      { objectType: 'PROTECTION_WORKFLOW', objectId: created.workflow.workflowId, fromState: created.workflow.state, toState: review.workflow.state, source: { kind: 'SERVICE_RECEIPT', reference: review.receipt.receiptId }, receiptReference: review.receipt.receiptId },
      { objectType: 'PROTECTION_WORKFLOW', objectId: created.workflow.workflowId, fromState: review.workflow.state, toState: approved.workflow.state, source: { kind: 'SERVICE_RECEIPT', reference: approved.receipt.receiptId }, receiptReference: approved.receipt.receiptId },
      { objectType: 'PROTECTION_WORKFLOW', objectId: created.workflow.workflowId, fromState: approved.workflow.state, toState: eligible.workflow.state, source: { kind: 'SERVICE_RECEIPT', reference: eligible.receipt.receiptId }, receiptReference: eligible.receipt.receiptId },
      { objectType: 'PROTECTION_WORKFLOW', objectId: created.workflow.workflowId, fromState: eligible.workflow.state, toState: delivered.workflow.state, source: { kind: 'SERVICE_RECEIPT', reference: delivered.receipt.receiptId }, receiptReference: delivered.receipt.receiptId },
      { objectType: 'PROTECTION_WORKFLOW', objectId: created.workflow.workflowId, fromState: delivered.workflow.state, toState: acknowledged.workflow.state, source: { kind: 'SERVICE_RECEIPT', reference: acknowledged.receipt.receiptId }, receiptReference: acknowledged.receipt.receiptId }
    ],
    claims: ['CAP_DRAFT_VALIDATED', 'EXERCISE_SEND_RECEIPT', 'EXERCISE_ACKNOWLEDGEMENT_RECEIPT', 'TRANSITION_RECEIPTS_PERSISTED', 'LIVE_DISPATCH_REJECTED']
  });
});

test(SCENARIO_NAMES.GOLDEN_5, async (t) => {
  const store = repository({ operationalPeriods: [], operationalPeriodAfterActionPackages: [], audit: [] });
  const initial = store.snapshot();
  const service = new OperationalPeriodService({ repository: store, clock: () => new Date(AT) });
  const dueAt = '2026-09-04T16:00:00.000Z';
  const period = await service.start(ACTOR, {
    periodId: 'period:golden:partial', exerciseMode: true, executionMode: 'ISOLATED_GOLDEN_SCENARIO', participantType: 'AUTOMATED_TEST_FIXTURE',
    shift: 'Isolated golden outcome scenario', commander: 'Exercise commander', endsAt: dueAt,
    roles: [{ role: 'Incident Commander', person: 'Exercise role' }],
    authorityMatrix: [{ role: 'Incident Commander', capability: 'Approve isolated action', scope: 'CONTROLLED_EOC_EXERCISE' }],
    incidentOwners: [{ incidentId: INCIDENT_ID, owner: 'Exercise incident owner' }],
    objectives: [{ objectiveId: 'objective:golden', statement: 'Exercise an action-to-outcome chain.', owner: 'Exercise commander', dueAt }]
  });
  const recorded = [];
  const record = async (input) => { const output = await service.record(ACTOR, period.periodId, input); recorded.push({ input, output }); return output; };
  await record({ kind: 'OBJECTIVE_ACKNOWLEDGEMENT', objectiveId: 'objective:golden' });
  await record({ kind: 'TACTIC', tacticId: 'tactic:golden', incidentId: INCIDENT_ID, objectiveId: 'objective:golden', statement: 'Perform isolated verification action.', owner: 'Exercise operations lead' });
  await record({ kind: 'AUTHORITY_DECISION', decisionId: 'decision:golden', incidentId: INCIDENT_ID, statement: 'Approve the isolated action only.', owner: 'Exercise commander', authority: 'CONTROLLED_EOC_EXERCISE', dueAt, acknowledged: true, state: 'APPROVED' });
  await record({ kind: 'ASSIGNMENT', assignmentId: 'assignment:golden', incidentId: INCIDENT_ID, tacticId: 'tactic:golden', assignee: 'Exercise field role', resourceIds: ['resource:golden'], authorityDecisionId: 'decision:golden', dueAt });
  await record({ kind: 'RESOURCE_STATUS', resource: 'resource:golden', assigned: 1, available: 0, state: 'EXERCISE_ASSIGNED' });
  await record({ kind: 'ACTION', actionId: 'action:golden', incidentId: INCIDENT_ID, assignmentId: 'assignment:golden', statement: 'Observe the expected postcondition.', owner: 'Exercise field role', source: 'CONTROLLED_EOC_EXERCISE fixture', authorityDecisionId: 'decision:golden', dueAt, expectedPostcondition: 'The target condition fully resolves.', completionCriteria: 'Acknowledgement and observation are persisted.' });
  await record({ kind: 'ACKNOWLEDGEMENT', targetType: 'ASSIGNMENT', targetId: 'assignment:golden', role: 'Exercise field role' });
  await record({ kind: 'ASSIGNMENT_STATE', assignmentId: 'assignment:golden', state: 'IN_PROGRESS', reason: 'Acknowledged isolated assignment began.' });
  await record({ kind: 'ACKNOWLEDGEMENT', targetType: 'ACTION', targetId: 'action:golden', role: 'Exercise operations lead' });
  await record({ kind: 'ACTION_STATE', actionId: 'action:golden', state: 'COMPLETED', reason: 'Acknowledged isolated action completed; outcome remains unassessed.' });
  await record({ kind: 'ASSIGNMENT_STATE', assignmentId: 'assignment:golden', state: 'COMPLETED', reason: 'The assigned isolated action completed.' });
  await record({ kind: 'PROTECTION_ITEM', workflowId: 'protect:golden:no-send', incidentId: INCIDENT_ID, state: 'EXTERNAL_SEND_DISABLED', owner: 'Exercise protection authority', dueAt });
  await record({ kind: 'POSTCONDITION', postconditionId: 'postcondition:golden', incidentId: INCIDENT_ID, actionId: 'action:golden', statement: 'Only part of the target condition was observed.', observedState: 'PARTIAL', source: 'Isolated attributed fixture observation', observedAt: AT });
  await record({ kind: 'OUTCOME', outcomeId: 'outcome:golden', incidentId: INCIDENT_ID, actionId: 'action:golden', postconditionId: 'postcondition:golden', classification: 'PARTIAL', statement: 'The isolated observed postcondition was partial.', causalClaim: 'NOT_ESTABLISHED', evidenceIds: ['postcondition:golden'] });
  await record({ kind: 'AFTER_ACTION_FINDING', findingId: 'near-miss:golden', statement: 'Recheck the unresolved part before relying on the action.', owner: 'Exercise planning lead', dueAt });
  const handoff = await service.handoff(ACTOR, period.periodId, { from: 'Exercise commander', to: 'Incoming exercise commander', acknowledgedBy: 'Incoming exercise commander' });
  const closed = await service.close(ACTOR, period.periodId, { summary: 'Isolated partial-outcome golden scenario complete.' });
  assert.equal(closed.period.state, 'CLOSED');
  assert.equal(closed.afterActionPackage.outcomes[0].classification, 'PARTIAL');
  assert.equal(closed.afterActionPackage.outcomes[0].postconditionId, 'postcondition:golden');
  assert.equal(closed.afterActionPackage.afterActionFindings[0].findingId, 'near-miss:golden');
  assert.equal(closed.afterActionPackage.exerciseDeclaration.countsAsProductionOutcome, false);
  const final = store.snapshot();
  const fingerprintFor = (kind, predicate = () => true) => recorded.find((item) => item.input.kind === kind && predicate(item.input))?.output?.fingerprint;
  const transition = (objectType, objectId, fromState, toState, reference) => ({ objectType, objectId, fromState, toState, source: { kind: 'SERVICE_FINGERPRINT', reference }, receiptReference: reference });
  const serviceTransitions = [
    transition('OPERATIONAL_PERIOD', period.periodId, 'ABSENT', period.state, period.fingerprint),
    transition('OBJECTIVE', 'objective:golden', 'UNACKNOWLEDGED', 'ACKNOWLEDGED', fingerprintFor('OBJECTIVE_ACKNOWLEDGEMENT')),
    transition('TACTIC', 'tactic:golden', 'ABSENT', 'APPROVED', fingerprintFor('TACTIC')),
    transition('AUTHORITY_DECISION', 'decision:golden', 'ABSENT', 'APPROVED', fingerprintFor('AUTHORITY_DECISION')),
    transition('ASSIGNMENT', 'assignment:golden', 'ABSENT', 'ASSIGNED', fingerprintFor('ASSIGNMENT')),
    transition('RESOURCE_STATUS', 'resource:golden', 'ABSENT', 'EXERCISE_ASSIGNED', fingerprintFor('RESOURCE_STATUS')),
    transition('ACTION', 'action:golden', 'ABSENT', 'OPEN', fingerprintFor('ACTION')),
    transition('ASSIGNMENT_ACKNOWLEDGEMENT', 'assignment:golden', 'ABSENT', 'RECORDED', fingerprintFor('ACKNOWLEDGEMENT', (input) => input.targetType === 'ASSIGNMENT')),
    transition('ASSIGNMENT', 'assignment:golden', 'ASSIGNED', 'IN_PROGRESS', fingerprintFor('ASSIGNMENT_STATE', (input) => input.state === 'IN_PROGRESS')),
    transition('ACTION_ACKNOWLEDGEMENT', 'action:golden', 'ABSENT', 'RECORDED', fingerprintFor('ACKNOWLEDGEMENT', (input) => input.targetType === 'ACTION')),
    transition('ACTION', 'action:golden', 'OPEN', 'COMPLETED', fingerprintFor('ACTION_STATE')),
    transition('ASSIGNMENT', 'assignment:golden', 'IN_PROGRESS', 'COMPLETED', fingerprintFor('ASSIGNMENT_STATE', (input) => input.state === 'COMPLETED')),
    transition('PROTECTION_WORKFLOW_LINK', 'protect:golden:no-send', 'ABSENT', 'EXTERNAL_SEND_DISABLED', fingerprintFor('PROTECTION_ITEM')),
    transition('POSTCONDITION', 'postcondition:golden', 'ABSENT', 'PARTIAL_OBSERVED', fingerprintFor('POSTCONDITION')),
    transition('OUTCOME', 'outcome:golden', 'ABSENT', 'PARTIAL', fingerprintFor('OUTCOME')),
    transition('AFTER_ACTION_FINDING', 'near-miss:golden', 'ABSENT', 'OPEN', fingerprintFor('AFTER_ACTION_FINDING')),
    transition('HANDOFF', handoff.handoff.packageId, 'NOT_STARTED', handoff.handoff.state, handoff.handoff.fingerprint),
    transition('OPERATIONAL_PERIOD', period.periodId, 'ACTIVE', closed.period.state, closed.afterActionPackage.fingerprint)
  ];
  await emitGoldenReceipt(t, {
    scenarioId: 'GOLDEN_5', service: 'OperationalPeriodService', before: initial, after: final,
    transitions: serviceTransitions,
    claims: ['ACTION_ACKNOWLEDGED', 'POSTCONDITION_OBSERVED', 'PARTIAL_OUTCOME_PERSISTED', 'LESSON_PERSISTED', 'PRODUCTION_OUTCOME_FALSE']
  });
});

