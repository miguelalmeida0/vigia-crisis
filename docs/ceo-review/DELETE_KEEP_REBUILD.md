# Delete / keep / rebuild

## DELETE

These items actively harm product focus, safety, or credibility.

### Unearned production planes

Remove PREVENT, OUTCOMES, CONSEQUENCE, ACTION, FIELD, command/remediation, mission, sensor tasking, and alert-delivery planes from the production composition and route graph until their release gates pass. Hiding their navigation is insufficient when `createServices()` and `registerRoutes()` still instantiate/register them (`apps/api/src/application/create-services.mjs:84`, `apps/api/src/application/register-routes.mjs:35`).

Preserve experiments only in explicit non-production packages/entrypoints with their own tests.

### Unqualified physical-intelligence language

Delete or qualify:

- `PHYSICAL INTELLIGENCE` as the current product category;
- `Earth observed … ago` when only broad raster context exists;
- product-facing `fusion` before validated state estimation;
- `active perception` before autonomous observation opportunity and receipt;
- generic `current` without a named source clock and evidence role.

### False-null rendering

Delete every formatter/predicate that treats `null`, `undefined`, or empty string as numeric zero. The confirmed Sintra values `0°C / 0% / 0 km/h` are fabricated physical context, not a UX issue.

### Fictional manual availability

Delete the always-present “Manual observation option” when no authenticated field owner, dispatch connector, or availability record exists. `No observation path` is more useful and honest than a hypothetical option that cannot be executed.

### Stale report noise in the primary work surface

Move stale open reports out of the primary queue unless they retain a live task, updated source state, or unresolved owner-backed need. The queue currently mixes urgent current reports with 72-hour history and even upstream narrative text embedded in a place label.

### Unknown API SPA fallback

Prevent `/api/*` misses from returning the SPA with HTTP 200. This masks integration failures and confuses clients. Static history fallback should apply only to non-API routes (`apps/api/src/http/static-files.mjs:43`).

### Unused client product views

Once the production route reduction is accepted, delete or move hidden client views such as `observe.js`, `outcomes.js`, `consequence.js`, `command.js`, and `field.js` from the served bundle. Their presence encourages accidental reactivation and complicates claim audits.

## KEEP AT ALL COSTS

These are the current system's defensible differentiators or safety invariants.

### Production/test reality boundary

Keep the separate universes, forbidden fixture switch, production import traversal, served-root scan, synthetic observation counter, demo-identity check, and fail-closed `ProductionIntegrityViolation`. Make this a release-blocking CI gate.

### Separate report and physical clocks

Keep public-report freshness, physical-observation freshness, source role, and behavior freshness as separate state. A recent report must never become a current physical fire.

### Null and abstention semantics

Keep null fire probability without approved calibration, `UNMEASURED` ranking dimensions, no negative evidence without exact coverage/quality, and geospatial/scientific abstention. These semantics are safer and rarer than the UI styling.

### Raw product and checkpoint foundation

Keep content-addressed raw products, provider product/checksum conflict detection, source timestamps, cursors, pending-product state, failure counters, and valid-response-before-domain-normalization ordering. Harden the storage rather than replacing the contract.

### Native-pixel geospatial integrity

Keep native CRS/geotransform binding, per-band intersection proof, reverse projection, footprint verification, persisted proof objects, and the adversarial lying-catalogue test. This is the project's strongest technical portfolio proof.

### EvidenceNeed truth contract

Keep `REQUEST_ACTIVE`, `WAITING_FOR_SCHEDULED_OBSERVATION`, `MANUAL_ESCALATION_REQUIRED`, `NO_OBSERVATION_PATH`, and `RESOLVED`. Keep the invariant that every unknown requiring action is represented and no orphan need survives.

### Thermal support is not a perimeter

Keep source/nominal pixel footprints, support envelopes, explicit non-authority, geometry freshness, and movement limitation. Never regress to a point/line/hull presented as fire perimeter.

### Failure-path testing

Keep persistence rollback, duplicate/out-of-order acquisition, malformed response, synthetic rejection, fake actor, late arrival, merge/split, negative evidence, and stale-state tests. Add real corpus evaluation beside them; do not replace them.

## REBUILD

The theses are correct; the current implementations are inadequate for the intended product.

### Acquisition and raw evidence plane

Rebuild the local filesystem/atomic JSON store as:

- object-locked raw storage with retention/legal metadata;
- transactional acquisition metadata and checkpoints;
- scheduler leases, retry/backoff, dead-letter state, and replayable normalization jobs;
- explicit accepted/rejected product archives, including malformed bodies;
- exact raw-to-canonical-to-event lineage;
- source health history and SLOs.

Keep the content-addressed product contract.

### Fire-event identity and association

Rebuild from greedy distance/time matching into an event-sourced PostGIS hypothesis engine that considers:

- sensor footprint and geolocation uncertainty;
- event geometry and plausible movement;
- event-time versus arrival-time;
- competing nearby event hypotheses;
- explicit ambiguous/unassociated states;
- deterministic operator merge/split/reject corrections;
- durable identity beyond the 72-hour observation retention window;
- replayable projection versions.

### Evidence aggregation into actual fusion

Retain dependency groups, contradiction, negative-evidence eligibility, and null calibration. Add a coherent claim object with:

- the physical question being answered;
- spatial support/distribution;
- source-specific likelihood or validated score;
- missing and contradicting evidence;
- dependence graph;
- coverage/quality state;
- calibrated uncertainty within a named validation scope;
- benchmark against the best individual source.

If it cannot beat or qualify the best source, call it an evidence ledger, not fusion.

### Action/evidence workflow

Rebuild only after authentication exists:

- OIDC/JWKS and provisioned operator/service/device principals;
- tenant/territory boundaries;
- durable owner, SLA, acknowledgement, work state, evidence receipt, and escalation;
- one real connected camera/drone/field partner or provider tasking connector;
- exactly-once event update from accepted evidence;
- durable notification outbox and receipts.

Do not rebuild the full prior ACTION/FIELD product. Build one evidence-acquisition queue around real unresolved fires.

### Operator experience

Rebuild around a single decision hierarchy:

1. What is physically observed now?
2. Which public reports lack physical evidence?
3. Which source is blind or delayed?
4. What changed in real physical support?
5. Which unknown has an owner and next observation?

The map should prioritize real thermal support and uncertainty. Public reports should be a distinct reference layer. Internal states such as `PARTIAL_INFORMATION_GAIN_UNMEASURED` should become concise operational language, with the full contract available on drill-down.

### Validation program

Rebuild “validation” as a product subsystem, not a test folder:

- governed raw historical corpus;
- independent incident labels and adjudication policy;
- event-time replay;
- detection, false-alarm, lead-time, identity, fragmentation, association, geometry, source-availability, and operator metrics;
- cohort/scope/version metadata;
- prospective shadow run and safety review;
- immutable evaluation result linked to the deployed version.

## Budget rule

No deleted plane returns because its code passes. It returns only when a real provider, real data, accountable owner, measured outcome, and release gate make it necessary. The next budget should favor one complete evidence loop over ten partially wired domains.
