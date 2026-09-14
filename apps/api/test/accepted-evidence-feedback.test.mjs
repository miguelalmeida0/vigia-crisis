import test from 'node:test';
import assert from 'node:assert/strict';
import { EventObservationRepository } from '../src/modules/events/event-observation-repository.mjs';

test('an accepted evidence package is attached to its target event idempotently', async () => {
  const repository = new EventObservationRepository();
  const observation = {
    id: 'field-evidence:evidence-package:1',
    type: 'field',
    source: 'Accepted VIGIA field evidence',
    sourceFamily: 'field_evidence',
    independenceGroup: 'field_observer:inspector-1',
    sensorId: 'inspector-1',
    classification: 'smoke_observed',
    coordinate: [-8.1, 40.1],
    at: '2026-08-09T12:05:00.000Z',
    receivedAt: '2026-08-09T12:06:00.000Z',
    confidence: null,
    qualityFlags: []
  };

  await repository.attachObservationToEvent(observation, 'PT-2026-1', new Date('2026-08-09T12:06:00.000Z'));
  await repository.attachObservationToEvent(observation, 'PT-2026-1', new Date('2026-08-09T12:07:00.000Z'));
  const observations = await repository.merge([], new Date('2026-08-09T12:07:00.000Z'));
  const events = await repository.reconcileEvents([{ observations }], new Date('2026-08-09T12:07:00.000Z'));

  assert.equal(observations.length, 1);
  assert.equal(events[0].id, 'PT-2026-1');
  assert.equal(events[0].operatorCorrected, true);
});
