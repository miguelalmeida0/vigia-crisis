"""Assemble the sprint evidence report from retained measurements, not claims."""
import json
from pathlib import Path
from collections import Counter

root = Path(__file__).resolve().parents[1]
out = root / 'docs/handoffs/acceleration'
read = lambda p: json.loads(p.read_text())
pilot = read(root / 'data/reference/facility-intelligence/acceleration/pilot-review.json')
metrics = pilot['metrics']
maps = read(out / 'map-performance.json')
sources = read(out / 'source-health.json')
directories = read(root / 'data/reference/facility-intelligence/acceleration/directory-review.json')['sources']
gaps = read(out / 'enrichment-gaps.json')
relations = read(out / 'relationships.json')
visual = Path('/Users/malmeida/.codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259/acceleration')
lines = ['# Operational Intelligence Acceleration — delivery and acceptance report', '',
'12 September 2026. Implementation delivered with measured performance misses and remaining intelligence gaps. This is not an unqualified acceptance PASS.', '',
'The application retains one map renderer across operational routes, progressively admits geography, isolates label failure, and reuses persisted canonical intelligence. The reviewed benchmark has 299 records, including all original 113. All overall field coverage targets pass. Cold, navigation and revisit latency targets still fail; one measured Fire Activity transition timed out. No current official wildfire refuge activation or verified emergency-department capability was acquired.', '',
'## Map performance', '',
'Chromium 139.0.7258.5, Docker software WebGL, 1728 × 966 CSS pixels, DPR 1. Two complete baseline contexts and three complete after contexts; a third baseline document navigation exceeded 30 seconds before a trace was completed. Small-sample p95 is an observed tail, not a production percentile. Fresh browser contexts share the local backend/provider cache.', '',
'The measured frame is all requested imagery tiles settled/loaded followed by a visible render. It is a conservative proxy, not the earliest partially visible tile. The first-tile hook did not reliably identify MapLibre tile events, so no exact earliest-tile improvement is claimed. PostGIS calls were not correlated per browser request. Separate service/SQL measurements follow.', '',
'| Case | Before p50 / p95 ms | After p50 / p95 ms | Before / after failed samples |',
'|---|---:|---:|---:|']
for name in maps['lanes']['before']['cases']:
    b, a = [maps['lanes'][lane]['cases'][name]['frameMs'] for lane in ('before','after')]
    lines.append(f"| {name} | {b['p50']:.1f} / {b['p95']:.1f} | {a['p50']:.1f} / {a['p95']:.1f} | {b['failures']} / {a['failures']} |")
lines += ['', 'Timeouts are failures; successful-sample percentiles do not conceal them. Target results: **cold ≤2500 ms FAIL; cached navigation ≤750 ms FAIL; cached revisit ≤400 ms FAIL**. Cold p95 improved from 16,026.9 to 4,460.5 ms; cached revisit p95 from 3,106.1 to 1,392.6 ms.', '',
'| Case | Requests p50 before → after | Bytes p50 before → after | Tile requests p50 before → after | API calls p50 before → after |',
'|---|---:|---:|---:|---:|']
for name in maps['lanes']['before']['cases']:
    b, a = [maps['lanes'][lane]['cases'][name] for lane in ('before','after')]
    vals = [f"{b[k]['p50']:,.0f} → {a[k]['p50']:,.0f}" for k in ('requests','bytes','tileRequests','apiCalls')]
    lines.append('| '+name+' | '+' | '.join(vals)+' |')
