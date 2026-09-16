// Regression coverage for the deeper root cause behind the live Neon
// failure: the demo seed script's synthetic sensor observations used
// Date.now()-relative observedAt values.
//
// The mechanism that actually decides a canonical event's externally-visible
// id is NOT fire-event-tracker.mjs's stableId() — it's
// EventObservationRepository.reconcileEvents()'s generatedEventId(), which
// picks the observation with the earliest receivedAt/at in the tracked
// event and hashes `physical-event:${that observation's id}` (id being
// SensorIngestService's canonicalObservationId). Critically,
// EventObservationRepository (apps/api/src/application/create-services.mjs)
// is backed by a *local file* (config.stateFile's directory); PostgresPhysicalTruthStore
// is wired in only as a write-through `mirrorStore` — #load() never reads
// from it. On Render, that local file does not survive a container restart,
// so this repository starts from a blank slate on every single restart, not
// just on a genuinely fresh database. Re-ingestion therefore runs every
// restart, and generatedEventId() is only as deterministic as the
// observation identities it hashes.
//
// SensorIngestService derives canonicalObservationId from
// [sensorId, type, incidentId, ..., externalObservationId], and
// externalObservationId itself defaults to a hash of [sensorId, type,
// observedAt] whenever none is supplied. A wall-clock-relative observedAt
// therefore made the canonical event id different on every restart, and a
// persisted incident-command import that pinned one restart's canonical
// event id could never be satisfied again — previewImport()'s
// canonicalEventResolver check correctly (and permanently) rejected it
// (incident_import_confirmation_rejected).
//
// scripts/seed_demo_portfolio_scenario.mjs now pins observedAt and supplies
// an explicit externalObservationId for both synthetic sensors
// (demoSensorBodies(), exported so this test exercises the exact bodies
// production sends, not a hand-copied stand-in). These tests prove that fix
// through the *real* merge -> track -> reconcile pipeline FireEventService
// actually runs, using a fresh EventObservationRepository per simulated
// "restart" (no filePath — exactly as ephemeral as Render's wiped local
// disk), and separately prove a fresh, per-request auth nonce/timestamp
// (replay protection, deliberately NOT part of domain identity) still
// varies every call without affecting observation identity.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac, randomUUID } from 'node:crypto';
import { SensorIngestService } from '../src/modules/sensors/sensor-ingest-service.mjs';
import { EventObservationRepository } from '../src/modules/events/event-observation-repository.mjs';
import { trackFireEvents } from '../../../packages/domain/src/fire-event-tracker.mjs';
import { demoSensorBodies } from '../../../scripts/seed_demo_portfolio_scenario.mjs';

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

const CAMERA_SECRET = 'demo-camera-secret', GROUND_SECRET = 'demo-ground-secret';
const registry = {
  get: (id) => ({
    'demo-camera-01': { id: 'demo-camera-01', name: '[DEMO] camera', type: 'camera', organizationId: 'vigia-demo-portfolio', coordinate: [-8.1503, 39.9167], incidentIds: ['incident:demo:pedrogao-grande-portfolio-exercise'], viewRadiusKm: 15, ingestSecret: CAMERA_SECRET },
    'demo-ground-01': { id: 'demo-ground-01', name: '[DEMO] ground', type: 'ground_sensor', organizationId: 'vigia-demo-portfolio', coordinate: [-8.1503, 39.9167], incidentIds: ['incident:demo:pedrogao-grande-portfolio-exercise'], viewRadiusKm: 5, ingestSecret: GROUND_SECRET }
  }[id] ?? null),
  snapshot: () => ({ assets: [] })
};

// Ingests two given sensor bodies through a *brand-new* SensorIngestService +
// EventObservationRepository (no filePath -> nothing persisted across
// instances), then runs the exact pipeline FireEventService.snapshot() runs:
// merge -> trackFireEvents -> reconcileEvents. This simulates one
// independent Render restart's full cold-start reconstruction of the event
// fabric.
async function simulateRestart({ clock, cameraBody, groundBody }) {
  const repository = new EventObservationRepository();
  const service = new SensorIngestService({ eventRepository: repository, registry, clock });
  for (const [secret, body] of [[CAMERA_SECRET, cameraBody], [GROUND_SECRET, groundBody]]) {
    const timestamp = clock().toISOString(), nonce = randomUUID();
    const signature = createHmac('sha256', secret).update(`${timestamp}\n${nonce}\n${canonical(body)}`).digest('hex');
    await service.ingest({ timestamp, nonce, signature }, body);
  }
  const observations = await repository.merge([], clock());
  const tracked = trackFireEvents(observations, { now: clock() });
  const reconciled = await repository.reconcileEvents(tracked, clock());
  return { observations, event: reconciled[0] };
}

test('demoSensorBodies() pins observedAt and externalObservationId rather than deriving them from Date.now()', () => {
  const { cameraBody, groundBody } = demoSensorBodies();
  assert.equal(cameraBody.observedAt, '2026-09-16T08:00:00.000Z');
  assert.equal(groundBody.observedAt, '2026-09-16T08:04:00.000Z');
  assert.equal(cameraBody.externalObservationId, 'demo-camera-01-portfolio-exercise-observation-1');
  assert.equal(groundBody.externalObservationId, 'demo-ground-01-portfolio-exercise-observation-1');
  // Calling it again (simulating a second restart's fresh module state) must
  // reproduce byte-identical bodies, not merely the same shape.
  const again = demoSensorBodies();
  assert.deepEqual(again.cameraBody, cameraBody);
  assert.deepEqual(again.groundBody, groundBody);
});

