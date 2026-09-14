import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCoverageIntelligence } from '../src/coverage-intelligence.mjs';
import { createEvidenceRace, settleEvidenceRace } from '../src/evidence-race.mjs';
import { createFireTruthState } from '../src/fire-truth-state.mjs';
import { decideNextBestEvidence } from '../src/next-best-evidence.mjs';
import { predictOrbitalPasses, validateOrbitalPredictions } from '../src/orbital-opportunity.mjs';

const now = new Date('2026-08-13T20:15:00Z');
const event = { id: 'event-physical-first', coordinate: [-6.5192269, 37.5374177], observations: [{ id: 'viirs-1', sourceFamily: 'viirs', at: '2026-08-13T14:18:00Z' }], physicalSourceProfile: { families: ['viirs'] }, physicalState: { lastAt: '2026-08-13T14:18:00Z', freshness: 'delayed' }, reportState: { firstAt: null, sourceActivity: 'no_report' }, behaviorState: 'unknown' };

test('current governed TLE predicts an event-specific Sentinel-3 pass without asserting acquisition', async () => {
  const orbit = JSON.parse(await readFile(new URL('../../../data/reference/orbits/sentinel3-current.json', import.meta.url)));
  const passes = predictOrbitalPasses({ eventId: event.id, coordinate: event.coordinate, orbitSnapshot: orbit, from: now, horizonHours: 12 });
  assert.ok(passes.length >= 1); assert.equal(passes[0].opportunityType, 'PREDICTED_ORBITAL_PASS'); assert.match(passes[0].authority, /^CELESTRAK_GP_TLE/);
  assert.equal(passes[0].coverageAssumptions.eventPointIntersection, true); assert.equal(passes[0].qualityDependencies.requiresSuccessfulAcquisition, true);
});

test('truth state, next-best evidence, coverage and race preserve their epistemic boundaries', () => {
  const opportunity = { id: 's3-pass', sourceFamily: 'sentinel3_slstr', opportunityType: 'PREDICTED_ORBITAL_PASS', authority: 'CELESTRAK_GP_TLE:43437:hash', windowStart: '2026-08-13T21:54:15Z', windowEnd: '2026-08-13T21:58:00Z', expiresAt: '2026-08-13T21:58:00Z', canCloseEvidenceNeed: true, coverageAssumptions: { eventPointIntersection: true, intersectionMethod: 'SGP4_DISTANCE', closestGroundTrackDistanceKm: 105, trackGeometry: { type: 'LineString', coordinates: [[-7, 36], [-6, 38]] } } };
  const coverage = createCoverageIntelligence({ subject: { type: 'EVENT', id: event.id, coordinate: event.coordinate }, opportunities: [opportunity], now });
  assert.equal(coverage.forecasts.find((item) => item.horizon === 'NEXT_3_HOURS').pointCoverageState, 'PREDICTED_INTERSECTION'); assert.equal(coverage.forecasts[0].coveragePercent, null);
  const decision = decideNextBestEvidence({ eventId: event.id, unknowns: [{ code: 'INDEPENDENT_PHYSICAL_CORROBORATION' }], currentEvidenceFamilies: ['viirs'], candidates: [opportunity], now });
  assert.equal(decision.selected.sourceFamily, 'sentinel3_slstr'); assert.equal(decision.unmeasuredDimensions.length, 3);
  const plan = { id: 'plan-1', currentEvidenceVersion: 'evidence-v1', lifecycleState: 'WATCH_ARMED', resolutionState: 'OPEN', resultState: null, resultReason: null };
  let truth = createFireTruthState({ event, closurePlan: plan, coverage, nextBestEvidence: decision, now });
  assert.equal(truth.physicalTruth.confirmationState, 'SINGLE_SOURCE_PHYSICAL_EVIDENCE'); assert.ok(truth.unknowns.some((item) => item.code === 'AUTHORITATIVE_FIRE_PERIMETER'));
  let race = createEvidenceRace({ eventId: event.id, truthStateId: truth.id, decision, createdAt: now });
  race = settleEvidenceRace(race, { sourceFamily: 'sentinel3_slstr', opportunityId: opportunity.id, attributableObservationId: 's3-observation', settledAt: new Date('2026-08-13T21:56:00Z') });
  assert.equal(race.state, 'SETTLED'); assert.ok(race.paths.some((item) => item.raceState === 'WON'));
});

test('historical validation counts misses but leaves false opportunities unmeasured without a complete pass archive', async () => {
  const orbit = JSON.parse(await readFile(new URL('../../../data/reference/orbits/sentinel3-current.json', import.meta.url)));
  const validation = validateOrbitalPredictions({ eventId: event.id, coordinate: event.coordinate, orbitSnapshot: orbit, actualProducts: [{ productId: 'historical-s3b', platform: 'Sentinel-3B', observedAt: '2026-08-13T10:38:45.431Z', coordinate: [-6.3663, 37.5502] }] });
  assert.equal(validation.metrics.actualPasses, 1); assert.equal(validation.metrics.missedActualPasses, 0); assert.equal(validation.metrics.falseOpportunityRate, null);
});
