Last login: Thu Sep  3 09:07:52 on console

**\~** 

**❯** cd "/Users/malmeida/Documents/ChatGPT/VIGIA Integration"

open -a Docker

until docker info >/dev/null 2>&1; do

  sleep 2

done

npm run local\:down

time npm run local\:up

npm run local\:status

\> vigia-physical-intelligence-core\@10.0.0 local\:down

\> node scripts/local\_runtime.mjs down

VIGIA LOCAL STOPPED

\> vigia-physical-intelligence-core\@10.0.0 local\:up

\> node scripts/local\_runtime.mjs up

VIGIA LOCAL READY

Database       READY

Central API    READY

FieldNet       READY

Operator       READY

Release        vigia-intelligence-fabric-5ed3541f7fcbcc00

Incidents      173

Certification  LOCAL\_REHEARSAL\_UNSEALED

http\://127.0.0.1:4190/?admission=eyJ2IjoxLCJhdWQiOiJ2aWdpYS1vcGVyYXRvci1jb25zb2xlIiwibm9uY2UiOiJjMDE0YmFiZTA4ZDY5MDkzZmI3MTNmY2U5OWNiYTQyNWMxZDBmNjdjMTkwMmE0N2YiLCJpYXQiOjE3ODg0MjE0ODIsImV4cCI6MTc4ODQyMTU0Mn0.\_iHtxCPKlOKLNSrMInE3zMPG7K64x-cR7rs4DGf4jdw

npm run local\:up  4.65s user 1.97s system 36% cpu 18.288 total

\> vigia-physical-intelligence-core\@10.0.0 local\:status

\> node scripts/local\_runtime.mjs status

VIGIA LOCAL

Database       READY

Central API    READY

FieldNet       READY

Operator       READY

Release        vigia-intelligence-fabric-5ed3541f7fcbcc00

Incidents      173

Evidence       UNAVAILABLE

Operations     READY

Map            DEGRADED\_PARTIAL · 3/32 layers

Certification  LOCAL\_REHEARSAL\_UNSEALED

Open:

http\://127.0.0.1:4190/#/command-overview

**VIGIA Integration** on ** integration/vigia-world-class-convergence** **[!?]** via ** v26.0.0** took **24s** 

**❯** >....                                                                         

import json

p = ".tmp/runtime/local-runtime.json"

x = json.load(open(p))

print("state:", x.get("state"))

print("releaseId:", x.get("releaseId"))

print("governedFieldNetIncidentId:", x.get("governedFieldNetIncidentId"))

print("incidentCount:", x.get("incidentCount"))

PY

echo

echo "===== INDEX FILES ====="

find data/runtime -maxdepth 1 \\

  -iname '\*incident\*index\*.json' \\

  -o -iname '\*canonical\*index\*.json'

echo

echo "===== FULL PROJECTION SIZE ====="

ls -lh data/runtime/event-projections.production.json

wc -c data/runtime/event-projections.production.json

\===== RUNTIME POINTER =====

state: READY

releaseId: vigia-intelligence-fabric-5ed3541f7fcbcc00

governedFieldNetIncidentId: PT-2026-03064D6743

incidentCount: 173

\===== INDEX FILES =====

data/runtime/canonical-incident-index.production.json

\===== FULL PROJECTION SIZE =====

-rw-------@ 1 malmeida  staff    12M Sep  3 09:43 data/runtime/event-projections.production.json

 12089668 data/runtime/event-projections.production.json

**VIGIA Integration** on ** integration/vigia-world-class-convergence** **[!?]** via ** v26.0.0 **

**❯** rg -n -C 8 \\

  "16\\\*1024\\\*1024|readRequiredJson|FILE\_TOO\_LARGE|SCHEMA\_INVALID|canonical.\*incident.\*index|FIELDNET SCOPE|CANONICAL RUNTIME DATA" \\

  scripts \\

  apps \\

  packages \\

  2>/dev/null | head -250

packages/domain/src/incident-command/ingestion.mjs-46-  return{schemaVersion:'vigia.incident-command-import-preview\.v1',status,adapter,universe\:normalized.universe,sourceSystem\:normalized.sourceSystem,incidentId\:normalized.incidentId,canonicalEventIds\:normalized.canonicalEventIds,sourcePayloadHash,sourceContentHash\:normalized.sourceContentHash,sourceFilename,importMode,acceptedRecords,rejectedRecords,recordCounts,rejections\:boundedRejections,validated\:status==='REJECTED'?null\:effectiveNormalized};

packages/domain/src/incident-command/ingestion.mjs-47-}

packages/domain/src/incident-command/ingestion.mjs-48-export function validateIncidentImport(input,{releaseId}={}){

packages/domain/src/incident-command/ingestion.mjs-49-  const verifiedReleaseId=required(releaseId,'release\_id\_required');

packages/domain/src/incident-command/ingestion.mjs-50-  if(input?.releaseId!=null&&input.releaseId!==verifiedReleaseId)throw new Error('incident\_import\_release\_identity\_mismatch');

packages/domain/src/incident-command/ingestion.mjs-51-  const adapter=required(input.adapter,'incident\_import\_adapter\_required');if(!allowed.includes(adapter))throw new Error('unsupported\_incident\_import\_adapter');

packages/domain/src/incident-command/ingestion.mjs-52-  const universe=input.universe??'SHADOW';if(!['PRODUCTION','SHADOW'].includes(universe))throw new Error('invalid\_incident\_import\_universe');if(universe==='PRODUCTION'&&adapter.startsWith('SHADOW\_'))throw new Error('shadow\_roster\_cannot\_enter\_production\_truth');

packages/domain/src/incident-command/ingestion.mjs-53-  const canonicalEventIds=input.canonicalEventIds??[];if(!canonicalEventIds.length)throw new Error('canonical\_vigia\_event\_required');

packages/domain/src/incident-command/ingestion.mjs:54:  const adapted=adaptIncidentSource(input,adapter),incidentId=required(input.incidentId,'incident\_id\_required'),sourceSystem=required(input.sourceSystem,'source\_system\_required'),reportRecordIds=input.reportRecordIds??[],effectivePayload={adapter,universe,sourceSystem,incidentId,canonicalEventIds,reportRecordIds,incident\:adapted.incident??{},organization\:adapted.organization??{},people\:adapted.people??[],crews\:adapted.crews??[],resources\:adapted.resources??[],waterSources\:adapted.waterSources??[],hazards\:adapted.hazards??[],preplans\:adapted.preplans??[]},sourceContentHash=hash(input.sourcePayload??null),sourcePayloadHash=hash(effectivePayload),counts=Object.values(identityFields).map((\_,index)=>adapted[Object.keys(identityFields)[index]]?.length??0),preplans=adapted.preplans?.length??0,total=counts.reduce((sum,count)=>sum+count,0)+preplans+(Object.keys(adapted.incident??{}).length?1:0)+(Object.keys(adapted.organization??{}).length?1:0);if(counts.some((count)=>count>maxRecordsPerType)||preplans>maxRecordsPerType||total>maxRecordsTotal)throw new Error('incident\_import\_record\_limit\_exceeded');return{schemaVersion:'vigia.incident-command-import.v1',importId\:input.importId??stableId('command-import',adapter,universe,sourcePayloadHash),incidentId,adapter,universe,sourceSystem,sourcePayloadHash,sourceContentHash,canonicalEventIds,reportRecordIds,...adapted,releaseId\:verifiedReleaseId};

packages/domain/src/incident-command/ingestion.mjs-55-}

\--

scripts/local\_runtime\_json.mjs-29-    return await lstat(file);

scripts/local\_runtime\_json.mjs-30-  } catch (error) {

scripts/local\_runtime\_json.mjs-31-    if (error?.code === 'ENOENT' && optional) return null;

scripts/local\_runtime\_json.mjs-32-    if (error?.code === 'ENOENT') throw new RequiredJsonArtifactError('FILE\_NOT\_FOUND', { file, label, cause: error });

scripts/local\_runtime\_json.mjs-33-    throw new RequiredJsonArtifactError('READ\_FAILED', { file, label, cause: error });

scripts/local\_runtime\_json.mjs-34-  }

scripts/local\_runtime\_json.mjs-35-}

scripts/local\_runtime\_json.mjs-36-

scripts/local\_runtime\_json.mjs:37\:export async function readRequiredJson(file, { root, maxBytes, label, validate = null } = {}) {

scripts/local\_runtime\_json.mjs-38-  if (!root || !Number.isInteger(maxBytes) || maxBytes <= 0 || !label) throw new Error('required\_json\_reader\_configuration\_invalid');

scripts/local\_runtime\_json.mjs-39-  const info = await metadata(file, { label });

scripts/local\_runtime\_json.mjs-40-  if (!info.isFile() || info.isSymbolicLink()) throw new RequiredJsonArtifactError('READ\_FAILED', { file, label, maxBytes, actualBytes: info.size });

scripts/local\_runtime\_json.mjs:41:  if (info.size > maxBytes) throw new RequiredJsonArtifactError('FILE\_TOO\_LARGE', { file, label, maxBytes, actualBytes: info.size });

scripts/local\_runtime\_json.mjs-42-  let source;

scripts/local\_runtime\_json.mjs-43-  try {

scripts/local\_runtime\_json.mjs-44-    source = await readFileNoFollow(file, { root, maxBytes, encoding: 'utf8' });

scripts/local\_runtime\_json.mjs-45-  } catch (error) {

scripts/local\_runtime\_json.mjs-46-    throw new RequiredJsonArtifactError('READ\_FAILED', { file, label, maxBytes, actualBytes: info.size, cause: error });

scripts/local\_runtime\_json.mjs-47-  }

scripts/local\_runtime\_json.mjs-48-  let value;

scripts/local\_runtime\_json.mjs-49-  try {

\--

scripts/local\_runtime\_json.mjs-52-    throw new RequiredJsonArtifactError('INVALID\_JSON', { file, label, maxBytes, actualBytes: info.size, cause: error });

scripts/local\_runtime\_json.mjs-53-  }

scripts/local\_runtime\_json.mjs-54-  if (validate) {

scripts/local\_runtime\_json.mjs-55-    try {

scripts/local\_runtime\_json.mjs-56-      const validated = validate(value);

scripts/local\_runtime\_json.mjs-57-      if (validated === false) throw new Error('validator\_returned\_false');

scripts/local\_runtime\_json.mjs-58-      if (validated !== undefined && validated !== true) value = validated;

scripts/local\_runtime\_json.mjs-59-    } catch (error) {

scripts/local\_runtime\_json.mjs:60:      throw new RequiredJsonArtifactError('SCHEMA\_INVALID', { file, label, maxBytes, actualBytes: info.size, cause: error });

scripts/local\_runtime\_json.mjs-61-    }

scripts/local\_runtime\_json.mjs-62-  }

scripts/local\_runtime\_json.mjs-63-  return value;

scripts/local\_runtime\_json.mjs-64-}