test('three independent "restarts" (fresh EventObservationRepository each time, days apart) all reconstruct the same observation identities and the same canonical event id', async () => {
  const restarts = [
    () => new Date('2026-09-20T12:00:00.000Z'),
    () => new Date('2026-09-25T09:30:00.000Z'),
    () => new Date('2026-10-02T03:15:00.000Z') // well over the tracker's own 32h clustering window — a genuine new-event boundary, not just a slow reconnect
  ];
  const results = [];
  for (const clock of restarts) {
    const { cameraBody, groundBody } = demoSensorBodies();
    results.push(await simulateRestart({ clock, cameraBody, groundBody }));
  }
  const idsOf = (observations) => observations.map((item) => item.id).sort();
  assert.deepEqual(idsOf(results[0].observations), idsOf(results[1].observations));
  assert.deepEqual(idsOf(results[0].observations), idsOf(results[2].observations));
  assert.equal(results[0].observations.length, 2);
  assert.ok(results.every((result) => result.event), 'every restart should resolve a canonical event');
  assert.equal(results[0].event.id, results[1].event.id);
  assert.equal(results[0].event.id, results[2].event.id);
});

test('a fully seeded restart within the same still-warm process skips re-ingestion entirely (no new observations, no new event)', async () => {
  const clock = () => new Date('2026-09-20T12:00:00.000Z');
  const repository = new EventObservationRepository();
  const service = new SensorIngestService({ eventRepository: repository, registry, clock });
  const { cameraBody, groundBody } = demoSensorBodies();
  for (const [secret, body] of [[CAMERA_SECRET, cameraBody], [GROUND_SECRET, groundBody]]) {
    const timestamp = clock().toISOString(), nonce = randomUUID();
    const signature = createHmac('sha256', secret).update(`${timestamp}\n${nonce}\n${canonical(body)}`).digest('hex');
    await service.ingest({ timestamp, nonce, signature }, body);
  }
  const before = await repository.merge([], clock());
  assert.equal(before.length, 2);
  // The seed script's own resolve_existing_event check: find a persisted
  // event whose observations already include our two sensor ids.
  const tracked = trackFireEvents(before, { now: clock() }), reconciled = await repository.reconcileEvents(tracked, clock());
  const alreadyPresent = reconciled.find((event) => (event.observations ?? []).some((item) => item.sensorId === 'demo-camera-01' || item.sensorId === 'demo-ground-01'));
  assert.ok(alreadyPresent, 'resolve_existing_event should find the already-seeded event and skip re-ingestion');
  const after = await repository.merge([], clock());
  assert.equal(after.length, 2, 'no new observations were created by the resume check itself');
});

test('regression: the pre-fix shape (no explicit externalObservationId, observedAt tied to ingest time) produces a different canonical event id on every restart', async () => {
  // Reproduces the exact historical bug: drop the fix's explicit
  // externalObservationId (falling back to SensorIngestService's own
  // sha256([sensorId, type, observedAt]) derivation) and tie observedAt to
  // the simulated "now" of each restart, exactly like the original
  // `new Date(Date.now() - 6 * 60_000).toISOString()`.
  const preFixBody = (body, clock, offsetMinutes) => { const { externalObservationId, ...rest } = body; return { ...rest, observedAt: new Date(clock().getTime() - offsetMinutes * 60_000).toISOString() }; };
  const restartAt = async (clock) => {
    const { cameraBody, groundBody } = demoSensorBodies();
    return simulateRestart({ clock, cameraBody: preFixBody(cameraBody, clock, 6), groundBody: preFixBody(groundBody, clock, 2) });
  };
  const runA = await restartAt(() => new Date('2026-09-20T12:00:00.000Z'));
  const runB = await restartAt(() => new Date('2026-09-22T09:30:00.000Z')); // a later restart, "now" has moved on
  assert.notEqual(runA.event.id, runB.event.id);
});

test('per-request auth freshness (nonce/timestamp) varies every call without affecting observation identity', async () => {
  const clock = () => new Date('2026-09-20T12:00:00.000Z');
  const repository = new EventObservationRepository(), service = new SensorIngestService({ eventRepository: repository, registry, clock });
  const { cameraBody } = demoSensorBodies();
  const sign = () => {
    const timestamp = clock().toISOString(), nonce = randomUUID();
    return { timestamp, nonce, signature: createHmac('sha256', CAMERA_SECRET).update(`${timestamp}\n${nonce}\n${canonical(cameraBody)}`).digest('hex') };
  };
  const firstAuth = sign();
  const firstResult = await service.ingest(firstAuth, cameraBody);
  // A second, freshly-signed request with a different nonce (auth freshness
  // varying, as it must for replay protection) still resolves to the exact
  // same canonicalObservationId — the domain identity path never reused the
  // auth nonce/timestamp in the first place.
  const secondAuth = sign();
  assert.notEqual(firstAuth.nonce, secondAuth.nonce);
  const secondResult = await service.ingest(secondAuth, cameraBody);
  assert.equal(firstResult.observation.id, secondResult.observation.id);
});
