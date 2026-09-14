import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { runPostgresMigrations } from '../apps/api/src/modules/storage/postgres-migration-runner.mjs';
import { runDbDoctor } from './db_doctor.mjs';
import { buildLocalDatabaseUrl, ensureLocalPostgresPassword } from './local_database_secret.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),composeFile=path.join(root,'infra','docker-compose.shadow.yml'),dockerConfig=path.join(root,'.tmp','vigia-docker-client'),proofFile=path.join(root,'data','validation','operations','postgis-recovery-preservation.json'),composeProject=`vigia-${createHash('sha256').update(root).digest('hex').slice(0,12)}`;
const localPostgresPassword=await ensureLocalPostgresPassword(),databaseUrl=process.env.VIGIA_DATABASE_URL||buildLocalDatabaseUrl(localPostgresPassword),composeEnvironment={VIGIA_LOCAL_POSTGRES_PASSWORD:localPostgresPassword,COMPOSE_PROJECT_NAME:composeProject},managedLocalDatabase=(()=>{try{const target=new URL(databaseUrl);return target.username==='vigia'&&target.password===localPostgresPassword&&['127.0.0.1','localhost','[::1]'].includes(target.hostname)&&Number(target.port||5432)===55432;}catch{return false;}})();
const PRESERVATION_TABLES=['vigia_schema_migration','raw_source_product','physical_observation','fire_event','event_observation','prospective_detection_capture','provenance_lineage','source_checkpoint','operator_action','manual_event_correction','detector_run','prevention_finding','prevention_finding_review','evidence_need','evidence_request','field_resource','observation_opportunity','operational_alert','alert_policy_decision','alert_recipient','alert_delivery_outbox','alert_acknowledgement','alert_escalation','alert_resolution','operational_observation_opportunity','evidence_opportunity_result','monitored_territory','monitored_zone','monitored_asset_group','monitored_asset','territory_alert_policy','operations_audit_record','operations_metric_event','operations_actor_roster','operations_territory_assignment','evidence_closure_plan','evidence_source_watch','incident_decision_ledger','coverage_region','coverage_cell','coverage_window','coverage_gap'];
function run(command,args,{timeoutMs=30000,env={},input=null}={}){return new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:root,env:{...process.env,...env,DOCKER_CONFIG:dockerConfig},stdio:[input===null?'ignore':'pipe','pipe','pipe']});let stdout='',stderr='',settled=false;const fail=(error)=>{if(settled)return;settled=true;clearTimeout(timer);reject(error);},timer=setTimeout(()=>{child.kill('SIGTERM');fail(new Error('db_up_command_timeout'));},timeoutMs);child.stdout.on('data',(value)=>stdout+=value);child.stderr.on('data',(value)=>stderr+=value);child.once('error',fail);child.once('close',(code)=>{if(settled)return;settled=true;clearTimeout(timer);if(code===0)resolve({stdout,stderr});else reject(Object.assign(new Error('db_up_command_failed'),{details:{command,args:args.filter((item)=>!String(item).includes('postgresql://')),code,stderr:stderr.slice(-1000)}}));});if(input!==null)child.stdin.end(input);});}
async function runCompose(args,options){try{return await run('docker-compose',args,options);}catch(error){if(error?.code!=='ENOENT')throw error;return run('docker',['compose',...args],options);}}
async function preservationSnapshot(pool){const counts={};for(const table of PRESERVATION_TABLES){const exists=(await pool.query('SELECT to_regclass($1) relation',[`public.${table}`])).rows[0]?.relation;if(exists)counts[table]=Number((await pool.query(`SELECT count(*)::bigint count FROM ${table}`)).rows[0]?.count??0);}return counts;}

await mkdir(dockerConfig,{recursive:true});
const preflight=await runDbDoctor({databaseUrl});
if(preflight.classification==='READY'){console.log('VIGIA DB UP: READY · existing PostGIS instance preserved');process.exit(0);}
if(preflight.classification==='PORT_CONFLICT'||preflight.classification==='SCHEMA_ERROR')throw Object.assign(new Error(`db_up_refused:${preflight.classification}`),{details:preflight});
let ready=Boolean(preflight.postgres.ready&&preflight.postgres.postgis),lastError=null;
if(!ready){
  if(!preflight.docker.reachable)throw new Error('db_up_requires_reachable_docker_or_postgres');
  await runCompose(['-f',composeFile,'up','-d','--no-recreate','postgis'],{timeoutMs:30000,env:composeEnvironment});
  let passwordRotated=false;
  for(let attempt=0;attempt<30;attempt+=1){const pool=new pg.Pool({connectionString:databaseUrl,connectionTimeoutMillis:800,query_timeout:1200,max:1});try{await pool.query('SELECT 1');ready=true;await pool.end();break;}catch(error){lastError=error?.code??String(error.message??error);await pool.end().catch(()=>undefined);if(error?.code==='28P01'&&managedLocalDatabase&&!passwordRotated){await runCompose(['-f',composeFile,'exec','-T','postgis','psql','-U','vigia','-d','postgres','-v','ON_ERROR_STOP=1','-f','-'],{timeoutMs:10_000,env:composeEnvironment,input:`ALTER ROLE vigia PASSWORD '${localPostgresPassword}';\n`});passwordRotated=true;continue;}await new Promise((resolve)=>setTimeout(resolve,1000));}}
}
if(!ready)throw new Error(`db_up_postgres_not_ready:${lastError}`);
const pool=new pg.Pool({connectionString:databaseUrl,connectionTimeoutMillis:2000,query_timeout:30000,statement_timeout:30000,max:2});
let migration=null,preservation=null;
try{
  const before=await preservationSnapshot(pool);migration=await runPostgresMigrations(pool);const after=await preservationSnapshot(pool),decreased=Object.entries(before).filter(([table,count])=>after[table]<count).map(([table,count])=>({table,before:count,after:after[table]}));
  preservation={schemaVersion:'vigia.postgis-recovery-preservation.v1',capturedAt:new Date().toISOString(),databaseTarget:{host:preflight.target.host,port:preflight.target.port,database:preflight.target.database},migration:{state:migration.state,latestVersion:migration.latestVersion,applied:migration.applied,skipped:migration.skipped},before,after,decreased,passed:decreased.length===0};
  await mkdir(path.dirname(proofFile),{recursive:true});await writeFile(proofFile,`${JSON.stringify(preservation,null,2)}\n`,'utf8');if(!preservation.passed)throw Object.assign(new Error('db_up_preservation_gate_failed'),{details:{decreased}});
  console.log(`VIGIA MIGRATIONS: ${migration.state} · latest ${migration.latestVersion} · applied ${migration.applied.join(',')||'none'} · preservation PASS`);
}finally{await pool.end();}
const final=await runDbDoctor({databaseUrl});console.log(`VIGIA DB UP: ${final.classification}`);if(final.classification!=='READY')throw new Error(`db_up_incomplete:${final.classification}`);
