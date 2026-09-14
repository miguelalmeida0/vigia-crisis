import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { VIGIA_RELEASE_CONTRACT } from '../../../../../packages/domain/src/release-contract.mjs';

const definitions = Object.freeze([
  ['001', 'physical-truth', new URL('./migrations/001-physical-truth.sql', import.meta.url)],
  ['002', 'operational-work', new URL('./migrations/002-operational-work.sql', import.meta.url)],
  ['003', 'category-reset', new URL('./migrations/003-category-reset.sql', import.meta.url)],
  ['004', 'flagship-productization', new URL('./migrations/004-flagship-productization.sql', import.meta.url)],
  ['005', 'prevention-review-lab', new URL('./migrations/005-prevention-review-lab.sql', import.meta.url)],
  ['006', 'detection-proof', new URL('./migrations/006-detection-proof.sql', import.meta.url)],
  ['007', 'prospective-causality', new URL('./migrations/007-prospective-causality.sql', import.meta.url)],
  ['008', 'live-operations', new URL('./migrations/008-live-operations.sql', import.meta.url)],
  ['009', 'operations-recovery', new URL('./migrations/009-operations-recovery.sql', import.meta.url)],
  ['010', 'autonomous-evidence-operations', new URL('./migrations/010-autonomous-evidence-operations.sql', import.meta.url)],
  ['011', 'physical-truth-autopilot', new URL('./migrations/011-physical-truth-autopilot.sql', import.meta.url)],
  ['012', 'decision-ledger-autopilot', new URL('./migrations/012-decision-ledger-autopilot.sql', import.meta.url)],
  ['013', 'command-survival', new URL('./migrations/013-command-survival.sql', import.meta.url)],
  ['014', 'command-evidence-envelope', new URL('./migrations/014-command-evidence-envelope.sql', import.meta.url)],
  ['015', 'partial-incident-import', new URL('./migrations/015-partial-incident-import.sql', import.meta.url)],
  ['016', 'security-identity-boundaries', new URL('./migrations/016-security-identity-boundaries.sql', import.meta.url)],
  ['017', 'intelligence-fabric', new URL('./migrations/017-intelligence-fabric.sql', import.meta.url)],
  ['018', 'intelligence-security-hardening', new URL('./migrations/018-intelligence-security-hardening.sql', import.meta.url)],
  ['019', 'release-identity-capacity-counters', new URL('./migrations/019-release-identity-capacity-counters.sql', import.meta.url)],
  ['020', 'release-trust-intelligence-generation', new URL('./migrations/020-release-trust-intelligence-generation.sql', import.meta.url)],
  ['021', 'intelligence-mutation-ownership', new URL('./migrations/021-intelligence-mutation-ownership.sql', import.meta.url)],
  ['022', 'intelligence-convergence', new URL('./migrations/022-intelligence-convergence.sql', import.meta.url)],
  ['023', 'world-knowledge', new URL('./migrations/023-world-knowledge.sql', import.meta.url)],
  ['024', 'incident-situation', new URL('./migrations/024-incident-situation.sql', import.meta.url)],
  ['025', 'road-source-history', new URL('./migrations/025-road-source-history.sql', import.meta.url)]
].map(([version, name, url]) => Object.freeze({ version, name, url })));

