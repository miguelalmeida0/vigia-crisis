import test from 'node:test';
import assert from 'node:assert/strict';
import {em527Scenario} from './consequence-fixture.mjs';
import {operationalConsequences} from '../../src/consequences/operational-consequences.mjs';
import {consequenceActions, consequenceCard, consequenceSection} from '../../../../apps/operator-console/src/approved/ui/operational-consequence.js';

const btn = (label, cmd, id = '', primary = false) => `<button data-team="${cmd}" data-id="${id}"${primary ? ' class="primary"' : ''}>${label}</button>`;
const result = () => operationalConsequences(em527Scenario());

test('P1 · Important Now renders the derived operational conclusion', () => {
  const html = consequenceSection(result(), {btn});
  assert.match(html, /FIRE RESPONSE ACCESS NEEDS ATTENTION/);
  assert.match(html, /A field report says EM527 was blocked at 18:21\./);
  assert.match(html, /The road is used by fire response and healthcare routes\./);
  assert.match(html, /No other current fire response route is stored\./);
  assert.match(html, /Healthcare still has another stored route: 24 min\./);
  assert.match(html, /Look at fire response first\./);
});

test('P2 · the card offers the product’s existing actions, wired to real records', () => {
  const actions = consequenceActions(result().consequences[0]);
  assert.deepEqual(actions.map((row) => row.cmd), ['mission', 'report', 'routes']);
  assert.equal(actions[0].id, 'mission-fire_response', 'opens the mission that has no alternative');
  assert.equal(actions[1].id, 'report-em527-blocked');
  assert.equal(actions[2].id, 'mission-emergency_hospital', 'route comparison goes to the service that has another route');
});

test('P3 · the surface shows observed and received times separately', () => {
  const html = consequenceCard(result().consequences[0], {btn});
  assert.match(html, /observed 2026-09-14T18:21/);
  assert.match(html, /received 2026-09-14T18:23/);
});

test('P4 · the surface uses operational language, never engine jargon', () => {
  const html = consequenceSection(result(), {btn});
  assert.doesNotMatch(html, /dependency graph|epistemic|inference|knowledge node|confidence|priority score|tier|heuristic/i);
});

test('P5 · the surface renders nothing rather than something misleading when nothing is derived', () => {
  assert.equal(consequenceSection(operationalConsequences(em527Scenario({reports: []})), {btn}), '');
  assert.equal(consequenceSection(null, {btn}), '');
  assert.equal(consequenceSection({consequences: []}, {btn}), '');
});

test('P6 · the card escapes record text rather than trusting it', () => {
  const scenario = em527Scenario();
  const poisoned = {...scenario, reports: [{...scenario.reports[0], senderName: '<img src=x onerror=alert(1)>'}]};
  const html = consequenceCard(operationalConsequences(poisoned).consequences[0], {btn});
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
});
