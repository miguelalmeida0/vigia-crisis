import assert from 'node:assert/strict';

import { projectCrisisAutopilot } from '../../../packages/domain/src/crisis-autopilot/index.mjs';
import { projectCrisisPlanning } from '../../../packages/domain/src/crisis-planning/index.mjs';
import {
  buildResponseCapabilityProjection,
  normalizeDynamicCapacity
} from '../../../packages/domain/src/response-capability/index.mjs';
import { sha256 } from '../../../packages/domain/src/fieldnet/contracts.mjs';
import {
  createFieldObserver,
  createFieldTaskAcknowledgement,
  createFieldTaskCompletion,
  createFieldVerificationTask,
  createStructuredFieldReport
} from '../../../packages/domain/src/fieldnet/field-reports.mjs';
import { buildHumanAttention } from '../src/modules/operator/operational-recovery-service.mjs';
import { OperationalPeriodService } from '../src/modules/operator/operational-period-service.mjs';
import { ProtectionWorkflowService } from '../src/modules/protection/protection-workflow-service.mjs';
import {
  createGoldenScenarioReceipt,
  encodeGoldenScenarioReceiptDiagnostic,
  validateGoldenScenarioReceipt
} from '../../../scripts/certification/anduril_integrity.mjs';

export const AT = '2026-09-04T12:00:00.000Z';
export const INCIDENT_ID = 'incident:golden:anduril';
export const ACTOR = { id: 'administrator:golden', role: 'administrator', incidentScopes: [INCIDENT_ID] };
export const SCENARIO_NAMES = Object.freeze({
  GOLDEN_1: 'golden 1: a new thermal signal creates bounded collection and an explainable decision revision without auto-verification',
  GOLDEN_2: 'golden 2: offline FieldNet observation retains provenance, task receipts, admission boundary, and incident re-evaluation trigger',
  GOLDEN_3: 'golden 3: a road closure changes routed response order and creates fail-closed replanning proposals',
  GOLDEN_4: 'golden 4: protection threshold delivers and acknowledges CAP only through the isolated exercise ledger with receipts',
  GOLDEN_5: 'golden 5: completed assignment requires acknowledgements and an observed partial postcondition before PARTIAL outcome and lesson',
  GOLDEN_6: 'golden 6: provider silence tasks an alternative source and alerts a human only when a material decision is blocked',
  GOLDEN_7: 'golden 7: field and satellite conflict remains explicit and creates targeted collection without fake consensus',
  GOLDEN_PLANNING: 'golden planning: governed inputs produce bounded exposure, disagreement, optimization, replanning, evacuation, and protection proposals',
  GOLDEN_RESPONSE_CAPACITY: 'golden response capacity: generated requirement completes the signed FieldNet roundtrip, closes after admission, recalculates optimization, and persists review'
});

export async function emitGoldenReceipt(t, { scenarioId, service, before, after, transitions, claims }) {
  const normalizedTransitions = transitions.map((transition, index) => ({
    ...transition,
    occurredAt: transition.occurredAt ?? AT,
    persisted: true,
    source: transition.source ?? { kind: 'SERVICE_RESULT', reference: transition.objectId },
    receiptReference: transition.receiptReference ?? `golden-transition:${scenarioId.toLowerCase()}:${index + 1}`
  }));
  const evidenceReferences = normalizedTransitions.map((transition) => transition.receiptReference);
  const ledger = repository({ schemaVersion: 'vigia.isolated-golden-transition-ledger.v1', scenarioId, transitions: [] });
  const ledgerBefore = ledger.snapshot();
  await ledger.mutate((state) => ({ ...state, transitions: normalizedTransitions }));
  const ledgerAfter = ledger.snapshot();
  assert.equal(ledgerAfter.transitions.length, normalizedTransitions.length);
  const receipt = createGoldenScenarioReceipt({
    scenarioId,
    testName: SCENARIO_NAMES[scenarioId],
    incidentId: INCIDENT_ID,
    service,
    serviceEvidence: {
      beforeFingerprint: sha256(before),
      afterFingerprint: sha256(after)
    },
    repository: {
      kind: 'ISOLATED_GOLDEN_SCENARIO_LEDGER',
      scope: 'NODE_TEST_PROCESS_ONLY',
      beforeRevision: sha256(ledgerBefore),
      afterRevision: sha256(ledgerAfter),
      persisted: true
    },
    transitions: normalizedTransitions,
    claims: claims.map((code) => ({ code, state: 'PROVEN', evidenceReferences })),
    resultState: 'PASS',
    recordedAt: AT,
    truthBoundary: 'This receipt records deterministic service and isolated in-memory repository transitions only. It is not production truth, live authority, external dispatch, field acknowledgement, or production outcome evidence; any acknowledgement, postcondition, or outcome claim is explicitly limited to its named isolated test/exercise universe.'
  });
  assert.equal(validateGoldenScenarioReceipt(receipt).state, 'PASS', JSON.stringify(validateGoldenScenarioReceipt(receipt).violations));
  t.diagnostic(encodeGoldenScenarioReceiptDiagnostic(receipt));
  return receipt;
}

