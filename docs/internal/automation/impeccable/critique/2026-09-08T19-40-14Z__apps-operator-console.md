---
target: Full primary product before convergence
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 11
target_identity: "file:/Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/operator-console"
timestamp: 2026-09-08T19-40-14Z
slug: apps-operator-console
---
Method: dual-agent (A: /root/product_audit_design · B: /root/product_audit_technical)

# Full-product baseline synthesis

VIGIA had credible domain facts and real maps, but two style families, tiny supporting text, crowded mobile ordering and conflicting semantic color weakened trust. Assessment A covered all 22 requested dimensions on every route; Assessment B measured the remaining four widths and shared interactions. Baseline Nielsen score: 25/40. No P0 workflow blocker was established; the following consolidated P1 scope drives implementation.

| Scope | Design evidence | Technical evidence | Correction |
|---|---|---|---|
| Shared shell | A10 | B4 | One rail/header/content origin and mobile gutter |
| Typography/controls | A03 | B5 | Disciplined readable roles and touch targets |
| Semantic color/AA | A02 | B1/B8 | Weather blue, meaningful red/orange, consistent connection state and accessible inks |
| Responsive hierarchy | A01/A09 | B2/B3 | Mobile priority first, tablet stacking, native secondary disclosure |
| Overview | A04 | B2/B3 | Dominant map, concise situation, compact alerts, deeper source/history |
| Incident investigation | A05 | B2/B7 | Current-first dated records and immediate mobile preview |
| Shared maps | A06 | B7 | No forced popup, stable controls, route-specific overlay defaults |
| Response comparison | A07 | B5 | Qualified shortest estimate and explicit nearest-distance basis |
| Fire change | A08 | B2/B5 | Trends before raw history; remove repeated station/delta decoration |
| National attention | A09 | B2 | Leading area and map early; adjacent selection details |
| Dialog focus | — | B6 | Trap within modal panel; untabbable backdrop; exact trigger restoration |

The strongest baseline was desktop Fire Activity, with actual samples beside geography. Preserve measured zeros, source dates, honest limitations, existing selection and mobile-navigation focus behavior. Retain Incident Detail in primary navigation: the selected incident spans Detail/Fire/Response, and removing one link alone would weaken orientation.

The detector returned zero source-markup findings; browser evidence still established concrete contrast and focus failures. Inline detector injection was attempted and blocked by the canonical CSP. No overlay or live detector server is claimed; neither policy nor CSP was weakened.

Before scores and per-category reasons: before-scores.json. Full 22-dimension design review: audit-design.md. Measured evidence: audit-technical.md and before/qa-technical.json. The implementation specification is design-spec.md. Questions skipped: the user explicitly authorized the complete audit-to-implementation pass and supplied the product direction and priorities.


# Independent Assessment A — full product before audit

Method: independent design agent `/root/product_audit_design`; no detector output, other assessment, or prior verdict read. Target: canonical `http://127.0.0.1:4190`, six primary routes, 8 September 2026. Fresh isolated Chromium contexts via `vigia-visual-qa:playwright-1.54.0`; one-time admission and host forwarding reused without changing the previous capture script. No application edits, app rebuild, or server restart. Twelve required before screenshots at 1728×966 and 390×844 were captured and visually inspected at native image resolution. Geometry, computed typography, DOM content, source inspection and interaction evidence accompany the images. Other widths belong to Assessment B and are not inferred here.

## Design specificity and first impression

VIGIA is recognizably operational wildfire software. Real mapped geography, source dates, qualified observations, named facilities and the restrained light shell are specific to its work. It is not yet one converged product: the older overview/detail/national family and newer field routes have different shell widths, type, icon construction and color meanings. The largest failure is compositional, especially on mobile: first view spends its attention on weather cards and provenance links before the incident, map or ranked area decision. This is a material usability problem, not a request for decorative polish.

Fire Activity is the strongest desktop page: real sample charts, the selected incident's geography and measured change share a viewport. Response & Access provides useful qualified comparisons. Source distinctions and measured zeros are generally preserved. These strengths should survive the refinement.

