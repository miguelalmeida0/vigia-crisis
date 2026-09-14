import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IpmaGateway } from '../src/modules/world/ipma-gateway.mjs';
import { FinalGapClosureService } from '../src/modules/operator/final-gap-closure-service.mjs';
import { ProtectionWorkflowService } from '../src/modules/protection/protection-workflow-service.mjs';
import { AlertTransport } from '../src/modules/protection/cap-alert-transport.mjs';
import { OperationalPeriodService } from '../src/modules/operator/operational-period-service.mjs';

const now = '2026-09-03T12:00:00.000Z';
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const actor = { id: 'supervisor:one', role: 'supervisor', incidentScopes: ['*'] };
const memory = (initial = {}) => { let state = structuredClone(initial); return { snapshot: () => structuredClone(state), async mutate(work) { state = await work(structuredClone(state)); return structuredClone(state); } }; };

test('direct IPMA public products normalize mainland stations and warnings with UTC and provenance', async () => {
  const station = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [-8.61, 41.15] }, properties: { idEstacao: 1, localEstacao: 'Porto', time: '2026-09-03T11:00:00', temperatura: 24, humidade: 41, intensidadeVentoKM: 18, descDirVento: 'NW', precAcumulada: 0 } }, { type: 'Feature', geometry: { type: 'Point', coordinates: [-28, 38] }, properties: { idEstacao: 2, time: '2026-09-03T11:00:00' } }] };
  const warnings = [{ idAreaAviso: 'POR', awarenessTypeName: 'Tempo Quente', awarenessLevelID: 'yellow', text: 'Elevated maximum temperature.', startTime: '2026-09-03T10:00:00', endTime: '2026-09-03T18:00:00' }];
  const fetchImpl = async (url) => new Response(JSON.stringify(String(url).includes('warnings') ? warnings : station), { status: 200, headers: { 'content-type': 'application/json' } });
  const result = await new IpmaGateway({ fetchImpl, clock: () => new Date(now) }).snapshot();
  assert.equal(result.ipmaWeather.state.state, 'current');
  assert.equal(result.ipmaWeather.data.length, 1);
  assert.equal(result.ipmaWeather.data[0].observedAt, '2026-09-03T11:00:00.000Z');
  assert.equal(result.ipmaWeather.data[0].provenance.provider, 'IPMA');
  assert.equal(result.ipmaWarnings.data[0].level, 'yellow');
});

