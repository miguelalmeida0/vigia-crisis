import { spawn } from 'node:child_process';
import { createHash,randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { runDbDoctor } from './db_doctor.mjs';
import { resolveLocalDatabaseUrl } from './local_database_secret.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),composeFile=path.join(root,'infra','docker-compose.shadow.yml'),dockerConfig=path.join(root,'.tmp','vigia-docker-client'),composeProject=`vigia-${createHash('sha256').update(root).digest('hex').slice(0,12)}`,operatorToken=randomBytes(32).toString('base64url');
const databaseUrl=await resolveLocalDatabaseUrl(),localPostgresPassword=(()=>{try{return new URL(databaseUrl).password||'external-database-not-managed';}catch{return'external-database-not-managed';}})(),outputFile=path.resolve(process.env.VIGIA_OPERATIONS_RESILIENCE_FILE||path.join(root,'data/validation/operations/postgis-loss-recovery-proof.json'));
const wait=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
function command(command,args,{timeoutMs=30000}={}){return new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:root,env:{...process.env,DOCKER_CONFIG:dockerConfig,VIGIA_LOCAL_POSTGRES_PASSWORD:localPostgresPassword,COMPOSE_PROJECT_NAME:composeProject},stdio:['ignore','pipe','pipe']});let stdout='',stderr='',settled=false;const finish=(callback,value)=>{if(settled)return;settled=true;clearTimeout(timer);callback(value);},timer=setTimeout(()=>{child.kill('SIGTERM');finish(reject,new Error('docker_command_timeout'));},timeoutMs);child.stdout.on('data',(value)=>stdout+=value);child.stderr.on('data',(value)=>stderr+=value);child.once('error',(error)=>finish(reject,error));child.once('close',(code)=>code===0?finish(resolve,{stdout,stderr}):finish(reject,new Error(`docker_command_failed:${code}:${stderr.slice(-300)}`)));});}
async function compose(args,options){try{return await command('docker-compose',args,options);}catch(error){if(error?.code!=='ENOENT')throw error;return command('docker',['compose',...args],options);}}
async function databaseSnapshot(){const pool=new pg.Pool({connectionString:databaseUrl,connectionTimeoutMillis:10_000,query_timeout:30_000,statement_timeout:30_000,max:1});try{return(await pool.query(`SELECT
  (SELECT count(*)::int FROM raw_source_product) raw_source_products,
  (SELECT count(*)::int FROM physical_observation) physical_observations,
  (SELECT count(*)::int FROM fire_event) fire_events,
  (SELECT count(*)::int FROM event_observation) event_observations,
  (SELECT count(*)::int FROM prospective_detection_capture) prospective_detection_captures,
  (SELECT count(*)::int FROM alert_policy_decision) policy_decisions,
  (SELECT count(*)::int FROM operational_alert) alerts,
  (SELECT count(*)::int FROM alert_recipient) recipients,
  (SELECT count(*)::int FROM alert_delivery_outbox) deliveries,
  (SELECT count(*)::int FROM alert_acknowledgement) acknowledgements,
  (SELECT count(*)::int FROM alert_escalation) escalations,
  (SELECT count(*)::int FROM alert_resolution) resolutions,
  (SELECT count(*)::int FROM monitored_territory) territories,
  (SELECT count(*)::int FROM monitored_zone) zones,
  (SELECT count(*)::int FROM monitored_asset_group) asset_groups,
  (SELECT count(*)::int FROM monitored_asset) assets,
  (SELECT count(*)::int FROM territory_alert_policy) territory_policies,
  (SELECT count(*)::int FROM operations_actor_roster) roster,
  (SELECT count(*)::int FROM operations_territory_assignment) territory_assignments,
  (SELECT count(*)::int FROM operations_audit_record) audit_records,
  (SELECT count(*)::int FROM operational_observation_opportunity) opportunities,
  (SELECT count(*)::int FROM evidence_opportunity_result) opportunity_results,
  (SELECT count(*)::int FROM evidence_closure_plan) evidence_closure_plans,
  (SELECT count(*)::int FROM evidence_source_watch) evidence_source_watches,
  (SELECT count(*)::int FROM incident_decision_ledger) incident_decisions,
  (SELECT count(*)::int FROM coverage_window) coverage_windows,
  (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'state',lifecycle_state,'owner',owner_actor_id,'acknowledgedAt',acknowledged_at,'resolution',resolution_code) ORDER BY id),'[]'::jsonb) FROM operational_alert) alert_state`)).rows[0];}finally{await pool.end();}}
