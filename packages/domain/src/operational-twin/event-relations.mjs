import { immutable } from '../intelligence/shared.mjs';

export function visibleEvents(events = [], asOf) {
  const limit = Date.parse(asOf);
  if (!Number.isFinite(limit)) throw new Error('valid_twin_as_of_required');
  return [...events].filter((event) => {
    const clocks = event.clocks ?? {};
    const instants = [clocks.ingestedAt, clocks.observedAt, clocks.occurredAt].map((value) => Date.parse(value ?? ''));
    return instants.every((value) => Number.isFinite(value) && value <= limit);
  })
    .sort((left, right) => Number(left.journalSequence ?? 0) - Number(right.journalSequence ?? 0)
      || Date.parse(left.clocks.ingestedAt) - Date.parse(right.clocks.ingestedAt) || left.id.localeCompare(right.id));
}

export function createRelationState() {
  return { byId: new Map(), activeIds: new Set(), statusById: new Map(), pendingByTarget: new Map(), childrenByTarget: new Map(), failures: [] };
}

function child(state, targetId, eventId) {
  const children = state.childrenByTarget.get(targetId) ?? [];
  if (!children.includes(eventId)) children.push(eventId);
  state.childrenByTarget.set(targetId, children);
  if (children.length > 1) state.failures.push({ code: 'COMPETING_AMENDMENTS', targetEventId: targetId, amendmentEventIds: [...children].sort() });
}

function applyAmendment(state, event, onApplied) {
  const target = state.byId.get(event.targetEventId);
  if (!target) {
    const pending = state.pendingByTarget.get(event.targetEventId) ?? []; pending.push(event); state.pendingByTarget.set(event.targetEventId, pending);
    state.statusById.set(event.id, { state: 'DEFERRED', targetEventId: event.targetEventId });
    return;
  }
  child(state, target.id, event.id); state.activeIds.delete(target.id);
  state.statusById.set(target.id, { state: event.action === 'CANCEL' ? 'CANCELLED' : 'SUPERSEDED', byEventId: event.id });
  if (event.action === 'CANCEL') state.statusById.set(event.id, { state: 'APPLIED_CANCELLATION', targetEventId: target.id });
  else { state.activeIds.add(event.id); state.statusById.set(event.id, { state: 'ACTIVE_AMENDMENT', targetEventId: target.id }); }
  onApplied?.(event, target);
  const waiting = state.pendingByTarget.get(event.id) ?? [];
  if (waiting.length) { state.pendingByTarget.delete(event.id); for (const amendment of waiting) applyAmendment(state, amendment, onApplied); }
}

export function applyRelationEvent(state, event, onApplied) {
  if (state.byId.has(event.id)) return { state: 'DUPLICATE' };
  state.byId.set(event.id, event);
  if (event.action === 'CREATE') {
    state.activeIds.add(event.id); state.statusById.set(event.id, { state: 'ACTIVE' }); onApplied?.(event, null);
    const waiting = state.pendingByTarget.get(event.id) ?? [];
    if (waiting.length) { state.pendingByTarget.delete(event.id); for (const amendment of waiting) applyAmendment(state, amendment, onApplied); }
  } else applyAmendment(state, event, onApplied);
  return state.statusById.get(event.id);
}

export function relationProjection(state) {
  for (const [targetEventId, pending] of state.pendingByTarget) for (const event of pending) {
    if (!state.failures.some((item) => item.code === 'MISSING_AMENDMENT_TARGET' && item.eventId === event.id)) state.failures.push({ code: 'MISSING_AMENDMENT_TARGET', eventId: event.id, targetEventId });
  }
  const history = [...state.byId.values()].map((event) => ({ eventId: event.id, action: event.action, targetEventId: event.targetEventId, ...(state.statusById.get(event.id) ?? { state: 'UNKNOWN' }) }))
    .sort((left, right) => left.eventId.localeCompare(right.eventId));
  return immutable({ activeEventIds: [...state.activeIds].sort(), history, failures: state.failures });
}
