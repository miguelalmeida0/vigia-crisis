import test from 'node:test';
import assert from 'node:assert/strict';
import {AT, approvedSourceRecords, controlledSituation} from './collection-intelligence-fixture.mjs';
import {REQUIREMENT_CLASSES, informationRequirements, knowledgeStateFromPicture, knowledgeStateFromSituation} from '../../../packages/domain/src/intelligence/information-requirements.mjs';
import {TASKING_FACTORS, explainRequirement, nextVerificationTasks} from '../../../packages/domain/src/intelligence/collection-tasking.mjs';
import {requirementSourceIndex, requirementSources} from '../../../packages/domain/src/intelligence/collection-sources.mjs';
import {moveRequirement, reconcileRequirements} from '../../../packages/domain/src/intelligence/collection-lifecycle.mjs';
import {PREVIEW_LABEL, previewKnowledgeImpact, previewRequestForRequirement} from '../../../packages/domain/src/intelligence/epistemic-impact.mjs';
import {knowledgeDelta, knowledgeEvents, requirementKnowledgeEvents} from '../../../packages/domain/src/intelligence/knowledge-events.mjs';

const requirementsOf = (options = {}) => informationRequirements(knowledgeStateFromSituation(controlledSituation(options)));
const find = (result, predicate) => result.requirements.find(predicate);
const categoryCapability = (result, category) => find(result, (row) => row.requirementClass === 'FACILITY_CAPABILITY' && row.subject.kind === 'SUPPORT_CATEGORY' && row.affected.categories[0] === category);

// --- Lifecycle --------------------------------------------------------------

test('a requirement opens once and keeps its identity across regeneration', () => {
  const generated = requirementsOf().requirements;
  const first = reconcileRequirements({retained: [], generated, at: AT});
  assert.equal(first.open, generated.length);
  assert.ok(first.events.every((event) => event.kind === 'REQUIREMENT_OPENED'));
  const second = reconcileRequirements({retained: first.requirements, generated, at: '2026-09-13T10:05:00.000Z'});
  assert.equal(second.open, generated.length);
  assert.equal(second.events.filter((event) => event.kind === 'REQUIREMENT_OPENED').length, 0, 'a regenerated requirement must not reopen');
  assert.equal(second.requirements.find((row) => row.id === generated[0].id).lifecycle.openedAt, AT);
});

test('an accepted fact closes the requirement it answered', () => {
  const before = requirementsOf().requirements;
  const opened = reconcileRequirements({retained: [], generated: before, at: AT});
  const after = requirementsOf({confirmHospitalX: true}).requirements;
  const closed = reconcileRequirements({retained: opened.requirements, generated: after, at: '2026-09-13T11:00:00.000Z'});
  const hospitalX = closed.requirements.find((row) => row.subject.id === 'h-x');
  assert.equal(hospitalX.lifecycle.state, 'RESOLVED');
  assert.equal(hospitalX.lifecycle.closedAt, '2026-09-13T11:00:00.000Z');
  assert.ok(closed.events.some((event) => event.kind === 'REQUIREMENT_RESOLVED' && event.subject.id === 'h-x'));
});

test('a fact that goes stale reopens the requirement as a new version without editing the resolved one', () => {
  const resolvedRequirement = {
    id: 'requirement:test', requirementClass: 'FACILITY_CAPABILITY', subject: {id: 'h-x', kind: 'FACILITY', name: 'Hospital X'},
    affected: {communityCount: 4, supportRelationshipCount: 5, categories: ['emergency_hospital']}, currentKnownState: {state: 'NOT_RESOLVED'},
    lifecycle: {state: 'RESOLVED', version: 1, openedAt: AT, updatedAt: AT, closedAt: '2026-09-13T11:00:00.000Z', reason: null, resolvedBy: 'ACCEPTED_FACT'}
  };
  const regenerated = {...resolvedRequirement, lifecycle: {state: 'OPEN', version: 1, openedAt: AT, updatedAt: AT, closedAt: null, reason: null}};
  const result = reconcileRequirements({retained: [resolvedRequirement], generated: [regenerated], at: '2026-09-14T12:00:00.000Z'});
  const row = result.requirements[0];
  assert.equal(row.lifecycle.state, 'OPEN');
  assert.equal(row.lifecycle.version, 2);
  assert.equal(row.lifecycle.reason, 'REOPENED_AFTER_PREVIOUSLY_RESOLVED_FACT_BECAME_STALE');
  assert.deepEqual(row.lifecycle.reopenedFrom, {version: 1, resolvedAt: '2026-09-13T11:00:00.000Z', resolvedBy: 'ACCEPTED_FACT'});
  assert.equal(resolvedRequirement.lifecycle.state, 'RESOLVED', 'the historical record must not be edited in place');
});

test('an unresolved requirement expires only after its expiry window', () => {
  const generated = requirementsOf().requirements.slice(0, 1);
  const opened = reconcileRequirements({retained: [], generated, at: AT});
  const soon = reconcileRequirements({retained: opened.requirements, generated: [], at: '2026-09-13T12:00:00.000Z', expiryMs: 86_400_000});
  assert.equal(soon.requirements[0].lifecycle.state, 'RESOLVED');
  const late = reconcileRequirements({retained: opened.requirements, generated: [], at: '2026-09-30T00:00:00.000Z', expiryMs: 86_400_000});
  assert.equal(late.requirements[0].lifecycle.state, 'EXPIRED');
});

test('only declared lifecycle transitions are allowed', () => {
  const requirement = requirementsOf().requirements[0];
  assert.equal(moveRequirement(requirement, 'QUEUED', {at: AT}).lifecycle.state, 'QUEUED');
  assert.throws(() => moveRequirement(requirement, 'RESOLVED', {at: AT}), /transition_forbidden/);
  assert.throws(() => moveRequirement(requirement, 'INVENTED', {at: AT}), /state_invalid/);
});

test('regenerating does not explode into duplicate work', () => {
  let retained = [];
  for (let round = 0; round < 5; round += 1) retained = reconcileRequirements({retained, generated: requirementsOf().requirements, at: AT}).requirements;
  assert.equal(retained.length, requirementsOf().requirements.length);
  assert.equal(new Set(retained.map((row) => row.id)).size, retained.length);
});
