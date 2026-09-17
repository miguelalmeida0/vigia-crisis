import { randomUUID } from 'node:crypto';

export const MAX_JOB_PAYLOAD_BYTES = 250_000;
export const MAX_JOB_ATTEMPTS = 5;
export const QUARANTINED_DUE_AT = '9999-12-31T23:59:59.999Z';
const permanentErrors = new Set([
  'situation_snapshot_payload_too_large', 'situation_job_payload_too_large',
  'situation_job_input_invalid', 'situation_job_payload_invalid',
  'scenario_cannot_write_operational_history', 'situation_job_retry_budget_exhausted'
]);
const facilityKeys = ['id','canonicalId','canonicalName','name','canonicalType','kind','coordinate','canonicalRevision','address','addressPrecision','locality','municipality','district','contact','capabilities','designation','authority','operator','presentation','distanceKm','distanceReference','staticCapability','freshness','fields','provenance'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (code, details = {}) => Object.assign(new Error(code), { statusCode: 422, ...details });

export function compactJobInput(input) {
  if (!object(input)) throw fail('situation_job_input_invalid');
  const result = { ...input };
  if (Array.isArray(result.facilities)) result.facilities = result.facilities.map(f => Object.fromEntries(facilityKeys.filter(k => f?.[k] !== undefined).map(k => [k, f[k]])));
  for (const key of ['routes', 'communityRoutes']) if (Array.isArray(result[key])) result[key] = result[key].map(route => {
    if (!object(route)) return route;
    const { geometry, alternatives, ...rest } = route;
    return { ...rest, alternatives: [] };
  });
  return result;
}

// Stop oversized strings/collections before JSON.stringify creates a second
// unbounded copy. The final serialized-byte check remains the exact boundary.
export function serializeJobPayload(payload) {
  const ancestors = new WeakSet();
  let entries = 0, rawBytes = 0;
  function walk(value, depth) {
    if (depth > 32 || ++entries > 30_000) throw fail('situation_job_payload_invalid');
    if (typeof value === 'string') rawBytes += Buffer.byteLength(value);
    else if (value !== null && typeof value === 'object') {
      if (ancestors.has(value) || (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))) throw fail('situation_job_payload_invalid');
      ancestors.add(value);
      for (const [key, child] of Object.entries(value)) {
        rawBytes += Buffer.byteLength(key);
        if (rawBytes > MAX_JOB_PAYLOAD_BYTES) throw fail('situation_job_payload_too_large', { limit: MAX_JOB_PAYLOAD_BYTES });
        walk(child, depth + 1);
      }
      ancestors.delete(value);
    } else if (['bigint', 'function', 'symbol'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) throw fail('situation_job_payload_invalid');
    if (rawBytes > MAX_JOB_PAYLOAD_BYTES) throw fail('situation_job_payload_too_large', { limit: MAX_JOB_PAYLOAD_BYTES });
  }
  walk(payload, 0);
  const serialized = JSON.stringify(payload);
  if (typeof serialized !== 'string') throw fail('situation_job_payload_invalid');
  const bytes = Buffer.byteLength(serialized);
  if (bytes > MAX_JOB_PAYLOAD_BYTES) throw fail('situation_job_payload_too_large', { bytes, limit: MAX_JOB_PAYLOAD_BYTES });
  return serialized;
}

export function retryDecision(error, attempts = 0) {
  const message = String(error?.message ?? error ?? '').slice(0, 250);
  const completedAttempts = Math.max(0, Number.isFinite(Number(attempts)) ? Math.floor(Number(attempts)) : 0) + 1;
  const terminal = permanentErrors.has(message) || completedAttempts >= MAX_JOB_ATTEMPTS
    || (message === 'situation_incident_location_unavailable' && completedAttempts >= 3);
  return { message, attempts: completedAttempts, terminal,
    delayMs: Math.min(15 * 60_000, 60_000 * 2 ** Math.min(completedAttempts - 1, 4)) };
}

export function quarantinePayload(job, error, at) {
  // Deliberately never copy the failed input into the dead letter. Keep only
  // bounded diagnostic identity: payloads may be malformed or multi-megabyte.
  return { reason: 'QUARANTINED', input: { incident: { id: String(job.incidentId).slice(0, 512) } },
    quarantine: { error: String(error).slice(0, 250), at,
      revision: String(job.revision).slice(0, 128), originalPayloadRetained: false } };
}

const mergedPayloadSql = `jsonb_build_object('reason',excluded.payload->'reason','input',
  (CASE WHEN incident_situation_job.due_at=$6::timestamptz THEN '{}'::jsonb ELSE COALESCE(incident_situation_job.payload->'input','{}'::jsonb) END)
  || (excluded.payload->'input') || jsonb_build_object('incident',
  (CASE WHEN incident_situation_job.due_at=$6::timestamptz THEN '{}'::jsonb ELSE COALESCE(incident_situation_job.payload->'input'->'incident','{}'::jsonb) END)
  || COALESCE(excluded.payload->'input'->'incident','{}'::jsonb)))`;

export async function enqueueSituationJob(store, incidentId, input, dueAt = new Date().toISOString()) {
  if (typeof incidentId !== 'string' || !incidentId || incidentId.length > 512 || !Number.isFinite(Date.parse(dueAt))) throw fail('situation_job_input_invalid');
  input = compactJobInput(input);
  const revision = randomUUID(), payload = { input, reason: input.reason ?? 'OBSERVED_PROJECTION' };
  const serialized = serializeJobPayload(payload);
  if (store.pool) {
    const result = await store.pool.query(`INSERT INTO incident_situation_job(incident_id,revision,payload,due_at) SELECT $1,$2,$3::jsonb,$4::timestamptz WHERE octet_length(($3::jsonb)::text)<=$5
      ON CONFLICT(incident_id) DO UPDATE SET revision=excluded.revision,payload=${mergedPayloadSql},
      attempts=0,last_error=NULL,due_at=LEAST(incident_situation_job.due_at,excluded.due_at)
      WHERE octet_length((${mergedPayloadSql})::text)<=$5`,
    [incidentId, revision, serialized, dueAt, MAX_JOB_PAYLOAD_BYTES, QUARANTINED_DUE_AT]);
    if (result.rowCount === 0) throw fail('situation_job_payload_too_large', { limit: MAX_JOB_PAYLOAD_BYTES });
    return;
  }
  return store.local(state => {
    const existing = state.jobs.find(j => j.incidentId === incidentId);
    const reusable = existing && existing.dueAt !== QUARANTINED_DUE_AT;
    const mergedInput = reusable ? { ...existing.input, ...input, incident: { ...existing.input?.incident, ...input.incident } } : input;
    serializeJobPayload({ input: mergedInput, reason: payload.reason });
    const row = { incidentId, revision, input: mergedInput, reason: payload.reason, attempts: 0, lastError: null,
      dueAt: reusable && existing.dueAt < dueAt ? existing.dueAt : dueAt };
    if (existing) { Object.assign(existing, row); delete existing.quarantine; } else state.jobs.push(row);
  });
}

export async function dueSituationJobs(store, at = new Date().toISOString()) {
  if (store.pool) {
    // Logical JSON bytes, not compressed TOAST/pg_column_size. Only inspect a
    // single due candidate; never download a heavy old payload to discard it.
    const { rows } = await store.pool.query(`WITH candidate AS (
      SELECT * FROM incident_situation_job WHERE due_at<=$1 AND due_at<>$3::timestamptz ORDER BY due_at,incident_id LIMIT 1
    ) SELECT incident_id,revision,due_at,attempts,
      CASE WHEN attempts>=$4 THEN jsonb_build_object('reason','RETRY_BUDGET_EXHAUSTED','input','{}'::jsonb)
      WHEN octet_length(payload::text)>$2 THEN jsonb_build_object('reason','QUARANTINE_REQUIRED','input','{}'::jsonb)
      ELSE payload END payload FROM candidate`, [at, MAX_JOB_PAYLOAD_BYTES, QUARANTINED_DUE_AT, MAX_JOB_ATTEMPTS]);
    const jobs = rows.map(r => ({ incidentId: r.incident_id, revision: r.revision, ...r.payload, dueAt: r.due_at.toISOString(), attempts: r.attempts }));
    if (jobs[0]?.reason === 'QUARANTINE_REQUIRED') { await finishSituationJob(store, jobs[0], 'situation_job_payload_too_large', at); return []; }
    if (jobs[0]?.reason === 'RETRY_BUDGET_EXHAUSTED') { await finishSituationJob(store, jobs[0], 'situation_job_retry_budget_exhausted', at); return []; }
    if (jobs[0]) try { serializeJobPayload({ input: compactJobInput(jobs[0].input), reason: jobs[0].reason }); }
    catch (error) { await finishSituationJob(store, jobs[0], error, at); return []; }
    return jobs;
  }
  return store.local(state => {
    const job = state.jobs.filter(j => j.dueAt <= at && j.dueAt !== QUARANTINED_DUE_AT).sort((a,b) => a.dueAt.localeCompare(b.dueAt))[0];
    if (!job) return [];
    try { if (Number(job.attempts ?? 0) >= MAX_JOB_ATTEMPTS) throw fail('situation_job_retry_budget_exhausted'); const input = compactJobInput(job.input); serializeJobPayload({ input, reason: job.reason }); return [{ ...job, input }]; }
    catch (error) {
      const payload = quarantinePayload(job, error.message, at);
      Object.assign(job, payload, { lastError: error.message, attempts: (job.attempts ?? 0) + 1, dueAt: QUARANTINED_DUE_AT });
      return [];
    }
  });
}

export async function finishSituationJob(store, job, error = null, at = new Date().toISOString()) {
  const decision = retryDecision(error, job.attempts);
  const dueAt = decision.terminal ? QUARANTINED_DUE_AT : new Date(Date.parse(at) + decision.delayMs).toISOString();
  if (store.pool) {
    if (!error) await store.pool.query('DELETE FROM incident_situation_job WHERE incident_id=$1 AND revision=$2', [job.incidentId, job.revision]);
    else if (decision.terminal) await store.pool.query(`UPDATE incident_situation_job SET payload=$3,attempts=$4,last_error=$5,due_at=$6
      WHERE incident_id=$1 AND revision=$2`, [job.incidentId, job.revision, JSON.stringify(quarantinePayload(job, decision.message, at)), decision.attempts, decision.message, dueAt]);
    else await store.pool.query(`UPDATE incident_situation_job SET attempts=attempts+1,last_error=$3,due_at=$4
      WHERE incident_id=$1 AND revision=$2`, [job.incidentId, job.revision, decision.message, dueAt]);
    return;
  }
  return store.local(state => {
    const index = state.jobs.findIndex(j => j.incidentId === job.incidentId && j.revision === job.revision);
    if (index < 0) return;
    if (!error) state.jobs.splice(index, 1);
    else Object.assign(state.jobs[index], decision.terminal ? quarantinePayload(job, decision.message, at) : {},
      { attempts: decision.attempts, lastError: decision.message, dueAt });
  });
}