## Priority ledger — implementation scope

No P0 functional blocker was established by Assessment A. The following P1 issues materially reduce operational interpretation, mobile access or trust.

| ID | Severity | Route / source or selector | Before evidence | Required refinement |
|---|---|---|---|---|
| A01 | P1 | All; `.current-situation`, `.dynamic-signals`, `.field-signals`, `.response-snapshot`, `.national-situation` | At 390px map starts at y=1516 Overview, 1578 Incidents, 906 Detail, 745 Fire, 872 Response, 1014 National. National priority is later still. Overview hero alone is 845px tall; Detail conditions 632px; Response snapshot 515px. | Deliberately compose mobile around one P1 fact/action then map or list. Replace vertical walls of equal weather cards with concise rows and one contextual station/time line; move extra detail to native disclosure. Make selected preview immediately reachable. Preserve useful measured values and limitations. |
| A02 | P1 | All semantic tokens; `signals`, `field.css`, `hierarchy.css`, `shell.css` | 19.4°C in Detail is saturated red; same value on Fire is amber; Fire temperature trend red; wind green on Overview but blue elsewhere; rain green on Fire, blue on Detail. Connected badge is amber on Detail/National but green on field routes. Highest danger municipality count is blue on National but amber on Overview. Selected incident/popup buttons remain purple-indigo. | One semantic palette: weather/information blue or neutral; fire attention only where supported; warning amber, healthy connection green; VIGIA red for primary/selection. Temperature alone must not assert danger. Align the same fact and state across routes. |
| A03 | P1 | Product typography and controls; `styles/approved/hierarchy.css`, `field.css`, `tokens.css`, `.mobile-menu`, filter selects | Primary support names, map legend labels, limitations and actions are often 10–11px. Mobile menu 31×38px; incident filters 39px high; search 37px; Detail Ask/Change 38px. Large values coexist with hard-to-read meaning. | Small disciplined type roles: readable operational/body/control text, metadata kept legible rather than simply shrunk. Apply ≥44px touch targets across shell and controls; consistent focus and focus restoration. Audit contrast against actual fills. Do not increase card height to accommodate typography; simplify composition. |
| A04 | P1 | Overview `overview.js`, `.overview-main`, `.operator-alerts`, `.current-situation`, source/workload panel | Equal-width columns allot ~493×407px to empty Operator alerts and only ~485×350px to the map. Hero photographic mountain scene, icon gradients and tall weather tiles dominate; a source-health ring and 1284 information-to-collect count compete below. | Expand map and priority workspace. Collapse empty alerts to an honest inline status; make source/workload compact utility detail. Replace decorative hero photograph/eyebrow with established operational canvas and concise national situation. Keep useful official notices prominent without duplicating metrics. |
| A05 | P1 | Incidents `routes/incidents.js`, `.incident-list`, `.incident-preview-panel`, `PhysicalInline` | 256 records default to Source order; first seven all need revalidation despite National showing current/candidate areas. Incident observation date absent in list while every weather line repeats age. At 390 preview y=1500, after seven long rows; selection gives no nearby visible map/action. Preview repeats status three times and exposes Source coverage not returned. | Current/candidate records first using existing status data, then dated historical/revalidation rows. Compact physical summary with shared measurement context; show incident age distinctly. On mobile selecting a row opens/reveals contextual preview with a clear Open incident action and return to list. Omit unavailable coverage from prime preview, preserve disclosure. |
| A06 | P1 | Shared maps `ui/map.js`, map runtime overlays, `.field-map-legend` | Incidents 208px map clips selected popup at top; Overview popup collides with map footer. Detail popup offers Open incident workspace while already there. Multiple layer controls and wind cards compete with incident position; Detail shows response paths and facilities, and Fire map visually includes road estimates. Legend language varies across routes. | One learned marker/control/legend vocabulary with route-specific defaults. Do not auto-open an oversized popup on entry; use explicit selection disclosure, particularly mobile. Avoid self-navigation CTA; keep selected marker visible. Compact legends, keep supported layers accessible in drawer, and use larger usable preview map geometry. |
| A07 | P1 | Response `ui/access.js:16,28`, `.response-snapshot`, `.nearest-support`, `.access-priority-rail` | Best mapped approach overstates an estimate. Nearest support explicitly says straight-line ranking but displays only road time/distance when qualified, hiding distance used to choose each nearest facility. Same police/route appears snapshot, map popup, approaches, interpretation and support. Mobile interpretation precedes access approaches (y=1478). | Label Shortest returned road estimate; display straight-line distance for nearest selection and road estimate as secondary context. Lead with one approach summary, then map and access comparison; supporting categories below. Move interpretation/history after approach/support and remove repeated sentences. |
| A08 | P1 | Fire `routes/fire-activity.js`, `.field-feed-panel`, `.conditions-trend-panel`, `.field-signals` | Same -2.4°C / -2.2km/h / +3.6mm appears in metric cards, four-row What changed feed and trend section. Mobile chart begins y=1542, after the feed; station distance becomes a full metric although already in banner. | Let current value and real sample change form one deliberate summary. Put trends before repeated event history; collapse the dated reading list and station provenance. Retain sample timestamps, no invented interpolation. |
| A09 | P1 | National `.national-situation`, `.national-map-heading`, `.regional-priority`, map scene | Six equal cards plus notice band consume 681px at 390. Ranked regions invisible first viewport; filter/action chrome occupies another ~227px above map. Entry with selected incident shows center/north Portugal and selected Lever popup, rather than an immediately legible national overview. | A compact national situation + leading ranked area + map first. Put extra metrics/filters in accessible disclosures; priority selection should reveal map-adjacent detail. Keep route camera independent of incident context and verify national reset bounds; never invent region membership. |
| A10 | P1 | Shell `.vg-sidebar`, `.field-shell`, `field.css:27`, `.vg-header` | Sidebar changes from 184px on Overview/Incidents/Detail/National to 202px on Fire/Response. Title x=206 vs224. Mobile gutter is 14px vs8px, page title 22px vs24px, different header heights. Same user traverses visibly different applications. | Converge one sidebar width/content origin, page title scale, header, page gutters, button radii/heights and icon weight; retain authored route composition inside that stable shell. |

