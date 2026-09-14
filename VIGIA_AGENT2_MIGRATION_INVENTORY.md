# VIGIA Agent 2 migration inventory

Branch-local governed head: `017`. Extension requirement: PostgreSQL with PostGIS. The migration runner applies `001` through `017` in a single advisory-locked transaction, records a SHA-256 checksum and execution time per governed numeric version, rejects checksum drift, and supports idempotent re-execution by skipping checksum-identical versions.

No Agent 1 migration content was read from the protected sibling worktree. Agent 1's reported ownership of migration numbers `017–021` is external comparison information only. Every collision in that range is unresolved here and is marked `REQUIRES_INTEGRATION_BRANCH_DECISION`. The integration DAG must place renumbered/rebased Agent 2 work above Agent 1 migration `021`; it must never overwrite Agent 1 history or rewrite an already-applied checksum.

## Inventory through Agent 2 head

### 001 — `001-physical-truth.sql`

- Purpose: establish physical truth, raw provenance, event association, provider checkpoints, lineage, and operator audit.
- Objects: extension `postgis`; tables `vigia_schema_migration`, `raw_source_product`, `physical_observation`, `fire_event`, `event_observation`, `source_checkpoint`, `provenance_lineage`, `operator_action`.
- Indexes: GiST observation position/support and event position; observation/event time; operator entity/actor.
- Constraints/data: primary/unique/foreign keys; nonnegative byte length; SHA-256 formats; processing-state enum check; inserts a legacy self-recorded migration name.
- Idempotency: `IF NOT EXISTS` plus `ON CONFLICT DO NOTHING`; governed runner separately records version `001` and checksum.
- Recovery/rollback: PostGIS must be installed before recovery; preserve raw-product/object-key and action-chain data. Rollback is restore-forward, not destructive table removal.

### 002 — `002-operational-work.sql`

- Purpose: durable Evidence Debt work, requests, observation opportunities, resources, and manual correction.
- Objects: `evidence_need`, `evidence_request`, `observation_opportunity`, `field_resource`, `manual_event_correction`.
- Indexes: evidence need by subject/owner; request by target/owner/due; opportunities by event/availability/time.
- Constraints/data: primary keys and JSON defaults; no bulk backfill; legacy migration self-record.
- Idempotency/recovery: additive `IF NOT EXISTS`; recovery must retain work ownership/history and geographic columns. Roll back through backup/restore or compensating forward migration.

### 003 — `003-category-reset.sql`

- Purpose: prevention findings and detector-run provenance.
- Objects: `prevention_finding`, `detector_run`.
- Indexes: GiST finding geometry; finding state/calibration/time.
- Constraints/data: required current/comparison observations and validation/provenance payloads; no backfill; legacy migration self-record.
- Idempotency/recovery: additive; dropping loses validation lineage, so use forward repair.

### 004 — `004-flagship-productization.sql`

- Purpose: version-bound developer/domain-expert review of prevention findings.
- Objects: `prevention_finding_review` with cascade reference to `prevention_finding`.
- Indexes: finding/version/review time and reviewer type/decision/time.
- Constraints/data: reviewer/decision check constraints; no data rewrite; self-record.
- Idempotency/recovery: additive. A rollback must preserve reviews before any parent-table restore.

### 005 — `005-prevention-review-lab.sql`

- Purpose: add reviewer qualifications, model/finding identity, scene pair, source quality, and land-cover context.
- Changes: alters `prevention_finding_review`; backfills `model_version = detector_version` where absent.
- Indexes/extensions: none/new; PostGIS remains inherited.
- Constraints: non-null JSON defaults on new structured fields.
- Idempotency/recovery: columns and guarded update are re-runnable. Forward recovery must verify legacy rows received the intended model version; rollback would be lossy and is not approved.

### 006 — `006-detection-proof.sql`

- Purpose: causal detection timestamps and provider-availability proof.
- Changes: adds/backfills non-null `fire_event.created_at`; creates `prospective_detection_capture`; corrects thermal observation `received_at` from raw product receipt time.
- Indexes: fire-event creation time and prospective provider-observation time.
- Constraints/data: primary/foreign key to fire event; timestamp backfills and thermal receipt correction are material data migrations.
- Idempotency/recovery: DDL is guarded and updates are convergent. Before forward recovery, compare affected thermal observations with raw product receipt timestamps. Rollback requires a pre-migration backup.

