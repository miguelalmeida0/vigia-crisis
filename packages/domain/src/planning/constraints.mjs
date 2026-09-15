import {capabilityState, commitmentsDuring, locationState, overlaps} from './resource-model.mjs';

// CONSTRAINTS.
//
// Not a rule engine. Eleven named operational constraints, each knowing one
// thing about why a resource can or cannot serve a requirement, each returning
// the same three-state answer with its reason, the records it read, and — when
// it is meaningful — what would have to become true to change the answer.
//
// The three states are not a severity scale. INFEASIBLE means a retained record
// rules this out. UNKNOWN means the records do not settle it. They are different
// answers to different questions, and UNKNOWN is never rounded to either side.

export const CONSTRAINT_STATES = Object.freeze(['FEASIBLE', 'INFEASIBLE', 'UNKNOWN']);

// Evaluation order. Also the order in which a decisive INFEASIBLE is chosen, so
// the reason an operator sees is the most fundamental one, not the first by luck.
export const CONSTRAINT_KINDS = Object.freeze([
  'CAPABILITY', 'CAPACITY', 'AVAILABILITY', 'PROTECTED_COMMITMENT', 'CURRENT_ASSIGNMENT',
  'FACILITY_STATUS', 'ACCESS', 'TRAVEL_TIME', 'TIME_WINDOW', 'DEPENDENCY', 'MUTUAL_EXCLUSION'
]);

const result = (kind, state, reason, {factsUsed = [], whatWouldNeedToChange = null, ...rest} = {}) =>
  ({kind, state, reason, factsUsed, whatWouldNeedToChange, ...rest});

const parse = (value) => (Number.isFinite(Date.parse(value)) ? Date.parse(value) : null);

export function capabilityConstraint(resource, requirement, at) {
  const capability = capabilityState(resource, requirement.capabilityNeeded, at);
  const facts = capability.factId ? [capability.factId] : [];
  if (capability.state === 'PRESENT') return result('CAPABILITY', 'FEASIBLE', capability.reason, {factsUsed: facts});
  if (capability.state === 'ABSENT') {
    return result('CAPABILITY', 'INFEASIBLE', `Retained capabilities for ${resource.name} do not include ${requirement.capabilityNeeded}.`, {
      factsUsed: facts,
      whatWouldNeedToChange: `A retained record establishing ${requirement.capabilityNeeded} for ${resource.name}.`
    });
  }
  // Never treated as capable. Never treated as incapable either.
  return result('CAPABILITY', 'UNKNOWN', capability.expired
    ? `The ${requirement.capabilityNeeded} record for ${resource.name} passed its validity window, so its current capability is not established.`
    : `No retained record establishes whether ${resource.name} has ${requirement.capabilityNeeded}.`, {
    factsUsed: facts,
    whatWouldNeedToChange: `A current capability record for ${resource.name}.`
  });
}

export function capacityConstraint(resource, requirement) {
  if (requirement.minimumCapacity === null) return result('CAPACITY', 'FEASIBLE', 'No minimum capacity is required.');
  if (resource.capacity === null) {
    return result('CAPACITY', 'UNKNOWN', `No capacity is retained for ${resource.name}.`, {
      whatWouldNeedToChange: `A retained capacity for ${resource.name}.`});
  }
  if (resource.capacity < requirement.minimumCapacity) {
    return result('CAPACITY', 'INFEASIBLE', `${resource.name} has capacity ${resource.capacity}; ${requirement.minimumCapacity} is required.`);
  }
  return result('CAPACITY', 'FEASIBLE', `Capacity ${resource.capacity} meets the required ${requirement.minimumCapacity}.`);
}

export function availabilityConstraint(resource, requirement) {
  if (resource.status && ['OUT_OF_SERVICE', 'UNAVAILABLE'].includes(resource.status)) {
    return result('AVAILABILITY', 'INFEASIBLE', `${resource.name} is recorded as ${resource.status.toLowerCase().replace('_', ' ')}.`,
      {whatWouldNeedToChange: `${resource.name} returning to service.`});
  }
  const window = resource.availability;
  if (!window) return result('AVAILABILITY', 'UNKNOWN', `No availability window is retained for ${resource.name}.`,
    {whatWouldNeedToChange: `A retained availability window for ${resource.name}.`});
  const covers = overlaps(parse(window.from), parse(window.until), parse(requirement.earliestStart), parse(requirement.requiredBy));
  if (covers === null) return result('AVAILABILITY', 'UNKNOWN', 'The availability window or the requirement window is not fully stated.');
  return covers
    ? result('AVAILABILITY', 'FEASIBLE', `${resource.name} is available across the required window.`)
    : result('AVAILABILITY', 'INFEASIBLE', `${resource.name} is not available during the required window.`);
}

