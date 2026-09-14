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

// --- Requirement generation -------------------------------------------------

test('requirements are generated as bounded classes with the counts they are derived from', () => {
  const result = requirementsOf();
  assert.ok(result.requirements.length > 0);
  assert.ok(result.requirements.every((row) => REQUIREMENT_CLASSES.includes(row.requirementClass)), 'no free-form requirement class may be emitted');
  const hospital = categoryCapability(result, 'emergency_hospital');
  assert.equal(hospital.currentKnownState.state, 'SINGLE_QUALIFIED_OPTION');
  assert.equal(hospital.currentKnownState.qualifiedFacilityCount, 1);
  assert.equal(hospital.retainedAlternative.state, 'NO_RETAINED_ALTERNATIVE');
  assert.equal(hospital.affected.communityCount, 4);
  assert.ok(hospital.affected.supportRelationshipCount > 0);
  assert.ok(hospital.dependentOutputs.includes('QUALIFIED_NEAREST_RANKING'));
  assert.match(hospital.truthBoundary, /never asserts the fact/);
});

test('an unresolved capability is recorded as unverified, never as absent', () => {
  const hospitalX = find(requirementsOf(), (row) => row.subject.id === 'h-x');
  assert.equal(hospitalX.requirementClass, 'FACILITY_CAPABILITY');
  assert.equal(hospitalX.currentKnownState.state, 'NOT_RESOLVED');
  assert.equal(hospitalX.currentKnownState.value, null);
  assert.match(hospitalX.currentKnownState.reason, /No accepted authoritative fact/);
  assert.match(hospitalX.question, /^Is an emergency department verified for Hospital X\?$/);
});

test('a candidate with no retained route is named as such rather than silently omitted', () => {
  const candidates = categoryCapability(requirementsOf(), 'emergency_hospital').currentKnownState.candidates;
  assert.deepEqual(candidates.map((row) => row.facilityId), ['h-z', 'h-x']);
  assert.equal(candidates.find((row) => row.facilityId === 'h-z').retainedRouteExists, false);
  assert.equal(candidates.find((row) => row.facilityId === 'h-x').retainedRouteExists, true);
});

test('a confirmed capability stops generating its requirement', () => {
  assert.ok(find(requirementsOf(), (row) => row.subject.id === 'h-x'));
  assert.equal(find(requirementsOf({confirmHospitalX: true}), (row) => row.subject.id === 'h-x'), undefined);
});

test('reception designation without activation is a requirement, and designation is never read as activation', () => {
  const reception = find(requirementsOf(), (row) => row.requirementClass === 'RECEPTION_ACTIVATION');
  assert.equal(reception.subject.id, 'r-1');
  assert.equal(reception.currentKnownState.state, 'DESIGNATED_ACTIVATION_UNCONFIRMED');
  assert.match(reception.currentKnownState.reason, /Designation is not activation/);
  assert.equal(find(requirementsOf({activateReception: true}), (row) => row.requirementClass === 'RECEPTION_ACTIVATION'), undefined);
});

test('partial road coverage is a requirement, and absence of a matched restriction is never read as open', () => {
  const road = find(requirementsOf(), (row) => row.requirementClass === 'ROAD_INFORMATION' && row.subject.id === 'EM527');
  assert.equal(road.currentKnownState.state, 'PARTIAL_COVERAGE');
  assert.match(road.currentKnownState.reason, /not confirmation that the road is open/);
  assert.ok(road.affected.supportRelationshipCount > 0);
});

test('identical requirements deduplicate by identity across regenerations', () => {
  const first = requirementsOf();
  const second = requirementsOf();
  assert.deepEqual(first.requirements.map((row) => row.id), second.requirements.map((row) => row.id));
  assert.equal(new Set(first.requirements.map((row) => row.id)).size, first.requirements.length);
});

test('a retained real Operational Picture yields requirements through the same generator', () => {
  const picture = {
    incident: {id: 'PT-TEST', name: 'Test'}, knownAt: AT, evaluatedAt: AT, universe: 'CURRENT_RETAINED', snapshotId: 'situation:test',
    support: {groups: [{id: 'emergency_hospital', label: 'Verified emergency hospital', qualifiedCount: 1, qualifiedIds: ['h-a'], options: [{facilityId: 'h-a', name: 'Hospital A', minutes: 12, roads: ['EM527']}], primary: {facilityId: 'h-a', name: 'Hospital A', minutes: 12, distanceKm: 9}, secondary: null}], corridors: [{road: 'EM527', routeCount: 12, relationships: [{id: 'edge:1', category: 'emergency_hospital', subjectId: 'community:1', facilityId: 'h-a', to: 'EM527'}], roadInformation: {state: 'PARTIAL', checkedAt: AT}}], notices: []},
    communities: [{id: 'community:1', name: 'Louredo', groups: [{id: 'emergency_hospital', options: [{facilityId: 'h-a'}]}], nearbyDesignations: []}],
    gaps: []
  };
  const result = informationRequirements(knowledgeStateFromPicture(picture));
  assert.equal(result.origin, 'RETAINED_OPERATIONAL_PICTURE');
  assert.ok(result.requirements.some((row) => row.subject.id === 'EM527'));
  const capability = categoryCapability(result, 'emergency_hospital');
  assert.equal(capability.currentKnownState.candidateState, 'CANDIDATE_SET_NOT_AVAILABLE_IN_THIS_PROJECTION', 'a projection without facilities must not invent candidates');
});