test('gap-closure projection exposes eight-family coverage, governed location, direct weather and three official replay controls', async () => {
  const world = { sources: { fires: { state: 'current', fetchedAt: now }, ipmaWeather: { state: 'current', fetchedAt: now, ageSeconds: 3600 }, ipmaWarnings: { state: 'current', fetchedAt: now }, firms: { state: 'current', fetchedAt: now } }, fires: [{ id: 'report:one' }], directWeather: [{ id: 'station:one', name: 'Station', coordinate: [-8.1, 40.1], observedAt: '2026-09-03T11:00:00.000Z', temperatureC: 26, humidityPercent: 35, windSpeedKph: 14, windDirection: 'NW', provenance: { provider: 'IPMA' } }], directWarnings: [], thermalDetections: [{ id: 'thermal:one' }], riskToday: [], history: [], earthObservations: [] };
  const twin = { incidents: [{ incident: { id: 'incident:one', coordinate: [-8.1, 40.1], updatedAt: now }, claim: { validTime: { to: now } }, evidenceGraph: { observations: [{ id: 'observation:operational-event:report-one', observedAt: now, source: { provider: 'ptdata' } }, { id: 'observation:operational-event:viirs-one', observedAt: now, coordinate: [-8.099, 40.099], source: { provider: 'NASA FIRMS', familyId: 'physical.viirs' }, instrument: 'VIIRS' }], evidence: [{ id: 'evidence:operational-event:report-one', observedAt: now }, { id: 'evidence:operational-event:viirs-one', observedAt: now }] } }], sourceHealth: { sources: [] } };
  const service = new FinalGapClosureService({ worldService: { snapshot: async () => world }, repository: memory({ sourceResolutionJobs: [] }), projectRoot, clock: () => new Date(now) });
  const result = await service.project(twin, { truth: { counts: { VERIFIED_CURRENT: 0 } }, verificationPromotionFunnel: { officialMatches: 0 }, sourceResolution: { jobs: [] } });
  assert.equal(result.sourceCoverage.incidents[0].families.length, 8);
  assert.equal(result.sourceCoverage.incidents[0].families.find((item) => item.sourceFamily === 'OFFICIAL INCIDENT').actualCoverage, 'ABSENT', 'an intermediary report must not satisfy direct official coverage');
  assert.equal(result.sourceCoverage.incidents[0].families.find((item) => item.sourceFamily === 'ROAD / ACCESS CONTEXT').actualCoverage, 'ABSENT', 'a coordinate makes context queryable, not already acquired');
  assert.equal(result.geolocation.percent, 100);
  assert.equal(result.weatherAssociation.incidents[0].state, 'INCIDENT_ASSOCIATED');
  assert.equal(result.officialConfirmation.positiveControls.length, 3);
  assert.equal(result.officialConfirmation.promotionReachable, true);
  assert.equal(result.officialConfirmation.sourcePipelines.length, 3);
  assert.equal(result.officialConfirmation.sourcePipelines.find((item) => item.providerId === 'ptdata-occurrences').pipeline.find((item) => item.stage === 'AUTHORITY VALIDATION').state, 'BLOCKED');
  assert.ok(result.providers.inventory.every((item) => item.acquisition?.scheduledPolling && item.acquisition?.eventTrigger));
  assert.equal(result.independence.incidents[0].distinctFamilyCount, 2, 'observation and evidence representations of the same two source events must not inflate independence');
  assert.equal(result.independence.duplicateFamilyInflation, 0);
});

test('CAP software path validates approved drafts, remains disabled by default and supports transport receipts without domain changes', async () => {
  const repository = memory({ protectionWorkflows: [], audit: [] }), disabled = new ProtectionWorkflowService({ repository, clock: () => new Date(now) });
  const input = { workflowId: 'protect:cap', targetPopulationOrArea: { areaDesc: 'Governed test polygon', polygon: '40.0,-8.2 40.1,-8.2 40.1,-8.1 40.0,-8.2' }, exposureAssessment: 'Retained exposure context.', protectionThreshold: 'Exercise threshold.', recommendation: 'Prepare an authority-reviewed draft.', authorityRequirement: 'Civil-protection approval', authorityOwner: 'Duty authority', expiresAt: '2026-09-03T14:00:00.000Z', expectedPostcondition: 'A receipt or no-send state is retained.', provenanceRefs: ['evidence:one'] };
  await disabled.create(actor, 'incident:cap', input); await disabled.transition(actor, 'incident:cap', 'protect:cap', { state: 'REVIEW' }); await disabled.transition(actor, 'incident:cap', 'protect:cap', { state: 'APPROVED' });
  const draft = disabled.capDraft(actor, 'incident:cap', 'protect:cap', { urgency: 'Expected', severity: 'Severe', certainty: 'Likely', headline: 'Exercise wildfire protection message', instruction: 'Follow authorized civil-protection instructions.' });
  assert.equal(draft.validation.valid, true); assert.equal(draft.transport.state, 'DISPATCH_DISABLED');
  await assert.rejects(() => disabled.dispatchCap(actor, 'incident:cap', 'protect:cap', { urgency: 'Expected', severity: 'Severe', certainty: 'Likely', headline: 'Exercise', instruction: 'Follow instructions.', idempotencyKey: 'cap:one' }), /disabled/);
  class TestTransport extends AlertTransport { constructor() { super({ id: 'test-transport', enabled: true }); } async send() { return { receiptId: 'transport-receipt:one' }; } }
  const enabledRepository = memory({ protectionWorkflows: [], audit: [] }), enabled = new ProtectionWorkflowService({ repository: enabledRepository, alertTransport: new TestTransport(), clock: () => new Date(now) });
  await enabled.create(actor, 'incident:cap', input); await enabled.transition(actor, 'incident:cap', 'protect:cap', { state: 'REVIEW' }); await enabled.transition(actor, 'incident:cap', 'protect:cap', { state: 'APPROVED' }); await enabled.transition(actor, 'incident:cap', 'protect:cap', { state: 'DISPATCH_ELIGIBLE' });
  const sent = await enabled.dispatchCap(actor, 'incident:cap', 'protect:cap', { urgency: 'Expected', severity: 'Severe', certainty: 'Likely', headline: 'Exercise wildfire protection message', instruction: 'Follow authorized civil-protection instructions.', status: 'Actual', idempotencyKey: 'cap:one' });
  assert.equal(sent.workflow.dispatch.receipt, 'transport-receipt:one');
});