/**
 * Splits existing commitments by whether preemption is permitted. A commitment
 * whose preemption rule is not recorded yields UNKNOWN — VIGIA will not assume
 * it may be broken, and will not assume it may not.
 */
export function commitmentConstraints(resource, requirement) {
  const clashing = commitmentsDuring(resource, requirement.earliestStart, requirement.requiredBy);
  const prohibited = clashing.filter((row) => row.preemption === 'PROHIBITED');
  const unknown = clashing.filter((row) => row.preemption === 'NOT_ESTABLISHED');
  const allowed = clashing.filter((row) => row.preemption === 'ALLOWED');

  const protectedResult = prohibited.length
    ? result('PROTECTED_COMMITMENT', 'INFEASIBLE',
      `${resource.name} is committed to ${prohibited[0].subjectName ?? prohibited[0].requirementId} through this window and that assignment is protected.`,
      {factsUsed: prohibited.map((row) => row.requirementId), protectedCommitments: prohibited,
        whatWouldNeedToChange: `A commander releasing ${resource.name} from ${prohibited[0].subjectName ?? prohibited[0].requirementId}.`})
    : result('PROTECTED_COMMITMENT', 'FEASIBLE', 'No protected commitment blocks this window.');

  const assignmentResult = unknown.length
    ? result('CURRENT_ASSIGNMENT', 'UNKNOWN',
      `${resource.name} is committed to ${unknown[0].subjectName ?? unknown[0].requirementId} during this window and whether it may be reassigned is not recorded.`,
      {factsUsed: unknown.map((row) => row.requirementId), unknownCommitments: unknown,
        whatWouldNeedToChange: 'A recorded preemption rule for that assignment.'})
    : allowed.length
      ? result('CURRENT_ASSIGNMENT', 'FEASIBLE',
        `${resource.name} is committed to ${allowed[0].subjectName ?? allowed[0].requirementId}, which is recorded as reassignable.`,
        {factsUsed: allowed.map((row) => row.requirementId), displaces: allowed})
      : result('CURRENT_ASSIGNMENT', 'FEASIBLE', 'No overlapping assignment is retained.');

  return [protectedResult, assignmentResult];
}

/**
 * Access and travel, read from retained route intelligence rather than computed
 * here. `access` describes the route VIGIA holds: whether one exists, whether it
 * is affected, and whether the information behind it is still current.
 */
export function accessConstraint(access, resource, requirement) {
  if (!access || access.state === 'NO_ROUTE_RETAINED') {
    return result('ACCESS', 'UNKNOWN', `No retained route connects ${resource.name} to ${requirement.destinationName ?? 'the destination'}.`,
      {whatWouldNeedToChange: 'A calculated route between them.'});
  }
  if (access.state === 'ROUTE_ELIMINATED') {
    return result('ACCESS', 'INFEASIBLE', `The retained route is not usable under the current assumption (${access.reason ?? 'route unavailable'}).`,
      {factsUsed: [access.routeId]});
  }
  if (access.state === 'ROUTE_STALE') {
    // The pivotal rule: stale access degrades to UNKNOWN, never to INFEASIBLE.
    return result('ACCESS', 'UNKNOWN',
      `The only retained route depends on road information that needs checking${access.age ? ` (last checked ${access.age} ago)` : ''}.`,
      {factsUsed: [access.routeId], roads: access.roads ?? [],
        whatWouldNeedToChange: `Confirmation of ${(access.roads ?? []).join(', ') || 'the road'}.`});
  }
  return result('ACCESS', 'FEASIBLE',
    `A retained route is held${access.usedAlternative ? ' (the alternative; the primary is affected)' : ''}. A calculated route is not confirmed safe passage.`,
    {factsUsed: [access.routeId], usedAlternative: Boolean(access.usedAlternative)});
}

