#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { semanticHash } from '../packages/domain/src/intelligence/shared.mjs';
import { VIGIA_RELEASE_CONTRACT } from '../packages/domain/src/release-contract.mjs';
import { writeJsonAtomic } from '../apps/api/src/shared/json-file.mjs';

const exec = promisify(execFile), root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), startedAt = new Date().toISOString(); let stdout = '', stderr = '', exitCode = 0;
try { const result = await exec('npm', ['test'], { cwd: root, timeout: 600_000, maxBuffer: 64 * 1024 * 1024 }); stdout = result.stdout; stderr = result.stderr; }
catch (error) { stdout = String(error.stdout ?? ''); stderr = String(error.stderr ?? ''); exitCode = Number(error.code) || 1; }
const output = `${stdout}\n${stderr}`, count = (name) => Number([...output.matchAll(new RegExp(`ℹ ${name} (\\d+)`, 'g'))].at(-1)?.[1] ?? 0), failureFiles = [...new Set([...output.matchAll(/test at ([^:\n]+):\d+:\d+/g)].map((match) => match[1]))].sort(), tests = count('tests'), passed = count('pass'), failed = count('fail'), skipped = count('skipped');
const handshakePath = 'apps/web/src/v2/release-compatibility.js', handshakeSource = await readFile(path.join(root, handshakePath), 'utf8').catch(() => ''), observedSchemaContract = handshakeSource.match(/databaseSchemaVersion:'(vigia-postgis-\d{3})'/)?.[1] ?? null, expectedSchemaContract = VIGIA_RELEASE_CONTRACT.databaseSchemaVersion, releaseHandshakeMismatch = failureFiles.includes('apps/api/test/release-contract-governance.test.mjs') && observedSchemaContract !== null && observedSchemaContract !== expectedSchemaContract;
const frontendOwnedFailureFiles = releaseHandshakeMismatch ? ['apps/api/test/release-contract-governance.test.mjs'] : [], backendOwnedFailureFiles = failureFiles.filter((file) => !frontendOwnedFailureFiles.includes(file));
const core = { schemaVersion: 'vigia.integrated-quality-certification.v1', command: 'npm test', tests, passed, failed, skipped, processExitCode: exitCode, failureFiles, backendOwnedFailureFiles, frontendOwnedFailureFiles, backendOwnedFailures: backendOwnedFailureFiles.length, knownFrontendIntegrationGate: failed === 1 && frontendOwnedFailureFiles.length === 1, frontendIntegrationEvidence: releaseHandshakeMismatch ? { sourcePath: handshakePath, expectedSchemaContract, observedSchemaContract } : null, state: failed === 0 ? 'PASS' : backendOwnedFailureFiles.length === 0 && frontendOwnedFailureFiles.length === failed ? 'BACKEND_CLEAN_FRONTEND_INTEGRATION_GATE' : 'BACKEND_FAILURE' }, report = { ...core, startedAt, completedAt: new Date().toISOString(), fingerprint: semanticHash('integrated-quality-certification', core) };
await writeJsonAtomic(path.join(root, 'data/validation/worldclass/integrated-quality.json'), report); process.stdout.write(`${JSON.stringify(report, null, 2)}\n`); if (failed > 0) process.exitCode = 3;
