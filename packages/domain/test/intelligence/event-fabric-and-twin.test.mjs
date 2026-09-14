import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  adaptRecords, CapOperationalAdapter, commitOperationalEvent, createCanonicalOperationalEvent, createSourceHealthEvent,
  createSourceRegistry, FieldNetOperationalAdapter, FirmsOperationalAdapter, validateCanonicalOperationalEvent
} from '../../src/event-fabric/index.mjs';
import { createOperationalTwinReplay, projectOperationalTwin, verifyOperationalTwinReplay } from '../../src/operational-twin/index.mjs';

const fixtureRoot = new URL('../fixtures/event-fabric/', import.meta.url);
const fixture = async (name) => JSON.parse(await readFile(new URL(name, fixtureRoot), 'utf8'));
const rawHash = 'raw-payload:sha256:fixture';
function adapted(adapter, raw, receivedAt, context = {}) {
  const result = adaptRecords({ adapter, records: [raw], receivedAt, context });
  assert.equal(result.rejections.length, 0); return result.events[0];
}
function committed(adapter, raw, ingestedAt, context = {}) {
  return commitOperationalEvent(adapted(adapter, raw, ingestedAt, { ...context, rawPayloadHash: rawHash }), ingestedAt);
}
function registry() {
  const common = { staleAfterMs: 6 * 60 * 60_000, registeredAt: '2026-08-24T11:00:00Z' };
  return createSourceRegistry([
    { ...common, sourceId: 'fieldnet:citizen-report-channel', familyId: 'report.fieldnet-human', familyClass: 'REPORT' },
    { ...common, sourceId: 'fieldnet:municipal-hotline', familyId: 'report.fieldnet-human', familyClass: 'REPORT' },
    { ...common, sourceId: 'fieldnet:camera-17', familyId: 'physical.fieldnet-optical', familyClass: 'PHYSICAL' },
    { ...common, sourceId: 'firms-broker-a', familyId: 'physical.viirs', familyClass: 'PHYSICAL' },
    { ...common, sourceId: 'firms-broker-b', familyId: 'physical.viirs', familyClass: 'PHYSICAL' },
    { ...common, sourceId: 'cap-authority', familyId: 'official.cap-alert', familyClass: 'OFFICIAL' }
  ]);
}

test('canonical operational events preserve five clocks and deterministic immutable identity', () => {
  const input = {
    eventType: 'wildfire.report', hazardType: 'wildfire',
    provider: { adapterId: 'test', adapterVersion: '1', providerEventId: 'provider-1' },
    source: { sourceId: 'source-1', familyId: 'report-1', familyClass: 'REPORT', producerId: 'producer-1', upstreamOrigin: 'upstream-1' },
    clocks: { occurredAt: '2026-08-24T12:00:00Z', observedAt: '2026-08-24T12:01:00Z', publishedAt: '2026-08-24T12:02:00Z', receivedAt: '2026-08-24T12:03:00Z', ingestedAt: null },
    geometry: [-8, 40], payload: { observationState: 'OBSERVED_POSITIVE' }, provenance: { rawPayloadHash: rawHash }
  };
  const first = createCanonicalOperationalEvent(input), retry = createCanonicalOperationalEvent({ ...input, clocks: { ...input.clocks, receivedAt: '2026-08-24T12:04:00Z' } });
  assert.equal(first.id, retry.id); assert.equal(Object.isFrozen(first.clocks), true);
  assert.equal(first.payloadHash.startsWith('payload:sha256:'), true); assert.equal(first.correlationId, null); assert.equal(first.causationId, null);
  assert.deepEqual(Object.keys(first.clocks).sort(), ['ingestedAt', 'observedAt', 'occurredAt', 'publishedAt', 'receivedAt', 'substitutions']);
  assert.equal(validateCanonicalOperationalEvent({ ...first, schemaVersion: 'vigia.operational-event.v999' }).valid, false);
});

test('realistic adapters isolate malformed rows and reject non-actual CAP alerts', async () => {
  const firms = await fixture('firms-viirs-records.json'), caps = await fixture('cap-alerts.json');
  const firmsResult = adaptRecords({ adapter: new FirmsOperationalAdapter(), records: firms, receivedAt: '2026-08-24T12:09:00Z' });
  assert.equal(firmsResult.events.length, 1); assert.equal(firmsResult.rejections.length, 1);
  assert.equal(firmsResult.events[0].clocks.observedAt, '2026-08-24T12:05:00.000Z');
  const capResult = adaptRecords({ adapter: new CapOperationalAdapter(), records: caps, receivedAt: '2026-08-24T12:16:00Z' });
  assert.equal(capResult.events.length, 1); assert.equal(capResult.rejections[0].code, 'CAP_NON_ACTUAL');
  const bounded = new FirmsOperationalAdapter(); bounded.maxPayloadBytes = 8;
  assert.equal(adaptRecords({ adapter: bounded, records: [firms[0]], receivedAt: '2026-08-24T12:09:00Z' }).rejections[0].code, 'PAYLOAD_TOO_LARGE');
});

