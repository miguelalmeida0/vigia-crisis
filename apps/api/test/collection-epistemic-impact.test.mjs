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

// --- Epistemic impact -------------------------------------------------------

test('confirming a capability changes the qualified ranking, support and communities, and writes nothing', () => {
  const situation = controlledSituation();
  const fingerprint = JSON.stringify(situation);
  const preview = previewKnowledgeImpact(situation, {kind: 'FACILITY_CAPABILITY_CONFIRMED', entityId: 'h-x', capability: 'emergencyDepartment'});
  assert.equal(preview.label, PREVIEW_LABEL);
  assert.equal(preview.observed, false);
  assert.equal(preview.operationalWrites, 0);
  assert.equal(preview.branches.unresolved.primary.facilityId, 'h-a');
  assert.equal(preview.branches.confirmed.primary.facilityId, 'h-x');
  assert.equal(preview.branches.unresolved.optionCount, 1);
  assert.equal(preview.branches.confirmed.optionCount, 2);
  assert.equal(preview.changes.primaryChanged, true);
  assert.equal(preview.changes.affectedCommunityCount, 4);
  assert.ok(preview.changes.rankingChanges.some((row) => row.ranking === 'nearestEmergencyHospital' && row.previous === 'h-a' && row.preview === 'h-x'));
  assert.equal(JSON.stringify(situation), fingerprint, 'the previewed snapshot must be byte-identical afterwards');
});

test('a confirmed capability changes the retained coverage classification when the minutes band moves', () => {
  const preview = previewKnowledgeImpact(controlledSituation(), {kind: 'FACILITY_CAPABILITY_CONFIRMED', entityId: 'h-x', capability: 'emergencyDepartment'});
  assert.ok(preview.changes.coverageClassificationChangeCount > 0, 'Hospital A at 22 min and Hospital X at 9 min sit in different bands');
  assert.ok(preview.changes.coverageClassificationChanges.every((row) => row.band !== row.previewBand));
});

test('a preview never invents a route: a qualifying facility without one produces no option and says why', () => {
  const preview = previewKnowledgeImpact(controlledSituation(), {kind: 'FACILITY_CAPABILITY_CONFIRMED', entityId: 'h-z', capability: 'emergencyDepartment'});
  assert.equal(preview.branches.confirmed.qualifiedCount, 2);
  assert.equal(preview.branches.confirmed.optionCount, 1, 'no calculated route exists to Hospital Z, so no support option appears');
  assert.equal(preview.blockedBy.reason, 'NO_RETAINED_CALCULATED_ROUTE');
  assert.equal(preview.changes.primaryChanged, false);
});

test('a reception activation preview is bounded, changes reception support, and stays a preview', () => {
  const situation = controlledSituation();
  const fingerprint = JSON.stringify(situation);
  const preview = previewKnowledgeImpact(situation, {kind: 'RECEPTION_ACTIVATION_CONFIRMED', entityId: 'r-1'});
  assert.equal(preview.operationalWrites, 0);
  assert.equal(preview.branches.unresolved.optionCount, 0);
  assert.equal(preview.branches.confirmed.optionCount, 1);
  assert.equal(preview.branches.confirmed.primary.facilityId, 'r-1');
  assert.equal(JSON.stringify(situation), fingerprint);
});

test('a road-information preview previews the information state and never the road state', () => {
  const preview = previewKnowledgeImpact(controlledSituation(), {kind: 'ROAD_INFORMATION_COVERED', entityId: 'EM527'});
  assert.equal(preview.operationalWrites, 0);
  assert.deepEqual(preview.mapIntent, {type: 'FOCUS_ROAD', road: 'EM527', validated: true});
  assert.match(preview.truthBoundary, /Neither is an observation/);
});

test('invalid previews are rejected rather than approximated', () => {
  const situation = controlledSituation();
  assert.throws(() => previewKnowledgeImpact(situation, {kind: 'MAKE_ROAD_SAFE', entityId: 'EM527'}), /kind_unsupported/);
  assert.throws(() => previewKnowledgeImpact(situation, {kind: 'FACILITY_CAPABILITY_CONFIRMED', entityId: 'h-x', capability: 'wildfireSpread'}), /capability_unsupported/);
  assert.throws(() => previewKnowledgeImpact(situation, {kind: 'FACILITY_CAPABILITY_CONFIRMED', entityId: 'not-in-incident', capability: 'emergencyDepartment'}), /facility_not_in_incident/);
  assert.throws(() => previewKnowledgeImpact(situation, {kind: 'FACILITY_CAPABILITY_CONFIRMED', entityId: 'f-a', capability: 'emergencyDepartment'}), /capability_not_applicable/);
  assert.throws(() => previewKnowledgeImpact(situation, {kind: 'FACILITY_CAPABILITY_CONFIRMED', entityId: 'h-x', capability: 'emergencyDepartment', extra: 1}), /preview_invalid/);
  assert.throws(() => previewKnowledgeImpact(situation, {kind: 'RECEPTION_ACTIVATION_CONFIRMED', entityId: 'h-x'}), /activation_not_applicable/);
});

