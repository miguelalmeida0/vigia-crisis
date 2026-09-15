// Render start command for the ISOLATED VIGIA PORTFOLIO DEMO service.
//
// This is a sibling of infra/render-live-start.mjs, not a modification of it.
// It runs the exact same real API server and PostGIS migration path
// production uses, against a completely separate database that only this
// service is ever configured to reach — then seeds a clearly labelled
// synthetic scenario (see scripts/seed_demo_portfolio_scenario.mjs) through
// VIGIA's own governed domain import paths before opening the public gateway.
//
// It refuses to start unless the target database is explicitly confirmed as
// an isolated demo database (VIGIA_DEMO_CONFIRM=SYNTHETIC_DEMO_ONLY) and its
// connection string does not match a known production identifier.

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const root = process.cwd();
const externalPort = String(process.env.PORT || '').trim();
const authority = String(process.env.VIGIA_OPERATOR_PUBLIC_AUTHORITY || '').trim();
const databaseUrl = String(process.env.VIGIA_DATABASE_URL || '').trim();
if (!externalPort) throw new Error('Render PORT is required');
if (!authority) throw new Error('VIGIA_OPERATOR_PUBLIC_AUTHORITY is required');
if (!databaseUrl) throw new Error('VIGIA_DATABASE_URL is required for the demo deployment');
if (process.env.VIGIA_DEMO_CONFIRM !== 'SYNTHETIC_DEMO_ONLY') throw new Error('VIGIA_DEMO_CONFIRM=SYNTHETIC_DEMO_ONLY is required to start the isolated demo service');
for (const marker of ['vigia-public-demo-db', 'vigia-live']) {
  if (databaseUrl.toLowerCase().includes(marker)) throw new Error(`Refusing to start: VIGIA_DATABASE_URL contains "${marker}", a known production identifier.`);
}

const proxyKey = String(process.env.VIGIA_OPERATOR_PROXY_KEY || '').trim() || randomBytes(48).toString('base64url');
const buildIdentity = JSON.parse(await readFile(path.join(root, 'apps/operator-console/dist/build-manifest.json'), 'utf8'));

function run(command, args, { env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} failed: ${signal || code}`)));
  });
}

function requestJson(pathname, { timeoutMs = 3_000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:4178${pathname}`, { timeout: timeoutMs }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(Buffer.from(chunk)));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let body = null;
        try { body = text ? JSON.parse(text) : null; } catch {}
        resolve({ status: res.statusCode || 0, body });
      });
    });
    req.once('timeout', () => req.destroy(new Error('request_timeout')));
    req.once('error', reject);
  });
}

async function waitForBackend({ timeoutMs = 150_000 } = {}) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const release = await requestJson('/api/v10/release');
      last = release;
      if (release.status === 200 && release.body?.releaseId) {
        const sameIdentity = release.body.releaseId === buildIdentity.releaseId
          && release.body.codeStateHash === buildIdentity.codeStateHash
          && release.body.operationalDataHash === buildIdentity.operationalDataHash
          && release.body.releaseStatementHash === buildIdentity.releaseStatementHash;
        if (!sameIdentity) throw new Error('api_console_release_identity_mismatch');
        if (release.body?.process?.startup?.state === 'failed') throw new Error('api_services_startup_failed');
        if (release.body?.process?.servicesReady === true) return release.body;
      }
    } catch (error) {
      if (['api_console_release_identity_mismatch', 'api_services_startup_failed'].includes(error?.message)) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }
  throw new Error(`VIGIA demo backend did not become service-ready within ${timeoutMs}ms; lastStatus=${last?.status ?? 'unreachable'}`);
}

const sharedEnv = {
  ...process.env,
  NODE_ENV: 'production',
  VIGIA_UNIVERSE: 'production', // required literal accepted by loadConfig(); the demo/production distinction is the separate database, not this flag
  VIGIA_RUNTIME_PROFILE: 'production',
  VIGIA_LOCAL_SECRETS_DISABLED: '1',
  VIGIA_DATABASE_URL: databaseUrl
};

console.log(JSON.stringify({
  level: 'info', component: 'render_demo_start', event: 'migrating_demo_postgis',
  releaseId: buildIdentity.releaseId, databaseMode: 'isolated_demo_postgis'
}));
await run(process.execPath, ['scripts/migrate_postgis.mjs'], { env: sharedEnv });

console.log(JSON.stringify({ level: 'info', component: 'render_demo_start', event: 'seeding_demo_scenario' }));
await run(process.execPath, ['scripts/seed_demo_portfolio_scenario.mjs'], {
  env: { ...sharedEnv, VIGIA_DEMO_CONFIRM: 'SYNTHETIC_DEMO_ONLY' }
});

const apiEnv = {
  ...sharedEnv,
  HOST: '127.0.0.1',
  PORT: '4178',
  OPEN_BROWSER: '0',
  VIGIA_OPERATOR_PROXY_KEY: proxyKey,
  VIGIA_OPERATOR_ACTOR_ID: 'portfolio-demo-observer',
  VIGIA_OPERATOR_NAME: 'Portfolio demo observer',
  VIGIA_OPERATOR_TITLE: 'Read-only VIGIA isolated demo',
  VIGIA_OPERATOR_ROLE: 'supervisor'
};

console.log(JSON.stringify({
  level: 'info', component: 'render_demo_start', event: 'starting_api',
  releaseId: buildIdentity.releaseId, databaseMode: 'isolated_demo_postgis'
}));

const api = spawn(process.execPath, ['apps/api/src/server.mjs'], { cwd: root, env: apiEnv, stdio: 'inherit' });
api.once('error', error => { console.error('[vigia-demo] API process error', error); process.exit(1); });

const release = await waitForBackend();
console.log(JSON.stringify({ level: 'info', component: 'render_demo_start', event: 'api_services_ready', releaseId: release.releaseId }));

const webEnv = {
  ...sharedEnv,
  HOST: '0.0.0.0',
  PORT: externalPort,
  VIGIA_BACKEND_URL: 'http://127.0.0.1:4178',
  VIGIA_OPERATOR_PROXY_KEY: proxyKey,
  VIGIA_OPERATOR_PUBLIC_AUTHORITY: authority,
  VIGIA_OPERATOR_PUBLIC_SCHEME: 'https',
  VIGIA_OPERATOR_PACKAGE_ROOT: path.join(root, 'apps/operator-console'),
  VIGIA_OPERATOR_STATIC_ROOT: 'dist'
};

const web = spawn(process.execPath, ['infra/public-demo-server.mjs'], { cwd: root, env: webEnv, stdio: 'inherit' });
web.once('error', error => { console.error('[vigia-demo] gateway process error', error); process.exit(1); });

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  web.kill('SIGTERM'); api.kill('SIGTERM');
  setTimeout(() => process.exit(code), 3_500).unref();
}
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => shutdown(0));
api.once('exit', (code, signal) => { if (!shuttingDown) { console.error(`[vigia-demo] API exited unexpectedly: ${signal || code}`); shutdown(code || 1); } });
web.once('exit', (code, signal) => { if (!shuttingDown) { console.error(`[vigia-demo] gateway exited unexpectedly: ${signal || code}`); shutdown(code || 1); } });
