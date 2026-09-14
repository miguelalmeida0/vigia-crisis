import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdir, realpath, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { semanticHash } from '../../../../../packages/domain/src/intelligence/shared.mjs';
import { decisionFoundryPaths } from './decision-foundry-paths.mjs';

const execute = promisify(execFile), script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'validate_geometry.py');
export async function validateProgressionGeometries({ projectRoot = process.cwd(), incident, maximumStates = 250 } = {}) {
  if (!incident?.id || !Array.isArray(incident.perimeterStates) || incident.perimeterStates.length > maximumStates) throw new Error('progression_geometry_input_invalid_or_oversized');
  const runtime = decisionFoundryPaths(projectRoot).runtime, scratch = path.join(runtime, 'scratch'); await mkdir(scratch, { recursive: true, mode: 0o700 }); const file = path.join(scratch, `geometry-${randomUUID()}.json`), states = [...incident.perimeterStates].sort((a, b) => Date.parse(a.clocks?.observedAt) - Date.parse(b.clocks?.observedAt) || String(a.id).localeCompare(String(b.id))), payload = { items: states.map((state, index) => ({ stateId: state.id, geometry: state.geometry, previousGeometry: states[index - 1]?.geometry ?? null })) };
  await writeFile(file, JSON.stringify(payload), { mode: 0o600, flag: 'wx' });
  try { const resolved = await realpath(file); if (!resolved.startsWith(`${await realpath(scratch)}${path.sep}`)) throw new Error('geometry_scratch_path_escape'); const { stdout } = await execute(path.join(projectRoot, '.venv/bin/python'), [script, resolved], { cwd: projectRoot, timeout: 30_000, maxBuffer: 16 * 1024 * 1024, env: { PATH: process.env.PATH, PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1' } }), output = JSON.parse(stdout); if (!output.ok || !Array.isArray(output.rows)) throw new Error(`geometry_engine_failed:${output.error ?? 'invalid_output'}`); return { ...output, rows: output.rows.map((row) => ({ ...row, fingerprint: semanticHash('geometry-stability-result', row) })) }; } finally { await unlink(file).catch(() => {}); }
}