## Before scores / 10

Scores judge the captured desktop/mobile pair, weighted toward task performance and readability, not taste. 9–10 requires strong delivery on both; 7–8 is useful with bounded weaknesses; 5–6 is usable but materially compromised; below 5 means primary task access/hierarchy fails. No score is an accessibility certification. Detailed per-score reasons are stored in `before-scores.json`.

| Route | Hierarchy | Typography | Spacing | Density | Color | Consistency | IA | Interaction | Responsive | A11y | Polish |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Command Overview | 5 | 6 | 6 | 4 | 4 | 5 | 6 | 6 | 3 | 5 | 5 |
| Incidents | 6 | 6 | 7 | 5 | 5 | 6 | 5 | 5 | 4 | 5 | 6 |
| Incident Detail | 6 | 6 | 6 | 5 | 4 | 5 | 7 | 6 | 4 | 5 | 6 |
| Fire Activity | 8 | 6 | 7 | 6 | 5 | 5 | 7 | 7 | 5 | 6 | 7 |
| Response & Access | 7 | 5 | 6 | 5 | 7 | 5 | 6 | 7 | 4 | 6 | 6 |
| National Awareness | 7 | 6 | 7 | 5 | 4 | 6 | 7 | 7 | 4 | 5 | 6 |

## First five seconds / next ten seconds

