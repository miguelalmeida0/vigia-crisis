// Deterministic, idempotent, resumable seed script for the isolated VIGIA
// Portfolio Demo.
//
// This script never writes to production. It refuses to run unless the
// operator explicitly confirms the target database is a dedicated demo/shadow
// database (VIGIA_DEMO_CONFIRM=SYNTHETIC_DEMO_ONLY), and it hard-refuses any
// database URL that matches a known production identifier.
//
// It seeds exactly one incident, entirely through VIGIA's own governed domain
// paths — never raw SQL:
//   1. Two independent, signed sensor observations (camera + ground sensor)
//      ingested through SensorIngestService.ingest(), the same code path
//      registered field devices use in production. This drives the real
//      event-fabric fusion/tracking pipeline and produces a genuine canonical
//      VIGIA event, stored in the real PostGIS-backed tables.
//   2. A SHADOW-universe incident-command import (adapter SHADOW_JSON) through
//      IncidentCommandService.importIncident(), the same governed CAD/roster
//      import contract production CAD/roster imports use. universe:'SHADOW'
//      is a first-class, enforced domain concept: source-adapters.mjs already
//      refuses to let a SHADOW-adapter import enter PRODUCTION truth, and
//      every command event derived from it is automatically stamped
//      exercise:true by IncidentCommandService itself.
//
// Every label in this scenario is prefixed [DEMO / SYNTHETIC SCENARIO] and the
// incident id itself encodes "demo" + "exercise", so the labelling survives
// independently of which UI surface renders it.
//
// RESUMABILITY: this script checks real, persisted state before doing each
// piece of work (never a separate "did I run before" flag), so it is safe to
// run repeatedly against a fresh database, a database left partially seeded
// by a previous failed/killed deploy, or an already fully-seeded database:
//   - if a canonical event from our two sensors already exists, sensor
//     ingestion is skipped and that event is reused (never re-ingested with a
//     fresh now()-relative timestamp, which would otherwise accumulate
//     near-duplicate observations across repeated failed attempts);
//   - if the incident-command import already completed, it is skipped;
//   - otherwise exactly the missing step(s) run.
//
// INSTRUMENTATION: every phase is timestamped and timed (mirrors the
// onStartupPhase mechanism apps/api/src/server.mjs already uses for the real
// API process), and every step that talks to Postgres or the event-fabric is
// wrapped in an explicit bounded timeout (withTimeout) so a genuine hang
// fails fast with a clear, labelled error instead of hanging silently.

import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { writeFile, mkdir, rm } from 'node:fs/promises';

import { loadConfig } from '../apps/api/src/config/env.mjs';
import { createServices } from '../apps/api/src/application/create-services.mjs';
import { SseHub } from '../apps/api/src/stream/sse-hub.mjs';
import { ReleaseIdentityService } from '../apps/api/src/modules/release/release-identity-service.mjs';
import { withTimeout } from '../apps/api/src/shared/with-timeout.mjs';

const KNOWN_PRODUCTION_MARKERS = ['vigia-public-demo-db', 'vigia-live'];
const CREATE_SERVICES_TIMEOUT_MS = Number(process.env.VIGIA_CREATE_SERVICES_TIMEOUT_MS) || 150_000;
const STEP_TIMEOUT_MS = Number(process.env.VIGIA_DEMO_SEED_STEP_TIMEOUT_MS) || 60_000;

function requireDemoConfirmation() {
  if (process.env.VIGIA_DEMO_CONFIRM !== 'SYNTHETIC_DEMO_ONLY') {
    throw new Error(
      'Refusing to seed: set VIGIA_DEMO_CONFIRM=SYNTHETIC_DEMO_ONLY to confirm the target ' +
      'database is a dedicated, isolated demo/shadow database that is never production.'
    );
  }
  const url = String(process.env.VIGIA_DATABASE_URL || '');
  if (!url) throw new Error('VIGIA_DATABASE_URL is required.');
  for (const marker of KNOWN_PRODUCTION_MARKERS) {
    if (url.toLowerCase().includes(marker)) {
      throw new Error(`Refusing to seed: VIGIA_DATABASE_URL contains "${marker}", a known production identifier.`);
    }
  }
}

// Must exactly mirror the unexported canonical()/HMAC scheme in
// apps/api/src/modules/sensors/sensor-ingest-service.mjs so signatures verify.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function signObservation(secret, body, timestamp, nonce) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}\n${nonce}\n${canonical(body)}`).digest('hex');
}