lines += ['', 'All after cases reused `vigia-map-1` within each fresh context; the baseline created five route instances. The actual scene contained 14 layers, not an assumed 32. Raw interactive times, maximums, bytes, events and request traces are retained in [map-performance.json](map-performance.json) and the visual evidence directory. Interactive p95 for cold launch remained 10,237.7 ms; the frame improvement is not equivalent to all incident intelligence being ready.', '',
'### Root causes and changes', '',
'1. Route-owned destruction/recreation lost GL state and repeated initialization. A shell-owned connected parking host now retains the renderer. Route-specific identity, sources, selected incident, camera and controls remain distinct. Initial bounds are supplied at construction without a redundant second fit.',
'2. Heavy incident projections gated basic geography. The authorized location endpoint supplies a minimal Tier 0 scene first; detail, intelligence and response projections follow independently with existing abort/single-flight protection. Optional label and operational states do not determine imagery availability.',
'3. Whole-knowledge snapshots and repeated materialization inflated nearest/entity reads. Indexed bounded spatial candidates and per-entity facts now precede materialization; the cache builds its fact index once. Existing GiST geometry indexing is actually used.',
'4. CPU profiling found whole-state structuredClone, garbage collection and atomic JSON persistence blocking the event loop. Narrow read snapshots now copy only required collections; event-journal filtering occurs before cloning. Mutation rollback semantics remain intact. Before: 25.5 seconds of structuredClone and 7.1 seconds GC in a 60-second profile. A later partial-scoped profile still had 16.38 seconds structuredClone. Event-loop p95 decreased 332.7 → 213 ms, but maximum pause increased 4051.7 → 5914 ms. These profiles have different startup activity and do not prove all stalls are fixed.',
'5. Static JS/CSS now use private conditional ETag revalidation. Imagery retains HTTP caching plus a bounded restart-persistent disk cache with original acquisition time. Live incident state is not treated as static.',
'6. Label state tracks failed tiles independently, retries twice with backoff through the public raster-source API, and cannot falsely become ready on idle after a failed tile. Forced 503 testing kept imagery, markers and operational layers ready; each distinct tile had at most three requests including the initial attempt.',
'7. Final regression review found archive enumeration queuing unrelated facilities for enrichment. Observation jobs now require explicit incident-scoped returned candidates. Existing persisted records and jobs were preserved. The previously accumulated backlog is not claimed resolved.', '',
'Remaining bottleneck: full-state mutation/persistence and heavy operational projections still stall the shared Node event loop. Real browser API timeouts and 12-second navigation tails remain. No claim is made that hardware makes the requested targets impossible. A broader state-write decomposition needs separate risk-controlled implementation.', '',
'The accepted performance traces precede the final source-contact additions, label recovery refinement and scoped observation-queue correction. Those later changes, including knowledge-revision cache invalidation, passed focused regression checks; the exact final source tree was not benchmarked again. This limits release-level performance claims.', '',
'### Knowledge and PostGIS measurements', '',
'| Operation | Before p50 / p95 ms | After p50 / p95 ms |',
'|---|---:|---:|',
'| Indexed nearest service, 20 samples | 230.45 / 700.59 | 19.31 / 195.45 |',
'| Entity with provenance, 20 samples | 228.19 / 1805.52 | 2.48 / 10.67 |',
'| Stored facility decoration + sheet, 100 after samples | — | 0.45 / 1.58 |', '',
'Before storage: 200 entities / 5353 facts. After measurement at 15:24 UTC: 384 entities / 7130 facts. These are warm service measurements and predate later acquisition/live observation growth. EXPLAIN ANALYZE used `world_knowledge_entity_geo`; total statement execution was 115.6 ms before and 76.034 ms after, including geography initialization. This is not a national throughput guarantee. See the before/after knowledge and EXPLAIN JSON files.', '',
'## Facility benchmark and field coverage', '',
f"Reviewed: **{metrics['total']}**; original retained: **{metrics['originalRetained']}**. Resolved **177**, partial/probable **86**, unresolved **36**, conflicting **0** in this reviewed snapshot. Incorrect: **not independently established**. Passing source-consistency and regression checks does not establish zero real-world errors. Only **{metrics['hasMappedCoordinate']}** reviewed records have sourced coordinates; no address was converted to invented geometry.", '',
'| Field | Before, original 113 | After, expanded 299 | Goal | Result |',
'|---|---:|---:|---:|---|']
for key, label, before, goal in [('address.street','Address','57 / 113 · 50.44%',75),('contact.phone','Phone','45 / 113 · 39.82%',65),('contact.website','Website','34 / 113 · 30.09%',55),('operator','Operator/authority','25 / 113 · 22.12%',60),('canonicalType','Canonical type','113 / 113 · 100%',95)]:
    v=metrics['coverage'][key]
    lines.append(f"| {label} | {before} | {v['count']} / 299 · {v['percent']}% | {goal}% | {'PASS' if v['percent']>=goal else 'FAIL'} |")
