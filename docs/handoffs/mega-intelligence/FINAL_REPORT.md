# VIGIA — persistent intelligence delivery

12 September 2026. Software and deterministic integration verified; local Qwen inference failed. This is a local rehearsal, not production certification or a claim of complete national knowledge.

The running application now resolves the incorrectly mapped Évora prosecutor office through a reusable official-directory pipeline, persists its identity and field provenance in PostgreSQL/PostGIS, and displays the official address and contact in the existing facility sheet. Normal facility reads do not invoke a model.

Runtime: **http://127.0.0.1:4290/**. API: 4177. FieldNet: 4188. Port 4190 belongs to the separate Flow application and was preserved. Release: `vigia-intelligence-fabric-7e178737a58cd7f9`; status `LOCAL_REHEARSAL_UNSEALED`.

## Architecture

Extended the existing intelligence module, application services and PostgreSQL pool. No graph database, vector service, paid inference provider, chatbot or parallel incident stack was introduced.

Migration 023 adds canonical entities with indexed PostGIS points, source documents, field assertions, source registrations, durable jobs and incident relationships. The service materializes accepted facts for the existing response repository and incident-context projection. The operator response DTO explicitly preserves canonical identity, structured address/contact, presentation semantics and provenance; browser testing caught and fixed an earlier DTO truncation that otherwise hid these fields from the actual sheet.

The ingestion boundary validates approved URLs, public DNS destinations, content types, document sizes, timeouts, source passages and candidate values. Redirects are rejected. External documents cannot execute tools or SQL. Model output has a strict schema and remains a candidate. Unsupported values, wrong subjects, unsafe operational classifications and unreviewed high-risk assertions are rejected.

Read-only API routes expose facility detail, health and whitelisted queries. Incident relationships require incident scope; malformed coordinate pairs are rejected. Existing authentication and authorization remain in place.

## Entity resolution

Deterministic matching uses normalized Portuguese names/aliases, abbreviation normalization, external identities, telephone evidence, municipality, geographic distance and branch qualifiers. Hard geographic/municipality/branch conflicts block merging; close competing matches abstain. Address text is not currently a matching score. The optional model interface can propose matches but does not override these constraints.

Field precedence is owning authority, government, municipal authority, explicit OSM, place provider, reverse geocoder, then approximate geometry. Lower-priority disagreements remain in provenance. Equal-authority conflicts withhold the disputed value instead of falling back to weaker UI data. Reverse-geocoded context cannot become a confirmed postal address.

The original `osm:node:6233153426`, previously police with no street address, resolves to canonical entity `entity:865fc696c7d5157790a4f818`:

