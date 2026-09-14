import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readFile as readFileAsync, unlink as unlinkAsync } from 'node:fs/promises';
import { get as httpGet } from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { atomicWriteNoFollow,verifyDirectoryChain } from './release/safe_artifact.mjs';

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = path.join(root, 'apps/operator-console');
const runtimePointerFile = path.join(root, '.tmp/operator-console-current.json');
const recordedRuntime = (() => {
  try { return JSON.parse(readFileSync(runtimePointerFile, 'utf8')); }
  catch { return null; }
})();
const configuredPort = Number(process.env.VIGIA_OPERATOR_RUNTIME_PORT ?? recordedRuntime?.port ?? 4190);
if (!Number.isInteger(configuredPort) || configuredPort < 1024 || configuredPort > 65535) throw new Error('invalid_operator_console_runtime_port');
const port = configuredPort;
const runtimeRoot = path.join(root, port === 4190 ? '.tmp/operator-console' : `.tmp/operator-console-${port}`);
const pidFile = path.join(runtimeRoot, 'server.pid');
const origin = `http://127.0.0.1:${port}`;
const accessTokenFile=path.join(root,'.tmp/release/operator-console-access-token');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function listenerPids() {
  try {
    const { stdout } = await exec('lsof', [`-tiTCP:${port}`, '-sTCP:LISTEN'], { timeout: 1000 });
    return stdout.split(/\s+/).map(Number).filter(pid => Number.isInteger(pid) && pid > 0);
  } catch { return []; }
}

async function processCwd(pid) {
  try {
    const { stdout } = await exec('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { timeout: 5000 });
    return stdout.split('\n').find(line => line.startsWith('n'))?.slice(1) ?? null;
  } catch { return null; }
}

async function ownedListeners() {
  const rows = [];
  for (const pid of await listenerPids()) rows.push({ pid, cwd: await processCwd(pid) });
  return rows;
}

function isPidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function httpReadiness() {
  try {
    const response = await new Promise((resolve, reject) => {
      const request = httpGet(`${origin}/__operator/ready`, { headers: { accept: 'application/json' } }, incoming => {
        const chunks = [];
        let size = 0;
        incoming.on('data', chunk => {
          size += chunk.length;
          if (size > 64 * 1024) {
            incoming.destroy(new Error('operator_readiness_response_too_large'));
            return;
          }
          chunks.push(chunk);
        });
        incoming.on('end', () => resolve({ status: incoming.statusCode ?? 0, contentType: incoming.headers['content-type'] ?? '', body: Buffer.concat(chunks).toString('utf8') }));
        incoming.on('error', reject);
      });
      request.setTimeout(750, () => request.destroy(new Error('operator_readiness_timeout')));
      request.on('error', reject);
    });
    const contentType = response.contentType;
    const body = response.body;
    const payload = contentType.includes('application/json') ? JSON.parse(body) : null;
    const ok = response.status >= 200 && response.status < 300;
    const ready = ok
      && payload?.ok === true
      && payload?.frontend === 'operator-console'
      && payload?.path === 'apps/operator-console'
      && payload?.version === '2.1.0';
    if (ready) return { ready: true, status: response.status, mode: 'ready_contract', payload };
    const legacyReady = ok
      && contentType.includes('text/html')
      && body.includes('<title>VIGIA — Mission Dark</title>')
      && body.includes('./src/app.js?v=2.1.0');
    return { ready: legacyReady, status: response.status, mode: legacyReady ? 'legacy_index_identity' : 'unrecognized_response', payload };
  } catch (error) {
    return { ready: false, error: String(error?.message ?? error) };
  }
}

export async function waitForOperatorState({
  expectedListening,
  expectedPid = null,
  timeoutMs = 20_000,
  intervalMs = 125,
  canonicalRoot = appRoot,
  getListeners = ownedListeners,
  probeHttp = httpReadiness,
  pidAlive = isPidAlive,
  now = Date.now,
  wait = sleep,
} = {}) {
  const startedAt = now();
  const deadline = startedAt + timeoutMs;
  let attempts = 0;
  let last = { listeners: [], http: { ready: false, error: 'not_probed' }, expectedPidAlive: expectedPid ? true : null };
  while (now() <= deadline) {
    attempts += 1;
    let listeners = [];
    let listenerError = null;
    try { listeners = await getListeners(); } catch (error) { listenerError = String(error?.message ?? error); }
    const foreign = listeners.filter(row => path.resolve(row.cwd ?? '/') !== canonicalRoot);
    if (foreign.length) {
      throw new Error(`operator_console_foreign_listener_during_readiness:${JSON.stringify({ attempts, foreign })}`);
    }
    if (!expectedListening && listeners.length === 0) return { attempts, elapsedMs: now() - startedAt, listeners };

    const expectedPidAlive = expectedPid ? pidAlive(expectedPid) : null;
    const http = expectedListening ? await probeHttp() : { ready: false, error: 'not_required' };
    last = { listeners, listenerError, http, expectedPidAlive };
    if (expectedListening) {
      const ownsExpectedPid = expectedPid === null || listeners.some(row => row.pid === expectedPid);
      if (listeners.length > 0 && ownsExpectedPid && http.ready) {
        return { attempts, elapsedMs: now() - startedAt, listeners, http };
      }
      if (expectedPid && !expectedPidAlive && listeners.length === 0) {
        throw new Error(`operator_console_process_exited_before_ready:${JSON.stringify({ attempts, expectedPid, last })}`);
      }
    }
    if (now() >= deadline) break;
    await wait(Math.min(intervalMs, Math.max(0, deadline - now())));
  }
  throw new Error(`operator_console_port_${port}_${expectedListening ? 'not_ready' : 'not_stopped'}:${JSON.stringify({ attempts, elapsedMs: now() - startedAt, expectedPid, last })}`);
}

async function ensureAccessToken(){const token=randomBytes(32).toString('base64url');await atomicWriteNoFollow(accessTokenFile,`${token}\n`,{root});return token;}

async function start() {
  await verifyDirectoryChain(root,runtimeRoot);
  const existing = await ownedListeners();
  if (existing.length) {
    if (existing.every(row => path.resolve(row.cwd ?? '/') === appRoot)) {
      const readiness = await waitForOperatorState({ expectedListening: true, expectedPid: existing[0].pid });
      await atomicWriteNoFollow(runtimePointerFile, `${JSON.stringify({schemaVersion:'vigia.operator-runtime-pointer.v1',origin,port,pid:existing[0].pid,updatedAt:new Date().toISOString()})}\n`,{root});
      console.log(`Operator Console already running and HTTP-ready at ${origin} (PID ${existing.map(row => row.pid).join(', ')}, ${readiness.elapsedMs}ms)`);
      return;
    }
    throw new Error(`port_${port}_owned_by_noncanonical_process:${existing.map(row => `${row.pid}:${row.cwd ?? 'unknown'}`).join(',')}`);
  }
  const accessToken=await ensureAccessToken();
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: appRoot,
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), VIGIA_BACKEND_URL: process.env.VIGIA_BACKEND_URL ?? 'http://127.0.0.1:4177', VIGIA_OPERATOR_STATIC_ROOT: 'dist', VIGIA_OPERATOR_ACCESS_TOKEN:accessToken },
    detached: true,
    stdio: 'ignore',
  });
  await new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  child.unref();
  await atomicWriteNoFollow(pidFile, `${child.pid}\n`,{root});
  try {
    const readiness = await waitForOperatorState({ expectedListening: true, expectedPid: child.pid });
    await atomicWriteNoFollow(runtimePointerFile, `${JSON.stringify({schemaVersion:'vigia.operator-runtime-pointer.v1',origin,port,pid:child.pid,updatedAt:new Date().toISOString()})}\n`,{root});
    console.log(`Operator Console started and HTTP-ready at ${origin}/#/command-overview (PID ${child.pid}, ${readiness.elapsedMs}ms)`);
  } catch (error) {
    const diagnostics = { childPid: child.pid, childAlive: isPidAlive(child.pid), listeners: await ownedListeners(), http: await httpReadiness() };
    throw new Error(`${error.message}:diagnostics=${JSON.stringify(diagnostics)}`);
  }
}