function checksum(sql) { return `sha256:${createHash('sha256').update(sql).digest('hex')}`; }
function executableSql(sql){return sql.replace(/\bINSERT\s+INTO\s+vigia_schema_migration\s*\(version\)\s*VALUES\s*\('[^']+'\)\s*ON\s+CONFLICT\s*\(version\)\s*DO\s+NOTHING\s*;?/gi,'');}

export function migrationDefinitions({ through = VIGIA_RELEASE_CONTRACT.migrationHead, from = '001' } = {}) {
  return definitions.filter((item) => item.version >= from && item.version <= through);
}

export async function loadMigrations(options = {}) {
  return Promise.all(migrationDefinitions(options).map(async (item) => {
    const sql = await readFile(item.url, 'utf8');
    return { ...item, sql, checksum: checksum(sql) };
  }));
}

export async function runPostgresMigrations(pool, { through = VIGIA_RELEASE_CONTRACT.migrationHead, from = '001', clock = () => new Date() } = {}) {
  const migrations = await loadMigrations({ through, from });
  const client = await pool.connect();
  const applied = []; const skipped = [];
  const startedAt = performance.now();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('vigia-schema-migrations-v1'))");
    await client.query(`CREATE TABLE IF NOT EXISTS vigia_schema_migration (
      version text PRIMARY KEY,
      name text NOT NULL DEFAULT 'legacy-self-recorded',
      checksum text NOT NULL DEFAULT 'legacy:self-recorded',
      applied_at timestamptz NOT NULL DEFAULT now(),
      execution_ms integer NOT NULL DEFAULT 0 CHECK (execution_ms >= 0)
    )`);
    await client.query(`ALTER TABLE vigia_schema_migration
      ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT 'legacy-self-recorded',
      ADD COLUMN IF NOT EXISTS checksum text NOT NULL DEFAULT 'legacy:self-recorded',
      ADD COLUMN IF NOT EXISTS execution_ms integer NOT NULL DEFAULT 0 CHECK (execution_ms >= 0)`);
    await client.query(`CREATE TABLE IF NOT EXISTS vigia_schema_migration_lineage_alias (
      alias_version text PRIMARY KEY,
      canonical_version text NOT NULL,
      original_name text NOT NULL,
      original_checksum text NOT NULL,
      original_applied_at timestamptz,
      adopted_at timestamptz NOT NULL,
      reason text NOT NULL
    )`);
    const existing = await client.query("SELECT version,name,checksum,applied_at,execution_ms FROM vigia_schema_migration WHERE version ~ '^[0-9]{3}$' ORDER BY version");
    let existingRows = existing.rows;
    const convergence = migrations.find((item) => item.version === '022');
    const agent2Legacy = existingRows.find((row) => row.version === '017' && row.name === 'intelligence-convergence');
    if (agent2Legacy && convergence && agent2Legacy.checksum === convergence.checksum) {
      const aliasVersion = 'agent2-017-intelligence-convergence';
      await client.query(`INSERT INTO vigia_schema_migration_lineage_alias(alias_version,canonical_version,original_name,original_checksum,original_applied_at,adopted_at,reason)
        VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(alias_version) DO NOTHING`, [aliasVersion, convergence.version, agent2Legacy.name, agent2Legacy.checksum, agent2Legacy.applied_at, clock().toISOString(), 'Agent 2 pre-convergence lineage preserved; canonical schema re-expressed by forward migration 022.']);
      await client.query('UPDATE vigia_schema_migration SET version=$1 WHERE version=$2 AND name=$3 AND checksum=$4', [aliasVersion, '017', agent2Legacy.name, agent2Legacy.checksum]);
      existingRows = existingRows.filter((row) => row !== agent2Legacy);
    }
    const byVersion = new Map(existingRows.map((row) => [row.version, row]));
    for (const migration of migrations) {
      const prior = byVersion.get(migration.version);
      if (prior) {
        if (prior.checksum !== migration.checksum) throw new Error(`schema_migration_checksum_mismatch:${migration.version}`);
        skipped.push(migration.version); continue;
      }
      const migrationStartedAt = performance.now();
      await client.query(executableSql(migration.sql));
      const executionMs = Math.max(0, Math.round(performance.now() - migrationStartedAt));
      await client.query('INSERT INTO vigia_schema_migration(version,name,checksum,applied_at,execution_ms) VALUES($1,$2,$3,$4,$5)', [migration.version, migration.name, migration.checksum, clock().toISOString(), executionMs]);
      applied.push(migration.version);
    }
    const postgis = await client.query('SELECT PostGIS_Version() version');
    await client.query('COMMIT');
    return { state: 'current', latestVersion: migrations.at(-1)?.version ?? null, applied, skipped, executionMs: Math.max(0, Math.round(performance.now() - startedAt)), postgisVersion: postgis.rows[0]?.version ?? null };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

export async function inspectMigrationState(pool) {
  const expected = await loadMigrations();
  const exists = await pool.query("SELECT to_regclass('public.vigia_schema_migration') migration_table");
  if (!exists.rows[0]?.migration_table) return { state: 'migration_required', latestVersion: null, expectedLatestVersion: expected.at(-1)?.version ?? null, applied: [] };
  const result = await pool.query('SELECT version,name,checksum,applied_at,execution_ms FROM vigia_schema_migration ORDER BY version');
  const expectedByVersion = new Map(expected.map((item) => [item.version, item]));
  const governedRows = result.rows.filter((row) => expectedByVersion.has(row.version));
  const legacyRows = result.rows.filter((row) => !expectedByVersion.has(row.version));
  const drift = governedRows.filter((row) => expectedByVersion.get(row.version).checksum !== row.checksum).map((row) => row.version);
  const appliedVersions = new Set(governedRows.map((row) => row.version));
  const missing = expected.filter((item) => !appliedVersions.has(item.version)).map((item) => item.version);
  return { state: drift.length ? 'checksum_mismatch' : missing.length ? 'migration_required' : 'current', latestVersion: governedRows.at(-1)?.version ?? null, expectedLatestVersion: expected.at(-1)?.version ?? null, missing, drift, applied: governedRows, lineageAliases:legacyRows.filter((row)=>row.version.startsWith('agent2-')).map((row)=>row.version), legacySelfRecorded: legacyRows.filter((row)=>!row.version.startsWith('agent2-')).map((row) => row.version) };
}