function startServer(){const child=spawn(process.execPath,['apps/api/src/server.mjs'],{cwd:root,env:{...process.env,PORT:'0',OPEN_BROWSER:'0',NODE_ENV:'development',HOST:'127.0.0.1',VIGIA_RUNTIME_PROFILE:'local_shadow',VIGIA_LOCAL_OPERATOR_AUTOLOGIN:'1',VIGIA_OPERATOR_TOKEN:operatorToken,VIGIA_OPERATOR_INCIDENT_SCOPES:'*',VIGIA_DATABASE_URL:databaseUrl,VIGIA_DATABASE_CONNECTION_TIMEOUT_MS:'500',VIGIA_REFRESH_MS:'600000'},stdio:['ignore','pipe','pipe']});let output='',error='';child.stdout.on('data',(value)=>output+=value);child.stderr.on('data',(value)=>error+=value);return{child,getOutput:()=>output,getError:()=>error};}
async function serverUrl(runtime){for(let index=0;index<100;index+=1){const match=runtime.getOutput().match(/http:\/\/127\.0\.0\.1:(\d+)/);if(match)return`http://127.0.0.1:${match[1]}`;if(runtime.child.exitCode!==null)throw new Error(`isolated_runtime_exited:${runtime.getError().slice(-500)}`);await wait(50);}throw new Error('isolated_runtime_listener_timeout');}
async function request(url,endpoint,{timeoutMs=5000}={}){const started=performance.now();try{const response=await fetch(`${url}${endpoint}`,{headers:{authorization:`Bearer ${operatorToken}`},signal:AbortSignal.timeout(timeoutMs)}),text=await response.text();let body=null;try{body=JSON.parse(text);}catch{body={raw:text.slice(0,300)}}return{status:response.status,durationMs:Number((performance.now()-started).toFixed(1)),bytes:Buffer.byteLength(text),body};}catch(error){return{status:0,durationMs:Number((performance.now()-started).toFixed(1)),bytes:0,error:error?.name??String(error.message??error)};}}
async function poll(url,endpoint,predicate,{attempts=40,intervalMs=250}={}){const history=[];for(let index=0;index<attempts;index+=1){const value=await request(url,endpoint);history.push({status:value.status,durationMs:value.durationMs,overallStatus:value.body?.overallStatus??null,state:value.body?.state??null,dependency:value.body?.dependency??value.body?.database?.dependency??null,error:value.body?.error??value.error??null});if(predicate(value))return{value,history};await wait(intervalMs);}throw Object.assign(new Error(`poll_timeout:${endpoint}`),{history});}

