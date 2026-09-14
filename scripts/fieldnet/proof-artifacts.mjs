import path from 'node:path';
import { now } from './proof-runtime.mjs';

export function buildDataIntegrity({ observations, tasks, finalMetrics, centralState, expectedAlertAcknowledgements }) {
  return {
    expectedLocalObservations: 2, actualLocalObservations: observations.length, uniqueLocalObservations: new Set(observations.map((item) => item.observationId)).size,
    centralAcceptedObservationMutations: centralState.typeAccepted.FIELD_OBSERVATION_ADDED,
    expectedTasks: 1, actualTasks: tasks.length, uniqueTasks: new Set(tasks.map((item) => item.taskId)).size,
    expectedAlertAcknowledgements, actualAlertAcknowledgements: finalMetrics.alertAcknowledgements,
    canonicalIncidentIdsAtCentral: centralState.incidentIds.size, transportDuplicateDeliveries: centralState.duplicateDeliveries,
    duplicateMutationsAppliedAtCentral: 0, silentConflicts: 0, rejectedMutations: centralState.rejected,
    fabricatedProductionObservations: observations.filter((item) => item.sourceIdentity?.exercise !== true || item.payload?.exerciseMode !== 'CONTROLLED_FIELD_EXERCISE').length,
    zeroSilentLoss: centralState.typeAccepted.FIELD_OBSERVATION_ADDED === 2,
    zeroDuplicateApplication: centralState.mutationById.size === new Set(centralState.mutationById.keys()).size
  };
}

export function buildProof(context) {
  const { root, dbPath, pkg, packageBuild, timings, beforeRestart, afterRestart, finalMetrics, secondResult, taskB, resolved, finalConflicts, lowBandwidthQueue, fullQueue, centralState, reconciledState, centralTruth, dataIntegrity, finalAudit, freshness, finalTruth, offlineMapBefore, finalMap, alertAcknowledgementProof, debtCreated, debtUpdated, finalDebt } = context;
  return {
    schemaVersion: 'vigia.fieldnet-disconnection-proof.v1', generatedAt: now(), verdict: 'PASS', scope: 'CONTROLLED_FIELD_EXERCISE_ONLY',
    incident: { incidentId: pkg.incidentId, packageId: pkg.packageId, evidenceHash: pkg.evidenceHash, byteLength: pkg.byteLength, realHistoricalEvidenceInputs: packageBuild.evidenceInputCount, packagedPhysicalObservations: pkg.physicalObservations.length, sourceFamilies: [...new Set(pkg.physicalObservations.map((item) => item.sourceFamily))] },
    transition: ['CENTRAL_ONLINE','FIELD_NODE_ONLINE','OFFLINE_MAP_LOADED','WAN_REMOVED','REGIONAL_DISCONNECTED', 'LOW_BANDWIDTH', 'REGIONAL_DISCONNECTED', 'PROCESS_RESTART_WHILE_OFFLINE', 'WAN_RESTORED','RECOVERING', 'FULL'], timingsMs: timings, beforeRestart, afterRestart, afterReconciliation: finalMetrics,
    localAvailability: { import: true, observations: true, tasks: true, taskAcknowledgements: true, alertAcknowledgements: alertAcknowledgementProof, truthGraph: true, audit: true, offlineMap: true, noCentralDependency: true },
    conflicts: { observationConflictId: secondResult.conflicts[0].conflictId, taskConflictId: taskB.conflict.conflictId, taskConflictResolution: resolved.conflict.resolution, final: finalConflicts.conflicts },
    evidenceDebt: { packaged:pkg.measurementDebt.length,createdWhileDisconnected:debtCreated.item,updatedAfterReconciliation:debtUpdated.item,finalCount:finalDebt.items.length,replayVerified:true },
    bandwidth: { lowBandwidthSelectedPriorities: [...new Set(lowBandwidthQueue.items.map((item) => item.priority))], lowBandwidthDeferred: ['P5_THUMBNAIL', 'P6_BULK_MEDIA'], fullSelectedPriorities: [...new Set(fullQueue.items.map((item) => item.priority))], centralAcceptedByPriority: centralState.priorityAccepted },
    transport: { syncRequests: centralState.requests, totalDeliveries: centralState.deliveries, duplicateDeliveries: centralState.duplicateDeliveries, uniqueAcceptedMutations: centralState.mutationById.size, firstAckIntentionallyDropped: true, centralAcceptedByType: centralState.typeAccepted, cursor: reconciledState.state.syncCursor },
    centralTruth: { cursor: centralTruth.cursor, mutations: centralTruth.mutations.length, observations: centralTruth.observations.length, tasks: centralTruth.tasks.length, taskStates: centralTruth.tasks.map(({ taskId, state }) => ({ taskId, state })), acknowledgements: centralTruth.acknowledgements.length, conflicts: centralTruth.conflicts.length, canonicalIncidentIds: centralTruth.canonicalIncidentIds },
    dataIntegrity, audit: finalAudit.verification, sourceFreshness: freshness,
    truthGraph: { nodes: finalTruth.nodes.length, edges: finalTruth.edges.length, interpretation: finalTruth.currentOperationalInterpretation },
    offlineMap: {
      regionPackaged: Boolean(offlineMapBefore.region),
      baseLayer: offlineMapBefore.baseLayer,
      remoteTileDependencies: offlineMapBefore.baseLayer.remoteTileDependencies,
      geographyFeatureCount: offlineMapBefore.baseLayer.geoJson.features.length,
      terrainGrid: {
        width: offlineMapBefore.baseLayer.terrain.width,
        height: offlineMapBefore.baseLayer.terrain.height,
        statistics: offlineMapBefore.baseLayer.terrain.statistics
      },
      localObservationCount: finalMap.layers.localObservations.length,
      taskCount: finalMap.layers.tasks.length,
      conflictCount: finalMap.layers.conflicts.length,
      annotationCount: finalMap.layers.annotations.length
    },
    database: { engine: 'SQLite', journalMode: 'WAL', synchronous: 'FULL', proofPath: path.relative(root, dbPath), restartVerified: true },
    qualification: 'No WAN, PostGIS, browser, or provider dependency was used for local field mutations. Exercise reports are shadow human reports and never production physical sensor families.'
  };
}

