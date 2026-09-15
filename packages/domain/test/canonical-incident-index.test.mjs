import test from 'node:test';
import assert from 'node:assert/strict';
import { eventProjectionFingerprint, bindEventProjection, buildCanonicalIncidentIndex, assertCanonicalIncidentIndex } from '../src/event-fabric/canonical-incident-index.mjs';
import { buildFireEvents } from '../src/fire-event-tracker.mjs';

const now = new Date('2026-08-08T15:00:00Z');

// A tracked event with two associated observations reproduces the exact live
// object graph that previously carried a circular associationDecisions[].target
// reference back to itself — the failure the isolated VIGIA Portfolio Demo hit
// in production (operationalEventService's #build -> bindEventProjection).
function trackedEventsWithAssociation() {
  return buildFireEvents({
    fires: [],
    thermalDetections: [
      { id: 'proj-a', coordinate: [-8.15, 39.9167], observedAt: '2026-08-08T14:00:00Z', frpMw: 12, satellite: 'NOAA-20' },
      { id: 'proj-b', coordinate: [-8.151, 39.9168], observedAt: '2026-08-08T14:20:00Z', frpMw: 16, satellite: 'NOAA-21' }
    ]
  }, { now });
}

function baseProjection(overrides = {}) {
  return {
    schema: 'vigia.event-projections.v1',
    generatedAt: '2026-08-08T15:00:00.000Z',
    meta: { region: 'Portugal mainland' },
    clocks: { reports: { state: 'current' } },
    command: { summary: { allEvents: 1 } },
    operatorEvents: [
      { id: 'PT-2026-AAAA111111', physicalOperationalState: 'CURRENT_PHYSICAL_FIRE', evidenceState: 'sensor-only' }
    ],
    ...overrides
  };
}

test('a projection built from real tracked events with an association decision does not crash the fingerprint', () => {
  const events = trackedEventsWithAssociation();
  assert.ok(events[0].associationDecisions.length >= 1, 'fixture must actually exercise the association-decision path');
  const projection = baseProjection({ operatorEvents: events.map((event, index) => ({ ...event, id: `PT-2026-${String(index).padStart(10, '0')}` })) });
  assert.doesNotThrow(() => eventProjectionFingerprint(projection));
  assert.doesNotThrow(() => bindEventProjection(projection));
  assert.doesNotThrow(() => buildCanonicalIncidentIndex(projection));
});

test('the fingerprint is deterministic across repeated builds of the same projection', () => {
  const projection = baseProjection();
  const first = eventProjectionFingerprint(projection);
  const second = eventProjectionFingerprint(projection);
  assert.equal(first, second);
  assert.match(first, /^sha256:[a-f0-9]{64}$/);
});

test('equivalent but separately constructed projections produce the same fingerprint', () => {
  const a = eventProjectionFingerprint(baseProjection());
  const b = eventProjectionFingerprint(baseProjection());
  assert.equal(a, b);
});

test('a meaningful change to the projection changes the fingerprint', () => {
  const unchanged = eventProjectionFingerprint(baseProjection());
  const changed = eventProjectionFingerprint(baseProjection({
    operatorEvents: [{ id: 'PT-2026-AAAA111111', physicalOperationalState: 'STALE_PHYSICAL_EVIDENCE', evidenceState: 'sensor-only' }]
  }));
  assert.notEqual(unchanged, changed);
});

test('the command.projectionFingerprint field does not participate in its own hash (no self-reference instability)', () => {
  const withStaleFingerprint = baseProjection({ command: { summary: { allEvents: 1 }, projectionFingerprint: 'sha256:stale-from-a-previous-build' } });
  const withoutFingerprint = baseProjection({ command: { summary: { allEvents: 1 } } });
  assert.equal(eventProjectionFingerprint(withStaleFingerprint), eventProjectionFingerprint(withoutFingerprint));
});

test('buildCanonicalIncidentIndex still validates against its own schema for a real tracked-event projection', () => {
  const events = trackedEventsWithAssociation();
  const projection = baseProjection({ operatorEvents: events.map((event, index) => ({ ...event, id: `PT-2026-${String(index).padStart(10, '0')}` })) });
  const index = buildCanonicalIncidentIndex(projection);
  assert.doesNotThrow(() => assertCanonicalIncidentIndex(index));
  assert.equal(index.incidentCount, projection.operatorEvents.length);
});
