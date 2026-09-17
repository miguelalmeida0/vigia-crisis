import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { MAX_JOB_PAYLOAD_BYTES, MAX_JOB_ATTEMPTS, QUARANTINED_DUE_AT, quarantinePayload } from '../../apps/api/src/modules/intelligence/situation-job-queue.mjs';

export function maintenanceOptions(argv, env) {
  if (env.VIGIA_DEMO_CONFIRM !== 'SYNTHETIC_DEMO_ONLY') throw new Error('explicit_isolated_demo_confirmation_required');
  const allowed = new Set(['--apply', '--confirm=QUARANTINE_SYNTHETIC_JOBS']);
  if (argv.some(arg => !allowed.has(arg) && !arg.startsWith('--expected-host=') && !arg.startsWith('--incident='))) throw new Error('unknown_maintenance_argument');
  const url = new URL(env.VIGIA_DATABASE_URL || '');
  const expectedHost = argv.find(arg => arg.startsWith('--expected-host='))?.slice('--expected-host='.length);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !expectedHost || url.hostname !== expectedHost) throw new Error('database_host_confirmation_mismatch');
  if (['vigia-live', 'vigia-public-demo-db'].some(marker => url.href.toLowerCase().includes(marker))) throw new Error('production_database_forbidden');
  const incidents = [...new Set(argv.filter(arg => arg.startsWith('--incident=')).map(arg => arg.slice('--incident='.length)))];
  if (!incidents.length || incidents.length > 25 || incidents.some(id => !id || id.length > 512 || /[\x00-\x1f]/.test(id))) throw new Error('one_to_25_explicit_incident_ids_required');
  const apply = argv.includes('--apply');
  if (apply && !argv.includes('--confirm=QUARANTINE_SYNTHETIC_JOBS')) throw new Error('quarantine_confirmation_required');
  return { connectionString: url.href, incidents, apply };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const options = maintenanceOptions(argv, env);
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: options.connectionString, max: 1, connectionTimeoutMillis: 3_000, statement_timeout: 3_000, lock_timeout: 1_000 });
  try {
    // Explicit incident scope, metadata-only response, one bounded batch. No
    // history deletion, VACUUM FULL, bulk payload download, or automatic retry.
    const { rows } = await pool.query(`SELECT incident_id,revision,attempts,last_error,octet_length(payload::text) AS bytes
      FROM incident_situation_job WHERE incident_id=ANY($1::text[]) AND due_at<>$4::timestamptz
      AND (octet_length(payload::text)>$2 OR attempts>=$3
        OR last_error IN ('situation_snapshot_payload_too_large','situation_job_payload_too_large','situation_job_payload_invalid')
        OR jsonb_typeof(payload->'input') IS DISTINCT FROM 'object')
      ORDER BY incident_id LIMIT 25`, [options.incidents, MAX_JOB_PAYLOAD_BYTES, MAX_JOB_ATTEMPTS, QUARANTINED_DUE_AT]);
    const result = { mode: options.apply ? 'apply' : 'dry-run', matched: rows.length, changed: 0, jobs: rows };
    if (options.apply) for (const row of rows) {
      const error = row.bytes > MAX_JOB_PAYLOAD_BYTES ? 'situation_job_payload_too_large' : row.last_error || 'situation_job_retry_budget_exhausted';
      const payload = quarantinePayload({ incidentId:row.incident_id,revision:row.revision }, error, new Date().toISOString());
      payload.quarantine.originalBytes = row.bytes;
      const change = await pool.query(`UPDATE incident_situation_job SET payload=$3,last_error=$4,due_at=$5
        WHERE incident_id=$1 AND revision=$2`, [row.incident_id,row.revision,JSON.stringify(payload),error,QUARANTINED_DUE_AT]);
      result.changed += change.rowCount;
    }
    console.log(JSON.stringify(result));
    return result;
  } finally { await pool.end(); }
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(JSON.stringify({ error:String(error.message ?? error).slice(0,200) })); process.exitCode=1; });
}