- **DIAP da Comarca de Évora - Évora**
- **Public prosecution service**
- **Av. D. Manuel Trindade Salgueiro, n.º16, 7005-839 Évora**
- **266 760 060**; `evora.diap@tribunais.org.pt`
- Source: [Ministério Público contact directory](https://www.ministeriopublico.pt/contactos), with the facility-specific source link retained.

The directory adapter processes all matching records, not a hard-coded correction for this entity. Public institutions remain available as mapped/contact context and cannot lead response-support rankings. Shelter capacity and shelter opening-status fields are not applicable and are omitted.

## Portugal pilot

The original 100 real governed map records were retained: 34 around Évora, 33 around Coimbra and 33 around Leiria, including 36 unnamed hard records. All 14 regional official MP records were added, with the matching DIAP record deduplicated: **113 unique pilot facilities**. No difficult original record was removed.

| Outcome | Count |
|---|---:|
| Total | 113 |
| Resolved | 14 |
| Partially resolved | 63 |
| Ambiguous | 0 |
| Unresolved | 36 |
| Incorrect in known regression/source-consistency review | 0 |

“Incorrect: 0” is limited to the known classification regression and source-consistency checks. It is not an independent ground-truth audit of every physical facility. Map classifications and coordinates remain source claims until corroborated. No critical false operational claim was admitted in the reviewed set.

Types: 19 water points, 18 health centers, 16 police stations, 14 hospitals, 14 fire stations, 17 generic map shelters, 10 public prosecutors and 5 other public facilities. Civil-protection/municipal-building coverage and authoritative emergency-refuge coverage are not established by this pilot.

The store contains 200 entity records, 5,353 historical assertions and 7 documents at benchmark time. Entity records include redirects/history and the wider directory ingestion; **200 is not the reviewed pilot denominator or a count of independently resolved facilities**.

## Field coverage

| Field | Present / 113 | Coverage |
|---|---:|---:|
| Name | 77 | 68.14% |
| Source classification/type | 113 | 100.00% |
| Street address | 57 | 50.44% |
| Phone | 45 | 39.82% |
| Website | 34 | 30.09% |
| Operator | 25 | 22.12% |

**Authoritative address recovery: 14/14 = 100%** of the address-bearing MP records in the reviewed three-area official source set. This exceeds the ≥90% recovery target for that explicit source set. It does **not** mean 90% authoritative address coverage across the 113 facilities. All-pilot street-address coverage is 50.44%, with many addresses coming only from OSM. The narrow authoritative source breadth remains a material gap.

Evidence: `data/reference/facility-intelligence/pilot-baseline.json`, `pilot-review.json` and `source-manifest.json`; reproduce with `node scripts/knowledge_pilot.mjs` against the configured local database.

## AI

Primary adapter: backend-only **Qwen3.5:4b through Ollama**. Ollama was already installed. The model was downloaded into workspace-local `.tmp/ollama-models`; no system software was installed. Default endpoint remains `http://127.0.0.1:11434`; this rehearsal uses an isolated server on 11435.

**Real inference: FAIL — 0 successful / 16 failed attempts.** Eight representative Portuguese inputs were run first with default GPU settings, then with `num_gpu: 0`. The runner returned errors/crashed in both configurations. Installed model tags are not evidence of working inference; health exposes `installed` separately from `inferenceVerified` and last inference state.

| Case | GPU attempt ms | CPU override ms | Result |
|---|---:|---:|---|
| Address/phone | 7,997 | 9,318 | Failed |
| Portuguese accents | 5,945 | 9,168 | Failed |
| Abbreviation | 5,254 | 15,891 | Failed |
| Negation | 5,212 | 22,991 | Failed |
| Historical language | 7,315 | 18,501 | Failed |
| Multiple facilities | 5,216 | 34,769 | Failed |
| Dates | 5,118 | 10,999 | Failed |
| Prompt injection | 4,263 | 11,331 | Failed |

These are failed request latencies, not inference performance or extraction quality scores. The synthetic evaluation texts were never ingested into live knowledge. No claim is made that Qwen currently understands these cases on this host. Deterministic validation, abstention and rejection tests pass independently of the failed model.

Evidence: `model-evaluation.json`, `model-gpu-attempt.json`, `.tmp/mega-intelligence/model-eval.log` and `model-eval-cpu.log`. The GPU JSON was reconstructed from its original execution log after detecting that the initial archive accidentally duplicated the CPU report; the report states that provenance explicitly.

Fallback: stored facts and deterministic adapters continue; difficult document enrichment becomes durable pending/degraded work. No paid fallback and no inference during facility clicks. Normal runtime checks and the benchmark recorded **0 model calls**.

Reproduction, using the already installed Ollama:

```sh
OLLAMA_MODELS="$PWD/.tmp/ollama-models" OLLAMA_HOST=127.0.0.1:11435 ollama serve
```

In another terminal:

```sh
VIGIA_OLLAMA_URL=http://127.0.0.1:11435 node scripts/knowledge_model_eval.mjs
VIGIA_OLLAMA_URL=http://127.0.0.1:11435 VIGIA_OLLAMA_NUM_GPU=0 node scripts/knowledge_model_eval.mjs
```

These commands reproduce the adapter evaluation; they are not a promise to repair the host runner. The requested portfolio statement that a working local model assists extraction is **not yet justified**.

## Source ingestion

| Source/material | Implemented and verified scope |
|---|---|
| Ministério Público HTML directory | Real approved acquisition, deterministic parsing of 100 contact records, source passages and generic institution classification |
| Governed OSM baseline | Existing checksum-governed archive; original 100-facility pilot, retained aliases/classifications/locations |
| IPMA, FIRMS and official incident feeds | Existing runtime integrations preserved; consumed as sourced incident context rather than re-created by the model |
| JSON, CSV, GeoJSON | Bounded deterministic parsing; fixture verification, not a claim of additional acquired national datasets |
| PDF | Real PDF-byte extraction test using the existing bundled `pdftotext`; no newly acquired authoritative PDF dataset |
| Generic HTML/PDF interpretation | Parsing and candidate/model boundary implemented; difficult extraction remains pending while inference fails |
| ANEPC/civil-protection contacts | Acquisition returned “Request Rejected”; no bypass and no successful ingestion claim |
| Municipal/health authority directories | Domain/source registration foundation exists; broader authoritative datasets remain to be acquired and reviewed |

Latest guarded MP fetch: HTTP 200, 155,644 bytes, 1,764.8 ms. Raw HTML fingerprint differed, but deterministic comparison found **100 archived / 100 live contacts, 0 contact changes, 0 removed records**. Publisher page changes must not be confused with changed facility facts. Evidence: `live-source-check.json`, `live-directory-comparison.json`.

Watchers only poll explicit registered allow-listed sources, honoring robots and source bounds. No uncontrolled search crawler was introduced. Unknown source linkage produces explicit unresolved work.

## Intelligence memory and invalidation

Persisted data includes source bytes/text fingerprints and receipts, extraction passages and locators, accepted/rejected candidates, assertion histories, canonical aliases and redirects, field conflicts, validity/supersession, jobs and incident relationships.

Unchanged documents stop before parsing/inference. Changed pages produce new assertions; unchanged canonical field values keep the same semantic revision, avoiding needless route invalidation from publisher nonces or new receipt IDs. Field/location changes and expiry mark dependent relationships stale and enqueue recalculation. Response/detail caches include the canonical revision and coordinates. A fresh worker refreshes materialized caches even when it does not claim a job.

Durable jobs use transactional claims, leases, bounded retries/backoff and deduplication. Updates arriving during a running job retain a rerun request rather than losing invalidation. Tests prove concurrent workers claim distinct jobs, stale leases cannot acknowledge new work, merges maintain foreign keys, and changed coordinates update persisted distance.

PostgreSQL is the runtime store. The atomic file adapter is for isolated tests/development, not the production durability claim. PostgreSQL mutation currently reads a pilot-size snapshot under an advisory transaction lock; national-scale throughput optimization is still required.

## Relationships

Reusable relation kinds are nearby canonical facility, nearby governed reference feature, intersection with admitted geometry, weather station context, thermal observation and official notice reference. Canonical IDs and revisions connect facility changes to dependent facts. Reference data includes roads/settlements/administrative areas when actually returned; no missing administrative membership is invented.

Live database check at 14:24 UTC: **190 current NEAR_FACILITY, 54 current NEAR_REFERENCE, 2 current WEATHER_CONTEXT**. No current thermal/notice/intersection rows were returned in that check; those code paths are not presented as live data coverage. Evidence: `relationship-evidence.json`.

Existing PostGIS spatial queries, sourced IPMA observations, temporal station history, FIRMS identities and admitted-perimeter distinctions remain their owners. New weather selection/delta helpers have unit coverage but have not replaced the mounted weather metrics pipeline. Routing remains qualified facility-to-incident OSRM estimates, excluding traffic and live closures. Distance text identifies the reported incident point. A route is not labeled safe.

## Failure modes

| Failure | Behavior |
|---|---|
| AI offline/crashed | Stored intelligence remains available; enrichment stays pending/degraded with bounded retry |
| Source offline/blocked | Preserve accepted prior assertions and source health; never invent a fresh observation |
| Equal-authority field conflict | Withhold disputed field; retain candidates and provenance for review |
| Ambiguous entity/branch | Abstain from automatic merge; preserve unresolved candidates |
| Invalid/oversized document or changed directory shape | Reject ingestion; existing accepted facts survive |
| Unsupported or injected model assertion | Reject before canonical truth; model has no tools or arbitrary SQL |
| Expired designation | Remove current capability/query membership and invalidate dependencies |

## Acceptance tests A–H

| Test | Result and actual evidence |
|---|---|
| A — Wrong Évora classification | **PASS**: real official directory → persisted prosecutor entity → live API → desktop/mobile facility sheet |
| B — Missing address recovery | **PASS**: original OSM address absent; real official address/phone recovered by directory adapter; field provenance and compact wire DTO retained |
| C — Memory/restart | **PASS**: new PostgreSQL pool/service reads persisted facts with AI offline; actual rebuilt runtime opens the same stored real entity without inference |
| D — Source change | **PASS**: deterministic address/coordinate fixtures version facts, mark relationships stale, then recalculate distance/revision in PostgreSQL |
| E — AI offline | **PASS**: mocked offline extraction preserves facts and durable pending jobs; actual runtime remained usable despite real inference failure |
| F — Wrong AI output | **PASS**: unsupported value, wrong subject, model-only high-risk type and injected/malformed outputs rejected; this is validator evidence, not successful Qwen inference |
| G — Generic shelter | **PASS**: OSM generic shelter does not acquire official refuge/evacuation capability |
| H — Not applicable | **PASS**: source-to-sheet and actual desktop/mobile prosecutor sheet omit capacity/opening fields |

## Test results

Primary integration/domain/API/PostGIS suite: **141 passed, 0 failed, 0 skipped**.

```sh
VIGIA_TEST_POSTGIS=1 VIGIA_KNOWLEDGE_POSTGRES_PROOF=1 \
VIGIA_PDFTOTEXT=/Users/malmeida/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/poppler/bin/pdftotext \
node --test \
 apps/api/test/world-knowledge.test.mjs \
 apps/api/test/world-knowledge-postgres.test.mjs \
 apps/api/test/migration-convergence.test.mjs \
 apps/api/test/response-capability.test.mjs \
 packages/domain/test/response-capability.test.mjs \
 apps/operator-console/tests/intelligence-ux-repair.mjs \
 apps/api/test/operational-intelligence-sprint.test.mjs \
 apps/api/test/physical-metrics.test.mjs \
 apps/api/test/operational-intelligence-spatial.test.mjs
```

Additional intelligence regression suite: **40 passed, 0 failed, 0 skipped**.

```sh
TMPDIR="$PWD/.tmp/test" node --test \
 apps/api/test/intelligence-service.test.mjs \
 apps/api/test/operational-intelligence-service.test.mjs \
 apps/api/test/operator-intelligence-loop.test.mjs \
 apps/api/test/intelligence-repository-security.test.mjs
```

Combined distinct Node test counts: **181 passed**. Earlier reruns are not added. Two initial temporary-directory permission failures were resolved by the writable TMPDIR setting; the final suite above passes. Isolated database proofs create and remove their own schema only.

`npm run operator:verify:static`: **PASS**, including syntax, button/interaction, authentication/proxy, map, truth and UX contracts. Browser harness: **39/39 interaction checks**. Facility/nearest-hospital/health API reads returned 200; missing incident scope returned expected 400. Full repository test suite was not run and prior sprint totals are not claimed as current evidence.

Logs: `.tmp/mega-intelligence/acceptance-final.log`, `intelligence-regression-final.log`, `static-acceptance.log`. Browser evidence is linked below. Real model evaluation remains **0/16 success** and is separate from passing software tests.

## Performance

Measured with `node scripts/knowledge_benchmark.mjs` against local PostgreSQL and real pilot data, 14:03 UTC. No inference.

| Operation | Samples | p50 | p95 | Maximum |
|---|---:|---:|---:|---:|
| Decorate + render stored facility | 100 | 0.59 ms | 1.60 ms | 18.17 ms |
| PostGIS nearest-facility query | 20 | 216.50 ms | 720.37 ms | 720.37 ms |
| Entity with provenance | 20 | 202.46 ms | 394.34 ms | 394.34 ms |

Cold service initialization: 411.26 ms. These are local component/query measurements, not complete user-click or national-scale latency. Live browser API reads include additional transport/authentication cost. A comparable pre-change API benchmark was not retained, so **no numerical before/after speedup or no-regression claim** is made. Snapshot persistence and query tails remain optimization opportunities. Evidence: `performance.json`.

## Visual QA

Preserved the six-route hierarchy, design tokens, map components and facility-sheet anatomy. Canonical screenshots cover all six primary routes plus internal Reports at 1728×966, 1024×900 and 390×844: **21 route/viewport checks without horizontal overflow**. Real Portuguese prosecutor name/address/phone/website and type-aware fields were inspected at desktop and mobile.

The frozen lane uses prior recorded canonical observations solely as a test fixture. Current native captures all have ready maps and two identical consecutive screenshots. All six routes have reference/runtime/50% overlay/difference/metrics/geometry/style/canonical artifacts. Measured panel x/y/width/height are unchanged from the prior converged baseline for every matched panel.

| Route | Mean absolute channel difference | Pixels with luminance difference >8 |
|---|---:|---:|
| Command Overview | 5.4192 | 12.9971% |
| Incidents | 0.0000 | 0.0000% |
| Incident Detail | 5.9215 | 12.7168% |
| Fire Activity | 0.1092 | 0.0895% |
| Response & Access | 7.1843 | 14.8980% |
| National Awareness | 6.7408 | 19.0720% |

Full comparisons visibly include baseline map-loading/retained-map states versus current ready imagery, settled cameras (including a live zoom-out in Incident Detail to satisfy the existing tile-admission boundary), and Operator/admission profile versus signed-in profile. These regions were not masked, and baselines were not replaced. **Exact pixel-parity gate: NOT PASSED** because map/profile states are not equivalent. No panel geometry regression was detected; this is a bounded layout/integration result, not exact parity with old mockups.

Final frozen capture: no console errors or failed network requests; Docker Chromium software-WebGL/readback performance warnings remain recorded. Initial canonical capture encountered one labels-tile 503 on Command Overview. A fresh canonical recovery capture verified ready maps at all three sizes, zero app console/network failures; its teardown emitted a Playwright asyncio cancellation after successful capture. The expected authorization-negative 400 is retained separately. Earlier failures are retained in logs.

Evidence root: `/Users/malmeida/docs/internal/automation/codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259/mega-intelligence/`.

- [Six-route comparison gallery](/Users/malmeida/docs/internal/automation/codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259/mega-intelligence/comparisons/index.html)
- [Real prosecutor — desktop](/Users/malmeida/docs/internal/automation/codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259/mega-intelligence/confirmation/canonical/prosecutor-1728.png)
- [Real prosecutor — mobile](/Users/malmeida/docs/internal/automation/codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259/mega-intelligence/confirmation/canonical/prosecutor-390.png)

Reproduce visual evidence with the existing `vigia-visual-qa:playwright-1.54.0` Docker image and the saved `confirm-golden.py`, `capture-final-golden.py`, `confirm-canonical.py`, `recover-command.py`, `compare.py` and `review-comparisons.py` harnesses in that evidence root. They use the real admission file without exposing its token. Do not run captures concurrently with frontend builds.

## Remaining intelligence gaps

1. **Qwen inference is not operational on this host.** Adapter/tests and installed weights do not fulfill a working AI-assistance claim.
2. Authoritative coverage is concentrated in the MP directory. All-pilot address coverage is 50.44%; 36 difficult records remain unresolved. Broader health, municipal and civil-protection acquisition/review is still needed.
3. No live facility capacity, national authoritative refuge/activation feed, current road-closure or traffic feed, or evacuation-state admission was acquired. Generic shelters remain generic.
4. Some relation kinds have fixture/code coverage but no live rows in the current context. No invented thermal/perimeter intersections or notice relationships fill that gap.
5. No independent field audit of all 113 facilities; source classifications and coordinates are not automatically verified physical truth.
6. No national-load performance proof, numerical pre-change benchmark, exhaustive whole-repository suite, production certification or exact pixel-parity pass.

These limits are reflected in the machine-readable progress manifest. The delivered deterministic knowledge layer is usable now; the broader ambitions above are not marked complete.

## Files changed by this sprint

The checkout was already substantially dirty. This list identifies the sprint's implementation areas; it does not attribute all current Git changes to this sprint.

| Area | Files |
|---|---|
| Domain | `packages/domain/src/intelligence/world-knowledge.mjs`; response `capacity-contract.mjs`; `packages/domain/src/release-contract.mjs` |
| Storage | `apps/api/src/modules/storage/migrations/023-world-knowledge.sql`; `postgres-migration-runner.mjs`; intelligence `world-knowledge-store.mjs` |
| Ingestion/model/service/API | intelligence `knowledge-sources.mjs`, `local-intelligence-model.mjs`, `world-knowledge-service.mjs`, `world-knowledge-routes.mjs` |
| Runtime integration | application `create-services.mjs`, `create-runtime.mjs`, `register-routes.mjs`; intelligence `incident-context-service.mjs` |
| Response integration | `governed-facility-repository.mjs`, `response-capability-service.mjs`, `routing-cohort.mjs`; operator `canonical-operator-response-projection.mjs` |
| Existing UI data/sheet | approved data `field.js`, `hierarchy.js`; UI `access.js`, `facility-detail.js`, `incident-briefing.js` |
| Tests | `world-knowledge.test.mjs`, `world-knowledge-postgres.test.mjs`, `migration-convergence.test.mjs`, response facility-repository and optimizer cases |
| Data/tools/evidence | `data/reference/facility-intelligence/`; `scripts/knowledge_pilot.mjs`, `knowledge_model_eval.mjs`, `knowledge_benchmark.mjs`; this handoff directory; visual evidence root |
| Generated local release | Existing release-validation manifests regenerated by the local runtime build; no production seal |

## Git

Branch: `vigia/operational-intelligence-v1`.

HEAD: `3e358715272e3f8f83e6d877f2297115f9230192` (unchanged).

Status: **188 porcelain entries** at final verification, including substantial preexisting changes and grouped untracked directories; this is not 188 files authored in this sprint. The final handoff files are inside the already listed untracked `docs/handoffs/` directory.

No staging or commit performed: `.git` is read-only in this session. Existing changes were preserved. No claim is made that a clean commit or production release was created.