test('CAP transport path rejects unauthorized, expired, duplicate and replay sends and persists alert, acknowledgement, update and cancel receipts', async () => {
  let receipt = 0;
  class RecordingTransport extends AlertTransport {
    constructor() { super({ id: 'recording-transport', enabled: true }); this.sent = []; }
    async send(message) { this.sent.push(structuredClone(message)); receipt += 1; return { receiptId: `transport-receipt:${receipt}` }; }
  }
  const transport = new RecordingTransport(), repository = memory({ protectionWorkflows: [], audit: [] }), service = new ProtectionWorkflowService({ repository, alertTransport: transport, clock: () => new Date(now) });
  const base = { targetPopulationOrArea: { areaDesc: 'Governed test area', geocode: [{ valueName: 'exercise-zone', value: 'PT-TEST' }] }, exposureAssessment: 'Attributable exposure context.', protectionThreshold: 'Governed threshold.', recommendation: 'Prepare a bounded public-warning draft.', authorityRequirement: 'Civil-protection approval', authorityOwner: 'Duty authority', authorityValidUntil: '2026-09-03T13:30:00.000Z', expiresAt: '2026-09-03T14:00:00.000Z', expectedPostcondition: 'A transport receipt or explicit no-send result is retained.', provenanceRefs: ['evidence:cap'] };
  const cap = { urgency: 'Expected', severity: 'Severe', certainty: 'Likely', headline: 'Governed wildfire protection message', instruction: 'Follow authorized civil-protection instructions.', status: 'Actual' };
  await service.create(actor, 'incident:cap-cycle', { ...base, workflowId: 'protect:cycle' });
  await service.transition(actor, 'incident:cap-cycle', 'protect:cycle', { state: 'REVIEW' });
  await assert.rejects(() => service.transition({ ...actor, capabilities: ['read:incident_command'] }, 'incident:cap-cycle', 'protect:cycle', { state: 'APPROVED' }), /forbidden/);
  await service.transition(actor, 'incident:cap-cycle', 'protect:cycle', { state: 'APPROVED' });
  await service.transition(actor, 'incident:cap-cycle', 'protect:cycle', { state: 'DISPATCH_ELIGIBLE' });
  const alert = await service.dispatchCap(actor, 'incident:cap-cycle', 'protect:cycle', { ...cap, idempotencyKey: 'cap:alert:one' });
  assert.equal(alert.delivery.messageType, 'Alert');
  await assert.rejects(() => service.dispatchCap(actor, 'incident:cap-cycle', 'protect:cycle', { ...cap, idempotencyKey: 'cap:alert:one' }), /duplicate/);
  assert.equal(transport.sent.length, 1, 'duplicate is rejected before invoking transport');
  const acknowledged = await service.transition(actor, 'incident:cap-cycle', 'protect:cycle', { state: 'ACKNOWLEDGED', source: 'authorized transport', receiptId: 'authority-ack:one' });
  assert.equal(acknowledged.workflow.acknowledgement.receiptId, 'authority-ack:one');
  const update = await service.dispatchCap(actor, 'incident:cap-cycle', 'protect:cycle', { ...cap, msgType: 'Update', references: ['VIGIA-protect:cycle-prior'], idempotencyKey: 'cap:update:one' });
  assert.equal(update.workflow.state, 'UPDATED');
  const cancel = await service.dispatchCap(actor, 'incident:cap-cycle', 'protect:cycle', { ...cap, msgType: 'Cancel', references: ['VIGIA-protect:cycle-update'], reason: 'Authority closed the governed test message.', idempotencyKey: 'cap:cancel:one' });
  assert.equal(cancel.workflow.state, 'CANCELLED');
  assert.deepEqual(cancel.workflow.dispatchDeliveries.map((item) => item.messageType), ['Alert', 'Update', 'Cancel']);

  await service.create(actor, 'incident:expired', { ...base, workflowId: 'protect:expired', authorityValidUntil: '2026-09-03T11:59:59.000Z' });
  await service.transition(actor, 'incident:expired', 'protect:expired', { state: 'REVIEW' });
  await service.transition(actor, 'incident:expired', 'protect:expired', { state: 'APPROVED' });
  assert.throws(() => service.capDraft(actor, 'incident:expired', 'protect:expired', cap), /expired/);

  await service.create(actor, 'incident:exercise', { ...base, workflowId: 'protect:exercise', universe: 'EXERCISE' });
  await service.transition(actor, 'incident:exercise', 'protect:exercise', { state: 'REVIEW' });
  await service.transition(actor, 'incident:exercise', 'protect:exercise', { state: 'APPROVED' });
  await service.transition(actor, 'incident:exercise', 'protect:exercise', { state: 'DISPATCH_ELIGIBLE' });
  await assert.rejects(() => service.dispatchCap(actor, 'incident:exercise', 'protect:exercise', { ...cap, idempotencyKey: 'cap:exercise:one' }), /non_production/);
  assert.equal(transport.sent.length, 3, 'exercise isolation rejects before invoking transport');
});

