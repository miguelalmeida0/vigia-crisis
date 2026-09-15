import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';

const projectRoot = process.cwd();
const externalPort = String(process.env.PORT || '').trim();
const databaseUrl = String(process.env.VIGIA_DATABASE_URL || '').trim();
const authority = String(process.env.VIGIA_OPERATOR_PUBLIC_AUTHORITY || process.env.RENDER_EXTERNAL_HOSTNAME || '').trim();

if (!externalPort) throw new Error('Render PORT is required');
if (!databaseUrl) throw new Error('VIGIA_DATABASE_URL is required');
if (!authority) throw new Error('VIGIA_OPERATOR_PUBLIC_AUTHORITY or RENDER_EXTERNAL_HOSTNAME is required');

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} failed with ${signal ? `signal ${signal}` : `code ${code}`}`));
    });
  });
}

function waitForApi({ timeoutMs = 45_000 } = {}) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get('http://127.0.0.1:4177/api/v10/release', { timeout: 2_000 }, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        retry();
      });
      req.once('timeout', () => req.destroy());
      req.once('error', retry);
    };
    const retry = () => {
      if (Date.now() - startedAt >= timeoutMs) return reject(new Error('VIGIA API listener did not become ready before timeout'));
      setTimeout(attempt, 750);
    };
    attempt();
  });
}

console.log('[vigia-render] applying PostGIS migrations');
await run(process.execPath, ['scripts/migrate_postgis.mjs']);

const apiEnv = {
  ...process.env,
  HOST: '127.0.0.1',
  PORT: '4177',
  OPEN_BROWSER: '0',
  NODE_ENV: 'production',
  VIGIA_UNIVERSE: 'production',
  VIGIA_RUNTIME_PROFILE: 'production',
  VIGIA_LOCAL_SECRETS_DISABLED: '1',
};

const api = spawn(process.execPath, ['apps/api/src/server.mjs'], {
  cwd: projectRoot,
  env: apiEnv,
  stdio: 'inherit',
});

api.once('error', (error) => {
  console.error('[vigia-render] API process error', error);
  process.exit(1);
});

await waitForApi();
console.log('[vigia-render] API listener ready; starting public read-only console');

const webEnv = {
  ...process.env,
  HOST: '0.0.0.0',
  PORT: externalPort,
  NODE_ENV: 'production',
  VIGIA_BACKEND_URL: 'http://127.0.0.1:4177',
  VIGIA_OPERATOR_PUBLIC_AUTHORITY: authority,
  VIGIA_OPERATOR_PUBLIC_SCHEME: 'https',
  VIGIA_OPERATOR_PACKAGE_ROOT: path.join(projectRoot, 'apps/operator-console'),
  VIGIA_PORTUGAL_BOUNDARY_PATH: path.join(projectRoot, 'data/replay/raw/openstreetmap/portugal-thermal-context-v1/portugal-boundary.json'),
};

const web = spawn(process.execPath, ['infra/public-demo-server.mjs'], {
  cwd: projectRoot,
  env: webEnv,
  stdio: 'inherit',
});

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  web.kill('SIGTERM');
  api.kill('SIGTERM');
  setTimeout(() => process.exit(code), 3_500).unref();
}

for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => shutdown(0));

api.once('exit', (code, signal) => {
  if (!shuttingDown) {
    console.error(`[vigia-render] API exited unexpectedly: ${signal || code}`);
    shutdown(code || 1);
  }
});
web.once('exit', (code, signal) => {
  if (!shuttingDown) {
    console.error(`[vigia-render] public console exited unexpectedly: ${signal || code}`);
    shutdown(code || 1);
  }
});
