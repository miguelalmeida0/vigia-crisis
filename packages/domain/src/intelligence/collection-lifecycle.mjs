import {hash} from './world-knowledge.mjs';
import {LIFECYCLE_STATES} from './information-requirements.mjs';

// Requirements are durable objects, not a list regenerated from nothing on every
// read. Reconciliation answers three questions deterministically:
//
//   * Is this the same requirement we already had?   -> identity, never similarity
//   * Did the world answer it?                        -> RESOLVED, with what closed it
//   * Did a previously accepted answer go stale?      -> reopened as a NEW VERSION,
//                                                        never by rewriting history
//
// A resolved requirement keeps its resolution. If the same fact goes stale later,
// a new version is opened with an explicit `reopenedFrom` link, so "we learned
// this and then lost it" stays legible and no historical record is edited.

const OPEN_STATES = new Set(['OPEN', 'QUEUED', 'IN_PROGRESS', 'BLOCKED']);

const stateOf = (row) => row?.lifecycle?.state ?? 'OPEN';

function transition(previous, next, {at, reason}) {
  return {
    ...next,
    lifecycle: {
      state: next.lifecycle.state,
      version: previous?.lifecycle?.version ?? 1,
      openedAt: previous?.lifecycle?.openedAt ?? at,
      updatedAt: at,
      closedAt: next.lifecycle.state === 'RESOLVED' || next.lifecycle.state === 'EXPIRED' ? at : null,
      reason: reason ?? next.lifecycle.reason ?? null,
      reopenedFrom: previous?.lifecycle?.reopenedFrom ?? null
    }
  };
}

/**
 * Reconciles a freshly generated requirement set against the retained one.
 *
 * `retained` is the previously stored set (any array of requirement records).
 * `generated` is the requirement set derived from the current knowledge state.
 */
