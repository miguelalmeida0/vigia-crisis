import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const dir='docs/handoffs/mega-v',read=async name=>JSON.parse(await readFile(dir+'/'+name+'.json','utf8'));
const [maps,model,runtime,live,quality,ready,audit,road,pg,worker,resolver]=await Promise.all(['map-results','model-evaluation','model-runtime','final-live-proof','quality-final','ready-final','audit-final','road-proof','postgres-proof','worker-profile','resolver-profile'].map(read));
const visual=JSON.parse(await readFile(dir+'/visual/ui-qa.json','utf8')),now=new Date().toISOString(),num=x=>x==null?'unavailable':Number(x).toFixed(1),pct=x=>num(x)+'%',table=(headers,rows)=>'| '+headers.join(' | ')+' |\n| '+headers.map(()=> '---').join(' | ')+' |\n'+rows.map(r=>'| '+r.join(' | ')+' |').join('\n'),latest=maps.lanes.final.cases,final=maps.lanes['pre-resolver'].cases,first=maps.lanes.before.cases;
const performance=table(['Case','Before p95 ms','Last complete run p50 / p95 / max ms','Last complete run failures','Target ms','Gate'],Object.entries(final).map(([k,v])=>[k,num(first[k].usefulMs.p95),[v.usefulMs.p50,v.usefulMs.p95,v.usefulMs.max].map(num).join(' / '),v.timeouts,v.targetMs??'—',v.gate]));
const wire=table(['Case','Before → last complete p95 responses','Before → last complete p95 bytes','Last complete p95 tiles / API / repeated URLs'],Object.entries(final).map(([k,v])=>[k,first[k].requests.p95+' → '+v.requests.p95,first[k].bytes.p95+' → '+v.bytes.p95,[v.tiles.p95,v.apiCalls.p95,v.repeatedUrls.p95].join(' / ')]));
const history=table(['Retained incident','Snapshots','Oldest UTC','Newest UTC'],live.historyCoverage.map(r=>[r.incident_id,r.count,r.first,r.last]));
const sentinels=table(['Model','Isolated runtime','Exact sentinel'],runtime.attempts.map(r=>[r.model,r.runtime,(r.attempts.filter(x=>x.ok??x.passed).length||r.passed&&20||0)+'/20 '+(r.passed?'PASS':'FAIL')]));
const chain=audit.data.chain,blockers=ready.data.checks.filter(c=>c.blocking&&!c.ok),h=live.historicalRoadChain,brief=live.brief.data,branch=execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),status=execFileSync('git',['status','--short'],{encoding:'utf8'}),releaseLog=await readFile('.tmp/mega-v/runtime-acceptance.log','utf8'),release=[...releaseLog.matchAll(/vigia-intelligence-fabric-[a-f0-9]+/g)].at(-1)?.[0];
const checks=table(['Gate','Result'],[
 ['A · cold map',final.cold.gate+' · 20 measured contexts'],['B · Detail → Fire → Response',final['detail-to-fire'].gate+' / '+final['fire-to-response'].gate],['C · Overview',final.overview.gate],['D · National',final.national.gate],['E · incident switch',final['incident-switch'].gate],
 ['F · real road source','PASS · official IP source acquired'],['G · road applicability','PASS with evidence boundaries · real retained route overlap; source-backed controlled full chain; dated historical operational chain'],['H · health source','PASS · ULS AC emergency-service passage'],['I · qualified hospital','PASS · real Évora ranking'],['J · fire source','PASS · municipal response role and CIMAC public contact'],['K · reception designation','PASS · 18 official-plan designations'],['L · activation','PASS separation; no current activation acquired'],['M · continuous history','PASS mechanism and real multi-hour growth; not 30 elapsed days'],['N · no-change history','PASS · source age and IP row-ID rotation regression checks'],['O · audit chain','BLOCKED · historical discontinuity; new receipt sealing fixed'],['P · physical source families','BLOCKED · current accepted observation requirement unmet'],['Q · model sentinel','PASS · 20/20 on three isolated runtime/model combinations'],['R · actual model corpus','104 requests executed: 17 responses, 87 timeouts; model REJECTED'],['S · Ask tools','PASS supported deterministic natural questions; model interface remains disabled'],['T · grounding','PASS approved tools, exact retained values, unsupported claim blocks'],['U · AI offline','PASS canonical API and rendered product with model disabled']]);
