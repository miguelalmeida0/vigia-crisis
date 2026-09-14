import {Pool} from 'pg';
import {resolveLocalDatabaseUrl} from './local_database_secret.mjs';
import {writeFile} from 'node:fs/promises';
const pool=new Pool({connectionString:await resolveLocalDatabaseUrl(),connectionTimeoutMillis:8000,query_timeout:8000});
const result={capturedAt:new Date().toISOString(),lane:'READ_ONLY_RUNTIME_DIAGNOSTIC'};
try{const start=performance.now();result.sessions=(await pool.query("SELECT state,wait_event_type,wait_event,count(*)::int sessions,max(extract(epoch from now()-query_start))::int oldest_query_seconds FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() GROUP BY state,wait_event_type,wait_event")).rows;result.latencyMs=Math.round(performance.now()-start);result.locks=(await pool.query('SELECT mode,granted,count(*)::int count FROM pg_locks GROUP BY mode,granted')).rows;}catch(error){result.error=error.message;}finally{await pool.end();}
await writeFile('docs/handoffs/mega-vi/postgres-runtime.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