test('every preview a requirement offers is itself valid', () => {
  const situation = controlledSituation();
  const result = informationRequirements(knowledgeStateFromSituation(situation));
  const offered = result.requirements.map(previewRequestForRequirement).filter(Boolean);
  assert.ok(offered.length >= 3);
  for (const request of offered) assert.equal(previewKnowledgeImpact(situation, request).operationalWrites, 0);
});

// --- Knowledge events -------------------------------------------------------

test('learning a capability produces a knowledge event distinct from a world change', () => {
  const before = controlledSituation();
  const after = controlledSituation({confirmHospitalX: true, at: '2026-09-13T10:10:00.000Z'});
  const result = knowledgeEvents(before, after);
  const event = result.events.find((row) => row.kind === 'CAPABILITY_VERIFIED' && row.subject.id === 'h-x');
  assert.ok(event);
  assert.equal(event.classification.origin, 'VIGIA_LEARNED');
  assert.equal(event.classification.distinctFrom, 'WORLD_CHANGED');
  assert.ok(event.consequence.supportChangeCount > 0);
  assert.ok(event.consequence.becamePrimaryFor.length > 0);
  assert.match(event.truthBoundary, /not a change in the world/);
});

test('losing a fact to staleness is reported as a knowledge loss, not as a world change', () => {
  const before = controlledSituation();
  const after = controlledSituation({staleHospitalA: true, at: '2026-09-13T10:10:00.000Z'});
  const events = knowledgeEvents(before, after).events;
  assert.ok(events.some((event) => event.kind === 'CAPABILITY_LOST_TO_STALENESS' && event.subject.id === 'h-a'));
});

test('knowledge events refuse to run backwards in time', () => {
  const before = controlledSituation();
  const after = controlledSituation({at: '2026-09-13T09:00:00.000Z'});
  assert.throws(() => knowledgeEvents(before, after), /forward_time/);
});

test('a historical snapshot is never rewritten by a later learned fact', () => {
  const before = controlledSituation();
  const fingerprint = JSON.stringify(before);
  const after = controlledSituation({confirmHospitalX: true, at: '2026-09-13T10:10:00.000Z'});
  knowledgeEvents(before, after);
  assert.equal(JSON.stringify(before), fingerprint);
  assert.equal(before.facilities.find((row) => row.id === 'h-x').capabilities.emergencyDepartment, undefined, 'the earlier capture still records what VIGIA actually knew then');
});

test('the knowledge delta separates what was learned, what was lost, and which gaps opened or closed', () => {
  const before = controlledSituation();
  const after = controlledSituation({confirmHospitalX: true, at: '2026-09-13T10:10:00.000Z'});
  const events = knowledgeEvents(before, after).events;
  const lifecycle = reconcileRequirements({
    retained: reconcileRequirements({retained: [], generated: informationRequirements(knowledgeStateFromSituation(before)).requirements, at: AT}).requirements,
    generated: informationRequirements(knowledgeStateFromSituation(after)).requirements,
    at: '2026-09-13T10:10:00.000Z'
  });
  const delta = knowledgeDelta({events, lifecycleEvents: requirementKnowledgeEvents(lifecycle), from: AT, to: '2026-09-13T10:10:00.000Z'});
  assert.ok(delta.learnedCount >= 1);
  assert.ok(delta.gapsClosedCount >= 1);
  assert.equal(delta.mostConsequentialNewFact.subject.id, 'h-x');
  assert.ok(delta.mostConsequentialNewFact.consequence.supportChangeCount > 0);
  assert.ok(!Object.keys(delta).some((key) => /score|confidence/i.test(key)));
});

// --- Bounded output ---------------------------------------------------------

test('outputs are bounded and carry their own limitation', () => {
  const result = informationRequirements(knowledgeStateFromSituation(controlledSituation()), {limit: 2});
  assert.equal(result.requirements.length, 2);
  assert.equal(result.truncated, true);
  assert.match(result.limitation, /not evidence that no gap exists/);
  const tasks = nextVerificationTasks(requirementsOf(), {limit: 2});
  assert.equal(tasks.tasks.length, 2);
  assert.match(tasks.limitation, /no weighted score/);
});

test('the source index covers every requirement it is given', () => {
  const result = requirementsOf();
  const index = requirementSourceIndex(result, {sources: approvedSourceRecords(), at: AT});
  assert.equal(index.size, result.requirements.length);
  assert.ok([...index.values()].every((row) => ['REGISTERED_SOURCE_AVAILABLE', 'NO_REGISTERED_SOURCE', 'OWNED_BY_ACQUISITION_LANE'].includes(row.state)));
});
