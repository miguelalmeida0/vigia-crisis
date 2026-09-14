import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { resolveLocalDatabaseUrl } from './local_database_secret.mjs';

const databaseUrl=await resolveLocalDatabaseUrl();

async function freePort(){return new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});}
async function waitFor(url,timeout=30_000){const end=Date.now()+timeout;let last;while(Date.now()<end){try{const response=await fetch(url);if(response.ok)return response;}catch(error){last=error;}await new Promise((resolve)=>setTimeout(resolve,100));}throw last??new Error(`timeout_${url}`);}
async function waitForServices(url,timeout=30_000){const end=Date.now()+timeout;let last;while(Date.now()<end){try{const response=await fetch(url),body=await response.json();if(response.ok&&body.startup?.servicesReadyAt)return body;}catch(error){last=error;}await new Promise((resolve)=>setTimeout(resolve,100));}throw last??new Error(`timeout_${url}`);}
async function waitForJsonShape(url,predicate,timeout=30_000){const end=Date.now()+timeout;let last;while(Date.now()<end){try{const response=await fetch(url),body=await response.json();if(predicate(body,response))return body;last=new Error(`unexpected_contract_${response.status}_${url}`);}catch(error){last=error;}await new Promise((resolve)=>setTimeout(resolve,100));}throw last??new Error(`timeout_${url}`);}
function assert(value,code){if(!value)throw new Error(code);}
function cleanEnvironment(overrides){const env={...process.env,...overrides};delete env.VIGIA_FIXTURES;delete env.VIGIA_OPERATOR_BEARER_TOKEN;delete env.VIGIA_OPERATOR_TOKEN;return env;}
async function start({port,stateFile}){
  const child=spawn(process.execPath,['apps/api/src/server.mjs'],{cwd:process.cwd(),env:cleanEnvironment({VIGIA_UNIVERSE:'production',VIGIA_DATABASE_URL:databaseUrl,PORT:String(port),OPEN_BROWSER:'0',REQUEST_TIMEOUT_MS:'500',REFRESH_MS:'60000',VIGIA_STATE_FILE:stateFile,NASA_FIRMS_MAP_KEY:''}),stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',(value)=>output+=value);child.stderr.on('data',(value)=>output+=value);
  try{await waitFor(`http://127.0.0.1:${port}/live`);await waitForServices(`http://127.0.0.1:${port}/api/v10/health`);return{child,output:()=>output};}catch(error){child.kill('SIGTERM');throw new Error(`${error.message}\n${output}`);}
}
async function stop(child){if(!child||child.exitCode!==null)return;child.kill('SIGTERM');await new Promise((resolve)=>{const timer=setTimeout(resolve,3000);child.once('exit',()=>{clearTimeout(timer);resolve();});});}
async function inspect(base){
  const health=await(await fetch(`${base}/api/v10/health`)).json();
  const bootstrap=await(await fetch(`${base}/api/v2/bootstrap`)).json();
  const events=await(await fetch(`${base}/api/v10/events`)).json();
  const replayResponse=await fetch(`${base}/api/v10/replay`);
  const readiness=await waitForJsonShape(`${base}/api/v10/ready`,(body)=>Array.isArray(body?.checks));
  const rootResponse=await fetch(base);
  const mutation=await fetch(`${base}/api/v2/evidence-requests`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  const syntheticCheck=readiness.checks.find((item)=>item.id==='production_synthetic_observations');
  const identityCheck=readiness.checks.find((item)=>item.id==='demo_identities'),productionReality=readiness.capabilities?.productionReality;
  assert(health.universe==='production','health_universe_not_production');
  assert(bootstrap.meta.universe==='production'&&bootstrap.meta.mode==='production','bootstrap_universe_not_production');
  assert(bootstrap.meta.features?.prevention===true&&bootstrap.meta.features?.detection===true&&bootstrap.meta.features?.livingFire===true&&bootstrap.meta.features?.action===true&&bootstrap.meta.features?.outcomes===false,'lifecycle_feature_contract_missing');
  assert(bootstrap.control.actors.length===1&&bootstrap.control.actors[0].id==='public-readonly','demo_identity_exposed');
  assert(events.meta.mode==='production','event_universe_not_production');
  assert(replayResponse.status===401,'protected_replay_was_public');
  assert(events.events.every((event)=>(event.observations??[]).every((item)=>item.provenance?.synthetic!==true&&!item.fixture&&!/fixture|synthetic|mock|fake/i.test(String(item.source??'')))),'synthetic_observation_visible');
  assert(syntheticCheck?.ok&&productionReality?.syntheticObservations===0,'production_synthetic_count_nonzero');
  assert(identityCheck?.ok&&productionReality?.demoIdentities===0,'production_demo_identity_count_nonzero');
  assert(rootResponse.status===404,'api_listener_served_a_second_frontend');
  assert(mutation.status===401,'unauthenticated_mutation_not_rejected');
  assert((await fetch(`${base}/assets/fixture-before.webp`)).status===404,'fixture_asset_served');
  const fieldRoute=await fetch(`${base}/field/`),fieldBody=await fieldRoute.text();
  assert(!/FIELD CAPTURE|actor-field/.test(fieldBody)&&(await fetch(`${base}/field/field.js`)).status===404,'fake_field_identity_surface_served');
  return{eventCount:events.events.length,observationCount:events.events.reduce((sum,event)=>sum+(event.observations?.length??0),0),replayAccessStatus:replayResponse.status,apiRootStatus:rootResponse.status,ready:readiness.ready,syntheticObservations:productionReality.syntheticObservations,demoIdentities:productionReality.demoIdentities};
}

const tempRoot=path.join(process.cwd(),'.tmp');await mkdir(tempRoot,{recursive:true});
const directory=await mkdtemp(path.join(tempRoot,'vigia-production-smoke-')),stateFile=path.join(directory,'production.json'),port=await freePort(),base=`http://127.0.0.1:${port}`;
let firstProcess,secondProcess;
try{
  firstProcess=await start({port,stateFile});const before=await inspect(base);await stop(firstProcess.child);
  secondProcess=await start({port,stateFile});const after=await inspect(base);
  assert(after.syntheticObservations===0&&after.demoIdentities===0,'restart_reality_gate_failed');
  console.log(JSON.stringify({gate:'production_smoke',pass:true,beforeRestart:before,afterRestart:after},null,2));
}catch(error){console.error(firstProcess?.output?.()??'',secondProcess?.output?.()??'');throw error;}
finally{await stop(firstProcess?.child);await stop(secondProcess?.child);await rm(directory,{recursive:true,force:true});}
