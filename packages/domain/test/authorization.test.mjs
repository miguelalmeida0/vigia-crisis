import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCan, can } from '../src/authorization.mjs';

test('roles expose bounded capabilities', () => {
  assert.equal(can({ role: 'field_inspector' }, 'submit:evidence'), true);
  assert.equal(can({ role: 'field_inspector' }, 'verify:hazard'), false);
  assert.throws(() => assertCan({ role: 'viewer' }, 'create:intervention'), /forbidden/);
});
