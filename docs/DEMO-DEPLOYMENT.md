# VIGIA Portfolio Demo — isolated deployment

This deploys a second, fully separate instance of the real VIGIA backend
(same code, same PostGIS-backed intelligence/routing/Ask VIGIA pipeline) with
one clearly labelled synthetic exercise incident, against a database that is
physically incapable of touching production. It never modifies `vigia-live`
or the production database.

## Why this is a separate database, not a flag

`apps/api/src/config/env.mjs` hardcodes `universe: 'production'` for the
production server entrypoint and forbids the legacy `VIGIA_FIXTURES` switch
entirely — there is no supported "demo mode" toggle on the production
service. The only architecturally sound isolation is a separate database that
only the demo service is ever configured to reach. `infra/render-demo-start.mjs`
additionally hard-refuses to start if `VIGIA_DATABASE_URL` contains
`vigia-public-demo-db` or `vigia-live` (the known production identifiers), and
refuses to run at all unless `VIGIA_DEMO_CONFIRM=SYNTHETIC_DEMO_ONLY` is set.

The scenario itself is seeded through VIGIA's own governed domain import
paths (`scripts/seed_demo_portfolio_scenario.mjs`) — signed sensor ingestion
through `SensorIngestService`, then a `universe:'SHADOW'` incident-command
import through `IncidentCommandService` (SHADOW is a first-class, enforced
domain concept: the ingestion contract already refuses to let SHADOW-adapter
data enter `PRODUCTION` truth). Every resulting command event is
automatically stamped `exercise:true`. Verified locally end-to-end against a
throwaway PostGIS container — see the session record for the exact
`incident.universe: "SHADOW"` read-back.

## The exact limitation found on Render (as of Sept 2026)

Render's free Postgres plan has a fixed **1 GB storage cap**, **expires 30
days after creation** (14-day grace period, then deleted), and — critically —
**only one free Postgres database is allowed per Render workspace**. The
production `vigia-public-demo-db` already occupies that workspace. Whether or
not it currently uses the free slot, a second free Postgres in the same
workspace either is rejected outright or would silently expire in 44 days,
which is unsuitable for a portfolio piece meant to stay reachable.

Render's free **web service** plan has no such problem: 750 free instance
hours/month per workspace, spins down after 15 minutes idle, ~1 minute cold
restart. That part is fine at zero cost.

**Recommendation: keep the web service on Render (free), put the isolated
demo database on Neon** (neon.com) instead of Render Postgres. Neon's free
tier is permanent (no expiry), supports PostGIS fully, and the demo's actual
storage footprint (one incident, a handful of records) is trivial next to its
limits. This keeps the whole deployment at zero cost indefinitely, with no
paid resource anywhere.

If you'd rather keep both pieces on Render, the alternative is a paid Starter
Postgres — that requires your explicit approval before I'd ever select it,
per your instructions.

## What's already done, verified locally

- `render.demo.yaml` — a Render Blueprint for the demo web service. It does
  **not** declare a `databases:` block, so it will never auto-provision a
  Postgres instance on its own — you supply `VIGIA_DATABASE_URL` yourself.
- `infra/render-demo-start.mjs` / `infra/public-demo-server.mjs` — sibling
  files to the production `render-live-start.mjs` / `public-live-server.mjs`,
  never edited. Same real API server, same PostGIS migration
  (`scripts/migrate_postgis.mjs`), same read-only signed gateway. The
  `/__operator/ready` disclaimer and an `X-VIGIA-Deployment` header make the
  synthetic/demo nature machine-readable, on top of the domain-level
  `universe:'SHADOW'` / `exercise:true` labelling already on every record.
- `scripts/seed_demo_portfolio_scenario.mjs` — deterministic and idempotent
  (safe to run on every deploy/restart; skips if already seeded). Runs
  automatically on first boot via `render-demo-start.mjs`, so a visitor never
  has to set anything up.
- Full local round-trip verified against a throwaway `vigia-demo-postgis`
  Docker container: migrations reached the same head (`025`) as production,
  two independent signed sensor observations fused into one genuine
  multisource canonical event, the SHADOW incident-command import accepted
  13 records, and the real authenticated HTTP API read all of it back
  correctly.

## The one thing you need to do

1. Create a free Neon Postgres project (neon.com → New Project). Enable the
   `postgis` extension (Neon docs: `CREATE EXTENSION postgis;` in the SQL
   editor, or the Neon dashboard's extension picker). Copy its connection
   string.
2. In the Render dashboard: **New → Blueprint**, point it at this repo/branch
   (`integration/vigia-xiii`), and let it pick up `render.demo.yaml`. When it
   asks for the two `sync: false` env vars, paste in:
   - `VIGIA_DATABASE_URL` — the Neon connection string from step 1.
   - `VIGIA_OPERATOR_PUBLIC_AUTHORITY` — leave blank on first deploy, then
     set it to the `*.onrender.com` hostname Render assigns and redeploy.
3. Send me the resulting demo URL and I'll verify it live and continue.

No credentials or API keys need to come through this chat.
