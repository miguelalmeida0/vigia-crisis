// Regression coverage for the exact failure the live vigia-portfolio-demo
// Neon database hit: a prior seed attempt durably committed an
// INCIDENT_IMPORTED event for the demo incident id, then a later attempt
// re-derived a *different* canonicalEventIds/startedAt for the same
// incidentId and tripped IncidentCommandService's duplicate-identity guard
// (duplicate_incident_identity_conflict) forever after, because nothing
// about the seed script's own retry logic ever reconciled the two.
//
// resolveDemoImportIdentity() (scripts/seed_demo_portfolio_scenario.mjs) is
// the fix: when an incident-command record already exists for the demo's
// exclusively-owned incident id, reuse its already-persisted
// canonicalEventIds/startedAt instead of re-deriving them, so every retry
// converges on the same sourcePayloadHash the first successful commit
// produced.
//
// These tests exercise the real IncidentCommandService + the real
// applyIncidentCommandEvent reducer (both duplicate-identity guards live
// there: one in the service before recordImport, one independently inside
// the reducer during append) against a small in-memory fake repository, in
// the same style already used by apps/api/test/command-intent-workflow.test.mjs.
// No live Postgres is available in this environment; the fake repository
// implements exactly the state/append/recordImport contract
// PostgresIncidentCommandRepository provides, so the service code under test
// is unmodified and the same as production.

import assert from 'node:assert/strict';
import test from 'node:test';
import { IncidentCommandService } from '../src/modules/incident-command/incident-command-service.mjs';
import { applyIncidentCommandEvent } from '../../../packages/domain/src/incident-command/reducer.mjs';
import { resolveDemoImportIdentity } from '../../../scripts/seed_demo_portfolio_scenario.mjs';

const incidentId = 'incident:demo:pedrogao-grande-portfolio-exercise';
const releaseId = 'release:demo-seed-test';
const actorId = 'vigia-demo-seed-script';
const authorizationActor = { id: actorId, role: 'administrator', incidentScopes: ['*'] };

function fakeRepository() {
  let state = null;
  const events = new Map();
  const imports = new Map();
  return {
    state: async (id) => (id === incidentId ? structuredClone(state) : null),
    append: async (event) => {
      if (events.has(event.eventId)) return { duplicate: true, state: structuredClone(state) };
      events.set(event.eventId, structuredClone(event));
      state = applyIncidentCommandEvent(state, event);
      return { duplicate: false, state: structuredClone(state) };
    },
    recordImport: async (input, status) => {
      // Mirrors PostgresIncidentCommandRepository.recordImport's
      // INSERT ... ON CONFLICT(source_system, source_payload_hash) DO NOTHING:
      // the first writer gets duplicate:false, every later caller for the
      // same (sourceSystem, sourcePayloadHash) gets duplicate:true back.
      const key = `${input.sourceSystem}|${input.sourcePayloadHash}`;
      if (imports.has(key)) return { duplicate: true, ...structuredClone(imports.get(key)) };
      const record = { importId: input.importId, incidentId: input.incidentId, sourcePayloadHash: input.sourcePayloadHash, status, receivedAt: new Date().toISOString() };
      imports.set(key, record);
      return { duplicate: false, ...structuredClone(record) };
    },
    verify: async () => ({ valid: true, records: events.size, headHash: null, envelopesVerified: 0, scope: 'TEST_STUB' }),
  };
}

const baseImportInput = (canonicalEventIds, startedAt) => ({
  adapter: 'SHADOW_JSON', universe: 'SHADOW', sourceSystem: 'vigia-demo-portfolio-generator',
  incidentId, canonicalEventIds, reportRecordIds: [], sourcePayload: null,
  incident: { label: '[DEMO] Portfolio exercise', type: 'WILDFIRE', district: 'Leiria', municipality: 'Pedrógão Grande', coordinate: [-8.1503, 39.9167], startedAt, note: 'Synthetic.' },
  organization: { name: '[DEMO] Command', agency: 'Exercise Bombeiros Voluntários (synthetic)', incidentCommander: 'personnel:demo:ic-1' },
  people: [{ personId: 'personnel:demo:ic-1', name: '[DEMO] IC', role: 'INCIDENT_COMMAND', state: 'ASSIGNED' }],
  crews: [{ crewId: 'crew:demo:alpha', name: '[DEMO] Crew Alpha', memberIds: ['personnel:demo:ic-1'] }],
  resources: [{ resourceId: 'resource:demo:engine-1', type: 'ENGINE', label: '[DEMO] Engine 1', state: 'WORKING', coordinate: [-8.1503, 39.9167] }],
  waterSources: [{ waterSourceId: 'water:demo:reservoir-1', type: 'RESERVOIR', label: '[DEMO] Reservoir', coordinate: [-8.1503, 39.9167] }],
  hazards: [{ hazardId: 'hazard:demo:steep-terrain', type: 'TERRAIN', label: '[DEMO] Steep terrain', coordinate: [-8.1503, 39.9167] }],
  preplans: [],
});

test('resolveDemoImportIdentity uses the freshly resolved event when no incident is persisted yet (fresh DB / first seed)', () => {
  const identity = resolveDemoImportIdentity({
    existingIncident: null,
    matchedEvent: { id: 'PT-2026-FRESH', firstSeenAt: '2026-09-16T08:00:00.000Z' },
    canonicalEventId: 'PT-2026-FRESH',
  });
  assert.deepEqual(identity, { canonicalEventIds: ['PT-2026-FRESH'], startedAt: '2026-09-16T08:00:00.000Z', resumedFromExistingImport: false });
});

