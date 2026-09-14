import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { FieldNetService } from '../../field-node/src/service.mjs';
import { FieldNodeStore } from '../../field-node/src/sqlite-store.mjs';
import { createFieldIncidentPackage, sha256 } from '../../../packages/domain/src/fieldnet/contracts.mjs';
import { FieldCapacityReportProvider } from '../../../packages/domain/src/fieldnet/capacity-report-provider.mjs';
import { CentralFieldNetService } from '../src/modules/fieldnet/central-fieldnet-service.mjs';
import { FieldCapacityAdmissionService } from '../src/modules/fieldnet/field-capacity-admission-service.mjs';
import { buildResponseCapabilityProjection, normalizeDynamicCapacity, responseCapabilityMapLayers } from '../../../packages/domain/src/response-capability/index.mjs';
import { projectCrisisPlanning } from '../../../packages/domain/src/crisis-planning/index.mjs';
import { responseCapabilityPanel } from '../../operator-console/src/crisisOperatingSystem.js';
import './fieldnet-capacity-admission-golden.case.mjs';
import { assertDurableRecommendationReview } from './fieldnet-capacity-recommendation-review.case.mjs';

const NOW = new Date('2026-09-04T15:00:00Z');
const INCIDENT_ID = 'incident:capacity:golden';
const FIRE_EVIDENCE_HASH = sha256('fieldnet-fire-capacity-road-closure-golden-evidence');