const text=`# WHAT VIGIA CAN NOW KNOW

Mega Intelligence V · captured ${now} · **release remains blocked**.

At the retained Évora incident point, VIGIA can identify Hospital do Espírito Santo de Évora as a hospital with an explicitly published emergency service, show its public contact and address, and connect it to a qualified road estimate and dated road-source coverage. It can distinguish that hospital from merely mapped hospitals, identify the verified fire-response role of Bombeiros Voluntários de Évora, and distinguish 18 officially designated reception locations from current activation.

The Évora incident point was reported on 3 September 2026. These are real retained incident relationships, not evidence of a freshly verified active fire. No second verified emergency hospital or current reception activation is invented. The operational product remains usable with inference disabled.

## P0 MAP RESULTS

${performance}

The table compares the baseline with the last completed 20-context lane, before the selected-entity resolver fix. The baseline and two intermediate lanes each contain 20 contexts × eight cases. The final-code run was interrupted during its eleventh context after severe shared-host saturation; no final-code p95 is claimed. Its raw failed results are retained separately. Consequently the end-to-end performance effect of the last resolver fix is NOT certified. All p95 values in the table describe **successful useful-frame measurements**; timeout counts are separate and force a failed gate. No p95 is inferred from three samples. A case without a specified target is not certified by this report.

${wire}

The measurement browser is Chromium ${visual.browser}, Playwright 1.54, 1728 × 966, HTTP caching enabled through the same transparent local forwarding hop as the baseline. Graphics: ${visual.graphics?.renderer??'not returned'}. This is **software-rendered local container evidence**, not native macOS Chrome GPU certification. Cold uses the first tile-backed render; transitions conservatively wait for a post-navigation render with imagery loaded. The transition metric can exceed the first partially useful visible frame. It was kept unchanged for comparability. The request/byte table counts completed responses, not all initiations; failed/cancelled request counts were not instrumented in the baseline. Network totals attribute responses finishing within a case; crossing requests and legitimate cache revalidations make repeated-URL counts diagnostic, not proof of erroneous duplicate work.

The completed 20-context lane retained one renderer per context and zero style reloads. The interrupted stress lane observed renderer identities ${maps.lanes.final.instances.join(', ')}; map recovery/replacement under that failure condition is not described as uninterrupted persistence. Route-specific scene, camera, selection and layers remain distinct. Map stages now expose shell, instance, camera, base style, imagery, labels, geometry, overlays and interaction timings in DOM instrumentation. Raw stage/network traces and exact p50/p95/max values are in [map-results.json](map-results.json).

Implemented changes: lightweight authorized incident and regional map context, visible-route priority, bounded neighboring projection concurrency, intent-based global prewarming, smaller global physical-condition summaries, and removal of redundant runtime-cache cloning. Profiling also found a background CPU stall: full entity resolution took ${num(resolver.wholeMs)} ms for ${resolver.rawEntities} mapped entities against ${resolver.authorityCandidates} authority candidates; selected-entity resolution took ${num(resolver.singleMs)} ms with an identical result. Enrichment now resolves the requested entity. Materialization indexing measured ${num(worker.materializeScanMs)} → ${num(worker.materializeIndexMs)} ms; queue transactions now read/write jobs without rereading every fact. These CPU profiles are separate from browser latency.

Remaining performance limits include large detail/intelligence/operations payloads, global inventory traffic, projection construction, session startup, raster/label loading and software-rendering cost. The source expansion did not solve every map SLA. Failed targets remain release blockers; this report does not label the map performance work complete.

Final contended sample counts: ${Object.entries(latest).map(([name,r])=>name+' '+r.samples+' attempts / '+r.timeouts+' missing useful frames').join('; ')}. At the resource capture, VIGIA PostgreSQL consumed 360.61% CPU, a separate Kubernetes workload 385.01%, and the browser container 181.59%; vm_stat reported about 64 MB free RAM. This is measured contention, not proof that a particular code change caused the slowdown. Only the owned browser test container was stopped. Other workloads and the running product were left intact. Host traces: \`.tmp/mega-v/docker-stats.txt\` and \`.tmp/mega-v/vm-stat.txt\`.

## ROAD INTELLIGENCE

Integrated the public [Infraestruturas de Portugal traffic map](https://servicos.infraestruturasdeportugal.pt/viajar-na-estrada/transito-em-tempo-real), through its published ArcGIS map service, layers 0/1/2. The evidence capture returned ${road.returned} eligible active notices; the provider can also return inactive, future or otherwise ineligible rows. The adapter preserves original dates, road reference, provider row ID, direction, kilometre marker, restriction type, occurrence point, source URL and ingestion time.

Coverage is **partial**. A named road plus an occurrence point within 75 m of the calculated route is required. IP increasing/decreasing chainage directions cannot be inferred from an OSRM compass bearing, so those notices are retained without a confirmed directional route hit. An occurrence point is not the full closed segment. Empty results never mean road safety or confirmed opening.

The source polls at five-minute intervals, has a ten-minute freshness bound and explicit PARTIAL / STALE / UNAVAILABLE / NOT_CONNECTED states. Original observation time remains separate from the last successful source check. ArcGIS row IDs were observed rotating without changed conditions; operational identity and revision now exclude that transport-only change while preserving the raw ID as provenance. Rechecking an unchanged source does not create a road change or a situation version. Applicable notices are retained ahead of bounded unrelated context, so feed order cannot silently discard a route hit.

Source changes enqueue affected tracked incidents, recalculate route relationships and qualified access, and feed briefs, Ask and consequence history. Immutable road-source snapshots and whole-situation snapshots retain 30 days plus a boundary anchor. The controlled chain in [road-proof.json](road-proof.json) uses a real current published occurrence and a real OSRM route, with explicitly chosen endpoints and no operational fixture writes. It proves CALCULATED → AFFECTED_BY_RESTRICTION, a material route change, a brief and a grounded Ask answer. It is not passed off as a live incident.

## HEALTH INTELLIGENCE

The [ULS Alentejo Central clinical-areas page](https://www.ulsac.min-saude.pt/2025/11/28/areas-clinicas/) explicitly publishes Urgência Polivalente for the hospital identity. The page was published 28 November 2025 and displayed an update of 4 September 2026. The scoped adapter requires both identity and the clinical-service passage; a hospital navigation label alone cannot establish emergency capability. Four source facts were admitted through the existing provenance pipeline.

The real Évora result is Hospital do Espírito Santo de Évora, **6.4 km straight line** from the reported point. Its retained example route is **7.55 km / 11.2 min**, facility → incident, via **EM527 → CM1081-1**. Public phone: **+351 266 740 100**. Retained address: **Largo Senhor da Pobreza, Évora, 7000-811**. Capability comes from ULS AC; contact/location come from separately retained municipal/map sources. A public contact is not proof that a call will be answered or that admissions are open.

The existing tools separately support nearest mapped hospital, public-phone filtering, verified emergency capability, and ranking by qualified returned road time. Affected, unavailable and stale routes are excluded from current road-time ranking. Évora has one retained verified ED option; Vila de Rei and the Campo Maior pilot abstain where that qualification is not established. No alternate qualified hospital is fabricated. Evidence: [live-proof.json](live-proof.json), [source-acquisition.json](source-acquisition.json), [final-live-proof.json](final-live-proof.json).

## FIRE / CIVIL PROTECTION

The [Évora Municipal Emergency Plan](https://www.cm-evora.pt/wp-content/uploads/2020/07/Plano_Municipal_Emergencia_Protecao_Civil_Evora_2024-1.pdf), PDF page 85 / Quadro 19, explicitly assigns firefighting, rescue and pre-hospital responsibilities to Bombeiros Voluntários de Évora. Its canonical subtype is a fire corporation, separate from a municipal civil-protection office. The closest verified fire-response result in the real pilot is **6.6 km from the incident point**; capability and route remain separate qualifications.

The official [CIMAC entity entry](https://centraldecompras.cimac.pt/entidade/view?id=29) supplies **+351 266 702 122** and **secretaria@ahbvevora.pt**, now admitted on the same canonical brigade entity. The contact page does not publish an observation/update date; retrieval is not presented as one. The older 2018 guide and third-party directory results were not silently promoted into fresh operational availability. [Fire contact evidence](fire-contact-acquisition.json).

The existing [municipal civil-protection contact source](https://www.cm-evora.pt/municipe/areas-de-acao/protecao-civil/a-protecao-civil/) and civil_protection entity type remain distinct from the brigade. The public municipal-office contact is not a dispatch-status claim. Coverage remains source- and incident-bounded; no national verification coverage is claimed.

## REFUGE / RECEPTION

The emergency plan supplies **18 designated ZCAP reception locations**, from PDF pages 188 and 190 / Quadros 72 and 73. Source names, addresses, WGS84 coordinates, authority and document provenance are retained. These are designated reception centres, not generic shelters or confirmed active refuges. The retained Évora snapshot contains ${live.moments.at(-1).receptions.length} reception entities within its current bounded facility projection.

**Zero current activations are established.** The facility sheet states this separately. Existing approved-source polling, candidate validation, high-risk review/admission, expiry handling and consequence recalculation are reused; no activation notice was acquired during this sprint. Activation capability is controlled-tested, not live-certified by an actual emergency notice.

PDF parsing was corrected for split avenue labels and coordinate spacing that could join adjacent rows. The source was reprocessed through a new parser version; earlier admitted records and snapshots were not rewritten. The final parse returns all 18 locations. This is correction history, not evidence that their real-world locations changed during the sprint.

## HISTORY

${history}

Whole situations retain **30 days plus the last pre-window anchor**, with a 30-minute bounded continuity fallback and earlier wake-up at source/route validity transitions. Material source, facility, geometry, weather, thermal, road and activation changes can create versions. Mere display age and successful road polling do not. Scheduling covers up to 100 tracked incidents, with bounded queues and four due jobs per tick; it is not an unbounded national archive.

Real comparison anchors are ${live.moments.map(m=>m.knownAt).join(' → ')}. They show weather/source changes, later emergency/fire qualification, reception information and access changes. Later accepted facility evidence does not leak backward: **${live.futureFacilityEvidence.length} future facility-evidence timestamps** in the three retained moments. Stored history is read directly, without joining today's facility corrections into an old snapshot. Elapsed history is hours, not 24 hours, seven days or 30 days; retention policy is implemented, but those elapsed windows have not yet accumulated. [Temporal evidence](final-live-proof.json).

## READINESS

**/ready: HTTP ${ready.status}.** Blocking checks: ${blockers.map(c=>c.id+' = '+c.state).join('; ')}.

Audit inspection found **971 unsigned historical workflow receipts and one boundary-link discontinuity**, for ${chain.failureCount} failures in the current ${chain.count}-record chain. New unsigned receipts now receive canonical hashes and predecessor links at the repository mutation boundary; duplicate equality cannot bypass sealing. Historical records, signatures and ordering were not rewritten. Newly added valid records do not make the old invalid segment trustworthy. Restoring a trustworthy complete chain requires an authoritative historical source/backup or an explicitly governed new trust boundary; neither was invented here. [Diagnosis](audit-diagnosis.json), [current verification](audit-final.json).

The existing physical_source_families readiness contract requires two current accepted physical-observation families (VIIRS, MTG-FCI, Sentinel-3 and configured sensing assets), not just two source URLs. The capture has stale FIRMS observations, MTG pixels not configured, Sentinel-3 pixels unavailable and sensing assets not configured. Current IPMA weather/warnings and newly acquired road, health, fire and reception sources expand real operational knowledge but do not satisfy that sensing gate. ${quality.data.facilitySources.length} registered facility-source entries are an inventory, not ${quality.data.facilitySources.length} current physical families. No fixture or model output was counted as a physical source. [Readiness](ready-final.json), [source inventory and counters](quality-final.json).

## LOCAL MODEL

The Homebrew Ollama 0.30.7_1 installation and existing cached weights were isolated outside VIGIA. Earlier logs showed Metal command-queue/context allocation failures before useful inference. A clean CPU-only service, small context, one request at a time, disabled offload and disabled automatic fitting restored deterministic startup. The existing services on 11434/11435 were left intact; the owned test servers on 11436/11437 were stopped after evaluation. Some process/sysctl diagnostics were sandbox-denied and are recorded as unavailable, not guessed.

${sentinels}

Only two cached models were tried in this sprint; Qwen3 0.6B served as the runtime probe. Llama 3.2 3B proceeded to **104 actual model requests** after its exact 20/20 gate. No weights were downloaded and no paid provider was called. The CPU/offload approach is consistent with the [Ollama troubleshooting documentation](https://docs.ollama.com/troubleshooting); the allocation failures are direct local-log evidence, not an inferred hardware defect.

${table(['Metric','Actual result'],[['Attempts',model.casesRun],['Completed responses',model.completedResponses],['Five-second timeouts',model.transportTimeouts],['Native process crashes observed',0],['Schema-valid / all attempts',pct(model.schemaValidPercent)],['Exact-correct / all attempts',pct(model.factCorrectPercent)],['Correct / completed responses',pct(model.accuracyAmongCompletedPercent)],['Schema-valid / completed responses',pct(model.schemaAmongCompletedPercent)],['Source-span pass / all attempts',pct(model.sourceSpanPercent)],['Abstention / eligible attempts',pct(model.abstentionPercent)],['Tool intent / intent attempts',pct(model.toolIntentPercent)],['p50 / p95 including deadline failures',num(model.p50Ms)+' / '+num(model.p95Ms)+' ms']])}

**No winner. Inference remains disabled.** The qualification policy required ≥99% schema validity, ≥95% exact correctness and tool intent, full source-span/abstention compliance, p95 ≤3 seconds and no request failures. Timeouts are unsuccessful attempts, not process crashes or completed-answer accuracy. The 17 completed outputs do not support a general performance claim. Two earlier exploratory runs with larger response budgets are retained separately and are not mixed into the 104-case result. Deterministic parser tests were never used as model accuracy. [Runtime](model-runtime.json), [actual evaluation and raw outputs](model-evaluation.json). Reproduce with \`python3 scripts/mega_v_model_runtime.py\` followed by \`node scripts/mega_v_model_report.mjs\`; these use existing local weights and no operational writes. Mandatory recurring inference cost remains **€0**.

## ASK VIGIA

Existing read-only tools now answer supported natural questions with deterministic intent parsing while the model is off:

- “Which hospital should I look at first?” → getQualifiedFacilities + getFacilityRoute, with the real Évora emergency-service qualification and retained numbers.
- “Nearest verified emergency hospital by road” → the same approved qualification tool with CALCULATED_ROAD ranking.
- “Nearest hospital with a public phone” → getFacilitiesNearIncident with a public-phone filter.
- “What road does that route use?” → selected-entity route details; ambiguous or missing referents are not invented.
- “Are any restrictions affecting that route?” → getRoadState, retaining the original observation time and latest source check.
- “What did we know an hour ago?” → a stored historical snapshot, with an explicit historical time and no later evidence joins.

Distances, ETA, road state, source time and capability render directly from tool results. SQL/URL injection, unsupported claims, arbitrary tool arguments and safety/evacuation assertions remain blocked or abstained. Scenario calls remain isolated. Broader model-driven language interpretation and difficult-document extraction are **not activated** because the actual model failed qualification. [Real tool traces](final-live-proof.json), [three-pilot answers and abstentions](live-proof.json).

## REAL INCIDENT CHAIN

**Évora reported point → Hospital do Espírito Santo de Évora → ULS-published emergency service → 6.4 km straight line → 7.55 km / 11.2 min calculated facility-to-incident route → EM527 / CM1081-1 → partial IP road coverage → no matched restriction in that returned coverage → no second retained qualified hospital → source-backed Why / Ask.** This is not a road-clearance or hospital-admission instruction.

The stored operational road-impact chain at **${h?.knownAt??'unavailable'}** connects the real Évora point and Bombeiros Voluntários de Redondo to N254 and an IP environmental-obstruction notice. Its original observation is **11 February 2026**, although the provider continued publishing it as active in September. That old observation is never described as “just observed.” The dated historical Ask returns HTTP ${h?.ask?.status??'unavailable'}. The latest captured projection has ${live.liveAffectedRoutes.length} affected retained routes; the older affected relation is explicitly historical, not silently promoted into current coverage. [Stored chain and current distinction](final-live-proof.json).

## LIVE VS HISTORICAL VS CONTROLLED VS SCENARIO

${table(['Evidence','Classification','What it establishes'],[['Official pages and IP fetches','Real source acquisition','Published capability, contact, designation and dated occurrence data; not availability'],['Évora hospital/brigade relationships','Real retained operational projection','Source-qualified facilities and calculated routes at the stated snapshot'],['N254 / Redondo impact','Real stored historical operational snapshot','A recorded affected route and its original source date'],['IP occurrence + deliberately chosen OSRM endpoints','Source-backed controlled case','Route applicability and consequence mechanics; zero operational fixture writes'],['Model corpus and PostgreSQL tests','Controlled evaluation','Actual inference / storage correctness, not live operational facts'],['What-if road/facility change','SCENARIO universe','Conditional consequences; operational records unchanged'],['Raster comparisons','Diagnostic reference comparison','Visual-language review; not exact old pixel parity']])}

## TESTS

- Focused backend/domain/frontend regression suite: **165 passed, 0 failed, 0 skipped**; actual PDF extraction included. See \`.tmp/mega-v/final-tests-verified.log\`.
- Real PostgreSQL session-temporary-table proof: **${pg.passed} passed, 0 failed**, zero operational fixture writes. Includes append/no-op, expiry retention, same-millisecond ordering, dependency lookup, queue merge/stale acknowledgement, scenario write rejection, no future leakage, queue-only fact preservation and reviewed fact foreign keys. [Evidence](postgres-proof.json).
- Full operator static verification passed after correcting stale expectations for the existing situation stylesheet and the explicitly requested intent-prewarm loading contract. It verifies syntax for 139 JS modules, asset attestation, controls, proxy/admission, map persistence, data truth, responsive rules and operational hardening. Some legacy test log messages still say seven routes; the approved primary navigation remains the six-route contract.
- Canonical rendered checks: **${visual.screens.length} captures**, **${visual.errors.length} page errors**, **${visual.screens.filter(s=>s.overflow).length} horizontal-overflow failures**; desktop 1672 × 941 and mobile 390 × 844, plus briefing widths 320–1600. Escape closes the tested drawers. Browser workflows cover briefing, history, comparison, historical map, scenario, document entry, Ask and facility-route inspection. An initial run under model load timed out and was not counted as a pass.
- Five reference/runtime/overlay/difference sets are diagnostic comparisons against available rasters. National Awareness has the later text composition contract and a canonical capture, but no matching approved current raster. **Full six-route pixel-parity certification remains unavailable.** [Visual evidence](visual/ui-qa.json), [comparison boundaries](visual/reference-comparisons.json).
- No full repository-wide test suite, deployment acceptance, physical-device test or native-GPU SLA certification is claimed.

## PERFORMANCE

The completed intermediate and interrupted final browser measurements are above and in [map-results.json](map-results.json). Direct PostGIS geography timing was measured separately; it is not a count of SQL calls caused by browser navigation. The final API health/quality capture is HTTP ${quality.status}; model state is **${quality.data.model.state}**. Background resolver and materialization profiles are [resolver-profile.json](resolver-profile.json) and [worker-profile.json](worker-profile.json). No empty overlay, fake geography or fabricated fast response was substituted for the backend.

## ACCEPTANCE A–U

${checks}

## REMAINING GAPS

1. Every failed map target above remains open, and the final-code run has no valid 20-sample p95 because it was interrupted under observed host contention. Large projections, first-visit raster/label work and software-rendering latency need further reduction and native-GPU measurement; this is not a release pass.
2. Audit history is still invalid, and the current sensing-family requirement is unmet. /ready correctly remains 503.
3. IP coverage is partial and point-based; increasing/decreasing directions lack chainage matching. Some active-published notices are old. No result establishes road safety.
4. Only one retained verified ED hospital and one verified fire-response facility are established for the Évora pilot. Alternatives, actual hospital admission, staffing and operational availability are not established.
5. Reception designation is available; current activation is not. A source-backed controlled admission test is not a real activation notice.
6. Multi-hour history exists. The 24-hour, seven-day and 30-day elapsed windows have not accumulated. The earlier PDF corrections and row-ID identity migration remain visible in retained history.
7. CPU startup is repaired, but the actual model fails latency and correctness qualification. Broader natural-language/model document intelligence remains off.
8. Full six-route native-reference pixel certification is not available; diagnostic visual comparisons and canonical interaction proof are provided without claiming parity.

## GIT

Branch: \`${branch}\`. HEAD: \`${head}\`. Verified local release: \`${release}\`.

Working-tree status has ${status.trim().split('\n').length} entries. The checkout was already heavily dirty at sprint start; the aggregate diff is not presented as solely this sprint's work. Start/end status artifacts are in \`.tmp/mega-v/\`. Existing work was preserved. No reset, stash, commit, push, merge or deployment was performed. Git metadata is read-only in this environment.
`;
await writeFile(dir+'/REPORT.md',text);await writeFile('.tmp/mega-v/end-status.txt',status);console.log(JSON.stringify({report:dir+'/REPORT.md',release,bytes:Buffer.byteLength(text),blocked: true}));
