import {readFile,writeFile} from 'node:fs/promises';
const config=JSON.parse(await readFile('.tmp/runtime/api.supervisor.json','utf8'));
const descriptor=JSON.parse(await readFile(config.descriptorFile,'utf8'));
if(descriptor.entry!=='apps/api/src/server.mjs'||descriptor.state!=='RUNNING')throw new Error('wrong_profile_target');
process.kill(descriptor.childPid,'SIGUSR1');
await new Promise(r=>setTimeout(r,1000));
const targets=await(await fetch('http://127.0.0.1:9229/json/list')).json();
const socket=new WebSocket(targets[0].webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
let sequence=0;const pending=new Map();socket.onmessage=event=>{const r=JSON.parse(event.data);if(r.id){const p=pending.get(r.id);pending.delete(r.id);r.error?p.reject(new Error(r.error.message)):p.resolve(r.result);}};
const post=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
try{await post('Profiler.enable');await post('Profiler.start');await new Promise(r=>setTimeout(r,45000));const {profile}=await post('Profiler.stop');await writeFile('.tmp/mega-vi/api-browser.cpuprofile',JSON.stringify(profile));console.log('45-second browser-workload CPU profile saved.');}
finally{await post('Runtime.evaluate',{expression:"setTimeout(()=>import('node:inspector').then(m=>m.close()),100)"}).catch(()=>{});socket.close();}
