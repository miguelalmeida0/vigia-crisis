import {Pool} from 'pg';
import {writeFile,readFile} from 'node:fs/promises';
import {resolveLocalDatabaseUrl} from './local_database_secret.mjs';
import {compareSituations} from '../packages/domain/src/intelligence/situation-model.mjs';
const pool=new Pool({connectionString:await resolveLocalDatabaseUrl()});
try{
  const snapshots=(await pool.query("SELECT DISTINCT ON(incident_id) payload FROM incident_situation_snapshot WHERE universe='OPERATIONAL' ORDER BY incident_id,known_at DESC,capture_sequence DESC")).rows.map(r=>r.payload);
  const prior=JSON.parse(await readFile('docs/handoffs/mega-ii/live-proof.json','utf8'));
  const retained=[];for(const old of prior.incidents.filter(r=>r.snapshotId)){const row=(await pool.query('SELECT payload FROM incident_situation_snapshot WHERE id=$1',[old.snapshotId])).rows[0]?.payload;retained.push({incidentId:old.id,snapshotId:old.snapshotId,retained:Boolean(row),knownAt:row?.knownAt,hash:row?.contentHash});}
  const changes=[];for(const s of snapshots){const first=(await pool.query('SELECT payload FROM incident_situation_snapshot WHERE incident_id=$1 ORDER BY known_at,capture_sequence LIMIT 1',[s.incident.id])).rows[0]?.payload;changes.push({incidentId:s.incident.id,diff:compareSituations(first,s)});}
  const facts=(await pool.query("SELECT payload->>'canonicalType' type,count(*)::int count FROM world_knowledge_entity WHERE payload->>'redirectTo' IS NULL GROUP BY 1")).rows;
  const jobs=(await pool.query("SELECT state,count(*)::int count FROM world_knowledge_job GROUP BY state")).rows;
  const gaps=(await pool.query("SELECT id,payload FROM world_knowledge_job WHERE payload->>'type'='ENRICH_FACILITY' AND payload->'payload'->>'incidentId' IS NOT NULL ORDER BY priority DESC LIMIT 20")).rows.map(r=>({id:r.id,entityId:r.payload.subject,state:r.payload.state,priority:r.payload.priority,gap:r.payload.payload,lastAttempt:r.payload.lastAttempt,nextEligibleAttempt:r.payload.nextEligibleAttempt,attemptedSources:r.payload.attemptedSources}));
  const report={capturedAt:new Date().toISOString(),lane:'LIVE_RETAINED_OPERATIONAL_DATA',currentRelationships:snapshots.flatMap(s=>s.relationships).reduce((o,r)=>(o[r.kind]=(o[r.kind]??0)+1,o),{}),incidents:snapshots.map(s=>({id:s.incident.id,knownAt:s.knownAt,facilities:s.facilities.length,routes:s.routes.length,rankings:s.rankings,thermal:s.thermal.map(o=>({source:o.source,observedAt:o.observedAt,state:o.sourceState})),sourceHealth:s.sources.map(x=>({name:x.name,state:x.state,lastSuccessfulRefresh:x.lastSuccessfulRefresh,lastRelevantObservation:x.lastRelevantObservation}))})),canonicalFacilitiesByType:facts,jobs,priorityGapExamples:gaps,restart:{snapshotsRetained:retained.every(s=>s.retained),retained,modelCallsRequired:0,proof:'Historical rows read directly after runtime restart, without invoking an inference endpoint.'},temporalDiffs:changes};
  await writeFile('docs/handoffs/mega-ii/quality-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({relationships:report.currentRelationships,restart:report.restart.snapshotsRetained,incidents:snapshots.length}));
}finally{await pool.end();}
