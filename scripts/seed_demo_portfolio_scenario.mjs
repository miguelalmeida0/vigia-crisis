// Deterministic, idempotent seed script for the isolated VIGIA Portfolio Demo.
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

import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { writeFile, mkdir, rm } from 'node:fs/promises';

import { loadConfig } from '../apps/api/src/config/env.mjs';
import { createServices } from '../apps/api/src/application/create-services.mjs';
import { SseHub } from '../apps/api/src/stream/sse-hub.mjs';
import { ReleaseIdentityService } from '../apps/api/src/modules/release/release-identity-service.mjs';

const KNOWN_PRODUCTION_MARKERS = ['vigia-public-demo-db', 'vigia-live'];

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
  console.log(JSON.stringify({ step: 'services_starting' }));
  const services = await createServices({ config, hub, releaseIdentity });
  console.log(JSON.stringify({ step: 'services_ready', postgis: services.physicalTruthStore?.status?.().state ?? 'unknown' }));

  // Idempotent: safe to run on every deploy/restart. If the demo scenario is
  // already seeded, do nothing rather than creating duplicate observations.
  const existing = await services.incidentCommandService.get(DEMO_INCIDENT_ID).catch(() => null);
  if (existing?.incident?.canonicalEventIds?.length) {
    console.log(JSON.stringify({
      step: 'already_seeded', incidentId: DEMO_INCIDENT_ID,
      canonicalEventIds: existing.incident.canonicalEventIds, note: 'Skipping re-seed.'
    }));
    process.exit(0);
  }

  const now = new Date();
  const observedCamera = new Date(now.getTime() - 6 * 60_000).toISOString();
  const observedGround = new Date(now.getTime() - 2 * 60_000).toISOString();

  const cameraBody = {
    sensorId: 'demo-camera-01', incidentId: DEMO_INCIDENT_ID, coordinate: COORD, observedAt: observedCamera,
    classification: 'smoke_visible', confidence: 0.78,
    metadata: { demo: true, scenario: 'portfolio-exercise', label: '[DEMO / SYNTHETIC SCENARIO] Portfolio exercise — synthetic camera detection, not a real hazard.' }
  };
  const groundBody = {
    sensorId: 'demo-ground-01', incidentId: DEMO_INCIDENT_ID, coordinate: COORD, observedAt: observedGround,
    classification: 'heat_signature', confidence: 0.71,
    metadata: { demo: true, scenario: 'portfolio-exercise', label: '[DEMO / SYNTHETIC SCENARIO] Portfolio exercise — synthetic ground sensor reading, not a real hazard.' }
  };

  for (const [asset, secret, body] of [['demo-camera-01', cameraSecret, cameraBody], ['demo-ground-01', groundSecret, groundBody]]) {
    const timestamp = new Date().toISOString(), nonce = crypto.randomUUID();
    const signature = signObservation(secret, body, timestamp, nonce);
    const result = await services.sensorIngestService.ingest({ timestamp, nonce, signature }, body);
    console.log(JSON.stringify({ step: 'sensor_observation_ingested', asset, observationId: result.observation?.id }));
  }

  console.log(JSON.stringify({ step: 'forcing_event_fabric_rebuild' }));
  const eventSnapshot = await services.operationalEventService.snapshot({ force: true });
  const matched = (eventSnapshot.events ?? []).find((event) =>
    (event.observations ?? []).some((observation) => observation.sensorId === 'demo-camera-01' || observation.sensorId === 'demo-ground-01')
  );
  if (!matched) {
    console.error(JSON.stringify({
      step: 'no_matching_canonical_event', totalEvents: (eventSnapshot.events ?? []).length,
      hint: 'The sensor observations were ingested but the event-fabric tracker did not cluster them into a resolvable event.'
    }));
    process.exit(1);
  }
  const canonicalEventId = matched.id;
  console.log(JSON.stringify({ step: 'canonical_event_resolved', canonicalEventId, evidenceState: matched.evidenceState, physicalOperationalState: matched.physicalOperationalState }));

  const actor = { id: 'vigia-demo-seed-script', role: 'administrator', incidentScopes: ['*'] };
  const importInput = {
    adapter: 'SHADOW_JSON', universe: 'SHADOW', sourceSystem: 'vigia-demo-portfolio-generator',
    incidentId: DEMO_INCIDENT_ID, canonicalEventIds: [canonicalEventId], reportRecordIds: [],
    sourcePayload: null,
    incident: {
      label: '[DEMO / SYNTHETIC SCENARIO] Portfolio exercise — Pedrógão Grande wildfire drill',
      type: 'WILDFIRE', district: 'Leiria', municipality: 'Pedrógão Grande', coordinate: COORD,
      startedAt: observedCamera, note: 'Synthetic portfolio exercise. Not a real incident. No operational authority.'
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

  const importResult = await services.incidentCommandService.importIncident(importInput, actor.id, actor);
  console.log(JSON.stringify({
    step: 'incident_command_imported', incidentId: DEMO_INCIDENT_ID, canonicalEventId,
    importStatus: importResult.validation?.status, acceptedRecords: importResult.validation?.acceptedRecords,
    receiptId: importResult.receipt?.receiptId
  }));

  await rm(registryDir, { recursive: true, force: true });
  console.log(JSON.stringify({
    step: 'demo_scenario_seeded', incidentId: DEMO_INCIDENT_ID, canonicalEventId,
    universe: 'SHADOW', exercise: true, note: 'Synthetic demo scenario seeded through VIGIA\'s own governed sensor-ingest and incident-command import paths.'
  }));
  process.exit(0);
}

async function mkdirTemp() {
  const dir = path.join(os.tmpdir(), `vigia-demo-seed-${crypto.randomUUID()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

main().catch((error) => {
  console.error(JSON.stringify({ step: 'seed_failed', error: String(error?.message ?? error), stack: error?.stack }));
  process.exit(1);
});
