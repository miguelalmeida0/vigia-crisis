import assert from 'node:assert/strict';
import test from 'node:test';
import { restoreStableSearchInput } from '../src/stableSearchInput.js';

test('stable input restoration preserves node identity and does not rewrite unchanged editing value', () => {
  let writes = 0, replacement = null;
  const stable = {get value() {return 'Porto';}, set value(_) {writes++;}};
  const root = {querySelector: selector => {
    assert.equal(selector, '[data-input="incident-search"]');
    return {replaceWith: node => {replacement = node;}};
  }};
  assert.equal(restoreStableSearchInput(root, stable, '[data-input="incident-search"]', 'Porto'), true);
  assert.equal(replacement, stable);
  assert.equal(writes, 0);
});

test('stable input restoration updates explicit changed state and tolerates absent route input', () => {
  const stable = {value: 'old'};
  assert.equal(restoreStableSearchInput({querySelector: () => null}, stable, 'input', 'new'), false);
  assert.equal(stable.value, 'old');
  assert.equal(restoreStableSearchInput({querySelector: () => ({replaceWith() {}})}, stable, 'input', 'new'), true);
  assert.equal(stable.value, 'new');
  assert.equal(restoreStableSearchInput({}, null, 'input', ''), false);
});
