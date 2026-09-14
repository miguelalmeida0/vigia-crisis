import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTOR, AT, INCIDENT_ID, OperationalPeriodService, ProtectionWorkflowService, SCENARIO_NAMES,
  activeCollection, autopilot, buildHumanAttention, buildResponseCapabilityProjection, candidate,
  createFieldObserver, createFieldTaskAcknowledgement, createFieldTaskCompletion,
  createFieldVerificationTask, createStructuredFieldReport, emitGoldenReceipt, hospital,
  normalizeDynamicCapacity, projectCrisisPlanning, reachability, repository, station,
} from './anduril-crisis-os-golden-fixture.mjs';

test(SCENARIO_NAMES.GOLDEN_PLANNING, async (t) => {
  const capacity = normalizeDynamicCapacity('FIRE_STATION', {
    state: 'FIELD_REPORTED', admitted: true, admissionReference: 'admission:golden:planning-capacity', observedAt: '2026-09-04T11:58:00.000Z',
    source: { name: 'Trusted FieldNet fixture', reference: 'field-report:golden:planning-capacity' }, crewsAvailable: 2, wildfireCrewsAvailable: 2, enginesAvailable: 1, tankersAvailable: 1
  }, { now: new Date(AT) });
  const responseCapability = buildResponseCapabilityProjection({
    incident: { id: INCIDENT_ID, coordinate: [-8.61, 41.15], truthState: 'DETECTION_CANDIDATE' }, generatedAt: AT,
    facilitiesByKind: { FIRE_STATION: [station('station:golden:planning', 18, capacity)], HOSPITAL: [hospital('hospital:golden:planning', 24)] },
    roadContext: {
      state: 'FIELD_REPORTED', source: { provider: 'FieldNet fixture', reference: 'report:golden:road-closure' },
      closures: [{ id: 'closure:golden:N2', segmentIds: ['road:N2'], updatedAt: '2026-09-04T11:59:00.000Z', source: { id: 'fieldnet:golden', reference: 'report:golden:road-closure' } }]
    }
  });
  const message = {
    whatHappened: 'Exercise wildfire scenario.', where: 'Golden exercise area.', whoIsAffected: 'Exercise participants.',
    whatToDo: 'Follow exercise controller instructions.', whatNotToDo: 'Do not treat this as a public warning.',
    when: 'During the controlled exercise.', authority: 'Exercise authority only.', nextUpdate: 'At the next exercise inject.'
  };
  const translations = Object.fromEntries(['en', 'es', 'de'].map((language) => [language, {
    message, translator: `exercise-translator:${language}`, reference: `fixture:translation:${language}`
  }]));
  const input = {
    asOf: AT,
    incident: { id: INCIDENT_ID, label: 'Isolated golden planning incident', coordinate: [-8.61, 41.15], truthState: 'DETECTION_CANDIDATE' },
    contexts: {
      communities: [{ id: 'community:golden', label: 'Golden community', coordinate: [-8.60, 41.16], updatedAt: '2026-09-04T11:45:00.000Z', source: { id: 'governed-context:golden', reference: 'fixture:community:golden' } }],
      roads: [{ id: 'road:N2', label: 'N2', coordinate: [-8.605, 41.155], operationalState: 'CLOSED', updatedAt: '2026-09-04T11:59:00.000Z', source: { id: 'fieldnet:golden', reference: 'report:golden:road-closure' } }],
      shelters: [{ id: 'shelter:golden', label: 'Golden shelter', coordinate: [-8.58, 41.17], operationalState: 'OPEN_CONFIRMED', updatedAt: '2026-09-04T11:50:00.000Z', source: { id: 'municipality:golden', reference: 'fixture:shelter:golden' } }]
    },
    responseCapability,
    modelClaims: [
      { id: 'claim:golden:field', topic: 'ROAD_ACCESS', subjectId: 'road:N2', value: 'CLOSED', observedAt: '2026-09-04T11:59:00.000Z', source: { id: 'fieldnet:golden', reference: 'report:golden:road-closure' }, decisionConsequence: 'The current response route may be unusable.' },
      { id: 'claim:golden:map', topic: 'ROAD_ACCESS', subjectId: 'road:N2', value: 'OPEN', observedAt: '2026-09-04T11:40:00.000Z', source: { id: 'road-source:golden', reference: 'fixture:road-map:golden' }, nextStep: 'Acquire a second current road observation.' }
    ],
    reconciliation: [{
      id: 'estimate:golden:eta', modelId: 'routing:golden', expectedValue: 12, generatedAt: '2026-09-04T11:30:00.000Z',
      observedValue: 18, observedAt: '2026-09-04T11:58:00.000Z', source: { id: 'fieldnet:golden', reference: 'report:golden:arrival' },
      unit: 'minutes', why: 'Recorded closure changed travel time.', decisionConsequence: 'Use the current routed alternative.'
    }],
    commandIntent: { intent: 'Keep exercise community access open.', intentType: 'KEEP_ACCESS_OPEN', target: 'road:N2', requestedBy: 'operator:golden', owner: 'planning:golden', requestedAt: AT, deadline: '2026-09-04T13:00:00.000Z', periodStart: AT, periodEnd: '2026-09-04T16:00:00.000Z' },
    operationalPeriodProposal: {
      id: 'period-proposal:golden', periodStart: AT, periodEnd: '2026-09-04T16:00:00.000Z',
      objectives: [{ id: 'objective:golden:access', statement: 'Maintain exercise access awareness.', owner: 'planning:golden', deadline: '2026-09-04T13:00:00.000Z' }],
      tactics: [{ id: 'tactic:golden:verify', statement: 'Verify the alternative route.', owner: 'operations:golden', deadline: '2026-09-04T12:30:00.000Z' }],
      assignments: [{ id: 'assignment:golden:verify', statement: 'Review the governed route report.', owner: 'operations:golden', deadline: '2026-09-04T12:20:00.000Z' }],
      resourceNeeds: [{ id: 'resource-need:golden', statement: 'Review one eligible fire facility.', owner: 'logistics:golden', deadline: '2026-09-04T12:25:00.000Z' }],
      decisionGates: [{ id: 'decision-gate:golden', statement: 'Approve the proposed route change.', owner: 'commander:golden', deadline: '2026-09-04T12:15:00.000Z' }],
      communications: [{ id: 'communications:golden', source: { id: 'exercise-radio:golden', reference: 'fixture:communications:golden' } }],
      safetyConstraints: [{ id: 'safety:golden', constraint: 'No public tasking toward the hazard.', authority: 'exercise:golden' }]
    },
    taskRequirements: [{ id: 'requirement:golden:resource', requiredKind: 'FIRE_STATION', requiredResourceType: 'WILDFIRE_CREWS', requiredQuantity: 1, owner: 'logistics:golden', deadline: '2026-09-04T12:30:00.000Z', proposedAction: 'Review alternative fire response.' }],
    incidentScenario: { id: 'scenario:golden', admitted: true, admissionReference: 'admission:scenario:golden', validUntil: '2026-09-04T14:00:00.000Z', source: { id: 'scenario-source:golden', reference: 'fixture:scenario:golden' } },
    evacuation: {
      decisionDeadline: '2026-09-04T12:20:00.000Z', assumptions: ['Exercise scenario only.'],
      terrainConstraints: [{ id: 'terrain:golden', state: 'CLEAR', updatedAt: '2026-09-04T11:58:00.000Z', source: { id: 'terrain:golden', reference: 'fixture:terrain:golden' } }],
      weatherConstraints: [{ id: 'weather:golden', state: 'CLEAR', updatedAt: '2026-09-04T11:58:00.000Z', source: { id: 'weather:golden', reference: 'fixture:weather:golden' } }],
      resourceConstraints: [{ id: 'resource:golden', state: 'AVAILABLE', updatedAt: '2026-09-04T11:58:00.000Z', source: { id: 'resource:golden', reference: 'fixture:resource:golden' } }],
      routeCandidates: [
        { id: 'route:golden:blocked', communityId: 'community:golden', shelterId: 'shelter:golden', segmentIds: ['road:N2'], currentState: 'OPEN_CONFIRMED', travelTimeMinutes: 9, updatedAt: '2026-09-04T11:58:00.000Z', source: { id: 'routing:golden', reference: 'fixture:route:blocked' } },
        { id: 'route:golden:open', communityId: 'community:golden', shelterId: 'shelter:golden', segmentIds: ['road:N3'], currentState: 'OPEN_CONFIRMED', travelTimeMinutes: 14, updatedAt: '2026-09-04T11:58:00.000Z', source: { id: 'routing:golden', reference: 'fixture:route:open' } }
      ]
    },
    protectionScenario: {
      id: 'protection-scenario:golden', admitted: true, admissionReference: 'admission:protection:golden', validUntil: '2026-09-04T14:00:00.000Z',
      source: { id: 'scenario-source:golden', reference: 'fixture:protection-scenario:golden' },
      windows: [15, 30, 60, 120].map((minutes) => ({ minutes, scenarioExposure: { communityId: 'community:golden', state: 'EXERCISE_SCENARIO' }, confidence: { state: 'NOT_SCORED', score: null }, requiredPreparation: ['Exercise preparation only.'], decisionDeadline: '2026-09-04T12:20:00.000Z', evidenceReferences: [`fixture:scenario-window:${minutes}`], computedAt: '2026-09-04T11:59:00.000Z', calculationMethod: 'CERTIFIED_EXERCISE_SCENARIO_WINDOW' }))
    },
    protectionMessage: { id: 'message:golden', canonicalLanguage: 'pt', canonicalMessage: message, sourceReference: 'fixture:message:golden', translations },
    capProtection: {
      id: 'cap-protection:golden', mode: 'EXERCISE', authority: { id: 'exercise-authority:golden' }, events: [
        { id: 'cap-event:validate', action: 'VALIDATE', actorId: 'validator:golden', at: '2026-09-04T11:55:00.000Z', reference: 'fixture:validation:golden' },
        { id: 'cap-event:review', action: 'AUTHORITY_REVIEW', actorId: 'authority:golden', at: '2026-09-04T11:56:00.000Z', reference: 'fixture:review:golden' },
        { id: 'cap-event:approve', action: 'APPROVE', actorId: 'authority:golden', authorityId: 'exercise-authority:golden', authorized: true, at: '2026-09-04T11:57:00.000Z', reference: 'fixture:approval:golden' },
        { id: 'cap-event:exercise-send', action: 'EXERCISE_SEND', actorId: 'exercise-controller:golden', mode: 'EXERCISE', at: '2026-09-04T11:58:00.000Z', reference: 'fixture:exercise-send:golden' },
        { id: 'cap-event:receipt', action: 'RECEIPT', actorId: 'exercise-recipient:golden', receiptReference: 'fixture:receipt:golden', at: '2026-09-04T11:59:00.000Z', reference: 'fixture:receipt:golden' }
      ]
    },
    triggers: [{ id: 'trigger:golden:road', type: 'ROAD_CLOSURE', closureId: 'closure:golden:N2', affectedFacilityIds: ['station:old'], observedAt: '2026-09-04T11:59:00.000Z' }],
    replanning: {
      oldPlan: { assignments: [{ id: 'assignment:golden:response', requirementId: 'requirement:golden:resource', facilityId: 'station:old' }], evacuationCorridorId: 'route:golden:blocked' },
      proposedPlan: { assignments: [{ id: 'assignment:golden:response', requirementId: 'requirement:golden:resource', facilityId: 'station:golden:planning' }], evacuationCorridorId: 'route:golden:open' },
      reasons: ['The recorded closure invalidated the prior route.']
    }
  };
  const projection = projectCrisisPlanning(input);
  assert.deepEqual(projection, projectCrisisPlanning(structuredClone(input)), 'planning projection must be deterministic for the same governed inputs and clock');
  assert.equal(projection.schemaVersion, 'vigia.crisis-planning-projection.v1');
  assert.equal(projection.dynamicExposureGraph.basis, 'POINT_PROXIMITY');
  assert.ok(projection.dynamicExposureGraph.edges.every((edge) => edge.perimeterUsed === false && edge.exposureState === 'PRELIMINARY_CONTEXT_ONLY'));
  assert.ok(projection.crisisDependencyGraph.edges.every((edge) => ['SCENARIO', 'OBSERVED'].includes(edge.basis)));
  assert.equal(projection.modelDisagreement.disagreements[0].valuesAveraged, false);
  assert.equal(projection.realityReconciliation.items[0].delta.value, 6);
  assert.equal(projection.commandIntent.humanConfirmationRequired, true);
  assert.equal(projection.commandIntent.mutationsExecuted, false);
  assert.equal(projection.operationalPeriodProposal.humanApprovalRequired, true);
  assert.equal(projection.resourceOptimizer.dispatchClaimed, false);
  assert.equal(projection.resourceOptimizer.recommendations[0].facilityId, 'station:golden:planning');
  assert.equal(projection.evacuationCorridor.state, 'READY_FOR_AUTHORITY_REVIEW', JSON.stringify(projection.evacuationCorridor));
  assert.equal(projection.evacuationCorridor.recommendedCorridor.routeId, 'route:golden:open');
  assert.equal(projection.evacuationCorridor.officialOrder, false);
  assert.deepEqual(projection.protectionTimeline.windows.map((window) => window.minutes), [15, 30, 60, 120]);
  assert.equal(projection.protectionTimeline.deterministic, false);
  assert.deepEqual(projection.multilingualProtectionComposer.readyLanguages, ['pt', 'en', 'es', 'de']);
  assert.equal(projection.multilingualProtectionComposer.translationsGenerated, false);
  assert.equal(projection.capProtection.currentState, 'RECEIPT_RECORDED');
  assert.equal(projection.capProtection.liveSendEnabled, false);
  assert.equal(projection.autonomousReplanning.state, 'NEW_PLAN_READY_FOR_APPROVAL');
  assert.equal(projection.autonomousReplanning.requiresApproval, true);
  assert.equal(projection.autonomousReplanning.mutationExecuted, false);
  assert.equal(projection.truthBoundary.automaticCanonicalMutation, false);
  assert.equal(projection.truthBoundary.automaticConsequentialExecution, false);
  await emitGoldenReceipt(t, {
    scenarioId: 'GOLDEN_PLANNING', service: 'projectCrisisPlanning', before: { commandIntent: input.commandIntent, planState: 'NOT_COMPILED' }, after: projection,
    transitions: [
      { objectType: 'COMMAND_INTENT', objectId: INCIDENT_ID, fromState: 'CONFIRMED_INPUT', toState: projection.commandIntent.state },
      { objectType: 'CRISIS_PLAN', objectId: 'period-proposal:golden', fromState: 'NOT_COMPILED', toState: projection.autonomousReplanning.state },
      { objectType: 'CAP_WORKFLOW', objectId: 'cap-protection:golden', fromState: 'DRAFT', toState: projection.capProtection.currentState }
    ],
    claims: ['COMMAND_INTENT_CONFIRMATION_REQUIRED', 'AUTHORITY_REVIEW_REQUIRED', 'DISPATCH_FALSE', 'AUTOMATIC_MUTATION_FALSE']
  });
});