export const repository = (initial = {}) => {
  let state = structuredClone(initial);
  return {
    snapshot: () => structuredClone(state),
    async mutate(mutator) {
      state = await mutator(structuredClone(state));
      return structuredClone(state);
    }
  };
};

export const decisionPacket = (results = []) => ({
  replayFingerprint: 'golden-scenario:isolated-fixture',
  decisions: { results },
  acquisitionPlan: { items: [] }
});

export const candidate = (overrides = {}) => ({
  id: 'candidate:golden:field',
  incidentId: INCIDENT_ID,
  provider: 'FIELDNET',
  requirement: 'Independent field corroboration',
  sourceAvailability: 'AVAILABLE',
  sourceHealth: 'HEALTHY',
  coverage: true,
  rights: 'READY',
  qualityExpectation: 'ADEQUATE',
  decisionsAffected: ['decision:golden:verify'],
  criticalDecisionsPotentiallyUnblocked: 1,
  contractsPotentiallySatisfied: ['contract:independent-source'],
  hypothesesSeparated: ['CURRENT_FIRE', 'NON_CURRENT_SIGNAL'],
  independentFamilyGained: true,
  expectedLatencyMs: 600_000,
  estimatedCostUnits: 0,
  expectedBytes: 2_048,
  ...overrides
});

export const activeCollection = (overrides = {}) => ({
  id: 'task:golden:field',
  incidentId: INCIDENT_ID,
  candidateId: 'candidate:golden:field',
  evidenceNeedId: 'requirement:golden:independence',
  title: 'Acquire independent field observation',
  state: 'IN_PROGRESS',
  ownerId: 'observer-team:golden',
  sourceId: 'FIELDNET',
  updatedAt: '2026-09-04T11:55:00.000Z',
  nextCheckAt: '2026-09-04T12:10:00.000Z',
  unlockCondition: 'Re-evaluate the incident with a second causal source family.',
  ...overrides
});

export const autopilot = (overrides = {}) => projectCrisisAutopilot({
  asOf: AT,
  incident: {
    id: INCIDENT_ID,
    label: 'Isolated golden-scenario incident',
    coordinate: [-8.61, 41.15],
    revision: 'revision:1',
    operationalTruth: { classification: 'DETECTION_CANDIDATE' }
  },
  intelligence: {
    mode: 'CONTROLLED_TEST_FIXTURE',
    snapshotVersion: 'snapshot:1',
    projectionHash: 'fixture:not-production',
    situation: {
      state: 'SINGLE_FAMILY_PHYSICAL_SIGNAL',
      freshness: 'CURRENT',
      why: { independentPhysicalFamilies: ['VIIRS'] }
    },
    unknowns: []
  },
  decisionPacket: decisionPacket(),
  ...overrides
});

export const unknownCapacity = (kind) => normalizeDynamicCapacity(kind, null, { now: new Date(AT) });
export const reachability = (minutes, distanceKm, overrides = {}) => ({
  state: 'ROUTED',
  method: 'ISOLATED_ROAD_NETWORK_FIXTURE',
  routeDistanceKm: distanceKm,
  travelTimeMinutes: minutes,
  currentRoute: { travelTimeMinutes: minutes, distanceKm, geometry: null, geometryState: 'NOT_RETURNED' },
  alternativeRoute: null,
  alternativeRouteState: 'NOT_RETURNED',
  roadClosureImpact: { state: 'UNKNOWN', closures: [] },
  terrainAccessConstraints: { state: 'NOT_ROUTING_CONSTRAINED', constraints: [] },
  source: { provider: 'ISOLATED_ROUTING_FIXTURE' },
  checkedAt: AT,
  confidence: { state: 'CONTEXTUAL_ESTIMATE', score: null },
  reason: null,
  ...overrides
});

export const station = (id, minutes, dynamicCapacity = unknownCapacity('FIRE_STATION')) => ({
  id,
  kind: 'FIRE_STATION',
  name: id,
  coordinate: [-8.5, 41.1],
  distanceKm: minutes / 2,
  reachability: reachability(minutes, minutes / 1.5),
  staticCapability: { wildfireCapability: { state: 'KNOWN', value: true } },
  dynamicCapacity,
  provenance: { provider: 'Isolated governed facility fixture', sourceId: `source:${id}` }
});

export const hospital = (id, minutes, dynamicCapacity = unknownCapacity('HOSPITAL')) => ({
  id,
  kind: 'HOSPITAL',
  name: id,
  coordinate: [-8.45, 41.12],
  distanceKm: minutes / 2,
  reachability: reachability(minutes, minutes / 1.5),
  staticCapability: { emergencyDepartment: { state: 'KNOWN', value: true } },
  dynamicCapacity,
  provenance: { provider: 'Isolated governed facility fixture', sourceId: `source:${id}` }
});

export {
  OperationalPeriodService, ProtectionWorkflowService, buildHumanAttention,
  buildResponseCapabilityProjection, createFieldObserver, createFieldTaskAcknowledgement,
  createFieldTaskCompletion, createFieldVerificationTask, createStructuredFieldReport,
  normalizeDynamicCapacity, projectCrisisAutopilot, projectCrisisPlanning, sha256,
};
