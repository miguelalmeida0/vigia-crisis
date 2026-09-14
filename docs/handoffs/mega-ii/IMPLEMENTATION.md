# Mega Intelligence II — implementation contract

The operational incident remains the primary object. Existing map, typography, navigation and source distinctions remain authoritative. Normal map/navigation/facility reads never invoke a model.

## Work packages and evidence

1. Append-only incident situation snapshots and indexed dependency edges in PostgreSQL/PostGIS; scoped read API and temporal reconstruction without future leakage.
2. Persisted facility routes with explicit direction, OSRM road steps, road coverage state and qualified-nearest queries. No closure feed means unavailable coverage, not road clearance.
3. Deterministic consequence calculation, compact material changes, impact chains and prioritized durable gaps. Source content unchanged means no new situation version.
4. Read-only Ask VIGIA tools, exact source/relationship grounding, supported-question parser and bounded optional local language translation. Unsupported statements are rejected.
5. Controlled TXT/HTML/PDF ingestion with immutable source passages, candidate review and separate high-risk admission. Documents cannot choose authority or invoke tools.
6. Isolated road/facility/refuge unavailability scenarios calculated from retained routes and alternatives; no writes to operational truth.
7. Bounded installed-model bake-off, at least 100 representative cases, honest crash/abstention/latency reporting.
8. Existing Ask/facility/history interactions, compact history/scenario labels, explicit document review. Rendered responsive and keyboard checks; no extra dashboard or contradiction UI.
9. Real incident graph/route example, restart proof, source-to-relationship proof, tests, performance comparison, live/fixture/scenario evidence and final report.

## Proposed UI composition

Product: operational wildfire intelligence for users under time pressure. Primary task: understand the selected incident and inspect a relevant facility. Dominant surface: the existing map. P1 stays unchanged; compact answers are P2/P3 and provenance/history P4. Visual variance 1/10, motion 1/10, density 7/10. Risk: operational safety. Authority: existing converged design.

- Ask VIGIA retains its existing drawer, question input and answer region. Add short supported-question choices and a compact mode selector using established controls. Answers lead with the result; route facts and “Why?” follow. No conversation transcript, avatars or generated recommendations.
- Time Machine uses the existing historical-time input plus retained snapshot choices inside that drawer. Historical results carry a prominent “Historical view” heading and UTC timestamp; current context is never relabeled historical. Current map remains current unless an explicitly selected historical scene is supplied.
- Scenario controls occupy a separate drawer section with “Scenario — not observed reality”, entity/road selection and one Run button. Results use the existing detail rows and show only changed relationships. No scenario state enters current map or truth.
- Add source document uses an authorized operator drawer: file and registered source selection → exact quoted candidate passages → review/admission. It does not prepend content to any primary route.
- Facility sheets reuse their existing distance/contact hierarchy, adding a normal-route/road-information row and a compact Why disclosure only when stored relationships exist.

Backend implementation proceeds independently. New UI composition is subject to the repository's reference-lock approval rule before frontend implementation.
