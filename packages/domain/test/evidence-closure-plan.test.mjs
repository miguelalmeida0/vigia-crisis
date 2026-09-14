import test from 'node:test';
import assert from 'node:assert/strict';
import { armEvidenceWatch, createEvidenceClosurePlan, resolveEvidenceClosure, selectClosureOpportunity } from '../src/evidence-closure-plan.mjs';
import { createCoverageIntelligence } from '../src/coverage-intelligence.mjs';

const now = new Date('2026-08-13T10:00:00Z');
function plan() {
  return createEvidenceClosurePlan({ subjectId: 'event-1', unknownCode: 'independent_confirmation', currentEvidenceVersion: 'evidence-v1', currentEvidenceFamilies: ['viirs'], acceptableEvidenceFamilies: ['sentinel3_slstr', 'field'], deadlineAt: '2026-08-13T11:00:00Z', expiresAt: '2026-08-13T22:00:00Z' }, { now });
}

test('VIIRS evidence selects an independent Sentinel-3 opportunity and arms a bounded watch', () => {
  const created = plan(); assert.equal(created.preferredNextFamily, 'sentinel3_slstr');
  const opportunity = { id: 'op-s3', sourceFamily: 'sentinel3_slstr', opportunityType: 'PREDICTED_ORBITAL_PASS', authority: 'TLE:S3A:2026-08-13', windowStart: '2026-08-13T10:20:00Z', windowEnd: '2026-08-13T10:30:00Z', expiresAt: '2026-08-13T10:30:00Z', createdAt: now.toISOString() };
  assert.equal(selectClosureOpportunity(created, [opportunity], { at: now }).id, 'op-s3');
  const armed = armEvidenceWatch(created, opportunity, { at: now });
  assert.equal(armed.lifecycleState, 'WATCH_ARMED'); assert.equal(armed.sourceWatch.sourceFamily, 'sentinel3_slstr'); assert.equal(Date.parse(armed.sourceWatch.watchUntil), Date.parse(opportunity.expiresAt));
});

test('only attributable independent corroboration closes an unknown', () => {
  const opportunity = { id: 'op-s3', sourceFamily: 'sentinel3_slstr', opportunityType: 'CONFIRMED_PROVIDER_PRODUCT', authority: 'PRODUCT:s3', expiresAt: '2026-08-13T11:00:00Z', createdAt: now.toISOString() };
  const armed = armEvidenceWatch(plan(), opportunity, { at: now });
  const closed = resolveEvidenceClosure(armed, { result: { resultState: 'CORROBORATED', attributableObservationId: 's3-observation', reasonCode: 'INDEPENDENT_SOURCE_MATCHED_GOVERNED_WINDOW' }, event: { physicalSourceProfile: { familyCount: 2 } }, evidenceVersion: 'evidence-v2', at: '2026-08-13T10:25:00Z' });
  assert.equal(closed.resolutionState, 'CLOSED'); assert.equal(closed.lifecycleState, 'UNKNOWN_CLOSED'); assert.equal(closed.sourceWatch.state, 'SATISFIED');
  assert.equal(closed.currentEvidenceVersion,'evidence-v1');assert.equal(closed.resolutionEvidenceVersion,'evidence-v2');
  assert.deepEqual(closed.audit.slice(-4).map((item) => item.state), ['EVIDENCE_ARRIVES', 'ASSOCIATED', 'DOMAIN_RECOMPUTED', 'UNKNOWN_CLOSED']);
});

test('expiry and unusable coverage preserve rather than close the unknown', () => {
  for (const resultState of ['EXPIRED', 'NO_COVERAGE', 'QUALITY_UNUSABLE', 'SOURCE_FAILURE', 'AMBIGUOUS', 'STILL_UNKNOWN']) {
    const resolved = resolveEvidenceClosure(plan(), { result: { resultState }, at: '2026-08-13T12:00:00Z' });
    assert.equal(resolved.resolutionState, 'PRESERVED'); assert.equal(resolved.lifecycleState, 'UNKNOWN_PRESERVED'); assert.equal(resolved.closedAt, null);
  }
});

test('coverage forecast never invents a swath or percentage from cadence metadata', () => {
  const coverage = createCoverageIntelligence({ subject: { id: 'event-1', coordinate: [-8, 40] }, opportunities: [{ id: 'cadence', sourceFamily: 'viirs', opportunityType: 'EXPECTED_CADENCE', authority: 'PUBLISHED_CADENCE', windowStart: '2026-08-13T10:10:00Z', windowEnd: '2026-08-13T10:20:00Z', expiresAt: '2026-08-13T10:20:00Z', coverageAssumptions: {}, calculationVersion: 'v1' }], sourceStates: { viirs: { state: 'current' } }, now });
  assert.ok(coverage.forecasts.every((item) => item.coveragePercent === null));
  assert.equal(coverage.windows[0].geometry, null); assert.equal(coverage.windows[0].geometryQualification, 'NO_SWATH_GEOMETRY_ASSERTED');
  assert.equal(coverage.gaps[0].reasonCode, 'NO_AUTHORITATIVE_SWATH_GEOMETRY');
});