lines += ['', 'Coverage includes the difficult original generic shelters and water points. The denominator changed by adding reviewed records, not deleting incomplete ones. Most aggregate address improvement comes from new authoritative records. Two original addresses improved from OSM assertions to authoritative fields; the count of original records with any street address did not increase. Two previously missing original phone fields were recovered.', '',
'| Type | Records | Address % | Phone % | Website % | Operator % |',
'|---|---:|---:|---:|---:|---:|']
for name, entry in metrics['byType'].items():
    values=[str(entry['coverage'][k]['percent']) for k in ('address.street','contact.phone','contact.website','operator')]
    lines.append('| '+name+' | '+str(entry['total'])+' | '+' | '.join(values)+' |')
lines += ['| official_wildfire_refuge | 0 | — | — | — | — |', '',
'A higher 90% critical-type completeness target was used for hospital, fire, civil protection and official refuge/reception. Civil protection passes in a very small one-record cohort; hospital, fire and reception do not. Health centers dominate expansion and should not be mistaken for complete emergency infrastructure coverage.', '',
'Recovery examples: Hospital do Espírito Santo gained a municipal address assertion and previously missing public phone; Maternidade Bissaya Barreto gained an owning-ULS address assertion and previously missing phone. Exact source passages and field provenance are retained in [field-recovery.json](field-recovery.json). Institution + postal street matching is generic; different postal addresses and ambiguous same-address candidates do not silently merge.', '',
'## Sources actually integrated', '',
'The table below lists every successfully parsed source acquired by this sprint. Counts are extracted source records, not additive unique canonical entity totals. Each URL is registered explicitly; no open-ended crawler or access-control bypass was used. Public authority pages and owning institutions are authoritative; the Coimbra fire federation is separately classified as a sector directory (`PLACE_PROVIDER`), not government or owning authority.', '',
'| Source / municipality | Authority | Extracted records | Adapter |',
'|---|---|---:|---|']
for item in directories:
    if item.get('error') or not item.get('records'): continue
    s=item['source']; label=s['provider']+' · '+(s.get('municipality') or s.get('file') or 'directory')
    lines.append(f"| [{label}]({s['url']}) | {s['authority']} | {len(item['records'])} | {s['adapter']} |")
lines += ['', 'Existing Ministério Público/OSM sources remain registered. Municipal source records retain municipality, authority, category, adapter, polling interval, hash, last fetch and next fetch. The Coimbra publication describes February reception history: schools, a municipal building and a reception center retain their physical type and historical designation. It supplies no current activation, capacity or safe-travel instruction.', '',
'### Source health and jobs', '',
f"Source-state snapshot: **{dict(Counter(s['status'] for s in sources))}**. AVAILABLE means the registered extraction last succeeded; it is not a guarantee that every record on a page was extracted or that every facility is operational.", '',
'Blocked/degraded acquisition: GNR contact directory redirect/robots restriction; Leiria emergency-plan PDF redirect requiring separate registration; Porto de Mós ULS page parser shape mismatch. These were retained as unavailable with deferred eligibility rather than repeatedly requested by UI refresh. Partial extraction gaps also remain: 19 of 24 federation entries, and a wrapped ULS Lisboa Ocidental PDF unit was not accepted. No protection was bypassed.', '',
f"Persisted ENRICH_FACILITY snapshot: **{dict(Counter(j['state'] for j in gaps))}**. This is the live database job population, not just the 299-record review. Pending is not resolved. Accepted canonical revision changes now invalidate operator/response projection caches, including in-flight response deduplication identity; a regression test verifies that the next read does not wait for the five-minute response TTL. The worker processes bounded jobs and records last attempt, attempted sources, result, error and next eligibility. Missing approved links receive a seven-day backoff; source refresh completion does not itself mean a missing field was recovered. The source/gap JSON files preserve the exact snapshot.", '',
'## Semantics and canonical identity', '',
'Domain-owned presentation capabilities cover hospital, health center, fire station, police/GNR/PSP, public prosecutor, civil protection, official wildfire refuge, temporary reception, generic physical shelter, water point, school, municipal building, assembly point and other public facility. Irrelevant capacity/shelter fields are omitted, including for the actual GNR Vila de Rei sheet. Health-center labels no longer inherit “Hospital” solely from the response bucket.', '',
'Emergency-department information requires an authoritative resolved capability. Designation, historical activation and current activation validity remain separate. Generic mapped shelters are never presented as evacuation refuges. Raw tags do not override canonical marker type. Map actions, facility lists and incident views carry canonical IDs where resolved; the PSP Évora record opened from Response & Access and Fire Activity had the exact same ID.', '',
'The final scoped worker persisted both actual GNR Vila de Rei observations and incident-priority missing-contact/authority jobs at 16:25 UTC; see [gnr-persistence.json](gnr-persistence.json). These jobs are pending, not resolved. After the final restart and response retry, the rendered GNR sheet opened `entity:c1ecae98ef547abf95b160a0`, matching the persisted node record; `gnr-final-canonical.json` and its screenshot retain the evidence. Known unresolved identity issue: two GNR Vila de Rei POIs remain separate and appear twice in access approaches. Similar names and close coordinates alone are insufficient evidence to merge them. The UI semantic repair is verified; duplicate resolution is not claimed complete.', '',
'## Operational relationships', '',
'Current relationship counts at the retained database snapshot:', '',
'| Relationship | Count |','|---|---:|']
for kind in ['NEAR_FACILITY','NEAREST_HOSPITAL','NEAREST_EMERGENCY_CAPABLE_HOSPITAL','NEAREST_FIRE_STATION','NEAREST_CIVIL_PROTECTION','NEAREST_OFFICIAL_REFUGE','NEAREST_RECEPTION_CENTER','NEAREST_POLICE','WEATHER_CONTEXT','OBSERVED_BY_THERMAL','NEAR_REFERENCE']:
    lines.append(f'| {kind} | {relations.get(kind,0)} |')
