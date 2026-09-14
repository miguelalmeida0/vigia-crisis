import { createHash, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { lstat, readFile, unlink } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWriteNoFollow, readFileNoFollow, verifyDirectoryChain } from './release/safe_artifact.mjs';

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temporaryRoot=path.join(projectRoot,'.tmp');
const MAX_LOG_BYTES=256*1024;
const MAX_CONTROL_BYTES=4096;

function within(value,base=temporaryRoot){const resolved=path.resolve(value),root=path.resolve(base);if(resolved!==root&&!resolved.startsWith(`${root}${path.sep}`))throw new Error('local_supervisor_path_outside_runtime_root');return resolved;}
function equal(left,right){const a=Buffer.from(String(left)),b=Buffer.from(String(right));return a.length===b.length&&a.length>0&&timingSafeEqual(a,b);}
function redactor(env){
  const values=Object.entries(env).filter(([name,value])=>/(?:TOKEN|PASSWORD|SECRET|DATABASE_URL|_KEY(?:_|$))/i.test(name)&&String(value).length>=8).map(([,value])=>String(value)).sort((a,b)=>b.length-a.length);
  return(input)=>{let output=String(input);for(const value of values)output=output.replaceAll(value,'[REDACTED]');return output.replace(/postgres(?:ql)?:\/\/[^\s/@:]+(?::[^\s/@]*)?@/gi,'postgresql://[REDACTED]@').replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi,'[REDACTED CREDENTIAL]');};
}
async function protectedToken(file){const metadata=await lstat(file);if(!metadata.isFile()||metadata.isSymbolicLink()||(metadata.mode&0o077)!==0||metadata.size<32||metadata.size>512)throw new Error('local_supervisor_control_token_invalid');return String(await readFileNoFollow(file,{root:projectRoot,maxBytes:512,encoding:'utf8'})).trim();}
function ringAppend(current,value){const next=Buffer.concat([current,Buffer.from(value)]);return next.length<=MAX_LOG_BYTES?next:next.subarray(next.length-MAX_LOG_BYTES);}