scripts/local\_runtime\_json.mjs-65-

scripts/local\_runtime\_json.mjs-66-export async function readOptionalJson(file, { root, maxBytes = LOCAL\_RUNTIME\_DESCRIPTOR\_MAX\_BYTES, label, fallback = null, validate = null } = {}) {

scripts/local\_runtime\_json.mjs-67-  const info = await metadata(file, { label, optional: true });

scripts/local\_runtime\_json.mjs-68-  if (!info) return structuredClone(fallback);

scripts/local\_runtime\_json.mjs:69:  return readRequiredJson(file, { root, maxBytes, label, validate });

scripts/local\_runtime\_json.mjs-70-}

scripts/local\_runtime\_json.mjs-71-

scripts/local\_runtime\_json.mjs-72-export function artifactHeadroom(actualBytes, maxBytes) {

scripts/local\_runtime\_json.mjs-73-  return Number((((maxBytes - actualBytes) / maxBytes) \* 100).toFixed(2));

scripts/local\_runtime\_json.mjs-74-}

\--

apps/api/src/modules/interventions/operator-state-capacity.mjs-1-import { incidentIdForResource } from '../../../../../packages/domain/src/authorization.mjs';

apps/api/src/modules/interventions/operator-state-capacity.mjs-2-

apps/api/src/modules/interventions/operator-state-capacity.mjs-3-export const DEFAULT\_OPERATOR\_STATE\_CAPACITY=Object.freeze({

apps/api/src/modules/interventions/operator-state-capacity.mjs:4:  maxEvidenceRequests:10\_000,maxEvidenceRequestsPerIncident:500,maxEvidenceRequestsPerPrincipal:1\_000,maxEvidenceRequestBytes:64\*1024\*1024,maxEvidenceRequestBytesPerIncident:8\*1024\*1024,maxEvidenceRequestBytesPerPrincipal:16\*1024\*1024,

apps/api/src/modules/interventions/operator-state-capacity.mjs-5-  maxEvidencePackages:10\_000,maxEvidencePackagesPerIncident:500,maxEvidencePackagesPerPrincipal:1\_000,maxEvidencePackageBytes:256\*1024\*1024,maxEvidencePackageBytesPerIncident:32\*1024\*1024,maxEvidencePackageBytesPerPrincipal:64\*1024\*1024

apps/api/src/modules/interventions/operator-state-capacity.mjs-6-});

apps/api/src/modules/interventions/operator-state-capacity.mjs-7-

apps/api/src/modules/interventions/operator-state-capacity.mjs-8-const bytes=(value)=>Buffer.byteLength(JSON.stringify(value));

apps/api/src/modules/interventions/operator-state-capacity.mjs-9-const positive=(value,fallback)=>Math.max(1,Number.isFinite(Number(value))?Number(value)\:fallback);