export function travelTimeConstraint(access, resource, requirement, at) {
  const location = locationState(resource, at);
  if (location.state !== 'CURRENT') {
    return result('TRAVEL_TIME', 'UNKNOWN', `${resource.name}'s location ${location.state === 'STALE' ? 'needs checking' : 'is not retained'}, so arrival cannot be calculated.`,
      {whatWouldNeedToChange: `A current position for ${resource.name}.`, locationState: location.state});
  }
  if (!access || !Number.isFinite(access.minutes)) {
    return result('TRAVEL_TIME', 'UNKNOWN', 'No retained travel time is available for this pairing.');
  }
  const start = parse(requirement.earliestStart) ?? parse(at);
  const deadline = parse(requirement.requiredBy);
  const arrival = new Date(start + access.minutes * 60000).toISOString();
  if (deadline === null) {
    return result('TRAVEL_TIME', 'UNKNOWN', 'No deadline is stated for this requirement, so arrival cannot be judged against one.', {arrival, minutes: access.minutes});
  }
  return parse(arrival) <= deadline
    ? result('TRAVEL_TIME', 'FEASIBLE', `Calculated arrival ${arrival.slice(11, 16)} using the retained route, before ${new Date(deadline).toISOString().slice(11, 16)}.`,
      {arrival, minutes: access.minutes, factsUsed: [access.routeId]})
    : result('TRAVEL_TIME', 'INFEASIBLE', `Calculated arrival ${arrival.slice(11, 16)} is after the required ${new Date(deadline).toISOString().slice(11, 16)}.`,
      {arrival, minutes: access.minutes, factsUsed: [access.routeId],
        whatWouldNeedToChange: 'A faster retained route, a closer resource, or a later deadline.'});
}

export function timeWindowConstraint(requirement) {
  if (!requirement.requiredBy || !requirement.earliestStart) {
    return result('TIME_WINDOW', 'UNKNOWN', 'The requirement window is not fully stated.');
  }
  return parse(requirement.requiredBy) > parse(requirement.earliestStart)
    ? result('TIME_WINDOW', 'FEASIBLE', 'The requirement window is coherent.')
    : result('TIME_WINDOW', 'INFEASIBLE', 'The requirement deadline is not after its earliest start.');
}

export function facilityStatusConstraint(requirement, facilityStatus) {
  if (!requirement.destinationFacilityId) return result('FACILITY_STATUS', 'FEASIBLE', 'No destination facility is required.');
  const status = facilityStatus?.get?.(requirement.destinationFacilityId) ?? null;
  if (status === null) return result('FACILITY_STATUS', 'UNKNOWN', 'The destination facility status is not retained.');
  if (status === 'UNAVAILABLE') return result('FACILITY_STATUS', 'INFEASIBLE', `${requirement.destinationName ?? 'The destination'} is recorded as unavailable.`);
  return result('FACILITY_STATUS', 'FEASIBLE', 'The destination facility is recorded as available.');
}

export function dependencyConstraint(requirement, satisfiedRequirementIds) {
  const missing = (requirement.dependsOnRequirementIds ?? []).filter((id) => !satisfiedRequirementIds.has(id));
  if (!missing.length) return result('DEPENDENCY', 'FEASIBLE', 'No unmet prerequisite requirement.');
  return result('DEPENDENCY', 'UNKNOWN', `This requirement depends on ${missing.join(', ')}, which ${missing.length === 1 ? 'is' : 'are'} not yet supported.`,
    {factsUsed: missing, whatWouldNeedToChange: 'A feasible assignment for the prerequisite requirement.'});
}

export function mutualExclusionConstraint(requirement, assignedRequirementIds) {
  const clash = (requirement.mutuallyExclusiveWith ?? []).filter((id) => assignedRequirementIds.has(id));
  return clash.length
    ? result('MUTUAL_EXCLUSION', 'INFEASIBLE', `This requirement cannot be served alongside ${clash.join(', ')}.`, {factsUsed: clash})
    : result('MUTUAL_EXCLUSION', 'FEASIBLE', 'No mutually exclusive requirement is assigned.');
}
