import {clockOf, iso, ms, transitBetween} from './operational-period.mjs';
import {sequentialTransition} from './assignment-window.mjs';

// GLOBAL FEASIBILITY.
//
// The failure this layer exists to catch: every assignment passes on its own,
// and the plan is still impossible, because the same unit is required in two
// places at once. VIGIA XII checks one pairing at a time and cannot see it.
//
// Eight checks, each naming what it found. The verdict combines them with the
// same discipline used everywhere in VIGIA: any hard violation makes the plan
// infeasible; otherwise any unresolved fact makes it unknown; only a plan with
// neither is feasible.

export const PLAN_STATES = Object.freeze(['GLOBALLY_FEASIBLE', 'GLOBALLY_INFEASIBLE', 'UNKNOWN']);
export const VIOLATION_KINDS = Object.freeze([
  'DOUBLE_BOOKING', 'SEQUENCE_IMPOSSIBLE', 'DEADLINE_MISSED', 'MULTI_RESOURCE_SHORTFALL',
  'CO_ARRIVAL', 'AGGREGATE_CAPACITY', 'RESERVE', 'COUPLED_REQUIREMENT', 'MUTUAL_EXCLUSION', 'PROTECTED_COMMITMENT'
]);

const overlap = (aFrom, aUntil, bFrom, bUntil) => aFrom < bUntil && bFrom < aUntil;
const v = (kind, state, text, extra = {}) => ({kind, state, text, ...extra});

/** Assignments grouped by the unit that would carry them, in time order. */
function byResource(assignments) {
  const map = new Map();
  for (const row of assignments) {
    if (!map.has(row.resourceId)) map.set(row.resourceId, []);
    map.get(row.resourceId).push(row);
  }
  for (const rows of map.values()) {
    rows.sort((left, right) => (ms(left.window.departureAt) ?? 0) - (ms(right.window.departureAt) ?? 0) || left.groupId.localeCompare(right.groupId));
  }
  return map;
}

/** One unit cannot be in two places at once, however feasible each looks alone. */
function doubleBookings(assignments) {
  const found = [];
  for (const [resourceId, rows] of byResource(assignments)) {
    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < rows.length; j += 1) {
        const a = rows[i].window;
        const b = rows[j].window;
        if (!a.releaseEstablished || !b.releaseEstablished) continue; // handled as UNKNOWN below
        if (!overlap(ms(a.departureAt), ms(a.releaseAt), ms(b.departureAt), ms(b.releaseAt))) continue;
        found.push(v('DOUBLE_BOOKING', 'INFEASIBLE',
          `${a.resourceName} is committed to ${rows[i].subjectName} and ${rows[j].subjectName} at the same time, from ${clockOf(iso(Math.max(ms(a.departureAt), ms(b.departureAt))))} to ${clockOf(iso(Math.min(ms(a.releaseAt), ms(b.releaseAt))))}.`,
          {resourceId, groupIds: [rows[i].groupId, rows[j].groupId].sort()}));
      }
    }
  }
  return found;
}

/** Release plus transit must actually reach the next assignment in time. */
function sequenceViolations(assignments, groupsById, period) {
  const found = [];
  for (const [resourceId, rows] of byResource(assignments)) {
    for (let i = 1; i < rows.length; i += 1) {
      const previous = rows[i - 1];
      const next = rows[i];
      const transition = sequentialTransition({previous: previous.window, next: next.window,
        previousGroup: groupsById.get(previous.groupId), nextGroup: groupsById.get(next.groupId), period});
      if (transition.state === 'FEASIBLE') continue;
      found.push(v('SEQUENCE_IMPOSSIBLE', transition.state, transition.reason,
        {resourceId, groupIds: [previous.groupId, next.groupId], transitMinutes: transition.transitMinutes}));
    }
  }
  return found;
}

