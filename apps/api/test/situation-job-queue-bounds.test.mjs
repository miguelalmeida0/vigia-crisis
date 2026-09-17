import test from 'node:test';
import assert from 'node:assert/strict';
import { compactJobInput, serializeJobPayload, retryDecision, quarantinePayload, enqueueSituationJob, dueSituationJobs, finishSituationJob, MAX_JOB_PAYLOAD_BYTES, MAX_JOB_ATTEMPTS, QUARANTINED_DUE_AT } from '../src/modules/intelligence/situation-job-queue.mjs';
const at = '2026-09-17T08:00:00.000Z';
function localStore() {
  let state = { jobs: [] }, tail = Promise.resolve();
  return { get state() { return structuredClone(state); }, local(operation) {
    const work = tail.then(async () => { const next = structuredClone(state); const result = await operation(next); state = next; return structuredClone(result); });
    tail = work.catch(() => {}); return work;
  } };
}

test('payload compaction removes route geometry, preserves addresses, distance and roads without mutating caller', () => {
  const input = { facilities: [{ id: 'hospital', address: 'Rua X', distanceKm: 8, ignored: true }], routes: [{ geometry: { coordinates: [1,2] }, roads: ['N114'], alternatives: [{ geometry: [] }], distanceKm: 9 }] };
  const compacted = compactJobInput(input);
  assert.equal(compacted.facilities[0].address, 'Rua X');
  assert.equal(compacted.facilities[0].distanceKm, 8);
  assert.equal(compacted.facilities[0].ignored, undefined);
  assert.equal(compacted.routes[0].geometry, undefined);
  assert.deepEqual(compacted.routes[0].roads, ['N114']);
  assert.ok(input.routes[0].geometry);
});
test('exact serialized UTF-8 byte boundary is enforced', () => {
  const overhead = Buffer.byteLength(JSON.stringify({ text: '' }));
  assert.equal(Buffer.byteLength(serializeJobPayload({ text: 'a'.repeat(MAX_JOB_PAYLOAD_BYTES - overhead) })), MAX_JOB_PAYLOAD_BYTES);
  assert.throws(() => serializeJobPayload({ text: 'a'.repeat(MAX_JOB_PAYLOAD_BYTES - overhead + 1) }), /payload_too_large/);
  assert.throws(() => serializeJobPayload({ text: '🔥'.repeat(70_000) }), /payload_too_large/);
});
test('JSON escaping growth cannot bypass the byte limit', () => {
  assert.throws(() => serializeJobPayload({ text: '\u0000'.repeat(50_000) }), /payload_too_large/);
});
test('cycles, excessive nesting, bigints and non-finite values fail before storage', () => {
  const cycle = {}; cycle.self = cycle;
  for (const value of [cycle, { x: 1n }, { x: Infinity }, { x: new Date() }]) assert.throws(() => serializeJobPayload(value), /payload_invalid/);
  let deep = {}; for (let i = 0; i < 40; i++) deep = { child: deep };
  assert.throws(() => serializeJobPayload(deep), /payload_invalid/);
});
test('invalid top-level job inputs are rejected', () => {
  for (const input of [null, [], 'hello', 123]) assert.throws(() => compactJobInput(input), /input_invalid/);
});
test('oversize enqueue is rejected before contacting PostgreSQL', async () => {
  let calls = 0;
  await assert.rejects(enqueueSituationJob({ pool: { query() { calls++; } } }, 'incident', { notes: 'a'.repeat(300_000) }, at), /payload_too_large/);
  assert.equal(calls, 0);
});
test('coalesced local job is bounded and rejection does not mutate persisted work', async () => {
  const store = localStore();
  await enqueueSituationJob(store, 'incident', { first: 'a'.repeat(140_000), incident: { id: 'incident' } }, at);
  const before = store.state;
  await assert.rejects(enqueueSituationJob(store, 'incident', { second: 'a'.repeat(140_000) }, at), /payload_too_large/);
  assert.deepEqual(store.state, before);
});
test('SQL enforces merged logical byte limit and signals a rejected upsert', async () => {
  let captured;
  const store = { pool: { query: async (sql, args) => { captured = { sql, args }; return { rowCount: 0 }; } } };
  await assert.rejects(enqueueSituationJob(store, 'incident', { incident: { id: 'incident' } }, at), /payload_too_large/);
  assert.match(captured.sql, /octet_length/);
  assert.doesNotMatch(captured.sql, /pg_column_size/);
  assert.match(captured.sql, /attempts=0,last_error=NULL/);
  assert.equal(captured.args[4], MAX_JOB_PAYLOAD_BYTES);
});
test('snapshot-size and malformed errors are terminal on first attempt', () => {
  for (const error of ['situation_snapshot_payload_too_large', 'situation_job_payload_too_large', 'situation_job_payload_invalid']) assert.equal(retryDecision(error).terminal, true);
  assert.equal(retryDecision(new Error('situation_snapshot_payload_too_large')).terminal, true);
});
test('transient errors use backoff and stop after exactly five executions', () => {
  assert.equal(retryDecision('connection_reset', 0).delayMs, 60_000);
  assert.equal(retryDecision('connection_reset', 1).delayMs, 120_000);
  assert.equal(retryDecision('connection_reset', MAX_JOB_ATTEMPTS - 2).terminal, false);
  assert.equal(retryDecision('connection_reset', MAX_JOB_ATTEMPTS - 1).terminal, true);
  assert.equal(retryDecision('situation_incident_location_unavailable', 1).terminal, false);
  assert.equal(retryDecision('situation_incident_location_unavailable', 2).terminal, true);
});
test('dead-letter metadata is bounded and does not duplicate original payload', () => {
  const payload = quarantinePayload({ incidentId: 'incident', revision: 'r', input: { huge: 'x'.repeat(3_000_000) } }, 'x'.repeat(10_000), at);
  assert.ok(Buffer.byteLength(JSON.stringify(payload)) < 1_000);
  assert.equal(payload.input.huge, undefined);
  assert.equal(payload.quarantine.originalPayloadRetained, false);
});
test('terminal failures are quarantined, not endlessly returned to the worker', async () => {
  const store = localStore();
  await enqueueSituationJob(store, 'incident', { incident: { id: 'incident' } }, at);
  const [job] = await dueSituationJobs(store, at);
  await finishSituationJob(store, job, 'situation_snapshot_payload_too_large', at);
  assert.equal(store.state.jobs[0].dueAt, QUARANTINED_DUE_AT);
  assert.equal(store.state.jobs[0].reason, 'QUARANTINED');
  assert.deepEqual(await dueSituationJobs(store, '2027-01-01T00:00:00.000Z'), []);
});
test('a stale successful or failed worker cannot overwrite a newer revision', async () => {
  const store = localStore();
  await enqueueSituationJob(store, 'incident', { incident: { id: 'incident' }, old: true }, at);
  const [old] = await dueSituationJobs(store, at);
  await enqueueSituationJob(store, 'incident', { fresh: true }, at);
  const before = store.state;
  await finishSituationJob(store, old, null, at);
  await finishSituationJob(store, old, 'situation_snapshot_payload_too_large', at);
  assert.deepEqual(store.state, before);
});
test('new revision replaces quarantine and resets retry budget without retaining its failed payload', async () => {
  const store = localStore();
  await enqueueSituationJob(store, 'incident', { incident: { id: 'incident' }, old: true }, at);
  const [job] = await dueSituationJobs(store, at);
  await finishSituationJob(store, job, 'situation_snapshot_payload_too_large', at);
  await enqueueSituationJob(store, 'incident', { incident: { id: 'incident' }, fresh: true }, at);
  const [fresh] = await dueSituationJobs(store, at);
  assert.equal(fresh.input.old, undefined);
  assert.equal(fresh.input.fresh, true);
  assert.equal(fresh.attempts, 0);
  assert.equal(fresh.lastError, null);
});
test('SQL oversized legacy jobs are quarantined without receiving the original payload', async () => {
  const calls = [];
  const store = { pool: { query: async (sql, args) => {
    calls.push({ sql, args });
    return calls.length === 1 ? { rows: [{ incident_id: 'incident', revision: 'r', due_at: new Date(at), attempts: 14, payload: { reason: 'QUARANTINE_REQUIRED', input: {} } }] } : { rowCount: 1 };
  } } };
  assert.deepEqual(await dueSituationJobs(store, at), []);
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /LIMIT 1/);
  assert.match(calls[0].sql, /octet_length\(payload::text\)/);
  assert.equal(calls[1].args[1], 'r');
  assert.equal(calls[1].args[5], QUARANTINED_DUE_AT);
});
test('legacy local oversized job is reduced to a small quarantined record', async () => {
  const store = localStore();
  await store.local(s => s.jobs.push({ incidentId: 'incident', revision: 'r', dueAt: at, input: { huge: 'x'.repeat(3_000_000) } }));
  assert.deepEqual(await dueSituationJobs(store, at), []);
  assert.ok(Buffer.byteLength(JSON.stringify(store.state)) < 1_000);
});
test('successful job completion removes only its matching revision', async () => {
  const store = localStore();
  await enqueueSituationJob(store, 'incident', { incident: { id: 'incident' } }, at);
  const [job] = await dueSituationJobs(store, at);
  await finishSituationJob(store, job, null, at);
  assert.deepEqual(store.state.jobs, []);
});
test('retry-exhausted legacy jobs are quarantined before another execution', async () => {
  const store = localStore();
  await store.local(s => s.jobs.push({ incidentId: 'incident', revision: 'r', dueAt: at, attempts: 55, input: { incident: { id: 'incident' } } }));
  assert.deepEqual(await dueSituationJobs(store, at), []);
  assert.equal(store.state.jobs[0].lastError, 'situation_job_retry_budget_exhausted');
});