test('EOC period supports roles, objective acknowledgement, decisions, handoff, close and fingerprinted audit bundle', async () => {
  const repository = memory({ operationalPeriods: [], operationalPeriodAfterActionPackages: [], audit: [] }), service = new OperationalPeriodService({ repository, clock: () => new Date(now) });
  const period = await service.start(actor, { shift: 'Day 1', commander: 'Commander One', startsAt: now, endsAt: '2026-09-03T20:00:00.000Z', roles: [{ role: 'Intelligence lead', person: 'Operator One' }], authorityMatrix: [{ role: 'Commander', capability: 'Approve internal protection review' }], incidentOwners: [{ incidentId: 'incident:eoc', owner: 'Operator One' }], objectives: [{ objectiveId: 'objective:one', statement: 'Resolve current source gaps.', owner: 'Operator One', dueAt: '2026-09-03T16:00:00.000Z' }] });
  await service.record(actor, period.periodId, { kind: 'OBJECTIVE_ACKNOWLEDGEMENT', objectiveId: 'objective:one' });
  await service.record(actor, period.periodId, { kind: 'DECISION', incidentId: 'incident:eoc', statement: 'Continue bounded source acquisition.', owner: 'Operator One', dueAt: '2026-09-03T13:00:00.000Z', acknowledged: true });
  await service.handoff(actor, period.periodId, { from: 'Commander One', to: 'Commander Two', acknowledgedBy: 'Commander Two' });
  const closed = await service.close(actor, period.periodId, { summary: 'Controlled period closed with no external dispatch.' });
  const bundle = service.exportAuditBundle(actor, period.periodId);
  assert.equal(closed.period.state, 'CLOSED'); assert.equal(closed.afterActionPackage.decisions.length, 1); assert.match(bundle.fingerprint, /^sha256:/);
});
