import {
  createControlAction, createControlPlaneEvent, createControlPlaneReplay, createWildfireControlPolicies,
  evaluateControlPolicy, planControlCycle, POLICY_KINDS, selectEvidenceSource, verifyControlPlaneReplay
} from '../packages/domain/src/control-plane/index.mjs';
import { commitOperationalEvent, createCanonicalOperationalEvent, createSourceRegistry } from '../packages/domain/src/event-fabric/index.mjs';
import { projectOperationalTwin } from '../packages/domain/src/operational-twin/index.mjs';

const at = '2026-08-24T12:05:00.000Z', incidentId = 'incident:control-benchmark', policies = createWildfireControlPolicies();
const common = { staleAfterMs: 21_600_000, registeredAt: '2026-08-24T12:00:00Z', capabilities: ['FAMILY_CLASS_QUORUM'], geographicApplicability: { bbox: [-9, 39, -7, 41] } };
const sourceRegistry = createSourceRegistry([
  { ...common, sourceId: 'report:benchmark', familyId: 'report.benchmark', familyClass: 'REPORT', metadata: { priority: 10, provenanceStrength: 'ATTRIBUTED' } },
  { ...common, sourceId: 'viirs:benchmark', familyId: 'physical.viirs', familyClass: 'PHYSICAL', metadata: { priority: 10, provenanceStrength: 'VERIFIED' } },
  { ...common, sourceId: 'sensor:optical', familyId: 'physical.optical', familyClass: 'PHYSICAL', metadata: { priority: 1, reliability: 0.98, cost: 2, provenanceStrength: 'VERIFIED' } },
  { ...common, sourceId: 'sensor:thermal', familyId: 'physical.thermal', familyClass: 'PHYSICAL', metadata: { priority: 2, reliability: 0.96, cost: 1, provenanceStrength: 'VERIFIED' } },
  { ...common, sourceId: 'authority:cap', familyId: 'official.cap', familyClass: 'OFFICIAL', metadata: { priority: 1, reliability: 0.99, cost: 1, provenanceStrength: 'VERIFIED' } }
]);
function observation(id, sourceId, familyId, familyClass, observedAt) {
  return commitOperationalEvent(createCanonicalOperationalEvent({ eventType: 'wildfire.benchmark', hazardType: 'wildfire',
    provider: { adapterId: 'control-benchmark', adapterVersion: '1', providerEventId: id },
    source: { sourceId, familyId, familyClass, producerId: sourceId, upstreamOrigin: 'control-benchmark' },
    clocks: { occurredAt: observedAt, observedAt, publishedAt: observedAt, receivedAt: observedAt, ingestedAt: null }, geometry: [-8, 40], correlationKeys: [incidentId],
    payload: { observationState: 'OBSERVED_POSITIVE', stance: 'SUPPORTING', materiality: 'MATERIAL', opportunity: { state: 'VALID' } },
    provenance: { strength: familyClass === 'REPORT' ? 'ATTRIBUTED' : 'VERIFIED', upstreamMeasurementId: id, rawPayloadHash: `benchmark:${id}` } }), observedAt);
}
const physicalEvents = [observation('report', 'report:benchmark', 'report.benchmark', 'REPORT', '2026-08-24T12:00:00Z'),
  observation('viirs', 'viirs:benchmark', 'physical.viirs', 'PHYSICAL', '2026-08-24T12:01:00Z')];
const twin = projectOperationalTwin({ events: physicalEvents, sourceRegistry, asOf: at }), incident = twin.incidents[0], need = incident.evidenceDebt.needs[0];
const selectionInput = { need, sources: twin.sourceHealth.sources, existingFamilyIds: incident.evaluation.independentFamilies.map((item) => item.sourceFamilyId) };
const selection = selectEvidenceSource(selectionInput), selectedSource = twin.sourceHealth.sources.find((item) => item.sourceId === selection.selectedSourceId);
const acquisitionPolicy = policies.find((item) => item.kind === POLICY_KINDS.MISSING_INDEPENDENT_CORROBORATION);
const facts = { incidentId, need, sourceSelection: selection, selectedSource, debtCount: incident.evidenceDebt.count };

