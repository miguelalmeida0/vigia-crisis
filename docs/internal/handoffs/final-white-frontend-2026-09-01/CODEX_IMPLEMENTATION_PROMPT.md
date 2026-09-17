# VIGIA FINAL WHITE FRONTEND — IMPLEMENTATION MANDATE

You are implementing the final VIGIA frontend visual system in the canonical operator console.

Workspace:
`/Users/malmeida/Documents/ChatGPT/VIGIA Integration`

Branch:
`integration/vigia-world-class-convergence`

The Canonical Twin startup recovery is COMPLETE and must not be regressed.

Before changing code:

1. Read `docs/internal/automation/AGENTS.md`
2. Read `docs/internal/automation/AGENTS.override.md`
3. Read every relevant `docs/internal/automation/agents/skills/*/SKILL.md`
4. Read this folder's `BINDING_DESIGN_RULES.md`
5. Inspect the exact active operator-console CSS import order and route ownership.
6. Run `git status --short` and record the existing dirty state.
7. Do not reset, clean, stash, rebase, delete runtime state, or undo the canonical startup work.

## THE VISUAL TARGET

Use ONLY the white/light VIGIA direction in this folder.

Binding target files:
- `00_MASTER_WHITE_DIRECTION.png`
- `01_COMMAND_OVERVIEW_VISUAL_BASE.png`
- `02_INCIDENTS_VISUAL_BASE.png`
- `03_INCIDENT_DETAIL_VISUAL_BASE.png`
- `04_INTELLIGENCE_FINAL_TARGET.png`
- `05_OPERATIONS_VISUAL_BASE.png`
- `06_REPORTS_ANALYTICS_VISUAL_BASE.png`
- `07_GLOBAL_AWARENESS_VISUAL_BASE.png`
- `08_INTELLIGENCE_EXISTING_HYPOTHESES_REFERENCE.png`

IMPORTANT:
Some visual-base images still contain obsolete route numbers or removed pages because they predate the final IA decision.
`BINDING_DESIGN_RULES.md` overrides those obsolete textual details.

Do NOT use:
- the dark blue redesign
- Lovable
- old broken Design Lab layouts
- stale golden screenshots
- old Evidence graph page as a final route
- old Control Plane page as a final route
- old Authority & Trust page as a final route

## FINAL IA — EXACTLY SEVEN PRIMARY ROUTES

- Command Overview
- Incidents
- Incident Detail
- Intelligence
- Operations
- Reports & Analytics
- Global Awareness

Remove from navigation and primary product routing:
- Evidence
- Evidence Debt
- Authority & Trust
- Control Plane

Do not delete their backend truth systems.

Remove ALL sidebar numbering and ALL numbering prefixes from page headings.

## ARCHITECTURE RULE

Do not create another CSS override graveyard.

There must be one coherent active visual system:
- tokens
- base
- shell/layout
- components
- route composition
- responsive

Delete/deactivate obsolete active rules rather than overriding them later.

Do not edit generated `dist` as source.

## VISUAL STANDARD

We are not making "something similar".
Reconstruct the target geometry, density, spacing, hierarchy, type scale, controls, panel relationships and information architecture as closely as practical.

At 1672x941:
- shell proportions should visually match the target
- primary content should occupy the monitor intelligently
- hierarchy should be obvious within one second
- typography must remain accessible
- no broken or empty decorative space
- no UI debug strings or local paths

Static shell/layout areas should be measured against target screenshots.

Operational maps are not pixel-matched raster screenshots. They must use real canonical geospatial layers while matching target:
- camera intent
- information density
- hierarchy
- control placement
- selection affordance
- visual treatment

## ROUTE IMPLEMENTATION ORDER

Implement and visually certify ONE route at a time:

1. Command Overview
2. Incidents
3. Incident Detail
4. Intelligence
5. Operations
6. Reports & Analytics
7. Global Awareness
8. Responsive matrix

Do not globally "finish all routes" and inspect at the end.

After each route:
- run the route
- capture clean app-only screenshot
- compare with target
- inspect computed font sizes
- inspect clipping/overflow
- exercise all visible controls
- fix it before moving on

## COMMAND OVERVIEW

Match the clean master design:
- simple header
- 4 high-value metrics
- Situation Map is dominant
- Priority Items rail
- System Health strip

The map must:
- use real canonical geospatial data
- fill the intended canvas
- never show a portrait raster inside a wide black/blank box
- make incidents easy to select
- have generous hit targets
- sync selected incident with the rest of the app
- use collision-safe labels
- visually prioritize critical fires over context

Do not foreground source-engineering language.

## INCIDENTS

Match the target:
- search
- clean filters
- structured table
- obvious status + priority
- strong selected row
- right Incident Summary map
- Latest Changes
- intentional pagination

Whole row selectable.
Map selectable.
A -> B -> C selection cannot stale-race.
Selected incident persists across routes.

## INCIDENT DETAIL

Match the target:
- selected incident summary
- contextual detail nav
- current assessment
- main unknowns
- last/next assessment
- dominant map
- clean legend
- Latest Decision Delta strip

Do not show unsupported perimeter as authoritative.
Unknown is not zero.
Not observed is not negative.

## INTELLIGENCE — SIGNATURE PAGE

This page must be exceptional.

Use `04_INTELLIGENCE_FINAL_TARGET.png` as route-specific visual authority.

Build:
1. selected incident summary strip
2. dominant high-resolution intelligence map
3. right Intelligence Brief
4. Current Understanding
5. Likely Evolution
6. Critical Watchpoints
7. Decision Implications
8. Competing Hypotheses
9. Supporting Intelligence Artifacts

