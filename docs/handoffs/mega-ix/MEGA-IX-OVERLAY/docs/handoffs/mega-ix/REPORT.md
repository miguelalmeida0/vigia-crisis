# WHAT A USER CAN NOW DO THAT THEY COULD NOT DO BEFORE

The implementation adds a private incident team, a timed objective, field reporting, a route consequence explanation and recipient-specific message delivery to the existing product. In the controlled API exercise, a Louredo healthcare objective changed from GOOD with an 11-minute stored route to PROBLEM after a synthetic EM527 blockage report; a separate stored alternative remained 24 minutes. Repeating the signed report produced one report, not two.

**This is an implemented and API-tested delivery, not a completed visual acceptance.** The required browser journey and screenshots could not be executed because saved browser permissions rejected access to the local console. No replacement browser, indirect capture or fabricated screenshot was used.

## VISIBLE UI

Command Overview, Incident Detail and Response & Access contain an incident-scoped command area. It presents Important now, up to five watched objectives and three recent changes; selection opens the mission, report, route comparison, confirmation, team conversation or people view. Existing operational analysis is available through disclosure. The six primary navigation routes remain unchanged.

The fields use the existing select system, typography, semantic colors, connected rows and responsive styles. A map action displays stored route geometry; field reporting supports explicit map selection. These controls compile, and their source/markup contracts pass. Their rendered behavior, focus, geometry, overflow and usability have **not** been certified.

## MISSION OBJECTIVES

An authorized commander can create an objective with a named place, protected service, start/end time, stored current route and alternatives. Team members can watch it. The commander can select another stored route or end the mission. States are GOOD, WATCH, PROBLEM and UNKNOWN. Missing/expired routes remain unknown; an ended time window is never kept GOOD.

Mission inputs come from retained Situation and operational-support records. Supported protected services are emergency healthcare, fire response and reception. Facility-to-community and facility-to-incident estimates retain their actual direction; this implementation does not relabel them as community-to-hospital journeys. GOOD means the stored checks are current, not guaranteed safe travel.

## FIELD REPORTS

All 11 requested report types are supported. Reports retain sender, incident, location, observed time, received time, note, verification state and up to two photo/audio attachments of 400 KB each. A report is signed and placed in the durable outgoing queue before transmission. Waiting, rejected and expired outgoing reports remain explicit.

Coordinates are entered or chosen by the user. Location is never inferred. A field confirmation does not create an official restriction. The original reporter cannot independently confirm their own report; contradictory responses remain visible.

## HUMAN CONSEQUENCES

The engine matches precise report locations against actual stored route geometry and considers relevant facility identity. It identifies named communities, services, roads, facilities and remaining alternatives. Imprecise points and matching names alone do not establish intersection. A lost backup facility does not falsely mark the unaffected current route blocked.

Recalculation follows relevant source snapshots, restrictions, report/confirmation changes and expiry. A mission records why it changed, its previous state and the available stored alternative. No model calculates these facts.

## OFFLINE MESSAGING

Messages use a persistent outgoing queue, immutable IDs, retry, deduplication and signed encrypted envelopes. Chat can refresh incoming messages and receipts without replacing a typed composer. Draft text and bounded attachments are encrypted in local storage. These behaviors are implemented; browser reload and multi-browser journeys remain unexecuted.

Prepare this device installs an offline application shell and creates a passphrase-protected package. The offline page requires that passphrase before showing private maps or team information. Cached account ownership is checked. An authorization rejection locks private content; explicit console logout requests removal of origin storage/cache. Offline copies cannot learn about a remote revocation until reconnecting.

Stored geometry and named facilities are available in the offline workspace; basemap imagery is not cached. Cached information remains dated, and expired mission/fallback/report inputs lose their current assurance.

## LOCAL HUB

The existing local API serves team objectives, reports, messages, cached context and presence while upstream connectivity is absent. The controlled integration test disabled upstream transport, continued local work, restored the link and synchronized once without duplicate effects.

An optional central connection uses `VIGIA_TEAM_CENTRAL_URL` and `VIGIA_TEAM_CENTRAL_OPERATOR_TOKEN`. It requires HTTPS, an authenticated authorized account and matching pre-provisioned private group/device grants. It does not discover public teams or grant membership automatically. The open commander workspace retries configured central sync in the background at most once per minute; a manual sync action is also available. Unattended synchronization without an open workspace requires a host scheduler invoking the provided synchronizer.

No real external central deployment was configured or exercised here. The local hub test is controlled integration evidence.

## DELIVERY / ACKNOWLEDGEMENT

Relay, hub storage and intended-recipient delivery are separate states. Only the intended recipient's signed, content-bound acknowledgement counts toward delivery. The UI can show received recipients and those still waiting. Acknowledgement is emitted after the device durably stores the received view.

Store-and-forward retains ciphertext with a bounded relay path and expiry. Relay path entries use registered device IDs, with human owner names in the UI. Revoked or unknown relay devices are rejected. Central synchronization uses insertion-ordered cursor pages, so more than 100 envelopes are not silently dropped.

## WHAT CHANGED

The team chronology records mission creation/end, reports, confirmation requests/responses, route changes and mission-state transitions. Observed and received clocks remain separate. Mission detail exposes the reason and before/after state rather than internal graph terminology.

