import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function inspectComposeServiceState({ command, composeFile, service, env }) {
  const identity = await command('docker', ['compose', '-f', composeFile, 'ps', '-a', '-q', service], { env, allowFailure: true });
  const containerId = identity.stdout.trim();
  if (!containerId) throw new Error(`deployment_container_unavailable:${service}`);
  const inspected = await command('docker', ['inspect', '-f', '{{json .State}}', containerId], { env, allowFailure: true });
  if (inspected.state !== 'PASS') throw Object.assign(new Error(`deployment_container_inspect_failed:${service}`), { result: inspected });
  try { return JSON.parse(inspected.stdout); }
  catch { throw new Error(`deployment_container_state_invalid:${service}`); }
}

export function createComposeCrashProcess({ command, compose, composeFile, getEnv }) {
  async function restartCount(service) {
    const identity = await compose('ps', '-q', service);
    const containerId = identity.stdout.trim();
    if (!containerId) throw new Error(`deployment_container_unavailable:${service}`);
    const inspected = await command('docker', ['inspect', '-f', '{{.RestartCount}}', containerId], { env: getEnv() });
    const count = Number(inspected.stdout.trim());
    if (!Number.isInteger(count) || count < 0) throw new Error(`deployment_restart_count_invalid:${service}`);
    return count;
  }
  return async function crashProcess(service) {
    const restartCountBefore = await restartCount(service);
    const crash = await command('docker', ['compose', '-f', composeFile, 'exec', '-T', service, 'sh', '-c', 'for d in /proc/[0-9]*; do p=${d##*/}; if [ "$p" != 1 ] && [ "$(cat "$d/comm" 2>/dev/null)" = node ]; then kill -KILL "$p"; exit 0; fi; done; exit 1'], { env: getEnv(), allowFailure: true });
    const deadline = Date.now() + 60_000;
    let restartCountAfter = restartCountBefore;
    while (Date.now() < deadline) {
      try {
        restartCountAfter = await restartCount(service);
        if (restartCountAfter > restartCountBefore) return { crash, restartCountBefore, restartCountAfter };
      } catch {}
      await sleep(250);
    }
    throw new Error(`deployment_restart_policy_not_observed:${service}:${restartCountBefore}:${restartCountAfter}`);
  };
}

export function createDeploymentTools({ root }) {
  const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

  async function command(program, args, { env, timeout = 20 * 60_000, allowFailure = false } = {}) {
    try {
      const result = await exec(program, args, { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024 });
      return { state: 'PASS', code: 0, stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
      const result = { state: 'FAIL', code: Number.isInteger(error.code) ? error.code : null, signal: error.signal ?? null, stdout: String(error.stdout ?? ''), stderr: String(error.stderr ?? error.message ?? error) };
      if (!allowFailure) throw Object.assign(new Error(`command_failed:${program}:${args.join(' ')}`), { result });
      return result;
    }
  }

  async function json(url, { timeout = 5_000 } = {}) {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(timeout) });
    return { status: response.status, headers: Object.fromEntries(response.headers), body: await response.json() };
  }

  async function waitFor(url, predicate, options = {}) {
    const deadline = Date.now() + (options.timeout ?? 180_000);
    let last;
    while (Date.now() < deadline) {
      try { last = await json(url, options); if (predicate(last)) return last; }
      catch (error) { last = { error: String(error?.message ?? error) }; }
      await sleep(500);
    }
    throw new Error(`deployment_probe_timeout:${url}:${JSON.stringify(last)}`);
  }

  function compactCompose(result) {
    return { state: result.state, code: result.code, signal: result.signal ?? null, stdoutSha256: sha256(result.stdout), stderrSha256: sha256(result.stderr), stdoutTail: result.stdout.trim().split('\n').slice(-100), stderrTail: result.stderr.trim().split('\n').slice(-100) };
  }

  return { command, compactCompose, json, waitFor };
}