Map requirements:
- observed/current geometry is visually distinct from forecast geometry
- thermal/hotspot context
- terrain
- weather/wind where available
- communities/infrastructure where relevant
- scientifically admitted A/B/C forecast corridors only
- no forecast geometry when backend admission says WITHHELD/ABSTAINED
- never make Venn-diagram ellipses
- scenario geometry should read directionally and terrain-aware when backend provides it
- clear timeframe/horizon
- layers controlled by backend scene declarations

If the scientific gate is not passed, keep the route compelling through:
- current understanding
- observed change
- hypotheses
- watchpoints
- admitted/non-geometric forecast information
without inventing spatial forecasts.

Use the useful mountain/hypothesis illustrations currently in the product as inspiration for the Competing Hypotheses row, but integrate them into the clean white system.

Supporting Intelligence Artifacts:
- use real available thermal / smoke / terrain / weather / road products
- good image crops
- consistent size
- concise label/time
- click opens contextual detail
- no fake "LIVE" imagery

## OPERATIONS

Match the clean white operations direction:
- VIGIA Handling
- Waiting on Reality
- Needs You
- action table
- Operations Summary

Make the difference between:
- automated/bounded VIGIA work
- external-world dependency
- human authorization/action
immediately obvious.

Do not use "AI agent" theater.

Authority and safeguards appear inline only when an action requires them.

Execution is not success without verified receipt/postcondition.

## REPORTS & ANALYTICS

Use the clean white target language.

Replace "Evidence Quality" as a product concept with an operationally meaningful quality surface such as:
- Detection Quality
or
- Situation Quality

Use whichever the backend can truthfully support.

Keep:
- decision summary
- outcomes
- system performance
- quality trend
- scientific gate

The scientific gate must retain actual backend truth.
Never fabricate official labels or readiness.

## GLOBAL AWARENESS

Dominant world map:
- true canonical/global data only
- clustering
- severity hierarchy
- selection
- region/type/priority/status/time filters
- regional summary
- source health
- recent material events

No fake world inventory.

## REMOVED ROUTES

Remove navigation entries and normal routing surfaces for:
- Evidence
- Evidence Debt
- Authority & Trust
- Control Plane

Keep backend APIs/services/contracts untouched unless a frontend adapter must change.

Contextual replacement:
- provenance/why/source details -> Intelligence and Incident Detail disclosure
- evidence gaps -> Intelligence watchpoints/unknowns
- authority/delegation -> inline Operations action requirements
- policies/safeguards -> inline Operations execution constraints
- audit/history -> Incident Detail and Reports

Old direct URLs must not become broken pages. Provide deterministic redirects or intentional aliases.

## ACCESSIBILITY / RESPONSIVENESS

Minimum intent:
- normal operator copy 14-16px desktop
- dense table data 13-14px
- metadata >=12px
- visible focus
- keyboard interaction
- semantic table/list structure
- adequate contrast
- 44px touch targets where practical

Certify all nine viewports listed in `BINDING_DESIGN_RULES.md`.

No horizontal scrolling as a responsive escape hatch.

## TRUTH CONTRACT — NON-NEGOTIABLE

Frontend may format backend truth but may not compute:
- incident truth
- evidence qualification
- independence
- authority
- source health
- scientific readiness
- forecast admission
- action success

Preserve:
- `AUTHORITATIVE_CRISIS_TRUTH_GATE_NOT_PASSED`
when backend says so
- official labels remain zero if backend says zero
- source degradation remains degradation
- unknown/unavailable/unmeasured/not-covered/zero remain distinct

Compatibility source currently being DEGRADED must not be painted healthy merely to match a mockup.

## RUNTIME SAFETY

The canonical startup recovery just succeeded.

Do not regress:
- delta-aware Agent1 reconciliation
- stable rejection identity
- bounded compatibility startup
- Canonical Twin readiness
- append-only journal semantics

Before visual work:
`npm run local:status`

Expected canonical runtime:
- Database READY
- Central API READY
- FieldNet READY
- Operator READY

## VISUAL QA

Use Playwright/browser automation.

For each route capture at minimum:
- 1672x941
- 1440x900
- 1024x768
- 768x1024
- 430x932
- 320x568

Then complete full nine-viewport matrix.

For desktop target comparison produce:
- current screenshot
- target screenshot
- 50% overlay
- difference image
- map-only crop where applicable

Do not claim pixel parity from bounding boxes alone.
Human visual approval is the final design gate.

## FUNCTIONAL QA

Prove:
- every navigation item works
- every visible CTA works
- filters work
- selection persists
- A -> B -> C incident switching updates the correct map/data
- no stale response overwrites current incident
- map controls work
- no browser console errors
- no unexplained failed requests
- no dead controls
- no raw local paths/debug text in UI

## DO NOT

- do not stage
- do not commit
- do not reset
- do not clean
- do not switch branches
- do not create another temporary Design Lab
- do not implement a second frontend
- do not use screenshots as operational map backgrounds
- do not fake provider availability
- do not declare success without fresh screenshots

## FINAL RESPONSE

Report:
- exact changed files
- route-by-route visual status
- removed routes and redirect behavior
- interaction proof
- responsive proof
- truth-contract proof
- runtime health
- remaining real external data limitations
- screenshot/artifact paths

Finish exactly with:

`VIGIA_FINAL_WHITE_FRONTEND_READY_FOR_VISUAL_APPROVAL`

or

`VIGIA_FINAL_WHITE_FRONTEND_BLOCKED: <precise blocker>`
