import {readFile,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {resolveLocalDatabaseUrl} from './local_database_secret.mjs';
const out='docs/handoffs/mega-v',token=(await readFile('.tmp/release/operator-token','utf8')).trim();
async function get(path){const start=performance.now(),r=await fetch('http://127.0.0.1:4177'+path,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(60000)}),text=await r.text();return{status:r.status,latencyMs:performance.now()-start,bytes:Buffer.byteLength(text),data:JSON.parse(text)};}
const report={capturedAt:new Date().toISOString(),lane:'REAL_RETAINED_OPERATIONAL_DATA',incidents:[]};
for(const id of ['incident:PT-2026-01F7E2E21A','incident:PT-2026-03CFDC147C','incident:PT-2026-08D08E2A0D']){
 const base='/api/v10/operator/incidents/'+encodeURIComponent(id),ops=await get(base+'/operations'),location=await get(base+'/location'),view=await get(base+'/situation'),s=view.data.snapshot;
 const row={id,operations:{status:ops.status,latencyMs:ops.latencyMs},location:{status:location.status,bytes:location.bytes,latencyMs:location.latencyMs},situationStatus:view.status};report.incidents.push(row);if(!s)continue;
 Object.assign(row,{snapshotId:s.id,knownAt:s.knownAt,incident:s.incident,facilityCount:s.facilities.length,routeCount:s.routes.length,rankings:s.rankings});
 await writeFile(out+'/situation-'+id.split(':')[1]+'.json',JSON.stringify(s,null,2));
 const root=base+'/situation',tool=async(name,args={})=>get(root+'/tool/'+name+'?'+new URLSearchParams(args));
 const hospital=s.facilities.filter(f=>f.canonicalType==='hospital').sort((a,b)=>a.distanceKm-b.distanceKm)[0];
 row.hospital= hospital?{facility:hospital,route:await tool('getFacilityRoute',{entityId:hospital.id}),why:await tool('getFacilityDetails',{entityId:hospital.id})}:null;
 row.access=await tool('getAccessDependencies');row.brief=await get(root+'/briefing');row.ask=await get(root+'/ask?question='+encodeURIComponent('Which hospital should I look at first?'));row.fireAsk=await get(root+'/ask?question='+encodeURIComponent('Which verified fire station is nearest?'));row.refuges=await tool('getOfficialRefuges');row.analogs=await tool('getHistoricalAnalogs');
 const times=await get(root+'/times');row.times=times.data.times;const early=row.times?.at(-1)?.knownAt??row.times?.at(-1),late=row.times?.[0]?.knownAt??row.times?.[0];
 if(typeof early==='string'&&typeof late==='string'){row.history=await get(root+'?at='+encodeURIComponent(early));row.comparison=await get(root+'/compare?'+new URLSearchParams({from:early,to:late}));}
 const road=s.routes.flatMap(r=>r.roads??[]).find(r=>r.ref)?.ref;if(road)row.scenario=await get(root+'/scenario?'+new URLSearchParams({kind:'ROAD_UNAVAILABLE',entityId:road}));
 console.log(JSON.stringify({id,facilities:s.facilities.length,routes:s.routes.length,hospital:hospital?.canonicalName,locationBytes:location.bytes}));
}
report.quality=await get('/api/v10/operator/situation-quality');
const pool=new Pool({connectionString:await resolveLocalDatabaseUrl()});
try{
 report.historyCoverage=(await pool.query("SELECT incident_id,count(*)::int snapshots,min(known_at) first,max(known_at) last FROM incident_situation_snapshot WHERE universe='OPERATIONAL' GROUP BY incident_id")).rows;
 report.jobs=(await pool.query('SELECT state,count(*)::int count FROM world_knowledge_job GROUP BY state')).rows;
 report.postgis={latenciesMs:[]};for(let i=0;i<20;i++){const start=performance.now();await pool.query('SELECT ST_Distance(ST_SetSRID(ST_MakePoint(-7.9,38.6),4326)::geography,ST_SetSRID(ST_MakePoint(-7.91,38.61),4326)::geography)');report.postgis.latenciesMs.push(performance.now()-start);}
 report.postgis.note='Local round-trip sample of actual PostGIS geography calculation; not per-browser SQL attribution.';
 report.snapshotPlan=(await pool.query("EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT payload FROM incident_situation_snapshot WHERE incident_id=$1 AND known_at<=now() ORDER BY known_at DESC,capture_sequence DESC LIMIT 1",[report.incidents[0].id])).rows;
 report.retainedAfterRestart=(await pool.query('SELECT count(*)::int count FROM incident_situation_snapshot WHERE id=ANY($1::text[])',[report.incidents.map(r=>r.snapshotId).filter(Boolean)])).rows[0];
}finally{await pool.end();}
await writeFile(out+'/live-proof.json',JSON.stringify(report,null,2));
