# VIGIA reality release gates

No release advances because code exists. It advances only when its executable gate and runtime evidence pass.

| Release | Gate | State | Evidence / blocker |
|---|---|---|---|
| R0 | Production synthetic observations = 0; production graph imports no fixture/test provider; no demo identity or served operational fiction | **PASS** | `npm run reality:gate`: 140 modules, all six integrity checks pass; production smoke survives restart with zero synthetic observations and zero demo identities |
| R1 | Automatically acquire at least one real thermal source; archive original product; advance durable checkpoint only after transactional persistence; restart without duplicate/loss | **FAIL / MOVE 1 BLOCKED** | Poll/backoff, raw quarantine, canonical provenance, event identity and PostGIS transaction are implemented; actual PostGIS and real ptdata report persistence run; FIRMS remains `not_configured`, so no live thermal raw product or physical observation has entered production |
| R2 | Real historical replay proves stable physical-first event identity | **BLOCKED** | No real replay corpus |
| R3 | No operational unknown remains inert | **BLOCKED** | No authenticated owner, connected asset, or confirmed schedule in production |
| R4 | A real historical fire visibly evolves from real sensor geometry with correct freshness | **BLOCKED** | No real thermal series in replay/archive |
| R5 | Real native Sentinel-2 pixels produce a reviewed prevention polygon | **BLOCKED** | Detector campaign and reviewed real finding absent |
| R6 | Historical benchmark and live/shadow run publish measured metrics; unknowns remain `UNMEASURED` | **BLOCKED** | Labels, policy and prospective run absent |

## R0 executable evidence

```text
npm run check
TMPDIR="$PWD/.tmp" npm test
npm run reality:gate
npm run smoke
npm run browser:qa
```

Expected R0 failure conditions include any synthetic production observation, production import of a test/fixture path, legacy fixture switch acceptance, seeded persona, synthetic served asset, or fake field/demo/local-save marker under the served web root.

## Exact next R1 gate step

Provision `NASA_FIRMS_MAP_KEY` through the deployment secret boundary, start production with a fresh acquisition directory, and capture one real VIIRS CSV product through:

```text
FIRMS poll -> raw SHA-256 archive -> canonical observation -> stable event/association -> PostGIS transaction/checkpoint -> API/UI
```

Then kill the API during and after acquisition, restart it, and prove from runtime metadata that the raw product checksum, checkpoint cursor, canonical observation ID and event association are unchanged and not duplicated. If FIRMS credentials remain unavailable, the next real provider work is an owned EUMETSAT MTG FCI FRP acquisition adapter—not a file-drop fixture.