test('resolveDemoImportIdentity reuses the already-persisted canonicalEventIds/startedAt when an incident import already exists', () => {
  const identity = resolveDemoImportIdentity({
    existingIncident: { canonicalEventIds: ['PT-2026-OLD'], startedAt: '2026-09-10T03:00:00.000Z', importId: 'command-import-old' },
    matchedEvent: { id: 'PT-2026-NEW', firstSeenAt: '2026-09-16T08:00:00.000Z' },
    canonicalEventId: 'PT-2026-NEW',
  });
  assert.deepEqual(identity, { canonicalEventIds: ['PT-2026-OLD'], startedAt: '2026-09-10T03:00:00.000Z', resumedFromExistingImport: true });
});

test('resolveDemoImportIdentity falls back to the freshly resolved event if the persisted incident is missing those fields', () => {
  const identity = resolveDemoImportIdentity({
    existingIncident: { canonicalEventIds: [], startedAt: null },
    matchedEvent: { id: 'PT-2026-NEW', firstSeenAt: '2026-09-16T08:00:00.000Z' },
    canonicalEventId: 'PT-2026-NEW',
  });
  assert.equal(identity.resumedFromExistingImport, false);
  assert.deepEqual(identity.canonicalEventIds, ['PT-2026-NEW']);
});

test('reproduces the live Neon failure: a stale persisted import identity collides with a freshly re-derived one', async () => {
  const repository = fakeRepository(), service = new IncidentCommandService({ repository, releaseId });

  // Simulates an earlier (pre-fix, or otherwise stale) seed attempt that
  // already durably committed this incident under an older canonical
  // event / startedAt.
  const first = await service.importIncident(baseImportInput(['PT-2026-OLD'], '2026-09-10T03:00:00.000Z'), actorId, authorizationActor);
  assert.equal(first.receipt.idempotentReplay, false);

  // A later attempt naively re-deriving a *different* canonicalEventIds/startedAt
  // for the very same incidentId — exactly what the unfixed seed script did.
  await assert.rejects(
    () => service.importIncident(baseImportInput(['PT-2026-NEW'], '2026-09-16T08:00:00.000Z'), actorId, authorizationActor),
    (error) => error.message === 'duplicate_incident_identity_conflict' && error.statusCode === 409,
  );
});

test('the fix resolves the exact same collision by reusing the persisted import identity, and repeat restarts stay a safe no-op', async () => {
  const repository = fakeRepository(), service = new IncidentCommandService({ repository, releaseId });

  // First-ever successful seed run.
  const first = await service.importIncident(baseImportInput(['PT-2026-OLD'], '2026-09-10T03:00:00.000Z'), actorId, authorizationActor);
  assert.equal(first.receipt.idempotentReplay, false);
  assert.equal(first.state.incident.canonicalEventIds[0], 'PT-2026-OLD');

  // A restart resolves a *different* fresh canonical event (e.g. re-fusion,
  // or a code change in startedAt derivation) but the fixed seed script
  // consults the already-persisted incident first via resolveDemoImportIdentity().
  const existingIncident = (await repository.state(incidentId)).incident;
  const identity = resolveDemoImportIdentity({
    existingIncident,
    matchedEvent: { id: 'PT-2026-NEW', firstSeenAt: '2026-09-16T08:00:00.000Z' },
    canonicalEventId: 'PT-2026-NEW',
  });
  assert.equal(identity.resumedFromExistingImport, true);

  const resumed = await service.importIncident(baseImportInput(identity.canonicalEventIds, identity.startedAt), actorId, authorizationActor);
  assert.equal(resumed.receipt.idempotentReplay, true);
  assert.equal(resumed.state.incident.canonicalEventIds[0], 'PT-2026-OLD');
  // All sub-records from the original import are intact.
  assert.ok(resumed.state.organization?.name);
  assert.ok(resumed.state.persons?.['personnel:demo:ic-1']);
  assert.ok(resumed.state.crews?.['crew:demo:alpha']);
  assert.ok(resumed.state.resources?.['resource:demo:engine-1']);
  assert.ok(resumed.state.waterSources?.['water:demo:reservoir-1']);
  assert.ok(resumed.state.hazards?.['hazard:demo:steep-terrain']);

  // Restarting again (e.g. Render restarting a healthy container) must stay
  // a deterministic, safe no-op — never a new incident, never duplicated
  // records, never another conflict.
  const existingIncidentAgain = (await repository.state(incidentId)).incident;
  const identityAgain = resolveDemoImportIdentity({
    existingIncident: existingIncidentAgain,
    matchedEvent: { id: 'PT-2026-NEWER', firstSeenAt: '2026-09-17T08:00:00.000Z' },
    canonicalEventId: 'PT-2026-NEWER',
  });
  const again = await service.importIncident(baseImportInput(identityAgain.canonicalEventIds, identityAgain.startedAt), actorId, authorizationActor);
  assert.equal(again.receipt.idempotentReplay, true);
  assert.equal(again.state.incident.canonicalEventIds[0], 'PT-2026-OLD');
});