| Route | Fact perceived in 5 seconds | Action identified within 10 seconds | Assessment |
|---|---|---|---|
| Overview | Desktop: Portugal weather extrema. Mobile: 35.3°C and lengthy national prose. | Desktop View all/priority status. Mobile no incident/map action yet. | Wrong P1 emphasis; attention should go to highest-priority returned incident/area with explicit observation status. |
| Incidents | 256 records; first names/statuses. | Desktop Open incident; mobile only chevrons and filters. | Purpose clear, freshest record and selection consequence unclear. |
| Detail | Selected Lever; 19.4°C red. | Ask Vigia/Change incident visible; Fire/Response far below mobile. | Location clear but weather color distracts from incident status; station context oversized. |
| Fire | Lever, weather and valid zero thermal observations. | Desktop Map layers/View readings; mobile Change incident and Map layers. | Desktop useful; mobile needs change/trend earlier. |
| Response | Lever, 2.5 min from named police facility. | View route details visible on both. | Strongest mobile immediate action, but Best mapped approach overpromises and supporting snapshot is too tall. |
| National | Desktop 5 active source records, Bragança ranking, map. Mobile weather/record tiles. | Desktop choose area; mobile notices only. | Mobile fails national attention selection until much later. |

## Route audits — all 22 dimensions

### Command Overview

1. Visual hierarchy: hero weather and empty alert frame outrank map/priority; A01/A04.
2. Information hierarchy: national attention is buried under weather extrema; keep current report status and one priority lead.
3. Typography: page title strong; small source/domain copy and repeated low-size links compete with 24px values.
4. Spacing: large vacant lower portions of metric tiles; the hero expands to 845px on phone.
5. Density: simultaneously sparse empty alerts and overcrowded below-fold activity; redistribute rather than add.
6. Layout: three equal desktop columns poorly fit priority/map/empty alert needs.
7. Containers: hero metrics are visual groups; map is necessary frame; empty alert full panel and health ring are redundant primary framing.
8. Color: red temperature and green wind imply meanings not established; warning count semantics vary elsewhere.
9. Iconography: gradient-backed hero icons differ from flat outline/square section icons.
10. Maps: dynamic basemap and reported markers useful; popup/footer collision and dense legend reduce the small viewport.
11. Tables/lists: priority rows readable but duplicated Needs revalidation labels consume space; activity has many equally weighted controls.
12. Filters/search: no primary problem in national landing; activity category filter has nine choices visible, exceeding low-load target.
13. Buttons/actions: action label Needs revalidation describes status rather than Open incident; View all clearer.
14. Status language: last-known banner honest but sidebar green for Last known contradicts amber header.
15. Empty states: large No recent material changes returned block is a primary container without actionable content.
16. Responsive: map y=1516; page height 4111; no operational action in first mobile view.
17. Accessibility: menu 31×38px; supporting action text 11px. Contrast must be measured by B; do not assert a completed AA audit.
18. Interaction feedback: controls exist; map selected popup partly cut off weakens selection feedback.
19. Consistency: shell alignment differs from Fire/Response; duplicate icon and color systems.
20. Duplication: warnings/counts/refresh/status repeated in hero, metric group, notice and source sections.
21. Unnecessary information: source-health gauge/work backlog and Current situation eyebrow compete with real wildfire questions.
22. First viewport: desktop purpose clear but wrong emphasis; mobile priority task inaccessible.

### Incidents

