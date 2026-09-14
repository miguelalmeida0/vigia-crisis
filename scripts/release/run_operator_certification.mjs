import { createHash,randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { browserEvidenceMatches } from './browser_evidence.mjs';
import { destroyBrowserRuntimeSnapshot,materializeBrowserRuntime,publicBrowserRuntime } from './browser_runtime.mjs';
import { refreshReleaseStatement } from './build_release_manifest.mjs';
import { CERTIFICATION_REFERENCES,CERTIFICATION_SCOPES } from './certification_semantics.mjs';
import { bindCertificationEvidence,verifyCertificationEvidenceBindings,releaseSourceHashes } from './release_statement.mjs';
import { atomicWriteNoFollow,readFileNoFollow,verifyDirectoryChain } from './safe_artifact.mjs';
import { destroyCertificationRuntimeSnapshot,materializeCertificationRuntime } from './certification_runtime.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const releaseDir=path.join(root,'data/validation/release');
const screenshotRoot='data/validation/release/operator-console-screenshots';
const manifestFile=path.join(releaseDir,'current-release-manifest.json');
const evidenceFile=path.join(releaseDir,'running-browser-certification.json');
const digest=(value)=>`sha256:${createHash('sha256').update(value).digest('hex')}`;
const pngSignature=Buffer.from([137,80,78,71,13,10,26,10]);
const producerEnvironmentFields=Object.freeze(['HOME','LANG','LC_ALL','LC_CTYPE','TZ','USER','LOGNAME','VIGIA_BASE_URL','VIGIA_OPERATOR_URL','VIGIA_OPERATOR_ACCESS_TOKEN','VIGIA_OPERATOR_ACCESS_TOKEN_FILE','VIGIA_BROWSER_EXECUTABLE','VIGIA_BROWSER_EXECUTABLE_SHA256','VIGIA_BROWSER_PROFILE_NONCE','VIGIA_BROWSER_RUNTIME_JSON']);

export function isolatedProducerEnvironment(runtimeEnv={},runtime=null){const env={PATH:'/usr/bin:/bin:/usr/sbin:/sbin',TMPDIR:path.join(root,'.tmp/browser'),VIGIA_BROWSER_CERTIFICATION_CHANNEL:'STDIN_V1'};for(const key of producerEnvironmentFields)if(typeof runtimeEnv[key]==='string'&&runtimeEnv[key])env[key]=runtimeEnv[key];if(runtime?.pythonHome)env.PYTHONHOME=runtime.pythonHome;return env;}
export function isolatedProducerArguments(certifiedProgram,{pycachePrefix=path.join(root,'.tmp/browser','certification-pycache')}={}){return['-s','-S','-B','-P','-X',`pycache_prefix=${pycachePrefix}`,'-c',certifiedProgram];}

function runProducer({attestationKey,runNonce,producerSource,runtimeEnv,runtime}){
  return new Promise((resolve,reject)=>{
    const python=runtime.python;
    const env=isolatedProducerEnvironment(runtimeEnv,runtime);
    const filename=path.join(root,'scripts/release/operator_console_browser_smoke.py'),encodedSource=Buffer.from(producerSource,'utf8').toString('base64'),certifiedProgram=`import base64,sys\nsys.path.append(${JSON.stringify(runtime.sitePackages)})\nscope={"__file__":${JSON.stringify(filename)},"__name__":"__main__"}\nexec(compile(base64.b64decode(${JSON.stringify(encodedSource)}),scope["__file__"],"exec"),scope)`;
    const grouped=process.platform!=='win32',child=spawn(python,isolatedProducerArguments(certifiedProgram,{pycachePrefix:path.join(root,'.tmp/browser',`certification-pycache-${runNonce}`)}),{cwd:root,env,stdio:['pipe','pipe','pipe'],detached:grouped}),stdout=[],stderr=[];
    let size=0,settled=false;
    const signalTree=(signal)=>{try{if(grouped)process.kill(-child.pid,signal);else child.kill(signal);}catch(error){if(error?.code!=='ESRCH')throw error;}};
    const waitClosed=(timeout)=>new Promise((done)=>{if(child.exitCode!==null||child.signalCode!==null)return done();const timer=setTimeout(done,timeout);child.once('close',()=>{clearTimeout(timer);done();});});
    const terminateTree=async()=>{signalTree('SIGTERM');await waitClosed(5_000);if(grouped||child.exitCode===null&&child.signalCode===null){signalTree('SIGKILL');await waitClosed(5_000);}};
    const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);if(error)void terminateTree().then(()=>reject(error),reject);else resolve(result);};
    const timer=setTimeout(()=>finish(new Error('browser_certification_timeout')),240_000);
    const collect=(target)=>(chunk)=>{size+=chunk.length;if(size>64*1024*1024)return finish(new Error('browser_certification_output_too_large'));target.push(chunk);};
    child.stdout.on('data',collect(stdout));child.stderr.on('data',collect(stderr));child.on('error',finish);child.on('close',(code,signal)=>{const out=Buffer.concat(stdout).toString('utf8'),err=Buffer.concat(stderr).toString('utf8');if(code!==0)return finish(Object.assign(new Error(`browser_certification_producer_failed:${code??signal??'unknown'}`),{stdout:out,stderr:err}));finish(null,{stdout:out,stderr:err});});
    child.stdin.end(`${JSON.stringify({attestationKey,runNonce})}\n`);
  });
}

