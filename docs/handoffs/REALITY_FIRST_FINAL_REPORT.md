**What can Vigia now tell a human that it could not tell them before?**

For the selected Vila Nova de Gaia · Lever record, Vigia now says: **22.8 °C, wind 13.3 km/h NW, humidity 84 %**, from **Serra do Pilar, 14 km away**, measured at **2026-09-08T14:00:00.000Z**. It explains that this is regional station context, names the missing information, and gives a concrete next investigation. The map uses that same wind reading. These are captured real observations, not the illustrative Coimbra/N17 numbers.

Implementation and evidence captured on 8 September 2026. Incident answer clock: 2026-09-08T14:52:18.174Z. Local runtime release: vigia-intelligence-fabric-6895fd76ad57b440, READY and unsealed for local use. Existing intelligence, Event Fabric, Operational Twin, FieldNet, authentication, permissions, maps and panorama remain in place.

**1. Exact source-to-screen issues found**

| Output | Exact loss and correction |
| --- | --- |
| Temperature / humidity | Normalization omitted receipt time and definitions; selection could prefer an older station record; physical projection discarded station coordinates and distance. The same selected record now survives to the card and drawer. |
| Wind | The IPMA numeric direction fallback was shifted by one code. The map used an older independent weather reading in different units. Direction mapping and map/strip selection now agree. |
| Gust | A missing provider field became generic Unavailable, and source failure could obscure why the field was absent. FIELD_NOT_PROVIDED remains explicit; daily maximum gust is rejected as current gust. |
| Thermal | The compact projection discarded source-record context and did not distinguish an empty successful query from failure. Detection identity, original sensing time, pixel metadata and query coverage survive; latest/nearest remain distinct. |
| Warning | Warning expiry was being considered a source timestamp. It is now only a validity bound. Receipt time and official area names are preserved; incident applicability is not invented. |
| Road | Retrieval time could substitute for observation time. Geometry alone no longer becomes a dated restriction or safe route. |
| Activity | Projection updates dominated the feed; physical changes lacked location/materiality discipline. Typed physical/work events now own the primary feed; duplicate aggregate thermal events are removed. |
| Responsive facts | Inherited value ellipsis clipped units and missingness at 320 px. Fact values now wrap. |

The bounded trace and composition specification were written before implementation: [REALITY_FIRST_REVIVAL.md](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/docs/handoffs/REALITY_FIRST_REVIVAL.md>). Complete final clocks, units, source locations, selection and API/VM paths: [source-to-screen-final.json](</Users/malmeida/docs/internal/automation/codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259/reality-first/source-to-screen-final.json>).

**2. Data-layer fixes**

IPMA normalization retains receipt clocks and measurement definitions. Station selection uses one current usable record, geographic distance and the original observation clock. Successful empty direct responses clear stale aliases. Failed providers preserve last-good data without advancing its source clock. Physical projection also retains GeoJSON coordinates, geographic labels (or a coordinate fallback), raw-source references, sensor footprints and transformation details.

**3. Semantic fixes**

RealWorldValue separates observedAt, receivedAt and calculatedAt; validity is separate from suitability. Local, nearby, regional, modeled, official, derived and unknown meanings remain distinct. Missingness has the eight requested reasons. A thermal point cannot become a perimeter; modeled/daily-maximum gust cannot become a current measured gust; a mapped road/facility cannot prove access or availability. Numeric changes need an explicit physicalThresholds policy to become material; no physical threshold or severity was invented.

**4. Primary questions now answered**

Current conditions; nearby fire activity and its age/distance; official status; applicable warnings; access restrictions; mapped exposure; material changes/history; stale information; unknowns; next investigation; and national situation. The ten deterministic query services return primaryAnswer, supportingFacts, asOf, limitations and auditRef. Detail leads with conditions and a map-side answer rail; Intelligence leads with physical state, known/unknown/conflicts and collection; Operations pairs task action with its physical context.

**5. Real metrics now shown**

| Selected incident output | Value / meaning | Source and original time |
| --- | --- | --- |
| Temperature | 22.8 °C · hourly mean at 1.5 m | IPMA / Serra do Pilar / 2026-09-08T14:00:00.000Z |
| Wind | 13.3 km/h NW · 10 m; averaging interval not specified | Same station and observation |
| Humidity | 84 % · hourly mean at 1.5 m | Same station and observation |
| Rain | 0 mm · previous one-hour accumulation | Same station and observation |
| Receipt | 2026-09-08T14:41:05.899Z | Separate from measurement time |
| Latest fire signal | No matching thermal detection returned within 25 km. | NASA FIRMS / attributable returned observations; original sensing time retained when present |

