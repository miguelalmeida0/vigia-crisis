import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCapProtectionTransition,
  projectCrisisPlanning,
} from '../src/crisis-planning/index.mjs';
import {
  buildResponseCapabilityProjection,
  normalizeDynamicCapacity,
} from '../src/response-capability/index.mjs';

const asOf = '2026-09-04T15:00:00.000Z';

function base(overrides = {}) {
  return {
    asOf,
    incident: {
      id: 'incident:governed-one',
      name: 'Governed incident',
      coordinate: [-8.5, 41.2],
      truthState: 'DETECTION_CANDIDATE',
    },
    ...overrides,
  };
}

function governedContext(id, name, coordinate, extra = {}) {
  return {
    id,
    name,
    coordinate,
    updatedAt: '2026-09-04T14:50:00.000Z',
    source: { id: 'governed-osm-extract', reference: `osm:${id}` },
    ...extra,
  };
}

function reachability(minutes, distanceKm) {
  return {
    state: 'ROUTED',
    method: 'OSRM_ROAD_NETWORK',
    routeDistanceKm: distanceKm,
    travelTimeMinutes: minutes,
    currentRoute: { travelTimeMinutes: minutes, distanceKm, geometry: null, geometryState: 'NOT_RETURNED' },
    alternativeRoute: null,
    alternativeRouteState: 'NOT_RETURNED',
    roadClosureImpact: { state: 'UNKNOWN', closures: [] },
    terrainAccessConstraints: { state: 'NOT_ROUTING_CONSTRAINED', constraints: [] },
    source: { provider: 'OSRM', reference: `osrm:${minutes}` },
    checkedAt: asOf,
    confidence: { state: 'CONTEXTUAL_ESTIMATE', score: null },
    reason: null,
  };
}

function reportedStation(id, minutes, crews) {
  const dynamicCapacity = normalizeDynamicCapacity('FIRE_STATION', {
    state: 'DISPATCH_CONFIRMED',
    admitted: true,
    admissionReference: `admission:${id}`,
    observedAt: '2026-09-04T14:58:00.000Z',
    source: { name: 'Regional dispatch', reference: `dispatch:${id}` },
    crewsAvailable: crews,
    enginesAvailable: crews > 0 ? 1 : 0,
  }, { now: new Date(asOf) });
  return {
    id,
    kind: 'FIRE_STATION',
    name: id,
    coordinate: [-8.4, 41.1],
    distanceKm: minutes / 2,
    reachability: reachability(minutes, minutes / 1.5),
    staticCapability: { wildfireCapability: { state: 'KNOWN', value: true } },
    provenance: { provider: 'OpenStreetMap contributors', reference: `osm:${id}` },
    updatedAt: '2026-09-04T14:45:00.000Z',
    dynamicCapacity,
  };
}

test('CAP guard permits only governed exercise lifecycle and multilingual composer never invents missing variants', () => {
  assert.throws(() => applyCapProtectionTransition('APPROVED', { action: 'LIVE_SEND', actor: 'authority:one', reference: 'send:one', at: asOf }), /live_send_not_supported/);
  const canonicalMessage = {
    whatHappened: 'Exercise wildfire scenario.',
    where: 'Exercise zone Alpha.',
    whoIsAffected: 'Exercise participants.',
    whatToDo: 'Follow exercise controller instructions.',
    whatNotToDo: 'Do not treat this as a live warning.',
    when: 'During the exercise window.',
    authority: 'Exercise control.',
    nextUpdate: 'At the next exercise inject.',
  };
  const projected = projectCrisisPlanning(base({
    protectionMessage: {
      id: 'message:exercise',
      canonicalLanguage: 'en',
      canonicalMessage,
      sourceReference: 'exercise-message:one',
      translations: {
        pt: { message: { ...canonicalMessage, whatHappened: 'Cenário de incêndio de exercício.' } },
        de: { message: { ...canonicalMessage }, translator: 'exercise-translator:de', reference: 'translation:de:one' },
      },
    },
    capProtection: {
      id: 'cap:exercise',
      mode: 'EXERCISE',
      events: [
        { id: 'cap-event:validate', action: 'VALIDATE', actor: 'validator:one', reference: 'validation:one', validationReference: 'validation:one', at: '2026-09-04T14:50:00Z' },
        { id: 'cap-event:review', action: 'AUTHORITY_REVIEW', actor: 'authority:one', reference: 'authority-review:one', at: '2026-09-04T14:52:00Z' },
        { id: 'cap-event:approve', action: 'APPROVE', actor: 'authority:one', authorityId: 'authority:one', authorized: true, reference: 'approval:one', at: '2026-09-04T14:54:00Z' },
        { id: 'cap-event:exercise-send', action: 'EXERCISE_SEND', mode: 'EXERCISE', actor: 'exercise-controller:one', reference: 'exercise-send:one', at: '2026-09-04T14:56:00Z' },
        { id: 'cap-event:receipt', action: 'RECEIPT', actor: 'exercise-controller:one', reference: 'receipt:one', receiptReference: 'receipt:one', at: '2026-09-04T14:57:00Z' },
      ],
    },
  }));
  assert.equal(projected.multilingualProtectionComposer.state, 'TRANSLATIONS_REQUIRED');
  assert.equal(projected.multilingualProtectionComposer.translations.en.state, 'CANONICAL_READY');
  assert.equal(projected.multilingualProtectionComposer.translations.de.state, 'PROVIDED_TRANSLATION_READY');
  assert.equal(projected.multilingualProtectionComposer.translations.pt.state, 'PROVIDED_TRANSLATION_INCOMPLETE_OR_UNATTRIBUTED');
  assert.equal(projected.multilingualProtectionComposer.translations.pt.message, null);
  assert.equal(projected.multilingualProtectionComposer.translations.es.state, 'TRANSLATION_REQUIRED');
  assert.equal(projected.multilingualProtectionComposer.translations.es.message, null);
  assert.equal(projected.multilingualProtectionComposer.translationsGenerated, false);
  assert.equal(projected.capProtection.state, 'LIFECYCLE_VALID');
  assert.equal(projected.capProtection.currentState, 'RECEIPT_RECORDED');
  assert.equal(projected.capProtection.liveSendEnabled, false);
  assert.equal(projected.capProtection.liveSendRecorded, false);
});

test('projection is deterministic, immutable, input-preserving, and rejects invalid top-level identity/time', () => {
  const input = base({ contexts: { communities: [governedContext('community:one', 'Community one', [-8.48, 41.19])] } });
  const before = structuredClone(input);
  const first = projectCrisisPlanning(input);
  const second = projectCrisisPlanning(input);
  assert.deepEqual(input, before);
  assert.equal(first.projectionHash, second.projectionHash);
  assert.equal(Object.isFrozen(first), true);
  assert.throws(() => projectCrisisPlanning({ ...input, asOf: 'not-a-time' }), /projection_time_required/);
  assert.throws(() => projectCrisisPlanning({ ...input, incident: {} }), /incident_id_required/);
});

