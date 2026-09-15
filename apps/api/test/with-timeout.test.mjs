import test from 'node:test';
import assert from 'node:assert/strict';
import { withTimeout, InitializationTimeoutError } from '../src/shared/with-timeout.mjs';

test('withTimeout resolves normally when the factory settles before the deadline', async () => {
  const result = await withTimeout(async () => { await new Promise((r) => setTimeout(r, 5)); return 'ok'; }, { ms: 200, label: 'fast-step' });
  assert.equal(result, 'ok');
});

test('withTimeout propagates a rejection from the factory unchanged', async () => {
  await assert.rejects(
    () => withTimeout(async () => { throw new Error('boom'); }, { ms: 200, label: 'failing-step' }),
    /boom/
  );
});

test('withTimeout throws a labelled InitializationTimeoutError when the factory never settles', async () => {
  await assert.rejects(
    () => withTimeout(() => new Promise(() => {}), { ms: 30, label: 'stuck-step' }),
    (error) => {
      assert.ok(error instanceof InitializationTimeoutError);
      assert.equal(error.label, 'stuck-step');
      assert.equal(error.timeoutMs, 30);
      assert.match(error.message, /stuck-step/);
      return true;
    }
  );
});

test('withTimeout requires a positive ms and a label', async () => {
  await assert.rejects(() => withTimeout(async () => 1, { ms: 0, label: 'x' }), /withTimeout_requires_positive_ms/);
  await assert.rejects(() => withTimeout(async () => 1, { ms: 100, label: '' }), /withTimeout_requires_label/);
});
