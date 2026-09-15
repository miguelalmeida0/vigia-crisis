import {clockOf, iso, ms} from './operational-period.mjs';
import {sequentialTransition} from './assignment-window.mjs';

// MINIMAL SCHEDULE REPAIR AND DELAY CASCADE.
//
// When one unit goes off the run, regenerating the whole period tells the
// commander nothing. The question is which assignments actually depend on it,
// and the answer is derivable: a downstream assignment depends on an upstream
// one when the same unit carries both and the second starts from the first's
// release.
//
// Causality follows VIGIA XI's discipline. A later assignment is affected
// BECAUSE of an earlier one only where the schedule proves the release-to-travel
// dependency. Assignments that merely happen later are not affected, and saying
// otherwise would be reasoning from temporal adjacency.

export const CASCADE_RELATIONS = Object.freeze([
  {key: 'CAUSED', connective: 'because', strength: 'DERIVED_RELEASE_DEPENDENCY'},
  {key: 'CONCURRENT', connective: 'alongside', strength: 'NO_DERIVED_DEPENDENCY'}
]);

const chainFor = (assignments, resourceId) => assignments
  .filter((row) => row.resourceId === resourceId)
  .sort((left, right) => (ms(left.window.departureAt) ?? 0) - (ms(right.window.departureAt) ?? 0));

/**
 * The smallest region of a schedule needing reconsideration after a change.
 *
 * `change` is `{kind, subjectId, delayMinutes?}` using the same vocabulary as a
 * period assumption, so "what if Engine 8 is delayed" and "Engine 8 is delayed"
 * are the same question of the same machinery.
 */
export function minimalScheduleRepair(schedule, change) {
  if (!change?.subjectId) throw Object.assign(new Error('repair_change_subject_required'), {statusCode: 400});
  const assignments = schedule.assignments ?? [];
  const chain = chainFor(assignments, change.subjectId);
  // Operator text uses the unit's name; the raw id stays in the structured fields.
  const name = chain[0]?.resourceName ?? change.subjectId;
  const directly = chain.map((row) => ({slotId: row.slotId, groupId: row.groupId, subjectName: row.subjectName, resourceId: row.resourceId}));

  // Downstream assignments of the SAME unit depend on its release; that is the
  // proven dependency, and it is the only one claimed here.
  const downstream = chain.slice(1).map((row) => ({slotId: row.slotId, groupId: row.groupId, subjectName: row.subjectName,
    dependsOnSlotId: chain[chain.indexOf(row) - 1].slotId, relation: 'CAUSED'}));

  const untouched = assignments.filter((row) => row.resourceId !== change.subjectId)
    .map((row) => row.slotId).sort();

  // A group loses support only when no OTHER unit is assigned to it.
  const groupsAtRisk = [...new Set(chain.map((row) => row.groupId))].filter((groupId) =>
    !assignments.some((row) => row.groupId === groupId && row.resourceId !== change.subjectId));

  return {
    schemaVersion: 'vigia.schedule-repair.v1',
    change: {...change},
    scheduleId: schedule.id,
    directlyAffected: directly,
    downstreamDependent: downstream,
    requirementsAtRisk: groupsAtRisk,
    // Units that carried an alternative for an at-risk group now face more demand.
    resourcesNewlyContended: [...new Set(assignments
      .filter((row) => groupsAtRisk.includes(row.groupId) && row.resourceId !== change.subjectId)
      .map((row) => row.resourceId))].sort(),
    untouchedSlotIds: untouched,
    text: directly.length
      ? `Only ${name}'s ${directly.length === 1 ? 'assignment' : `${directly.length} assignments`}${downstream.length ? ` and ${downstream.length} downstream commitment${downstream.length === 1 ? '' : 's'}` : ''} require reconsideration: ${directly.map((row) => row.subjectName ?? row.groupId).join(', ')}.`
      : `No assignment in this schedule depends on ${name}. Nothing requires reconsideration.`,
    boundary: 'This names what to reconsider. It changes no assignment and proposes none.'
  };
}

/**
 * Propagates a delay through one unit's chain and reports the proven
 * consequences — later releases, missed deadlines, groups losing support.
 */
export function delayCascade({schedule, period, resourceId, delayMinutes}) {
  if (!Number.isFinite(delayMinutes)) throw Object.assign(new Error('cascade_delay_minutes_required'), {statusCode: 400});
  const groupsById = new Map(period.requirementGroups.map((group) => [group.id, group]));
  const chain = chainFor(schedule.assignments ?? [], resourceId);
  const steps = [];
  let shiftMs = delayMinutes * 60000;

  for (let index = 0; index < chain.length; index += 1) {
    const row = chain[index];
    const group = groupsById.get(row.groupId);
    if (!row.window.releaseEstablished) {
      steps.push({slotId: row.slotId, groupId: row.groupId, subjectName: row.subjectName, state: 'UNKNOWN',
        relation: index === 0 ? 'CAUSED' : 'CAUSED',
        text: `${row.resourceName}'s release from ${row.subjectName} is not established, so the effect of the delay beyond it cannot be determined.`});
      break;
    }
    const shiftedArrival = ms(row.window.arrivalAt) + shiftMs;
    const shiftedRelease = ms(row.window.releaseAt) + shiftMs;
    const deadline = ms(group?.requiredBy);
    const misses = deadline !== null && shiftedArrival > deadline;
    steps.push({
      slotId: row.slotId, groupId: row.groupId, subjectName: row.subjectName,
      state: misses ? 'INFEASIBLE' : 'FEASIBLE',
      relation: 'CAUSED',
      connective: 'because',
      previousArrival: row.window.arrivalAt,
      shiftedArrival: iso(shiftedArrival),
      shiftedRelease: iso(shiftedRelease),
      text: misses
        ? `${row.subjectName} would be reached ${clockOf(iso(shiftedArrival))} instead of ${clockOf(row.window.arrivalAt)}, after its ${clockOf(group.requiredBy)} deadline.`
        : `${row.subjectName} would be reached ${clockOf(iso(shiftedArrival))} instead of ${clockOf(row.window.arrivalAt)}, still before ${deadline === null ? 'any stated deadline' : clockOf(group.requiredBy)}.`
    });
    // The delay carries forward undiminished only through this unit's own chain.
    if (index + 1 < chain.length) {
      const transition = sequentialTransition({previous: {...row.window, releaseAt: iso(shiftedRelease), releaseEstablished: true},
        next: chain[index + 1].window, previousGroup: group, nextGroup: groupsById.get(chain[index + 1].groupId), period});
      if (transition.state === 'UNKNOWN') shiftMs = shiftMs; // unchanged; reported at next step
    }
  }

  const lost = steps.filter((row) => row.state === 'INFEASIBLE');
  return {
    schemaVersion: 'vigia.delay-cascade.v1',
    resourceId, delayMinutes,
    steps,
    requirementsLost: lost.map((row) => ({groupId: row.groupId, subjectName: row.subjectName})),
    // Only same-unit release dependencies are claimed. Nothing is attributed to
    // an assignment merely because it happens later in the period.
    chainText: steps.map((row) => row.text),
    summary: lost.length
      ? `A ${delayMinutes}-minute delay to ${chain[0]?.resourceName ?? resourceId} would make ${lost.map((row) => row.subjectName).join(', ')} infeasible.`
      : `A ${delayMinutes}-minute delay to ${chain[0]?.resourceName ?? resourceId} would not break any stated deadline in this schedule.`,
    truthBoundary: 'A cascade follows one unit’s release-to-travel chain, which the schedule establishes. Assignments carried by other units are not claimed to be affected.'
  };
}