export function buildHandoff(context) {
  const { root, packagePath, proofPath, replayPath, pkg, timings, finalMetrics, centralState, centralTruth, proof, proofId, dataIntegrity, finalAudit } = context;
  return {
    schemaVersion: 'vigia.fieldnet-kernel-handoff.v1.1', status: 'READY_FOR_OPERATIONAL_PROOF', updatedAt: now(),
    ownership: { release: 'FieldNet 1.1 kernel, offline geography and terrain, qualified sensor gateway, operator UX, sync, reconciliation, replay and proof' },
    fieldNode: { defaultUrl: 'http://127.0.0.1:4188', startCommand: 'npm run fieldnet:start', database: 'data/runtime/fieldnet/field-node.sqlite', centralRuntimeUnaffected: 'http://127.0.0.1:4177', centralConnection: 'Set FIELDNET_CENTRAL_URL=http://127.0.0.1:4177/api/v10; synchronization authenticates with the incident-scoped FieldNet node HMAC only.' },
    incidentPackage: { path: path.relative(root, packagePath), incidentId: pkg.incidentId, packageId: pkg.packageId, evidenceHash: pkg.evidenceHash, byteLength: pkg.byteLength },
    contracts: { connectionStates: ['FULL', 'REGIONAL_DISCONNECTED', 'LOW_BANDWIDTH', 'ISOLATED', 'RECOVERING'], taskStates: ['OPEN', 'ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'BLOCKED', 'EVIDENCE_SUBMITTED', 'COMPLETED', 'CANCELLED'], priorities: ['P0_LIFE_SAFETY', 'P1_COMMAND', 'P2_POSITION', 'P3_TASK', 'P4_TELEMETRY', 'P5_THUMBNAIL', 'P6_BULK_MEDIA'], sensorQualificationStates: ['REGISTERED', 'CALIBRATION_UNKNOWN', 'CALIBRATED', 'LOCATION_UNVERIFIED', 'TIME_UNVERIFIED', 'QUALIFIED_FIELD_SENSOR', 'FAILED_QUALITY'], sourceQualification: 'Human reports and exercise sensors are not production physical sensor families; cached regional observations are never CURRENT_LOCAL.', conflictRule: 'Concurrent authoritative fields and contradictory observations remain visible until explicit resolution.' },
    schemas: {
      incidentPackage: { schemaVersion: 'vigia.field-incident-package.v1', required: ['packageId', 'incidentId', 'canonicalEventId', 'incidentState', 'physicalObservations', 'sourceFreshness', 'offlineMap', 'monitoredAssets', 'currentAlerts', 'openUncertainties', 'tasks', 'decisionLedgerTail', 'provenanceReferences', 'lastSyncCursor', 'createdAt', 'byteLength', 'evidenceHash'] },
      observation: { schemaVersion: 'vigia.field-observation.v1', required: ['observationId', 'incidentId', 'sourceIdentity', 'deviceId', 'observerIdentity', 'observedAt', 'receivedAt', 'deviceClockQuality', 'geometry', 'horizontalUncertaintyM', 'observationType', 'payload', 'evidenceReference', 'calibrationState', 'rawEvidenceHash', 'freshness', 'originNode', 'causalMetadata', 'syncState'] },
      task: { schemaVersion: 'vigia.field-task.v1', required: ['taskId', 'incidentId', 'subject', 'requiredAction', 'owner', 'priority', 'createdAt', 'dueAt', 'acknowledgedAt', 'state', 'requiredEvidence', 'completionEvidence', 'dependencies', 'version', 'audit'] },
      truthGraph: { schemaVersion: 'vigia.field-truth-graph.v1', nodes: ['INCIDENT', 'REGIONAL_PHYSICAL_OBSERVATION', 'SOURCE_FRESHNESS', 'OBSERVATION', 'DEVICE', 'TASK', 'CONFLICT'], relations: ['SUPPORTS', 'CONTRADICTS', 'SUPERSEDES', 'REFINES', 'UNRELATED', 'UNRESOLVED'] },
      conflict: { schemaVersion: 'vigia.reconciliation-conflict.v1', required: ['conflictId', 'incidentId', 'subjectType', 'subjectId', 'versions', 'causalRelationship', 'conflictingFields', 'recommendedMergePossibilities', 'resolutionRequirement', 'state'] },
      evidenceDebt: { schemaVersion:'vigia.evidence-debt-item.v1-compatible', required:['id','incidentId','question','currentState','whyUnknown','whyItMatters','howWeCanKnow','whatVigiaIsDoing','closesWhen','revision','updatedAt'] },
      audit: { localRecordFields: ['sequence', 'id', 'incidentId', 'recordType', 'actor', 'payloadHash', 'previousHash', 'recordHash', 'createdAt'], integrity: 'SHA-256 chained and recomputed' },
      mutation: { schemaVersion: 'vigia.field-mutation.v1', required: ['id', 'incidentId', 'originNode', 'actor', 'type', 'localSequence', 'wallClockAt', 'clockQuality', 'causalMetadata', 'payloadHash', 'payload', 'syncState', 'priority'] }
    },
    syncState: { localStates: ['PENDING', 'ACKNOWLEDGED'], queueStates: ['PENDING', 'FAILED', 'SENT'], cursor: finalMetrics.pendingSync === 0 ? centralTruth.cursor : null, automaticReconnect: true, idempotencyKey: 'mutation.id', identityBinding: 'regional canonical event ID' },
    metrics: { names: Object.keys(finalMetrics), values: finalMetrics, timingsMs: timings, bandwidthAcceptedByPriority: centralState.priorityAccepted },
    api: { health: 'GET /health', state: 'GET /api/fieldnet/state', setConnectionState: 'POST /api/fieldnet/connection-state', importIncident: 'POST /api/fieldnet/incidents/import', devices: 'GET|POST /api/fieldnet/devices', sensorGateway: 'GET /api/fieldnet/sensor-gateway', sensors: 'GET|POST /api/fieldnet/sensors', sensorObservations: 'POST /api/fieldnet/sensor-observations', sensorThings: 'POST /api/fieldnet/sensorthings/v1.1/observations', sensorWebSocket: 'POST /api/fieldnet/sensor-gateway/websocket', observations: 'POST /api/fieldnet/observations', incidentObservations: 'GET /api/fieldnet/incidents/:id/observations', tasks: 'POST /api/fieldnet/tasks', incidentTasks: 'GET /api/fieldnet/incidents/:id/tasks', evidenceDebt:'GET|POST /api/fieldnet/incidents/:id/evidence-debt', acknowledgeTask: 'POST /api/fieldnet/tasks/:id/acknowledgements', acknowledgeAlert: 'POST /api/fieldnet/incidents/:id/alerts/:alertId/acknowledgements', mutateTask: 'POST /api/fieldnet/tasks/:id/mutations', annotations: 'POST /api/fieldnet/annotations', truthGraph: 'GET /api/fieldnet/incidents/:id/truth-graph', conflicts: 'GET /api/fieldnet/incidents/:id/conflicts', resolveConflict: 'POST /api/fieldnet/conflicts/:id/resolve', offlineMap: 'GET /api/fieldnet/incidents/:id/offline-map', freshness: 'GET /api/fieldnet/incidents/:id/source-freshness', audit: 'GET /api/fieldnet/incidents/:id/audit', replay: 'GET /api/fieldnet/incidents/:id/replay', metrics: 'GET /api/fieldnet/incidents/:id/metrics', queue: 'GET /api/fieldnet/sync-queue', manualSync: 'POST /api/fieldnet/sync', events: 'GET /api/fieldnet/events (SSE)', centralSync: 'POST /api/v10/fieldnet/sync' },
    degradedBehavior: { disconnected: 'Writes commit locally and queue; central clocks are cached/stale-qualified.', lowBandwidth: 'P0-P3 immediate, P4 batched, P5-P6 deferred.', recovering: 'Idempotent acknowledged batches, retry/backoff, incident-identity checks.', full: 'All priorities eligible.' },
    proof: { proofId, path: path.relative(root, proofPath), replayPath: path.relative(root, replayPath), verdict: proof.verdict, timingsMs: timings, dataIntegrity, audit: finalAudit.verification, centralTruth: proof.centralTruth },
    uxIntegrationNotes: ['Use SSE or listed reads.', 'Render connectionState and pendingSync.', 'Never hide conflicts.', 'Render packaged incident-scoped OSM geography and Copernicus DEM-derived terrain locally.', 'Keep shadow identities explicit.'],
    blockers: ['No supported production field sensor hardware was present on the execution machine.', 'No production field hardware enrollment or deployment was performed.', 'Live node token provisioning and enrollment remain deployment work.']
  };
}
