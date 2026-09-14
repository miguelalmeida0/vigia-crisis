import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveLocalDatabaseUrl } from './local_database_secret.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function run(command, args, env = process.env) { return new Promise((resolve, reject) => { const child = spawn(command, args, { cwd: root, env, stdio: 'inherit' }); child.once('error', reject); child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`${command}_failed:${code}`))); }); }
await run(process.execPath, ['scripts/db_up.mjs']);
const databaseUrl = await resolveLocalDatabaseUrl();
const operatorToken=process.env.VIGIA_OPERATOR_TOKEN||randomBytes(32).toString('base64url'),runtimeDir=path.join(root,'.tmp/release'),operatorTokenFile=path.join(runtimeDir,'operator-token');await mkdir(runtimeDir,{recursive:true,mode:0o700});await writeFile(operatorTokenFile,`${operatorToken}\n`,{mode:0o600});await chmod(operatorTokenFile,0o600);
const server = spawn(process.execPath, ['apps/api/src/server.mjs'], { cwd: root, env: { ...process.env, VIGIA_OPERATOR_TOKEN:operatorToken,VIGIA_DATABASE_URL: databaseUrl, VIGIA_RUNTIME_PROFILE: 'local_shadow', VIGIA_LOCAL_OPERATOR_AUTOLOGIN: '1', HOST: '127.0.0.1', PORT: process.env.PORT || '4177', OPEN_BROWSER: process.env.OPEN_BROWSER || '0' }, stdio: 'inherit' });
const shutdown = (signal) => { if (server.exitCode === null) server.kill(signal); };
process.once('SIGINT', () => shutdown('SIGINT')); process.once('SIGTERM', () => shutdown('SIGTERM'));
server.once('error', (error) => { throw error; }); server.once('close', (code) => process.exitCode = code ?? 1);