const crcTable=Array.from({length:256},(_,index)=>{let value=index;for(let bit=0;bit<8;bit+=1)value=(value&1)?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&0xff]^(crc>>>8);return(crc^0xffffffff)>>>0;}
function validatePng(bytes,relativePath){
  if(bytes.length<45||!bytes.subarray(0,8).equals(pngSignature))throw new Error(`invalid_screenshot_signature:${relativePath}`);
  let offset=8,width=null,height=null,bitDepth=null,colorType=null,interlace=null,sawIhdr=false,sawIend=false;const idat=[];
  while(offset<bytes.length){if(offset+12>bytes.length)throw new Error(`invalid_screenshot_chunk_bounds:${relativePath}`);const length=bytes.readUInt32BE(offset),end=offset+12+length;if(length>20*1024*1024||end>bytes.length)throw new Error(`invalid_screenshot_chunk_size:${relativePath}`);const type=bytes.subarray(offset+4,offset+8),data=bytes.subarray(offset+8,offset+8+length),expected=bytes.readUInt32BE(offset+8+length),actual=crc32(Buffer.concat([type,data]));if(actual!==expected)throw new Error(`invalid_screenshot_crc:${relativePath}`);const name=type.toString('ascii');if(!sawIhdr){if(name!=='IHDR'||length!==13)throw new Error(`invalid_screenshot_ihdr:${relativePath}`);sawIhdr=true;width=data.readUInt32BE(0);height=data.readUInt32BE(4);bitDepth=data[8];colorType=data[9];interlace=data[12];}else if(name==='IHDR')throw new Error(`duplicate_screenshot_ihdr:${relativePath}`);if(name==='IDAT')idat.push(data);if(name==='IEND'){if(length!==0||end!==bytes.length)throw new Error(`invalid_screenshot_iend:${relativePath}`);sawIend=true;}offset=end;if(sawIend)break;}
  if(!sawIhdr||!sawIend||!idat.length||width<320||height<568||width>5000||height>5000||width*height>12_000_000)throw new Error(`invalid_screenshot_dimensions:${relativePath}:${width}x${height}`);
  const channels={0:1,2:3,3:1,4:2,6:4}[colorType];if(!channels||![1,2,4,8,16].includes(bitDepth)||interlace!==0)throw new Error(`unsupported_screenshot_png_format:${relativePath}`);
  const rowBytes=Math.ceil(width*channels*bitDepth/8),expectedInflated=height*(rowBytes+1),inflated=inflateSync(Buffer.concat(idat),{maxOutputLength:expectedInflated+1});if(inflated.length!==expectedInflated)throw new Error(`invalid_screenshot_pixel_data:${relativePath}`);for(let row=0;row<height;row+=1)if(inflated[row*(rowBytes+1)]>4)throw new Error(`invalid_screenshot_filter:${relativePath}`);
  return{width,height};
}