test('response capacity projection keeps unknown capacity in requirements and excludes PII after admission', async () => {
  const unknownProjection = buildResponseCapabilityProjection({
    incident: { id: INCIDENT_ID, coordinate: [-8.61, 41.15], truthState: 'VERIFIED_CURRENT' }, generatedAt: AT,
    facilitiesByKind: { FIRE_STATION: [station('station:golden', 18)], HOSPITAL: [hospital('hospital:golden', 24)] },
    decisionContext: { fireCapacityRequired: true, medicalCapacityRequired: true },
    sourceAvailability: { fieldNetFireCapacity: 'CONNECTED', fieldNetHospitalCapacity: 'CONNECTED' }
  });
  assert.equal(unknownProjection.reachabilityBands.state, 'ROAD_ROUTING_AVAILABLE');
  assert.equal(unknownProjection.informationRequirements.length, 2);
  assert.ok(unknownProjection.informationRequirements.every((item) => item.collectionPlan.strategies.some((strategy) => strategy.collectorType === 'FIELDNET_TASK')));
  assert.ok(unknownProjection.optimizerInputs.candidates.every((item) => item.eligibleForDispatchRecommendation === false));

  const fireCapacity = normalizeDynamicCapacity('FIRE_STATION', {
    state: 'FIELD_REPORTED', admitted: true, admissionReference: 'admission:golden:fire', observedAt: '2026-09-04T11:58:00.000Z',
    source: { name: 'VIGIA FieldNet fixture', reference: 'field-report:golden:fire' }, crewsAvailable: 2, enginesAvailable: 1, tankersAvailable: 1,
    staffNames: ['must-not-project']
  }, { now: new Date(AT) });
  const hospitalCapacity = normalizeDynamicCapacity('HOSPITAL', {
    state: 'FIELD_REPORTED', admitted: true, admissionReference: 'admission:golden:hospital', observedAt: '2026-09-04T11:57:00.000Z',
    source: { name: 'VIGIA FieldNet fixture', reference: 'field-report:golden:hospital' }, acceptingPatients: true, bedsAvailable: 4,
    personalPhone: '+351000000000'
  }, { now: new Date(AT) });
  const updated = buildResponseCapabilityProjection({
    incident: { id: INCIDENT_ID, coordinate: [-8.61, 41.15], truthState: 'VERIFIED_CURRENT' }, generatedAt: AT,
    facilitiesByKind: { FIRE_STATION: [station('station:golden', 18, fireCapacity)], HOSPITAL: [hospital('hospital:golden', 24, hospitalCapacity)] },
    decisionContext: { fireCapacityRequired: true, medicalCapacityRequired: true }
  });
  assert.equal(updated.informationRequirements.length, 0);
  assert.ok(updated.optimizerInputs.candidates.every((item) => item.eligibleForDispatchRecommendation === true));
  assert.equal(updated.resourceOptimizer.state, 'ADVISORY_CANDIDATES_READY');
  assert.ok(updated.resourceOptimizer.recommendedStaging.every((item) => item.dispatchClaimed === false && item.requiresHumanApproval === true && item.validUntil));
  assert.doesNotMatch(JSON.stringify(updated), /must-not-project|personalPhone|staffNames/);
  assert.ok(updated.recommendations.every((item) => item.authority === 'PLANNING_SUPPORT_ONLY'));
  assert.match(updated.truthBoundary, /not dispatch/i);
});
