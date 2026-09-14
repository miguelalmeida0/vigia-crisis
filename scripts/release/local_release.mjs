import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../apps/api/src/config/env.mjs';
import { runDbDoctor } from '../db_doctor.mjs';
import { buildReleaseManifest } from './build_release_manifest.mjs';
import { canonicalListenerDecision,releaseControlSocketPath,releaseFieldNodeId,releaseIdentityFailures,resolveReleasePorts } from './listener_ownership.mjs';
import { readBoundedResponse } from './bounded-response.mjs';
import { atomicWriteNoFollow,verifyDirectoryChain } from './safe_artifact.mjs';
import { resolveLocalDatabaseUrl } from '../local_database_secret.mjs';

if(process.env.VIGIA_TRUSTED_NODE_LAUNCH!=='1')throw new Error('trusted_local_release_launcher_required');
const exec=promisify(execFile),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),runtimeDir=path.join(root,'.tmp/release'),databaseUrl=await resolveLocalDatabaseUrl();
const {central:centralPort,fieldNode:fieldPort}=resolveReleasePorts(process.env);
const central=`http://127.0.0.1:${centralPort}`,field=`http://127.0.0.1:${fieldPort}`;
const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
async function command(program,args,{env={},timeout=120_000,quiet=false}={}){const result=await exec(program,args,{cwd:root,env:{...process.env,...env},encoding:'utf8',timeout,maxBuffer:64*1024*1024});if(!quiet&&result.stdout.trim())process.stdout.write(result.stdout);if(!quiet&&result.stderr.trim())process.stderr.write(result.stderr);return result;}
async function response(url,timeout=4_000){try{const result=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(timeout)}),{body}=await readBoundedResponse(result,{maxBytes:128*1024});return{ok:result.ok,status:result.status,body};}catch(error){return{ok:false,status:0,error:String(error.code??error.message??error)}};}
async function pids(port){try{const {stdout}=await command('lsof',[`-tiTCP:${port}`,'-sTCP:LISTEN'],{quiet:true,timeout:5_000});return stdout.split(/\s+/).filter(Boolean).map(Number).filter(Number.isInteger);}catch{return[];}}
async function processCwd(pid){try{const {stdout}=await command('lsof',['-a','-p',String(pid),'-d','cwd','-Fn'],{quiet:true,timeout:5_000});return stdout.split('\n').find((line)=>line.startsWith('n'))?.slice(1)??null;}catch{return null;}}
async function waitPortFree(port,timeout=8_000){const end=Date.now()+timeout;while(Date.now()<end){if(!(await pids(port)).length)return;await sleep(100);}throw new Error(`port_${port}_did_not_stop`);}
async function stopOwnedCanonicalProcess(port){
  const existing=await pids(port);if(!existing.length)return;
  for(const pid of existing){const cwd=await processCwd(pid);if(path.resolve(cwd??'/')!==root)throw new Error(`refusing_to_stop_non_project_process:${port}:${pid}`);await command('/bin/kill',['-TERM',String(pid)],{quiet:true,timeout:5_000});}
  try{await waitPortFree(port,6_000);}catch{for(const pid of existing){try{await command('/bin/kill',['-KILL',String(pid)],{quiet:true,timeout:5_000});}catch{}}await waitPortFree(port,3_000);}
}
async function listenerState(port,url){const listeners=await pids(port),processes=[];for(const pid of listeners)processes.push({pid,cwd:await processCwd(pid)});const release=await response(url);return{port,pids:listeners,processes,identity:release.ok?release.body:null};}
async function startProcess(name,args,env,options){const child=spawnDetached(args,env,options);await atomicWriteNoFollow(path.join(runtimeDir,`${name}.pid`),`${child.pid}\n`,{root});return child.pid;}
function spawnDetached(args,env,{inheritEnvironment=true}={}){const {spawn}=globalThis.__vigiaChildProcess,base=inheritEnvironment?process.env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',LANG:'C.UTF-8',TZ:'UTC'};const child=spawn(process.execPath,args,{cwd:root,env:{...base,...env},detached:true,stdio:['ignore','inherit','inherit']});child.unref();return child;}
async function waitRelease(url,manifest,{services=false,timeout=90_000}={}){const end=Date.now()+timeout;let last=null;while(Date.now()<end){last=await response(url,5_000);const failures=last.ok?releaseIdentityFailures(last.body,manifest):['release_unavailable'];if(last.ok&&!failures.length&&(!services||last.body?.process?.servicesReady===true))return last.body;const startup=last.body?.process?.startup;if(services&&last.ok&&startup?.state==='failed')throw new Error(`central_api_startup_failed:${startup.error??'unknown_startup_failure'}`);await sleep(250);}throw new Error(`release_not_converged:${url}:${last?.status??0}:${releaseIdentityFailures(last?.body,manifest).join(',')||last?.error||'unknown'}`);}
await verifyDirectoryChain(root,runtimeDir);
const requestedLocalRuntimeRoot=String(process.env.VIGIA_LOCAL_RUNTIME_ROOT??'').trim(),temporaryRoot=path.join(root,'.tmp');
let localStateFile=null;
if(requestedLocalRuntimeRoot){
  const resolved=path.resolve(requestedLocalRuntimeRoot);
  if(resolved===temporaryRoot||!resolved.startsWith(`${temporaryRoot}${path.sep}`))throw new Error('local_runtime_root_outside_bounded_temporary_tree');
  await verifyDirectoryChain(root,temporaryRoot,{create:false});await verifyDirectoryChain(temporaryRoot,resolved,{create:false});
  localStateFile=path.join(resolved,'production-v1.json');const metadata=await lstat(localStateFile).catch(()=>null);
  if(!metadata?.isFile()||metadata.isSymbolicLink())throw new Error('local_runtime_state_file_invalid');
}
const releaseEnv={VIGIA_DATABASE_URL:databaseUrl,PORT:String(centralPort),HOST:'127.0.0.1',OPEN_BROWSER:'0',REQUEST_TIMEOUT_MS:'12000',VIGIA_RUNTIME_PROFILE:'local_shadow',VIGIA_LOCAL_OPERATOR_AUTOLOGIN:'1',NODE_ENV:'development',...(localStateFile?{VIGIA_STATE_FILE:localStateFile}:{})};
const config=loadConfig({...process.env,...releaseEnv,VIGIA_SECRETS_FILE:process.env.VIGIA_SECRETS_FILE??path.join(process.env.HOME??'', '.config/vigia/secrets.env')});
const protectedFields=new Set(config.localSecretState.fields),secretState={firms:Boolean(config.firmsMapKey),cdse:Boolean(config.cdseAccessToken||(config.cdseUsername&&config.cdsePassword)),earthdata:Boolean(config.earthdataToken),source:config.localSecretState.state};
if(!secretState.firms||!secretState.cdse||!secretState.earthdata)throw new Error(`protected_configuration_incomplete:FIRMS=${secretState.firms}:CDSE=${secretState.cdse}:EARTHDATA=${secretState.earthdata}`);
process.stdout.write(`PROTECTED CONFIGURATION: PRESENT · ${protectedFields.size} named fields · values redacted\n`);
let db=await runDbDoctor({databaseUrl});if(db.classification!=='READY'){process.stdout.write(`POSTGIS: ${db.classification} · invoking preservation-safe recovery\n`);await command(process.execPath,['scripts/db_up.mjs'],{env:{VIGIA_DATABASE_URL:databaseUrl},timeout:180_000});db=await runDbDoctor({databaseUrl});}
if(db.classification!=='READY')throw new Error(`postgis_not_ready:${db.classification}`);process.stdout.write(`POSTGIS: READY · migration ${db.migrations.latestVersion}\n`);
const manifest=await buildReleaseManifest();process.stdout.write(`RELEASE ID: ${manifest.releaseId}\nCODE STATE: ${manifest.codeStateHash}\n`);
const commandSurvivalProof=JSON.parse(await readFile(path.join(root,'data/validation/command-survival/controlled-exercise-proof.json'),'utf8'));
if(commandSurvivalProof.verdict!=='PASS'||!commandSurvivalProof.incidentId)throw new Error('governed_command_survival_proof_unavailable');
const releaseRunId=String(process.pid),releaseFieldDatabase=path.join(runtimeDir,`fieldnet-${manifest.releaseId}-${releaseRunId}.sqlite`),fieldControlSocket=releaseControlSocketPath(runtimeDir,releaseRunId),fieldNodeId=releaseFieldNodeId(manifest.releaseId,releaseRunId);
process.stdout.write(`FIELDNODE GOVERNED INCIDENT: ${commandSurvivalProof.incidentId}\n`);
globalThis.__vigiaChildProcess=await import('node:child_process');
const sharedToken=randomBytes(32).toString('base64url'),fieldControlKey=randomBytes(32).toString('base64url'),fieldCapacityTaskKey=randomBytes(32).toString('base64url'),fieldNodeKey=randomBytes(32).toString('base64url'),operatorTokenFile=path.join(runtimeDir,'operator-token'),fieldRegistry=JSON.stringify({[fieldNodeId]:{key:fieldNodeKey,incidentIds:[commandSurvivalProof.incidentId],capabilities:['fieldnet:sync','fieldnet:command-survival','fieldnet:capacity-task'],status:'active'}}),shared={...releaseEnv,VIGIA_RELEASE_ID:manifest.releaseId,VIGIA_CODE_STATE_HASH:manifest.codeStateHash,VIGIA_OPERATIONAL_DATA_HASH:manifest.operationalDataHash,VIGIA_APPROVED_RELEASE_STATEMENT_SHA256:manifest.releaseStatementHash,VIGIA_OPERATOR_TOKEN:sharedToken,FIELDNET_CONTROL_KEY:'',FIELDNET_CONTROL_KEY_FILE:'',VIGIA_FIELDNET_CAPACITY_TASK_KEY:'',VIGIA_FIELDNET_CAPACITY_TASK_KEY_FILE:'',VIGIA_FIELDNET_NODE_REGISTRY_JSON:fieldRegistry},apiEnvironment={...shared,VIGIA_FIELDNET_CAPACITY_TASK_SOCKET:fieldControlSocket,VIGIA_FIELDNET_CAPACITY_TASK_KEY:fieldCapacityTaskKey,VIGIA_FIELDNET_CAPACITY_TASK_KEY_ID:'fieldnet-capacity-task-resolver',VIGIA_FIELDNET_CAPACITY_TASK_INCIDENT_SCOPES:commandSurvivalProof.incidentId,VIGIA_FIELDNET_CAPACITY_TASK_NODE_ID:fieldNodeId},controlShared={...shared,FIELDNET_CONTROL_KEY:fieldControlKey,FIELDNET_CONTROL_KEY_ID:'field-operator',FIELDNET_CONTROL_SOCKET:fieldControlSocket,FIELDNET_CONTROL_INCIDENT_SCOPES:commandSurvivalProof.incidentId};
await atomicWriteNoFollow(operatorTokenFile,`${sharedToken}\n`,{root});
process.stdout.write(`RELEASE ENDPOINTS: ${central} · ${field}\n`);
const listenerDecision=canonicalListenerDecision({root,manifest,central:await listenerState(centralPort,`${central}/api/v10/release`),field:await listenerState(fieldPort,`${field}/api/fieldnet/release`)});
let apiPid,fieldPid,centralIdentity,fieldIdentity;
process.stdout.write(`CANONICAL RUNTIME: ${listenerDecision.action} · ${listenerDecision.reason}\n`);
await stopOwnedCanonicalProcess(centralPort);await stopOwnedCanonicalProcess(fieldPort);
apiPid=await startProcess(`vigia-${centralPort}`,['apps/api/src/server.mjs'],apiEnvironment);centralIdentity=await waitRelease(`${central}/api/v10/release`,manifest,{services:true,timeout:240_000});
const fieldEnvironment={NODE_ENV:'development',VIGIA_RUNTIME_PROFILE:'local_shadow',VIGIA_RELEASE_ID:manifest.releaseId,VIGIA_CODE_STATE_HASH:manifest.codeStateHash,VIGIA_OPERATIONAL_DATA_HASH:manifest.operationalDataHash,VIGIA_APPROVED_RELEASE_STATEMENT_SHA256:manifest.releaseStatementHash,FIELDNET_CONTROL_KEY:fieldControlKey,FIELDNET_CONTROL_KEY_ID:'field-operator',FIELDNET_CAPACITY_TASK_KEY:fieldCapacityTaskKey,FIELDNET_CAPACITY_TASK_KEY_ID:'fieldnet-capacity-task-resolver',FIELDNET_CONTROL_SOCKET:fieldControlSocket,FIELDNET_CONTROL_INCIDENT_SCOPES:commandSurvivalProof.incidentId,FIELDNET_NODE_KEY:fieldNodeKey,FIELDNET_PORT:String(fieldPort),FIELDNET_HOST:'127.0.0.1',FIELDNET_NODE_ID:fieldNodeId,FIELDNET_CENTRAL_URL:`${central}/api/v10`,FIELDNET_DB_PATH:releaseFieldDatabase};
fieldPid=await startProcess(`fieldnet-${fieldPort}`,['apps/field-node/src/server.mjs'],fieldEnvironment,{inheritEnvironment:false});fieldIdentity=await waitRelease(`${field}/api/fieldnet/release`,manifest);
const convergenceFailures=[...releaseIdentityFailures(centralIdentity,manifest).map((item)=>`central:${item}`),...releaseIdentityFailures(fieldIdentity,manifest).map((item)=>`fieldNode:${item}`)];if(convergenceFailures.length)throw new Error(`canonical_release_not_converged:${convergenceFailures.join(',')}`);
await command(process.execPath,['scripts/command-survival/verify_runtime.mjs'],{env:{...controlShared,COMMAND_SURVIVAL_API_URL:central,COMMAND_SURVIVAL_FIELD_URL:field},timeout:120_000});
const backendOnly=process.env.VIGIA_BACKEND_ONLY==='1';
if(backendOnly){
  console.log('LOCAL REHEARSAL UI: SKIPPED · backend-only mutable-workspace rehearsal');
}else{
  await command(process.execPath,['apps/operator-console/scripts/build.mjs'],{env:shared,timeout:120_000});
  await command(process.execPath,['scripts/operator_console_runtime.mjs','start'],{env:{...shared,VIGIA_BACKEND_URL:central},timeout:120_000});
}
const centralHealth=await response(`${central}/api/v10/health`),fieldHealth=await response(`${field}/`),operatorHealth=backendOnly?null:await response('http://127.0.0.1:4190/__operator/ready'),operatorCurrent=backendOnly||operatorHealth.ok&&operatorHealth.body?.releaseId===manifest.releaseId&&operatorHealth.body?.codeStateHash===manifest.codeStateHash&&operatorHealth.body?.operationalDataHash===manifest.operationalDataHash&&operatorHealth.body?.releaseStatementHash===manifest.releaseStatementHash&&operatorHealth.body?.sourceHash===manifest.canonicalOperatorConsole.sourceHash;
if(!centralHealth.ok||!fieldHealth.ok||!operatorCurrent)throw new Error('local_rehearsal_runtime_health_failed');
process.stdout.write(`${JSON.stringify({state:'REHEARSAL_UNSEALED',certificationEligible:false,releaseId:manifest.releaseId,codeStateHash:manifest.codeStateHash,operationalDataHash:manifest.operationalDataHash,releaseStatementHash:manifest.releaseStatementHash,pids:{api:apiPid,fieldNode:fieldPid},http:{[centralPort]:centralHealth.status,[fieldPort]:fieldHealth.status,...(operatorHealth?{4190:operatorHealth.status}:{})},trustBoundary:'Mutable-workspace local rehearsal. Release certification is permitted only against sealed remote_shadow runtimes.'})}\n`);