test('road closure -> information requirement -> FieldNet station report -> admission -> optimizer -> UI/map contract', async (t) => {
  const route = (minutes, geometry, roadClosureImpact = { state: 'UNKNOWN', closures: [] }) => ({
    state: 'ROUTED',
    method: 'OSRM_ROAD_NETWORK',
    routeDistanceKm: minutes / 1.2,
    travelTimeMinutes: minutes,
    currentRoute: { travelTimeMinutes: minutes, distanceKm: minutes / 1.2, geometry, geometryState: 'AVAILABLE' },
    alternativeRoute: null,
    alternativeRouteState: 'NOT_RETURNED',
    roadClosureImpact,
    terrainAccessConstraints: { state: 'NOT_ROUTING_CONSTRAINED', constraints: [] },
    source: { provider: 'OSRM', reference: 'fixture:osrm:road-closure' },
    checkedAt: NOW.toISOString(),
    confidence: { state: 'CONTEXTUAL_ESTIMATE', score: null },
    reason: null
  });
  const station = (id, name, minutes, geometry, dynamicCapacity = normalizeDynamicCapacity('FIRE_STATION', null), { distanceKm = minutes / 2, roadClosureImpact } = {}) => ({
    id,
    kind: 'FIRE_STATION',
    name,
    coordinate: geometry.coordinates.at(-1),
    distanceKm,
    reachability: route(minutes, geometry, roadClosureImpact),
    staticCapability: { wildfireCapability: { state: 'KNOWN', value: true, sourceTag: 'service' } },
    provenance: {
      provider: 'OpenStreetMap contributors',
      sourceRecordId: id,
      archiveSha256: 'sha256:fixture-road-closure',
      retrievedAt: '2026-09-04T14:50:00Z'
    },
    freshness: { state: 'STATIC_SNAPSHOT', retrievedAt: '2026-09-04T14:50:00Z' },
    dynamicCapacity
  });
  const routeA = { type: 'LineString', coordinates: [[-8.61, 41.15], [-8.58, 41.13], [-8.55, 41.11]] };
  const routeB = { type: 'LineString', coordinates: [[-8.61, 41.15], [-8.64, 41.14], [-8.67, 41.12]] };
  const closedStation = station('station:closed', 'Station with closed route', 35, routeA, undefined, {
    distanceKm: 4,
    roadClosureImpact: {
      state: 'DEGRADED_BY_CLOSURE',
      closures: [{ id: 'closure:golden', segmentIds: ['segment:closed'] }],
      reason: 'The governed closure forces the retained 35-minute alternative road route.'
    }
  });
  const alternativeStation = station('station:alternative', 'Alternative station', 22, routeB, undefined, { distanceKm: 9 });
  const initial = buildResponseCapabilityProjection({
    incident: { id: INCIDENT_ID, coordinate: [-8.61, 41.15], truthState: 'VERIFIED_CURRENT' },
    generatedAt: NOW.toISOString(),
    facilitiesByKind: {
      FIRE_STATION: [
        closedStation,
        alternativeStation
      ]
    },
    decisionContext: { fireCapacityRequired: true },
    sourceAvailability: { fieldNetFireCapacity: 'CONNECTED' },
    roadContext: {
      state: 'FIELD_REPORTED',
      source: { id: 'fieldnet-road', reference: 'road-closure:golden' },
      closures: [{ id: 'closure:golden', affectedFacilityIds: ['station:closed'], segmentIds: ['segment:closed'], observedAt: '2026-09-04T14:57:00Z', source: { id: 'fieldnet-road', reference: 'road-closure:golden' } }]
    }
  });
  assert.equal([...initial.facilities.FIRE_STATION].sort((left, right) => left.distanceKm - right.distanceKm)[0].id, 'station:closed');
  assert.equal([...initial.facilities.FIRE_STATION].sort((left, right) => left.reachability.travelTimeMinutes - right.reachability.travelTimeMinutes)[0].id, 'station:alternative');
  assert.equal(initial.facilities.FIRE_STATION.find((item) => item.id === 'station:closed').reachability.roadClosureImpact.state, 'DEGRADED_BY_CLOSURE');
  const requirement = initial.informationRequirements.find((item) => item.subjectId === 'station:alternative');
  assert.ok(requirement);
  assert.equal(requirement.state, 'COLLECTION_PLANNED');
  assert.ok(requirement.collectionTasks.some((item) => item.strategyId === 'fieldnet-fire-capacity' && item.state === 'SCHEDULED'));

  const directory = await mkdtemp(path.join(process.cwd(), '.tmp/test/field-fire-capacity-golden-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const nodeId = 'field-node:fire-capacity-golden';
  const store = new FieldNodeStore({ filePath: path.join(directory, 'field.sqlite'), nodeId, clock: () => NOW });
  t.after(() => store.close());
  const field = new FieldNetService({ store, clock: () => NOW, incidentId: INCIDENT_ID });
  field.importPackage(createFieldIncidentPackage({ incidentId: INCIDENT_ID, createdAt: '2026-09-04T14:00:00Z' }), 'regional-vigia');
  field.registerDevice({
    deviceId: 'device:fire-capacity-golden', deviceType: 'PHONE', hardwareIdentity: 'hardware:fire-capacity-golden', ownerOperator: 'observer:fire-capacity-golden',
    capabilities: ['STRUCTURED_FIELD_REPORT', 'TASK_ACK'], timeQuality: 'SYNCED',
    observer: {
      observerId: 'observer:fire-capacity-golden', observerClass: 'AUTHORIZED_RESPONDER', verificationState: 'ROLE_ATTESTED',
      organizationId: 'fire-service:golden', attestationReference: 'attestation:fire-capacity-golden',
      attestedBy: 'field-control:fire-capacity-golden', attestedAt: '2026-09-04T13:00:00Z'
    }
  }, 'field-control:fire-capacity-golden');
  const task = field.createVerificationTask({
    taskId: 'task:fire-capacity-golden', incidentId: INCIDENT_ID,
    objective: 'Report aggregate station capacity through the authorized remote facility channel.',
    owner: 'team:fire-capacity', dueAt: '2026-09-04T15:30:00Z', acknowledgeBy: '2026-09-04T15:05:00Z',
    safeZoneConstraint: { mode: 'REMOTE_ONLY', instruction: 'Use only the authorized remote station channel.' },
    targetObserverClasses: ['AUTHORIZED_RESPONDER'], expectedReportTypes: ['FIRE_STATION_CAPACITY_UPDATE'],
    requiredEvidence: ['AGGREGATE_CAPACITY', 'ATTRIBUTABLE_SOURCE'], completionCriteria: 'One attributable aggregate station-capacity observation is persisted.',
    linkedInformationRequirementId: requirement.id
  }, 'field-control:fire-capacity-golden').task;
  field.acknowledgeVerificationTask(task.taskId, {
    taskVersion: task.version, deviceId: 'device:fire-capacity-golden', sessionId: 'session:fire-capacity-golden',
    disposition: 'ACCEPTED', safetyState: 'SAFE_TO_PROCEED'
  }, 'field-control:fire-capacity-golden');
  field.addStructuredReport({
    reportId: 'report:fire-capacity-golden', reportType: 'FIRE_STATION_CAPACITY_UPDATE', incidentId: INCIDENT_ID,
    deviceId: 'device:fire-capacity-golden', sessionId: 'session:fire-capacity-golden', linkedTaskId: task.taskId,
    observedAt: '2026-09-04T14:58:00Z', receivedAt: '2026-09-04T14:59:00Z', connectivityAtCapture: 'OFFLINE',
    geometry: { type: 'Point', coordinates: [-8.67, 41.12] }, horizontalUncertaintyM: 8, rawEvidenceHash: FIRE_EVIDENCE_HASH,
    structuredAnswers: {
      stationId: 'station:alternative', crewsAvailable: 2, crewSize: 5, enginesAvailable: 1, tankersAvailable: 1,
      estimatedMobilizationMinutes: 7, alreadyCommittedResources: { CREWS: 0 }, communicationsStatus: 'OPERATIONAL',
      nextExpectedUpdate: '2026-09-04T15:15:00Z'
    }
  }, 'field-control:fire-capacity-golden');
  field.completeVerificationTask(task.taskId, { taskVersion: store.task(task.taskId).version, evidenceObservationIds: ['report:fire-capacity-golden'] }, 'field-control:fire-capacity-golden');
  const localLifecycle = store.taskLifecycle(task.taskId);
  assert.equal(localLifecycle.localCompletion.state, 'COMPLETED_LOCAL_PENDING_SYNC');
  assert.equal(localLifecycle.centralReconciliation.state, 'LOCAL_ONLY_PENDING_SYNC');
  assert.equal(localLifecycle.completionCriteria, task.completionCriteria);

  const central = new CentralFieldNetService({
    filePath: path.join(directory, 'central.json'), clock: () => NOW,
    operationalEventService: { async operatorEvent(id) { return id === INCIDENT_ID ? { event: { id, evidenceState: 'CURRENT', knowledgeState: 'CURRENT', physicalOperationalState: 'UNKNOWN', lastSeenAt: NOW.toISOString() } } : null; } }
  });
  await central.initialize();
  const queued = store.pendingSync({ mode: 'FULL', incidentId: INCIDENT_ID });
  const synced = await central.sync({
    schemaVersion: 'vigia.fieldnet-sync-request.v1', nodeId, cursor: '0',
    mutations: queued.items.map((item) => item.mutation).sort((left, right) => left.localSequence - right.localSequence)
  });
  store.recordSyncAttempt(queued.items.filter((item) => synced.acceptedMutationIds.includes(item.mutationId)));
  const reconciledLifecycle = store.taskLifecycle(task.taskId);
  assert.equal(reconciledLifecycle.localCompletion.state, 'COMPLETED_AND_RECONCILED');
  assert.equal(reconciledLifecycle.centralReconciliation.state, 'CENTRAL_RECONCILED');
  const admission = new FieldCapacityAdmissionService({
    filePath: path.join(directory, 'admissions.json'), clock: () => NOW,
    snapshotForIncident: (incidentId, options) => central.snapshot(incidentId, options),
    authorizeAdmission: async (context) => ({ authorized: true, scope: context.scope, action: context.action, incidentId: context.incidentId, truthEnvironment: context.truthEnvironment, principalId: context.actor.id, authorityReference: 'authority:fire-capacity:regional-eoc' })
  });
  await admission.initialize();
  await admission.admit({ id: 'operator:fire-capacity-admitter', permissions: ['fieldnet:capacity-admit'] }, {
    incidentId: INCIDENT_ID, observationId: 'report:fire-capacity-golden', expectedReportType: 'FIRE_STATION_CAPACITY_UPDATE',
    expectedRawEvidenceHash: FIRE_EVIDENCE_HASH, truthEnvironment: 'LIVE_OPERATIONAL', decisionReference: 'decision:fire-capacity:golden'
  });
  const provider = new FieldCapacityReportProvider({
    clock: () => NOW,
    snapshotForIncident: async (incidentId, options) => admission.decorateSnapshot(incidentId, central.snapshot(incidentId, options))
  });
  const admitted = await provider.listForIncident(INCIDENT_ID);
  assert.equal(admitted.items.length, 1);
  const admittedCapacity = normalizeDynamicCapacity('FIRE_STATION', admitted.items[0], { now: NOW });
  const response = buildResponseCapabilityProjection({
    incident: { id: INCIDENT_ID, coordinate: [-8.61, 41.15], truthState: 'VERIFIED_CURRENT' }, generatedAt: NOW.toISOString(),
    facilitiesByKind: {
      FIRE_STATION: [closedStation, station('station:alternative', 'Alternative station', 22, routeB, admittedCapacity, { distanceKm: 9 })]
    },
    decisionContext: { fireCapacityRequired: true },
    roadContext: initial.roadContext
  });
  assert.equal(response.informationRequirements.some((item) => item.subjectId === 'station:alternative'), false);
  assert.equal(response.resourceOptimizer.recommendedStaging[0].facilityId, 'station:alternative');
  assert.equal(response.resourceOptimizer.recommendedStaging[0].dispatchClaimed, false);
  await assertDurableRecommendationReview({
    directory, response, incidentId: INCIDENT_ID, now: NOW,
    refreshProjection: (generatedAt) => buildResponseCapabilityProjection({
      incident: response.incident, generatedAt, facilitiesByKind: response.facilities,
      decisionContext: response.decisionContext, roadContext: response.roadContext
    })
  });
  const planning = projectCrisisPlanning({
    asOf: NOW.toISOString(), incident: { id: INCIDENT_ID, coordinate: [-8.61, 41.15] }, responseCapability: response,
    taskRequirements: [{
      id: 'requirement:fire-response',
      requiredKind: 'FIRE_STATION',
      requiredResourceType: 'CREWS',
      requiredQuantity: 1,
      requiredCapabilities: ['wildfireCapability'],
      owner: 'operations:golden',
      deadline: '2026-09-04T15:30:00Z'
    }],
    triggers: [{ id: 'trigger:road-closure', type: 'ROAD_CLOSURE', closureId: 'closure:golden', observedAt: '2026-09-04T14:57:00Z', source: { id: 'fieldnet-road', reference: 'road-closure:golden' }, affectedFacilityIds: ['station:closed'] }],
    replanning: { oldPlan: { id: 'plan:before-closure', assignments: [{ id: 'assignment:fire-response', taskRequirementId: 'requirement:fire-response', facilityId: 'station:closed', state: 'PROPOSED' }] } }
  });
  assert.equal(planning.resourceOptimizer.value.recommendedAssignment[0].facilityId, 'station:alternative');
  assert.equal(planning.autonomousReplanning.state, 'NEW_PLAN_READY_FOR_APPROVAL');
  assert.equal(planning.autonomousReplanning.value.oldPlan.assignments[0].facilityId, 'station:closed');
  assert.equal(planning.autonomousReplanning.value.newPlan.assignments[0].facilityId, 'station:alternative');
  assert.equal(planning.autonomousReplanning.value.mutationExecuted, false);

  const mapLayers = responseCapabilityMapLayers(response);
  assert.equal(mapLayers.responseCoverageRoutes.state, 'READY');
  assert.ok(mapLayers.responseCoverageRoutes.value.every((feature) => feature.geometry.type === 'LineString'));
  assert.equal(mapLayers.responseCoverageRoutes.value.find((feature) => feature.properties.facilityId === 'station:closed').properties.roadClosureState, 'DEGRADED_BY_CLOSURE');
  assert.match(mapLayers.responseCoverageRoutes.value.find((feature) => feature.properties.facilityId === 'station:closed').properties.explanation, /closure impact degraded by closure/i);
  assert.equal(mapLayers.responseFacilities.value.length, 2);
  const markup = responseCapabilityPanel(response, { projectionAt: NOW.toISOString() });
  assert.match(markup, /data-facility-class-count="8"/);
  for (const kind of ['FIRE_STATION', 'EMS_BASE', 'HOSPITAL', 'CIVIL_PROTECTION', 'POLICE', 'SHELTER', 'WATER_POINT', 'AIR_SUPPORT_BASE']) assert.match(markup, new RegExp(`data-facility-class="${kind}"`));
  assert.match(markup, /Station with closed route/);
  assert.match(markup, /Alternative station/);
  assert.match(markup, /data-route-feature-count="2"/);
  assert.match(markup, /no radius or inferred service-area polygon/i);
  assert.doesNotMatch(markup, /dispatch(?:ed)? confirmed|resource dispatched/i);
});
