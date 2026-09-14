import { escapeHtml } from '../utils/html.js';
import { dateTime, number, relativeTime, statusLabel } from '../utils/format.js';

const ACTIVE_REPORT_STATES = new Set(['current', 'delayed']);

function reportState(event) {
  const value = event?.reportState?.sourceActivity ?? 'no_report';
  if (value === 'current') return { label: 'Current public report', tone: 'report' };
  if (value === 'delayed') return { label: 'Delayed public report', tone: 'waiting' };
  if (value === 'stale_open') return { label: 'Stale open report', tone: 'waiting' };
  if (value === 'closed') return { label: 'Closed report', tone: 'quiet' };
  return { label: 'No public report', tone: 'quiet' };
}

function physicalState(event) {
  const value = event?.physicalState?.freshness ?? 'unobserved';
  if (value === 'current') return { label: 'Current physical evidence', tone: 'physical' };
  if (value === 'delayed') return { label: 'Delayed physical evidence', tone: 'waiting' };
  if (value === 'stale') return { label: 'Stale physical evidence', tone: 'quiet' };
  return { label: 'No associated physical evidence', tone: 'quiet' };
}

function sourceFamilies(event) {
  const values = event?.physicalSourceProfile?.families
    ?? event?.fireEvidenceState?.physicalSourceFamilies
    ?? [];
  return values.map((value) => value === 'viirs' ? 'VIIRS' : value === 'sentinel3_slstr' ? 'Sentinel-3 / SLSTR' : statusLabel(value));
}

function observationTimes(event) {
  const observations = (event?.observations ?? []).filter((item) => item.type === 'thermal');
  const values = observations.map((item) => item.at ?? item.observedAt).filter((value) => Number.isFinite(Date.parse(value))).sort((a, b) => Date.parse(a) - Date.parse(b));
  const candidates = [
    ...values,
    event?.leadTime?.firstThermalAt,
    event?.physicalState?.firstAt,
    event?.physicalState?.lastAt,
    event?.evidenceState === 'reported' ? null : event?.firstSeenAt,
    event?.evidenceState === 'reported' ? null : event?.lastSeenAt
  ].filter((value) => Number.isFinite(Date.parse(value))).sort((a, b) => Date.parse(a) - Date.parse(b));
  const first = candidates[0] ?? null;
  const latest = candidates.at(-1) ?? null;
  return { first, latest, count: Math.max(values.length, Number(event?.physicalSourceProfile?.observationCount ?? 0)) };
}

function decisionFor(event) {
  const physical = event?.physicalState?.freshness;
  const report = event?.reportState?.sourceActivity;
  const noReport = !ACTIVE_REPORT_STATES.has(report) && !event?.reportState?.firstAt;
  if (physical === 'current' && noReport) return {
    label: 'INVESTIGATE PHYSICAL-FIRST SIGNAL NOW', tone: 'physical',
    reason: 'Current point-level physical evidence exists without a current public report. Treat it as an investigation priority, not a verified public incident.'
  };
  if (physical === 'current') return {
    label: 'MAINTAIN ACTIVE PHYSICAL WATCH', tone: 'physical',
    reason: 'Current point-level evidence and a public report are both present. Continue bounded source monitoring and preserve every transition.'
  };
  if (report === 'current') return {
    label: 'CORROBORATE REPORT BEFORE PHYSICAL CLAIM', tone: 'report',
    reason: 'A current public report exists without current point-level physical corroboration. Do not infer current fire behavior.'
  };
  if (['delayed', 'stale'].includes(physical) && noReport) return {
    label: 'RETAIN AS HISTORICAL PHYSICAL CANDIDATE', tone: 'waiting',
    reason: 'Attributable physical evidence is retained, but it is outside the current-action freshness window and has no public report.'
  };
  return {
    label: 'PRESERVE EVIDENCE · CURRENT STATE UNKNOWN', tone: 'quiet',
    reason: 'No evidence combination supports a current physical-fire claim at this governed clock.'
  };
}

function measuredTime(value, fallback = 'Not observed') {
  return Number.isFinite(Date.parse(value)) ? dateTime(value) : fallback;
}

function timelineRows(event, incidentOperations) {
  const times = observationTimes(event);
  const firstReport = event?.reportState?.firstAt ?? event?.leadTime?.firstReportAt;
  const alerts = incidentOperations?.alerts ?? [];
  const firstAlert = [...alerts].map((item) => item.openedAt ?? item.createdAt).filter((value) => Number.isFinite(Date.parse(value))).sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  return [
    ['First physical', times.first, times.first ? `${number(times.count)} attributable observation${times.count === 1 ? '' : 's'}` : 'No associated point observation'],
    ['Canonical event', event?.firstSeenAt, event?.id ?? 'Identity unavailable'],
    ['First public report', firstReport, firstReport ? (event?.leadTime?.thermalBeforeReport ? `${number(event.leadTime.minutes)} min after first physical` : 'Report-first or simultaneous') : 'No public report'],
    ['First operational alert', firstAlert, incidentOperations ? (firstAlert ? 'Persisted alert lifecycle' : 'No qualifying alert at this clock') : 'Operations dependency unavailable']
  ];
}

