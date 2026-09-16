// ONE-TIME, SAFE reset for the ISOLATED VIGIA Portfolio Demo database only.
//
// Purpose: several earlier deploy attempts (before the deterministic-seed
// fixes in this same change) left the isolated demo Postgres/PostGIS
// database with scattered, mutually-inconsistent synthetic state — stray
// sensor observations and canonical events from non-deterministic
// observedAt values, and an incident-command import permanently pinned to a
// canonical event id no later boot could reproduce
// (duplicate_incident_identity_conflict, then incident_import_confirmation_rejected).
// That state is disposable synthetic demo data with zero operational value;
// reconciling it in place is not worth the time against today's deadline.
// This script wipes ONLY the application tables in the target database (not
// the postgis extension itself, so `CREATE EXTENSION postgis` never needs
// to be redone) so the very next boot's normal migrate+seed sequence
// (infra/render-demo-start.mjs -> scripts/migrate_postgis.mjs ->
// scripts/seed_demo_portfolio_scenario.mjs) rebuilds an empty schema and
// reseeds the one deterministic synthetic incident from scratch.
//
// SAFETY — mirrors every guard scripts/seed_demo_portfolio_scenario.mjs and
// infra/render-demo-start.mjs already enforce, plus two more specific to a
// destructive operation:
//   - refuses to run unless VIGIA_DEMO_CONFIRM=SYNTHETIC_DEMO_ONLY is set;
//   - refuses to run if VIGIA_DATABASE_URL contains a known production
//     identifier ("vigia-public-demo-db", "vigia-live");
//   - refuses to run without VIGIA_DATABASE_URL;
//   - DRY-RUN BY DEFAULT: prints exactly which tables would be dropped and
//     exits without changing anything. Add --yes-destroy-demo-data to
//     actually execute the drop. This is a second, independent safety gate
//     on top of the environment-variable guard, specifically because this
//     script is destructive where the seed script is not.
//   - only ever targets tables in the `public` schema that do NOT belong to
//     the postgis/postgis_topology/postgis_raster extensions (discovered
//     via pg_depend, not a hardcoded table list, so it never drifts from
//     whatever the migrations actually created).
//
// This script does not run automatically anywhere and is never invoked by
// render-demo-start.mjs, CI, or any other script. It is meant to be run
// once, by hand, against the isolated demo's own Neon connection string,
// with the person running it able to read exactly what it is about to do
// before it does it.
//
// Usage:
//   VIGIA_DEMO_CONFIRM=SYNTHETIC_DEMO_ONLY VIGIA_DATABASE_URL="<neon demo url>" \
//     node scripts/reset_demo_portfolio_database.mjs                 # dry run — prints the plan only
//   VIGIA_DEMO_CONFIRM=SYNTHETIC_DEMO_ONLY VIGIA_DATABASE_URL="<neon demo url>" \
//     node scripts/reset_demo_portfolio_database.mjs --yes-destroy-demo-data   # actually drops the tables
//
// After a successful drop, either restart the vigia-portfolio-demo Render
// service (its normal boot sequence migrates and reseeds automatically), or
// run locally against the same VIGIA_DATABASE_URL:
//   node scripts/migrate_postgis.mjs && VIGIA_DEMO_CONFIRM=SYNTHETIC_DEMO_ONLY node scripts/seed_demo_portfolio_scenario.mjs

import pg from 'pg';

const KNOWN_PRODUCTION_MARKERS = ['vigia-public-demo-db', 'vigia-live'];
const EXECUTE = process.argv.includes('--yes-destroy-demo-data');

function requireDemoConfirmation() {
  if (process.env.VIGIA_DEMO_CONFIRM !== 'SYNTHETIC_DEMO_ONLY') {
    throw new Error('Refusing to reset: set VIGIA_DEMO_CONFIRM=SYNTHETIC_DEMO_ONLY to confirm the target database is the isolated demo/shadow database and never production.');
  }
  const url = String(process.env.VIGIA_DATABASE_URL || '');
  if (!url) throw new Error('VIGIA_DATABASE_URL is required.');
  for (const marker of KNOWN_PRODUCTION_MARKERS) {
    if (url.toLowerCase().includes(marker)) throw new Error(`Refusing to reset: VIGIA_DATABASE_URL contains "${marker}", a known production identifier.`);
  }
  return url;
}

async function discoverApplicationTables(pool) {
  const { rows } = await pool.query(`
    SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        JOIN pg_extension e ON e.oid = d.refobjid
        WHERE d.objid = c.oid AND d.deptype = 'e'
          AND e.extname IN ('postgis', 'postgis_topology', 'postgis_raster')
      )
    ORDER BY c.relname
  `);
  return rows.map((row) => row.name);
}

async function main() {
  const databaseUrl = requireDemoConfirmation();
  const pool = new pg.Pool({ connectionString: databaseUrl, application_name: 'vigia-demo-reset-job', connectionTimeoutMillis: 5_000, query_timeout: 60_000, statement_timeout: 60_000, max: 1 });
  try {
    const tables = await discoverApplicationTables(pool);
    console.log(JSON.stringify({ step: 'plan', mode: EXECUTE ? 'EXECUTE' : 'DRY_RUN', databaseTables: tables.length, tables }));
    if (!tables.length) {
      console.log(JSON.stringify({ step: 'nothing_to_do', note: 'No application tables found — database is already empty (or migrations have never run).' }));
      return;
    }
    if (!EXECUTE) {
      console.log(JSON.stringify({
        step: 'dry_run_complete',
        note: 'No changes made. Re-run with --yes-destroy-demo-data to actually drop the tables listed above from THIS database (the one named by VIGIA_DATABASE_URL). The postgis extension itself is never touched.',
      }));
      return;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('vigia-schema-migrations-v1'))");
      const quoteIdentifier = (name) => `"${String(name).replace(/"/g, '""')}"`;
      for (const table of tables) await client.query(`DROP TABLE IF EXISTS public.${quoteIdentifier(table)} CASCADE`);
      await client.query('COMMIT');
      console.log(JSON.stringify({ step: 'reset_complete', droppedTables: tables.length, note: 'Isolated demo database wiped to an empty application schema. Restart the vigia-portfolio-demo Render service, or run scripts/migrate_postgis.mjs then scripts/seed_demo_portfolio_scenario.mjs locally against the same VIGIA_DATABASE_URL, to rebuild and reseed deterministically.' }));
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ step: 'reset_failed', error: String(error?.message ?? error) }));
  process.exitCode = 1;
});
