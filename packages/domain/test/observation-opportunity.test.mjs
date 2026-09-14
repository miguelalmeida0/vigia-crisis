import test from 'node:test';
import assert from 'node:assert/strict';
import { currentObservationOpportunity, rankObservationOpportunities, scheduledObservationOpportunity } from '../src/observation-opportunity.mjs';

const now = new Date('2026-08-09T12:00:00.000Z');

test('future observation requires an attributable confirmed schedule and spatial coverage', () => {
  const base = {
    id: 'sentinel-3:2026-08-09T13:20Z', sourceId: 'sentinel3Pixels', label: 'Sentinel-3 opportunity', methodType: 'satellite_thermal',
    scheduledAt: '2026-08-09T13:20:00.000Z', confirmedAt: '2026-08-09T11:55:00.000Z', scheduleState: 'confirmed',
    confirmationId: 'schedule-manifest:44', ownerId: 'source-operator', coverage: { bbox: [-9.6, 36.8, -6, 42.3] }
  };
  const option = scheduledObservationOpportunity(base, [-8.1, 40.1], { now });
  assert.equal(option.availability, 'SCHEDULED_CONFIRMED');
  assert.equal(option.informationGain.value, null);
  assert.equal(scheduledObservationOpportunity({ ...base, confirmationId: null }, [-8.1, 40.1], { now }), null);
  assert.equal(scheduledObservationOpportunity(base, [-2, 40.1], { now }), null);
});

test('feasibility ranking refuses to masquerade as measured information gain', () => {
  const result = rankObservationOpportunities([
    { id: 'future', availability: 'SCHEDULED_CONFIRMED', latency: { value: 20 } },
    { id: 'now', availability: 'AVAILABLE_NOW', latency: { value: 5 } }
  ]);
  assert.equal(result.options[0].id, 'now');
  assert.equal(result.ranking.state, 'PARTIAL_INFORMATION_GAIN_UNMEASURED');
  assert.ok(result.ranking.missingDimensions.includes('validated_information_gain'));
});

test('an unowned connected asset is visible but is not called available for execution',()=>{
  const option=currentObservationOpportunity({id:'camera-1',label:'Camera 1',type:'camera',status:'online',endpointConfigured:true,etaMinutes:1});
  assert.equal(option.availability,'OWNER_UNRESOLVED');
  assert.match(option.limitation,/no responsible owner/i);
});