export function incidentDecisionLedger(state, event) {
  const decision = decisionFor(event);
  const report = reportState(event);
  const physical = physicalState(event);
  const families = sourceFamilies(event);
  const times = observationTimes(event);
  const operations = state.incidentOperations?.incident?.id === event.id ? state.incidentOperations : null;
  const policy = event?.candidateAssessment?.policyVersion ?? event?.candidateAssessment?.detectorVersion ?? event?.detectorVersion ?? 'Not exposed in this projection';
  const association = event?.association?.state ?? event?.associationState ?? (families.length ? 'retained' : 'unresolved');
  const uncertainty = [
    event?.actionNeed?.reason,
    !families.length ? 'No point-level physical source family is associated.' : null,
    !event?.reportState?.firstAt && !event?.leadTime?.firstReportAt ? 'No public report is associated.' : null,
    event?.behaviorState === 'unknown' ? 'Current fire behavior is unmeasured.' : null
  ].filter(Boolean);
  return `<section class="decision-ledger" aria-label="Incident Decision Ledger">
    <header><div><span>INCIDENT DECISION LEDGER · ${escapeHtml(event.id)}</span><h3>${escapeHtml(decision.label)}</h3></div><strong class="is-${decision.tone}">${escapeHtml(physical.label)}</strong></header>
    <p class="decision-rationale">${escapeHtml(decision.reason)}</p>
    <div class="decision-state-grid">
      <article><span>PHYSICAL</span><strong>${escapeHtml(physical.label)}</strong><small>${escapeHtml(times.latest ? `${relativeTime(times.latest)} · ${families.join(' + ') || 'family unavailable'}` : 'No attributable timestamp')}</small></article>
      <article><span>REPORT</span><strong>${escapeHtml(report.label)}</strong><small>${escapeHtml(event.reportState?.lastAt ? relativeTime(event.reportState.lastAt) : 'No report timestamp')}</small></article>
      <article><span>ASSOCIATION</span><strong>${escapeHtml(statusLabel(association))}</strong><small>${families.length ? `${families.length} physical ${families.length === 1 ? 'family' : 'families'}` : 'No physical family attached'}</small></article>
      <article><span>DECISION POLICY</span><strong>${escapeHtml(policy)}</strong><small>${escapeHtml(event.candidateAssessment?.decisionReason ?? 'Versioned decision detail is preserved in provenance when available.')}</small></article>
    </div>
    <div class="decision-timeline" aria-label="Decision chronology">${timelineRows(event, operations).map(([label, at, detail]) => `<article><i></i><span>${escapeHtml(label)}</span><strong>${escapeHtml(measuredTime(at))}</strong><small>${escapeHtml(detail)}</small></article>`).join('')}</div>
    <details class="decision-uncertainty"><summary>Uncertainty and decision limits · ${uncertainty.length}</summary><ul>${uncertainty.map((item) => `<li>${escapeHtml(item)}</li>`).join('') || '<li>No additional uncertainty statement is present in the event projection.</li>'}</ul></details>
  </section>`;
}

function bestEvidenceRoute(state, event) {
  const need = event?.evidenceNeed ?? state.bootstrap?.operations?.evidenceNeeds?.find((item) => String(item.subjectId) === String(event?.id) && item.state !== 'RESOLVED');
  const method = need?.candidateMethods?.find((item) => ['AVAILABLE_NOW', 'SCHEDULED_CONFIRMED'].includes(item.availability)) ?? need?.candidateMethods?.[0];
  if (method?.label) return method.label;
  if (need?.state === 'FIELD_CAPACITY_NOT_CONFIGURED') return 'Field capacity is not configured; continue attributable remote-source checks.';
  if (need?.state === 'NO_AVAILABLE_OBSERVATION') return 'No feasible observation path is currently known.';
  if (need?.state === 'REQUEST_ACTIVE') return need.ownerId ? 'An attributable evidence request is in progress.' : 'Assign an owner to the evidence request.';
  return event?.actionNeed?.needsRouting ? 'Re-check governed physical sources and association candidates.' : 'Continue monitoring; no unresolved evidence need is currently routed.';
}

