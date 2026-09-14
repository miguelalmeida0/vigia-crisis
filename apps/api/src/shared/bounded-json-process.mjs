import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { RequestGate } from './request-gate.mjs';

const processGate=new RequestGate({maxConcurrent:4,maxConcurrentPerClient:4,maxRequestsPerWindow:240});

export async function runBoundedJsonProcess({command='python3',args=[],filePath=null,allowDirectory=false,timeoutMs=30_000,maxFileBytes=256*1024*1024,maxOutputBytes=2*1024*1024,maxErrorBytes=128*1024,maxDetections=100_000}={}){
  try{if(filePath){const info=await stat(filePath);if(!info.isFile()&&!(allowDirectory&&info.isDirectory()))return{ok:false,error:'parser_input_not_file',detections:[]};if(info.isFile()&&info.size>maxFileBytes)return{ok:false,error:'parser_input_too_large',detections:[]};}}
  catch(error){return{ok:false,error:`parser_input_unavailable:${String(error.message??error)}`,detections:[]};}
  return processGate.run('bounded-json-parser',()=>new Promise((resolve)=>{
    const child=spawn(command,args,{stdio:['ignore','pipe','pipe']}),stdout=[],stderr=[];let outBytes=0,errBytes=0,settled=false,forcedError=null;
    const finish=(value)=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value);};
    const fail=(code)=>{if(settled||forcedError)return;forcedError=code;child.kill('SIGKILL');};
    const timer=setTimeout(()=>fail('parser_timeout'),timeoutMs);timer.unref?.();
    child.stdout.on('data',(chunk)=>{outBytes+=chunk.length;if(outBytes>maxOutputBytes)return fail('parser_output_too_large');stdout.push(Buffer.from(chunk));});
    child.stderr.on('data',(chunk)=>{errBytes+=chunk.length;if(errBytes<=maxErrorBytes)stderr.push(Buffer.from(chunk));});
    child.on('error',(error)=>finish({ok:false,error:forcedError??`parser_spawn_failed:${String(error.message??error)}`,detections:[]}));
    child.on('close',(code)=>{if(settled)return;if(forcedError)return finish({ok:false,error:forcedError,detections:[]});try{const value=JSON.parse(Buffer.concat(stdout,outBytes).toString('utf8')||'{}');if(Array.isArray(value.detections)&&value.detections.length>maxDetections)return finish({ok:false,error:'parser_detection_limit_exceeded',detections:[]});finish(value);}catch{finish({ok:false,error:`parser_invalid_output:${code}:${Buffer.concat(stderr).toString('utf8').slice(0,600)}`,detections:[]});}});
  })).catch((error)=>({ok:false,error:String(error.message??error),detections:[]}));
}