apps/api/src/modules/interventions/operator-state-capacity.mjs-10-const capacityError=(collection,scope,details)=>Object.assign(new Error(\`operator\_state\_${collection}\_capacity\_reached\`),{statusCode:507,details:{scope,...details}});

apps/api/src/modules/interventions/operator-state-capacity.mjs-11-const databaseInvalidText=()=>Object.assign(new Error('operator\_state\_database\_invalid\_text'),{statusCode:400});

apps/api/src/modules/interventions/operator-state-capacity.mjs-12-export function assertOperatorStatePersistenceSafe(state){

\--

scripts/local\_runtime.mjs-3-import { lstat, readFile, unlink } from 'node\:fs/promises';

scripts/local\_runtime.mjs-4-import { request as nodeHttpRequest } from 'node\:http';

scripts/local\_runtime.mjs-5-import net from 'node\:net';

scripts/local\_runtime.mjs-6-import path from 'node\:path';

scripts/local\_runtime.mjs-7-import { promisify } from 'node\:util';

scripts/local\_runtime.mjs-8-import { fileURLToPath } from 'node\:url';

scripts/local\_runtime.mjs-9-import { loadConfig } from '../apps/api/src/config/env.mjs';

scripts/local\_runtime.mjs-10-import { createOneTimeAdmission } from '../apps/operator-console/admission.mjs';

scripts/local\_runtime.mjs:11\:import { assertCanonicalIncidentIndex, selectCanonicalFieldNetIncident } from '../packages/domain/src/event-fabric/canonical-incident-index.mjs';

scripts/local\_runtime.mjs-12-import { signOperatorProxyRequest } from '../packages/domain/src/operator-proxy/request-auth.mjs';

scripts/local\_runtime.mjs-13-import { operatorOpen } from './operator\_open.mjs';

scripts/local\_runtime.mjs-14-import { runDbDoctor } from './db\_doctor.mjs';

scripts/local\_runtime.mjs-15-import { resolveLocalDatabaseUrl } from './local\_database\_secret.mjs';

scripts/local\_runtime.mjs-16-import { buildReleaseManifest } from './release/build\_release\_manifest.mjs';

scripts/local\_runtime.mjs-17-import { atomicWriteNoFollow, readFileNoFollow, verifyDirectoryChain } from './release/safe\_artifact.mjs';

scripts/local\_runtime.mjs:18\:import { CANONICAL\_INCIDENT\_INDEX\_MAX\_BYTES, CANONICAL\_STARTUP\_SUMMARY\_MAX\_BYTES, LOCAL\_RUNTIME\_DESCRIPTOR\_MAX\_BYTES, RETAINED\_FIELDNET\_SCOPE\_MAX\_BYTES, readOptionalJson, readRequiredJson } from './local\_runtime\_json.mjs';

scripts/local\_runtime.mjs-19-

scripts/local\_runtime.mjs-20-const exec=promisify(execFile),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),defaultRuntimeDir=path.join(root,'.tmp','runtime');

scripts/local\_runtime.mjs-21-const defaultPorts=Object.freeze({api:4177,fieldnet:4188,operator:4190});

scripts/local\_runtime.mjs-22-const localApiStartupTimeoutMs=Math.max(60\_000,Math.min(180\_000,Number(process.env.VIGIA\_LOCAL\_API\_STARTUP\_TIMEOUT\_MS)||120\_000));

scripts/local\_runtime.mjs-23-const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));

scripts/local\_runtime.mjs-24-const relative=(file)=>path.relative(root,file);

scripts/local\_runtime.mjs-25-

scripts/local\_runtime.mjs-26-function runtimePaths(runtimeDir=defaultRuntimeDir){return{runtimeDir,pointer\:path.join(runtimeDir,'local-runtime.json'),failure\:path.join(runtimeDir,'last-failure.json'),retainedScope\:path.join(runtimeDir,'fieldnet-retained-scope.json'),orchestrationLog\:path.join(runtimeDir,'orchestration.log'),controlToken\:path.join(runtimeDir,'control-token'),operatorToken\:path.join(root,'.tmp','release','operator-token'),operatorAccessToken\:path.join(root,'.tmp','release','operator-console-access-token'),operatorPointer\:path.join(root,'.tmp','operator-console-current.json')};}

scripts/local\_runtime.mjs:27\:const canonicalIncidentIndexFile=path.join(root,'data/runtime/canonical-incident-index.production.json');

scripts/local\_runtime.mjs-28-// OPTIONAL only when absent: runtime pointer (STOPPED), prior failure (none),

scripts/local\_runtime.mjs-29-// supervisor descriptors while polling, and retained FieldNet scope (first run).

scripts/local\_runtime.mjs-30-// If any optional descriptor exists, invalid JSON, unsafe reads, or invalid

scripts/local\_runtime.mjs:31:// schema are fatal. The canonical incident index is always REQUIRED.

scripts/local\_runtime.mjs-32-const optionalJson=(file,label,fallback=null,validate=null,maxBytes=LOCAL\_RUNTIME\_DESCRIPTOR\_MAX\_BYTES)=>readOptionalJson(file,{root,maxBytes,label,fallback,validate});

scripts/local\_runtime.mjs-33-const runtimePointerSchema=(value)=>{if(!value||value.schemaVersion!=='vigia.local-runtime.v2')throw new Error('local\_runtime\_pointer\_schema\_invalid');return value;};

scripts/local\_runtime.mjs-34-const retainedScopeSchema=(value)=>{if(!value||value.schemaVersion!=='vigia.fieldnet-retained-scope.v1'||typeof value.incidentId!=='string')throw new Error('fieldnet\_retained\_scope\_schema\_invalid');return value;};

scripts/local\_runtime.mjs-35-export async function resolveCanonicalFieldNetScope({indexFile=canonicalIncidentIndexFile,retainedScopeFile=null,projectRoot=root}={}){

scripts/local\_runtime.mjs:36:  const index=await readRequiredJson(indexFile,{root\:projectRoot,maxBytes\:CANONICAL\_INCIDENT\_INDEX\_MAX\_BYTES,label:'canonical\_incident\_index\_artifact',validate\:assertCanonicalIncidentIndex}),prior=retainedScopeFile?await readOptionalJson(retainedScopeFile,{root\:projectRoot,maxBytes\:RETAINED\_FIELDNET\_SCOPE\_MAX\_BYTES,label:'fieldnet\_retained\_scope\_descriptor',fallback\:null,validate\:retainedScopeSchema})\:null,incidentId=selectCanonicalFieldNetIncident(index,{priorIncidentId\:prior?.incidentId});

scripts/local\_runtime.mjs-37-  if(!incidentId)throw Object.assign(new Error('canonical\_fieldnet\_incident\_scope\_unavailable'),{code:'FIELDNET\_SCOPE\_UNAVAILABLE',terminal\:true});

scripts/local\_runtime.mjs-38-  return{index,incidentId,retained\:Boolean(prior?.incidentId===incidentId)};

scripts/local\_runtime.mjs-39-}

scripts/local\_runtime.mjs-40-async function command(program,args,{env={},timeout=180\_000}={}){return exec(program,args,{cwd\:root,env:{...process.env,...env},timeout,maxBuffer:64\*1024\*1024,encoding:'utf8'});}

scripts/local\_runtime.mjs-41-function safeLoopbackUrl(value){const url=new URL(value);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password)throw new Error('local\_runtime\_probe\_url\_invalid');return url;}

scripts/local\_runtime.mjs-42-async function loopbackRequest(value,{headers={},timeoutMs=4\_000,maxBytes=2\*1024\*1024}={}){const url=safeLoopbackUrl(value);return new Promise((resolve)=>{let settled=false;const finish=(result)=>{if(settled)return;settled=true;resolve({...result,url\:url.href});},request=nodeHttpRequest({protocol\:url.protocol,hostname\:url.hostname,port\:url.port,path:\`${url.pathname}${url.search}\`,method:'GET',headers,agent\:false},(response)=>{const chunks=[];let bytes=0;response.on('data',(chunk)=>{bytes+=chunk.length;if(bytes>maxBytes)request.destroy(new Error('local\_runtime\_response\_too\_large'));else chunks.push(chunk);});response.once('end',()=>finish({ok\:Number(response.statusCode)>=200&&Number(response.statusCode)<300,status\:Number(response.statusCode??0),headers\:response.headers,buffer\:Buffer.concat(chunks)}));response.once('error',(error)=>finish({ok\:false,status:0,error\:String(error?.message??error)}));});request.setTimeout(timeoutMs,()=>request.destroy(new Error('local\_runtime\_probe\_timeout')));request.once('error',(error)=>finish({ok\:false,status:0,error\:String(error?.message??error),cause\:String(error?.cause?.message??error?.cause??'')||null}));request.end();});}

scripts/local\_runtime.mjs-43-async function fetchJson(url,{headers={},timeoutMs=4\_000,maxBytes=2\*1024\*1024}={}){const response=await loopbackRequest(url,{headers:{accept:'application/json',...headers},timeoutMs,maxBytes});if(!response.buffer)return response;try{return{...response,body\:response.buffer.length?JSON.parse(response.buffer.toString('utf8'))\:null};}catch(error){return{...response,ok\:false,error:\`local\_runtime\_response\_invalid:${String(error?.message??error)}\`};}}

scripts/local\_runtime.mjs-44-async function listenerPids(port){try{const{stdout}=await command('lsof',[\`-tiTCP:${port}\`,'-sTCP\:LISTEN'],{timeout:3\_000});return stdout.split(/\s+/).map(Number).filter((pid)=>Number.isInteger(pid)&&pid>0);}catch{return[];}}

\--

scripts/local\_runtime.mjs-51-  const {spawn}=await import('node\:child\_process'),supervisor=spawn(process.execPath,[path.join(root,'scripts/local\_process\_supervisor.mjs'),files.config],{cwd\:root,env,detached\:true,stdio:'ignore'});await new Promise((resolve,reject)=>{supervisor.once('spawn',resolve);supervisor.once('error',reject);});supervisor.unref();

scripts/local\_runtime.mjs-52-  const result=await waitUntil(async()=>{const descriptor=await optionalJson(files.descriptor,\`${name}\_supervisor\_descriptor\`),socket=await lstat(files.socket).catch(()=>null),startupError=await readFile(startupErrorFile,'utf8').catch(()=>null);if(startupError)throw new Error(startupError.trim());return descriptor?.state==='RUNNING'&&socket?{ready\:true,descriptor}\:null;},{timeoutMs:8\_000,label:\`${name}\_supervisor\_start\`});return{...files,...result.descriptor};

scripts/local\_runtime.mjs-53-}

scripts/local\_runtime.mjs-54-async function supervisorRequest(component,token,action){return new Promise((resolve,reject)=>{const socket=net.createConnection(component.socket);let value='',settled=false;const finish=(error,result)=>{if(settled)return;settled=true;socket.destroy();error?reject(error)\:resolve(result);};socket.setTimeout(7\_000,()=>finish(new Error('local\_supervisor\_control\_timeout')));socket.once('connect',()=>socket.end(\`${JSON.stringify({token,action})}\n\`));socket.on('data',(chunk)=>{value+=chunk;if(Buffer.byteLength(value)>16\*1024)return finish(new Error('local\_supervisor\_control\_response\_too\_large'));});socket.once('error',(error)=>finish(error));socket.once('close',()=>{try{const result=JSON.parse(value.trim());result.ok?finish(null,result)\:finish(new Error(result.error??'local\_supervisor\_control\_failed'));}catch(error){finish(error);}});});}

scripts/local\_runtime.mjs-55-async function waitPortFree(port){return waitUntil(async()=>({ready:(await listenerPids(port)).length===0}),{timeoutMs:10\_000,label:\`port\_${port}\_stop\`});}

scripts/local\_runtime.mjs-56-async function waitSupervisorStopped(component){return waitUntil(async()=>{const descriptor=await optionalJson(component.descriptor,\`${component.name??'component'}\_supervisor\_descriptor\`),socket=await lstat(component.socket).catch(()=>null);return{ready\:descriptor?.state==='EXITED'&&descriptor?.supervisorPid===component.supervisorPid&&!socket,descriptor};},{timeoutMs:10\_000,label:\`${component.name??'component'}\_supervisor\_stop\`});}

scripts/local\_runtime.mjs-57-function processAlive(pid){if(!Number.isInteger(pid)||pid<=1)return false;try{process.kill(pid,0);return true;}catch(error){if(error?.code==='ESRCH')return false;throw error;}}

scripts/local\_runtime.mjs-58-async function forceStopOwnedSupervisor(component){

scripts/local\_runtime.mjs:59:  const descriptor=await readRequiredJson(component.descriptor,{root,maxBytes\:LOCAL\_RUNTIME\_DESCRIPTOR\_MAX\_BYTES,label:\`${component.name??'component'}\_supervisor\_descriptor\`});

scripts/local\_runtime.mjs-60-  if(descriptor?.state!=='RUNNING'||descriptor?.supervisorPid!==component.supervisorPid||descriptor?.childPid!==component.childPid||descriptor?.socketPath!==relative(component.socket))throw new Error(\`${component.name??'component'}\_supervisor\_ownership\_changed\`);

scripts/local\_runtime.mjs-61-  try{process.kill(component.supervisorPid,'SIGKILL');}catch(error){if(error?.code!=='ESRCH')throw error;}

scripts/local\_runtime.mjs-62-  await waitUntil(async()=>({ready:!processAlive(component.supervisorPid)}),{timeoutMs:5\_000,label:\`${component.name??'component'}\_supervisor\_force\_stop\`});

scripts/local\_runtime.mjs-63-  await unlink(component.socket).catch((error)=>{if(error?.code!=='ENOENT')throw error;});

scripts/local\_runtime.mjs-64-}

scripts/local\_runtime.mjs-65-function signedHeaders({token,releaseId,method='GET',pathname,operatorOrigin}){return{origin\:operatorOrigin,'sec-fetch-site':'same-origin','x-vigia-ui-proxy':'mission-dark-realdata-2.0',...signOperatorProxyRequest({key\:token,releaseId,method,path\:pathname})};}

scripts/local\_runtime.mjs-66-function releaseMatches(body,manifest){return Boolean(body&&body.releaseId===manifest.releaseId&&body.codeStateHash===manifest.codeStateHash&&body.operationalDataHash===manifest.operationalDataHash&&body.releaseStatementHash===manifest.releaseStatementHash);}

scripts/local\_runtime.mjs-67-export async function canonicalStartupSummary({apiOrigin,operatorOrigin,releaseId,operatorToken,expectedProjectionFingerprint=null,expectedIncidentCount=null}){const pathname='/api/v10/events',response=await fetchJson(\`${apiOrigin}${pathname}\`,{headers\:signedHeaders({token\:operatorToken,releaseId,pathname,operatorOrigin}),timeoutMs:15\_000,maxBytes\:CANONICAL\_STARTUP\_SUMMARY\_MAX\_BYTES}),inventory=response.body?.eventInventory,count=Number(inventory?.total),fingerprint=response.body?.projectionFingerprint??null,mismatch=response.ok&&((expectedProjectionFingerprint&&fingerprint!==expectedProjectionFingerprint)||(Number.isInteger(expectedIncidentCount)&&count!==expectedIncidentCount));return{response,count\:Number.isInteger(count)?count:0,projectionFingerprint\:fingerprint,responseBytes\:response.buffer?.length??0,ready\:response.ok&&!mismatch&&Number.isInteger(count)&&count>0&&fingerprint===expectedProjectionFingerprint,...(mismatch?{terminal\:true,error:'canonical\_startup\_summary\_projection\_mismatch'}:{})};}

\--

scripts/local\_runtime.mjs-83-export async function localStatus({runtimeDir=defaultRuntimeDir,ports=defaultPorts,print=true}={}){

scripts/local\_runtime.mjs-84-  const paths=runtimePaths(runtimeDir),pointer=await optionalJson(paths.pointer,'local\_runtime\_pointer',null,runtimePointerSchema),failure=await optionalJson(paths.failure,'local\_runtime\_failure\_descriptor'),database=await runDbDoctor();

scripts/local\_runtime.mjs-85-  if(!pointer){const listeners={};for(const[name,port]of Object.entries(ports))listeners[name]=await listenerPids(port);const unmanaged=Object.values(listeners).some((rows)=>rows.length),result={state\:unmanaged?'UNMANAGED\_LISTENER':'STOPPED',database,failure,listeners};if(print){console.log('VIGIA LOCAL\n');console.log(\`Database       ${database.classification}\`);console.log(\`Central API    ${listeners.api.length?\`UNMANAGED · PID ${listeners.api.join(', ')}\`:'STOPPED'}\`);console.log(\`FieldNet       ${listeners.fieldnet.length?\`UNMANAGED · PID ${listeners.fieldnet.join(', ')}\`:'STOPPED'}\`);console.log(\`Operator       ${listeners.operator.length?\`UNMANAGED · PID ${listeners.operator.join(', ')}\`:'STOPPED'}\`);if(failure)console.log(\`\nLast failure\n${failureMessage(failure)}\`);}return result;}

scripts/local\_runtime.mjs-86-  const apiOrigin=\`http\://127.0.0.1:${ports.api}\`,fieldOrigin=\`http\://127.0.0.1:${ports.fieldnet}\`,operatorOrigin=\`http\://127.0.0.1:${ports.operator}\`,accessToken=await protectedSecret(paths.operatorAccessToken).catch(()=>null),[apiRelease,apiHealth,fieldRelease,fieldHealth,operatorReady,map]=await Promise.all([fetchJson(\`${apiOrigin}/api/v10/release\`),fetchJson(\`${apiOrigin}/api/v10/health\`),fetchJson(\`${fieldOrigin}/api/fieldnet/release\`),fetchJson(\`${fieldOrigin}/health\`),fetchJson(\`${operatorOrigin}/\_\_operator/ready\`),accessToken?admittedMapState(operatorOrigin,accessToken)\:Promise.resolve({state:'UNAVAILABLE',loaded:0,failed:32,total:32,error:'operator\_access\_token\_unavailable'})]);

scripts/local\_runtime.mjs-87-  const listenerState={};for(const[name,port]of Object.entries(ports))listenerState[name]=await listenerPids(port);

scripts/local\_runtime.mjs-88-  const identityMatchesPointer=(body)=>body?.releaseId===pointer.releaseId&&body?.codeStateHash===pointer.codeStateHash&&body?.operationalDataHash===pointer.operationalDataHash&&body?.releaseStatementHash===pointer.releaseStatementHash;

scripts/local\_runtime.mjs-89-  const componentReady=(name,response,identity=true)=>{const expected=pointer.components?.[name]?.childPid,listeners=listenerState[name]??[];return response.ok&&listeners.length===1&&listeners[0]===expected&&(!identity||identityMatchesPointer(response.body));};

scripts/local\_runtime.mjs-90-  const states={api\:componentReady('api',apiRelease)&&apiRelease.body?.process?.servicesReady===true&&apiHealth.ok&&apiHealth.body?.startup?.ready===true,fieldnet\:componentReady('fieldnet',fieldRelease),operator\:componentReady('operator',operatorReady)&&operatorReady.body?.ok===true&&operatorReady.body?.frontend==='operator-console'};

scripts/local\_runtime.mjs:91:  let projection={ready\:false,count:0,error\:null};try{const index=await readRequiredJson(canonicalIncidentIndexFile,{root,maxBytes\:CANONICAL\_INCIDENT\_INDEX\_MAX\_BYTES,label:'canonical\_incident\_index\_artifact',validate\:assertCanonicalIncidentIndex});if(!index.incidents.some((incident)=>incident.id===pointer.governedFieldNetIncidentId))throw new Error('canonical\_fieldnet\_incident\_scope\_no\_longer\_retained');projection=await canonicalStartupSummary({apiOrigin,operatorOrigin,releaseId\:pointer.releaseId,operatorToken\:await protectedSecret(paths.operatorToken),expectedProjectionFingerprint\:index.projectionFingerprint,expectedIncidentCount\:index.incidentCount});}catch(error){projection={ready\:false,count:0,error\:String(error?.message??error)};}

scripts/local\_runtime.mjs-92-  const ready=database.classification==='READY'&&Object.values(states).every(Boolean)&&projection.ready,result={state\:ready?'READY':'DEGRADED',database,pointer,states,listenerState,apiRelease,apiHealth,fieldRelease,fieldHealth,operatorReady,operatorBackend\:apiHealth,projection,map,failure};

scripts/local\_runtime.mjs-93-  if(print){console.log('VIGIA LOCAL\n');console.log(\`Database       ${database.classification}\`);console.log(\`Central API    ${states.api?'READY':'FAILED'}\`);console.log(\`FieldNet       ${states.fieldnet?'READY':'FAILED'}\`);console.log(\`Operator       ${states.operator?'READY':'FAILED'}\`);console.log(\`\nRelease        ${pointer.releaseId}\`);console.log(\`Incidents      ${projection.ready?projection.count:'UNAVAILABLE'}\`);console.log(\`Evidence       ${projection.response?.body?.data?.governedWork?.state??'UNAVAILABLE'}\`);console.log(\`Operations     ${apiHealth.ok?'READY':'UNAVAILABLE'}\`);console.log(\`Map            ${map.state} · ${map.loaded}/${map.total??32} layers\`);console.log(\`Certification  LOCAL\_REHEARSAL\_UNSEALED\`);console.log(\`\nOpen:\n${operatorOrigin}/#/command-overview\`);if(!ready&&failure)console.log(\`\nLast failure\n${failureMessage(failure)}\`);}

scripts/local\_runtime.mjs-94-  return result;

scripts/local\_runtime.mjs-95-}

scripts/local\_runtime.mjs-96-

scripts/local\_runtime.mjs-97-export async function localDown({runtimeDir=defaultRuntimeDir,ports=defaultPorts,print=true,preserveFailure=true}={}){

scripts/local\_runtime.mjs-98-  const paths=runtimePaths(runtimeDir),pointer=await optionalJson(paths.pointer,'local\_runtime\_pointer',null,runtimePointerSchema);if(!pointer){const listeners={};for(const[name,port]of Object.entries(ports))listeners[name]=await listenerPids(port);const unmanaged=Object.entries(listeners).filter(([,pids])=>pids.length);if(unmanaged.length)throw new Error(\`local\_down\_unmanaged\_listeners:${unmanaged.map(([name,pids])=>\`${name}:${pids.join(',')}\`).join(';')}\`);}if(pointer){const token=await protectedSecret(paths.controlToken).catch(()=>null);if(token)for(const name of ['operator','fieldnet','api']){const component=pointer.components?.[name];if(!component)continue;await supervisorRequest(component,token,'stop').catch((error)=>{if(error?.code!=='ENOENT'&&!/ENOENT|ECONNREFUSED/.test(String(error.message)))throw error;});}for(const component of Object.values(pointer.components??{})){try{await waitSupervisorStopped(component);}catch(error){if(!/\_supervisor\_stop\_timeout:/.test(String(error?.message??error)))throw error;await forceStopOwnedSupervisor(component);}}for(const port of Object.values(ports))await waitPortFree(port);}

scripts/local\_runtime.mjs-99-  const ownedFiles=pointer?[paths.pointer,paths.controlToken,paths.operatorToken,paths.operatorAccessToken,paths.operatorPointer]:[paths.pointer,paths.controlToken];for(const file of ownedFiles)await unlink(file).catch((error)=>{if(error?.code!=='ENOENT')throw error;});if(!preserveFailure)await unlink(paths.failure).catch(()=>undefined);if(print)console.log('VIGIA LOCAL STOPPED');return{state:'STOPPED'};

scripts/local\_runtime.mjs-100-}

scripts/local\_runtime.mjs-101-

scripts/local\_runtime.mjs-102-export async function localUp({runtimeDir=defaultRuntimeDir,ports=defaultPorts,print=true}={}){

scripts/local\_runtime.mjs-103-  const paths=runtimePaths(runtimeDir),attemptId=\`local-${Date.now().toString(36)}-${randomBytes(8).toString('hex')}\`,attemptStartedAt=new Date().toISOString(),attemptOrigins={backend:\`http\://127.0.0.1:${ports.api}\`,backendHealth:\`http\://127.0.0.1:${ports.api}/api/v10/health\`,fieldnet:\`http\://127.0.0.1:${ports.fieldnet}\`,operator:\`http\://127.0.0.1:${ports.operator}\`,operatorIdentity:\`http\://127.0.0.1:${ports.operator}/\_\_operator/ready\`};let currentComponent='LOCAL RUNTIME',currentLog=relative(paths.orchestrationLog);await verifyDirectoryChain(root,runtimeDir);await unlink(paths.failure).catch((error)=>{if(error?.code!=='ENOENT')throw error;});await orchestrationEvent(paths,{event:'LOCAL\_UP\_ATTEMPT\_STARTED',attemptId,attemptStartedAt,ports,...attemptOrigins});

scripts/local\_runtime.mjs-104-  try{

scripts/local\_runtime.mjs-105-    const existing=await localStatus({runtimeDir,ports,print\:false});let manifest=null;if(existing.state==='READY'){manifest=await buildReleaseManifest();if(existing.pointer?.releaseId===manifest.releaseId){const access=await protectedSecret(paths.operatorAccessToken),url=\`http\://127.0.0.1:${ports.operator}/?admission=${encodeURIComponent(createOneTimeAdmission(access))}\`;await orchestrationEvent(paths,{event:'LOCAL\_UP\_REUSED',attemptId,releaseId\:manifest.releaseId});if(print)console.log(\`VIGIA LOCAL READY\n\n${url}\`);return{...existing,url,reused\:true,attemptId};}}

scripts/local\_runtime.mjs-106-    if(existing.pointer)await localDown({runtimeDir,ports,print\:false});for(const[name,port]of Object.entries(ports)){const listeners=await listenerPids(port);if(listeners.length){currentComponent=name.toUpperCase();const value=await startupFailure(paths,{attemptId,attemptStartedAt,component\:currentComponent,state:'LISTENER\_OWNERSHIP\_FAILED',cause:\`Port ${port} is already listening with unmanaged PID ${listeners.join(', ')}.\`,remediation:'Stop the stale repository runtime through its owning session, then rerun npm run local\:up.',log\:currentLog});throw new Error(failureMessage(value));}}

scripts/local\_runtime.mjs-107-    currentComponent='POSTGIS';let database=await runDbDoctor();if(database.classification!=='READY'){await command(process.execPath,['scripts/db\_up.mjs'],{timeout:240\_000});database=await runDbDoctor();}if(database.classification!=='READY')throw new Error(\`POSTGIS STARTUP FAILED:${database.classification}\`);

scripts/local\_runtime.mjs:108:    currentComponent='CANONICAL RUNTIME DATA';const fieldNetScope=await resolveCanonicalFieldNetScope({retainedScopeFile\:paths.retainedScope});let canonicalIndex=fieldNetScope.index;

scripts/local\_runtime.mjs:109:    currentComponent='FIELDNET SCOPE';const governedIncidentId=fieldNetScope.incidentId;

scripts/local\_runtime.mjs-110-    const databaseUrl=await resolveLocalDatabaseUrl();manifest??=await buildReleaseManifest();const apiOrigin=\`http\://127.0.0.1:${ports.api}\`,fieldOrigin=\`http\://127.0.0.1:${ports.fieldnet}\`,operatorOrigin=\`http\://127.0.0.1:${ports.operator}\`,controlToken=randomBytes(32).toString('base64url'),operatorToken=randomBytes(32).toString('base64url'),operatorAccessToken=randomBytes(32).toString('base64url'),fieldControlKey=randomBytes(32).toString('base64url'),fieldNodeKey=randomBytes(32).toString('base64url');

scripts/local\_runtime.mjs-111-    await orchestrationEvent(paths,{event:'CANONICAL\_PROBE\_ORIGINS',attemptId,backend\:apiOrigin,backendHealth:\`${apiOrigin}/api/v10/health\`,fieldnet\:fieldOrigin,operator\:operatorOrigin,operatorIdentity:\`${operatorOrigin}/\_\_operator/ready\`});

scripts/local\_runtime.mjs-112-    if(operatorToken===operatorAccessToken)throw new Error('local\_operator\_credentials\_must\_be\_distinct');

scripts/local\_runtime.mjs-113-    const secretsFile=process.env.VIGIA\_SECRETS\_FILE??path.join(process.env.HOME??'', '.config/vigia/secrets.env'),releaseEnv={VIGIA\_DATABASE\_URL\:databaseUrl,HOST:'127.0.0.1',OPEN\_BROWSER:'0',REQUEST\_TIMEOUT\_MS:'12000',VIGIA\_RUNTIME\_PROFILE:'local\_shadow',VIGIA\_LOCAL\_OPERATOR\_AUTOLOGIN:'1',VIGIA\_OPERATOR\_CONSOLE\_ORIGIN\:operatorOrigin,NODE\_ENV:'development',VIGIA\_RELEASE\_ID\:manifest.releaseId,VIGIA\_CODE\_STATE\_HASH\:manifest.codeStateHash,VIGIA\_OPERATIONAL\_DATA\_HASH\:manifest.operationalDataHash,VIGIA\_APPROVED\_RELEASE\_STATEMENT\_SHA256\:manifest.releaseStatementHash,VIGIA\_OPERATOR\_TOKEN\:operatorToken,VIGIA\_SECRETS\_FILE\:secretsFile};

scripts/local\_runtime.mjs-114-    const config=loadConfig({...process.env,...releaseEnv,PORT\:String(ports.api)}),protectedState={firms\:Boolean(config.firmsMapKey),cdse\:Boolean(config.cdseAccessToken||(config.cdseUsername&&config.cdsePassword)),earthdata\:Boolean(config.earthdataToken)};if(!Object.values(protectedState).every(Boolean))throw new Error(\`protected\_configuration\_incomplete\:FIRMS=${protectedState.firms}\:CDSE=${protectedState.cdse}\:EARTHDATA=${protectedState.earthdata}\`);

scripts/local\_runtime.mjs-115-    await Promise.all([writeSecret(paths.controlToken,controlToken),writeSecret(paths.operatorToken,operatorToken),writeSecret(paths.operatorAccessToken,operatorAccessToken)]);

scripts/local\_runtime.mjs-116-    const fieldNodeId=\`field-node\:local:${manifest.releaseId}\`,registry=JSON.stringify({[fieldNodeId]:{key\:fieldNodeKey,incidentIds:[governedIncidentId],capabilities:['fieldnet\:sync','fieldnet\:command-survival'],status:'active'}}),pointer={schemaVersion:'vigia.local-runtime.v2',state:'STARTING',attemptId,attemptStartedAt,certification:'LOCAL\_REHEARSAL\_UNSEALED',releaseId\:manifest.releaseId,codeStateHash\:manifest.codeStateHash,operationalDataHash\:manifest.operationalDataHash,releaseStatementHash\:manifest.releaseStatementHash,projectionFingerprint\:canonicalIndex.projectionFingerprint,incidentCount\:canonicalIndex.incidentCount,ports,governedFieldNetIncidentId\:governedIncidentId,startedAt\:new Date().toISOString(),components:{}};await atomicWriteNoFollow(paths.pointer,\`${JSON.stringify(pointer,null,2)}\n\`,{root,mode:0o600});

scripts/local\_runtime.mjs-117-    const savePointer=()=>atomicWriteNoFollow(paths.pointer,\`${JSON.stringify(pointer,null,2)}\n\`,{root,mode:0o600});

scripts/local\_runtime.mjs-118-    currentComponent='CENTRAL API';const apiEnv={...process.env,...releaseEnv,PORT\:String(ports.api),VIGIA\_FIELDNET\_NODE\_REGISTRY\_JSON\:registry};pointer.components.api=await startSupervised({runtimeDir,name:'api',entry:'apps/api/src/server.mjs',env\:apiEnv,controlTokenFile\:paths.controlToken});currentLog=relative(pointer.components.api.log);await savePointer();

scripts/local\_runtime.mjs-119-    const apiReady=await waitUntil(async()=>{const [release,health]=await Promise.all([fetchJson(\`${apiOrigin}/api/v10/release\`),fetchJson(\`${apiOrigin}/api/v10/health\`)]),startup=health.body?.startup??null;if(release.body?.process?.startup?.state==='failed')return{ready\:false,terminal\:true,error:\`${release.body.process.startup.error??'unknown\_startup\_failure'}\:phase=${startup?.phase??'unknown'}\`,releaseUrl\:release.url,healthUrl\:health.url};return{ready\:release.ok&&health.ok&&releaseMatches(release.body,manifest)&&release.body?.process?.servicesReady===true&&startup?.ready===true,release:{ok\:release.ok,status\:release.status,url\:release.url},health:{ok\:health.ok,status\:health.status,url\:health.url,startupReady\:startup?.ready===true,phase\:startup?.phase??null,lastCompletedPhase\:startup?.lastCompletedPhase??null}};},{timeoutMs\:localApiStartupTimeoutMs,intervalMs:500,label:'central\_api\_services'});await orchestrationEvent(paths,{event:'BACKEND\_READY',attemptId,releaseProbe\:apiReady.release,healthProbe\:apiReady.health});

scripts/local\_runtime.mjs:120:    currentComponent='CANONICAL RUNTIME DATA';canonicalIndex=await readRequiredJson(canonicalIncidentIndexFile,{root,maxBytes\:CANONICAL\_INCIDENT\_INDEX\_MAX\_BYTES,label:'canonical\_incident\_index\_artifact',validate\:assertCanonicalIncidentIndex});if(!canonicalIndex.incidents.some((incident)=>incident.id===governedIncidentId)){currentComponent='FIELDNET SCOPE';throw new Error('canonical\_fieldnet\_incident\_scope\_no\_longer\_retained');}const projection=await waitUntil(async()=>canonicalStartupSummary({apiOrigin,operatorOrigin,releaseId\:manifest.releaseId,operatorToken,expectedProjectionFingerprint\:canonicalIndex.projectionFingerprint,expectedIncidentCount\:canonicalIndex.incidentCount}),{timeoutMs:60\_000,label:'canonical\_startup\_summary'});pointer.projectionFingerprint=canonicalIndex.projectionFingerprint;pointer.incidentCount=canonicalIndex.incidentCount;await savePointer();

scripts/local\_runtime.mjs-121-    currentComponent='FIELDNET';const fieldEnv={PATH\:process.env.PATH??'/usr/bin:/bin',LANG\:process.env.LANG??'C.UTF-8',TZ\:process.env.TZ??'UTC',NODE\_ENV:'development',VIGIA\_RUNTIME\_PROFILE:'local\_shadow',VIGIA\_RELEASE\_ID\:manifest.releaseId,VIGIA\_CODE\_STATE\_HASH\:manifest.codeStateHash,VIGIA\_OPERATIONAL\_DATA\_HASH\:manifest.operationalDataHash,VIGIA\_APPROVED\_RELEASE\_STATEMENT\_SHA256\:manifest.releaseStatementHash,FIELDNET\_CONTROL\_KEY\:fieldControlKey,FIELDNET\_CONTROL\_KEY\_ID:'field-operator',FIELDNET\_CONTROL\_SOCKET\:path.join(runtimeDir,'fn.sock'),FIELDNET\_CONTROL\_INCIDENT\_SCOPES\:governedIncidentId,FIELDNET\_NODE\_KEY\:fieldNodeKey,FIELDNET\_PORT\:String(ports.fieldnet),FIELDNET\_HOST:'127.0.0.1',FIELDNET\_NODE\_ID\:fieldNodeId,FIELDNET\_CENTRAL\_URL:\`${apiOrigin}/api/v10\`,FIELDNET\_DB\_PATH\:path.join(runtimeDir,\`fieldnet-${manifest.releaseId}.sqlite\`),FIELDNET\_REQUEST\_TIMEOUT\_MS:'5000'};

scripts/local\_runtime.mjs-122-    pointer.components.fieldnet=await startSupervised({runtimeDir,name:'fieldnet',entry:'apps/field-node/src/server.mjs',env\:fieldEnv,controlTokenFile\:paths.controlToken});currentLog=relative(pointer.components.fieldnet.log);await savePointer();await waitUntil(async()=>{const release=await fetchJson(\`${fieldOrigin}/api/fieldnet/release\`),health=await fetchJson(\`${fieldOrigin}/health\`);return{ready\:release.ok&&health.ok&&releaseMatches(release.body,manifest),release:{ok\:release.ok,status\:release.status,url\:release.url},health:{ok\:health.ok,status\:health.status,url\:health.url}};},{timeoutMs:20\_000,label:'fieldnet'});

scripts/local\_runtime.mjs-123-    currentComponent='OPERATOR';await command(process.execPath,['apps/operator-console/scripts/build.mjs'],{env\:releaseEnv,timeout:180\_000});const operatorEnv={PATH\:process.env.PATH??'/usr/bin:/bin',LANG\:process.env.LANG??'C.UTF-8',TZ\:process.env.TZ??'UTC',HOST:'127.0.0.1',PORT\:String(ports.operator),VIGIA\_OPERATOR\_PUBLIC\_AUTHORITY:\`127.0.0.1:${ports.operator}\`,VIGIA\_BACKEND\_URL\:apiOrigin,VIGIA\_OPERATOR\_STATIC\_ROOT:'dist',VIGIA\_OPERATOR\_PROXY\_KEY\:operatorToken,VIGIA\_OPERATOR\_ACCESS\_TOKEN\:operatorAccessToken,VIGIA\_RELEASE\_ID\:manifest.releaseId,VIGIA\_CODE\_STATE\_HASH\:manifest.codeStateHash,VIGIA\_OPERATIONAL\_DATA\_HASH\:manifest.operationalDataHash,VIGIA\_APPROVED\_RELEASE\_STATEMENT\_SHA256\:manifest.releaseStatementHash};

scripts/local\_runtime.mjs-124-    pointer.components.operator=await startSupervised({runtimeDir,name:'operator',entry:'apps/operator-console/server.mjs',cwd:'apps/operator-console',env\:operatorEnv,controlTokenFile\:paths.controlToken});currentLog=relative(pointer.components.operator.log);await savePointer();const operatorReady=await waitUntil(async()=>{const probe=await fetchJson(\`${operatorOrigin}/\_\_operator/ready\`);return{ready\:probe.ok&&probe.body?.ok===true&&probe.body?.frontend==='operator-console'&&releaseMatches(probe.body,manifest),operator:{ok\:probe.ok,status\:probe.status,url\:probe.url,error\:probe.error??null,frontend\:probe.body?.frontend??null,releaseId\:probe.body?.releaseId??null}};},{timeoutMs:30\_000,label:'operator'});await orchestrationEvent(paths,{event:'OPERATOR\_READY',attemptId,probe\:operatorReady.operator});

scripts/local\_runtime.mjs-125-    await atomicWriteNoFollow(paths.operatorPointer,\`${JSON.stringify({schemaVersion:'vigia.operator-runtime-pointer.v1',origin\:operatorOrigin,port\:ports.operator,pid\:pointer.components.operator.childPid,releaseId\:manifest.releaseId,updatedAt\:new Date().toISOString()})}\n\`,{root,mode:0o600});await atomicWriteNoFollow(paths.retainedScope,\`${JSON.stringify({schemaVersion:'vigia.fieldnet-retained-scope.v1',incidentId\:governedIncidentId,projectionFingerprint\:canonicalIndex.projectionFingerprint,selectedAt\:new Date().toISOString()},null,2)}\n\`,{root,mode:0o600});pointer.state='READY';pointer.readyAt=new Date().toISOString();pointer.incidentCount=projection.count;pointer.commandSummaryBytes=projection.responseBytes;await savePointer();await unlink(paths.failure).catch(()=>undefined);await orchestrationEvent(paths,{event:'LOCAL\_UP\_READY',attemptId,releaseId\:manifest.releaseId,incidents\:projection.count,commandSummaryBytes\:projection.responseBytes});

scripts/local\_runtime.mjs-126-    const url=\`${operatorOrigin}/?admission=${encodeURIComponent(createOneTimeAdmission(operatorAccessToken))}\`,result={state:'READY',releaseId\:manifest.releaseId,certification:'LOCAL\_REHEARSAL\_UNSEALED',incidents\:projection.count,governedFieldNetIncidentId\:governedIncidentId,url,components\:pointer.components,apiReady,operatorReady,attemptId};if(print)console.log(\`VIGIA LOCAL READY\n\nDatabase       READY\nCentral API    READY\nFieldNet       READY\nOperator       READY\nRelease        ${manifest.releaseId}\nIncidents      ${projection.count}\nCertification  LOCAL\_REHEARSAL\_UNSEALED\n\n${url}\`);return result;

scripts/local\_runtime.mjs-127-  }catch(error){

scripts/local\_runtime.mjs-128-    const message=String(error?.message??error).replace(/postgres(?\:ql)?:\\/\\/[^\s/@:]+(?::[^\s/@]\*)?@/gi,'postgresql://[REDACTED]@').replace(/\b(?\:Bearer|Basic)\s+[A-Za-z0-9.\_\~+/=-]+/gi,'[REDACTED CREDENTIAL]').replace(/([?&]admission=)[^&\s]+/gi,'$1[REDACTED]').slice(0,4\_000);let failure;try{failure=await optionalJson(paths.failure,'local\_runtime\_failure\_descriptor');}catch(failureReadError){failure=await startupFailure(paths,{attemptId,attemptStartedAt,component\:currentComponent,state:'STARTUP\_FAILED',cause:\`${message}; failure\_descriptor\_read\_failed:${String(failureReadError?.message??failureReadError)}\`,remediation:'Inspect the bounded component and orchestration logs for this exact attempt; the invalid failure descriptor was atomically replaced.',log\:currentLog});}if(failure?.attemptId!==attemptId)failure=await startupFailure(paths,{attemptId,attemptStartedAt,component\:currentComponent,state:'STARTUP\_FAILED',cause\:message,remediation:'Inspect the bounded component and orchestration logs for this exact attempt; downstream services were stopped safely.',log\:currentLog});await orchestrationEvent(paths,{event:'LOCAL\_UP\_FAILED',attemptId,component\:currentComponent,error\:message,log\:currentLog}).catch(()=>undefined);await localDown({runtimeDir,ports,print\:false,preserveFailure\:true}).catch(()=>undefined);throw new Error(failureMessage(failure));

scripts/local\_runtime.mjs-129-  }

scripts/local\_runtime.mjs-130-}

scripts/local\_runtime.mjs-131-

scripts/local\_runtime.mjs-132-export async function localOpen({runtimeDir=defaultRuntimeDir,ports=defaultPorts,open,print=true}={}){const status=await localStatus({runtimeDir,ports,print\:false});if(status.state!=='READY')throw new Error('VIGIA LOCAL NOT READY\nRun npm run local\:up first.');const result=await operatorOpen({open});if(result.origin!==\`http\://127.0.0.1:${ports.operator}\`||result.releaseId!==status.pointer.releaseId)throw new Error('local\_open\_runtime\_identity\_mismatch');if(print)console.log(\`VIGIA LOCAL OPENED\n${result.origin}/#/command-overview\`);return result;}

scripts/local\_runtime.mjs-133-

scripts/local\_runtime.mjs:134\:export async function localCrashComponentForTest(name,{runtimeDir=defaultRuntimeDir,ports=defaultPorts}={}){if(!['api','fieldnet','operator'].includes(name))throw new Error('local\_runtime\_test\_component\_invalid');const paths=runtimePaths(runtimeDir),pointer=await readRequiredJson(paths.pointer,{root,maxBytes\:LOCAL\_RUNTIME\_DESCRIPTOR\_MAX\_BYTES,label:'local\_runtime\_pointer',validate\:runtimePointerSchema}),component=pointer?.components?.[name];if(!component)throw new Error('local\_runtime\_test\_component\_not\_running');await supervisorRequest(component,await protectedSecret(paths.controlToken),'crash');await waitPortFree(ports[name]);return{state:'CRASHED',name};}

scripts/local\_runtime.mjs-135-

scripts/local\_runtime.mjs-136-if(path.resolve(process.argv[1]??'')===fileURLToPath(import.meta.url)){

scripts/local\_runtime.mjs-137-  const action=process.argv[2]??'status';try{if(action==='up')await localUp();else if(action==='status')await localStatus();else if(action==='down')await localDown();else if(action==='open')await localOpen();else throw new Error(\`unknown\_local\_runtime\_action:${action}\`);}catch(error){console.error(\`LOCAL RUNTIME FAILED\n\n${String(error?.message??error)}\`);process.exitCode=1;}

scripts/local\_runtime.mjs-138-}

\--

packages/domain/src/event-fabric/canonical-incident-index.mjs-1-import { createHash } from 'node\:crypto';

packages/domain/src/event-fabric/canonical-incident-index.mjs-2-

packages/domain/src/event-fabric/canonical-incident-index.mjs:3\:export const CANONICAL\_INCIDENT\_INDEX\_SCHEMA = 'vigia.canonical-incident-index.v1';

packages/domain/src/event-fabric/canonical-incident-index.mjs-4-export const CANONICAL\_INCIDENT\_ID\_PATTERN = /^PT-[A-Z0-9-]+$/;

packages/domain/src/event-fabric/canonical-incident-index.mjs-5-

packages/domain/src/event-fabric/canonical-incident-index.mjs-6-const text = (value) => {

packages/domain/src/event-fabric/canonical-incident-index.mjs-7-  const normalized = String(value ?? '').trim();

packages/domain/src/event-fabric/canonical-incident-index.mjs-8-  return normalized || null;

packages/domain/src/event-fabric/canonical-incident-index.mjs-9-};

packages/domain/src/event-fabric/canonical-incident-index.mjs-10-

packages/domain/src/event-fabric/canonical-incident-index.mjs-11-const projectionMaterial = (projection = {}) => {

\--

packages/domain/src/event-fabric/canonical-incident-index.mjs-50-    sourceEventCount: sourceEvents.length,

packages/domain/src/event-fabric/canonical-incident-index.mjs-51-    excludedNonCanonicalEventCount: sourceEvents.length - incidents.length,

packages/domain/src/event-fabric/canonical-incident-index.mjs-52-    incidentCount: incidents.length,

packages/domain/src/event-fabric/canonical-incident-index.mjs-53-    incidents,

packages/domain/src/event-fabric/canonical-incident-index.mjs-54-  });

packages/domain/src/event-fabric/canonical-incident-index.mjs-55-}

packages/domain/src/event-fabric/canonical-incident-index.mjs-56-

packages/domain/src/event-fabric/canonical-incident-index.mjs-57-export function assertCanonicalIncidentIndex(value) {

packages/domain/src/event-fabric/canonical-incident-index.mjs:58:  if (!value || value.schemaVersion !== CANONICAL\_INCIDENT\_INDEX\_SCHEMA) throw new Error('canonical\_incident\_index\_schema\_invalid');

packages/domain/src/event-fabric/canonical-incident-index.mjs:59:  if (!Number.isFinite(Date.parse(value.generatedAt ?? ''))) throw new Error('canonical\_incident\_index\_generated\_at\_invalid');

packages/domain/src/event-fabric/canonical-incident-index.mjs:60:  if (!/^sha256:[a-f0-9]{64}$/.test(String(value.projectionFingerprint ?? ''))) throw new Error('canonical\_incident\_index\_projection\_fingerprint\_invalid');

packages/domain/src/event-fabric/canonical-incident-index.mjs:61:  if (!Number.isInteger(value.incidentCount) || value.incidentCount < 0 || !Array.isArray(value.incidents) || value.incidents.length !== value.incidentCount) throw new Error('canonical\_incident\_index\_count\_invalid');

packages/domain/src/event-fabric/canonical-incident-index.mjs:62:  if (!Number.isInteger(value.sourceEventCount) || value.sourceEventCount < value.incidentCount || value.excludedNonCanonicalEventCount !== value.sourceEventCount - value.incidentCount) throw new Error('canonical\_incident\_index\_source\_count\_invalid');

packages/domain/src/event-fabric/canonical-incident-index.mjs-63-  const ids = value.incidents.map((incident) => String(incident?.id ?? ''));

packages/domain/src/event-fabric/canonical-incident-index.mjs:64:  if (ids.some((id) => !CANONICAL\_INCIDENT\_ID\_PATTERN.test(id))) throw new Error('canonical\_incident\_index\_incident\_id\_invalid');

packages/domain/src/event-fabric/canonical-incident-index.mjs:65:  if (new Set(ids).size !== ids.length) throw new Error('canonical\_incident\_index\_incident\_id\_duplicate');

packages/domain/src/event-fabric/canonical-incident-index.mjs:66:  if (ids.some((id, index) => index > 0 && ids[index - 1].localeCompare(id) >= 0)) throw new Error('canonical\_incident\_index\_order\_invalid');

packages/domain/src/event-fabric/canonical-incident-index.mjs-67-  return value;

packages/domain/src/event-fabric/canonical-incident-index.mjs-68-}

packages/domain/src/event-fabric/canonical-incident-index.mjs-69-

packages/domain/src/event-fabric/canonical-incident-index.mjs-70-export function selectCanonicalFieldNetIncident(index, { priorIncidentId = null } = {}) {

packages/domain/src/event-fabric/canonical-incident-index.mjs-71-  const validated = assertCanonicalIncidentIndex(index);

packages/domain/src/event-fabric/canonical-incident-index.mjs-72-  const available = new Set(validated.incidents.map((incident) => incident.id));

packages/domain/src/event-fabric/canonical-incident-index.mjs-73-  const retained = text(priorIncidentId);

packages/domain/src/event-fabric/canonical-incident-index.mjs-74-  if (retained && available.has(retained)) return retained;

\--

apps/api/src/modules/intelligence/append-only-event-journal.mjs-8-function checksum(record) { const { checksumSha256, ...core } = record; return semanticHash('journal-record', core); }

apps/api/src/modules/intelligence/append-only-event-journal.mjs-9-function providerKey(event) { return [event.provider.adapterId, event.provider.providerEventId, event.provider.providerRevision ?? '', event.action, event.targetEventId ?? ''].join('|'); }

apps/api/src/modules/intelligence/append-only-event-journal.mjs-10-function parseJournal(body) {

apps/api/src/modules/intelligence/append-only-event-journal.mjs-11-  const records = [], diagnostics = [];

apps/api/src/modules/intelligence/append-only-event-journal.mjs-12-  for (const [index, line] of body.split('\n').entries()) {

apps/api/src/modules/intelligence/append-only-event-journal.mjs-13-    if (!line.trim()) continue;

apps/api/src/modules/intelligence/append-only-event-journal.mjs-14-    try {

apps/api/src/modules/intelligence/append-only-event-journal.mjs-15-      const record = JSON.parse(line);

apps/api/src/modules/intelligence/append-only-event-journal.mjs:16:      if (record.schemaVersion !== RECORD\_SCHEMA || record.checksumSha256 !== checksum(record)) diagnostics.push({ line: index + 1, code: 'JOURNAL\_CHECKSUM\_OR\_SCHEMA\_INVALID' });

apps/api/src/modules/intelligence/append-only-event-journal.mjs-17-      else records.push(record);

apps/api/src/modules/intelligence/append-only-event-journal.mjs-18-    } catch { diagnostics.push({ line: index + 1, code: index === body.split('\n').length - 1 ? 'TORN\_FINAL\_RECORD' : 'INVALID\_JOURNAL\_RECORD' }); }

apps/api/src/modules/intelligence/append-only-event-journal.mjs-19-  }

apps/api/src/modules/intelligence/append-only-event-journal.mjs-20-  records.sort((left, right) => left.sequence - right.sequence);

apps/api/src/modules/intelligence/append-only-event-journal.mjs-21-  return { records, diagnostics };

apps/api/src/modules/intelligence/append-only-event-journal.mjs-22-}

apps/api/src/modules/intelligence/append-only-event-journal.mjs-23-

apps/api/src/modules/intelligence/append-only-event-journal.mjs-24-export class AppendOnlyOperationalEventJournal {

\--

apps/api/test/local-runtime-artifact-bounds.test.mjs-1-import assert from 'node\:assert/strict';

apps/api/test/local-runtime-artifact-bounds.test.mjs-2-import { mkdir, mkdtemp, readFile, rm, truncate, writeFile } from 'node\:fs/promises';

apps/api/test/local-runtime-artifact-bounds.test.mjs-3-import path from 'node\:path';

apps/api/test/local-runtime-artifact-bounds.test.mjs-4-import test from 'node\:test';

apps/api/test/local-runtime-artifact-bounds.test.mjs-5-import { fileURLToPath } from 'node\:url';

apps/api/test/local-runtime-artifact-bounds.test.mjs:6\:import { buildCanonicalIncidentIndex, selectCanonicalFieldNetIncident } from '../../../packages/domain/src/event-fabric/canonical-incident-index.mjs';

**VIGIA Integration** on ** integration/vigia-world-class-convergence** **[!?]** via ** v26.0.0 **

**❯** >....                                                                         

curl -fsS http\://127.0.0.1:4188/api/fieldnet/release |

  python3 -m json.tool

echo

echo "===== OPERATOR ====="

curl -fsS http\://127.0.0.1:4190/\_\_operator/ready |

  python3 -m json.tool

echo

echo "===== MANIFEST ====="

python3 - <<'PY'

import json

x = json.load(open("data/validation/release/current-release-manifest.json"))

print("releaseId:", x.get("releaseId"))

print("codeStateHash:", x.get("codeStateHash"))

print("operationalDataHash:", x.get("operationalDataHash"))

print("releaseStatementHash:", x.get("releaseStatementHash"))

PY

\===== API =====

{

    **"schemaVersion"**: "vigia.release-identity.v1",

    **"state"**: "LOCAL\_REHEARSAL\_UNSEALED",

    **"component"**: "api",

    **"releaseId"**: "vigia-intelligence-fabric-5ed3541f7fcbcc00",

    **"codeStateHash"**: "sha256\:f96a0eff51ab052ba8aa5037dfaece0d7fa4104c87e15f14cd7d40ff062aef80",

    **"operationalDataHash"**: "sha256:09514b1ba2f2fff31a241e99ebbf6a00cdb4f0732f35283aec80c3228c9da344",

    **"releaseStatementHash"**: "sha256:8743f8b32ab455857852874b8c0f1973f1436f83e39f621b66bfa2b694a1a26b",

    **"buildTimestamp"**: "2026-09-03T07:44:26.756Z",

    **"contracts"**: {

        **"apiContractVersion"**: "vigia-api-v10.5",

        **"operationsApiVersion"**: "operations-api-v6",

        **"validationApiVersion"**: "validation-api-v8",

        **"fieldNodeContractVersion"**: "fieldnet-api-v5",

        **"databaseSchemaVersion"**: "vigia-postgis-022",

        **"migrationHead"**: "022",

        **"domainSchemaVersion"**: "vigia-domain-v10.5",

        **"webContractVersion"**: "decision-os-web-v1",

        **"ontologyContractVersion"**: "vigia.crisis-ontology.v1",

        **"intelligenceRuleSetVersion"**: "vigia.intelligence-rules.v1:83ec995872f1245d"

    },

    **"webBuildVersion"**: "decision-os-web-v1+5ed3541f",

    **"databaseSchemaVersion"**: "vigia-postgis-022",

    **"migrationHead"**: "022",

    **"domainSchemaVersion"**: "vigia-domain-v10.5",

    **"ontologyContractVersion"**: "vigia.crisis-ontology.v1",

    **"intelligenceRuleSetVersion"**: "vigia.intelligence-rules.v1:83ec995872f1245d",

    **"runtimeProfile"**: "local\_shadow",

    **"requiredContracts"**: {

        **"apiContractVersion"**: "vigia-api-v10.5",

        **"operationsApiVersion"**: "operations-api-v6",

        **"validationApiVersion"**: "validation-api-v8",

        **"fieldNodeContractVersion"**: "fieldnet-api-v5",

        **"databaseSchemaVersion"**: "vigia-postgis-022",

        **"domainSchemaVersion"**: "vigia-domain-v10.5",

        **"ontologyContractVersion"**: "vigia.crisis-ontology.v1",

        **"intelligenceRuleSetVersion"**: "vigia.intelligence-rules.v1:83ec995872f1245d"

    },

    **"process"**: {

        **"startedAt"**: "2026-09-03T07:44:37.703Z",

        **"servicesReady"**: **true**,

        **"startup"**: {

            **"state"**: "services\_ready",

            **"ready"**: **true**,

            **"servicesReadyAt"**: "2026-09-03T07:44:37.706Z"

        }

    },

    **"schema"**: {

        **"certification"**: {

            **"state"**: "PENDING"

        },

        **"databaseSchemaVersion"**: "vigia-postgis-022",

        **"migrationHead"**: "022",

        **"deploymentIdentity"**: {

            **"state"**: "ready",

            **"releaseId"**: "vigia-intelligence-fabric-5ed3541f7fcbcc00",

            **"codeStateHash"**: "sha256\:f96a0eff51ab052ba8aa5037dfaece0d7fa4104c87e15f14cd7d40ff062aef80",

            **"operationalDataHash"**: "sha256:09514b1ba2f2fff31a241e99ebbf6a00cdb4f0732f35283aec80c3228c9da344",

            **"releaseStatementHash"**: "sha256:8743f8b32ab455857852874b8c0f1973f1436f83e39f621b66bfa2b694a1a26b",

            **"migrationHead"**: "022",

            **"recordedAt"**: "2026-09-03T07:44:30.968Z"

        }

    },

    **"routeCertification"**: {

        **"state"**: "PENDING"

    },

    **"sessionCertification"**: {

        **"state"**: "PENDING",

        **"checkedAt"**: **null**,

        **"reloadPersistent"**: **false**,

        **"contradictions"**: 0,

        **"evidence"**: **null**

    },

    **"manifestEvidenceHash"**: "sha256:391436a5f66cc83176b3ae91fb8f7841ef90ee849bd39bb2688962676faf36c0"

}

\===== FIELDNET =====

{

    **"schemaVersion"**: "vigia.release-identity.v1",

    **"state"**: "LOCAL\_REHEARSAL\_UNSEALED",

    **"component"**: "fieldnode",

    **"releaseId"**: "vigia-intelligence-fabric-5ed3541f7fcbcc00",

    **"codeStateHash"**: "sha256\:f96a0eff51ab052ba8aa5037dfaece0d7fa4104c87e15f14cd7d40ff062aef80",

    **"operationalDataHash"**: "sha256:09514b1ba2f2fff31a241e99ebbf6a00cdb4f0732f35283aec80c3228c9da344",

    **"releaseStatementHash"**: "sha256:8743f8b32ab455857852874b8c0f1973f1436f83e39f621b66bfa2b694a1a26b",

    **"buildTimestamp"**: "2026-09-03T07:44:26.756Z",

    **"contracts"**: {

        **"apiContractVersion"**: "vigia-api-v10.5",

        **"operationsApiVersion"**: "operations-api-v6",

        **"validationApiVersion"**: "validation-api-v8",

        **"fieldNodeContractVersion"**: "fieldnet-api-v5",

        **"databaseSchemaVersion"**: "vigia-postgis-022",

        **"migrationHead"**: "022",

        **"domainSchemaVersion"**: "vigia-domain-v10.5",

        **"webContractVersion"**: "decision-os-web-v1",

        **"ontologyContractVersion"**: "vigia.crisis-ontology.v1",

        **"intelligenceRuleSetVersion"**: "vigia.intelligence-rules.v1:83ec995872f1245d"

    },

    **"webBuildVersion"**: "decision-os-web-v1+5ed3541f",

    **"databaseSchemaVersion"**: "vigia-postgis-022",

    **"migrationHead"**: "022",

    **"domainSchemaVersion"**: "vigia-domain-v10.5",

    **"ontologyContractVersion"**: "vigia.crisis-ontology.v1",

    **"intelligenceRuleSetVersion"**: "vigia.intelligence-rules.v1:83ec995872f1245d",

    **"runtimeProfile"**: "local\_shadow",

    **"requiredContracts"**: {

        **"apiContractVersion"**: "vigia-api-v10.5",

        **"operationsApiVersion"**: "operations-api-v6",

        **"validationApiVersion"**: "validation-api-v8",

        **"fieldNodeContractVersion"**: "fieldnet-api-v5",

        **"databaseSchemaVersion"**: "vigia-postgis-022",

        **"domainSchemaVersion"**: "vigia-domain-v10.5",

        **"ontologyContractVersion"**: "vigia.crisis-ontology.v1",

        **"intelligenceRuleSetVersion"**: "vigia.intelligence-rules.v1:83ec995872f1245d"

    },

    **"process"**: {

        **"startedAt"**: **null**,

        **"servicesReady"**: **false**,

        **"startup"**: {

            **"state"**: "loading",

            **"ready"**: **false**,

            **"servicesReadyAt"**: **null**

        }

    },

    **"schema"**: {

        **"certification"**: {

            **"state"**: "PENDING"

        },

        **"databaseSchemaVersion"**: "vigia-postgis-022",

        **"migrationHead"**: "022",

        **"deploymentIdentity"**: {

            **"state"**: "unavailable"

        }

    },

    **"routeCertification"**: {

        **"state"**: "PENDING"

    },

    **"sessionCertification"**: {

        **"state"**: "PENDING",

        **"checkedAt"**: **null**,

        **"reloadPersistent"**: **false**,

        **"contradictions"**: 0,

        **"evidence"**: **null**

    },

    **"manifestEvidenceHash"**: "sha256:391436a5f66cc83176b3ae91fb8f7841ef90ee849bd39bb2688962676faf36c0"

}

\===== OPERATOR =====

{

    **"ok"**: **true**,

    **"frontend"**: "operator-console",

    **"path"**: "apps/operator-console",

    **"version"**: "2.1.0",

    **"releaseId"**: "vigia-intelligence-fabric-5ed3541f7fcbcc00",

    **"codeStateHash"**: "sha256\:f96a0eff51ab052ba8aa5037dfaece0d7fa4104c87e15f14cd7d40ff062aef80",

    **"operationalDataHash"**: "sha256:09514b1ba2f2fff31a241e99ebbf6a00cdb4f0732f35283aec80c3228c9da344",

    **"releaseStatementHash"**: "sha256:8743f8b32ab455857852874b8c0f1973f1436f83e39f621b66bfa2b694a1a26b",

    **"sourceHash"**: "sha256:3ed002dcae92b94e5118bb905e7e676a6a3d481336016a55b0dd33d64f0a1695",

    **"assetDigest"**: "sha256\:a9ee6e69b593b8dfede6755c6d74a45f3faadea167144ee4114f9e2dedfccce1",

    **"servedAssetFiles"**: 62,

    **"servedAssetBytes"**: 2059829

}

\===== MANIFEST =====

releaseId: vigia-intelligence-fabric-5ed3541f7fcbcc00

codeStateHash: sha256\:f96a0eff51ab052ba8aa5037dfaece0d7fa4104c87e15f14cd7d40ff062aef80

operationalDataHash: sha256:09514b1ba2f2fff31a241e99ebbf6a00cdb4f0732f35283aec80c3228c9da344

releaseStatementHash: sha256:8743f8b32ab455857852874b8c0f1973f1436f83e39f621b66bfa2b694a1a26b

**VIGIA Integration** on ** integration/vigia-world-class-convergence** **[!?]** via ** v26.0.0 **

**❯** python3 -m json.tool \\

  data/validation/local-runtime/runtime-artifact-bound-recovery.json |

  less

**VIGIA Integration** on ** integration/vigia-world-class-convergence** **[!?]** via ** v26.0.0** took **9s** 

**❯** npm run local\:down

time npm run local\:up

npm run local\:status

\> vigia-physical-intelligence-core\@10.0.0 local\:down

\> node scripts/local\_runtime.mjs down

VIGIA LOCAL STOPPED

\> vigia-physical-intelligence-core\@10.0.0 local\:up

\> node scripts/local\_runtime.mjs up

VIGIA LOCAL READY

Database       READY

Central API    READY

FieldNet       READY

Operator       READY

Release        vigia-intelligence-fabric-5ed3541f7fcbcc00

Incidents      173

Certification  LOCAL\_REHEARSAL\_UNSEALED

http\://127.0.0.1:4190/?admission=eyJ2IjoxLCJhdWQiOiJ2aWdpYS1vcGVyYXRvci1jb25zb2xlIiwibm9uY2UiOiIxNWQ1YjgzYTk5MTRhMjI4NDE4ZmM2YmMwYjI3ODU5YTE5NTgyZDBiNjQwYmNmNWUiLCJpYXQiOjE3ODg0MjE1NDcsImV4cCI6MTc4ODQyMTYwN30.zDq5BhU5-iagnWnrTWpMM7O-koflSfRfN38JO\_O3Y4g

npm run local\:up  4.62s user 1.92s system 37% cpu 17.619 total

\> vigia-physical-intelligence-core\@10.0.0 local\:status

\> node scripts/local\_runtime.mjs status

VIGIA LOCAL

Database       READY

Central API    READY

FieldNet       READY

Operator       READY

Release        vigia-intelligence-fabric-5ed3541f7fcbcc00

Incidents      173

Evidence       UNAVAILABLE

Operations     READY

Map            DEGRADED\_PARTIAL · 11/32 layers

Certification  LOCAL\_REHEARSAL\_UNSEALED

Open:

http\://127.0.0.1:4190/#/command-overview

**VIGIA Integration** on ** integration/vigia-world-class-convergence** **[!?]** via ** v26.0.0** took **21s** 

**❯** ls -lh .tmp/operator-console-current.json

python3 -m json.tool \\

  .tmp/operator-console-current.json

-rw-------@ 1 malmeida  staff   207B Sep  3 09:45 .tmp/operator-console-current.json

{

    **"schemaVersion"**: "vigia.operator-runtime-pointer.v1",

    **"origin"**: "http\://127.0.0.1:4190",

    **"port"**: 4190,

    **"pid"**: 12665,

    **"releaseId"**: "vigia-intelligence-fabric-5ed3541f7fcbcc00",

    **"updatedAt"**: "2026-09-03T07:45:46.891Z"

}

**VIGIA Integration** on ** integration/vigia-world-class-convergence** **[!?]** via ** v26.0.0 **

**❯** node --test \\

  apps/field-node/test/field-node.test.mjs \\

  apps/field-node/test/field-node-capacity-security.test.mjs

✔ queue-less central snapshots remain ordinary, compactable and bounded (34.023583ms)

✔ repeatable incident package projections remain ordinary and cannot consume emergency reserve (20.149584ms)

✔ restart repair preserves incident package projections as compactable ordinary history (20.797ms)

✔ ordinary task and evidence-debt revisions cannot consume the protected mutation reserve (15.384292ms)

✔ unsupported, malformed, and caller-prioritized local work consume zero emergency reserve (18.388666ms)

✔ P1 retained history cannot consume the P0 life-safety reserve and accounting survives restart (22.051125ms)

✔ P1 pending work stops at maxPending while only P0 consumes the queue reserve (18.706709ms)

✔ legacy P1 overcommit is preserved and reported without consuming P0 headroom after restart (27.1305ms)

✔ offline reports, contradiction, verification task, ack and restart are durable (34.747417ms)

✔ stale-base task mutation becomes visible conflict and priority queue defers bulk (19.682458ms)

✔ sync requires explicit acknowledgements and deduplicates inbound updates (57.272875ms)

✔ the exact incident-scoped runtime never drains another retained incident queue (15.808125ms)

✔ invalid evidence hash and identity collisions are rejected (17.664208ms)

✔ bounded queue rejects atomically instead of losing a half-written device (16.896291ms)

✔ retained mutation and history ceilings fail closed without half-written observations (24.931334ms)

✔ acknowledged low-priority mutations compact into a hash checkpoint and preserve priority reserve (12.773125ms)

✔ acknowledged protected mutations remain locally recoverable after ordinary compaction (10.712166ms)

✔ database byte quota rejects writes before capacity is exceeded (6.144542ms)

✔ sync retry exhaustion remains durable and recoverable after five attempts (21.605125ms)

✔ newer incident package adds offline geography without losing local state (8.5185ms)

✔ evidence debt is locally mutable, syncable and replayed with its verification plan (12.027ms)

✔ sensor gateway qualifies complete production enrollment and excludes exercise sensors (15.862375ms)

ℹ tests 22

ℹ suites 0

ℹ pass 22

ℹ fail 0

ℹ cancelled 0

ℹ skipped 0

ℹ todo 0

ℹ duration\_ms 447.0775

**VIGIA Integration** on ** integration/vigia-world-class-convergence** **[!?]** via ** v26.0.0 **

**❯** npm run operator\:open

\> vigia-physical-intelligence-core\@10.0.0 operator\:open

\> node scripts/operator\_open.mjs

Operator Console opened at http\://127.0.0.1:4190/#/command-overview (vigia-intelligence-fabric-5ed3541f7fcbcc00)

**VIGIA Integration** on ** integration/vigia-world-class-convergence** **[!?]** via ** v26.0.0 **

**❯** 