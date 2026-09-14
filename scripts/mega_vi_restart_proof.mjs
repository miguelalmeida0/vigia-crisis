import {readFile,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {resolveLocalDatabaseUrl} from './local_database_secret.mjs';
const anchor=JSON.parse(await readFile('docs/handoffs/mega-vi/restart-anchor.json','utf8')),pool=new Pool({connectionString:await resolveLocalDatabaseUrl()});
try{
 const rows=(await pool.query('SELECT id,content_hash,universe FROM incident_situation_snapshot WHERE id=ANY($1::text[])',[anchor.snapshots.map(s=>s.id)])).rows;
 const missing=anchor.snapshots.filter(s=>!rows.some(r=>r.id===s.id&&r.content_hash===s.content_hash));
 const relationships=(await pool.query('SELECT count(*)::int n FROM incident_situation_dependency WHERE snapshot_id=ANY($1::text[])',[anchor.snapshots.map(s=>s.id)])).rows[0].n;
 const scenarioRows=(await pool.query("SELECT count(*)::int n FROM incident_situation_snapshot WHERE universe='SCENARIO'")).rows[0].n;
 const proof={capturedAt:new Date().toISOString(),anchorAt:anchor.capturedAt,expected:anchor.snapshots.length,retainedUnchanged:anchor.snapshots.length-missing.length,missing,relationships,scenarioRows,passed:missing.length===0&&rows.length===anchor.snapshots.length&&scenarioRows===0};
 await writeFile('docs/handoffs/mega-vi/restart-proof.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));if(!proof.passed)process.exitCode=1;
}finally{await pool.end();}
