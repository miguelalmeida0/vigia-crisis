import { loadConfig } from '../apps/api/src/config/env.mjs';
import { runPostgresMigrations } from '../apps/api/src/modules/storage/postgres-migration-runner.mjs';
import pg from 'pg';

const config = loadConfig();
if (!config.databaseUrl) throw new Error('VIGIA_DATABASE_URL_or_FILE_required');
const pool = new pg.Pool({ connectionString: config.databaseUrl, application_name: 'vigia-migration-job', connectionTimeoutMillis: config.databaseConnectionTimeoutMs, query_timeout: 60_000, statement_timeout: 60_000, max: 1 });
try {
  let result,attempts=0;
  while(!result){
    attempts+=1;
    try{result=await runPostgresMigrations(pool);}
    catch(error){
      const retryable=['ECONNREFUSED','ECONNRESET','ETIMEDOUT','57P03','08000','08001','08003','08004','08006','08007','08P01'].includes(String(error?.code??''));
      if(!retryable||attempts>=30)throw error;
      await new Promise((resolve)=>setTimeout(resolve,1_000));
    }
  }
  console.log(JSON.stringify({ state: result.state, latestVersion: result.latestVersion, applied: result.applied, skipped: result.skipped, executionMs: result.executionMs,connectionAttempts:attempts }));
} finally { await pool.end(); }
