const STATES = Object.freeze([
  'queued',
  'assigned',
  'in_progress',
  'awaiting_reobservation',
  'verified',
  'closed'
]);

const TRANSITIONS = Object.freeze({
  queued: new Set(['assigned', 'closed']),
  assigned: new Set(['queued', 'in_progress', 'closed']),
  in_progress: new Set(['assigned', 'awaiting_reobservation', 'closed']),
  awaiting_reobservation: new Set(['in_progress', 'verified', 'closed']),
  verified: new Set(['in_progress', 'closed']),
  closed: new Set([])
});

function assertState(state) {
  if (!STATES.includes(state)) throw new Error(`invalid_intervention_state:${state}`);
}

export function createIntervention({
  id,
  targetType,
  targetId,
  title,
  recommendation = '',
  priority = 'elevated',
  coordinate = null,
  createdAt = new Date().toISOString(),
  actor = 'local-operator'
}) {
  return {
    id,
    targetType,
    targetId,
    title,
    recommendation,
    priority,
    coordinate,
    state: 'queued',
    assignee: null,
    createdAt,
    updatedAt: createdAt,
    events: [{ id: `${id}:0`, from: null, to: 'queued', at: createdAt, actor, reason: 'created' }]
  };
}

export function canTransitionIntervention(from, to) {
  return Boolean(TRANSITIONS[from]?.has(to));
}

export function transitionIntervention(record, to, {
  actor = 'local-operator',
  reason = 'operator_transition',
  at = new Date().toISOString(),
  patch = {}
} = {}) {
  assertState(to);
  if (!canTransitionIntervention(record.state, to)) {
    throw new Error(`invalid_intervention_transition:${record.state}->${to}`);
  }
  return {
    ...record,
    ...patch,
    state: to,
    updatedAt: at,
    events: [
      ...(record.events ?? []),
      { id: `${record.id}:${record.events?.length ?? 0}`, from: record.state, to, at, actor, reason }
    ]
  };
}

export { STATES as INTERVENTION_STATES };
