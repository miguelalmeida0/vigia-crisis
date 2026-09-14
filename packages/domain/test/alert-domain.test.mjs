import test from 'node:test';
import assert from 'node:assert/strict';
import { alertEvidenceVersion, assertAlertTransition, evaluateAlertPolicies,evaluatePreventionReviewQueue,evaluateSourceCoverage } from '../src/alert-domain.mjs';

const at = new Date('2026-08-13T10:00:00.000Z');
function physical(overrides = {}) {
  return {
    id: 'PT-physical-1', label: 'Physical candidate', coordinate: [-8, 40], physicalFirst: true,
    physicalOperationalState: 'NEW_PHYSICAL_CANDIDATE', physicalState: { freshness: 'current', lastAt: '2026-08-13T09:58:00.000Z' },
    reportState: { sourceActivity: 'no_report', firstAt: null }, evidenceState: 'satellite-only',
    physicalSourceProfile: { families: ['viirs'], twoPhysicalSourceFamilies: false },
    observations: [{ id: 'v1', at: '2026-08-13T09:58:00.000Z', type: 'thermal', sourceFamily: 'viirs', frpMw: 3.2 }], ...overrides
  };
}

test('alert policy rejects report-only and stale physical events', () => {
  assert.equal(evaluateAlertPolicies({ ...physical(), physicalState: { freshness: 'unobserved' }, physicalOperationalState: 'REPORT_ONLY_CURRENT' }, { evaluatedAt: at }).alert, null);
  const stale = evaluateAlertPolicies({ ...physical(), physicalState: { freshness: 'stale' }, physicalOperationalState: 'STALE_PHYSICAL_EVIDENCE' }, { evaluatedAt: at });
  assert.equal(stale.alert, null); assert.ok(stale.decisions.every((item) => item.fired===false));
});

test('coverage loss excludes stale reachability and prevention deadlines aggregate to one queue alert',()=>{
  assert.equal(evaluateSourceCoverage('viirs',{configured:true,state:'stale'},{evaluatedAt:at}).alert,null);
  assert.equal(evaluateSourceCoverage('viirs',{configured:true,state:'unavailable',error:'timeout'},{evaluatedAt:at}).alert.alertType,'SOURCE_COVERAGE_LOSS');
  const prevention=evaluatePreventionReviewQueue([{id:'review-1',targetType:'prevention_finding',state:'requested',dueAt:'2026-08-13T09:00:00Z'},{id:'review-2',targetType:'prevention_finding',state:'requested',dueAt:'2026-08-13T09:30:00Z'}],{evaluatedAt:at});
  assert.equal(prevention.alert.alertType,'PREVENTION_REVIEW_DUE');assert.equal(prevention.alert.payload.dueCount,2);
});

test('physical-first unreported policy wins once per evidence version', () => {
  const result = evaluateAlertPolicies(physical(), { evaluatedAt: at });
  assert.equal(result.alert.alertType, 'PHYSICAL_FIRST_UNREPORTED');
  assert.equal(result.alert.priority, 'HIGH');
  assert.equal(result.alert.dedupeKey, 'PT-physical-1:physical-first-unreported');
  assert.equal(alertEvidenceVersion(physical()), alertEvidenceVersion(physical()));
});

test('evidence conflict and multisource policies use explicit precedence', () => {
  const multi = physical({ physicalOperationalState: 'CURRENT_MULTISOURCE_PHYSICAL_FIRE', physicalSourceProfile: { families: ['viirs', 'sentinel3_slstr'], twoPhysicalSourceFamilies: true } });
  assert.equal(evaluateAlertPolicies(multi, { evaluatedAt: at }).alert.alertType, 'MULTISOURCE_PHYSICAL');
  const conflicted = { ...multi, evidenceFusion: { ambiguities: [{ kind: 'conflicting_physical_observations' }] } };
  assert.equal(evaluateAlertPolicies(conflicted, { evaluatedAt: at }).alert.alertType, 'EVIDENCE_CONFLICT');
});

test('alert transition guard accepts ownership and rejects impossible mutation', () => {
  assert.equal(assertAlertTransition('ACKNOWLEDGED', 'OWNED'), true);
  assert.throws(() => assertAlertTransition('RESOLVED', 'ACKNOWLEDGED'), /invalid_alert_state_transition/);
});
