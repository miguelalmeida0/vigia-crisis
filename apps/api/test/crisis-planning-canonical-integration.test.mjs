import assert from 'node:assert/strict';
import test from 'node:test';
import { CANONICAL_OPERATOR_SCREENS, CanonicalOperatorApiService } from '../src/modules/operator/canonical-operator-api-service.mjs';

const AT = '2026-09-04T15:00:00.000Z';
const actor = {
  id: 'operator:planning-integration',
  role: 'administrator',
  incidentScopes: ['incident:one'],
  authentication: { authenticated: true, mode: 'local_shadow_session' }
};

test('canonical detail, intelligence, and operations retain singleton governed point context in crisis planning', async () => {
  const twin = {
    schemaVersion: 'vigia.operational-twin.v1',
    asOf: AT,
    incidents: [{
      incident: { id: 'incident:one', label: 'Incident one', location: { geometry: { type: 'Point', coordinates: [-8.5, 41.2] } } },
      evidenceGraph: { observations: [] },
      evaluation: { state: 'INSUFFICIENT_EVIDENCE' },
      evidenceDebt: { state: 'OPEN', items: [], needs: [] }
    }],
    sourceHealth: { sources: [] },
    transitions: [],
    controlPlane: { desiredState: [], actions: [], receipts: [] }
  };
  const services = {
    operationalIntelligenceService: {
      async getCurrentTwin() { return twin; },
      status() { return { state: 'READY' }; }
    },
    operationalEventService: {
      async operatorEvent() { return null; },
      async commandSnapshot() { return { state: 'ready', events: [] }; }
    },
    operationalProofService: {
      async project(recovery) {
        return {
          recovery,
          incidentContextById: new Map([['one', {
            pointContext: {
              community: {
                id: 'node/4015684783',
                label: 'Lever',
                kind: 'COMMUNITY',
                coordinate: [-8.4709989, 41.0638919],
                source: 'OpenStreetMap contributors',
                retrievedAt: '2026-09-04T14:55:00.000Z',
                preliminary: true
              }
            }
          }]]),
          collectionEffectiveness: null,
          geometryAudit: null
        };
      }
    },
    operationalIntelligenceQueryService: {
      async incidentSnapshot() { return { schemaVersion: 'vigia.operational-intelligence-snapshot.v2', incidentId: 'one', objects: {} }; }
    },
    incidentCommandService: {
      async get() { return { incidentId: 'one', resources: {}, assignments: {}, resourceRequests: {}, orders: {},commandIntent:{intentId:'intent:one',intentHash:`command-intent:sha256:${'a'.repeat(64)}`,statement:'Verify access to Lever.',intentType:'VERIFY_ROUTE',target:'Lever access',requestedBy:'operator:planning-integration',requestedAt:'2026-09-04T14:50:00.000Z',owner:'Planning Officer',deadline:'2026-09-04T16:00:00.000Z',periodStart:'2026-09-04T15:05:00.000Z',periodEnd:'2026-09-04T15:55:00.000Z',confirmation:{state:'CONFIRMED',confirmedBy:'operator:planning-integration',confirmedAt:'2026-09-04T14:50:00.000Z'}},decisions:{'decision:one':{decisionId:'decision:one',proposalType:'OPERATIONAL_PERIOD',decision:'REJECT',state:'REJECTED',recordedAt:'2026-09-04T14:58:00.000Z',mutationsApplied:false}} }; }
    },
    responseCapabilityService: {
      async projectIncident(incident) {
        return {
          schemaVersion: 'vigia.response-capability.v1',
          incident: { id: incident.incident.id, coordinate: incident.incident.location.geometry.coordinates, truthState: incident.operationalTruth.classification },
          facilities: { FIRE_STATION: [{
            id: 'station:one', kind: 'FIRE_STATION', name: 'Governed station', coordinate: [-8.45, 41.18],
            provenance: { provider: 'OpenStreetMap contributors', sourceRecordId: 'node/1', archiveSha256: 'sha256:fixture', retrievedAt: '2026-09-04T14:30:00Z' },
            freshness: { state: 'STATIC_SNAPSHOT', retrievedAt: '2026-09-04T14:30:00Z' }
          }] },
          resourceCoverageMap: {
            state: 'ROUTED_PATH_COVERAGE_AVAILABLE',
            serviceArea: { reason: null },
            truthBoundary: 'Road route is an estimate, not dispatch.',
            routeFeatures: { type: 'FeatureCollection', features: [{
              type: 'Feature', id: 'response-route:station:one',
              geometry: { type: 'LineString', coordinates: [[-8.5, 41.2], [-8.45, 41.18]] },
              properties: { layer: 'responseCoverageRoutes', facilityId: 'station:one', facilityKind: 'FIRE_STATION', dispatchClaimed: false }
            }] },
            facilityFeatures: { type: 'FeatureCollection', features: [{
              type: 'Feature', id: 'station:one', geometry: { type: 'Point', coordinates: [-8.45, 41.18] },
              properties: { facilityId: 'station:one', facilityKind: 'FIRE_STATION', label: 'Governed station', capacityAvailability: 'UNKNOWN' }
            }] }
          },
          optimizerInputs: { candidates: [], constraints: [], unknowns: [] }
        };
      }
    },
    centralFieldNetService: { snapshot(incidentId) { return { incidentId, observations: [], tasks: [], acknowledgements: [], conflicts: [] }; } },
    incidentOperationsService: { async incident(incidentId) { return { incidentId, state: 'READY' }; } },
    repository: { snapshot() { return {}; } }
  };
  const api = new CanonicalOperatorApiService({ services, clock: () => new Date(AT), projectRoot: process.cwd() });
  let canonicalClassification = null;

  for (const screen of [CANONICAL_OPERATOR_SCREENS.INCIDENT_DETAIL, CANONICAL_OPERATOR_SCREENS.INTELLIGENCE_EVIDENCE, CANONICAL_OPERATOR_SCREENS.OPERATIONS]) {
    const response = await api.project(screen, { incidentId: 'incident:one', actor });
    canonicalClassification = response.data.operationalTruth.value.classification;
    const section = response.data.crisisPlanning;
    assert.equal(response.incidentId, 'incident:one');
    assert.equal(section.state, 'READY');
    assert.equal(section.value.schemaVersion, 'vigia.crisis-planning-projection.v1');
    assert.equal(section.value.incidentId, 'incident:one');
    assert.equal(section.value.compiledAgainstIntentHash,`command-intent:sha256:${'a'.repeat(64)}`);
    assert.equal(section.value.planningReview.decisions[0].decisionId,'decision:one');
    assert.equal(section.value.planningReview.rejected,1);
    assert.equal(response.data.crisisAutopilot.value.incidentId, 'incident:one');
    assert.equal(response.data.crisisAutopilot.value.livingTwin.incidentId, 'incident:one');
    assert.equal(response.data.responseCapability.value.incident.id, 'incident:one');
    assert.equal(response.data.mapScene.value.selectedIncidentId, 'incident:one');
    assert.equal(response.data.mapScene.value.layers.responseCoverageRoutes.state, 'READY');
    assert.equal(response.data.mapScene.value.layers.responseCoverageRoutes.value[0].geometry.type, 'LineString');
    assert.equal(response.data.mapScene.value.layers.responseFacilities.state, 'READY');
    assert.equal(response.data.mapScene.value.layers.responseFacilities.value[0].properties.facilityKind, 'FIRE_STATION');
    assert.ok(response.data.mapScene.value.layerSet.includes('responseCoverageRoutes'));
    assert.ok(response.data.mapScene.value.layerSet.includes('responseFacilities'));
    const node = section.value.dynamicExposureGraph.nodes.find((item) => item.nodeId === 'node/4015684783');
    assert.equal(node?.source?.sourceId, 'OpenStreetMap contributors');
    assert.equal(node?.source?.reference, 'node/4015684783');
    assert.equal(node?.updatedAt, '2026-09-04T14:55:00.000Z');
    const edge = section.value.dynamicExposureGraph.edges.find((item) => item.to === node.nodeId);
    assert.equal(edge?.exposureState, 'PRELIMINARY_CONTEXT_ONLY');
    assert.equal(edge?.perimeterUsed, false);
  }

  const responseCapability = await api.responseCapability('incident:one', { actor });
  assert.equal(responseCapability.schemaVersion, 'vigia.response-capability.v1');
  assert.equal(responseCapability.incident.truthState, canonicalClassification);
});