lines += ['', 'Nearest relationships use canonical type-specific candidates within 150 km, straight-line distance and an explicit reported-incident reference. Qualified hospital ranking additionally requires a resolved authoritative emergency department. Route availability is NOT_EVALUATED in these relationships; they are not “best” or safe-route recommendations. UI route rankings continue to use qualified returned facility-to-incident OSRM estimates. Facility-only recomputation preserves other dated context unless an explicit replacement is supplied.', '',
'## Qwen and inference independence', '',
'Direct `ollama run qwen3.5:4b "Return only VIGIA_OK"` against the existing 11435 service exited 1 after 6365 ms. The model produced no answer: llama-server failed to create a command queue/context, including after CPU offload retry. This is a model/backend startup failure before VIGIA structured extraction. JSON, Portuguese and adapter stages were not attempted after that prerequisite failed. AI is not working and is not claimed working.', '',
'The normal configured intelligence model on localhost:11434 reports offline/model not installed. Persisted entity queries, source ingestion, maps and sheets worked without successful inference. Tests replace extraction with a throwing implementation on query/restart paths. The Ollama daemon itself was not shut down; the acceptance evidence is unavailable inference and explicit no-inference read paths. See [qwen-cli.json](qwen-cli.json) and [no-ai-runtime.json](no-ai-runtime.json).', '',
'## Acceptance A–N', '',
'PASS below is limited to the stated evidence. FAIL is used for missing required real-world evidence, not converted into a test-only pass.', '',
'| Test | Result | Evidence / limitation |','|---|---|---|',
'| A Cold map | FAIL target | Fresh browser measured; bottleneck documented. p95 4460.5 ms exceeds 2500 ms. |',
'| B Route retention | PASS behavior | One GL instance across Detail → Fire → Response → Detail. Latency target still FAIL and one Fire transition timed out. |',
'| C Labels unavailable | PASS | Forced 503 screenshot and trace; imagery/markers/operational layers remain ready; bounded per-tile retry. |',
'| D Police semantics | PASS | Actual GNR Vila de Rei sheet, desktop and mobile; no capacity/shelter fields. Public phone remains missing. |',
'| E Hospital semantics | PASS scoped | Domain/render tests for verified healthcare capability and type relevance; no real emergency department capability was acquired. |',
'| F Generic shelter | PASS scoped | Domain/render fixture retains generic physical shelter; no refuge/activation claim. Dedicated live shelter screenshot not captured in this sprint. |',
'| G Official refuge | FAIL live coverage | Designation/activation/expiry tests pass and historical municipal reception was ingested; no current official wildfire refuge record was acquired for live acceptance. |',
'| H Missing address recovery | FAIL strict original-cohort case | Authoritative address upgrades for two original records are verified; no originally absent street field became present. New directory records have authoritative addresses. |',
'| I Phone recovery | PASS | Two original missing public phone fields recovered through generic municipal/ULS adapters. |',
'| J Source precedence | PASS | Weak/strong conflicting fixtures retain inspectable provenance and authoritative winner. |',
'| K Canonical selection | PASS scoped | PSP Évora exact ID across Response and Fire. Canonical marker wiring verified; unresolved GNR duplicate remains. |',
'| L Restart memory | PASS | Rebuilt/restarted runtime retains accepted intelligence; store/restart and disk tile-cache tests preserve identity and acquisition time. |',
'| M Cached faster | PASS relative; FAIL target | After cached p50 699.2 ms versus cold 3979.2 ms; revisit p95 1392.6 ms exceeds 400 ms. |',
'| N No AI dependency | PASS scoped | Normal model unavailable, UI/persisted intelligence functional; throwing model read/restart tests pass. Daemon shutdown was not exercised. |', '',
'## Validation and relevant visual QA', '',
'**122 focused tests passed; 0 failed, 0 skipped**, with test-file concurrency set to 1. An earlier concurrent run failed the existing intelligence inbox 75 ms timing assertion (121 passed / 1 failed); that log is retained at `.tmp/acceleration/concurrent-tests-timing-failure.log`. The serial rerun passed without loosening the assertion. Includes acceleration, world knowledge, canonical operator API/response, persistence failure, intelligence service/loop, operational intelligence, crisis coordination and response-capability golden integration. Syntax: **138 JavaScript modules passed**. Operator asset/release attestation and map contract passed. This is not a claim that every unrelated repository suite passed.', '',
'Canonical route navigation screenshots exist for all six primary routes. Relevant detailed checks cover police semantics, canonical cross-route selection, failed labels, retained renderer, browser back/forward and mobile Response/sheet. Manual browser effective viewports were 1270 × 710 CSS at the existing browser zoom and 390 × 844 CSS for mobile; performance/failure harness used true 1728 × 966 CSS. Responsive content had no horizontal overflow. No six-route pixel-overlay parity claim is made by this sprint.', '',
f'Artifacts: [{visual.name}]({visual}) · [forced label failure]({visual}/labels-unavailable.png) · [mobile police sheet]({visual}/responsive-gnr-sheet.png) · [canonical selection]({visual}/canonical-selection.json). Browser logs also contained real projection timeouts; retry eventually recovered Response content. Those failures are not omitted from the limitations.', '',
'## Remaining intelligence and performance gaps', '',
'- No verified live bed capacity, emergency department inventory, refuge activation, staffing, road safety or evacuation instruction. No inferred official perimeter from thermal points.',
'- Most newly acquired addresses lack published coordinates and cannot yet participate in spatial nearest relationships. Only 113/299 reviewed records have coordinates.',
'- Hospital/fire/refuge completeness is below the critical target; police contacts and current official refuge coverage remain poor.',
'- GNR duplicates require stronger identity evidence. Source parsers have the explicit omissions above. A successfully fetched source is not comprehensive coverage.',
'- The enrichment backlog remains large. Final scoping prevents new archive-wide enqueue side effects, but existing pending jobs were preserved. Not every visible facility has finished canonical enrichment.',
'- Long shared-process CPU pauses, large operational projections and API timeouts remain. The final write architecture is not yet sufficient for the requested map latency targets.',
'- The PDF adapter needs the existing Poppler binary configured via VIGIA_PDFTOTEXT on this machine; an unconfigured scheduled PDF refresh can fail.', '',
'## Engineering output and Git', '',
'`node scripts/acceleration_metrics.mjs facilities|performance|sources|gaps|relationships|ai` prints retained engineering metrics without adding a public dashboard. Source acquisition/review scripts and fixtures are in `scripts/acceleration_*` and `data/reference/facility-intelligence/acceleration/`.', '',
'Branch: `vigia/operational-intelligence-v1`. HEAD: `3e358715272e3f8f83e6d877f2297115f9230192`. The checkout began with 188 status entries; subsequent status includes substantial pre-existing work. See `git-status.txt` for the final inventory. No commit was made: .git is read-only in this session. The complete checkout diff must not be attributed to this sprint.', '']
(out/'FINAL_REPORT.md').write_text('\n'.join(lines))
print(out/'FINAL_REPORT.md')
