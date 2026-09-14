import { createHmac, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOneTimeAdmission } from '../apps/operator-console/admission.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtimePointerFile=path.join(root,'.tmp/operator-console-current.json');
const tokenFile=path.join(root,'.tmp/release/operator-console-access-token');

async function runtimeOrigin(){
  const pointer=JSON.parse(await readFile(runtimePointerFile,'utf8'));
  const origin=String(pointer?.origin??'');
  const parsed=new URL(origin);
  if(parsed.protocol!=='http:'||parsed.hostname!=='127.0.0.1'||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash)throw new Error('operator_runtime_pointer_invalid');
  return origin.replace(/\/$/,'');
}

function equalText(left,right){const a=Buffer.from(String(left)),b=Buffer.from(String(right));return a.length===b.length&&a.length>0&&timingSafeEqual(a,b);}
async function protectedSecret(){
  const metadata=await lstat(tokenFile).catch(()=>null);
  if(!metadata?.isFile()||metadata.isSymbolicLink()||metadata.size<32||metadata.size>4096||(metadata.mode&0o077)!==0)throw new Error('operator_access_token_file_not_protected');
  const value=(await readFile(tokenFile,'utf8')).trim();
  if(value.length<32)throw new Error('operator_access_token_invalid');
  return value;
}
function getJson(url,{timeoutMs=2500}={}){return new Promise((resolve,reject)=>{const request=http.get(url,{headers:{accept:'application/json'}},response=>{const chunks=[];let bytes=0;response.on('data',chunk=>{bytes+=chunk.length;if(bytes>128*1024)response.destroy(new Error('operator_open_response_too_large'));else chunks.push(chunk);});response.on('end',()=>{let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return reject(new Error('operator_open_response_invalid'));}resolve({status:response.statusCode??0,body});});response.on('error',reject);});request.setTimeout(timeoutMs,()=>request.destroy(new Error('operator_open_timeout')));request.on('error',reject);});}
async function proveListener(secret,identity,origin){
  const challenge=(await import('node:crypto')).randomBytes(32).toString('hex'),response=await getJson(`${origin}/__operator/prove?challenge=${challenge}`),proof=response.body;
  const material=['operator-console-listener-proof-v1',challenge,identity.releaseId??'',identity.codeStateHash??'',identity.assetDigest??''].join('\0'),expected=createHmac('sha256',secret).update(material).digest('hex');
  if(response.status!==200||proof.challenge!==challenge||!equalText(proof.proof,expected))throw new Error('operator_listener_proof_failed');
}
function openUrl(url){
  const command=process.platform==='darwin'?'open':process.platform==='win32'?'cmd':'xdg-open',args=process.platform==='win32'?['/c','start','',url]:[url];
  const child=spawn(command,args,{detached:true,stdio:'ignore'});child.unref();
}

export async function operatorOpen({open=openUrl}={}){
  const origin=await runtimeOrigin(),secret=await protectedSecret(),ready=await getJson(`${origin}/__operator/ready`);
  if(ready.status!==200||ready.body?.ok!==true||ready.body?.frontend!=='operator-console'||ready.body?.path!=='apps/operator-console')throw new Error('operator_console_runtime_not_ready');
  await proveListener(secret,ready.body,origin);
  const admission=createOneTimeAdmission(secret);
  open(`${origin}/?admission=${encodeURIComponent(admission)}`);
  return{state:'OPENED',origin,redirect:'/#/command-overview',releaseId:ready.body.releaseId,codeStateHash:ready.body.codeStateHash};
}

if(path.resolve(process.argv[1]??'')===fileURLToPath(import.meta.url)){
  const result=await operatorOpen();
  console.log(`Operator Console opened at ${result.origin}/#/command-overview (${result.releaseId})`);
}