1. Visual hierarchy: list/preview split is intelligible; preview button has a strong destination.
2. Information hierarchy: Source order does not privilege current/candidate observations; weather age replaces incident age in rows.
3. Typography: names strong; repeated weather copy at 12px lacks differentiation between station fact and report recency.
4. Spacing: desktop rows have deliberate padding; expanded multimetric rows overwhelm phone length.
5. Density: seven entries times up to four weather facts create a long reading task before preview.
6. Layout: desktop split sensible; mobile stacks entire list ahead of selected context.
7. Containers: list/preview necessary frames; repeated preview definition rows add bureaucratic framing.
8. Color: lilac selected row and purple popup CTA conflict with red primary action; stale header/green connection inconsistency.
9. Iconography: repeated orange flame cannot distinguish current and historical records; use status alongside differentiated context.
10. Maps: 208px preview too shallow for popup/controls; selected popup clips its incident title/date.
11. Tables/lists: rows are native buttons with pressed selection; main date omitted despite history importance.
12. Filters/search: clear names and reset, but all statuses default includes source-order historical results; mobile filters too tall collectively yet too short individually for touch.
13. Buttons/actions: desktop Open incident good; phone action after y≈2000.
14. Status language: Needs revalidation duplicated list, badge, field and popup; source age is more useful.
15. Empty states: No matching incidents offers reset; Source coverage not returned should leave primary preview.
16. Responsive: preview y=1500 and map y=1578 make selection consequence remote.
17. Accessibility: native search/select and buttons help; search 37px, select 39px do not meet 44px contract.
18. Interaction feedback: selected row shows pressed state; mobile consequence needs drawer or nearby contextual reveal.
19. Consistency: strong shared list patterns but purple selection differs from command red.
20. Duplication: state, type, place and missing coverage repeated across selection and preview.
21. Unnecessary information: literal Source order gives implementation detail without helping choose; repeated measurement age on each line.
22. First viewport: route purpose clear; most important incident and mobile open action not clear.

### Incident Detail

1. Visual hierarchy: clear incident title and map on desktop; conditions overpower mobile.
2. Information hierarchy: conditions → map succeeds structurally; status/date should remain immediately clear, and station distance should support conditions rather than become P1.
3. Typography: 27px values contrasted with 10–11px dates/deltas; title legible, supporting meaning too small.
4. Spacing: five signal tiles leave excess whitespace on desktop; full-width station tile creates phone dead space.
5. Density: first phone screen filled by five weather/station tiles; useful sparse fire data should stay compact.
6. Layout: wide desktop map with shallow right context causes bottom-right void; moving supportive info is preferable to new cards.
7. Containers: map necessary; conditions visual group; Next attention need not be a separate titled white box.
8. Color: red 19.4°C and decrease unsupported; Connected badge amber; A02.
9. Iconography: unboxed thin condition symbols differ from Fire's filled icon blocks for same readings.
10. Maps: ample desktop geography; popup Open incident workspace is redundant current-route action; several footer/control layers.
11. Tables/lists: small factual context appropriate; no gratuitous analytical table needed.
12. Filters/search: Change incident obvious; long native incident select requires usability inspection but no invented search needed.
13. Buttons/actions: Ask and Change distinct; Fire/Response links lost below phone map; 38px buttons short.
14. Status language: needs revalidation visible, but report observation date primarily in map popup; promote date near state.
15. Empty states: no matching thermal returned truth acceptable compactly; nearby places not established should move to contextual disclosure.
16. Responsive: map y=906, first phone view contains no fire context beyond status.
17. Accessibility: readable title and labelled actions; inconsistent touch target floor and tiny fact action labels.
18. Interaction feedback: Why this/Data coverage are discoverable; map self-CTA should be removed.
19. Consistency: this route uses old shell and colored value style distinct from sibling field routes.
20. Duplication: station distance in heading and full tile; data coverage appears twice; Fire activity repeats current weather.
21. Unnecessary information: technical provenance appropriately deep; station metric can become shared context.
22. First viewport: title/action clear, but P1 most prominent fact is misleadingly red ordinary temperature.

### Fire Activity

