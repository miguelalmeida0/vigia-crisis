# VIGIA Collection, Fusion, Tasking and Decision Recovery

## 1. Executive result

VIGIA now presents decision-relevant unknowns as governed information requirements with collection plans and provider tasks. Machine acquisition remains machine work until authority, judgement, deadline or material conflict requires a person. The approved white shell and seven-route information architecture are unchanged.

## 2. Before/after operator-value assessment

| Measure | Before | Recovered runtime |
|---|---:|---:|
| Source-resolution jobs | 824 | 828 |
| Formal information requirements | Not projected | 828 |
| Collection tasks | Not projected | 2,898 |
| Human-attention items | 823 | 6 |
| Machine-to-human conversion | 99.88% | 0.72% |
| Duplicate provider alerts | Not governed | 0 |
| Verified current | 0 | 0 |
| Detection candidates | 36 | 33 |
| Needs revalidation | 170 | 174 |
| Records with at least two causal families | Not certified | 15 |
| Records with usable thermal observations | Not certified | 84 |
| Records with terrain | 0 | 0 |
| Records with governed weather context | Not certified | 207 |
| Records with observed geometry | Not certified | 84 |
| Generic “More evidence needed” in primary routes | Present | 0 |
| Primary “Not returned” | Present | 0 |
| Generic “Operational work item” | Present | 0 |

The exact final values and identity quartet are machine-bound in `.artifacts/collection-fusion-tasking-decision-recovery/certification.json`; the table above is aligned to that final certified snapshot.

## 3. Information-requirement architecture

Each unresolved decision fact is projected as an `INFORMATION_REQUIREMENT` with question, reason, blocked decision, priority, deadline, required evidence classes, satisfaction rule, current assessment, owner policy and escalation policy. An unknown without a collection plan or terminal reason fails certification.

## 4. Collection/tasking architecture

Each requirement has a `COLLECTION_PLAN` and one or more `COLLECTION_TASK` records. The task contract records collector type, provider, query, attempts, last/next attempt, admission result, rejection reason and durable receipt. Resolver jobs remain internal executor primitives.

## 5. Provider acquisition improvements

Physical acquisition now fans out through NASA FIRMS S-NPP, NOAA-20, NOAA-21 and MODIS, Copernicus Sentinel-3A/3B SLSTR, FieldNet, and the canonical incident-report adapter. Official/CAP acquisition remains explicitly authority-gated. Repeated products from the same causal family do not become independent corroboration.

## 6. Thermal improvements

The canonical scene exposes admitted thermal observations with platform, sensor, time, coordinate, FRP/quality fields where supplied, association and provenance. Missing thermal evidence activates collection rather than a dead empty state. Thermal points are never called perimeters.

## 7. Terrain/context improvements

Terrain, weather, roads, assets and exposure are separate domains. Every weather product is explicitly classified as selected-incident evidence or regional context in the identity-bound certification artifact; regional context is never silently promoted to incident evidence. Terrain truthfully remains unavailable because no governed current-incident elevation provider is connected; the UI reports that exact integration boundary and the collection path remains visible.

## 8. Geometry improvements

Incident points, thermal observations, observed geometry, official perimeters, forecasts and exposure buffers remain distinct. Missing observed extent creates a collection requirement with provider attempts, next evaluation and decision impact. No client geometry is invented.

## 9. Intelligence reconstruction

The signature Intelligence route is organized as Now → Next → Watch → Uncertainty → Decision. It synthesizes admitted observations and context, shows scheduled acquisition and measurable watch conditions, ranks uncertainty by decision impact, and keeps forecast withholding operationally understandable.

## 10. Human-attention compression

Attention is aggregated by provider/root cause/blocked decision/authority/deadline semantics. Automated retries remain below the human layer. Every projected human item has an owner policy, deadline, consequence of delay and recommended next action; duplicate aggregation keys are zero.

## 11. Ownership/action proof

Assume, reassign, escalate and release are canonical persisted mutations with idempotency and receipts. The projection updates work state, owner, acknowledgement time, next action and global counters. Persistence and duplicate-click behavior are covered by focused API tests and fresh browser interaction evidence.

## 12. Operations/ICS proof

Operations separates Verification Operations, Response Operations and Protection. Candidate work uses objectives, tactics, assignments and decision gates. Operational period creation, incident ownership, objective creation and handoff are real mutations. No evidence requirement masquerades as a response operation.

## 13. Map/COP proof

Marker selection atomically updates canonical incident, marker, list row, Quicklook, URL and accessible focus. Route-specific scenes preserve camera and one persistent MapLibre renderer. GeoJSON sources update without style reload; candidate, revalidation and verified markers use structural differences.

## 14. Status-component permanent fix

All active routes use `StateLabel`. It is inline-flex, vertically aligned, non-wrapping and max-width constrained. Its mark is a fixed line element. Active styles contain no circular pseudo-element, absolute dot, flex wrap or route-owned status primitive.

## 15. Reports/Global fixes

Reports has controlled Decision, Outcome, Performance and Situation Quality panels with drill-downs to affected records and collection state. Global Awareness separates material crisis events from system/provider activity, and filter changes produce visible map/list/count effects.

## 16. Action inventory result

The canonical action registry supplies route-independent semantics for incident selection/opening, collection plans, map focus, ownership, operational periods, objectives, handoff and protection decisions. Static inventory plus browser interaction certification require zero dead controls, pseudo-actions or toast-only mutations.

## 17. Performance

The certifier measures twenty warm authenticated rounds across all seven canonical API routes. It fails at useful-content p95 ≥500 ms or maximum ≥1,000 ms. Map persistence, native drag, remount/style/source counters and blank-frame checks are additionally captured by the browser lane.

## 18. Full tests

The release requires the repository test suite, operator static contract, focused acquisition/security tests, runtime identity probe and collection/fusion certifier to pass against the same source state. Passing tests alone do not replace browser or truth certification.

## 19. Fresh screenshots

Fresh canonical screenshots for Command Overview, Incidents, Incident Detail, Intelligence, Operations, Reports & Analytics and Global Awareness are stored under `.artifacts/collection-fusion-tasking-decision-recovery/screenshots/`, with interaction evidence under `browser/`, `maps/` and `status-component/`.

## 20. Remaining genuine external blockers

- No governed current-incident Copernicus DEM or equivalent elevation provider is integrated, so terrain values remain unavailable rather than fabricated.
- The authoritative official occurrence/CAP provider is not configured; therefore zero records satisfy `VERIFIED_CURRENT`.
- No authorized live response has produced a receipt-backed postcondition/outcome chain. The certified replay remains structurally separate and is not counted as a production outcome.

## 21. Exact changed files

The exact dirty-worktree inventory is generated at certification time in `.artifacts/collection-fusion-tasking-decision-recovery/after/changed-files.json`. The principal implementation is in the operational-recovery, source-resolution, human-attention, canonical operator API/map scene, incident-command and operator-console route/component files, with focused tests and this certifier.

## 22. Git staged state

No files are staged and no commit is created. Certification fails the handoff if the generated inventory reports staged paths.