await mkdir(dockerConfig,{recursive:true});const preflight=await runDbDoctor({databaseUrl});if(preflight.classification!=='READY')throw new Error(`resilience_preflight_${preflight.classification}`);
const runtime=startServer();let url=null,stoppedAt=null,restoredAt=null,readyBefore=null,degraded=null,unrelated=null,recovered=null,before=null,after=null;
try{
  url=await serverUrl(runtime);
  try{readyBefore=(await poll(url,'/api/v10/operations/status',(value)=>value.status===200&&value.body?.overallStatus==='READY',{attempts:240,intervalMs:250})).value;}catch(error){error.runtime={exitCode:runtime.child.exitCode,stderr:runtime.getError().replace(/postgres(?:ql)?:\/\/[^\s/@:]+(?::[^\s/@]*)?@/gi,'postgresql://[REDACTED]@').slice(-2_000)};throw error;}
  before=await databaseSnapshot();
  try{
    stoppedAt=new Date().toISOString();await compose(['-f',composeFile,'stop','postgis']);
    degraded=(await poll(url,'/api/v10/operations/status',(value)=>value.status===503&&(value.body?.dependency==='postgis'||value.body?.database?.state==='degraded'),{attempts:80,intervalMs:250})).value;
    unrelated=await Promise.all(['/api/v10/health','/api/v10/session','/api/v10/events'].map(async(endpoint)=>({endpoint,...await request(url,endpoint)})));
  }finally{
    await compose(['-f',composeFile,'up','-d','--no-recreate','postgis']).catch((error)=>{throw new Error(`postgis_restore_failed:${String(error.message??error)}`);});restoredAt=new Date().toISOString();
  }
  recovered=(await poll(url,'/api/v10/operations/status',(value)=>value.status===200&&value.body?.overallStatus==='READY',{attempts:160,intervalMs:250})).value;
  after=await databaseSnapshot();
  const preservedFields=['raw_source_products','physical_observations','fire_events','event_observations','prospective_detection_captures','policy_decisions','alerts','recipients','deliveries','acknowledgements','escalations','resolutions','territories','zones','asset_groups','assets','territory_policies','roster','territory_assignments','opportunities','opportunity_results','evidence_closure_plans','evidence_source_watches','incident_decisions','coverage_windows'],decreased=preservedFields.filter((field)=>after[field]<before[field]).map((field)=>({field,before:before[field],after:after[field]})),growth=preservedFields.filter((field)=>after[field]>before[field]).map((field)=>({field,before:before[field],after:after[field],added:after[field]-before[field]}));
  const preserved=decreased.length===0&&JSON.stringify(before.alert_state)===JSON.stringify(after.alert_state),unrelatedAlive=unrelated.every((item)=>item.status===200),noDuplicateAlerts=before.alerts===after.alerts,noLostAudit=after.audit_records>=before.audit_records;
  const proof={schemaVersion:'vigia.operations-postgis-loss-recovery-proof.v1',generatedAt:new Date().toISOString(),mode:'CONTROLLED_LOCAL_DEPENDENCY_FAILURE',productionEvidenceInjected:false,preflight:{classification:preflight.classification,container:preflight.container,migrationState:preflight.migrations?.state,latestMigration:preflight.migrations?.latestVersion},runtime:{listenerUrl:url,readyBefore:{status:readyBefore.status,durationMs:readyBefore.durationMs},degraded:{status:degraded.status,durationMs:degraded.durationMs,dependency:degraded.body?.dependency??degraded.body?.database?.dependency,retryable:degraded.body?.retryable??degraded.body?.database?.retryable},unrelated:unrelated.map((item)=>({endpoint:item.endpoint,status:item.status,durationMs:item.durationMs,bytes:item.bytes})),recovered:{status:recovered.status,durationMs:recovered.durationMs,lastReconnectMs:recovered.body?.database?.lastReconnectMs??null}},timeline:{stoppedAt,restoredAt},persistence:{before,after,preserved,preservedFields,decreased,growth,noDuplicateAlerts,noLostAcknowledgement:before.acknowledgements===after.acknowledgements,noLostOwnership:JSON.stringify(before.alert_state)===JSON.stringify(after.alert_state),noLostAudit,auditRecordsAddedDuringRecovery:after.audit_records-before.audit_records},gates:{structured503:degraded.status===503,unrelatedAlive,automaticReconnect:recovered.status===200,preserved,noDuplicateAlerts,noLostAudit}};
  await mkdir(path.dirname(outputFile),{recursive:true});await writeFile(outputFile,`${JSON.stringify(proof,null,2)}\n`,'utf8');
  if(!Object.values(proof.gates).every(Boolean))throw Object.assign(new Error('operations_resilience_gate_failed'),{proof});
  console.log(JSON.stringify({outputFile:path.relative(root,outputFile),gates:proof.gates,runtime:proof.runtime,persistence:proof.persistence},null,2));
}finally{
  if(runtime.child.exitCode===null){runtime.child.kill('SIGTERM');await Promise.race([new Promise((resolve)=>runtime.child.once('close',resolve)),wait(3000)]);if(runtime.child.exitCode===null)runtime.child.kill('SIGKILL');}
}