async function stop() {
  const listeners = await ownedListeners();
  if (!listeners.length) {
    console.log(`Operator Console is not listening on ${port}`);
    return;
  }
  const foreign = listeners.filter(row => path.resolve(row.cwd ?? '/') !== appRoot);
  if (foreign.length) throw new Error(`refusing_to_stop_noncanonical_process:${foreign.map(row => `${row.pid}:${row.cwd ?? 'unknown'}`).join(',')}`);
  for (const { pid } of listeners) process.kill(pid, 'SIGTERM');
  await waitForOperatorState({ expectedListening: false });
  await unlinkAsync(accessTokenFile).catch((error)=>{if(error?.code!=='ENOENT')throw error;});
  if(recordedRuntime?.port===port)await unlinkAsync(runtimePointerFile).catch((error)=>{if(error?.code!=='ENOENT')throw error;});
  console.log(`Operator Console stopped on ${port}`);
}

async function status() {
  const listeners = await ownedListeners();
  const recordedPid = await readFileAsync(pidFile, 'utf8').then(value => Number(value.trim())).catch(() => null);
  const http = listeners.length ? await httpReadiness() : { ready: false, error: 'not_listening' };
  console.log(JSON.stringify({ origin, state: listeners.length && http.ready ? 'READY' : listeners.length ? 'LISTENING_NOT_READY' : 'STOPPED', listeners, recordedPid, http }));
  if (listeners.some(row => path.resolve(row.cwd ?? '/') !== appRoot)) process.exitCode = 2;
  else if (listeners.length && !http.ready) process.exitCode = 3;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const action = process.argv[2] ?? 'status';
  if (action === 'start') await start();
  else if (action === 'stop') await stop();
  else if (action === 'status') await status();
  else throw new Error(`unknown_operator_console_action:${action}`);
}