1. Visual hierarchy: desktop map and changes/trends share viewport effectively.
2. Information hierarchy: real change is present but repeated; on mobile trend follows four event rows.
3. Typography: strong values, titles readable; dates/limitations, plots and map legend are small 10–11px.
4. Spacing: desktop compact and intentional; signal tiles consume 389px on mobile.
5. Density: six metric tiles plus four change rows plus three charts repeat same facts.
6. Layout: map/rail division works at 1728; one-column mobile ordering needs authored prioritization.
7. Containers: map/chart necessary frames; per-metric icon boxes and event frame overemphasize repeated context.
8. Color: amber temperature, green rain, red temperature chart are inconsistent with other routes and warning meaning.
9. Iconography: colored square icons optically stronger than Detail thin icons; several blue section icon boxes repeat.
10. Maps: real selected geography useful; response route paths/facilities compete with fire observations by default.
11. Tables/lists: dated events clearly source-named; four parallel weather rows can be a disclosure under trends.
12. Filters/search: Map layers/Change incident actionable without excessive controls.
13. Buttons/actions: View readings meaningful; mobile exact readings lower than necessary.
14. Status language: Earlier report vs Needs revalidation differs from Detail, though both should preserve the same underlying interpretation.
15. Empty states: thermal 0 is a usable measured result, correctly retained; no filler needed.
16. Responsive: map begins y=745 and trends y=1542; first viewport mostly weather tiles.
17. Accessibility: 44px field action targets and dated focusable chart marks are strengths; tiny legend still hard to read.
18. Interaction feedback: real samples and exact reading disclosure support trust; avoid decorative motion.
19. Consistency: sibling Response shell coherent; differs from four other routes.
20. Duplication: deltas repeated in card, change feed, chart; station distance repeated banner/tile.
21. Unnecessary information: tiny tile sparklines repeat real lower chart and are visually weak.
22. First viewport: strong desktop decision support, weaker mobile change understanding.

### Response & Access

1. Visual hierarchy: shortest estimate stands out; map/approaches visible desktop.
2. Information hierarchy: phone summary gives action then repeats support before map; interpretation precedes actual comparison.
3. Typography: several critical limitations/category labels at 10px; numeric ranking values excellent size.
4. Spacing: 515px phone snapshot has long category blocks and repeats data below.
5. Density: repeated shortest route across five sections increases reading without adding knowledge.
6. Layout: desktop map/approach proportion appropriate; mobile ranking y=1478 undermines comparison workflow.
7. Containers: approach comparison necessary; large tinted snapshot plus tinted interpretation duplicates emphasis.
8. Color: blue informational context appropriate; warning only in adjacent explanatory language, no invented facility availability color.
9. Iconography: facility category icons helpful; one consistent small outline family preferable to map-panel icon box treatment.
10. Maps: route lines/geography operationally relevant; generic identical facility circles require clear selection/legend semantics.
11. Tables/lists: ranked durations scan well; nearest list hides actual straight-line comparison value behind road figure.
12. Filters/search: support inventory accessible through View all; category choice should remain in drawer.
13. Buttons/actions: View route details clear; Best mapped approach wording must become qualified comparison label.
14. Status language: mapped and road estimate limitations good; nearest/best terms currently overstate or blur basis.
15. Empty states: captured response loaded; failure state not independently forced; preserve retry without weather-only fake snapshot.
16. Responsive: useful action first, but map below fold and route comparison after interpretation.
17. Accessibility: field targets generally 44px; long names wrap; tiny qualification text weakens practical legibility.
18. Interaction feedback: drill-down action explicit; nearest row button suggests inspectable record correctly.
19. Consistency: coherent field style but old routes use different shell/type and badge colors.
20. Duplication: police facility twice in snapshot alone; shortest route and weather repeated in interpretation and conditions.
21. Unnecessary information: interpretation prose echoes existing rows; make limitations concise and local.
22. First viewport: mobile 2.5min/action visible; cannot compare returned approaches within first view.

### National Awareness

