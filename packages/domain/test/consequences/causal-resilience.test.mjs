import test from 'node:test';
import assert from 'node:assert/strict';
import {AT, em527BlockedReport, em527Scenario} from './consequence-fixture.mjs';
import {EARLIER_AT, confirmation, officialRestriction, staleRoadScenario, unusedWeatherFact} from './consequence-fixture-xi.mjs';
import {operationalProjection} from '../../src/consequences/operational-consequences.mjs';
import {causalTransition} from '../../src/consequences/causal-transition.mjs';
import {knowledgeLoss} from '../../src/consequences/knowledge-loss.mjs';
import {evidenceStrength, relianceGuidance} from '../../src/consequences/evidence-strength.mjs';
import {classifyStaleness, explainStaleness, factFreshness, routeSupportingFacts} from '../../src/consequences/freshness.mjs';
import {extractCanonicalInputs} from '../../src/consequences/canonical-inputs.mjs';

const beforeAfter = () => ({
  previous: operationalProjection({...em527Scenario({reports: [], at: EARLIER_AT}), at: EARLIER_AT}),
  current: operationalProjection(em527Scenario())
});

// --- A. CAUSAL CHAIN -------------------------------------------------------

test('A1 · the report is derived as the cause of the mission moving GOOD to PROBLEM', () => {
  const {previous, current} = beforeAfter();
  assert.ok(previous.missions.every((row) => row.state === 'GOOD'), 'nothing was wrong beforehand');
  const transition = causalTransition({previous, current});
  const fire = transition.missionTransitions.find((row) => row.missionId === 'mission-fire_response');
  assert.equal(fire.previousState, 'GOOD');
  assert.equal(fire.currentState, 'PROBLEM');
  assert.equal(fire.relation, 'CAUSED');
  assert.equal(fire.connective, 'because');
  assert.equal(fire.evidenceStrength, 'DERIVED_DEPENDENCY');
  assert.ok(fire.causedByConsequenceId);
  assert.deepEqual(fire.factsUsed.reportIds, ['report-em527-blocked']);
});

test('A2 · the causal chain names each hop, not just the endpoints', () => {
  const transition = causalTransition(beforeAfter());
  const fire = transition.missionTransitions.find((row) => row.missionId === 'mission-fire_response');
  assert.deepEqual(fire.chain.map((row) => row.step), ['TRIGGER', 'ROAD_DEPENDENCY', 'ROUTE_AVAILABILITY', 'MISSION_STATE']);
  assert.match(fire.chain[0].text, /A field report says EM527 was blocked at 18:21\./);
  assert.match(fire.chain[1].text, /EM527 carries the stored fire response route/);
  assert.match(fire.chain[2].text, /no other current route is stored/);
  assert.match(fire.chain[3].text, /moved GOOD → PROBLEM/);
});

test('A3 · consequences added and the narrative are both derived, and time moves forward only', () => {
  const {previous, current} = beforeAfter();
  const transition = causalTransition({previous, current});
  assert.equal(transition.consequencesAdded.length, 1);
  assert.equal(transition.consequencesResolved.length, 0);
  assert.ok(transition.whyItChanged.some((row) => /moved GOOD → PROBLEM because A field report says EM527/.test(row)));
  assert.throws(() => causalTransition({previous: current, current: previous}), /forward_time/);
});

test('A4 · causality is never asserted from timing alone', () => {
  // A mission that changed with no derived dependency to the trigger must be
  // reported as having changed AFTER, never BECAUSE.
  const {previous, current} = beforeAfter();
  const unrelated = {...current, missions: current.missions.map((row) => (row.service === 'emergency_hospital'
    ? {...row, id: 'mission-unlinked', state: 'WATCH'} : row))};
  const previousUnrelated = {...previous, missions: previous.missions.map((row) => (row.service === 'emergency_hospital'
    ? {...row, id: 'mission-unlinked', state: 'GOOD'} : row))};
  const transition = causalTransition({previous: previousUnrelated, current: unrelated});
  const unlinked = transition.missionTransitions.find((row) => row.missionId === 'mission-unlinked');
  assert.equal(unlinked.relation, 'FOLLOWED');
  assert.equal(unlinked.connective, 'after');
  assert.equal(unlinked.causedByConsequenceId, null);
  assert.ok(transition.unexplainedChanges.some((row) => /No derived dependency links it/.test(row)));
});

// --- B. STALE CRITICAL DEPENDENCY ------------------------------------------

