import {readFile,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {resolveLocalDatabaseUrl} from './local_database_secret.mjs';
const root='docs/handoffs/mega-vi',token=(await readFile('.tmp/release/operator-token','utf8')).trim();
const report={capturedAt:new Date().toISOString(),lane:'REAL_CURRENT_AND_RETAINED_DATA',incidents:[],scenarios:[]};
async function get(path){const start=performance.now(),r=await fetch('http://127.0.0.1:4177'+path,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(90000)});return{status:r.status,latencyMs:Math.round(performance.now()-start),data:await r.json()};}
for(const id of ['incident:PT-2026-01F7E2E21A','incident:PT-2026-03CFDC147C','incident:PT-2026-08D08E2A0D']){
 const base='/api/v10/operator/incidents/'+encodeURIComponent(id)+'/situation';
 const current=await get(base),s=current.data.snapshot;if(!s){report.incidents.push({id,status:current.status,state:current.data.state});continue;}
 const support=await get(base+'/support'),row={id,incident:s.incident,snapshotId:s.id,knownAt:s.knownAt,supportStatus:support.status,support:support.data};report.incidents.push(row);
 await writeFile(root+'/situation-'+id.split(':')[1]+'.json',JSON.stringify(s));
 row.times=(await get(base+'/times')).data.times;
 const first=row.times.at(-1)?.knownAt,last=row.times[0]?.knownAt;
 if(first&&last){row.comparison=await get(base+'/compare?'+new URLSearchParams({from:first,to:last}));row.evolution=await get(base+'/tool/getHistoricalEvolution?'+new URLSearchParams({from:first}));}
 row.analogs=await get(base+'/tool/getHistoricalAnalogs');row.causal=await get(base+'/tool/getCausalTimeline');
 row.ask=[];for(const question of ['Show operational support','Which settlements have the longest route to verified emergency healthcare?','Which communities have only one retained fire-response option?','Which settlements have designated reception facilities nearby?','Which roads support the most important facility routes?'])row.ask.push({question,response:await get(base+'/ask?'+new URLSearchParams({question}))});
 const road=support.data.corridors?.find(c=>c.routeCount>1)?.road,facility=support.data.groups?.find(g=>g.id==='emergency_hospital')?.primary?.facilityId;
 if(road){row.roadQuery=await get(base+'/ask?'+new URLSearchParams({question:'What depends on '+road+'?'}));
  for(const failures of [[{kind:'ROAD_UNAVAILABLE',entityId:road}],...(facility?[[{kind:'ROAD_UNAVAILABLE',entityId:road},{kind:'FACILITY_UNAVAILABLE',entityId:facility}]]:[])]){
   const result=await get(base+'/scenario?'+new URLSearchParams({failures:JSON.stringify(failures)}));report.scenarios.push({incidentId:id,failures,status:result.status,universe:result.data.snapshot?.universe,operationalWrites:result.data.operationalWrites,support:result.data.support?.comparison,resilience:result.data.resilience?.categories});
  }
 }
 console.log(JSON.stringify({incident:id,knownAt:s.knownAt,qualifiedRoutes:support.data.groups?.map(g=>[g.id,g.options.length]),communities:support.data.communities?.length,sharedRoad:road??null}));
 await writeFile(root+'/real-examples.json',JSON.stringify(report,null,2));
}
report.quality=await get('/api/v10/operator/situation-quality');report.readiness=await get('/ready');const events=await get('/api/v10/events'),registry=await get('/api/v10/sensors/registry');report.physicalSources={status:events.status,sources:events.data.sources,registry:registry.data};
const pool=new Pool({connectionString:await resolveLocalDatabaseUrl()});
try{report.retained= (await pool.query('SELECT incident_id,count(*)::int captures,min(known_at) first,max(known_at) last FROM incident_situation_snapshot GROUP BY incident_id ORDER BY incident_id')).rows;
 const before=(await pool.query("SELECT id,content_hash FROM incident_situation_snapshot ORDER BY known_at DESC LIMIT 30")).rows;
 await writeFile(root+'/restart-before.json',JSON.stringify({capturedAt:new Date().toISOString(),snapshots:before},null,2));
 report.scenarioPersistence=(await pool.query("SELECT count(*)::int count FROM incident_situation_snapshot WHERE universe='SCENARIO'")).rows[0];
}finally{await pool.end();}
await writeFile(root+'/real-examples.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({ready:report.readiness.status,scenarioRows:report.scenarioPersistence.count,historyIncidents:report.retained.length}));