/** Every slot of a multi-resource requirement must actually be filled. */
function multiResourceShortfalls(assignments, groups, unfilled) {
  const found = [];
  for (const group of groups) {
    if (!group.active) continue;
    const assigned = assignments.filter((row) => row.groupId === group.id);
    if (assigned.length >= group.totalUnitsRequired) continue;
    // Carry the nearest-miss reason when the generator recorded one, so the
    // shortfall explains itself rather than only counting.
    const miss = (unfilled ?? []).find((row) => row.groupId === group.id);
    // A shortfall caused by an unresolved fact stays unresolved. Only a shortfall
    // the records actually prove becomes an infeasibility.
    found.push(v('MULTI_RESOURCE_SHORTFALL', miss?.dueToUnknown ? 'UNKNOWN' : group.hardDeadline ? 'INFEASIBLE' : 'UNKNOWN',
      `${group.subjectName ?? group.id} requires ${group.totalUnitsRequired} unit${group.totalUnitsRequired === 1 ? '' : 's'}; ${assigned.length} qualified unit${assigned.length === 1 ? ' is' : 's are'} assigned.${miss ? ` ${miss.reason}` : ''}`,
      {groupId: group.id, required: group.totalUnitsRequired, assigned: assigned.length, nearestMiss: miss ?? null}));
  }
  return found;
}

/** Units that must be on scene together, within the stated window. */
function coArrivalViolations(assignments, groups) {
  const found = [];
  for (const group of groups) {
    if (!Number.isFinite(group.coArrivalWithinMinutes)) continue;
    const arrivals = assignments.filter((row) => row.groupId === group.id).map((row) => row.window.arrivalAt);
    if (arrivals.length < 2) continue;
    if (arrivals.some((value) => value === null)) {
      found.push(v('CO_ARRIVAL', 'UNKNOWN', `Arrival times for ${group.subjectName ?? group.id} are not all established, so co-arrival cannot be checked.`, {groupId: group.id}));
      continue;
    }
    const times = arrivals.map(ms).sort((left, right) => left - right);
    const spreadMinutes = (times[times.length - 1] - times[0]) / 60000;
    if (spreadMinutes <= group.coArrivalWithinMinutes) continue;
    found.push(v('CO_ARRIVAL', 'INFEASIBLE',
      `${group.subjectName ?? group.id} requires its units within ${group.coArrivalWithinMinutes} min of each other; the retained arrivals span ${Math.round(spreadMinutes)} min (${clockOf(iso(times[0]))} to ${clockOf(iso(times[times.length - 1]))}).`,
      {groupId: group.id, spreadMinutes: Math.round(spreadMinutes)}));
  }
  return found;
}

/** Aggregate capacity across the assigned units, by named dimension. */
function capacityShortfalls(assignments, groups, resourcesById) {
  const found = [];
  for (const group of groups) {
    if (!group.aggregateCapacity) continue;
    const assigned = assignments.filter((row) => row.groupId === group.id).map((row) => resourcesById.get(row.resourceId));
    for (const [dimension, required] of Object.entries(group.aggregateCapacity)) {
      const values = assigned.map((resource) => resource?.capacityByDimension?.[dimension]);
      if (values.some((value) => !Number.isFinite(value))) {
        found.push(v('AGGREGATE_CAPACITY', 'UNKNOWN', `${dimension} capacity is not retained for every unit assigned to ${group.subjectName ?? group.id}.`, {groupId: group.id, dimension}));
        continue;
      }
      const total = values.reduce((sum, value) => sum + value, 0);
      if (total >= required) continue;
      found.push(v('AGGREGATE_CAPACITY', 'INFEASIBLE',
        `${group.subjectName ?? group.id} requires ${required} ${dimension}; the assigned units provide ${total}.`, {groupId: group.id, dimension, required, provided: total}));
    }
  }
  return found;
}

/** A downstream operation cannot start before its prerequisite is supported. */
function coupledViolations(assignments, groups) {
  // A prerequisite counts as supported only where the unit covering it has an
  // ESTABLISHED capability. A unit whose capability is merely not ruled out does
  // not make a downstream operation safe to start.
  const established = (groupId) => assignments.some((row) => row.groupId === groupId
    && (!row.capability || row.capability.state === 'PRESENT')
    && (!row.mutualAid || row.mutualAid.usable));
  const supported = new Set(groups.filter((group) => established(group.id)).map((group) => group.id));
  return groups.flatMap((group) => (group.requiresSupportedFirst ?? [])
    .filter((prerequisiteId) => !supported.has(prerequisiteId))
    .map((prerequisiteId) => {
      const covered = assignments.some((row) => row.groupId === prerequisiteId);
      return v('COUPLED_REQUIREMENT', covered ? 'UNKNOWN' : 'INFEASIBLE',
        covered
          ? `${group.subjectName ?? group.id} cannot begin before ${prerequisiteId} is supported, and the unit assigned to it has no established capability.`
          : `${group.subjectName ?? group.id} cannot begin before ${prerequisiteId} is supported, and no unit is assigned to it.`,
        {groupId: group.id, prerequisiteId});
    }));
}

