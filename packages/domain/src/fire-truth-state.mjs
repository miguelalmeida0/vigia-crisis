import { createHash } from 'node:crypto';

function id(value) { return `fire-truth:${createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32)}`; }
function iso(value) { const date = new Date(value); if (!Number.isFinite(date.getTime())) throw new Error('valid_time_required'); return date.toISOString(); }
function families(event) { return [...new Set(event.physicalSourceProfile?.families ?? (event.observations ?? []).map((item) => item.sourceFamily).filter(Boolean))]; }

export function createFireTruthState({ event = {}, closurePlan = null, coverage = null, nextBestEvidence = null, evidenceRace = null, sourceStates = {}, now = new Date() } = {}) {
  if (!event.id) throw new Error('event_id_required');
  const computedAt = iso(now), physicalFamilies = families(event), reportPresent = Boolean(event.reportState?.firstAt), latestPhysicalAt = event.physicalState?.lastAt ?? event.physicalState?.lastObservedAt ?? event.lastSeenAt ?? null;
  const unknowns = [];
  if (physicalFamilies.length < 2) unknowns.push({ code: 'INDEPENDENT_PHYSICAL_CORROBORATION', state: closurePlan?.resolutionState === 'PRESERVED' ? 'PRESERVED' : 'OPEN', reason: closurePlan?.resultReason ?? 'Only one independent physical source family is attributable.' });
  if (!reportPresent) unknowns.push({ code: 'OFFICIAL_OR_FIELD_REPORT', state: 'OPEN', reason: 'No attributable report is linked.' });
  if (!event.observedGeometry?.geometry && !event.geometry?.type) unknowns.push({ code: 'AUTHORITATIVE_FIRE_PERIMETER', state: 'OPEN', reason: 'Thermal support is not an authoritative fire perimeter.' });
  if (!event.behaviorState || event.behaviorState === 'unknown') unknowns.push({ code: 'CURRENT_FIRE_BEHAVIOR', state: 'OPEN', reason: 'Current behavior is not physically resolved.' });
  const contradictions = [];
  if (physicalFamilies.length && event.reportState?.sourceActivity === 'no_report') contradictions.push({ code: 'PHYSICAL_WITHOUT_REPORT', severity: 'INFORMATION_GAP', physicalAt: latestPhysicalAt });
  if (event.associationState === 'ambiguous' || event.evidenceState === 'association-uncertain') contradictions.push({ code: 'ASSOCIATION_AMBIGUOUS', severity: 'MATERIAL' });
  const coverageGaps = coverage?.gaps ?? [], failedSources = Object.entries(sourceStates).filter(([, value]) => ['unavailable', 'error'].includes(String(value?.state).toLowerCase())).map(([sourceFamily, value]) => ({ sourceFamily, state: value.state, errorPresent: Boolean(value.error) }));
  const blindness = { coverageGaps, failedSources, areaCoveragePercent: null, areaCoverageQualification: 'No area percentage is asserted for a point event without authoritative comparable area and swath polygons.', currentPointCoverage: coverage?.forecasts?.find((item) => item.horizon === 'NOW') ?? null };
  const confirmationState = physicalFamilies.length >= 2 ? 'MULTISOURCE_PHYSICAL_CORROBORATION' : physicalFamilies.length === 1 ? 'SINGLE_SOURCE_PHYSICAL_EVIDENCE' : reportPresent ? 'REPORT_ONLY' : 'UNOBSERVED';
  const evidenceVersion = closurePlan?.currentEvidenceVersion ?? `event:${event.id}:${latestPhysicalAt ?? computedAt}`;
  const state = { schemaVersion: 'vigia.fire-truth-state.v1', id: id({ eventId: event.id, evidenceVersion }), eventId: String(event.id), evidenceVersion, computedAt,
    physicalTruth: { confirmationState, families: physicalFamilies, independentFamilyCount: physicalFamilies.length, latestPhysicalAt, freshness: event.physicalState?.freshness ?? null, observed: physicalFamilies.length > 0 },
    reportTruth: { present: reportPresent, firstAt: event.reportState?.firstAt ?? null, lastAt: event.reportState?.lastAt ?? null, state: event.reportState?.sourceActivity ?? (reportPresent ? 'report_present' : 'no_report') },
    contradictions, unknowns, blindness, evidenceClosure: closurePlan ? { planId: closurePlan.id, lifecycleState: closurePlan.lifecycleState, resolutionState: closurePlan.resolutionState, resultState: closurePlan.resultState, resultReason: closurePlan.resultReason } : null,
    nextBestEvidence, evidenceRace, action: nextBestEvidence?.selected ? { kind: nextBestEvidence.selected.blockerReason ? 'RESOLVE_EVIDENCE_PATH_BLOCKER' : 'ACQUIRE_NEXT_BEST_EVIDENCE', pathId: nextBestEvidence.selected.id, sourceFamily: nextBestEvidence.selected.sourceFamily, blockerReason: nextBestEvidence.selected.blockerReason, reason: unknowns[0]?.code ?? 'INCREASE_PHYSICAL_TRUTH_DEPTH' } : { kind: 'MONITOR', reason: unknowns.length ? 'NO_EXECUTABLE_EVIDENCE_PATH' : 'TRUTH_STATE_HAS_NO_OPEN_CLOSURE_UNKNOWN' },
    notice: 'Physical observations, reports, contradictions, unknowns and sensor blindness remain separate. This state does not assert containment, perimeter, cause, emergency status or calibrated fire probability.' };
  return Object.freeze(state);
}
