import assert from 'node:assert/strict';
import { idempotentMutationRequest, PROTECTION_MUTATION_TIMEOUT_MS } from '../src/vigiaApi.js';

const originalFetch = globalThis.fetch;

function response(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

async function captureSequence(statuses, body) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, method: options.method, body: options.body, headers: { ...options.headers } });
    const status = statuses.shift();
    return response(status, status >= 400 ? { error: `upstream_${status}` } : body);
  };
  return calls;
}

try {
  assert.equal(PROTECTION_MUTATION_TIMEOUT_MS, 24000, 'governed protection mutations must share the bounded operational lifecycle deadline');

  {
    const input = { action: 'RELEASE_OWNERSHIP', idempotencyKey: 'attention:release:one' };
    const calls = await captureSequence([502, 200], { state: 'released' });
    const result = await idempotentMutationRequest('/api/v10/operator/attention/one/actions', {
      method: 'POST', body: input, timeoutMs: 500
    });
    assert.equal(result.state, 'released');
    assert.equal(calls.length, 2, 'a transient failure receives exactly one retry');
    assert.equal(calls[0].body, calls[1].body, 'retry bytes must be identical');
    assert.equal(calls[0].body, JSON.stringify(input));
    assert.equal(JSON.parse(calls[1].body).idempotencyKey, input.idempotencyKey);
  }

  {
    const calls = await captureSequence([502, 200], { state: 'unsafe-retry' });
    await assert.rejects(
      () => idempotentMutationRequest('/api/v10/operator/attention/one/actions', {
        method: 'POST', body: { action: 'RELEASE_OWNERSHIP' }, timeoutMs: 500
      }),
      error => error.status === 502
    );
    assert.equal(calls.length, 1, 'a mutation without an idempotency key must not retry');
  }

  {
    const calls = await captureSequence([400, 200], { state: 'unsafe-retry' });
    await assert.rejects(
      () => idempotentMutationRequest('/api/v10/operator/attention/one/actions', {
        method: 'POST', body: { action: 'RELEASE_OWNERSHIP', idempotencyKey: 'attention:release:invalid' }, timeoutMs: 500
      }),
      error => error.status === 400
    );
    assert.equal(calls.length, 1, 'domain and authorization failures must not retry');
  }

  {
    const input = { action:'RECORD_ACTION', idempotencyKey:'period:record:timeout' };
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url, method:options.method, body:options.body });
      if (calls.length === 1) return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once:true });
      });
      return response(200, { state:'already-recorded' });
    };
    const result = await idempotentMutationRequest('/api/v10/operator/operational-periods/one/records', {
      method:'POST', body:input, timeoutMs:5
    });
    assert.equal(result.state, 'already-recorded');
    assert.equal(calls.length, 2, 'a bounded local timeout receives exactly one idempotent retry');
    assert.equal(calls[0].body, calls[1].body, 'a local-timeout retry must preserve exact mutation bytes');
    assert.equal(calls[0].body, JSON.stringify(input));
  }

  console.log('VIGIA API retry contract passed: one exact-body retry only for idempotent transient or local-timeout mutations.');
} finally {
  globalThis.fetch = originalFetch;
}
