import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceDebtItem, transitionEvidenceDebtItem, createMeasurementPlan, createMeasurementCampaign } from '../src/validation/evidence-debt.mjs';

const createdAt = '2026-08-14T12:00:00.000Z';
const debt = (overrides = {}) => createEvidenceDebtItem({
  id: 'debt:test', subject: 'PREVENT', quantity_question: 'What is measured?', current_state: 'OPEN',
  why_unknown: 'No denominator yet.', why_it_matters: 'Claims require a denominator.', decision_blocked: 'Validation claim.',
  measurement_method: 'bounded_measurement_v1', evidence_required: ['frozen data'], acceptable_reference_authority: ['official reference'],
  current_denominator: 0, target_denominator: 2, system_resolvable: true, human_required: false, field_required: false,
  next_opportunity: null, watch_state: 'NOT_ARMED', owner_class: 'SYSTEM', closure_contract: 'Measure both frozen cases.',
  created_at: createdAt, updated_at: createdAt, provenance: { corpus: 'frozen' }, ...overrides
});

test('evidence debt cannot be declared measured without evidence and the full target denominator', () => {
  const item = debt();
  assert.throws(() => transitionEvidenceDebtItem(item, 'MEASURED', { updated_at: createdAt, current_denominator: 2 }), /resolution_evidence_required/);
  assert.throws(() => transitionEvidenceDebtItem(item, 'MEASURED', { updated_at: createdAt, current_denominator: 1, resolution_evidence: { cases: 1 } }), /target_not_reached/);
  const measured = transitionEvidenceDebtItem(item, 'MEASURED', { updated_at: createdAt, current_denominator: 2, resolution_evidence: { cases: 2 } });
  assert.equal(measured.current_state, 'MEASURED');
  assert.equal(measured.current_denominator, 2);
  assert.equal(measured.history.length, 1);
  assert.equal(measured.resolved_at, createdAt);
});

test('evidence debt transitions do not permit schema identity to be overwritten through a patch', () => {
  const watching = transitionEvidenceDebtItem(debt(), 'WATCHING', { updated_at: createdAt, id: 'forged', version: 99 });
  assert.equal(watching.id, 'debt:test');
  assert.equal(watching.version, 2);
});

test('measurement plans and campaigns are deterministic and hash-bound', () => {
  const planInput = { id: 'plan:test', evidenceDebtItemId: 'debt:test', objective: 'Measure it.', dataset: { cases: 2 }, frozenSplit: 'FROZEN', measurementMethods: [{ id: 'method', version: 'v1', deterministic: true }], requiredEvidence: ['raw'], successContract: '2/2 measured.', createdAt };
  assert.equal(createMeasurementPlan(planInput).planHash, createMeasurementPlan(planInput).planHash);
  const campaignInput = { id: 'campaign:test', objective: 'Execute it.', dataset: { cases: 2 }, frozenSplit: 'FROZEN', measurementMethods: ['method_v1'], requiredEvidence: ['raw'], progress: { state: 'MEASURED', completed: 2, denominator: 2 }, metrics: { coverage: 1 }, remainingDebt: [], version: 'v1', generatedAt: createdAt };
  assert.equal(createMeasurementCampaign(campaignInput).campaignHash, createMeasurementCampaign(campaignInput).campaignHash);
});
