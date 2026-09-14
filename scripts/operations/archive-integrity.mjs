import { spawn } from 'node:child_process';
import { closeSync,constants,fstatSync,openSync,readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const python=process.platform==='win32'?'python':'/usr/bin/python3';
const helperPath=fileURLToPath(new URL('./archive-integrity-helper.py',import.meta.url));
const helperDescriptor=openSync(helperPath,constants.O_RDONLY|constants.O_NOFOLLOW);let helperSource;
try{const metadata=fstatSync(helperDescriptor);if(!metadata.isFile()||metadata.size<=0||metadata.size>256*1024)throw new Error('archive_integrity_helper_source_invalid');helperSource=readFileSync(helperDescriptor,'utf8');}finally{closeSync(helperDescriptor);}

function invoke(operation,payload,{timeoutMs=30*60_000,maxOutputBytes=64*1024*1024}={}){const input=Buffer.from(JSON.stringify(payload));if(input.length>64*1024*1024)throw new Error('archive_integrity_input_too_large');return new Promise((resolve,reject)=>{const child=spawn(python,['-I','-S','-B','-c',helperSource,'--operation',operation],{stdio:['pipe','pipe','pipe'],env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8',TZ:'UTC'}}),stdout=[],stderr=[];let outBytes=0,errBytes=0,settled=false;const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolve(value);},timer=setTimeout(()=>{child.kill('SIGKILL');finish(new Error('archive_integrity_helper_timeout'));},timeoutMs);child.stdout.on('data',(chunk)=>{outBytes+=chunk.length;if(outBytes>maxOutputBytes){child.kill('SIGKILL');return finish(new Error('archive_integrity_helper_output_too_large'));}stdout.push(chunk);});child.stderr.on('data',(chunk)=>{errBytes+=chunk.length;if(errBytes<=16_384)stderr.push(chunk);});child.on('error',(error)=>finish(error));child.on('close',(code)=>{if(settled)return;if(code!==0)return finish(new Error(Buffer.concat(stderr).toString('utf8').trim()||`archive_integrity_helper_failed:${code}`));try{finish(null,JSON.parse(Buffer.concat(stdout).toString('utf8')));}catch{finish(new Error('archive_integrity_helper_output_invalid'));}});child.stdin.end(input);});}

export async function createEvidenceSourceManifest({root,inputPaths,limits}={}){if(!root||!Array.isArray(inputPaths)||!inputPaths.length)throw new Error('archive_manifest_input_required');return invoke('manifest',{root:path.resolve(root),inputPaths,limits});}
export async function restoreEvidenceArchive({archivePath,destination,expectedManifest,limits}={}){if(!archivePath||!destination||!expectedManifest)throw new Error('archive_restore_input_required');return invoke('restore',{archivePath:path.resolve(archivePath),destination:path.resolve(destination),expectedManifest,limits});}
