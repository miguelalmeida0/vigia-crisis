# VIGIA 8.0 — Operational Fire OS

## Release thesis

V7 removes the remaining class of failures where the interface could look more certain, current or physically informed than the underlying observations justified. Public-report activity, physical observation, fire behavior and operator workflow are now separate states. The release also introduces the first real image-derived prevention screening path from aligned Sentinel-2 browse pixels without converting change into a fabricated hazard claim.

## P0 contracts

1. A fresh public report does not imply a physically observed fire.
2. A stale open report cannot appear physically current.
3. Historical rising/cooling direction can never appear as present-tense behavior after physical evidence expires.
4. One point-level thermal observation can establish physical observation but can never establish a trend.
5. Lead-time metrics always expose sample size; no sample means no decorative lead-time number.
6. Fixture and public-source runtime state are stored separately and release archives contain no generated runtime state.
7. A public-source boot cannot inherit demo fire events, hazards, outcomes or actors.
8. Replay is not rendered as an interactive time control when only one observation exists.
9. Replay chart, list, geometry and selected observation derive from the same event history.
10. A selected object filtered out of the active queue is either explicitly pinned or cleared; it is never silently orphaned.
11. Public-report ↔ thermal association is quality-gated and exposes spatial/time reasoning.
12. Low-quality/static/non-wildfire FIRMS candidates are suppressed from high-priority wildfire escalation.
13. Observed thermal geometry actually renders on the map when point-level thermal observations support it.
14. No naked map number is allowed; clusters carry a semantic label.
15. National symbolic outline fades when a local GIS view is selected.
16. Reverse-geocoding failure falls back to coordinates/district context rather than `Unresolved municipality` as a product headline.
17. Command routes unresolved current fire-event work before passive prevention watches and exposes unowned work explicitly.
18. One observation resolver owns all imagery suitability language; inspector and imagery surface cannot contradict each other.
19. A renderable Sentinel-2 browse scene never borrows pixels from VIIRS or another sensor.
20. Cross-sensor visual fallback is deliberately constrained and labelled unsuitable for detailed physical inspection.
21. Sensor nominal resolution and the actual on-screen render product are displayed separately.
22. Two aligned, distinct, renderable Sentinel-2 browse observations can run real-pixel optical change screening.
23. Optical change screening remains explicitly non-operational and cannot create a verified hazard automatically.

## Fire-state model

```text
PUBLIC REPORT STATE
current / delayed / stale-open / closed / absent

PHYSICAL OBSERVATION STATE
current / aging / stale / unobserved

VIGIA KNOWLEDGE
physically observed / physical observation aging / report only / thermal candidate / unknown

FIRE BEHAVIOR
growing / stable / cooling / unknown
```

The UI may render fire behavior only when fresh point-level thermal series support it.

## Prevention / observation

The prevention surface now prioritizes what can actually be observed. A real Sentinel-2 browse pair can be screened in-browser for spatially coherent optical change using source pixels. Candidate regions are labelled as vegetation-loss, vegetation-gain or surface-change **screening candidates** and remain subject to human/high-resolution confirmation. The screen does not claim object detection or hazard verification.

## Cartography

CARTO/OpenStreetMap provides reference geography beneath VIGIA semantic overlays. At local zoom, the symbolic mainland polygon fades so roads and settlements become the dominant reference. Event clusters carry text such as `2 EVENTS`; approximate thermal geometry is rendered only from actual point observations and is never described as a certified perimeter.

## Operational routing

Current report-only or physically aging events can generate bounded confirmation work. The Action surface distinguishes assigned work, unassigned fire events, evidence needs and prevention watches rather than displaying `0 actions` while unresolved work is present.

## Validation

`npm run verify` executes domain/API tests, architecture checks, an end-to-end deterministic smoke test and browser QA. Browser QA covers truth-state semantics, replay state, event routing, observation binding, panel recovery, modal dismissal, role-adaptive work, desktop layouts and mobile navigation.

## Operational boundary

V7 remains decision-support infrastructure. Government deployment still requires source service-level objectives, real authentication/tenancy, durable distributed persistence/queues, formal safety and security assessment, validated fire-behaviour/perimeter models, certified communications integrations and operational field validation against real incidents.
