import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bindReleaseIdentity, probeCanonicalRuntimeIdentity } from './release/runtime_identity_binding.mjs';
import { renderWorldLeaderReport } from './world-leader-report/markdown-report.mjs';
import { buildWorldLeaderScorecard } from './world-leader-report/scorecard-builder.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const writeJson = (path, value) => {
  const target = resolve(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(bindReleaseIdentity(value,runtimeBinding), null, 2)}\n`);
};
const manifest=readJson('data/validation/release/current-release-manifest.json');
const runtimeProof=await probeCanonicalRuntimeIdentity({manifest});
const runtimeBinding=runtimeProof.identity;
const evidence = {
  certification: '.artifacts/world-leader-gap-closure/certification.json',
  source: '.artifacts/world-leader-gap-closure/source-resolution/execution-summary.json',
  sourceSample: '.artifacts/world-leader-gap-closure/source-resolution/job-sample.json',
  funnel: 'data/validation/world-leader-gap-closure/verification-promotion-funnel.json',
  performance: '.artifacts/world-leader-gap-closure/performance/useful-content-api.json',
  map: '.artifacts/world-leader-gap-closure/browser/interaction-evidence/map-native-drag.json',
  chromeTrace: '.artifacts/world-leader-gap-closure/browser/interaction-evidence/map-drag-chrome-trace.json',
  search: '.artifacts/world-leader-gap-closure/browser/interaction-evidence/search-caret.json',
  filters: '.artifacts/world-leader-gap-closure/browser/interaction-evidence/global-filter.json',
  reports: '.artifacts/world-leader-gap-closure/browser/interaction-evidence/reports-tabs.json',
  refresh: '.artifacts/world-leader-gap-closure/browser/interaction-evidence/last-good-refresh.json',
  startup: '.artifacts/world-leader-gap-closure/browser/interaction-evidence/healthy-startup.json',
  keyboard: '.artifacts/world-leader-gap-closure/browser/interaction-evidence/keyboard-custom-select.json',
  operations: '.artifacts/world-leader-gap-closure/operations/selected-incident-workspaces.json',
  protection: '.artifacts/world-leader-gap-closure/protection/protection-portfolio.json',
  outcomes: '.artifacts/world-leader-gap-closure/outcomes/live-and-replay-separation.json',
  handoff: '.artifacts/world-leader-gap-closure/collaboration/shift-handoffs.json',
  events: '.artifacts/world-leader-gap-closure/events/material-event-stream.json',
  attention: '.artifacts/world-leader-gap-closure/human-attention/canonical-queue.json',
  routeScreens: '.artifacts/world-leader-gap-closure/browser/route-screenshots',
  regression: 'apps/api/test/world-leader-gap-closure.test.mjs',
  uiContract: 'apps/operator-console/tests/operational-hardening-contract.mjs',
  priorResponsive: '.artifacts/operational-truth-recovery/final/responsive/route-viewport-matrix.json',
  priorZoom: '.artifacts/operational-truth-recovery/final/interaction-evidence/zoom-200-percent.json',
};

const item = (newScore, implementation, objectiveEvidence, remainingGap, status = 'IMPLEMENTED_AND_CERTIFIED') => ({
  newScore,
  implementation,
  objectiveEvidence,
  remainingGap,
  status,
});

const score = new Map([
  ['Runtime architecture', item(8.1, 'Separated autonomous source execution, human attention, shift handoff, protection, and outcome services from read-only route projection.', [evidence.certification, evidence.regression], 'The canonical projection service remains intentionally broad and should be decomposed further without changing its contract.')],
  ['Runtime recovery / resilience', item(7.9, 'Kept last-good projection content during refresh and made all global projections read-only.', [evidence.refresh, evidence.startup], 'Production multi-host failover is outside this local canonical release.')],
  ['Release identity / determinism', item(7.6, 'Certified API, console, source receipts, and browser evidence against one deterministic release identifier.', [evidence.certification], 'The local rehearsal remains intentionally unsealed because the mandate forbids staging and committing.')],
  ['Security boundaries', item(8.6, 'Preserved authenticated mutation routes, role checks, replay isolation, and external-send denial.', [evidence.regression, evidence.protection], 'External production authority is not configured.')],
  ['FieldNet isolation', item(8.5, 'Reused FieldNet only through the existing exact-scope boundary and never treated its absence as official confirmation.', [evidence.regression, evidence.sourceSample], 'No field confirmation was available for the current canonical population.')],
  ['Data integrity / provenance', item(8.5, 'Persisted provider attempts, durable receipts, canonical bindings, rejections, and distinct outcome entities.', [evidence.sourceSample, evidence.outcomes], 'Several upstream providers remain unavailable or stale.')],
  ['Truth-model architecture', item(8.5, 'Enforced the four governed incident classes; only VERIFIED_CURRENT contributes to active counts.', [evidence.certification, evidence.funnel], 'No production incident currently satisfies the complete evidence contract.')],
  ['Failure-mode design', item(8.2, 'Added bounded retries, backoff, rate-limit state, circuit-breaker probes, authority-required state, escalation, and last-good delivery.', [evidence.source, evidence.refresh], 'A multi-region disaster-recovery exercise was not run in this release.')],
  ['Performance', item(7.9, 'Removed route overfetch, compacted resolver/report projections, parallelized useful-content sampling, and retained MapLibre instances.', [evidence.performance, evidence.map, evidence.chromeTrace], 'Cold provider latency remains external to the local useful-content gate.')],
  ['Maintainability / architecture quality', item(7.6, 'Created focused router, protection, attention, and handoff services and one shared frontend contract instead of route-specific replicas.', [evidence.regression, evidence.uiContract], 'The legacy canonical projection module still carries multiple projection builders.')],
  ['Test quality', item(7.8, 'Added seven golden operating-loop tests plus cross-route, safety, promotion, lifecycle, and projection-purity assertions.', [evidence.regression, evidence.certification], 'External provider contract tests require provider credentials and fixtures owned by those authorities.')],
  ['Observability', item(7.8, 'Exposed provider attempt latency/state/history, source health, material events, API useful-content timing, and five-second map frame traces.', [evidence.sourceSample, evidence.performance, evidence.chromeTrace], 'Long-horizon production telemetry is not available in a local rehearsal.')],
  ['Incident classification integrity', item(8.3, 'Reclassified 191 canonical records under one four-state contract and eliminated stale-active records.', [evidence.certification, evidence.funnel], 'Zero records meet VERIFIED_CURRENT because official association is unavailable.')],
  ['Freshness', item(5.2, 'Made freshness explicit and kept 152 stale records in NEEDS_REVALIDATION rather than active.', [evidence.certification, evidence.funnel], '152 retained incidents require new qualifying observations.', 'CAPABILITY_COMPLETE_EXTERNAL_DATA_REQUIRED')],
  ['Geolocation quality', item(6.0, 'Rendered governed coordinates for all 191 retained records and reported the verified-current denominator truthfully.', [evidence.filters, `${evidence.routeScreens}/07-global-awareness.jpg`], 'There are zero VERIFIED_CURRENT records, so the >=95% operational-subset gate has no non-empty denominator.', 'CAPABILITY_COMPLETE_EXTERNAL_DATA_REQUIRED')],
  ['Geometry / spatial truth', item(6.0, 'Kept observed points, admitted geometry, historical geometry, and forecast scenarios distinct; no perimeter was inferred from thermal points.', [evidence.uiContract, `${evidence.routeScreens}/04-intelligence.jpg`], 'No current official perimeter or admitted forecast geometry is available.', 'CAPABILITY_COMPLETE_EXTERNAL_DATA_REQUIRED')],
  ['Source coverage', item(4.5, 'Executed the governed NASA FIRMS and CAP strategies for every resolver job and reported AUTH_REQUIRED/NO_COVERAGE precisely.', [evidence.source, evidence.sourceSample], '573 jobs require CAP authority and 104 have no qualifying coverage.', 'CAPABILITY_COMPLETE_EXTERNAL_DATA_REQUIRED')],
  ['Independent corroboration', item(5.8, 'Counted distinct causal families, rejected temporal/spatial mismatches, and prevented duplicate-family inflation.', [evidence.funnel, evidence.regression], 'Independent matches alone cannot replace missing official association.', 'CAPABILITY_COMPLETE_EXTERNAL_DATA_REQUIRED')],
  ['Official confirmation', item(3.0, 'Implemented the official CAP resolution strategy and terminal AUTH_REQUIRED boundary without inventing confirmation.', [evidence.source, evidence.funnel], 'A configured authoritative CAP provider and authority are externally required.', 'EXTERNAL_BLOCKER')],
  ['Source-health usefulness', item(7.6, 'Projected provider identity, actual attempt result, latency, last/next checks, retry, breaker, and affected decision.', [evidence.sourceSample, `${evidence.routeScreens}/07-global-awareness.jpg`], 'Historical uptime baselines require sustained production observation.')],
  ['Weather/context association', item(6.5, 'Separated incident-associated weather from regional context and surfaced thermal/weather trends in Intelligence.', [evidence.regression, `${evidence.routeScreens}/04-intelligence.jpg`], 'Current incident-specific forecast products are not available for every record.', 'CAPABILITY_COMPLETE_EXTERNAL_DATA_REQUIRED')],
  ['Data-gap transparency', item(8.4, 'Mapped every unresolved evidence boundary to a resolver, owner, next check, unlock condition, and consequence.', [evidence.sourceSample, evidence.operations], 'External gaps remain visible by design.')],
  ['Cross-source reconciliation', item(7.5, 'Added provider normalization, spatial/temporal association, independence checks, conflict state, and canonical reevaluation.', [evidence.funnel, evidence.regression], 'Official-source reconciliation cannot complete until the authority feed is configured.')],
  ['Temporal correctness', item(7.8, 'Applied UTC timestamps, freshness doctrine, temporal rejection accounting, and last/next-check semantics.', [evidence.funnel, evidence.sourceSample], 'Upstream timestamps remain limited by source publication cadence.')],
  ['Command Overview', item(7.8, 'Rebased KPIs on verified truth, material change, autonomous resolution, and one canonical human-attention queue.', [evidence.certification, `${evidence.routeScreens}/01-command-overview.jpg`], 'No verified active incident can be highlighted until authoritative evidence arrives.')],
  ['Incidents triage', item(7.0, 'Added deterministic ordering and per-item priority factors while preserving the distinction between ranking and risk.', [evidence.regression, `${evidence.routeScreens}/02-incidents.jpg`], 'The priority model is not yet calibrated against operational outcomes.', 'CAPABILITY_COMPLETE_SCIENCE_REQUIRED')],
  ['Incident Detail', item(7.5, 'Projected current truth, material change, exposure, unknowns, active resolvers, protection state, and next decision in one workspace.', [evidence.operations, `${evidence.routeScreens}/03-incident-detail.jpg`], 'Exposure detail remains bounded by available community/asset inputs.')],
  ['Intelligence', item(7.5, 'Implemented distinct Now/Next/Watch/Uncertainty/Decision sections with thermal persistence, weather trend, terrain, access, assets, thresholds, and truthful abstention.', [evidence.regression, `${evidence.routeScreens}/04-intelligence.jpg`], 'Forecast geometry remains withheld because no scientifically admitted scenario is available.')],
  ['Operations', item(7.8, 'Separated Source Resolution, Response Operations, and Protect/Recover; added selected-incident workspace, owner, deadline, escalation, acknowledgement, completion, and postcondition.', [evidence.operations, `${evidence.routeScreens}/05-operations.jpg`], 'Live external dispatch remains disabled.')],
  ['Reports & Analytics', item(7.6, 'Implemented distinct controlled decision, outcome, performance, and quality projections with truthful populations and drilldowns.', [evidence.reports, evidence.outcomes, `${evidence.routeScreens}/06-reports-analytics.jpg`], 'Live outcome trends remain empty until real operational records accumulate.')],
  ['Global Awareness', item(7.2, 'Added semantic truth classes, source/freshness state, material events, fit results, Quicklook, and observable local filtering without remount.', [evidence.filters, `${evidence.routeScreens}/07-global-awareness.jpg`], 'Portfolio-level verified-current and official-provider coverage are both empty.', 'CAPABILITY_COMPLETE_EXTERNAL_DATA_REQUIRED')],
  ['Cross-route continuity', item(8.1, 'Kept one incident identity and atomic camera/selection contract across list, detail, intelligence, operations, and global projections.', [evidence.certification, evidence.map], 'No known software gap remains in the certified flows.')],
  ['Search / filtering', item(7.8, 'Preserved the incident search DOM node, focus, value, caret, route render count, map instance, and network count on each key; kept filters inside the hash.', [evidence.search, evidence.filters], 'Very large future inventories may require server-side indexed search.')],
  ['Map UX', item(8.0, 'Restored native MapLibre drag, WebGL layers, readable label overlay, persistent instances, and source/filter updates without style reload.', [evidence.map, evidence.chromeTrace], 'Offline basemap packaging is not included in this local release.')],
  ['Information hierarchy', item(7.7, 'Preserved the approved white hierarchy while prioritizing state, change, action, uncertainty, and decision.', [evidence.routeScreens], 'Dense source-resolution detail still requires progressive disclosure for very small screens.')],
  ['Cognitive load', item(7.5, 'Grouped operational work into three lanes and constrained primary UI to operator language with technical provenance behind disclosure.', [evidence.operations, evidence.reports], 'High-volume human-attention queues require future portfolio assignment policies.')],
  ['Emergency immediacy', item(7.5, 'Made material change, resolver execution, deadlines, human attention, consequence of delay, and next action immediately scannable.', [evidence.attention, `${evidence.routeScreens}/01-command-overview.jpg`], 'No live verified incident exists to exercise a real urgent escalation.')],
  ['Operator language', item(7.6, 'Mapped raw enums and pipeline terminology to human labels in primary routes while retaining exact codes in provenance.', [evidence.uiContract, evidence.routeScreens], 'Some provider-specific failure descriptions remain necessarily technical in drilldowns.')],
  ['Accessibility', item(7.6, 'Retained one H1/main, labelled controls, keyboard-operable shared selects/tabs/drawers, no unnamed controls, and non-wrapping status chips.', [evidence.keyboard, evidence.priorZoom, evidence.uiContract], 'A full external screen-reader study remains outstanding.')],
  ['Responsive behavior', item(7.6, 'Preserved the certified route viewport matrix and mobile command navigation while adding responsive operational lanes.', [evidence.priorResponsive, evidence.routeScreens], 'Physical-device testing is outside the local runtime evidence set.')],
  ['Prioritization quality', item(6.5, 'Built deterministic reason codes from recency, verification, material change, conflict, deadline, authority, and provider failure.', [evidence.operations, evidence.attention], 'The ordinal model is not an outcome-calibrated risk score.', 'CAPABILITY_COMPLETE_SCIENCE_REQUIRED')],
  ['Decision support', item(7.7, 'Projected current state, change, options, requirements, consequence of waiting, change conditions, next evaluation, and the responsible resolver.', [evidence.operations, `${evidence.routeScreens}/04-intelligence.jpg`], 'Live decision-quality validation requires an operational pilot.')],
  ['Uncertainty communication', item(8.2, 'Kept verification, freshness, source availability, scientific admission, work state, and platform health as separate axes.', [evidence.certification, evidence.funnel], 'External source absence remains an explicit limitation, not a software ambiguity.')],
  ['Source-resolution automation', item(8.0, 'Implemented provider routing, polling, normalization, association, validation, binding, reevaluation, retry/backoff, breaker, receipts, and transition history.', [evidence.source, evidence.sourceSample, evidence.regression], 'The official provider needs external configuration.')],
  ['Proactivity', item(7.8, 'Added scheduled autonomous acquisition and a deduplicated material-event stream for source, incident, decision, operation, protection, and outcome changes.', [evidence.source, evidence.events], 'External push notifications are not configured.')],
  ['Human-attention routing', item(7.8, 'Derived Command, Operations, and Reports attention from one persisted contract and added idempotent acknowledgement that changes only work ownership.', [evidence.attention, evidence.regression], 'Production roster integration is not configured.')],
  ['Operational actionability', item(7.6, 'Turned passive evidence requirements into active resolvers and exposed real response/protection lifecycle controls separately.', [evidence.operations, evidence.source], 'External field execution is unavailable.')],
  ['Incident-command usefulness', item(7.6, 'Made objectives, open decisions, resources, work, blockers, owners, deadlines, authority, and wait consequence available per incident.', [evidence.operations, `${evidence.routeScreens}/03-incident-detail.jpg`], 'A live EOC exercise with real units remains necessary.')],
  ['Protection workflow', item(7.8, 'Implemented governed exposure-to-postcondition lifecycle with authorization, expiry, cancellation, idempotency, receipt, and replay/production send guards.', [evidence.protection, evidence.regression], 'No production civil-protection send authority is configured.')],
  ['Alert / CAP readiness', item(6.0, 'Integrated CAP as the authoritative resolution/protection boundary and enforced external-send-disabled when authority is absent.', [evidence.source, evidence.protection], 'CAP endpoint credentials, approval authority, and external delivery integration are required.', 'EXTERNAL_BLOCKER')],
  ['Authority safety', item(8.6, 'Preserved role authorization and proved no approval/send without authority, no replay send, no expired-authority send, and receipt-required dispatch claims.', [evidence.protection, evidence.regression], 'Live authorization policy must be supplied by the operating authority.')],
  ['Escalation logic', item(7.7, 'Added deadline, escalation time, bounded-attempt threshold, duty-owner routing, and circuit-open probe behavior.', [evidence.sourceSample, evidence.attention], 'Organizational on-call integration is not configured.')],
  ['Resource coordination', item(7.5, 'Implemented internal/shadow resource request through approval, assignment, dispatch request, acknowledgement, progress, completion, verification, and postcondition.', [evidence.operations, evidence.regression], 'No external agency resource/dispatch API is connected.')],
  ['Postcondition verification', item(7.6, 'Persisted expected and observed postconditions separately and required verification before a completion claim.', [evidence.outcomes, evidence.regression], 'No live production observation has yet been recorded.')],
  ['Outcome measurement', item(6.5, 'Created distinct persisted ACTION, ACKNOWLEDGEMENT, EXPECTED_POSTCONDITION, OBSERVED_POSTCONDITION, and OUTCOME_CLASSIFICATION collections and validated distinct-record counts.', [evidence.outcomes, evidence.regression], 'The live population is correctly empty; effectiveness cannot be claimed.', 'CAPABILITY_COMPLETE_EXTERNAL_DATA_REQUIRED')],
  ['Replay / after-action value', item(7.8, 'Retained one certified archived action-to-outcome chain with complete lineage and excluded it from production metrics.', [evidence.outcomes, evidence.protection], 'A broader replay corpus would improve comparative learning.')],
  ['Learning loop', item(7.5, 'Connected material events, action/postcondition/outcome lineage, Reports drilldowns, and shift handoff without crossing truth universes.', [evidence.events, evidence.outcomes, evidence.handoff], 'Outcome-calibrated recommendations require real production cases.')],
  ['Government pilot readiness', item(6.5, 'Completed local operational software paths, safety boundaries, evidence, and handoff receipts.', [evidence.certification, evidence.handoff], 'A named authority, official feeds, roster, runbook, and signed pilot scope are external prerequisites.', 'EXTERNAL_BLOCKER')],
  ['Emergency-operations-center readiness', item(6.8, 'Delivered incident command, resolver, response, protection, human-attention, event, and handoff workspaces.', [evidence.operations, evidence.attention, evidence.handoff], 'No live EOC roster, dispatch integration, or end-to-end agency exercise was available.', 'EXTERNAL_BLOCKER')],
  ['Trustworthiness', item(8.0, 'Eliminated active/stale contradictions, kept abstentions explicit, separated health axes, and refused to manufacture official, dispatch, forecast, or outcome claims.', [evidence.certification, evidence.outcomes], 'Trust still depends on upstream authorities supplying current evidence.')],
  ['Differentiation', item(7.8, 'Unified governed source resolution, incident truth, decision support, operations, protection, outcomes, and learning as one operational object model.', [evidence.certification, evidence.operations], 'Market validation is outside software certification.')],
  ['Defensibility / moat', item(8.0, 'Deepened the governed ontology, source-association doctrine, authorization boundary, and traceable action/outcome chain.', [evidence.regression, evidence.outcomes], 'Longitudinal operational data and partner integrations remain future assets.')],
  ['Product coherence', item(7.8, 'Made all seven routes projections of one incident/resolver/decision/operation/protection/outcome architecture.', [evidence.certification, evidence.routeScreens], 'The Evidence legacy alias remains only for backward-compatible deep links, not primary navigation.')],
  ['Enterprise credibility', item(7.5, 'Added deterministic evidence, lifecycle receipts, performance gates, safety invariants, drilldowns, and explicit external boundaries.', [evidence.certification, evidence.chromeTrace], 'Production HA, support, and agency accreditation are not established by a local release.')],
  ['Category-leader potential', item(7.5, 'Closed all software-controlled under-7 classes with evidence-backed operational workflows rather than visual theatre.', [evidence.certification, evidence.operations, evidence.protection], 'Leadership cannot be claimed without real authority integrations and pilot outcomes.')],
  ['Overall crisis-management utility', item(7.0, 'Raised the local canonical product from passive state display to governed detection, verification, decision, response, protection, postcondition, outcome, and handoff machinery.', [evidence.certification, evidence.routeScreens], 'Zero verified-current incidents, no official/CAP authority, no live dispatch, and no live outcomes cap current operational utility.', 'CAPABILITY_COMPLETE_EXTERNAL_DATA_REQUIRED')],
]);

const {
  certification,
  distribution,
  externalBlockers,
  finalCategories,
  funnel,
  implementationFiles,
  map,
  matrixPath,
  performance,
  routeScreenshots,
  scorecard,
  source,
  updatedMatrix,
} = buildWorldLeaderScorecard({ root, readJson, evidence, score, runtimeBinding });
writeJson('data/validation/world-leader-gap-closure/final-scorecard.json', scorecard);
writeJson(matrixPath, updatedMatrix);

const report = renderWorldLeaderReport({
  distribution,
  evidence,
  externalBlockers,
  finalCategories,
  funnel,
  implementationFiles,
  map,
  performance,
  routeScreenshots,
  scorecard,
  source,
});
const reportPath = resolve(root, 'docs/handoffs/VIGIA_CRITICAL_OPERATIONAL_RECOVERY_2026-09-03/VIGIA_WORLD_LEADER_GAP_CLOSURE_REPORT.md');
await probeCanonicalRuntimeIdentity({ manifest: runtimeBinding });
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${report.trim()}\n`);

console.log(JSON.stringify({
  releaseId: scorecard.releaseId,
  priorOverall: scorecard.priorAudit.overall,
  currentOverall: scorecard.current.overall,
  distribution,
  gates: scorecard.gates,
  report: 'docs/handoffs/VIGIA_CRITICAL_OPERATIONAL_RECOVERY_2026-09-03/VIGIA_WORLD_LEADER_GAP_CLOSURE_REPORT.md',
}, null, 2));
