import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, statfs } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { inspectMigrationState } from '../apps/api/src/modules/storage/postgres-migration-runner.mjs';
import { resolveLocalDatabaseUrl } from './local_database_secret.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const composeFile=path.join(root,'infra','docker-compose.shadow.yml');
const composeProject=`vigia-${createHash('sha256').update(root).digest('hex').slice(0,12)}`;
const PHYSICAL_TABLES=['raw_source_product','physical_observation','fire_event','event_observation','prospective_detection_capture'];
const OPERATIONS_TABLES=['operational_alert','alert_delivery_outbox','alert_acknowledgement','alert_escalation','alert_resolution','operational_observation_opportunity','evidence_opportunity_result','monitored_territory','monitored_asset','operations_audit_record','operations_actor_roster','evidence_closure_plan','evidence_source_watch','incident_decision_ledger','coverage_region','coverage_cell','coverage_window','coverage_gap','fire_truth_state','next_best_evidence_decision','evidence_race','operational_latency_stage','intelligence_snapshot','operator_intelligence_decision'];

function command(command,args,{timeoutMs=4000,env={}}={}){return new Promise((resolve)=>{const child=spawn(command,args,{cwd:root,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});let stdout='',stderr='',timedOut=false,settled=false;const finish=(value)=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value);};const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');setTimeout(()=>child.kill('SIGKILL'),250).unref?.();},timeoutMs);child.stdout.on('data',(chunk)=>stdout+=chunk);child.stderr.on('data',(chunk)=>stderr+=chunk);child.once('error',(error)=>finish({ok:false,code:null,stdout,stderr,error:String(error.message??error),timedOut}));child.once('close',(code)=>finish({ok:code===0&&!timedOut,code,stdout,stderr,error:null,timedOut}));});}
async function composeCommand(args,options){const direct=await command('docker-compose',args,options);if(direct.error&&/ENOENT/.test(direct.error))return command('docker',['compose',...args],options);return direct;}
function tcpReachable(host,port,timeoutMs=800){return new Promise((resolve)=>{const socket=net.createConnection({host,port});let done=false;const finish=(value)=>{if(done)return;done=true;socket.destroy();resolve(value);};socket.setTimeout(timeoutMs);socket.once('connect',()=>finish(true));socket.once('timeout',()=>finish(false));socket.once('error',()=>finish(false));});}
function parseComposeRows(value){const text=String(value??'').trim();if(!text)return[];try{const parsed=JSON.parse(text);return Array.isArray(parsed)?parsed:[parsed];}catch{return text.split('\n').map((line)=>{try{return JSON.parse(line);}catch{return null;}}).filter(Boolean);}}
function safeDatabaseTarget(value){try{const url=new URL(value);return{host:url.hostname,port:Number(url.port||5432),database:url.pathname.slice(1)||null,ssl:url.searchParams.get('sslmode')??'default'};}catch{return{host:null,port:null,database:null,ssl:'default'};}}
function errorCode(error){return String(error?.code??error?.message??error??'').slice(0,120);}
function classify({database,tcp,docker,container,migrations,schema}){
  if(database.ready&&migrations?.state==='current'&&schema?.missing?.length===0)return'READY';
  if(database.ready&&migrations?.state==='checksum_mismatch')return'SCHEMA_ERROR';
  if(database.ready&&(migrations?.state==='migration_required'||schema?.missing?.length))return'MIGRATION_REQUIRED';
  if(!database.ready&&!docker.reachable)return'DOCKER_UNAVAILABLE';
  if(!database.ready&&container.state&&/exited|stopped|dead/i.test(container.state))return'CONTAINER_STOPPED';
  if(!database.ready&&tcp&&!['ECONNREFUSED','ETIMEDOUT','57P03','28P01','3D000'].includes(database.errorCode))return'PORT_CONFLICT';
  return'POSTGRES_NOT_READY';
}

export async function runDbDoctor({databaseUrl=null,runtimeInspection=true}={}){
  databaseUrl=databaseUrl??await resolveLocalDatabaseUrl();
  const target=safeDatabaseTarget(databaseUrl),dockerConfig=path.join(root,'.tmp','vigia-docker-client'),composePassword=(()=>{try{return new URL(databaseUrl).password||'external-database-not-managed';}catch{return'external-database-not-managed';}})();if(runtimeInspection)await mkdir(dockerConfig,{recursive:true});
  const dockerResult=runtimeInspection?await command('docker',['info','--format','{{json .ServerVersion}}'],{timeoutMs:3000,env:{DOCKER_CONFIG:dockerConfig}}):{ok:false,stdout:'',stderr:'runtime inspection disabled',error:null,timedOut:false};
  const composeResult=dockerResult.ok?await composeCommand(['-f',composeFile,'ps','-a','--format','json','postgis'],{timeoutMs:3500,env:{DOCKER_CONFIG:dockerConfig,VIGIA_LOCAL_POSTGRES_PASSWORD:composePassword,COMPOSE_PROJECT_NAME:composeProject}}):{ok:false,stdout:'',stderr:'docker unavailable'};
  const rows=parseComposeRows(composeResult.stdout),row=rows[0]??null,container={discovered:Boolean(row),name:row?.Name??row?.Names??null,state:row?.State??row?.Status??null,health:row?.Health??null};
  const tcp=target.host&&target.port?await tcpReachable(target.host,target.port):false;
  const pool=new pg.Pool({connectionString:databaseUrl,application_name:'vigia-db-doctor',connectionTimeoutMillis:1800,query_timeout:3500,statement_timeout:3500,max:1});
  let database={ready:false,exists:false,errorCode:null,postgis:false,postgisVersion:null,sizeBytes:null},migrations=null,schema={physicalTruth:{present:[],missing:[...PHYSICAL_TABLES]},operations:{present:[],missing:[...OPERATIONS_TABLES]},missing:[...PHYSICAL_TABLES,...OPERATIONS_TABLES]};
  try{
    const connection=await pool.query(`SELECT current_database() database,pg_database_size(current_database())::bigint size_bytes,
      EXISTS(SELECT 1 FROM pg_extension WHERE extname='postgis') postgis`);
    database={ready:true,exists:true,errorCode:null,postgis:connection.rows[0].postgis,postgisVersion:null,sizeBytes:Number(connection.rows[0].size_bytes)};
    if(database.postgis)database.postgisVersion=(await pool.query('SELECT PostGIS_Version() version')).rows[0]?.version??null;
    const names=[...PHYSICAL_TABLES,...OPERATIONS_TABLES],tables=await pool.query(`SELECT name,to_regclass('public.'||name) relation FROM unnest($1::text[]) name`,[names]),present=new Set(tables.rows.filter((item)=>item.relation).map((item)=>item.name));
    schema={physicalTruth:{present:PHYSICAL_TABLES.filter((name)=>present.has(name)),missing:PHYSICAL_TABLES.filter((name)=>!present.has(name))},operations:{present:OPERATIONS_TABLES.filter((name)=>present.has(name)),missing:OPERATIONS_TABLES.filter((name)=>!present.has(name))}};schema.missing=[...schema.physicalTruth.missing,...schema.operations.missing];
    migrations=await inspectMigrationState(pool);
  }catch(error){database={...database,errorCode:errorCode(error),exists:error?.code!=='3D000'};}finally{await pool.end().catch(()=>undefined);}
  const fs=await statfs(root),storage={availableBytes:fs.bavail*fs.bsize,totalBytes:fs.blocks*fs.bsize,availabilityPercent:Number(((fs.bavail/Math.max(1,fs.blocks))*100).toFixed(1)),sufficientForRecovery:fs.bavail*fs.bsize>=5*1024**3};
  const docker={reachable:dockerResult.ok,errorCode:dockerResult.ok?null:dockerResult.timedOut?'DOCKER_TIMEOUT':errorCode(dockerResult.stderr||dockerResult.error)};
  const classification=classify({database,tcp,docker,container,migrations,schema});
  return{schemaVersion:'vigia.db-doctor.v1',checkedAt:new Date().toISOString(),classification,target,docker,container,tcpReachable:tcp,postgres:database,migrations,schema,storage,action:classification==='READY'?'No action required.':classification==='DOCKER_UNAVAILABLE'?'Start or recover Docker Desktop, then run npm run db:up.':classification==='CONTAINER_STOPPED'?'Run npm run db:up to start the existing PostGIS container without recreating its volume.':classification==='MIGRATION_REQUIRED'?'Run npm run db:up to apply locked, checksum-governed migrations.':classification==='SCHEMA_ERROR'?'Inspect migration checksum drift before changing the schema.':'Run npm run db:up and inspect the reported container/Postgres state.'};
}

function render(report){const lines=[`VIGIA DB DOCTOR: ${report.classification}`,`Docker reachable: ${report.docker.reachable?'yes':'no'}`,`Container: ${report.container.discovered?`${report.container.name} · ${report.container.state}${report.container.health?` · ${report.container.health}`:''}`:'not discovered'}`,`Target: ${report.target.host}:${report.target.port}/${report.target.database}`,`Postgres ready: ${report.postgres.ready?'yes':'no'}`,`PostGIS: ${report.postgres.postgis?`yes · ${report.postgres.postgisVersion}`:'no'}`,`Migration state: ${report.migrations?.state??'unavailable'} · latest ${report.migrations?.latestVersion??'none'} / expected ${report.migrations?.expectedLatestVersion??'unknown'}`,`Physical-truth schema: ${report.schema.physicalTruth.missing.length?'missing '+report.schema.physicalTruth.missing.join(', '):'ready'}`,`Operations schema: ${report.schema.operations.missing.length?'missing '+report.schema.operations.missing.join(', '):'ready'}`,`Storage available: ${(report.storage.availableBytes/1024**3).toFixed(1)} GiB`,report.action];return lines.join('\n');}

if(path.resolve(process.argv[1]??'')===fileURLToPath(import.meta.url)){
  const report=await runDbDoctor();console.log(process.argv.includes('--json')?JSON.stringify(report,null,2):render(report));process.exitCode=report.classification==='READY'?0:1;
}

export{classify,safeDatabaseTarget};
