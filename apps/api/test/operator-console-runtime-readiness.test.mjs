import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForOperatorState } from '../../../scripts/operator_console_runtime.mjs';

function clock() {
  let value = 0;
  return { now: () => value, wait: async ms => { value += ms; } };
}

test('operator readiness tolerates delayed listener discovery and requires the owned HTTP contract', async () => {
  const time = clock();
  let listenerChecks = 0;
  let httpChecks = 0;
  const result = await waitForOperatorState({
    expectedListening: true,
    expectedPid: 42,
    canonicalRoot: '/workspace/vigia/apps/operator-console',
    timeoutMs: 1000,
    intervalMs: 25,
    now: time.now,
    wait: time.wait,
    pidAlive: () => true,
    getListeners: async () => (++listenerChecks < 3 ? [] : [{ pid: 42, cwd: '/workspace/vigia/apps/operator-console' }]),
    probeHttp: async () => ({ ready: ++httpChecks >= 2, status: httpChecks >= 2 ? 200 : 503 }),
  });
  assert.equal(result.listeners[0].pid, 42);
  assert.ok(result.attempts >= 3);
});

test('operator readiness fails closed when a foreign listener wins the startup race', async () => {
  const time = clock();
  await assert.rejects(waitForOperatorState({
    expectedListening: true,
    expectedPid: 42,
    canonicalRoot: '/workspace/vigia/apps/operator-console',
    timeoutMs: 100,
    now: time.now,
    wait: time.wait,
    pidAlive: () => true,
    getListeners: async () => [{ pid: 99, cwd: '/other/product' }],
    probeHttp: async () => ({ ready: true, status: 200 }),
  }), /operator_console_foreign_listener_during_readiness/);
});

test('operator readiness diagnoses an owned child that exits before binding', async () => {
  const time = clock();
  await assert.rejects(waitForOperatorState({
    expectedListening: true,
    expectedPid: 42,
    timeoutMs: 100,
    now: time.now,
    wait: time.wait,
    pidAlive: () => false,
    getListeners: async () => [],
    probeHttp: async () => ({ ready: false, error: 'fetch failed' }),
  }), /operator_console_process_exited_before_ready/);
});

test('operator readiness never accepts HTTP without the canonical listener identity', async () => {
  const time = clock();
  await assert.rejects(waitForOperatorState({
    expectedListening: true,
    expectedPid: 42,
    timeoutMs: 50,
    intervalMs: 10,
    now: time.now,
    wait: time.wait,
    pidAlive: () => true,
    getListeners: async () => [],
    probeHttp: async () => ({ ready: true, status: 200 }),
  }), /operator_console_port_\d+_not_ready/);
});

test('operator stop readiness completes only after the listener disappears', async () => {
  const time = clock();
  let checks = 0;
  const result = await waitForOperatorState({
    expectedListening: false,
    canonicalRoot: '/workspace/vigia/apps/operator-console',
    timeoutMs: 100,
    intervalMs: 10,
    now: time.now,
    wait: time.wait,
    getListeners: async () => (++checks < 3 ? [{ pid: 42, cwd: '/workspace/vigia/apps/operator-console' }] : []),
  });
  assert.equal(result.listeners.length, 0);
});