function measure(iterations, operation) {
  const started = performance.now(); let last;
  for (let index = 0; index < iterations; index += 1) last = operation(index);
  const elapsedMs = performance.now() - started;
  return { iterations, elapsedMs, perSecond: iterations / (elapsedMs / 1000), averageMs: elapsedMs / iterations, last };
}
const policy = measure(10_000, () => evaluateControlPolicy({ policy: acquisitionPolicy, facts, evaluatedAt: at }));
const selections = measure(10_000, () => selectEvidenceSource(selectionInput));
const planning = measure(10_000, () => planControlCycle({ twin, policies, at }));
const basePlan = planning.last, desired = basePlan.desiredStates.find((item) => item.id === basePlan.actions[0].desiredStateId);
const actionIds = new Set(), duplicateActions = measure(10_000, () => {
  const action = createControlAction({ ...basePlan.actions[0], policy: acquisitionPolicy, desiredStateId: desired.id, plannedAt: at }); actionIds.add(action.id); return action;
});
const largeTwin = structuredClone(twin), templateNeeds = incident.evidenceDebt.needs;
largeTwin.incidents[0].evidenceDebt.needs = Array.from({ length: 100 }, (_, index) => ({ ...structuredClone(templateNeeds[index % templateNeeds.length]), id: `benchmark-need:${index}` }));
largeTwin.incidents[0].evidenceDebt.count = 100;
const largePlanning = measure(100, () => planControlCycle({ twin: largeTwin, policies, at }));

const controlEvents = [];
for (const decision of basePlan.decisions) controlEvents.push(commitOperationalEvent(createControlPlaneEvent({ controlType: 'POLICY_DECISION', record: decision, incidentId, at }), at));
for (const state of basePlan.desiredStates) controlEvents.push(commitOperationalEvent(createControlPlaneEvent({ controlType: 'DESIRED_STATE', record: state, incidentId, at }), at));
for (const action of basePlan.actions) controlEvents.push(commitOperationalEvent(createControlPlaneEvent({ controlType: 'ACTION', record: action, incidentId, at }), at));
const replayInput = { events: [...physicalEvents, ...controlEvents], sourceRegistry, policies, asOf: at };
const replays = measure(1_000, () => createControlPlaneReplay(replayInput)), replay = replays.last;
const verification = verifyControlPlaneReplay(replay, { ...replayInput, events: [...replayInput.events].reverse() });
const result = {
  schemaVersion: 'vigia.control-plane-benchmark.v1', node: process.version,
  policyEvaluations: { iterations: policy.iterations, perSecond: Number(policy.perSecond.toFixed(1)) },
  sourceSelections: { iterations: selections.iterations, perSecond: Number(selections.perSecond.toFixed(1)) },
  reconciliationCycles: { iterations: planning.iterations, perSecond: Number(planning.perSecond.toFixed(1)), actionPlanningLatencyMs: Number(planning.averageMs.toFixed(4)) },
  largeIncident: { evidenceNeeds: 100, iterations: largePlanning.iterations, cyclesPerSecond: Number(largePlanning.perSecond.toFixed(1)), averageMs: Number(largePlanning.averageMs.toFixed(3)) },
  duplicateActionStress: { iterations: duplicateActions.iterations, perSecond: Number(duplicateActions.perSecond.toFixed(1)), uniqueSemanticActionIds: actionIds.size },
  controlPlaneReplay: { iterations: replays.iterations, inputEvents: replayInput.events.length, replaysPerSecond: Number(replays.perSecond.toFixed(1)),
    eventsPerSecond: Number((replays.perSecond * replayInput.events.length).toFixed(1)), deterministic: verification.valid }
};
if (policy.last.decisionId !== evaluateControlPolicy({ policy: acquisitionPolicy, facts, evaluatedAt: at }).decisionId || selection.selectedSourceId !== selections.last.selectedSourceId
  || actionIds.size !== 1 || !verification.valid || basePlan.actions.length === 0) throw new Error('control_plane_benchmark_correctness_gate_failed');
console.log(JSON.stringify(result, null, 2));