const DEMO_INCIDENT_ID = 'incident:demo:pedrogao-grande-portfolio-exercise';
// Real Portugal wildfire-country coordinate (Pedrógão Grande, Leiria district),
// inside the sensor ingest service's Portugal bounding-box gate.
const COORD = [-8.1503, 39.9167];

// Fixed, deterministic domain content for the two synthetic observations —
// NOT Date.now()-relative.
//
// SensorIngestService derives a sensor observation's canonicalObservationId
// from [..., externalObservationId], and externalObservationId itself
// defaults to a hash of [sensorId, type, observedAt] whenever none is
// supplied. The canonical event's externally-visible id, in turn, comes not
// from fire-event-tracker's stableId() but from
// EventObservationRepository.reconcileEvents()'s generatedEventId(), which
// hashes `physical-event:${id}` of whichever observation in the event has
// the earliest receivedAt/observedAt. And critically,
// EventObservationRepository (apps/api/src/application/create-services.mjs)
// is backed by a *local file* on the container's own filesystem —
// PostgresPhysicalTruthStore is wired in only as a write-through
// `mirrorStore`, never read back from. On Render that local file does not
// survive a container restart, so this repository — and therefore the
// canonical event id — starts from a blank slate on *every* restart, not
// just on a genuinely fresh database. Re-ingestion of these two
// observations therefore actually runs on every single restart in
// practice, so their identity must be reproducible from fixed inputs alone.
//
// A wall-clock-relative observedAt (the previous `Date.now() - 6min`) made
// both the observation identity and the canonical event id different on
// every restart, which is exactly what produced the live Neon failure: a
// persisted incident import permanently referencing a canonical event id no
// later boot could ever reproduce. Pinning both observedAt and
// externalObservationId makes every restart's re-ingestion always
// reconstruct the exact same observations and the exact same canonical
// event id. This is the scenario's one-time "exercise start" moment; the
// console honestly shows the scenario's true elapsed age from here rather
// than a perpetually-refreshed fake "a few minutes ago".
const SCENARIO_STARTED_AT = Date.parse('2026-09-16T08:00:00.000Z');
const CAMERA_OBSERVED_AT = new Date(SCENARIO_STARTED_AT).toISOString();
const GROUND_OBSERVED_AT = new Date(SCENARIO_STARTED_AT + 4 * 60_000).toISOString();

// Exported so a regression test can assert on the exact bodies this script
// actually sends, rather than a hand-copied stand-in that could drift.
export function demoSensorBodies() {
  return {
    cameraBody: {
      sensorId: 'demo-camera-01', incidentId: DEMO_INCIDENT_ID, coordinate: COORD, observedAt: CAMERA_OBSERVED_AT,
      externalObservationId: 'demo-camera-01-portfolio-exercise-observation-1',
      classification: 'smoke_visible', confidence: 0.78,
      metadata: { demo: true, scenario: 'portfolio-exercise', label: '[DEMO / SYNTHETIC SCENARIO] Portfolio exercise — synthetic camera detection, not a real hazard.' }
    },
    groundBody: {
      sensorId: 'demo-ground-01', incidentId: DEMO_INCIDENT_ID, coordinate: COORD, observedAt: GROUND_OBSERVED_AT,
      externalObservationId: 'demo-ground-01-portfolio-exercise-observation-1',
      classification: 'heat_signature', confidence: 0.71,
      metadata: { demo: true, scenario: 'portfolio-exercise', label: '[DEMO / SYNTHETIC SCENARIO] Portfolio exercise — synthetic ground sensor reading, not a real hazard.' }
    }
  };
}

