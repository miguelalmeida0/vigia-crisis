import assert from 'node:assert/strict';
import { mkdir,mkdtemp,readFile,rm,writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { localUp } from '../../../scripts/local_runtime.mjs';

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');

test('one-command local orchestration owns the complete fixed dependency graph',async()=>{
  const [packageJson,runtime,supervisor]=await Promise.all([
    readFile(path.join(projectRoot,'package.json'),'utf8').then(JSON.parse),
    readFile(path.join(projectRoot,'scripts/local_runtime.mjs'),'utf8'),
    readFile(path.join(projectRoot,'scripts/local_process_supervisor.mjs'),'utf8')
  ]);
  assert.equal(packageJson.scripts['local:up'],'node scripts/local_runtime.mjs up');
  assert.equal(packageJson.scripts['local:status'],'node scripts/local_runtime.mjs status');
  assert.equal(packageJson.scripts['local:open'],'node scripts/local_runtime.mjs open');
  assert.equal(packageJson.scripts['local:down'],'node scripts/local_runtime.mjs down');
  assert.match(runtime,/api:4177,fieldnet:4188,operator:4190/);assert.match(runtime,/LOCAL_REHEARSAL_UNSEALED/);assert.match(runtime,/local_operator_credentials_must_be_distinct/);assert.match(runtime,/process\?\.startup\?\.state==='failed'/);assert.match(runtime,/canonicalStartupSummary/);assert.match(runtime,/pathname='\/api\/v10\/events'/);assert.match(runtime,/CANONICAL_STARTUP_SUMMARY_MAX_BYTES/);assert.match(runtime,/resolveCanonicalFieldNetScope/);assert.doesNotMatch(runtime,/operatorEvents\?\.\[0\]/);assert.match(runtime,/supervisorRequest\(component,token,'stop'\)/);assert.doesNotMatch(runtime,/killall|pkill/);
  assert.match(runtime,/authoritativeFieldNetReady/);assert.match(runtime,/`\$\{fieldOrigin\}\/ready`/);assert.match(runtime,/fieldnet_authoritative_readiness/);assert.match(runtime,/event:'FIELDNET_READY'/);
  assert.match(runtime,/reuseOrBuildReleaseManifest/);assert.match(runtime,/releaseMatches\(existing\.pointer,manifest\)/);assert.doesNotMatch(runtime,/buildReleaseManifest/);
  assert.ok(runtime.indexOf("fieldnet_authoritative_readiness")<runtime.indexOf("currentComponent='OPERATOR'"),'Operator must not start before authoritative FieldNet readiness');
  assert.match(supervisor,/MAX_LOG_BYTES=256\*1024/);assert.match(supervisor,/redactor\(process\.env\)/);assert.match(supervisor,/timingSafeEqual/);assert.match(supervisor,/stdio:\['ignore','pipe','pipe'\]/);assert.doesNotMatch(supervisor,/killall|pkill/);
});

test('required artifact resolution is classified after PostGIS and before FieldNet scope',async()=>{
  const runtime=await readFile(path.join(projectRoot,'scripts/local_runtime.mjs'),'utf8'),postgis=runtime.indexOf("currentComponent='POSTGIS'"),canonical=runtime.indexOf("currentComponent='CANONICAL RUNTIME DATA'",postgis),scope=runtime.indexOf("currentComponent='FIELDNET SCOPE'",canonical),api=runtime.indexOf("currentComponent='CENTRAL API'",scope);
  assert.ok(postgis>0&&postgis<canonical&&canonical<scope&&scope<api);
  assert.doesNotMatch(runtime,/jsonFile\(/);
  assert.match(runtime,/readRequiredJson\(canonicalIncidentIndexFile/);
});

test('canonical readiness cannot leak validation ports or use Fetch forbidden-port semantics',async()=>{
  const runtime=await readFile(path.join(projectRoot,'scripts/local_runtime.mjs'),'utf8');
  assert.match(runtime,/defaultPorts=Object\.freeze\(\{api:4177,fieldnet:4188,operator:4190\}\)/);
  assert.doesNotMatch(runtime,/4290|4377|4388|4390/);
  assert.match(runtime,/request as nodeHttpRequest/);assert.doesNotMatch(runtime,/\bfetch\(/);
  assert.match(runtime,/`\$\{apiOrigin\}\/api\/v10\/health`/);assert.match(runtime,/`\$\{operatorOrigin\}\/__operator\/ready`/);
  assert.match(runtime,/probe\.body\?\.frontend==='operator-console'/);assert.match(runtime,/releaseMatches\(probe\.body,manifest\)/);
  assert.doesNotMatch(runtime,/admittedOperatorHealth/);
});

test('status captures core readiness before the admitted map diagnostic can load the cold API',async()=>{
  const runtime=await readFile(path.join(projectRoot,'scripts/local_runtime.mjs'),'utf8'),status=runtime.slice(runtime.indexOf('export async function localStatus'),runtime.indexOf('export async function localDown')),
        core=status.indexOf('[apiRelease,apiHealth,fieldRelease,fieldHealth,fieldReady,operatorReady]=await Promise.all'),map=status.indexOf('const map=accessToken?await admittedMapState');
  assert.ok(core>0&&map>core,'core readiness probes must complete before the 32-tile map diagnostic starts');
  assert.doesNotMatch(status,/Promise\.all\([^;]*admittedMapState/s);
});

test('attempt-scoped failure state and owned lifetime reconciliation are explicit',async()=>{
  const [runtime,supervisor]=await Promise.all([readFile(path.join(projectRoot,'scripts/local_runtime.mjs'),'utf8'),readFile(path.join(projectRoot,'scripts/local_process_supervisor.mjs'),'utf8')]);
  const clear=runtime.indexOf("await unlink(paths.failure)",runtime.indexOf('export async function localUp')),
        status=runtime.indexOf('await localStatus({runtimeDir,ports,print:false})',runtime.indexOf('export async function localUp'));
  assert.ok(clear>0&&clear<status,'stale failure must be cleared before a new status/reconciliation pass');
  assert.match(runtime,/attemptId=`local-/);assert.match(runtime,/schemaVersion:'vigia\.local-runtime-failure\.v2'/);assert.match(runtime,/failure\?\.attemptId!==attemptId/);assert.match(runtime,/await unlink\(paths\.failure\).*LOCAL_UP_READY/s);assert.match(runtime,/localApiStartupTimeoutMs/);assert.match(runtime,/if\(last\?\.terminal\)/);
  assert.match(runtime,/if\(existing\.state==='READY'\)/);assert.match(runtime,/return\{\.\.\.existing,url,reused:true,attemptId\}/);
  assert.match(runtime,/for\(const component of Object\.values\(pointer\.components\?\?\{\}\)\)/);assert.match(runtime,/await forceStopOwnedSupervisor\(component\)/);assert.match(runtime,/descriptor\?\.supervisorPid!==component\.supervisorPid/);assert.match(runtime,/process\.kill\(component\.supervisorPid,'SIGKILL'\)/);
  assert.match(runtime,/detached:true,stdio:'ignore'/);assert.match(supervisor,/child\.once\('exit'/);assert.match(supervisor,/\['stop','crash'\]\.includes\(request\.action\)/);assert.match(supervisor,/stopChild\(\)/);assert.match(supervisor,/if\(flushInFlight\)return flushInFlight/);assert.match(supervisor,/while\(flushInFlight\|\|dirty\)/);assert.match(supervisor,/setTimeout\(resolve,1_500\)/);
});

test('a new failed attempt atomically replaces stale failure evidence',async()=>{
  const scratch=path.join(projectRoot,'.tmp','test');await mkdir(scratch,{recursive:true});const runtimeDir=await mkdtemp(path.join(scratch,'local-runtime-failure-')),server=createServer((_request,response)=>response.end('occupied'));
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const port=server.address().port;
  try{
    await writeFile(path.join(runtimeDir,'last-failure.json'),JSON.stringify({schemaVersion:'old',attemptId:'stale-attempt',component:'OLD',failedAt:'2000-01-01T00:00:00.000Z'}),{mode:0o600});
    await assert.rejects(()=>localUp({runtimeDir,ports:{api:port,fieldnet:port+1,operator:port+2},print:false}),/API LISTENER_OWNERSHIP_FAILED/);
    const failure=JSON.parse(await readFile(path.join(runtimeDir,'last-failure.json'),'utf8'));assert.equal(failure.schemaVersion,'vigia.local-runtime-failure.v2');assert.notEqual(failure.attemptId,'stale-attempt');assert.match(failure.attemptId,/^local-/);assert.equal(failure.component,'API');assert.equal(failure.state,'LISTENER_OWNERSHIP_FAILED');assert.match(failure.cause,new RegExp(`Port ${port} is already listening`));assert.ok(Date.parse(failure.failedAt)>Date.parse('2026-01-01T00:00:00.000Z'));
  }finally{await new Promise((resolve)=>server.close(resolve));await rm(runtimeDir,{recursive:true,force:true});}
});