export function reconcileRequirements({retained = [], generated = [], at = new Date().toISOString(), expiryMs = 7 * 24 * 3600_000} = {}) {
  const retainedById = new Map((retained ?? []).map((row) => [row.id, row]));
  const generatedById = new Map((generated ?? []).map((row) => [row.id, row]));
  const rows = [];
  const events = [];

  for (const [id, next] of generatedById) {
    const previous = retainedById.get(id);
    if (!previous) {
      rows.push(transition(null, {...next, lifecycle: {...next.lifecycle, state: 'OPEN'}}, {at, reason: 'REQUIREMENT_OPENED'}));
      events.push({kind: 'REQUIREMENT_OPENED', requirementId: id, at, requirementClass: next.requirementClass, subject: next.subject});
      continue;
    }
    if (stateOf(previous) === 'RESOLVED') {
      // The fact was answered before and the gap has reappeared. That is new
      // knowledge about staleness, recorded as a new version rather than an edit.
      const version = (previous.lifecycle.version ?? 1) + 1;
      rows.push({
        ...next,
        lifecycle: {
          state: 'OPEN', version, openedAt: at, updatedAt: at, closedAt: null,
          reason: 'REOPENED_AFTER_PREVIOUSLY_RESOLVED_FACT_BECAME_STALE',
          reopenedFrom: {version: previous.lifecycle.version ?? 1, resolvedAt: previous.lifecycle.closedAt ?? null, resolvedBy: previous.lifecycle.resolvedBy ?? null}
        }
      });
      events.push({kind: 'REQUIREMENT_REOPENED', requirementId: id, at, version, requirementClass: next.requirementClass, subject: next.subject, previousVersion: previous.lifecycle.version ?? 1});
      continue;
    }
    // Still open: carry the lifecycle forward and refresh the measured impact.
    rows.push(transition(previous, {...next, lifecycle: {...previous.lifecycle, state: stateOf(previous)}}, {at, reason: previous.lifecycle?.reason ?? null}));
    const impactChanged = hash([previous.affected, previous.currentKnownState]) !== hash([next.affected, next.currentKnownState]);
    if (impactChanged) events.push({kind: 'REQUIREMENT_IMPACT_CHANGED', requirementId: id, at, requirementClass: next.requirementClass, subject: next.subject, previous: {communityCount: previous.affected?.communityCount ?? 0, supportRelationshipCount: previous.affected?.supportRelationshipCount ?? 0}, current: {communityCount: next.affected.communityCount, supportRelationshipCount: next.affected.supportRelationshipCount}});
  }

  for (const [id, previous] of retainedById) {
    if (generatedById.has(id)) continue;
    if (stateOf(previous) === 'RESOLVED' || stateOf(previous) === 'EXPIRED') { rows.push(previous); continue; }
    // The requirement is no longer generated. Either the fact was answered, or
    // the subject left the retained set. Those are different conclusions and are
    // recorded as different states.
    const ageMs = Date.parse(at) - Date.parse(previous.lifecycle?.openedAt ?? at);
    if (Number.isFinite(ageMs) && ageMs > expiryMs) {
      rows.push({...previous, lifecycle: {...previous.lifecycle, state: 'EXPIRED', updatedAt: at, closedAt: at, reason: 'EXPIRED_WITHOUT_RESOLUTION'}});
      events.push({kind: 'REQUIREMENT_EXPIRED', requirementId: id, at, requirementClass: previous.requirementClass, subject: previous.subject});
      continue;
    }
    rows.push({...previous, lifecycle: {...previous.lifecycle, state: 'RESOLVED', updatedAt: at, closedAt: at, reason: 'NO_LONGER_GENERATED_FROM_THE_RETAINED_KNOWLEDGE_STATE', resolvedBy: 'ACCEPTED_FACT_OR_SUBJECT_LEFT_RETAINED_SET'}});
    events.push({kind: 'REQUIREMENT_RESOLVED', requirementId: id, at, requirementClass: previous.requirementClass, subject: previous.subject, affected: {communityCount: previous.affected?.communityCount ?? 0, supportRelationshipCount: previous.affected?.supportRelationshipCount ?? 0}});
  }

  const ordered = rows.sort((left, right) => left.id.localeCompare(right.id));
  return Object.freeze({
    schemaVersion: 'vigia.requirement-lifecycle.v1',
    at,
    lifecycleStates: LIFECYCLE_STATES,
    requirements: ordered,
    open: ordered.filter((row) => OPEN_STATES.has(stateOf(row))).length,
    resolved: ordered.filter((row) => stateOf(row) === 'RESOLVED').length,
    expired: ordered.filter((row) => stateOf(row) === 'EXPIRED').length,
    events: events.sort((left, right) => left.requirementId.localeCompare(right.requirementId)),
    limitation: 'A requirement leaves the open set when it stops being generated from the retained knowledge state. That is consistent with the fact having been accepted, and it is not by itself proof that the fact is now known.'
  });
}

/** Explicit operator-driven lifecycle moves. Only these transitions are allowed. */
const ALLOWED_MOVES = Object.freeze({
  OPEN: ['QUEUED', 'IN_PROGRESS', 'BLOCKED'],
  QUEUED: ['IN_PROGRESS', 'BLOCKED', 'OPEN'],
  IN_PROGRESS: ['BLOCKED', 'OPEN'],
  BLOCKED: ['OPEN', 'QUEUED'],
  RESOLVED: [],
  EXPIRED: []
});

export function moveRequirement(requirement, nextState, {at = new Date().toISOString(), reason = null} = {}) {
  const current = stateOf(requirement);
  if (!LIFECYCLE_STATES.includes(nextState)) throw Object.assign(new Error('requirement_lifecycle_state_invalid'), {statusCode: 400});
  if (!ALLOWED_MOVES[current]?.includes(nextState)) throw Object.assign(new Error(`requirement_lifecycle_transition_forbidden:${current}->${nextState}`), {statusCode: 409});
  return {...requirement, lifecycle: {...requirement.lifecycle, state: nextState, updatedAt: at, reason}};
}
