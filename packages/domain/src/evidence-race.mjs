import { createHash } from 'node:crypto';

function id(prefix, value) { return `${prefix}:${createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32)}`; }
function at(value) { const date = new Date(value); if (!Number.isFinite(date.getTime())) throw new Error('valid_time_required'); return date.toISOString(); }

export function createEvidenceRace({ eventId, truthStateId, decision, createdAt = new Date() } = {}) {
  if (!eventId || !truthStateId || !decision?.options?.length) throw new Error('evidence_race_identity_required');
  const startedAt = at(createdAt), stable = { eventId, truthStateId, decisionId: decision.id };
  const paths = decision.options.map((option) => ({ ...option, raceState: option.blockerReason ? 'BLOCKED' : 'RUNNING', startedAt, completedAt: null, cancelledAt: null, outcome: null }));
  return Object.freeze({ id: id('evidence-race', stable), eventId: String(eventId), truthStateId: String(truthStateId), decisionId: decision.id, state: paths.some((item) => item.raceState === 'RUNNING') ? 'RUNNING' : 'BLOCKED', winnerPathId: null, startedAt, settledAt: null, paths,
    history: [{ state: 'RACE_CREATED', at: startedAt, reasonCode: 'MULTIPLE_EVIDENCE_PATHS_EVALUATED' }, ...paths.filter((item) => item.raceState === 'RUNNING').map((item) => ({ state: 'PATH_STARTED', pathId: item.id, at: startedAt, reasonCode: item.opportunityType }))] });
}

export function settleEvidenceRace(race, { sourceFamily, opportunityId = null, outcome = 'CORROBORATED', attributableObservationId, settledAt = new Date() } = {}) {
  if (!attributableObservationId) throw new Error('attributable_observation_required');
  const when = at(settledAt), winner = race.paths.find((item) => (!opportunityId || item.opportunityId === opportunityId) && item.sourceFamily === sourceFamily && item.raceState === 'RUNNING') ?? race.paths.find((item) => item.sourceFamily === sourceFamily);
  if (!winner) return race;
  const paths = race.paths.map((item) => item.id === winner.id ? { ...item, raceState: 'WON', completedAt: when, outcome, attributableObservationId } : item.raceState === 'RUNNING' ? { ...item, raceState: 'CANCELLED', cancelledAt: when, outcome: 'SUPERSEDED_BY_ATTRIBUTABLE_EVIDENCE', cancelledByPathId: winner.id } : item);
  const cancellations = paths.filter((item) => item.raceState === 'CANCELLED').map((item) => ({ state: 'PATH_CANCELLED', pathId: item.id, at: when, reasonCode: 'WINNER_SATISFIED_CLOSURE_CONTRACT' }));
  return Object.freeze({ ...race, state: 'SETTLED', winnerPathId: winner.id, settledAt: when, paths,
    history: [...race.history, { state: 'PATH_WON', pathId: winner.id, at: when, reasonCode: outcome, attributableObservationId }, ...cancellations, { state: 'RACE_SETTLED', at: when, reasonCode: outcome }] });
}