async function validateScreenshots(evidence,manifest){
  const entries=[],seen=new Set();
  for(const browserCase of evidence.cases){
    const relativePath=String(browserCase.screenshot??''),absolute=path.resolve(root,relativePath),expectedPrefix=`${screenshotRoot}/`;
    if(!relativePath.startsWith(expectedPrefix)||relativePath.includes('..')||path.relative(path.join(root,screenshotRoot),absolute).startsWith('..')||seen.has(relativePath))throw new Error(`noncanonical_screenshot_path:${relativePath}`);
    seen.add(relativePath);const bytes=await readFileNoFollow(absolute,{root,maxBytes:20*1024*1024}),actualDigest=digest(bytes);if(actualDigest!==browserCase.screenshotSha256)throw new Error(`screenshot_digest_mismatch:${relativePath}`);const{width,height}=validatePng(bytes,relativePath);entries.push({state:'PASS',path:relativePath,sha256:actualDigest,bytes:bytes.length,width,height,releaseId:manifest.releaseId,frontend:evidence.frontend});
  }
  if(entries.length!==19)throw new Error(`operator_console_screenshot_cases_incomplete:${entries.length}`);return entries;
}

export async function runOperatorCertification({env:runtimeEnv=process.env}={}){
await Promise.all([verifyDirectoryChain(root,releaseDir,{create:false}),verifyDirectoryChain(root,path.join(root,'.tmp/browser'))]);
const sourceManifest=JSON.parse(await readFileNoFollow(path.join(releaseDir,'release-source-manifest.json'),{root,encoding:'utf8'})),manifest=JSON.parse(await readFileNoFollow(manifestFile,{root,encoding:'utf8'})),producerPath='scripts/release/operator_console_browser_smoke.py',runtimeLockPath='scripts/release/browser-certification-runtime-lock.json',browserLockPath='scripts/release/browser-certification-browser-lock.json',producerBytes=await readFileNoFollow(path.join(root,producerPath),{root,maxBytes:256*1024}),runtimeLockBytes=await readFileNoFollow(path.join(root,runtimeLockPath),{root,maxBytes:128*1024}),browserLockBytes=await readFileNoFollow(path.join(root,browserLockPath),{root,maxBytes:64*1024}),entry=(name)=>sourceManifest.entries?.find((item)=>item.path===name),sourceHashes=releaseSourceHashes(sourceManifest.entries??[]);
if(sourceManifest.releaseId!==manifest.releaseId||sourceManifest.codeStateHash!==manifest.codeStateHash||sourceHashes.codeStateHash!==manifest.codeStateHash||sourceHashes.operationalDataHash!==manifest.operationalDataHash||entry(producerPath)?.sha256!==digest(producerBytes)||entry(runtimeLockPath)?.sha256!==digest(runtimeLockBytes)||entry(browserLockPath)?.sha256!==digest(browserLockBytes))throw new Error('browser_certification_producer_not_bound_to_release_source');
const runtimeBase=(value,fallback)=>String(value??fallback).replace(/\/+$/,'');
const runtimeReleases=await Promise.all([fetch(`${runtimeBase(runtimeEnv.VIGIA_BASE_URL,'http://127.0.0.1:4177')}/api/v10/release`,{signal:AbortSignal.timeout(5_000)}).then((response)=>response.json()),fetch(`${runtimeBase(runtimeEnv.FIELDNET_BASE_URL,'http://127.0.0.1:4188')}/api/fieldnet/release`,{signal:AbortSignal.timeout(5_000)}).then((response)=>response.json())]);
if(runtimeReleases.some((value)=>value?.runtimeProfile!=='remote_shadow'||value.releaseId!==manifest.releaseId||value.codeStateHash!==manifest.codeStateHash||value.operationalDataHash!==manifest.operationalDataHash||value.releaseStatementHash!==manifest.releaseStatementHash))throw new Error('browser_certification_requires_sealed_remote_shadow_runtime');
const browserRuntime=await materializeBrowserRuntime({projectRoot:root}),producerRuntimeEnv={...runtimeEnv,VIGIA_BROWSER_EXECUTABLE:browserRuntime.executable,VIGIA_BROWSER_EXECUTABLE_SHA256:browserRuntime.sha256,VIGIA_BROWSER_PROFILE_NONCE:randomBytes(24).toString('hex'),VIGIA_BROWSER_RUNTIME_JSON:JSON.stringify(publicBrowserRuntime(browserRuntime))};
const certificationRuntime=await materializeCertificationRuntime({projectRoot:root});
const attestationKey=randomBytes(32).toString('base64url'),runNonce=randomBytes(32).toString('hex');let producer;
try{producer=await runProducer({attestationKey,runNonce,producerSource:producerBytes.toString('utf8'),runtimeEnv:producerRuntimeEnv,runtime:certificationRuntime});}finally{await Promise.all([destroyCertificationRuntimeSnapshot(certificationRuntime),destroyBrowserRuntimeSnapshot(browserRuntime)]);}
if(producer.stdout)process.stdout.write(producer.stdout);if(producer.stderr)process.stderr.write(producer.stderr);
const evidenceBytes=await readFileNoFollow(evidenceFile,{root,maxBytes:16*1024*1024}),evidence=JSON.parse(evidenceBytes.toString('utf8'));
if(!browserEvidenceMatches(evidence,manifest,{attestationKey,runNonce,browserRuntime:publicBrowserRuntime(browserRuntime)}))throw new Error('operator_console_browser_evidence_mismatch');
const boundRouteArtifacts={};for(const[id,entry]of Object.entries(manifest.certificationEvidence?.entries??{}))if(['routes','session','handshake'].includes(id))boundRouteArtifacts[id]=await readFileNoFollow(path.join(root,entry.path),{root,maxBytes:16*1024*1024});verifyCertificationEvidenceBindings(manifest,boundRouteArtifacts,{requireAll:false});
if(Object.keys(boundRouteArtifacts).length!==3)throw new Error('browser_certification_route_evidence_bindings_incomplete');
const entries=await validateScreenshots(evidence,manifest),checkedAt=new Date().toISOString(),screenshotEvidence={schemaVersion:'vigia.operator-console-screenshot-evidence.v2',state:'PASS',releaseId:manifest.releaseId,codeStateHash:manifest.codeStateHash,operationalDataHash:manifest.operationalDataHash,certifiedRuntimeReleaseStatementHash:manifest.releaseStatementHash,frontend:evidence.frontend,capturedAt:checkedAt,required:entries.length,captured:entries.length,entries},screenshotEvidenceBytes=`${JSON.stringify(screenshotEvidence,null,2)}\n`;
await atomicWriteNoFollow(evidenceFile,evidenceBytes,{root});
await atomicWriteNoFollow(path.join(releaseDir,'screenshot-evidence.json'),screenshotEvidenceBytes,{root});
bindCertificationEvidence(manifest,{browser:evidenceBytes,screenshots:screenshotEvidenceBytes});
manifest.canonicalOperatorConsole={...manifest.canonicalOperatorConsole,assetDigest:evidence.frontend.assetDigest};
manifest.certification.browser={state:'PASS',scope:CERTIFICATION_SCOPES.browser,checkedAt,evidence:CERTIFICATION_REFERENCES.browser,cases:evidence.cases.length,realPortugalEventsVerified:evidence.realPortugalEventsVerified,consoleErrors:evidence.consoleErrors,unexpectedHttpErrors:evidence.unexpectedHttpErrors,routeNotFoundOccurrences:evidence.routeNotFoundOccurrences,identityContradictions:evidence.identityContradictions,intelligenceScenarios:evidence.intelligenceScenarios.length,intelligencePerformance:evidence.intelligencePerformance,performanceMs:evidence.performanceMs,certifiedRuntimeReleaseStatementHash:evidence.certifiedRuntimeReleaseStatementHash,attestation:{state:'VERIFIED',runNonce:evidence.attestation.runNonce,browserVersion:evidence.attestation.browserVersion,runtimeDigest:certificationRuntime.runtimeDigest,browserRuntime:publicBrowserRuntime(browserRuntime),browserProcess:evidence.attestation.browserProcess}};
manifest.screenshotEvidence={state:'COMPLETE',required:entries.length,captured:entries.length,evidence:'data/validation/release/screenshot-evidence.json',frontend:evidence.frontend,entries};
await refreshReleaseStatement(manifest);
process.stdout.write(`${JSON.stringify({state:'RECUT_REQUIRED',releaseId:manifest.releaseId,frontend:evidence.frontend,screenshots:`${entries.length}/${entries.length}`,attestation:'VERIFIED',next:'rebuild_and_redeploy_exact_release_statement'})}\n`);
return{manifest,evidence,screenshotEvidence};
}

if(path.resolve(process.argv[1]??'')===fileURLToPath(import.meta.url)){if(process.env.VIGIA_TRUSTED_NODE_LAUNCH!=='1')throw new Error('trusted_operator_certification_launcher_required');await runOperatorCertification();}
