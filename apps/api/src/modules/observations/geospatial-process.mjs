import { spawn } from 'node:child_process';
import { RequestGate } from '../../shared/request-gate.mjs';

const processGate=new RequestGate({maxConcurrent:8,maxConcurrentPerClient:8,maxRequestsPerWindow:240});

export function runGeospatialProcess({ python = 'python3', script, input, timeoutMs = 20_000 }) {
  const encoded=JSON.stringify(input);if(Buffer.byteLength(encoded)>1_000_000)return Promise.resolve({ok:false,error:'geospatial_worker_input_too_large'});
  return processGate.run('geospatial-worker',()=>new Promise((resolve) => {
    const child = spawn(python, [script], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', stdoutBytes=0,stderrBytes=0,settled = false;
    const finish = (value) => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish({ ok: false, error: 'geospatial_worker_timeout' }); }, timeoutMs);
    timer.unref?.();
    child.stdout.on('data', (chunk) => {stdoutBytes+=chunk.length;if(stdoutBytes>2*1024*1024){child.kill('SIGKILL');return finish({ok:false,error:'geospatial_worker_output_too_large'});}stdout+=chunk;});
    child.stderr.on('data', (chunk) => {stderrBytes+=chunk.length;if(stderrBytes<=128*1024)stderr+=chunk;});
    child.on('error', (error) => finish({ ok: false, error: `geospatial_worker_spawn_failed:${error.message}` }));
    child.on('close', (code) => {
      if (settled) return;
      try { finish(JSON.parse(stdout || '{}')); }
      catch { finish({ ok: false, error: `geospatial_worker_invalid_output:${code}:${stderr.slice(0, 600)}` }); }
    });
    child.stdin.end(encoded);
  }));
}
