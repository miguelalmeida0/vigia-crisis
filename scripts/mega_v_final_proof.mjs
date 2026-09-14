import {readFile,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {resolveLocalDatabaseUrl} from './local_database_secret.mjs';
import {compareSituations} from '../packages/domain/src/intelligence/situation-model.mjs';
const out='docs/handoffs/mega-v',token=(await readFile('.tmp/release/operator-token','utf8')).trim();
async function get(path){const start=performance.now();try{const r=await fetch('http://127.0.0.1:4177'+path,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(45000)});return{status:r.status,latencyMs:performance.now()-start,data:await r.json()};}catch(e){return{status:null,error:e.message};}}
const report={capturedAt:new Date().toISOString(),lane:'REAL_RETAINED_HISTORY_AND_API_NO_CONTROLLED_OPERATIONAL_WRITES'};
const live=await get('/api/v10/events');report.physicalReadinessSources={status:live.status,sources:live.data?.sources,summary:live.data?.summary};
for(const [name,path] of [['ready-final','/ready'],['quality-final','/api/v10/operator/situation-quality'],['audit-final','/api/v2/audit?limit=1']]){const result=await get(path);await writeFile(out+'/'+name+'.json',JSON.stringify(result,null,2));report[name]={status:result.status,error:result.error};}
const pool=new Pool({connectionString:await resolveLocalDatabaseUrl()}),incident='incident:PT-2026-01F7E2E21A',base='/api/v10/operator/incidents/'+encodeURIComponent(incident)+'/situation';
try{
 report.historyCoverage=(await pool.query("SELECT incident_id,count(*)::int count,min(known_at) first,max(known_at) last FROM incident_situation_snapshot WHERE universe='OPERATIONAL' GROUP BY incident_id")).rows;
 const times=(await pool.query('SELECT id,known_at FROM incident_situation_snapshot WHERE incident_id=$1 ORDER BY known_at,capture_sequence',[incident.replace(/^incident:/,'')])).rows;
 const selected=[times[0],times[Math.floor(times.length/2)],times.at(-1)];
 const snapshots=[];for(const t of selected)snapshots.push((await pool.query('SELECT payload FROM incident_situation_snapshot WHERE id=$1',[t.id])).rows[0].payload);
 report.moments=snapshots.map(s=>({id:s.id,knownAt:s.knownAt,facilities:s.facilities.length,rankings:s.rankings,emergency:s.facilities.find(f=>f.id===s.rankings.nearestEmergencyHospital),receptions:s.facilities.filter(f=>f.canonicalType==='temporary_reception_center').map(f=>({id:f.id,name:f.canonicalName,coordinate:f.coordinate}))}));
 report.futureFacilityEvidence=snapshots.flatMap(s=>s.facilities.flatMap(f=>(f.evidence??[]).filter(e=>e.receivedAt&&Date.parse(e.receivedAt)>Date.parse(s.knownAt)).map(e=>({snapshotId:s.id,entityId:f.id,evidence:e}))));
 report.comparisons=[compareSituations(snapshots[0],snapshots[1]),compareSituations(snapshots[1],snapshots[2])];
 report.storedHistoryUnchanged=(await pool.query('SELECT id,content_hash FROM incident_situation_snapshot WHERE id=ANY($1::text[])',[selected.map(t=>t.id)])).rows;
 const s=snapshots.at(-1);report.liveAffectedRoutes=s.routes.filter(r=>r.state==='AFFECTED_BY_RESTRICTION').map(r=>({route:r,facility:s.facilities.find(f=>f.id===r.facilityId),reports:s.roadReports.filter(x=>r.restrictionIds.includes(x.id))}));
 const historical=(await pool.query("SELECT payload FROM incident_situation_snapshot WHERE incident_id=$1 AND jsonb_path_exists(payload,'$.routes[*] ? (@.state == \"AFFECTED_BY_RESTRICTION\")') ORDER BY known_at DESC,capture_sequence DESC LIMIT 1",[incident.replace(/^incident:/,'')])).rows[0]?.payload;
 if(historical){const r=historical.routes.find(r=>r.state==='AFFECTED_BY_RESTRICTION');report.historicalRoadChain={lane:'REAL_STORED_SNAPSHOT_NOT_CURRENT_ROUTE_GUARANTEE',knownAt:historical.knownAt,snapshotId:historical.id,route:r,facility:historical.facilities.find(f=>f.id===r.facilityId),observations:historical.roadReports.filter(x=>r.restrictionIds.includes(x.id)),ask:await get(base+'/ask?'+new URLSearchParams({question:'Are any restrictions affecting that route?',entityId:r.facilityId,at:historical.knownAt}))};}
 const redondo=s.facilities.find(f=>/Bombeiros.*Redondo/.test(f.canonicalName??''));if(redondo)report.currentRedondoRoute=s.routes.find(r=>r.facilityId===redondo.id);
 report.brief=await get(base+'/briefing');report.hospitalAsk=await get(base+'/ask?question='+encodeURIComponent('Which hospital should I look at first?'));
 const f=report.liveAffectedRoutes[0]?.facility;if(f){report.roadAsk=await get(base+'/ask?'+new URLSearchParams({question:'Are any restrictions affecting that route?',entityId:f.id}));report.facilityRoute=await get(base+'/tool/getFacilityRoute?'+new URLSearchParams({entityId:f.id}));}
 report.actualSources=(await pool.query('SELECT payload FROM world_knowledge_source')).rows.map(r=>({provider:r.payload.provider,url:r.payload.url,status:r.payload.status,adapter:r.payload.adapter,lastFetch:r.payload.lastFetch}));
 report.roadSnapshots=(await pool.query('SELECT source_id,count(*)::int count,min(known_at) first,max(known_at) last FROM road_source_snapshot GROUP BY source_id')).rows;
 report.postgisAfterInferenceStoppedMs=[];for(let i=0;i<20;i++){const started=performance.now();await pool.query('SELECT ST_Distance(ST_SetSRID(ST_MakePoint(-7.9,38.6),4326)::geography,ST_SetSRID(ST_MakePoint(-7.91,38.61),4326)::geography)');report.postgisAfterInferenceStoppedMs.push(performance.now()-started);}
}finally{await pool.end();await writeFile(out+'/final-live-proof.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify({history:report.historyCoverage,affectedRoutes:report.liveAffectedRoutes.length,checks:report['quality-final']}));
