import pg from 'pg';
import { loadMigrations, runPostgresMigrations } from '../../apps/api/src/modules/storage/postgres-migration-runner.mjs';
import { semanticHash } from '../../packages/domain/src/intelligence/shared.mjs';

const SCHEMA_QUERIES = Object.freeze({
  relations: `SELECT c.relname,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S')
    AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e') ORDER BY c.relname,c.relkind`,
  columns: `SELECT c.relname,a.attname,a.attnum,format_type(a.atttypid,a.atttypmod) data_type,a.attnotnull,
    pg_get_expr(ad.adbin,ad.adrelid) default_expression
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_attrdef ad ON ad.adrelid=a.attrelid AND ad.adnum=a.attnum
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m') AND a.attnum>0 AND NOT a.attisdropped
    AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')
    ORDER BY c.relname,a.attnum`,
  constraints: `SELECT c.relname,con.conname,con.contype,pg_get_constraintdef(con.oid,true) definition
    FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')
    ORDER BY c.relname,con.conname`,
  indexes: `SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public'
    AND tablename NOT IN (SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_depend d ON d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e' WHERE n.nspname='public')
    ORDER BY tablename,indexname`,
  triggers: `SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid,true) definition FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`,
  functions: `SELECT p.proname,pg_get_function_identity_arguments(p.oid) arguments,pg_get_functiondef(p.oid) definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
    AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
    ORDER BY p.proname,arguments`,
  policies: `SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname`
});

async function schemaFingerprint(pool) {
  const entries = await Promise.all(Object.entries(SCHEMA_QUERIES).map(async ([name, sql]) => [name, (await pool.query(sql)).rows]));
  const snapshot = Object.fromEntries(entries); return { fingerprint: semanticHash('postgres-schema-definition', snapshot), snapshot };
}

async function createDatabase(environment, run, suffix) {
  const database = `${environment.database}_${suffix}`; await run('docker', ['exec', environment.container, 'createdb', '-U', environment.user, database]);
  const target = new URL(environment.databaseUrl); target.pathname = `/${database}`;
  return new pg.Pool({ connectionString: target.toString(), max: 4 });
}

const ledger = (pool) => pool.query("SELECT version,name,checksum FROM vigia_schema_migration WHERE version ~ '^[0-9]{3}$' ORDER BY version").then((result) => result.rows);

export async function certifyMigrationConvergence({ environment, run, cleanPool } = {}) {
  if (!environment?.owned) return { state: 'NOT_RUN_EXTERNAL_DATABASE' };
  const clean = await schemaFingerprint(cleanPool), agent1 = await createDatabase(environment, run, 'agent1_upgrade'), agent2 = await createDatabase(environment, run, 'agent2_adoption');
  try {
    const through021 = await runPostgresMigrations(agent1, { through: '021' }), before = await ledger(agent1), hash = `sha256:${'a'.repeat(64)}`;
    await agent1.query(`INSERT INTO intelligence_snapshot(snapshot_version,incident_id,ontology_version,rule_set_version,incident_version,evidence_graph_hash,source_state_version,input_hash,projection_hash,explanation_hash,mode,generated_at,state)
      VALUES('upgrade-seed','incident-upgrade','ontology-test','rules-test',$1,$1,$1,$1,$1,$1,'HISTORICAL','2026-08-25T00:00:00Z','{}')`, [hash]);
    const upgraded = await runPostgresMigrations(agent1), after = await ledger(agent1), upgradeSchema = await schemaFingerprint(agent1);
    const priorChecksumsPreserved = JSON.stringify(before) === JSON.stringify(after.filter((row) => row.version <= '021'));
    const seedPreserved = Number((await agent1.query("SELECT count(*) count FROM intelligence_snapshot WHERE snapshot_version='upgrade-seed'")).rows[0].count) === 1;
    const agent1Result = { state: upgraded.applied.length === 1 && upgraded.applied[0] === '022' && upgraded.skipped.length === 21 && priorChecksumsPreserved && seedPreserved && upgradeSchema.fingerprint === clean.fingerprint ? 'PASS' : 'FAIL', through021: through021.latestVersion, applied: upgraded.applied, skipped: upgraded.skipped, priorChecksumsPreserved, seedPreserved, schemaFingerprint: upgradeSchema.fingerprint, cleanSchemaFingerprint: clean.fingerprint, schemaEquivalent: upgradeSchema.fingerprint === clean.fingerprint };

    await runPostgresMigrations(agent2, { through: '016' });
    const migrations = await loadMigrations(), convergence = migrations.find((item) => item.version === '022');
    await agent2.query(convergence.sql); await agent2.query('INSERT INTO vigia_schema_migration(version,name,checksum,applied_at,execution_ms) VALUES($1,$2,$3,$4,$5)', ['017', 'intelligence-convergence', convergence.checksum, '2026-08-24T00:00:00.000Z', 1]);
    const adopted = await runPostgresMigrations(agent2), aliases = (await agent2.query('SELECT alias_version,canonical_version,original_name,original_checksum FROM vigia_schema_migration_lineage_alias ORDER BY alias_version')).rows, adoptedLedger = await agent2.query("SELECT version,name,checksum FROM vigia_schema_migration WHERE version IN ('017','022','agent2-017-intelligence-convergence') ORDER BY version"), adoptionSchema = await schemaFingerprint(agent2);
    const aliasPreserved = aliases.length === 1 && aliases[0].alias_version === 'agent2-017-intelligence-convergence' && aliases[0].canonical_version === '022' && aliases[0].original_name === 'intelligence-convergence' && aliases[0].original_checksum === convergence.checksum;
    const agent2Result = { state: adopted.applied.join(',') === '017,018,019,020,021,022' && aliasPreserved && adoptionSchema.fingerprint === clean.fingerprint ? 'PASS' : 'FAIL', applied: adopted.applied, skipped: adopted.skipped, aliasPreserved, aliases, governedLedger: adoptedLedger.rows, schemaFingerprint: adoptionSchema.fingerprint, cleanSchemaFingerprint: clean.fingerprint, schemaEquivalent: adoptionSchema.fingerprint === clean.fingerprint };
    return { state: agent1Result.state === 'PASS' && agent2Result.state === 'PASS' ? 'PASS' : 'FAIL', cleanInstall: { migrationHead: '022', schemaFingerprint: clean.fingerprint }, agent1Upgrade: agent1Result, agent2LineageAdoption: agent2Result };
  } finally { await Promise.all([agent1.end(), agent2.end()]); }
}
