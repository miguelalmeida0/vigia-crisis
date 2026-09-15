import {clockOf, iso, ms, transitBetween} from './operational-period.mjs';

// REAL ASSIGNMENT WINDOWS.
//
// VIGIA XII asked "can this unit get there in time?". That question is not
// enough once a resource is reused: an assignment occupies a unit from the
// moment it leaves until the moment it is released, and the next assignment
// starts from wherever the last one ended.
//
//   departure -> travel -> arrival -> service start -> service -> release
//
// THE RULE: an unknown duration produces an unknown release, and an unknown
// release makes every downstream use of that unit UNKNOWN. VIGIA does not
// invent a release time so the arithmetic can continue.

export const WINDOW_STATES = Object.freeze(['FEASIBLE', 'INFEASIBLE', 'UNKNOWN']);

/**
 * Derives the full window for one unit serving one requirement group.
 *
 * `availableFrom` is when the unit can start moving — its period availability,
 * or the release time of its previous assignment.
 * `travelMinutes` is retained travel to the destination; null means none is held.
 */
export function assignmentWindow({group, resourceId, resourceName, availableFrom, travelMinutes, period}) {
  const earliest = ms(group.earliestStart) ?? ms(period.startsAt);
  const from = ms(availableFrom);
  const deadline = ms(group.requiredBy);

  if (from === null) {
    return unknownWindow(group, resourceId, resourceName, 'The unit’s available-from time is not established.');
  }
  if (!Number.isFinite(travelMinutes)) {
    return unknownWindow(group, resourceId, resourceName, `No retained travel time to ${group.destinationName ?? 'the destination'} is held for ${resourceName}.`);
  }

  // Leave no earlier than available; arrive no earlier than needed, but do not
  // hold a unit back artificially — departure is as soon as it is free.
  const departureAt = from;
  const arrivalAt = departureAt + travelMinutes * 60000;
  const serviceStartAt = Math.max(arrivalAt, earliest);
  const duration = group.durationMinutes;
  const releaseAt = Number.isFinite(duration) ? serviceStartAt + duration * 60000 : null;

  const missesDeadline = deadline !== null && arrivalAt > deadline;
  const beyondPeriod = releaseAt !== null && releaseAt > ms(period.endsAt);

  return Object.freeze({
    groupId: group.id,
    resourceId,
    resourceName,
    state: missesDeadline ? 'INFEASIBLE' : releaseAt === null ? 'UNKNOWN' : 'FEASIBLE',
    departureAt: iso(departureAt),
    travelMinutes,
    arrivalAt: iso(arrivalAt),
    serviceStartAt: iso(serviceStartAt),
    serviceDurationMinutes: Number.isFinite(duration) ? duration : null,
    // Null release is a fact, not a gap to be filled.
    releaseAt: iso(releaseAt),
    nextAvailableAt: iso(releaseAt),
    releaseEstablished: releaseAt !== null,
    deadline: group.requiredBy ?? null,
    missesDeadline,
    beyondPeriod,
    reason: missesDeadline
      ? `${resourceName} would arrive ${clockOf(iso(arrivalAt))}, after the required ${clockOf(group.requiredBy)}.`
      : releaseAt === null
        ? `No service duration is retained for ${group.subjectName ?? group.id}, so ${resourceName}’s release time is not established.`
        : `${resourceName} arrives ${clockOf(iso(arrivalAt))} and is released ${clockOf(iso(releaseAt))}.`,
    needsChecking: releaseAt === null ? [`Service duration for ${group.subjectName ?? group.id}.`] : [],
    provenance: {groupId: group.id, resourceId, travelMinutes}
  });
}

function unknownWindow(group, resourceId, resourceName, reason) {
  return Object.freeze({
    groupId: group.id, resourceId, resourceName, state: 'UNKNOWN',
    departureAt: null, travelMinutes: null, arrivalAt: null, serviceStartAt: null,
    serviceDurationMinutes: Number.isFinite(group.durationMinutes) ? group.durationMinutes : null,
    releaseAt: null, nextAvailableAt: null, releaseEstablished: false,
    deadline: group.requiredBy ?? null, missesDeadline: false, beyondPeriod: false,
    reason, needsChecking: [reason], provenance: {groupId: group.id, resourceId, travelMinutes: null}
  });
}

/**
 * Whether a unit released from one assignment can reach the next in time.
 *
 * This is the sequential-use question, and it has three answers. A missing
 * release or a missing transit time yields UNKNOWN — never a quiet assumption
 * that the unit makes it.
 */
export function sequentialTransition({previous, next, previousGroup, nextGroup, period}) {
  if (!previous?.releaseEstablished) {
    return {state: 'UNKNOWN', reason: `${previous?.resourceName ?? 'The unit'}’s release from ${previousGroup?.subjectName ?? 'its current assignment'} is not established, so the following assignment cannot be timed.`,
      transitMinutes: null, earliestNextArrival: null};
  }
  const transit = transitBetween(period, previousGroup?.destinationFacilityId, nextGroup?.destinationFacilityId);
  if (transit === null) {
    return {state: 'UNKNOWN', reason: `No retained travel time between ${previousGroup?.subjectName ?? 'the first destination'} and ${nextGroup?.subjectName ?? 'the next'}.`,
      transitMinutes: null, earliestNextArrival: null};
  }
  const earliestArrival = ms(previous.releaseAt) + transit * 60000;
  const deadline = ms(nextGroup?.requiredBy);
  const feasible = deadline === null || earliestArrival <= deadline;
  return {
    state: deadline === null ? 'UNKNOWN' : feasible ? 'FEASIBLE' : 'INFEASIBLE',
    transitMinutes: transit,
    earliestNextArrival: iso(earliestArrival),
    reason: deadline === null
      ? `${nextGroup?.subjectName ?? 'The next assignment'} has no stated deadline, so the sequence cannot be judged against one.`
      : feasible
        ? `${previous.resourceName} is released ${clockOf(previous.releaseAt)}, and with ${transit} min transit reaches ${nextGroup?.subjectName} by ${clockOf(iso(earliestArrival))}, before ${clockOf(nextGroup.requiredBy)}.`
        : `${previous.resourceName} completes ${previousGroup?.subjectName} at ${clockOf(previous.releaseAt)}, but with ${transit} min transit cannot reach ${nextGroup?.subjectName} before its ${clockOf(nextGroup.requiredBy)} deadline.`
  };
}