**6. Sources and freshness**

Temperature, humidity, rain and wind definitions were checked against [IPMA open-data documentation](https://api.ipma.pt/).

| National output | Returned value | Named location/source | Clock |
| --- | --- | --- | --- |
| Active official-feed records | 5 | ANEPC-derived records through Fogos.pt and api.ptdata.org | Source checked 2026-09-08T14:47:45.444Z |
| New thermal detections · 1h | 0 | NASA FIRMS VIIRS | Source checked 2026-09-08T14:47:09.113Z |
| Active official weather warnings | 2 | IPMA Open Data | Source checked 2026-09-08T14:47:49.698Z |
| Highest observed gust | Unknown | IPMA | No observation field / clock supplied |
| Highest temperature | 35.5 °C | Reguengos, S.Pedro do Corval | 2026-09-08T14:00:00.000Z |
| Lowest humidity | 20 % | Aldeia Souto (Quinta Lageosa) | 2026-09-08T14:00:00.000Z |
| Highest observed wind | 34.6 km/h N | Cabo da Roca | 2026-09-08T14:00:00.000Z |
| Municipalities with high fire danger | 165 | IPMA RCM through api.ptdata.org | Source checked 2026-09-08T14:47:45.444Z |

National extrema name separate stations. Active official-feed records mean returned ANEPC-derived records via Fogos.pt/PTData, not fresh official status for every incident. Zero returned thermal detections does not establish no fire or complete satellite coverage. Warning names come from [IPMA’s official warning-area pages](https://www.ipma.pt/pt/otempo/prev-sam/); validity is separate from issuance.

**7. Unavailable metrics and exact reasons**

| Output | Reason |
| --- | --- |
| Current gust | FIELD_NOT_PROVIDED: the selected IPMA surface feed supplies no current gust field. |
| Observed AQ | CAPABILITY_NOT_CONNECTED: no observed pollutant station feed is connected for this location; no Good AQ value is substituted. |
| Current road access | CAPABILITY_NOT_CONNECTED here: mapped road geometry exists, but no current attributable restriction/field-status report establishes access. |
| Incident warning applicability | NO_MATCHING_RECORD / no admitted area association: national notices do not automatically apply to the selected incident. |
| Official incident status / perimeter | No dated explicit official status or official perimeter associated with this record. Internal open/revalidation state is not official Active status. |
| Recent thermal record | No matching thermal detection returned within 25 km. Absence of a record is not absence of fire. |

**8. Technical language removed or moved**

Primary connection, refresh, map, loading and notification text now uses ordinary operator language. Information requirements become Information to collect. Operations source chains, causal-family explanations, source checks and completion rules remain inside task inspection. Provenance, model state and deep intelligence are preserved below the physical answers. No uncalibrated confidence percentage was added to primary UI.

The current-source copy inventory classifies every matching occurrence by identifier/rendering use: {'INTERNAL ONLY': 1470, 'OPERATOR DEEP DETAIL': 286, 'AUDIT ONLY': 28, 'USER NECESSARY': 16}. [reality-first-copy-audit.json](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/docs/handoffs/reality-first-copy-audit.json>) records the method and classifications; it does not pretend every retained legacy inspection string was rewritten.

**9. Trust/provenance interaction**

“Why this?” opens a focus-contained drawer with original observation, receipt and calculation clocks, source name/reference, station coordinates, distance, freshness/expiry, definition, transformation, suitability, limitations, supporting sources/conflicts and version when supplied. Escape closes it and restores focus to the invoking fact. [Wind drawer](</Users/malmeida/docs/internal/automation/codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259/reality-first/why-wind-desktop.png>).

**10. Ask Vigia improvements**

Natural-language questions map to allowlisted typed intents and deterministic domain answers. Conditions, fire detections, distances, warnings, roads, exposure, changes, stale data, unknowns, next investigation, reading provenance and as-of questions are supported. Explicit as-of access keeps replay permissions and never consults present-day world caches. An HH:mm question uses UTC today and validates the requested time. Existing deeper intelligence/history/counterfactual paths remain available.

Actual unknowns answer: “Weather at the fire itself is unknown; the displayed station is regional context. Current gust measurement is not supplied by the selected station feed. Current official fire perimeter is not available. Current official incident status is unknown. Official warning applicability has not been established for this location. Current road access is unknown. No observed air-quality station reading is connected for this location.”

Actual next investigation: “Verify road access before field movement. Current access has not been reported.”

**11. Degraded-mode behavior**

Provider groups run independently with allSettled, a 45-second outer deadline, no overlapping hung request, and a circuit after three provider-group failures with a 120-second cooldown. HTTP request defaults remain 12 seconds for IPMA/PTData and 16 seconds for FIRMS/Copernicus. Retry occurs on scheduled acquisition, never in an operator read. Last-good observation/receipt clocks remain intact; source failure is visible. The circuit scope is the provider group, not each individual endpoint.

Existing source expiry policies remain: active feed 10 minutes; station observations 3 hours; warnings 6 hours; rural-fire danger 12 hours; archive 7 days; catalogue 48 hours. FIRMS acquisition state has its existing 6-hour policy, while current physical thermal metrics use the existing 90-minute evidence window. These are freshness policies, not safety thresholds.

A real label-tile 503 was observed during a prior fresh pass. The Incidents map exposed DEGRADED_PARTIAL while the console and other routes continued. [Observed degradation record](</Users/malmeida/docs/internal/automation/codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259/reality-first/canonical-degraded-qa.json>) and [Screenshot](</Users/malmeida/docs/internal/automation/codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259/reality-first/incidents-degraded-label-tile.png>). Final network results remain in qa.json. Existing database and basemap recovery were tested using fault-injected services; no destructive live-database outage was induced.

**12. Semantic and regression results**

14 domain semantic tests plus 7 new API/operational contract tests pass. The selected domain/API/UI regression suite passes **233/233**; the additional PostGIS/intelligence/map recovery suite passes **49/49**. Full console verify:static passes (build, syntax/assets, interaction/auth/proxy, real-data, map, truth, intelligence, browser contract, UX and operational hardening). Tests check clocks, stale suitability, gust semantics, thermal dedup/perimeter distinctions, road/AQ missingness, provider isolation/recovery, authorization and historical cache isolation.

**13. Product-question acceptance**

Three deterministic incidents—current coverage, stale/failed coverage, and no matching information—assert actual answers for what/where/conditions/age/official status/changes/unknowns/next investigation. Each also exercises twelve plain-language intents. All three pass. Fixtures remain test-only and were never written into production source storage.

**14. Focused usability results**

Agent-assisted screenshot/interaction review completed for nine questions. Browser retrieval for the unknowns answer took 2.573 seconds; this is not human comprehension time. Wind, age, station distance, fire signal, warning status, changes and next investigation are available in the 1672×941 desktop view. Exact fire-location limitations require answer inspection; the complete unknowns answer takes one drawer open and one query submission. Human answer time, correctness and mistaken-certainty rates remain unmeasured.

[Manual tester worksheet](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/docs/handoffs/REALITY_FIRST_USABILITY.md>) · [Performed check and answers](</Users/malmeida/docs/internal/automation/codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259/reality-first/usability-results.json>). At 320 px, facts and units wrap and the full incident workflow requires scrolling. The 200%/400% captures test equivalent reflow dimensions, not native browser zoom.

**15. Final screenshots and visual evidence**

| Surface | Desktop | Mobile |
| --- | --- | --- |
| Command Overview | [Desktop](</Users/malmeida/docs/internal/automation/codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259/reality-first/command-overview-1672.png>) | [Mobile](</Users/malmeida/docs/internal/automation/codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259/reality-first/command-overview-390.png>) |
| Incidents | [Desktop](</Users/malmeida/docs/internal/automation/codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259/reality-first/incidents-1672.png>) | [Mobile](</Users/malmeida/docs/internal/automation/codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259/reality-first/incidents-390.png>) |
| Incident Detail | [Desktop](</Users/malmeida/docs/internal/automation/codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259/reality-first/incident-detail-1672.png>) | [Mobile](</Users/malmeida/docs/internal/automation/codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259/reality-first/incident-detail-390.png>) |
| Intelligence | [Desktop](</Users/malmeida/docs/internal/automation/codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259/reality-first/intelligence-1672.png>) | [Mobile](</Users/malmeida/docs/internal/automation/codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259/reality-first/intelligence-390.png>) |
| Operations | [Desktop](</Users/malmeida/docs/internal/automation/codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259/reality-first/operations-1672.png>) | [Mobile](</Users/malmeida/docs/internal/automation/codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259/reality-first/operations-390.png>) |
| National Awareness | [Desktop](</Users/malmeida/docs/internal/automation/codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259/reality-first/national-awareness-1672.png>) | [Mobile](</Users/malmeida/docs/internal/automation/codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259/reality-first/national-awareness-390.png>) |
| Activity | [Desktop](</Users/malmeida/docs/internal/automation/codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259/reality-first/activity-desktop.png>) | Responsive feed included in Overview captures |

Canonical captures cover eight CSS viewports from 320×568 to 1672×941. No document horizontal overflow was found; the driver warnings are software-WebGL diagnostics, separately recorded from application errors. All comparisons retain the supplied reference, runtime, 50% overlay, difference, measured geometry and styles.

Frozen-source visual lane: [capture.json](</Users/malmeida/docs/internal/automation/codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259/reality-first/golden/capture.json>). Reference comparisons: [index.json](</Users/malmeida/docs/internal/automation/codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259/reality-first/comparisons/index.json>). **Pixel parity is not certified:** this request intentionally changes information hierarchy, and the five route references are composite-board crops rather than individual native exports. No references or baselines were replaced, and no mask hides missing content. Stable paired frozen screenshots were checked.

**16. Exact changed files**

[Machine-readable source/test inventory with hashes](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/docs/handoffs/reality-first-changed-files.json>) compares production files against the baseline taken before this request; it excludes earlier dirty work. The permanent Real-World Output Rule is appended to docs/internal/automation/AGENTS.override.md.

- [docs/internal/automation/AGENTS.override.md](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/docs/internal/automation/AGENTS.override.md>)
- [apps/api/src/modules/operator/canonical-operator-api-service.mjs](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/api/src/modules/operator/canonical-operator-api-service.mjs>)
- [apps/api/src/modules/operator/decision-intelligence-service.mjs](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/api/src/modules/operator/decision-intelligence-service.mjs>)
- [apps/api/src/modules/operator/final-gap-closure-service.mjs](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/api/src/modules/operator/final-gap-closure-service.mjs>)
- [apps/api/src/modules/operator/operator-intelligence-projection.mjs](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/api/src/modules/operator/operator-intelligence-projection.mjs>)
- [apps/api/src/modules/operator/physical-activity.mjs](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/api/src/modules/operator/physical-activity.mjs>)
- [apps/api/src/modules/world/ipma-gateway.mjs](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/api/src/modules/world/ipma-gateway.mjs>)
- [apps/api/src/modules/world/live-source-gateway.mjs](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/api/src/modules/world/live-source-gateway.mjs>)
- [apps/api/src/modules/world/ptdata-normalizers.mjs](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/api/src/modules/world/ptdata-normalizers.mjs>)
- [apps/api/src/modules/world/world-service.mjs](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/api/src/modules/world/world-service.mjs>)
- [apps/api/test/physical-metrics.test.mjs](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/api/test/physical-metrics.test.mjs>)
- [apps/api/test/reality-first-api.test.mjs](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/api/test/reality-first-api.test.mjs>)
- [apps/operator-console/src/app.js](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/operator-console/src/app.js>)
- [apps/operator-console/src/appActionController.js](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/operator-console/src/appActionController.js>)
- [apps/operator-console/src/approved/controller.js](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/operator-console/src/approved/controller.js>)
- [apps/operator-console/src/approved/data/model.js](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/operator-console/src/approved/data/model.js>)
- [apps/operator-console/src/approved/data/physical.js](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/operator-console/src/approved/data/physical.js>)
- [apps/operator-console/src/approved/routes/detail.js](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/operator-console/src/approved/routes/detail.js>)
- [apps/operator-console/src/approved/routes/intelligence.js](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/operator-console/src/approved/routes/intelligence.js>)
- [apps/operator-console/src/approved/routes/national.js](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/operator-console/src/approved/routes/national.js>)
- [apps/operator-console/src/approved/routes/operations.js](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/operator-console/src/approved/routes/operations.js>)
- [apps/operator-console/src/approved/routes/overview.js](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/operator-console/src/approved/routes/overview.js>)
- [apps/operator-console/src/approved/routes/reports.js](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/operator-console/src/approved/routes/reports.js>)
- [apps/operator-console/src/approved/ui/activity.js](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/operator-console/src/approved/ui/activity.js>)
- [apps/operator-console/src/approved/ui/decision-intelligence.js](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/operator-console/src/approved/ui/decision-intelligence.js>)
- [apps/operator-console/src/approved/ui/map.js](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/operator-console/src/approved/ui/map.js>)
- [apps/operator-console/src/approved/ui/operator-answers.js](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/operator-console/src/approved/ui/operator-answers.js>)
- [apps/operator-console/src/approved/ui/physical.js](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/operator-console/src/approved/ui/physical.js>)
- [apps/operator-console/src/approved/ui/shell.js](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/operator-console/src/approved/ui/shell.js>)
- [apps/operator-console/src/approved/ui/signals.js](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/operator-console/src/approved/ui/signals.js>)
- [apps/operator-console/src/bootSkeleton.js](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/operator-console/src/bootSkeleton.js>)
- [apps/operator-console/src/canonicalComponents.js](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/operator-console/src/canonicalComponents.js>)
- [apps/operator-console/src/canonicalViewModel.js](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/operator-console/src/canonicalViewModel.js>)
- [apps/operator-console/src/components.js](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/operator-console/src/components.js>)
- [apps/operator-console/src/mapModel.js](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/operator-console/src/mapModel.js>)
- [apps/operator-console/src/operatorPrimitives.js](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/operator-console/src/operatorPrimitives.js>)
- [apps/operator-console/src/runtimeLoader.js](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/operator-console/src/runtimeLoader.js>)
- [apps/operator-console/styles/approved/signals.css](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/operator-console/styles/approved/signals.css>)
- [apps/operator-console/tests/physical-metrics.mjs](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/operator-console/tests/physical-metrics.mjs>)
- [apps/operator-console/tests/signal-composition.mjs](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/operator-console/tests/signal-composition.mjs>)
- [apps/operator-console/tests/truth-integrity.mjs](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/operator-console/tests/truth-integrity.mjs>)
- [apps/operator-console/tests/ux-contract.mjs](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/apps/operator-console/tests/ux-contract.mjs>)
- [packages/domain/src/operational-twin/ipma-warning-areas.mjs](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/packages/domain/src/operational-twin/ipma-warning-areas.mjs>)
- [packages/domain/src/operational-twin/operator-questions.mjs](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/packages/domain/src/operational-twin/operator-questions.mjs>)
- [packages/domain/src/operational-twin/physical-conditions.mjs](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/packages/domain/src/operational-twin/physical-conditions.mjs>)
- [packages/domain/src/operational-twin/physical-metric.mjs](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/packages/domain/src/operational-twin/physical-metric.mjs>)
- [packages/domain/src/operational-twin/physical-world-context.mjs](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/packages/domain/src/operational-twin/physical-world-context.mjs>)
- [packages/domain/src/operational-twin/physical-world.mjs](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/packages/domain/src/operational-twin/physical-world.mjs>)
- [packages/domain/src/operational-twin/real-world-value.mjs](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/packages/domain/src/operational-twin/real-world-value.mjs>)
- [packages/domain/test/intelligence/physical-world.test.mjs](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/packages/domain/test/intelligence/physical-world.test.mjs>)
- [packages/domain/test/intelligence/reality-first.test.mjs](</Users/malmeida/Documents/ChatGPT/VIGIA Integration/packages/domain/test/intelligence/reality-first.test.mjs>)

Additional deliverables: REALITY_FIRST_REVIVAL.md, REALITY_FIRST_USABILITY.md, REALITY_FIRST_FINAL_REPORT.md, reality-first-copy-audit.json, reality-first-changed-files.json and reality-first-status.json under docs/handoffs. Rebuilt apps/operator-console/dist and normal local-runtime acquisition/cache files are generated outputs. Local release regeneration updated checkpoint-commands.sh, checkpoint-handoff.json, current-release-manifest.json, dirty-tree-classification.json, evidence-manifest.json, ignored-runtime-manifest.json, release-source-manifest.json, release-statement.json and unknown-path-report.json under data/validation/release. No commit, push or deployment was performed.

**17. Remaining real-world gaps**

The selected record still lacks current official fire status/perimeter, a current local gust measurement, observed AQ, attributable road access and incident-specific warning-area association. Satellite coverage and timestamps limit fire interpretation. A named regional station does not establish weather at the fire. Existing recorded exercise ownership in Operations remains labeled as such; this pass did not dispatch real resources or create field reports.

**18. Next highest-value integration**

Connect attributable current official incident updates and observed perimeters to the existing incident identity/temporal contract. That would answer “what is officially happening here, and where?” for records now requiring revalidation. Follow with admitted warning-area geometry and current road/FieldNet access reports. Their UI belongs in the existing official-information/access rows; no new dashboard sections are needed.