### 007 — `007-prospective-causality.sql`

- Purpose: distinguish authoritative server API/UI availability from browser client time.
- Changes: adds API/UI causal timestamp and trace columns to `prospective_detection_capture`; column comments define authority.
- Indexes: partial descending `ui_first_seen_at` index.
- Constraints/data: no backfill. Browser clock is explicitly informational.
- Idempotency/recovery: additive/guarded; preserve server receipt semantics during any adapter migration.

### 008 — `008-live-operations.sql`

- Purpose: monitored territory/assets, policy decisions, alert lifecycle, delivery, opportunities/results, audit, and metrics.
- Objects: `monitored_territory`, `monitored_zone`, `monitored_asset_group`, `monitored_asset`, `territory_alert_policy`, `operational_alert`, `alert_policy_decision`, `alert_recipient`, `alert_delivery_outbox`, `alert_acknowledgement`, `alert_escalation`, `alert_resolution`, `operational_observation_opportunity`, `evidence_opportunity_result`, `operations_audit_record`, `operations_metric_event`; PostGIS extension assertion.
- Indexes: GiST territory/zone/asset geometries; active alerts, alert event, delivery due, opportunity event, evidence result dedupe, audit aggregate, metric name.
- Constraints/data: lifecycle/state checks, foreign keys, unique decisions/deliveries/results, generated audit sequence; no bulk backfill.
- Idempotency/recovery: object creation is guarded. Operational outbox and audit rows are recovery-critical; restore them transactionally before workers restart.

### 009 — `009-operations-recovery.sql`

- Purpose: actor roster/territory escalation assignment, recovery indexes, expanded opportunity types, and alert status projection.
- Objects/changes: `operations_actor_roster`, `operations_territory_assignment`; replaces the opportunity-type check; creates operational recovery indexes and `operational_alert_status_projection` view.
- Indexes: roster availability, assignment lookup, evidence result state, metric trace, alert territory/state.
- Constraints/data: new opportunity enum constraint; no row rewrite other than constraint replacement.
- Idempotency/recovery: tables/indexes are guarded; view and check replacement require integration testing on the target PostgreSQL version. Roll forward if the view contract changes.

### 010 — `010-autonomous-evidence-operations.sql`

- Purpose: autonomous but bounded evidence closure, source watches, decision ledger, and spatial coverage/gaps.
- Objects: `evidence_closure_plan`, `evidence_source_watch`, `incident_decision_ledger`, `coverage_region`, `coverage_cell`, `coverage_window`, `coverage_gap`.
- Indexes: plan/watch due, decision subject/time, GiST coverage geometry, active coverage windows/gaps.
- Constraints/data: explicit lifecycle/result/decision/opportunity/coverage-state checks; foreign keys and dedupe constraints; generated ledger sequence; no backfill.
- Idempotency/recovery: additive. Ledger hashes, watches, deadlines, and coverage windows require point-in-time-consistent restore before controllers resume.

### 011 — `011-physical-truth-autopilot.sql`

- Purpose: materialized truth state, next-best-evidence decisions, evidence races, and operational latency stages.
- Objects: `fire_truth_state`, `next_best_evidence_decision`, `evidence_race`, `operational_latency_stage`.
- Indexes: event/time lookups for each operational object.
- Constraints/data: latency uniqueness and non-destructive JSON payloads; no backfill.
- Idempotency/recovery: guarded DDL. Rebuild projections only from retained inputs/ledger; never fabricate missing truth state.

### 012 — `012-decision-ledger-autopilot.sql`

- Purpose: expand decision-ledger event vocabulary for truth recomputation, evidence races, and material alert updates.
- Changes: drops and recreates `incident_decision_ledger_decision_type_check`.
- Indexes/extensions/data: none; no data rewrite.
- Idempotency/recovery: repeatable constraint replacement, but fails if existing values fall outside the replacement set. Audit values before forward recovery.

### 013 — `013-command-survival.sql`