test('wildfire twin moves through evidence states, handles causal duplicates, late data, contradiction resolution and source health', async () => {
  const rows = await fixture('fieldnet-observations.json'), firmsRows = await fixture('firms-viirs-records.json'), caps = await fixture('cap-alerts.json');
  const fieldnet = new FieldNetOperationalAdapter(), firmsA = new FirmsOperationalAdapter({ id: 'firms-a', sourceId: 'firms-broker-a' });
  const firmsB = new FirmsOperationalAdapter({ id: 'firms-b', sourceId: 'firms-broker-b' }), cap = new CapOperationalAdapter();
  const report = committed(fieldnet, rows[0], '2026-08-24T12:01:00Z');
  const thermalA = committed(firmsA, firmsRows[0], '2026-08-24T12:09:00Z', { correlationKeys: ['incident:wildfire-demo'] });
  const thermalB = committed(firmsB, firmsRows[0], '2026-08-24T12:09:30Z', { correlationKeys: ['incident:wildfire-demo'] });
  const official = committed(cap, caps[0], '2026-08-24T12:15:00Z');
  const negative = committed(fieldnet, rows[1], '2026-08-24T12:19:00Z');
  const positiveRaw = { ...rows[2], resolvesEventIds: [negative.id] };
  const positive = committed(fieldnet, positiveRaw, '2026-08-24T12:25:00Z');
  const late = committed(fieldnet, rows[3], '2026-08-24T12:30:00Z');
  const stale = commitOperationalEvent(createSourceHealthEvent({ sourceId: 'fieldnet:camera-17', status: 'STALE', at: '2026-08-24T12:30:30Z', reason: 'Expected cadence exceeded.' }), '2026-08-24T12:30:30Z');
  const unavailable = commitOperationalEvent(createSourceHealthEvent({ sourceId: 'fieldnet:camera-17', status: 'UNAVAILABLE', at: '2026-08-24T12:31:00Z', reason: 'Heartbeat lost.' }), '2026-08-24T12:31:00Z');
  const recovered = commitOperationalEvent(createSourceHealthEvent({ sourceId: 'fieldnet:camera-17', status: 'ACTIVE', at: '2026-08-24T12:32:00Z', lastSuccessAt: '2026-08-24T12:32:00Z' }), '2026-08-24T12:32:00Z');
  const events = [report, thermalA, thermalB, official, negative, positive, late, stale, unavailable, recovered];
  const stateAt = (at) => projectOperationalTwin({ events, sourceRegistry: registry(), asOf: at }).incidents[0].evaluation.state;
  assert.equal(stateAt('2026-08-24T12:01:30Z'), 'REPORT_ONLY');
  assert.equal(stateAt('2026-08-24T12:10:00Z'), 'SINGLE_FAMILY_PHYSICAL');
  assert.equal(stateAt('2026-08-24T12:20:00Z'), 'CONTRADICTED');
  assert.equal(stateAt('2026-08-24T12:26:00Z'), 'CORROBORATED');
  assert.equal(stateAt('2026-08-24T12:30:45Z'), 'SINGLE_FAMILY_PHYSICAL');
  assert.equal(stateAt('2026-08-24T12:31:30Z'), 'SINGLE_FAMILY_PHYSICAL');
  assert.equal(stateAt('2026-08-24T12:32:30Z'), 'CORROBORATED');
  assert.equal(stateAt('2026-08-24T14:05:00Z'), 'STALE');
  const beforeLate = projectOperationalTwin({ events, sourceRegistry: registry(), asOf: '2026-08-24T12:29:00Z' });
  const afterLate = projectOperationalTwin({ events, sourceRegistry: registry(), asOf: '2026-08-24T12:30:20Z' });
  assert.equal(beforeLate.eventCount + 1, afterLate.eventCount);
  assert.equal(afterLate.incidents[0].evaluation.excludedEvidence.some((item) => item.classification === 'CAUSAL_DUPLICATE'), true);
  assert.equal(afterLate.incidents[0].evaluation.contradictions[0].blocking, false);
  assert.equal(afterLate.transitions.some((item) => item.to === 'CONTRADICTED'), true);
  const recoveredTwin = projectOperationalTwin({ events, sourceRegistry: registry(), asOf: '2026-08-24T12:32:30Z' });
  assert.equal(recoveredTwin.transitions.some((item) => item.entityType === 'SOURCE' && item.from === 'STALE' && item.to === 'UNAVAILABLE'), true);
  const replay = createOperationalTwinReplay({ events, sourceRegistry: registry(), asOf: '2026-08-24T12:32:30Z' });
  assert.equal(verifyOperationalTwinReplay(replay, { events: [...events].reverse(), sourceRegistry: registry() }).valid, true);
});

