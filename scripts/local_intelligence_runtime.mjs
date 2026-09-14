import http from 'node:http';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';

const model=process.env.VIGIA_LOCAL_MODEL??'mlx-community/Qwen3.5-2B-MLX-4bit';
const queue=[];let worker=null,state='starting',current=null,sequence=0,residentBytes=null,failure=null;
const answer=(res,status,value)=>{if(!res.destroyed&&!res.writableEnded){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));}};
function stop(reason){state='unavailable';failure=reason;worker?.kill();worker=null;if(current){clearTimeout(current.timer);answer(current.res,503,{state,error:reason});current=null;}for(const item of queue.splice(0))answer(item.res,503,{state,error:reason});}
function run(){if(current||state!=='ready'||!queue.length)return;current=queue.shift();if(current.res.destroyed){current=null;return run();}const item=current;item.timer=setTimeout(()=>stop('inference_deadline_exceeded'),3000);worker.stdin.write(JSON.stringify({...item.body,id:item.id})+'\n');}
worker=spawn(process.env.VIGIA_MLX_PYTHON??'python3',[fileURLToPath(new URL('./local_intelligence_worker.py',import.meta.url)),model],{stdio:['pipe','pipe','pipe']});
worker.stderr.on('data',chunk=>{failure=String(chunk).slice(-1200);});
worker.on('error',error=>stop(error.message));worker.on('exit',()=>stop(failure??'worker_exited'));
const startup=setTimeout(()=>stop('model_startup_deadline_exceeded'),120000);
createInterface({input:worker.stdout}).on('line',line=>{let msg;try{msg=JSON.parse(line);}catch{return;}if(msg.state==='ready'){clearTimeout(startup);state='ready';residentBytes=msg.residentBytes;return;}if(msg.state==='unavailable'){clearTimeout(startup);stop(msg.error);return;}if(current&&msg.id===current.id){clearTimeout(current.timer);residentBytes=msg.residentBytes??residentBytes;answer(current.res,msg.error?422:200,msg);current=null;run();}});
const server=http.createServer(async(req,res)=>{
 if(req.method==='GET'&&req.url==='/health')return answer(res,state==='ready'?200:503,{state,model,residentBytes,queue:queue.length,busy:Boolean(current),failure});
 if(req.method!=='POST'||req.url!=='/infer')return answer(res,404,{error:'not_found'});
 if(state!=='ready')return answer(res,503,{error:'model_unavailable'});if(queue.length>=4)return answer(res,429,{error:'bounded_queue_full'});
 let size=0,parts=[];for await(const part of req){size+=part.length;if(size>40000)return answer(res,413,{error:'input_bound'});parts.push(part);}
 let body;try{body=JSON.parse(Buffer.concat(parts));}catch{return answer(res,400,{error:'invalid_json'});}if(!['intent','extract','source_change'].includes(body.task)||!body.input||!body.schema)return answer(res,400,{error:'unapproved_task'});
 const item={id:++sequence,body,res};queue.push(item);res.on('close',()=>{const i=queue.indexOf(item);if(i>=0)queue.splice(i,1);if(current===item&&!res.writableEnded)stop('request_cancelled');});run();
});
server.listen(Number(process.env.VIGIA_MLX_PORT??11438),'127.0.0.1');
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{stop('shutdown');server.close();clearTimeout(startup);});
