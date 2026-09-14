import { semanticHash } from '../intelligence/shared.mjs';

export function materialChange({ type, entity, before = null, after = null, at, summary, whyItMatters, evidenceIds = [] }) {
  const core = { type, entity, before, after, timestamp: at, summary, whyItMatters, evidenceIds: [...new Set(evidenceIds)].sort() };
  return { ...core, id: semanticHash('operational-material-change', core) };
}

// Timer evaluation may run at a different wall clock on each refresh. Preserve
// one attention identity for the same evidence/health basis, not one per poll.
export function timerChange(change, basis) {
  const { id, timestamp, ...semantic } = change;
  return { ...change, id: semanticHash('operational-timer-change', { semantic, basis }), clockBasis: 'EVALUATION_TIME_NOT_OBSERVATION_TIME' };
}

export function assessmentChanges(previous, current, at) {
  const prior = previous?.assessment, next = current.assessment, entity = current.incident.id, changes = [];
  const add = (type, before, after, summary, whyItMatters, evidenceIds = next.evidenceIds) => changes.push(materialChange({ type, entity, before, after, at, summary, whyItMatters, evidenceIds }));
  const priorIds = new Set(previous?.activeEventIds ?? []);
  const added = current.activeEventIds.filter(id => !priorIds.has(id));
  if (added.length) add('new_observation', null, added, 'New attributable observation received.', 'Review its qualification; an arrival alone does not prove a fire.', added.map(id => `evidence:${id}`));
  if (!prior) return changes;
  if (prior.corroborationState !== next.corroborationState) add('corroboration_changed', prior.corroborationState, next.corroborationState,
    `Incident changed from ${prior.corroborationState} → ${next.corroborationState}.`, 'The independent evidence basis has changed.');
  if (prior.officialState !== next.officialState) add(next.officialState === 'QUALIFYING_OFFICIAL_EVIDENCE' ? 'official_confirmation_added' : 'official_confirmation_removed', prior.officialState, next.officialState,
    next.officialState === 'QUALIFYING_OFFICIAL_EVIDENCE' ? 'Qualifying official evidence arrived.' : 'Current official confirmation is no longer supported.', 'Re-evaluate the verification workflow; authority and dispatch remain separate.');
  if (prior.verificationState !== next.verificationState) add('verification_changed', prior.verificationState, next.verificationState, 'Evidence-contract assessment changed.', next.summary);
  if (prior.freshnessState !== next.freshnessState && next.freshnessState === 'STALE') add('evidence_became_stale', prior.freshnessState, next.freshnessState, 'Evidence exceeded its freshness window.', 'A fresh observation is required for a current claim.');
  if (prior.conflictState !== next.conflictState) add(next.conflictState === 'UNRESOLVED' ? 'conflict_detected' : 'conflict_resolved', prior.conflictState, next.conflictState, next.conflictState === 'UNRESOLVED' ? 'Attributable conflict detected.' : 'Blocking conflict resolved.', 'Review the evidence that changed the disagreement.', [...next.evidenceIds, ...next.conflictingEvidenceIds]);
  const geometry = item => item.evidenceGraph.observations.map(row => [row.sourceId, row.location]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (semanticHash('locations', geometry(previous)) !== semanticHash('locations', geometry(current))) add('geometry_changed', null, null, 'Observation-location context changed.', 'Review mapped evidence; observation coordinates are not a perimeter.');
  return changes;
}

export function sourceChanges(transitions) {
  const priorHealth = new Map();
  return transitions.filter(row => row.entityType === 'SOURCE' && row.from !== row.to).map(row => {
    const basis = priorHealth.get(row.sourceId) ?? [];
    priorHealth.set(row.sourceId, [...basis, ...row.causedByEventIds]);
    const change = materialChange({
    type: row.to === 'ACTIVE' ? 'source_recovered' : 'source_failed', entity: row.sourceId, before: row.from, after: row.to,
    at: row.at, summary: row.to === 'ACTIVE' ? 'Source service recovered.' : 'Source service is degraded or unavailable.',
    whyItMatters: 'Dependent assessments and work may need re-evaluation; service health is not incident confirmation.', evidenceIds: row.causedByEventIds,
    });
    return row.causedByEventIds.length ? change : timerChange(change,basis);
  });
}