test('late amendments apply when their target arrives, cancellation preserves history, and competing incidents remain ambiguous', async () => {
  const fieldnet = new FieldNetOperationalAdapter(), rows = await fixture('fieldnet-observations.json');
  const targetDraft = adapted(fieldnet, { ...rows[0], correlationKeys: [] }, '2026-08-24T12:02:00Z');
  const correction = commitOperationalEvent(adapted(fieldnet, { ...rows[0], observationId: 'CORRECTION-1', action: 'CORRECT', targetEventId: targetDraft.id, coordinate: [-8.01, 40.01], correlationKeys: [] }, '2026-08-24T12:01:00Z'), '2026-08-24T12:01:00Z');
  const target = commitOperationalEvent(targetDraft, '2026-08-24T12:02:00Z');
  const cancel = commitOperationalEvent(adapted(fieldnet, { ...rows[0], observationId: 'CANCEL-1', action: 'CANCEL', targetEventId: correction.id, correlationKeys: [] }, '2026-08-24T12:03:00Z'), '2026-08-24T12:03:00Z');
  const corrected = projectOperationalTwin({ events: [correction, target, cancel], sourceRegistry: registry(), asOf: '2026-08-24T12:02:30Z' });
  assert.deepEqual(corrected.incidents[0].activeEventIds, [correction.id]); assert.equal(corrected.relationHistory.find((item) => item.eventId === target.id).state, 'SUPERSEDED');
  const twin = projectOperationalTwin({ events: [correction, target, cancel], sourceRegistry: registry(), asOf: '2026-08-24T12:04:00Z' });
  assert.deepEqual(twin.incidents[0].activeEventIds, []); assert.equal(twin.relationHistory.find((item) => item.eventId === target.id).state, 'SUPERSEDED');
  const first = committed(fieldnet, { ...rows[0], observationId: 'A', coordinate: [-8, 40], correlationKeys: [] }, '2026-08-24T12:10:00Z');
  const second = committed(fieldnet, { ...rows[0], observationId: 'B', coordinate: [-7.92, 40], correlationKeys: [] }, '2026-08-24T12:10:01Z');
  const middle = committed(fieldnet, { ...rows[0], observationId: 'C', coordinate: [-7.96, 40], correlationKeys: [] }, '2026-08-24T12:10:02Z');
  const ambiguous = projectOperationalTwin({ events: [first, second, middle], sourceRegistry: registry(), asOf: '2026-08-24T12:11:00Z' });
  assert.equal(ambiguous.incidents.length, 2); assert.equal(ambiguous.failures.some((item) => item.code === 'AMBIGUOUS_INCIDENT_ASSOCIATION'), true);
});

test('as-of projection excludes ingested records whose physical clocks are still in the future', () => {
  const futureObserved = commitOperationalEvent(createCanonicalOperationalEvent({
    eventType: 'wildfire.public_report', hazardType: 'wildfire',
    provider: { adapterId: 'future-clock-test', adapterVersion: '1', providerEventId: 'future-observation' },
    source: { sourceId: 'fieldnet:citizen-report-channel', familyId: 'report.fieldnet-human', familyClass: 'REPORT', producerId: 'fieldnet:test', upstreamOrigin: 'test' },
    clocks: { occurredAt: '2026-08-24T13:00:00Z', observedAt: '2026-08-24T13:00:00Z', publishedAt: null, receivedAt: '2026-08-24T11:59:00Z', ingestedAt: null },
    geometry: [-8, 40], correlationKeys: ['incident:future-clock'], payload: { observationState: 'OBSERVED_POSITIVE', stance: 'SUPPORTING' },
    provenance: { strength: 'ATTRIBUTED', upstreamMeasurementId: 'future-observation', rawPayloadHash: 'raw:future-observation' },
  }), '2026-08-24T11:59:30Z');
  const twin = projectOperationalTwin({ events: [futureObserved], sourceRegistry: registry(), asOf: '2026-08-24T12:00:00Z' });
  assert.equal(twin.eventCount, 0);
  assert.equal(twin.futureEventCountExcluded, 1);
  assert.equal(twin.incidents.length, 0);

  const futureRegistry = createSourceRegistry([{ sourceId: 'future-source', familyId: 'report.future', familyClass: 'REPORT', staleAfterMs: 60_000, registeredAt: '2026-08-24T12:05:00Z' }]);
  const beforeRegistration = projectOperationalTwin({ events: [], sourceRegistry: futureRegistry, asOf: '2026-08-24T12:00:00Z' });
  assert.equal(beforeRegistration.sourceHealth.sources.length, 0);
});
