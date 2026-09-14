import {Session} from 'node:inspector';
import {monitorEventLoopDelay} from 'node:perf_hooks';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
// Opt-in engineering capture. No inspector network listener and no UI surface.
if(process.env.VIGIA_PROFILE_RUNTIME==='1'){
 const session=new Session();session.connect();const post=(method)=>new Promise((resolve,reject)=>session.post(method,(error,result)=>error?reject(error):resolve(result)));
 const lag=monitorEventLoopDelay({resolution:20});lag.enable();
 await post('Profiler.enable');await post('Profiler.start');
 setTimeout(async()=>{try{const {profile}=await post('Profiler.stop'),dir=path.resolve('.tmp/acceleration');await mkdir(dir,{recursive:true});await writeFile(path.join(dir,'api.cpuprofile'),JSON.stringify(profile));await writeFile(path.join(dir,'event-loop.json'),JSON.stringify({maxMs:lag.max/1e6,p95Ms:lag.percentile(95)/1e6,meanMs:lag.mean/1e6}));}finally{lag.disable();session.disconnect();}},60000).unref();
}