// IncidentCommandService.importIncident() refuses to re-import an incidentId
// whose already-persisted `incident.importHash` doesn't match the hash of
// what's being submitted now (duplicate_incident_identity_conflict — enforced
// both in the service and, independently, in the reducer itself). That hash
// covers everything in the import payload, including canonicalEventIds and
// incident.startedAt. Those two fields are the only ones this script cannot
// hardcode: canonicalEventIds depends on whichever event the sensor-fusion
// pipeline resolves, and startedAt is derived from that event's firstSeenAt.
//
// A prior seed attempt (any code version, including ones before this file's
// own history of fixes) may have already durably committed an
// INCIDENT_IMPORTED event for DEMO_INCIDENT_ID using whatever event/timestamp
// were live *at that time*. If this run naively re-derives those two fields
// fresh, they can come out different from what's already stored — even
// though nothing is actually wrong — and importIncident() will legitimately
// (and correctly) refuse the mismatched re-import forever after, since
// nothing in this script's own retry logic ever changes them back.
//
// The fix: when an incident-command record already exists for this exact,
// exclusively-owned demo incident id, treat its already-persisted
// canonicalEventIds/startedAt as the source of truth and reuse them
// byte-for-byte, rather than re-deriving them from whatever resolves this
// run. This makes every retry converge on the same sourcePayloadHash the
// first successful commit produced, so importIncident() sees a true replay
// (idempotentReplay: true, or a resumed partial import) instead of a
// (correctly rejected) conflicting re-import. It never weakens the
// duplicate-identity guard itself — it just stops accidentally tripping it.
export function resolveDemoImportIdentity({ existingIncident, matchedEvent, canonicalEventId }) {
  const resumedFromExistingImport = Boolean(existingIncident?.canonicalEventIds?.length && existingIncident?.startedAt);
  return resumedFromExistingImport
    ? { canonicalEventIds: existingIncident.canonicalEventIds, startedAt: existingIncident.startedAt, resumedFromExistingImport: true }
    : { canonicalEventIds: [canonicalEventId], startedAt: matchedEvent.firstSeenAt ?? matchedEvent.lastSeenAt, resumedFromExistingImport: false };
}

// --- phase instrumentation -------------------------------------------------
const startedAt = Date.now();
let lastPhase = 'process_starting';
function log(step, details = {}) {
  console.log(JSON.stringify({ step, elapsedMs: Date.now() - startedAt, ...details }));
}
async function phase(name, ms, factory) {
  lastPhase = name;
  log('phase_started', { phase: name });
  const phaseStartedAt = Date.now();
  try {
    const result = await withTimeout(factory, { ms, label: name });
    log('phase_completed', { phase: name, phaseMs: Date.now() - phaseStartedAt });
    return result;
  } catch (error) {
    log('phase_failed', { phase: name, phaseMs: Date.now() - phaseStartedAt, error: String(error?.message ?? error) });
    throw error;
  }
}