/** Requirements the records say cannot run alongside each other. */
function exclusionViolations(assignments, groups) {
  const assignedGroups = new Set(assignments.map((row) => row.groupId));
  const found = [];
  for (const group of groups) {
    if (!assignedGroups.has(group.id)) continue;
    for (const otherId of group.mutuallyExclusiveWith ?? []) {
      if (!assignedGroups.has(otherId)) continue;
      if (group.id > otherId) continue; // report each pair once
      found.push(v('MUTUAL_EXCLUSION', 'INFEASIBLE',
        `${group.subjectName ?? group.id} and ${otherId} are recorded as mutually exclusive and cannot both be run.`,
        {groupIds: [group.id, otherId]}));
    }
  }
  return found;
}

/**
 * Combines every check into one verdict.
 * Reserve findings are supplied by the reserve layer and merged here.
 */
export function validateSchedule({assignments, period, resourcesById, reserveFindings = [], unfilledSlots = []}) {
  const groups = period.requirementGroups;
  const groupsById = new Map(groups.map((group) => [group.id, group]));

  const violations = [
    ...doubleBookings(assignments),
    ...sequenceViolations(assignments, groupsById, period),
    ...multiResourceShortfalls(assignments, groups, unfilledSlots),
    ...coArrivalViolations(assignments, groups),
    ...capacityShortfalls(assignments, groups, resourcesById),
    ...coupledViolations(assignments, groups),
    ...exclusionViolations(assignments, groups),
    ...assignments.filter((row) => row.window.missesDeadline).map((row) => v('DEADLINE_MISSED', 'INFEASIBLE', row.window.reason, {groupId: row.groupId, resourceId: row.resourceId})),
    ...assignments.filter((row) => row.window.state === 'UNKNOWN').map((row) => v('SEQUENCE_IMPOSSIBLE', 'UNKNOWN', row.window.reason, {groupId: row.groupId, resourceId: row.resourceId})),
    // A unit assigned without an established capability record keeps the whole
    // plan unresolved. It is not ruled out, and it is not counted as qualified.
    ...assignments.filter((row) => row.capability && row.capability.state !== 'PRESENT').map((row) => v('MULTI_RESOURCE_SHORTFALL', 'UNKNOWN',
      `${row.resourceName} is assigned to ${row.subjectName ?? row.groupId}, but no retained record establishes its ${row.capability.capability ?? 'required'} capability.`,
      {groupId: row.groupId, resourceId: row.resourceId})),
    // Unconfirmed mutual aid likewise cannot make a plan confirmed.
    ...assignments.filter((row) => row.mutualAid && !row.mutualAid.usable).map((row) => v('MULTI_RESOURCE_SHORTFALL', 'UNKNOWN', row.mutualAid.reason, {groupId: row.groupId, resourceId: row.resourceId})),
    ...reserveFindings
  ];

  const hard = violations.filter((row) => row.state === 'INFEASIBLE');
  const unknown = violations.filter((row) => row.state === 'UNKNOWN');
  const state = hard.length ? 'GLOBALLY_INFEASIBLE' : unknown.length ? 'UNKNOWN' : 'GLOBALLY_FEASIBLE';

  return {
    state,
    violations: violations.sort((left, right) => VIOLATION_KINDS.indexOf(left.kind) - VIOLATION_KINDS.indexOf(right.kind) || String(left.text).localeCompare(String(right.text))),
    hardViolations: hard,
    unknowns: unknown,
    // The distinction the whole layer exists for.
    locallyFeasibleButGloballyNot: state === 'GLOBALLY_INFEASIBLE' && assignments.every((row) => row.window.state !== 'INFEASIBLE'),
    reason: state === 'GLOBALLY_FEASIBLE'
      ? 'Every assignment holds individually and together across the period.'
      : hard.length ? hard[0].text : unknown[0]?.text ?? null
  };
}