test('B1 · expired road information moves the mission by existing semantics, inventing no state', () => {
  const scenario = staleRoadScenario();
  const fire = scenario.missions.find((row) => row.service === 'fire_response');
  assert.equal(fire.state, 'UNKNOWN', 'the product mission rules already handle this');
  assert.match(fire.reason, /Road information has not been checked recently/);
  assert.notEqual(fire.state, 'GOOD', 'it is no longer presented as confidently good');
});

test('B2 · the sole-support case is classified critical, and says why', () => {
  const scenario = staleRoadScenario();
  const inputs = extractCanonicalInputs(scenario);
  const fireRoutes = inputs.routesByServiceSubject.get('evora-centro::fire_response');
  const facts = routeSupportingFacts(fireRoutes[0], {sourceValidUntil: scenario.sourceValidUntil, sourceLastCheckedAt: scenario.sourceLastCheckedAt, at: scenario.at});
  const road = facts.find((row) => row.kind === 'ROAD_INFORMATION');
  assert.equal(road.state, 'EXPIRED');
  assert.equal(road.usableAsSupport, false);
  assert.equal(road.age, '2h 18m');

  const classification = classifyStaleness(road, {activeMissionCount: 1, missionsWithoutAlternative: 1, serviceCount: 1, routeIds: ['route-f1']});
  assert.equal(classification.class, 'CRITICAL_SOLE_SUPPORT');
  const explained = explainStaleness(road, classification, {subjectLabel: 'EM527', serviceLabel: 'fire response'});
  assert.equal(explained.headline, 'NEEDS CHECKING');
  assert.equal(explained.text, 'The only stored fire response route depends on road information last checked 2h 18m ago.');
  assert.equal(explained.action, 'Confirm EM527 before relying on this route.');
});

test('B3 · no blocked or open claim is fabricated from expiry, in either direction', () => {
  const scenario = staleRoadScenario();
  const inputs = extractCanonicalInputs(scenario);
  const facts = routeSupportingFacts(inputs.routesByServiceSubject.get('evora-centro::fire_response')[0],
    {sourceValidUntil: scenario.sourceValidUntil, sourceLastCheckedAt: scenario.sourceLastCheckedAt, at: scenario.at});
  const road = facts.find((row) => row.kind === 'ROAD_INFORMATION');
  const explained = explainStaleness(road, classifyStaleness(road, {activeMissionCount: 1, missionsWithoutAlternative: 1, serviceCount: 1, routeIds: []}), {subjectLabel: 'EM527', serviceLabel: 'fire response'});
  const text = `${explained.text} ${explained.action}`;
  assert.doesNotMatch(text, /blocked|closed|open|passable|clear/i);
  assert.match(explained.boundary, /does not mean the road is blocked, and it does not mean the road is open/);
});

test('B4 · a fact with no stated validity is never assumed current', () => {
  const unstated = factFreshness({factId: 'x', lastCheckedAt: AT}, AT);
  assert.equal(unstated.state, 'VALIDITY_UNKNOWN');
  assert.equal(unstated.usableAsSupport, false);
});

// --- C. STALE NONCRITICAL FACT ---------------------------------------------

test('C1 · an unused expired fact is background, and ranks below a critical one', () => {
  const weather = factFreshness(unusedWeatherFact(), AT);
  assert.equal(weather.state, 'EXPIRED');
  const background = classifyStaleness(weather, {activeMissionCount: 0, missionsWithoutAlternative: 0, serviceCount: 0, routeIds: []});
  assert.equal(background.class, 'BACKGROUND_NO_DEPENDENT_DECISION');
  const critical = classifyStaleness(weather, {activeMissionCount: 1, missionsWithoutAlternative: 1, serviceCount: 1, routeIds: []});
  assert.ok(critical.rank < background.rank, 'the critical dependency outranks the unused fact');
  assert.match(background.because, /no active objective or current conclusion depends on it/);
});

test('C2 · a stale fact with an alternative retained ranks below one without', () => {
  const weather = factFreshness(unusedWeatherFact(), AT);
  const withAlternative = classifyStaleness(weather, {activeMissionCount: 1, missionsWithoutAlternative: 0, serviceCount: 1, routeIds: []});
  const without = classifyStaleness(weather, {activeMissionCount: 1, missionsWithoutAlternative: 1, serviceCount: 1, routeIds: []});
  assert.equal(withAlternative.class, 'ROUTINE_ALTERNATIVE_RETAINED');
  assert.ok(without.rank < withAlternative.rank);
});

// --- G. KNOWLEDGE LOSS -----------------------------------------------------