export function autonomousEvidenceClosure(state, event) {
  const system = state.bootstrap?.operations?.systemActionability ?? {};
  const operations = state.incidentOperations?.incident?.id === event.id ? state.incidentOperations : null;
  const need = event?.evidenceNeed ?? operations?.evidenceNeeds?.find((item) => item.state !== 'RESOLVED');
  const resultCount = operations?.observationOpportunityResults?.length;
  const completed = system.systemCompleted;
  const producing = system.evidenceProducing;
  const closed = system.unknownsClosed;
  const unavailable = Boolean(state.incidentOperationsError || state.operationsState === 'unavailable');
  return `<section class="evidence-closure-console ${unavailable ? 'is-degraded' : ''}" aria-label="Autonomous evidence closure">
    <header><div><span>AUTONOMOUS EVIDENCE CLOSURE</span><strong>${need ? escapeHtml(statusLabel(need.state)) : 'NO ROUTED UNKNOWN'}</strong></div><b>${unavailable ? 'PERSISTENCE DEGRADED' : 'BOUNDED AUTOMATION'}</b></header>
    <div class="closure-flow"><article><span>UNKNOWN</span><strong>${escapeHtml(need?.missingQuantity ? statusLabel(need.missingQuantity) : 'No active unknown')}</strong></article><i>→</i><article><span>BEST EVIDENCE ROUTE</span><strong>${escapeHtml(bestEvidenceRoute(state, event))}</strong></article><i>→</i><article><span>CLOSURE RULE</span><strong>Recompute event truth from attributable evidence</strong></article></div>
    <footer><span>SYSTEM COMPLETED <b>${completed ?? 'UNMEASURED'}</b></span><span>EVIDENCE-PRODUCING <b>${producing ?? 'UNMEASURED'}</b></span><span>UNKNOWNS CLOSED <b>${closed ?? 'UNMEASURED'}</b></span><span>THIS INCIDENT RESULTS <b>${resultCount ?? 'UNAVAILABLE'}</b></span></footer>
    <p>${unavailable ? 'PostGIS-backed lifecycle state is unavailable. VIGIA continues independent physical sensing but makes no alert, opportunity-result or closure claim.' : 'Automation may re-check sources, evaluate associations and ingest attributable results. Human review and field work remain explicit separate lanes.'}</p>
  </section>`;
}

function sourceCoverage(source, detected) {
  const state = source?.state ?? 'unavailable';
  const label = state === 'current' ? 'CURRENT' : state === 'stale' ? 'DELAYED' : state === 'empty' ? 'NO POSITIVE FRP' : 'UNAVAILABLE';
  return { label, tone: state === 'current' ? 'current' : ['stale', 'empty'].includes(state) ? 'waiting' : 'unavailable', detected: detected ? 'Associated point evidence' : 'No associated point evidence' };
}

export function coverageIntelligence(state, event) {
  const operations = state.incidentOperations?.incident?.id === event.id ? state.incidentOperations : null;
  const opportunities = operations?.observationOpportunities ?? [];
  const assets = operations?.territoryContext?.assets ?? [];
  const next = [...opportunities].filter((item) => Number.isFinite(Date.parse(item.windowStart)) && Date.parse(item.windowStart) >= Date.now()).sort((a, b) => Date.parse(a.windowStart) - Date.parse(b.windowStart))[0];
  const viirs = sourceCoverage(state.live?.sources?.firms ?? state.bootstrap?.sources?.firms, event.sensorCoverage?.viirs?.pointDetection);
  const sentinel = sourceCoverage(state.live?.sources?.sentinel3Pixels ?? state.bootstrap?.sources?.sentinel3Pixels, event.sensorCoverage?.sentinel3?.pointDetection);
  const unavailable = !operations && Boolean(state.incidentOperationsError);
  return `<section class="coverage-intelligence ${unavailable ? 'is-degraded' : ''}" aria-label="Coverage intelligence">
    <header><div><span>COVERAGE INTELLIGENCE</span><strong>What can observe this incident next?</strong></div><button type="button" data-action="sources">Source health</button></header>
    <div class="coverage-source-grid">
      <article class="is-${viirs.tone}"><span>VIIRS</span><strong>${escapeHtml(viirs.label)}</strong><small>${escapeHtml(viirs.detected)}</small></article>
      <article class="is-${sentinel.tone}"><span>SENTINEL-3 / SLSTR</span><strong>${escapeHtml(sentinel.label)}</strong><small>${escapeHtml(sentinel.detected)}</small></article>
      <article class="${unavailable ? 'is-unavailable' : ''}"><span>NEXT GOVERNED WINDOW</span><strong>${unavailable ? 'UNAVAILABLE' : next ? escapeHtml(dateTime(next.windowStart)) : 'NO CONFIRMED WINDOW'}</strong><small>${unavailable ? 'Operations persistence offline' : next ? escapeHtml(next.sourceFamily ?? next.platform ?? 'Source family unavailable') : 'Poll cadence is not presented as an orbital pass'}</small></article>
      <article class="${unavailable ? 'is-unavailable' : ''}"><span>MONITORED CONTEXT</span><strong>${unavailable ? 'UNAVAILABLE' : `${number(assets.length)} NEARBY ASSETS`}</strong><small>${unavailable ? 'No zero-asset claim inferred' : 'Reference assets with retained provenance; not connected devices'}</small></article>
    </div>
    <p>${unavailable ? 'Coverage opportunities and monitored-asset proximity could not be read. Physical evidence and source timestamps remain independently available.' : `${number(opportunities.length)} governed observation opportunities are attached to this incident. Opportunity means a bounded chance to observe, never a promised detection.`}</p>
  </section>`;
}
