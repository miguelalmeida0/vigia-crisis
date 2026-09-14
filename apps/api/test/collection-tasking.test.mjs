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

// --- Tasking ----------------------------------------------------------------

test('tasking orders by explicit factors and returns the factors and reasons', () => {
  const result = requirementsOf();
  const tasks = nextVerificationTasks(result, {limit: 10});
  assert.equal(tasks.orderingMethod, 'EXPLICIT_LEXICOGRAPHIC_FACTORS');
  assert.deepEqual(tasks.factorOrder, TASKING_FACTORS.map((factor) => factor.key));
  assert.ok(tasks.tasks.every((task) => task.reasons.length > 0 && Object.keys(task.factors).length === TASKING_FACTORS.length));
  assert.ok(!Object.keys(tasks.tasks[0]).some((key) => /score|weight|confidence/i.test(key)), 'no opaque score may appear on a task');
  const first = tasks.tasks[0];
  assert.equal(first.factors.blocksCriticalQualifiedCategory, true);
  assert.equal(first.factors.noRetainedAlternative, true);
});

test('ordering is stable and reproducible for an identical knowledge state', () => {
  const a = nextVerificationTasks(requirementsOf(), {limit: 10});
  const b = nextVerificationTasks(requirementsOf(), {limit: 10});
  assert.deepEqual(a.tasks.map((task) => task.requirementId), b.tasks.map((task) => task.requirementId));
});

test('more affected communities outranks more affected relationships, exactly as the factor order declares', () => {
  const base = find(requirementsOf(), (row) => row.subject.id === 'EM527');
  const broadCommunities = {...base, id: 'requirement:broad', subject: {...base.subject, id: 'ROAD-BROAD'}, affected: {...base.affected, communityCount: 9, supportRelationshipCount: 1}};
  const manyRelationships = {...base, id: 'requirement:deep', subject: {...base.subject, id: 'ROAD-DEEP'}, affected: {...base.affected, communityCount: 2, supportRelationshipCount: 40}};
  const tasks = nextVerificationTasks({requirements: [manyRelationships, broadCommunities]}, {limit: 5});
  assert.equal(tasks.tasks[0].subject.id, 'ROAD-BROAD');
  assert.equal(tasks.tasks[1].subject.id, 'ROAD-DEEP');
});

test('a road already inside the connected coverage generates no road-information requirement', () => {
  const roads = requirementsOf().requirements.filter((row) => row.requirementClass === 'ROAD_INFORMATION').map((row) => row.subject.id);
  assert.ok(roads.includes('EM527'), 'EM527 is outside the connected coverage in this fixture');
  assert.ok(!roads.includes('N114'), 'N114 is covered, so its information state is already established and is not a gap');
});

test('an approved source available breaks a tie in favour of the answerable requirement', () => {
  const base = find(requirementsOf(), (row) => row.subject.id === 'h-x');
  const twin = {...base, id: 'requirement:twin', subject: {...base.subject, id: 'h-twin', name: 'Hospital Twin'}};
  const index = new Map([[base.id, {state: 'REGISTERED_SOURCE_AVAILABLE'}], [twin.id, {state: 'NO_REGISTERED_SOURCE'}]]);
  const tasks = nextVerificationTasks({requirements: [twin, base]}, {sourcesByRequirementId: index, limit: 5});
  assert.equal(tasks.tasks[0].requirementId, base.id);
  assert.equal(tasks.tasks[0].factors.approvedSourceAvailable, true);
});

test('why-this-requirement is assembled from retained counts only and asserts nothing', () => {
  const requirement = categoryCapability(requirementsOf(), 'emergency_hospital');
  const explanation = explainRequirement(requirement, {sourceTasking: {state: 'REGISTERED_SOURCE_AVAILABLE'}});
  assert.ok(explanation.facts.some((fact) => /Hospital A/.test(fact)));
  assert.ok(explanation.facts.some((fact) => /nearest unresolved candidate is Hospital Z/.test(fact)));
  assert.ok(explanation.facts.some((fact) => /4 retained communities/.test(fact)));
  assert.match(explanation.consequenceIfResolved, /qualified nearest ranking/);
  assert.match(explanation.truthBoundary, /None of them asserts the missing fact/);
});

// --- Source tasking ---------------------------------------------------------

test('source tasking selects approved registered sources and reports parser and health', () => {
  const requirement = find(requirementsOf(), (row) => row.subject.id === 'h-x');
  const tasking = requirementSources(requirement, {sources: approvedSourceRecords(), at: AT});
  assert.equal(tasking.state, 'REGISTERED_SOURCE_AVAILABLE');
  assert.equal(tasking.sources[0].sourceId, 'src-sns');
  assert.equal(tasking.sources[0].deterministicParserAvailable, true);
  assert.equal(tasking.sources[0].manualReviewRequired, false);
  assert.equal(tasking.sources[0].health.state, 'CURRENT');
  assert.equal(tasking.sources[0].cost, 'FREE_APPROVED_PUBLIC_SOURCE');
  assert.ok(!tasking.sources.some((source) => source.sourceId === 'src-unwatched'), 'an unwatched source is not tasked');
});

test('no registered source is reported explicitly, never as an empty success', () => {
  const requirement = find(requirementsOf(), (row) => row.subject.id === 'h-z');
  const tasking = requirementSources(requirement, {sources: approvedSourceRecords(), at: AT});
  assert.equal(tasking.state, 'NO_REGISTERED_SOURCE');
  assert.equal(tasking.manualReviewRequired, true);
  assert.match(tasking.reason, /VIGIA will not search for one/);
});

test('road and sensing requirements are handed to the acquisition lane, not to a directory source', () => {
  const road = find(requirementsOf(), (row) => row.requirementClass === 'ROAD_INFORMATION');
  assert.equal(requirementSources(road, {sources: approvedSourceRecords(), at: AT}).state, 'OWNED_BY_ACQUISITION_LANE');
});

test('a source needing review is marked as needing review', () => {
  const reception = find(requirementsOf(), (row) => row.requirementClass === 'RECEPTION_ACTIVATION');
  const tasking = requirementSources(reception, {sources: approvedSourceRecords(), at: AT});
  assert.equal(tasking.state, 'REGISTERED_SOURCE_AVAILABLE');
  assert.equal(tasking.sources[0].manualReviewRequired, true, 'a source without operational admission requires review');
  assert.equal(tasking.sources[0].health.state, 'STALE', 'a registered source past its refresh interval is still the right place to look, and is reported as stale');
  assert.equal(tasking.healthySourceCount, 0);
});