1. Visual hierarchy: desktop map and rank strong; mobile all metrics before decision.
2. Information hierarchy: ranked named areas is P1 but source/metric tiles lead phone.
3. Typography: rank names strong; criteria/observation times and metric source labels small.
4. Spacing: desktop rank rows calm; mobile metrics 518px plus notice/heading/filter stack.
5. Density: six equal metrics and duplicated warning count create scanning load.
6. Layout: desktop map/right rank good; phone should expose leading priority before subordinate national extremes.
7. Containers: map necessary frame; rank open rows good; six tall metric cards redundant composition.
8. Color: temperature red, new detection zero amber, danger blue, connected amber: meanings inconsistent.
9. Iconography: municipality shield blue reads health/verified rather than risk; use meaning not decorative association.
10. Maps: incident markers and source boundaries distinguish reports; inherited selected popup and partial national bounds need route-specific default verification.
11. Tables/lists: ranked names/current vs earlier explicit and clear; retain nonadditive logic and limitation.
12. Filters/search: many incident-area choices inside select acceptable recognition; three selects + three actions tall on mobile, consolidate secondary controls.
13. Buttons/actions: choose rank direct; reset/fullscreen clear but mobile first action only View notices.
14. Status language: official-feed count distinction useful; raw ANEPC-derived source label can be quieter than value meaning.
15. Empty states: valid zero detections retained; no invented risk or area members.
16. Responsive: map y=1014; ranked area choices below map; first screen cannot answer Where should attention go?
17. Accessibility: wide ranking buttons effective; shell menu short; tiny ranking rationale below.
18. Interaction feedback: selected-area pattern explicit in source; verify focus and map response, not merely pressed styling.
19. Consistency: old shell/condition tiles differ from field routes; map legend controls not learned once.
20. Duplication: warning metric plus active notice bar; selection already present in global popup before rank choice.
21. Unnecessary information: source coverage and named-area limitation should remain available without dominating selection.
22. First viewport: desktop succeeds substantially; mobile fails primary location-attention task.

## Explicit mobile composition decisions

| Route | First | Collapse / move deeper | Horizontal scroll | Drawer / contextual reveal | Hide |
|---|---|---|---|---|---|
| Overview | Concise reported situation, leading current/candidate priority, usable Portugal map | Weather extremes, source/workload, historical activity; empty alerts one line | None required for primary content | Source explanations and complete activity filters | Decorative image/eyebrow and redundant badge repetition |
| Incidents | Search + current-first dated list | Secondary filters and extra weather facts | Avoid horizontal incident rows/tables | Row selection reveals preview with map and Open incident; return preserves list/filters | Unusable coverage row; redundant status field |
| Detail | Incident state/date, concise conditions and map | Station/source coverage and extra conditions/history | None required | Ask, Change incident, coverage and layer details | Same-route Open incident popup CTA |
| Fire | Incident/measurement context + current change summary, map | Repeated raw event history/station detail | If necessary only real reading table; not primary metric strip | Exact readings and map layers | Tiny duplicate tile sparklines |
| Response | Shortest returned estimate with route detail, then map and comparisons | Extra snapshot categories, explanation/history | None for ranked routes; convert tables to labelled rows | Support inventory/filter/detail | Duplicate facility in summary and repeated interpretation sentences |
| National | Concise national state, leading ranked area and map | Weather extrema/full ranking explanation | None for rank list | Map filters and selected-area detail adjacent to selection | Duplicate warning count and forced popup on entry |

Only hide decorative or duplicate content; do not hide unique operational facts or required limitations. Primary actions stay reachable and all disclosure toggles retain visible labels, focus and touch targets. Do not squeeze desktop cards vertically or solve density with smaller type.

## Nielsen assessment / 0–4

| Heuristic | Score | Evidence |
|---|---:|---|
| Visibility of system status | 3 | Source dates and last-known banner explicit; healthy/stale badge colors inconsistent and selection consequence weak on mobile. |
| Match to real world | 2 | Named locations/units and route direction strong; Best mapped approach and hidden nearest basis overpromise or confuse. |
| User control and freedom | 3 | Change incident, reset, layers, closeable disclosures; map controls crowded and preview remote. |
| Consistency and standards | 2 | Two shell families, different color meaning, icon and control sizes. |
| Error prevention | 3 | Missing and measured zero distinguished; estimates explicitly qualified; color and Best wording remain risky. |
| Recognition rather than recall | 2 | Visible labels help, but mobile user must remember row selection across long scroll to preview. |
| Flexibility and efficiency | 2 | Search and filters available; default historical Source order, repeated data and far-below-fold actions cost time. |
| Aesthetic/minimalist design | 2 | Operational character and real geography strong; equal card walls, empty panel and decoration remain. |
| Error recovery | 3 | Last-known state preserved; reset/no-results guidance exists; response failure not independently forced in this pass. |
| Help/documentation | 3 | Why this, Data coverage and route limitations rich; tiny text and excess provenance repetition reduce use. |
| Total | 25/40 | Acceptable: meaningful improvements required before claiming convergence. |