- Purpose: durable incident command snapshot/event stream, import receipts, and offline reconciliation.
- Objects: `incident_command_snapshot`, `incident_command_event`, `incident_command_import`, `incident_command_offline_receipt`.
- Indexes: event time and event type/receipt time.
- Constraints/data: sequence, event/hash, import dedupe, universe/status, offline-origin sequence, and release identity constraints; no backfill.
- Idempotency/recovery: additive. Restore event stream before snapshots, verify hash chain/release IDs, then rebuild snapshot; do not accept a snapshot without its events.

### 014 — `014-command-evidence-envelope.sql`

- Purpose: make the command-event evidence envelope explicit and queryable.
- Changes/data migration: adds `event_envelope` and `envelope_hash`; backfills every legacy event envelope with `LEGACY_ENVELOPE_BACKFILL`; sets envelope non-null.
- Indexes: expression indexes for responsible owner and review time.
- Constraints: non-null envelope after backfill.
- Idempotency/recovery: column additions/backfill converge. Validate backfilled release/actor/time semantics before forward recovery; rollback would discard the envelope and is not approved.

### 015 — `015-partial-incident-import.sql`

- Purpose: permit explicit `PARTIALLY_ACCEPTED` incident imports.
- Changes: replaces the import status check.
- Indexes/extensions/data: none; no rewrite.
- Idempotency/recovery: repeatable constraint replacement; preserve partial status during downgrade/restore.

### 016 — `016-security-identity-boundaries.sql`

- Purpose: bind external observation identity to principal, agency, device/provider, incident, source family, and schema.
- Objects: `observation_identity_binding`.
- Indexes: incident/time/canonical ID.
- Constraints/data: canonical primary key, composite uniqueness, and `sha256:` payload-hash check; no backfill.
- Idempotency/recovery: additive. Restore before accepting new observations to prevent duplicate canonical identities.

### 017 — `017-intelligence-convergence.sql`

- Purpose: converge the intelligence event/object store, projections, Decision Packets, prospective archive, Decision Memory outcomes, receipts, and information-value learning.
- Objects: `intelligence_event`, `intelligence_object`, `intelligence_lineage_edge`, `intelligence_projection_state`, `intelligence_projection_row`, `crisis_decision_packet`, `intelligence_receipt`, `prospective_archive_snapshot`, `decision_outcome_ledger`, `information_value_outcome`.
- Indexes: event incident/sequence; object incident/kind and knowledge time; projection query; packet incident/time; prospective incident/time and GiST footprint.
- Constraints/data: semantic-identity uniqueness, positive revisions, monotonic projection fields, namespaced hash formats, deferrable lineage foreign keys, archive sequence/content dedupe, packet/outcome references, rights payloads; no historical data rewrite.
- Idempotency/recovery: guarded DDL and checksum-pinned runner. Restore objects before deferred lineage validation, packets before outcomes, archive snapshots in sequence, then rebuild projections and verify replay.
- Collision: Agent 1 is reported to own migration IDs `017–021`. The filename, number, object names, constraints, roles, triggers, policies, and release-head implications require `REQUIRES_INTEGRATION_BRANCH_DECISION`. Do not copy this file into an integrated migration directory as 017.

## Integration collision rule

For Agent 1 migrations `017`, `018`, `019`, `020`, and `021`, content is unknown here. Every possible collision is therefore `REQUIRES_INTEGRATION_BRANCH_DECISION`. The integration branch must:

1. import Agent 1's applied checksums without alteration;
2. inventory table/type/index/trigger/function/role/policy names against Agent 2 migration 017 and the proposed security-compartment SQL;
3. create additive, newly numbered convergence migration(s) strictly above `021`;
4. backfill before enforcing non-null/RLS constraints;
5. prove clean upgrade from both the Agent 1 release database and Agent 2 certification database;
6. prove idempotency, forward recovery, backup/restore, repository semantic equivalence, rights isolation, and deterministic replay;
7. publish one new migration head and one checksum ledger.

The file `docs/architecture/migration-019-security-compartments.sql.proposed` remains a proposal. Its number is not reserved and it must be renumbered/reworked above Agent 1 head after collision review.