async function main() {
  requireDemoConfirmation();

  const registryDir = await mkdirTemp();
  const registryPath = path.join(registryDir, 'sensors.json');
  const cameraSecret = crypto.randomBytes(32).toString('hex');
  const groundSecret = crypto.randomBytes(32).toString('hex');
  await writeFile(registryPath, JSON.stringify({
    version: 1,
    assets: [
      {
        id: 'demo-camera-01', name: '[DEMO] Serra watch camera (synthetic)', type: 'camera',
        organizationId: 'vigia-demo-portfolio', coordinate: COORD, incidentIds: [DEMO_INCIDENT_ID],
        viewRadiusKm: 15, ingestSecret: cameraSecret
      },
      {
        id: 'demo-ground-01', name: '[DEMO] Ground thermal sensor (synthetic)', type: 'ground_sensor',
        organizationId: 'vigia-demo-portfolio', coordinate: COORD, incidentIds: [DEMO_INCIDENT_ID],
        viewRadiusKm: 5, ingestSecret: groundSecret
      }
    ]
  }, null, 2));
  process.env.VIGIA_SENSOR_REGISTRY_FILE = registryPath;

  const environmentConfig = loadConfig();
  const releaseIdentityService = new ReleaseIdentityService({
    projectRoot: environmentConfig.projectRoot, runtimeProfile: environmentConfig.runtimeProfile, component: 'api',
    expectedReleaseId: environmentConfig.releaseIdAssertion, expectedCodeStateHash: environmentConfig.codeStateHashAssertion,
    expectedOperationalDataHash: environmentConfig.operationalDataHashAssertion, expectedStatementHash: environmentConfig.releaseStatementHashAssertion
  });
  const releaseIdentity = releaseIdentityService.identity();
  // Mirror apps/api/src/server.mjs exactly: config.releaseId must be the
  // verified manifest release id, or createServices refuses to start.
  const config = Object.freeze({ ...environmentConfig, releaseId: releaseIdentity.releaseId });
  const hub = new SseHub();

  // createServices() itself reports named sub-phases (core_storage,
  // acquisition_archive_index, world_and_geospatial_state, ...) via the exact
  // same onStartupPhase mechanism the real API process uses. Wiring it here —
  // which the previous version of this script did not do — is what turns "no
  // output for 14 minutes" into a precise phase-and-timing trail.
  const services = await phase('createServices', CREATE_SERVICES_TIMEOUT_MS, () => createServices({
    config, hub, releaseIdentity,
    onStartupPhase: ({ phase: subPhase, state, ...details }) => log('createServices_subphase', { subPhase, state, ...details })
  }));
  log('services_ready', { postgis: services.physicalTruthStore?.status?.().state ?? 'unknown' });

  // --- resume from whatever state already exists --------------------------
  let matchedEvent = await phase('resolve_existing_event', STEP_TIMEOUT_MS, async () => {
    const snapshot = await services.operationalEventService.snapshot({ force: true });
    return (snapshot.events ?? []).find((event) =>
      (event.observations ?? []).some((observation) => observation.sensorId === 'demo-camera-01' || observation.sensorId === 'demo-ground-01')
    ) ?? null;
  });

  if (matchedEvent) {
    log('sensor_observations_already_present', { canonicalEventId: matchedEvent.id, note: 'Resuming from a partially seeded database; skipping re-ingestion.' });
  } else {
    const { cameraBody, groundBody } = demoSensorBodies();

    await phase('ingest_sensor_observations', STEP_TIMEOUT_MS, async () => {
      for (const [asset, secret, body] of [['demo-camera-01', cameraSecret, cameraBody], ['demo-ground-01', groundSecret, groundBody]]) {
        const timestamp = new Date().toISOString(), nonce = crypto.randomUUID();
        const signature = signObservation(secret, body, timestamp, nonce);
        const result = await services.sensorIngestService.ingest({ timestamp, nonce, signature }, body);
        log('sensor_observation_ingested', { asset, observationId: result.observation?.id });
      }
    });

    const matched = await phase('resolve_event_after_ingest', STEP_TIMEOUT_MS, async () => {
      const snapshot = await services.operationalEventService.snapshot({ force: true });
      return (snapshot.events ?? []).find((event) =>
        (event.observations ?? []).some((observation) => observation.sensorId === 'demo-camera-01' || observation.sensorId === 'demo-ground-01')
      ) ?? null;
    });
    if (!matched) {
      log('no_matching_canonical_event', { hint: 'The sensor observations were ingested but the event-fabric tracker did not cluster them into a resolvable event.' });
      process.exit(1);
    }
    matchedEvent = matched;
    log('canonical_event_resolved', { canonicalEventId: matched.id, evidenceState: matched.evidenceState, physicalOperationalState: matched.physicalOperationalState });
  }
  const canonicalEventId = matchedEvent.id;

  // --- incident-command import -------------------------------------------
  // importIncident() is idempotent by construction: every person/crew/
  // resource/etc. event it appends has a deterministic id derived from
  // importId + the record's own id (see IncidentCommandService.importIncident
  // and PostgresIncidentCommandRepository), so calling it again after a crash
  // mid-loop safely completes only the records that never landed, and calling
  // it again after a fully successful import is a cheap no-op
  // (receipt.idempotentReplay: true) rather than an error — as long as the
  // payload is byte-for-byte identical across attempts. See
  // resolveDemoImportIdentity() above for why canonicalEventIds/startedAt are
  // resolved from any already-persisted incident record first, rather than
  // freshly every run.
  // This is deliberately NOT skipped when a prior partial attempt already
  // created the incident-command record: only importIncident() itself knows
  // exactly which of its own sub-records still need to land.
  {
    const existingIncident = await phase('resolve_existing_incident_import', STEP_TIMEOUT_MS, async () => {
      const state = await services.incidentCommandService.repository.state(DEMO_INCIDENT_ID);
      return state?.incident ?? null;
    });
    const importIdentity = resolveDemoImportIdentity({ existingIncident, matchedEvent, canonicalEventId });
    if (importIdentity.resumedFromExistingImport) {
      log('resuming_from_existing_incident_import', {
        incidentId: DEMO_INCIDENT_ID, existingImportId: existingIncident.importId ?? null,
        canonicalEventIds: importIdentity.canonicalEventIds, startedAt: importIdentity.startedAt,
        note: 'A prior attempt already committed this incident\'s import identity; reusing its exact canonicalEventIds/startedAt so this retry reproduces the same sourcePayloadHash instead of colliding with importIncident\'s duplicate-identity guard.'
      });
    }

    const actor = { id: 'vigia-demo-seed-script', role: 'administrator', incidentScopes: ['*'] };
    const importInput = {
      adapter: 'SHADOW_JSON', universe: 'SHADOW', sourceSystem: 'vigia-demo-portfolio-generator',
      incidentId: DEMO_INCIDENT_ID, canonicalEventIds: importIdentity.canonicalEventIds, reportRecordIds: [],
      sourcePayload: null,
      incident: {
        label: '[DEMO / SYNTHETIC SCENARIO] Portfolio exercise — Pedrógão Grande wildfire drill',
        type: 'WILDFIRE', district: 'Leiria', municipality: 'Pedrógão Grande', coordinate: COORD,
        startedAt: importIdentity.startedAt, note: 'Synthetic portfolio exercise. Not a real incident. No operational authority.'
      },
      organization: { name: '[DEMO] VIGIA Portfolio Exercise Command', agency: 'Exercise Bombeiros Voluntários (synthetic)', incidentCommander: 'personnel:demo:ic-1' },
      people: [
        { personId: 'personnel:demo:ic-1', name: '[DEMO] Exercise Incident Commander', role: 'INCIDENT_COMMAND', state: 'ASSIGNED' },
        { personId: 'personnel:demo:officer-1', name: '[DEMO] Exercise Company Officer', role: 'COMPANY_OFFICER', state: 'WORKING' },
        { personId: 'personnel:demo:ff-1', name: '[DEMO] Exercise Firefighter 1', role: 'FIREFIGHTER', state: 'WORKING' },
        { personId: 'personnel:demo:ff-2', name: '[DEMO] Exercise Firefighter 2', role: 'FIREFIGHTER', state: 'STAGED' }
      ],
      crews: [
        { crewId: 'crew:demo:alpha', name: '[DEMO] Crew Alpha', memberIds: ['personnel:demo:officer-1', 'personnel:demo:ff-1'] },
        { crewId: 'crew:demo:bravo', name: '[DEMO] Crew Bravo', memberIds: ['personnel:demo:ff-2'] }
      ],
      resources: [
        { resourceId: 'resource:demo:engine-1', type: 'ENGINE', label: '[DEMO] Exercise Engine 1', state: 'WORKING', coordinate: COORD },
        { resourceId: 'resource:demo:tanker-1', type: 'WATER_TANKER', label: '[DEMO] Exercise Water Tanker 1', state: 'EN_ROUTE', coordinate: COORD }
      ],
      waterSources: [
        { waterSourceId: 'water:demo:reservoir-1', type: 'RESERVOIR', label: '[DEMO] Exercise reservoir', coordinate: COORD }
      ],
      hazards: [
        { hazardId: 'hazard:demo:steep-terrain', type: 'TERRAIN', label: '[DEMO] Steep terrain access constraint (synthetic)', coordinate: COORD }
      ],
      preplans: [
        { preplanId: 'preplan:demo:exercise-1', label: '[DEMO] Portfolio exercise preplan', note: 'Synthetic preplan for demonstration only.' }
      ]
    };

    const importResult = await phase('import_incident_command', STEP_TIMEOUT_MS, () => services.incidentCommandService.importIncident(importInput, actor.id, actor));
    log('incident_command_imported', {
      incidentId: DEMO_INCIDENT_ID, canonicalEventId: importIdentity.canonicalEventIds[0],
      resumedFromExistingImport: importIdentity.resumedFromExistingImport,
      importStatus: importResult.validation?.status, acceptedRecords: importResult.validation?.acceptedRecords,
      receiptId: importResult.receipt?.receiptId, idempotentReplay: importResult.receipt?.idempotentReplay === true
    });
  }

  await rm(registryDir, { recursive: true, force: true });
  log('demo_scenario_seeded', {
    incidentId: DEMO_INCIDENT_ID, canonicalEventId, universe: 'SHADOW', exercise: true,
    note: 'Synthetic demo scenario seeded through VIGIA\'s own governed sensor-ingest and incident-command import paths.'
  });
  process.exit(0);
}

async function mkdirTemp() {
  const dir = path.join(os.tmpdir(), `vigia-demo-seed-${crypto.randomUUID()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

// Only auto-run when executed directly (render-demo-start.mjs spawns this as
// its own process). Guarding this means resolveDemoImportIdentity() above
// can be imported by a regression test without also running the whole
// database-touching seed flow as an import side effect.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(JSON.stringify({ step: 'seed_failed', lastPhase, elapsedMs: Date.now() - startedAt, error: String(error?.message ?? error), stack: error?.stack }));
    process.exit(1);
  });
}