## SECURITY

Group access is authenticated, membership-bound and incident-scoped. Mission administration requires command authority. Messages use established WebCrypto ECDSA P-256 and AES-GCM primitives; SQLite record bodies are encrypted at rest. Offline packages use PBKDF2-SHA-256 with 600,000 iterations and AES-GCM. Browser device keys are non-extractable. Server key/store files use restrictive permissions.

Tests cover unauthorized membership/scope, bad signatures, immutable replay, false/wrong-content acknowledgements, member/device revocation, real relay IDs, cache ownership, passphrase failure and encrypted persistence. This is targeted security validation, not a comprehensive penetration-test claim. Production local-network deployments require HTTPS and trusted-device operational controls.

## PERFORMANCE

Acceptance follow-up, 14 September: the normal uninstrumented first API request measured **4.305 seconds**, down from the prior reported ~9.5 seconds. Twenty final uncached projection requests had **3.904-second p95**, so the <2.5-second gate remains unmet. Complete weather and portfolio output comparisons passed. See [PERFORMANCE_ACCEPTANCE.md](PERFORMANCE_ACCEPTANCE.md) and `performance-evidence.json` for methods and variance.

Mission projections reuse unchanged inputs; an unrelated report does not trigger mission recomputation. Matching and ordering are deterministic. Team refresh and transport operate independently of map navigation. There are no model calls on the mission/message path.

In the running controlled API exercise, group reads took 4–10 ms after creation and signed mutations 2–11 ms. The earlier implementation run recorded about 9.5 seconds for initial Command Overview; the acceptance follow-up above supersedes that timing. Browser frame time and responsive performance remain unmeasured.

## TESTS

Fresh acceptance follow-up: **153 targeted regression tests passed**, and the production build/full `verify:static` passed. Logs: `acceptance-regression-tests.txt`, `acceptance-static-verification.txt`. These overlap earlier suites; counts are not additive.

- 50 focused mission, security, transport, persistence, markup, offline-crypto and expiry tests passed: `focused-tests.txt`.
- The combined retained-product run passed 111 tests before the final additional outgoing-report markup assertion: `retained-tests.txt`. Together with the final focused run, the covered cases total 112 unique tests.
- Five operational-recovery regression tests passed: `recovery-tests.txt`. Total unique covered cases: **117**.
- The backend controlled exercise passed: `controlled-api-evidence.json`.
- The changed-target source design detector returned no findings: `design-detector.json`. It did not render the UI.
- Production build and full `verify:static` passed: `static-verification.txt`. Static browser-contract checks inspect the test harness source; they are not browser execution.
- The final backend restart preserved the mission, its 24-minute alternative and exactly one report with unchanged observed/received times: `restart-evidence.json`.

Final running release: `vigia-intelligence-fabric-878862be6a1edb84`. API port: 4177. The console process serves the final production `dist` on port 4191. Console and release source hashes agree; this process/build evidence does not assert that the browser loaded it.

## SCREENSHOTS

All 15 requested scene captures and all six canonical-route comparison sets are **NOT RUN**. `CAPTURE_LEDGER.json` lists each missing artifact. Independent Impeccable review requires **RECAPTURE**; no visual ship verdict exists. Desktop/mobile design, keyboard flow, zoom, touch targets, overflow and the under-30-second user journey remain required acceptance work.

## REAL VS CONTROLLED

Operational teams use retained VIGIA incidents, facilities and qualified route data. No synthetic roads or facilities are inserted into those records.

The deliberately retained group **Mega IX — CONTROLLED FIELD TEST** belongs to the incident **Póvoa De Lanhoso · Esperança E Brunhais** (`incident:PT-2026-CA68414DF2`). Its synthetic Louredo/EM527 geometry and 11/24-minute times are exercise material, visibly labelled, separate from operational history. Group ID: `0d30f070-5540-4f76-89d4-cdfc9b5cceea`. It contains a working mission and one synthetic blockage report authored by the authenticated local operator. No fictional Ana/Pedro receipt was created in the real runtime. Multi-person confirmation and delivery are proven only by the isolated authenticated test harness.

## LIMITATIONS

- Browser acceptance and screenshot evidence are blocked by saved browser permission.
- Native Nearby, Bluetooth/Wi-Fi peer and LoRa adapters require a native application/radio gateway. Their unavailable state is explicit; no hardware delivery was tested.
- Central synchronization needs a configured deployment and matching grants; no live external central test was performed.
- Offline preparation must finish before disconnection; only retained records/geometry are available. Passphrases cannot recover a forgotten offline key.
- Report freshness is currently one hour; envelopes expire after their protocol TTL. Expired/rejected work requires user review rather than silent re-signing.
- Photo/audio attachment and map-picking interactions compile but have not been operated in a browser.

## GIT

The requested branch `vigia/mega-ix-mission-command-field-network` could not be created: Git metadata is read-only and creating its lock file returned `Operation not permitted`. The checkout remains on `vigia/operational-intelligence-v1`. No commit, push, merge, reset or stash was performed. Existing dirty work was preserved. Release metadata was regenerated through the existing build pipeline.

MEGA IX remains incomplete: browser and multi-person runtime acceptance, all screenshot artifacts, the fresh-user measurement, the p95 performance target and Git completion remain outstanding.
