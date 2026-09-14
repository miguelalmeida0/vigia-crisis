import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { access } from 'node:fs/promises';
import { dataFoundryPaths } from './foundry-paths.mjs';
import { DataFoundryStore } from './foundry-store.mjs';

const execute = promisify(execFile);
export async function runDataFoundryDoctor({ projectRoot = process.cwd() } = {}) {
  const paths = dataFoundryPaths(projectRoot), python = path.join(projectRoot, '.venv/bin/python'), checks = [];
  try { await access(python); const { stdout } = await execute(python, ['-c', 'import json,rasterio; e=rasterio.Env(); e.__enter__(); d=e.drivers(); e.__exit__(None,None,None); print(json.dumps({"rasterio":rasterio.__version__,"grib":"GRIB" in d}))'], { timeout: 10_000, maxBuffer: 64 * 1024, env: { PATH: path.dirname(python) } }); const detail = JSON.parse(stdout); checks.push({ id: 'HRRR_TRUSTED_DECODER', state: detail.grib ? 'READY' : 'BLOCKED', detail }); } catch (error) { checks.push({ id: 'HRRR_TRUSTED_DECODER', state: 'BLOCKED', detail: String(error.message).slice(0, 200) }); }
  const state = await new DataFoundryStore({ filePath: paths.state }).read(); checks.push({ id: 'FILE_BACKED_RUNTIME', state: 'READY' }, { id: 'EVENT_CHAIN', state: DataFoundryStore.verifyEventChain(state) ? 'READY' : 'BLOCKED' }, { id: 'POSTGIS', state: 'BLOCKED_EXTERNAL_ACCESS', detail: 'Authenticated local credentials unavailable.' });
  return { schemaVersion: 'vigia.data-foundry-doctor.v1', ready: checks.filter((item) => item.state === 'READY').length, blocked: checks.filter((item) => item.state !== 'READY').length, checks };
}