test('G1 · a vanished alternative with nothing to explain it is previously known, not false', () => {
  const previous = operationalProjection({...em527Scenario({reports: [], at: EARLIER_AT}), at: EARLIER_AT});
  // The alternative is simply no longer in the projection; nothing reported it.
  const current = operationalProjection({...em527Scenario({reports: [], at: AT}),
    missions: em527Scenario({reports: [], at: AT}).missions.map((row) => (row.service === 'emergency_hospital'
      ? {...row, fallback: null, alternativeCount: 0, alternativeRoutes: []} : row))});
  const loss = knowledgeLoss({previous, current});
  const row = loss.losses.find((item) => item.missionId === 'mission-emergency_hospital');
  assert.equal(row.kind, 'PREVIOUSLY_KNOWN_NOW_UNVERIFIED');
  assert.equal(row.currentState, 'UNKNOWN_PENDING_CHECK');
  assert.equal(row.text, 'Another route was previously stored, but its current status needs checking.');
  // The previous value is retained, not deleted.
  assert.equal(row.previouslyKnown.routeId, 'route-h2');
  assert.equal(row.previouslyKnown.minutes, 24);
  assert.match(row.boundary, /Nothing reported this route as unusable/);
});

test('G2 · a loss a consequence explains is attributed to the report, not to expiry', () => {
  const previous = operationalProjection({...em527Scenario({reports: [], at: EARLIER_AT}), at: EARLIER_AT});
  const scenario = em527Scenario();
  const current = operationalProjection({...scenario,
    missions: scenario.missions.map((row) => (row.service === 'emergency_hospital'
      ? {...row, fallback: null, alternativeCount: 0} : row))});
  const row = knowledgeLoss({previous, current}).losses.find((item) => item.missionId === 'mission-emergency_hospital');
  assert.equal(row.kind, 'SUPERSEDED_BY_OBSERVATION');
  assert.equal(row.currentState, 'REMOVED_BY_REPORTED_CHANGE');
  assert.ok(row.explainedByConsequenceId);
});

// --- J. CONFIRMATION / EVIDENCE STRENGTH -----------------------------------

test('J1 · one report, two responders and an official restriction stay three distinct states', () => {
  const single = evidenceStrength({kind: 'FIELD_REPORT', reportId: 'report-em527-blocked', confirmations: []});
  const confirmed = evidenceStrength({kind: 'FIELD_REPORT', reportId: 'report-em527-blocked', confirmations: [confirmation()]});
  const official = evidenceStrength({kind: 'OFFICIAL_RESTRICTION', establishesOfficialClosure: true});
  assert.equal(single.state, 'SINGLE_FIELD_OBSERVATION');
  assert.equal(confirmed.state, 'MULTI_RESPONDER_CONFIRMED');
  assert.equal(official.state, 'AUTHORITATIVE_RESTRICTION');
  assert.equal(new Set([single.state, confirmed.state, official.state]).size, 3);
});

test('J2 · corroboration raises reliance but never becomes an official closure', () => {
  const confirmed = evidenceStrength({kind: 'FIELD_REPORT', reportId: 'report-em527-blocked', confirmations: [confirmation()]});
  assert.equal(confirmed.confirmingResponderCount, 1);
  assert.equal(confirmed.reliance, 'CORROBORATED_OBSERVATION');
  // The line that must never be crossed.
  assert.equal(confirmed.establishesOfficialClosure, false);
  assert.doesNotMatch(confirmed.text, /closed|official/i);
  assert.equal(evidenceStrength({kind: 'OFFICIAL_RESTRICTION', establishesOfficialClosure: true}).establishesOfficialClosure, true);
});

test('J3 · disagreement is reported as disagreement, not resolved into truth', () => {
  const disputed = evidenceStrength({kind: 'FIELD_REPORT', reportId: 'report-em527-blocked',
    confirmations: [confirmation(), confirmation({id: 'c2', senderId: 'responder-cara', answer: 'NOT_BLOCKED'})]});
  assert.equal(disputed.state, 'CONFLICTING_FIELD_REPORTS');
  assert.equal(disputed.establishesOfficialClosure, false);
  assert.match(relianceGuidance(disputed, {hasAlternative: false}), /Responders disagree/);
});

test('J4 · reliance guidance reflects whether an alternative remains', () => {
  const single = evidenceStrength({kind: 'FIELD_REPORT', reportId: 'r', confirmations: []});
  assert.match(relianceGuidance(single, {hasAlternative: false}), /no other current route is stored/);
  assert.match(relianceGuidance(single, {hasAlternative: true}), /Another stored route remains/);
  assert.match(relianceGuidance(evidenceStrength({kind: 'OFFICIAL_RESTRICTION'}), {hasAlternative: true}), /official record/);
  assert.ok(officialRestriction().admitted);
});