export async function runSupervisor(configFile){
  configFile=within(configFile);const runtimeRoot=path.dirname(configFile),config=JSON.parse(await readFileNoFollow(configFile,{root:projectRoot,maxBytes:16*1024,encoding:'utf8'}));
  const name=String(config.name??'').replace(/[^a-z0-9_-]/gi,'').slice(0,80),entry=path.resolve(projectRoot,String(config.entry??'')),childCwd=path.resolve(projectRoot,String(config.cwd??'.')),args=Array.isArray(config.args)?config.args.map(String):[];
  const projectPath=(value)=>value===projectRoot||value.startsWith(`${projectRoot}${path.sep}`);if(!name||!projectPath(entry)||!projectPath(childCwd))throw new Error('local_supervisor_config_invalid');
  const logFile=within(config.logFile,runtimeRoot),descriptorFile=within(config.descriptorFile,runtimeRoot),socketPath=within(config.socketPath,runtimeRoot),tokenFile=within(config.tokenFile,runtimeRoot);if(Buffer.byteLength(socketPath)>103)throw new Error('local_supervisor_socket_path_too_long');
  await verifyDirectoryChain(projectRoot,runtimeRoot);await unlink(socketPath).catch((error)=>{if(error?.code!=='ENOENT')throw error;});const token=await protectedToken(tokenFile),redact=redactor(process.env);
  let ring=Buffer.alloc(0),flushInFlight=null,flushTimer=null,dirty=false,exiting=false,stopping=false;
  const flush=()=>{if(flushInFlight)return flushInFlight;dirty=false;const snapshot=Buffer.from(ring);flushInFlight=atomicWriteNoFollow(logFile,snapshot,{root:projectRoot,mode:0o600}).catch(()=>undefined).finally(()=>{flushInFlight=null;if(dirty&&!exiting)scheduleFlush();});return flushInFlight;};
  const scheduleFlush=()=>{if(flushTimer)return;flushTimer=setTimeout(()=>{flushTimer=null;if(dirty)flush();},125);};
  const persist=(stream,chunk)=>{ring=ringAppend(ring,redact(`[${new Date().toISOString()}] ${stream} ${chunk}`));dirty=true;scheduleFlush();};
  await atomicWriteNoFollow(logFile,Buffer.alloc(0),{root:projectRoot,mode:0o600});
  const child=spawn(process.execPath,[entry,...args],{cwd:childCwd,env:process.env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',(chunk)=>persist('stdout',chunk));child.stderr.on('data',(chunk)=>persist('stderr',chunk));child.once('error',(error)=>persist('supervisor',`${error.stack??error}\n`));
  const descriptor={schemaVersion:'vigia.local-supervised-process.v1',name,supervisorPid:process.pid,childPid:child.pid,entry:path.relative(projectRoot,entry),cwd:path.relative(projectRoot,childCwd)||'.',socketPath:path.relative(projectRoot,socketPath),logPath:path.relative(projectRoot,logFile),startedAt:new Date().toISOString(),state:'RUNNING'};
  await atomicWriteNoFollow(descriptorFile,`${JSON.stringify(descriptor,null,2)}\n`,{root:projectRoot,mode:0o600});
  const stopChild=async()=>{if(stopping)return;stopping=true;if(child.exitCode!==null)return;child.kill('SIGTERM');await Promise.race([new Promise((resolve)=>child.once('exit',resolve)),new Promise((resolve)=>setTimeout(resolve,4_000))]);if(child.exitCode===null){child.kill('SIGKILL');await new Promise((resolve)=>child.once('exit',resolve));}};const crashChild=()=>{if(stopping||child.exitCode!==null)return;stopping=true;child.kill('SIGKILL');};
  const control=net.createServer((connection)=>{let body=Buffer.alloc(0);connection.setTimeout(3_000,()=>connection.destroy());connection.on('data',(chunk)=>{body=Buffer.concat([body,chunk]);if(body.length>MAX_CONTROL_BYTES){connection.end(`${JSON.stringify({ok:false,error:'control_request_too_large'})}\n`);return;}if(!body.includes(10))return;let request;try{request=JSON.parse(body.toString('utf8').trim());}catch{connection.end(`${JSON.stringify({ok:false,error:'control_request_invalid'})}\n`);return;}if(!equal(request.token,token)){connection.end(`${JSON.stringify({ok:false,error:'control_authentication_rejected'})}\n`);return;}if(request.action==='status'){connection.end(`${JSON.stringify({ok:true,...descriptor,childExitCode:child.exitCode})}\n`);return;}if(!['stop','crash'].includes(request.action)){connection.end(`${JSON.stringify({ok:false,error:'control_action_invalid'})}\n`);return;}connection.end(`${JSON.stringify({ok:true,state:request.action==='crash'?'CRASHING':'STOPPING',name})}\n`);setImmediate(()=>request.action==='crash'?crashChild():void stopChild());});});
  await new Promise((resolve,reject)=>{control.once('error',reject);control.listen(socketPath,resolve);});
  const cleanup=async(code,signal)=>{if(exiting)return;exiting=true;if(flushTimer){clearTimeout(flushTimer);flushTimer=null;}const flushLatest=async()=>{while(flushInFlight||dirty){if(flushInFlight)await flushInFlight;else await flush();}};await Promise.race([flushLatest(),new Promise((resolve)=>setTimeout(resolve,1_500))]);const final={...descriptor,state:'EXITED',exitedAt:new Date().toISOString(),exitCode:code,signal:signal??null,logSha256:`sha256:${createHash('sha256').update(ring).digest('hex')}`};await atomicWriteNoFollow(descriptorFile,`${JSON.stringify(final,null,2)}\n`,{root:projectRoot,mode:0o600}).catch(()=>undefined);await new Promise((resolve)=>control.close(resolve));await unlink(socketPath).catch(()=>undefined);setTimeout(()=>process.exit(Number(code??0)),25).unref();};
  child.once('exit',(code,signal)=>void cleanup(code,signal));
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void stopChild());
}

if(path.resolve(process.argv[1]??'')===fileURLToPath(import.meta.url)){
  try{await runSupervisor(process.argv[2]);}
  catch(error){const configPath=path.resolve(process.argv[2]??''),directory=configPath.startsWith(`${temporaryRoot}${path.sep}`)?path.dirname(configPath):temporaryRoot;await atomicWriteNoFollow(path.join(directory,'supervisor-startup-error.log'),`${String(error?.stack??error)}\n`,{root:projectRoot,mode:0o600}).catch(()=>undefined);throw error;}
}
