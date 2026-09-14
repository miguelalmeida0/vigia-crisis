from pathlib import Path
import json, subprocess

root=Path(__file__).resolve().parents[1]
out=root/'docs/handoffs/mega-vii'
read=lambda name:json.loads((out/(name+'.json')).read_text())
live,model,runtime,mlx,restart,state,perf=[read(n) for n in ['live-proof','model-corpus','model-runtime','mlx-startup','restart-proof','final-state','map-performance']]
visual=out/'visual'
qa=json.loads((visual/'focused-qa.json').read_text())
routes=json.loads((visual/'routes-qa.json').read_text())
discovery=json.loads((visual/'discovery-qa.json').read_text()).get('discovery',{})
def link(name,label=None):return f'[{label or name}](<{out/name}>)'
def image(name,label):return f'![{label}](<{visual/(name+".png")}>)'
def table(head,rows):return '| '+' | '.join(head)+' |\n| '+' | '.join(['---']*len(head))+' |\n'+'\n'.join('| '+' | '.join(str(c) for c in row)+' |' for row in rows)
cases=perf['lanes']['after']['cases']
prior={c['case']:c for c in perf['previousSprintAfter']['cases']}
requests=table(['Stored projection','HTTP','Elapsed ms','Response bytes'],[[r['part'],r['status'],r['ms'],r['bytes']] for r in live['requests']])
map_table=table(['Journey','Samples','Median ms','p95 ms','Previous sprint p95 ms','Missing frames / projection failures','Existing gate'],[[c['case'],c['n'],c['medianMs'],c['p95Ms'],prior.get(c['case'],{}).get('p95Ms','—'),f"{c['failed']} / {c['projectionFailures']}",'PASS' if c['passed'] else 'FAIL'] for c in cases])
blocking=[c for c in state['readiness']['data']['checks'] if not c['ok'] and c.get('blocking')]
checks=table(['Readiness check','Observed state'],[[c['id'],c['state']] for c in blocking])
completed=sum(not r.get('error') for r in model['rows'])
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
branch=subprocess.check_output(['git','branch','--show-current'],cwd=root,text=True).strip()
text=f'''WHAT A USER CAN NOW DO THAT THEY COULD NOT DO BEFORE

Open Operational Picture, select EM527, inspect its qualified support dependencies, test its unavailability directly, add a facility failure, and see lost and retained paths. Select Louredo to see its population context and support network; switch service coverage; replay actual retained captures; compare before/after relationships; inspect bounded failure combinations; ask a supported question and watch the map respond.

The visible deterministic implementation is delivered. **Mega VII is not release-certified:** local AI failed qualification, the 30-second discovery gate is not certified, map timing gates are reported below, and operational readiness remains red. None of these are presented as completed merely because code exists.

Release examined: {state['releaseId']}. Readiness captured {state['capturedAt']}. This is a local rehearsal, not a production deployment.

## VISIBLE INTELLIGENCE

Response & Access now has one dominant map and an aligned Operational Support rail. Incident Detail exposes the same Operational Picture action. Existing primary navigation, source distinctions, geographic facility context and reference visual language remain. The user expressly approved the VII composition in the supplied brief; the design is recorded in {link('design-read.md','the design read')}.

{image('final-operational-picture','Operational Picture on the real retained incident')}

{len(qa['screens'])} final focused captures, {len(qa['errors'])} page errors, and no horizontal overflow in the focused matrix. Widths: 1672, 1440, 1280, 1024, 768, 430, 390 and 320. The six primary routes also have desktop and mobile canonical captures. These are rendered browser results, separate from controlled-domain tests.

The fresh-session script used visible primary controls. Its measured result was {discovery.get('secondsFromNavigation')} seconds; all five discoveries: {discovery.get('allFive')}; within 30 seconds: {discovery.get('within30Seconds')}. It is **not an independent human comprehension test**. An earlier attempt selected community access loss when no current community road was qualified; the UI correctly kept that absence explicit. No historical relationship was promoted to current to make this test pass.

Five approved raster references have fresh runtime/overlay/difference artifacts in {link('visual/reference-comparisons.json','the comparison manifest')}. They are diagnostic comparisons against references that predate the expressly approved recomposition, not an exact pixel-parity claim. The retained raster pack has no matching National Awareness design; its current textual composition contract and canonical screenshot are supplied, and national raster parity is not certified.

## OPERATIONAL PICTURE

The backend provides qualified facilities, selected incident, important communities, admitted geometry when available, and calculated support paths. Geographic-only POIs remain secondary. Selecting an object filters its relationships. The map uses stored geometry; a named corridor is not fabricated into a surveyed centerline. Current ranking reevaluates freshness; historical ranking uses the retained knowledge time.

Operational Support distinguishes verified emergency healthcare, verified fire response and designated reception. Primary and alternative facilities are named, with calculated minutes, road dependencies and calculation times. A mapped hospital with unverified emergency capability cannot outrank a qualified emergency department merely because it is closer. No retained qualified route remains an explicit absence.

## ROAD INTELLIGENCE

EM527 opens a shared-corridor lens with retained relationship counts, facility/community dependencies, partial road-information state and check time. Show dependencies, Test unavailable and Ask VIGIA are direct actions. Whole calculated paths are clearly described when exact road-step geometry is absent. No road risk score or inferred open-road claim is introduced.

{image('final-em527-lens','EM527 dependency lens at the displayed retained time')}

## COMMUNITY INTELLIGENCE

Louredo is a selectable operational object. The retained example has 112 residents from Census 2021, 0.7 km from the reported incident point, attributable location/population sources, qualified healthcare/fire relationships and nearby designated reception. Census population is not a present-person count. Proximity and support do not imply evacuation need.

Show support network clears the category filter and highlights its complete retained network. Coverage changes keep the community sheet visible. Access-loss testing requires a retained qualified access dependency and reports its absence if none exists.

{image('final-louredo-qualified','Louredo population and support network in the labeled historical view')}

## COVERAGE

Healthcare, fire response and reception are mutually selected map modes. Healthcare uses ≤15 / 15–30 / >30 minute categories; fire response uses ≤10 / 10–20 / >20. Missing routes have a distinct category. Reception distinguishes designation from confirmed activation. The geometry is community points and calculated paths, never continuous isochrones or a speculative heatmap.

{image('final-healthcare-before','Healthcare coverage before the explicit road-failure assumption')}

## FAILURE / RESILIENCE

Direct road/facility tests and Add failure recompute isolated scenarios. Lost routes remain dashed; retained routes remain blue; affected facilities/communities remain inspectable. Support comparisons show the previous/current primary, minutes and retained-option count. Missing alternatives are stated, not invented. Historical assumptions retain the historical label/time in the inspector and are prominently marked as scenarios on the map.

{image('final-healthcare-failure','Healthcare map and support consequences under EM527 unavailability')}

Limited-support-redundancy communities are selected from explicit conditions: a single qualified option, shared primary road, absent current route or unconfirmed nearby reception activation. They are not wildfire vulnerability scores. {link('visual/final-limited-redundancy.png','Limited redundancy capture')}.

## CAUSAL HISTORY

Material retained events show support changes and open before/after map relationships. The timeline now reads only causal-event payloads from stored snapshots instead of transferring whole snapshot history. A direct request improved from about 26 seconds in the earlier measured run to 1.3–1.7 seconds in subsequent runs; this is a measured example, not a latency guarantee. Empty intervals remain explicit.

{image('final-causal-timeline','Causal timeline with attributable retained changes')}

## MISSION REPLAY

Play, Pause, Step, the existing styled time dropdown, Compare with now and Return to now operate on actual retained snapshots. The map reconstructs retained facilities, routes, communities, admitted geometry and thermal coordinates where present; weather is labeled with measurement time. Missing captures are unknown rather than interpolated. Query epochs prevent late responses replacing a newer selection. Return to current map clears historical/scenario inspector state as well as the renderer.

{image('final-replay-paused','Mission Replay paused at an actual retained capture')}

## STRESS TEST

The deterministic engine tests at most 12 combinations: significant roads, primary hospital/fire facilities, and bounded road/facility pairs. It reports affected relationships and groups losing their last retained option, ordered by explicit consequences. Inspect consequences transforms the same map. A retained historical example returned 11 combinations; current results depend on currently qualified relationships.

{image('final-stress-test','Bounded stress-test results from the selected retained network')}

## INTELLIGENCE GAPS

A compact gap control opens unresolved qualified support, reception activation and source-coverage gaps. A missing retained value is labeled as such; it is not falsely described as an exhaustive search finding no authoritative value. Source-unavailable status is separate. {link('visual/final-gaps.png','Gap view')}.

## ASK VIGIA

Deterministic approved tools return validated map intents. What depends on EM527? focuses its dependencies; What if it closes? resolves that road referent and enters an isolated scenario. The single-retained-hospital question preserves its exact filter. Existing Ask drawer outputs also dispatch sanctioned application commands. The model cannot generate UI code or calculate operational facts.

{image('final-ask-followup','Ask follow-up applying an isolated road scenario')}

## LOCAL AI

The implementation separates the Node API from a loopback LocalIntelligenceRuntime and one Python MLX worker. It has a bounded queue, startup/inference deadlines, cancellation, health state, output limits, qualification receipt and DisabledModel fallback. Ordinary map/facility/road/community use has no model dependency. The inactive adapter makes zero network/model calls in the regression test, and the running product reports the model disabled.

Primary target: [mlx-community/Qwen3.5-2B-MLX-4bit](https://huggingface.co/mlx-community/Qwen3.5-2B-MLX-4bit), using its MLX-VLM-compatible direct runtime rather than routing through Ollama. The allocation probe failed before weights loaded: Metal reported no device in this execution environment. Health requests: **{mlx['startup']['passed']}/{mlx['startup']['attempts']} successful**. No Qwen corpus inference is claimed. The host interpreter also lacks mlx-vlm; the failed Metal probe occurred before that import. Exact dependency/model setup and qualification remain necessary; see {link('LOCAL_AI.md','local runtime status')}.

Fallback: Llama 3.2 3B through the isolated native llama.cpp CPU runtime. It passed 50/50 real inference sentinels, then executed all 104 Portuguese controlled-corpus requests.

{table(['Metric','Observed'],[['Completed',f'{completed}/{model["casesRun"]} ({completed/model["casesRun"]*100:.2f}%)'],['Valid structured result',f'{model["schemaValidPercent"]:.2f}%'],['Exact task/fact accuracy',f'{model["factCorrectPercent"]:.2f}%'],['Source-span support',f'{model["sourceSpanPercent"]:.2f}%'],['Tool-intent accuracy',f'{model["toolIntentPercent"]:.2f}%'],['Unsupported-value abstention',f'{model["abstentionPercent"]:.2f}%'],['p50 / p95',f'{model["p50Ms"]} / {model["p95Ms"]} ms'],['Request timeouts',model['requestErrors']],['Selected model','None — both candidates rejected']])}

The 81 errors are request deadlines, not 81 native process crashes. Supported-extraction precision was not independently established; the exact-task and source-span results already fail qualification. Both models remain rejected. Flexible model-based Ask, hard-document AI extraction and background AI interpretation are **not enabled or certified**.

The machine reports 16 GiB physical memory. MLX loaded no weights. Process-level RSS decomposition was blocked by the execution environment; system memory diagnostics are retained and are not presented as model RSS. No models run simultaneously. Evaluation-only workers were stopped; no inference model remains resident from this sprint.

Document integration tries deterministic parsing first and uses a qualified model only for bounded candidate extraction. Literal source passages, object matching, authority validation and existing review/admission remain mandatory. Unsupported literal values are blocked in tests. A real hard-document run with a selected qualified model remains blocked because no model passed. Corpus cases are controlled Portuguese tasks, not observed operational facts.

Evidence: {link('mlx-startup.json','MLX health attempts')}, {link('model-runtime.json','native runtime/startup diagnostics')}, {link('model-corpus.json','all 104 actual inference results')}.

## HOSTED FREE FALLBACK

Cloudflare configuration/credentials were absent. The optional hosted adapter was not activated or implemented, no paid fallback was added, and no hosted inference charges were incurred. Provider choice is independent of the UI. Core deterministic behavior remains available when AI is disabled.

## PERFORMANCE

{map_table}

Same 1728×966 retained-renderer benchmark harness, fresh HTTP cache for each cold context, normal VIGIA background work, no model inference and no source-cache substitution. Previous-sprint numbers are a separate measurement window on this shared workstation, not a controlled causal experiment. Missing frames and projection timeouts fail the gate; they are never replaced with zero. Full results: {link('map-performance.json','map performance')}.

Docker stopped on 13 September after 135 journeys: 16 complete contexts and seven journeys in context 17. The interrupted raw file is preserved. Four new cold contexts ran after runtime recovery on 14 September, giving 20 complete contexts plus the original partial context, 167 recorded journeys in total. All measured failures remain included; the interrupted national navigation is recorded separately. This is a resumed benchmark across two time windows, not one uninterrupted run.

The Operational Picture payload was reduced from the earlier measured 2.77 MB to roughly 0.23–0.40 MB in representative subsequent runs by removing duplicate geometry and returning compact support projections. The API requests below are stored-data requests, not source refreshes. Normal map rendering does not await model inference or newly fetched external intelligence.

{requests}

## TESTS

- 86 scoped domain/API/persistence/map tests passed, including 11 new cognition/model-boundary tests; zero failed.
- Final console static verification passed: production build, syntax, asset integrity, route, UX and operational-hardening contracts. This is not a claim that every repository test was run.
- Final focused browser run: {len(qa['screens'])} captures, {len(qa['errors'])} page errors; eight viewport widths, direct road failure, multi-failure, community network, all three coverage modes, limited redundancy, causal before/after, replay, stress consequences, Ask follow-up and return-to-current behavior.
- Six-route desktop/mobile capture run: {len(routes['screens'])} captures, {len(routes['errors'])} page errors.
- Restart: {restart['retainedUnchanged']}/{restart['expected']} sampled snapshot hashes unchanged; scenario rows in operational snapshot storage: {restart['scenarioRows']}. This proves those records persisted, not that every persistence readiness check is healthy.
- Real stored/live API, historical and isolated scenario captures are retained in {link('live-proof.json','runtime proof')}.

Acceptance A–P is implemented with controlled/runtime/browser evidence as described above. Q failed for MLX; fallback startup passed. R executed 104 cases and failed qualification. S and V remain blocked by rejection. T passed the unsupported-value boundary test. U passed deterministic behavior with AI disabled. W is not applicable because the optional hosted adapter was not configured.

## LIVE VS HISTORICAL VS SCENARIO VS MODEL

Current views reevaluate route/capability freshness at request time. A retained snapshot timestamp is not a fresh observation. Historical views use only the selected retained knowledge state. Scenarios are explicit assumptions with no operational-history writes. Model evaluation uses synthetic controlled Portuguese corpus text and performs no operational writes. No live, historical, scenario or model evidence is substituted for another.

## REMAINING GAPS

{checks}

Readiness is HTTP {state['readiness']['status']}. The invalid audit chain and insufficient current physical sensing are unresolved. Any additional readiness failure in the table is also unresolved; historical snapshot persistence does not clear it. FIRMS is stale, MTG acquisition is not configured, and Sentinel-3 acquisition is unavailable in the captured state. Map imagery and institutional context do not replace current thermal/field sensing.

There is no qualified free local model; no enabled flexible AI or certified AI hard-document flow. The 30-second release criterion is not certified by an independent human test, and the script's actual timing remains above. Exact reference parity is not certified, particularly for the missing matching National Awareness raster. Current support can legitimately disappear when its calculation or capability expires; history remains available with its own label. Calculated routes do not establish safe travel or current reception availability.

## GIT

Branch: {branch}. HEAD: {head}. The inherited worktree already contains substantial changes from previous sprints. This sprint adds cognition projections, the visible operational-map workspace, model isolation/gates and verification artifacts while preserving that work. No reset, stash, commit, push or production deployment was performed. Git metadata is read-only in this execution environment.
'''
(out/'REPORT.md').write_text(text)
print(str(out/'REPORT.md'))