## Cognitive load and emotional journey

Intrinsic complexity is high: users must distinguish old incident reports, nearby station weather, thermal sampling and facility-to-incident estimates. VIGIA usually names these distinctions. Extraneous load is also high: more than four repeated options, equal card emphasis, repeated ages/values, multiple layer controls and inconsistent color require unnecessary interpretation. Overview exposes nine activity type buttons. National has six equal metric decisions plus three filters and three map actions. Detail gives five independent Why this links before the map; Fire repeats one change across three places. These are recognizability and grouping problems, not a need to invent a simpler domain.

Desktop confidence rises when the real map and named facility appear. It falls when a current-looking red weather value sits over an old reported incident or a source-health ring replaces operational meaning. Mobile starts with reassuring clean typography but quickly becomes a long card wall; selection then requires extra scrolling. The best ending is a clearly qualified fact/detail that returns to preserved context, not an extra modal for information already visible.

Personas: Alex, the experienced operator, loses time scanning historical Source order and repeated weather details. Sam, the accessibility user, encounters 31×38px menu and 10–11px operational copy with inconsistent focus restoration requiring checks. Casey, the mobile operator, cannot see the selected preview or national rank near the triggering context. These are concrete workflow failures rather than abstract persona preferences.

## Incident Detail navigation recommendation

Retain Incident Detail in the primary navigation for this pass. It behaves as an incident-context page, but Fire Activity and Response & Access do too; all three share the selected incident. Removing only Detail would make the context model less consistent and reduce recovery/orientation while the mobile hierarchy is being corrected. The six-link menu is still manageable. Strengthen the selected-incident context consistently across those three routes and retain contextual Open incident/Fire activity/Response & access actions. A later coherent incident-workspace navigation model could group all three, but this audit does not justify removing one item alone.

## Scope and evidence limitations

Twelve baseline PNGs are the only standard before screenshots. One optional national mobile ranking view provides below-fold context. Main content text and geometric positions were inspected for every route. No destructive state, backend mutation, artificial dataset or fabricated loading/error result was used. Assessment B owns the independent automated/contrast/keyboard breadth and four other widths. Source inspection supports proposed fixes but does not certify unexercised interactions. No exact reference parity is claimed for this canonical product audit.

Additional interaction evidence: on mobile, selecting Vila de Rei leaves scroll at zero and focus on the selected row while preview stays at y=1499.75; A05 is directly reproduced. Ask Vigia, Data coverage, Change incident, Map layers and Support inventory all opened through keyboard, placed focus inside their dialog, closed with Escape, and restored focus to their original control. The drawers measured 390×844; Change incident dialog 346×147. This supports preservation of the existing dialog mechanism, not a claim of complete focus trapping verification. The attempted readings inspection used a nonexistent `field-readings` selector and timed out; this is an inspection-script error, not a demonstrated product bug. Do not count it as an application failure or repeat it automatically. National Reset clears the incident selection and restores Portugal bounds; the optional screenshot was taken during basemap loading and is evidence of ranked-list composition only, not loaded-map verification. The reset confirmation reads “Authorized world view and filters restored” despite the visible action being Reset Portugal view; align that feedback with the route's Portugal scope. Browser cleanup produced a route-cancellation callback after saved results; the process exited and canonical app remained running.

Questions skipped: the user explicitly supplied the full audit → implement → render → review mandate, P0/P1 priority, product direction and temperature-color correction. No new product concept, backend or dataset is proposed.


This snapshot archives the completed pre-implementation assessment. baseline.json identifies the exact pre-edit bytes; the archive is written after implementation. Questions skipped: the user authorized the complete audit and correction pass.
