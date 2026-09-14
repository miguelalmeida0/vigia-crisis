import {readFile,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {resolveLocalDatabaseUrl} from './local_database_secret.mjs';
const root='docs/handoffs/mega-vii',pool=new Pool({connectionString:await resolveLocalDatabaseUrl()});
try {
 if(process.argv.includes('--anchor')) {
  const snapshots=(await pool.query('SELECT id,content_hash,universe FROM incident_situation_snapshot ORDER BY known_at DESC,capture_sequence DESC LIMIT 5')).rows;
  await writeFile(root+'/restart-anchor.json',JSON.stringify({capturedAt:new Date().toISOString(),snapshots},null,2));
  console.log('Saved five snapshot hashes before restart.');
 } else {
  const anchor=JSON.parse(await readFile(root+'/restart-anchor.json','utf8'));
  const rows=(await pool.query('SELECT id,content_hash,universe FROM incident_situation_snapshot WHERE id=ANY($1::text[])',[anchor.snapshots.map(s=>s.id)])).rows;
  const missing=anchor.snapshots.filter(s=>!rows.some(r=>r.id===s.id&&r.content_hash===s.content_hash));
  const scenarioRows=(await pool.query("SELECT count(*)::int n FROM incident_situation_snapshot WHERE universe='SCENARIO'")).rows[0].n;
  const proof={capturedAt:new Date().toISOString(),anchorAt:anchor.capturedAt,expected:anchor.snapshots.length,retainedUnchanged:anchor.snapshots.length-missing.length,missing,scenarioRows,passed:missing.length===0&&scenarioRows===0};
  await writeFile(root+'/restart-proof.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));if(!proof.passed)process.exitCode=1;
 }
} finally {await pool.end();}
