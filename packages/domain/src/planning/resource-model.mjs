// CANONICAL RESOURCES AND MISSION REQUIREMENTS.
//
// The rule this layer exists to enforce: a name is not a capability.
// "Fire Unit 12" establishes nothing. A resource is capable of structural fire
// response when a retained record says so and that record is still valid — and
// at no other time.
//
// Every field has three possible conditions, never two:
//   known-true, known-false, and not established. The third is not a default
//   for either of the first two, and it survives all the way to the operator.

export const CAPABILITY_STATES = Object.freeze(['PRESENT', 'ABSENT', 'NOT_ESTABLISHED']);
export const PREEMPTION_STATES = Object.freeze(['PROHIBITED', 'ALLOWED', 'NOT_ESTABLISHED']);

const parse = (value) => (Number.isFinite(Date.parse(value)) ? Date.parse(value) : null);
export const overlaps = (aFrom, aUntil, bFrom, bUntil) => {
  if ([aFrom, aUntil, bFrom, bUntil].some((value) => value === null)) return null; // not established
  return aFrom < bUntil && bFrom < aUntil;
};

/**
 * Reads one capability from a resource record.
 *
 * A capability counts as PRESENT only when the record says true AND its
 * validity has not lapsed at the evaluation time. A lapsed record does not
 * become ABSENT — it becomes NOT_ESTABLISHED, because expiry is not refutation.
 */
export function capabilityState(resource, capability, at) {
  const record = resource?.capabilities?.[capability];
  if (record === undefined || record === null) return {state: 'NOT_ESTABLISHED', capability, reason: 'No capability record is retained for this resource.', factId: null};
  const value = typeof record === 'object' ? record.value : record;
  const validUntil = typeof record === 'object' ? record.validUntil : null;
  const factId = typeof record === 'object' ? record.factId ?? null : null;
  if (validUntil !== null && validUntil !== undefined) {
    const until = parse(validUntil);
    if (until === null) return {state: 'NOT_ESTABLISHED', capability, reason: 'The capability record has no readable validity.', factId};
    if (until <= parse(at)) return {state: 'NOT_ESTABLISHED', capability, reason: 'The capability record passed its validity window and has not been renewed.', factId, expired: true};
  }
  if (value === true) return {state: 'PRESENT', capability, reason: 'A retained record establishes this capability.', factId};
  if (value === false) return {state: 'ABSENT', capability, reason: 'A retained record establishes that this resource does not have this capability.', factId};
  return {state: 'NOT_ESTABLISHED', capability, reason: 'The capability record does not state a value.', factId};
}

/**
 * Freshness of a resource's reported location. A stale position cannot support
 * an arrival calculation, and inventing one would be the single most dangerous
 * thing this engine could do.
 */
export function locationState(resource, at) {
  const observedAt = resource?.locationObservedAt ?? resource?.checkedAt ?? null;
  const validUntil = resource?.locationValidUntil ?? null;
  if (!resource?.location || !observedAt) return {state: 'NOT_ESTABLISHED', reason: 'No current location is retained for this resource.', observedAt: null, ageMs: null};
  const ageMs = parse(at) - parse(observedAt);
  if (validUntil && parse(validUntil) !== null && parse(validUntil) <= parse(at)) {
    return {state: 'STALE', reason: 'The retained location passed its validity window.', observedAt, ageMs};
  }
  return {state: 'CURRENT', reason: 'A current location is retained.', observedAt, ageMs};
}

/** Commitments that overlap a window, classified by whether they may be preempted. */
export function commitmentsDuring(resource, from, until) {
  return (resource?.existingAssignments ?? []).map((assignment) => {
    const clash = overlaps(parse(assignment.from), parse(assignment.until), parse(from), parse(until));
    const preemption = assignment.protected === true ? 'PROHIBITED'
      : assignment.protected === false ? 'ALLOWED' : 'NOT_ESTABLISHED';
    return {...assignment, overlaps: clash, preemption};
  }).filter((assignment) => assignment.overlaps !== false);
}

/** Normalises a resource record. Absent fields stay absent; nothing is defaulted. */
export function canonicalResource(input) {
  if (!input?.id) throw Object.assign(new Error('planning_resource_id_required'), {statusCode: 400});
  return Object.freeze({
    id: input.id,
    resourceType: input.resourceType ?? null,
    name: input.name ?? input.id,
    capabilities: input.capabilities ?? {},
    status: input.status ?? null,
    location: input.location ?? null,
    locationObservedAt: input.locationObservedAt ?? input.checkedAt ?? null,
    locationValidUntil: input.locationValidUntil ?? null,
    availability: input.availability ?? null,
    existingAssignments: input.existingAssignments ?? [],
    operatingUnit: input.operatingUnit ?? null,
    capacity: Number.isFinite(input.capacity) ? input.capacity : null,
    restrictions: input.restrictions ?? [],
    source: input.source ?? null,
    validUntil: input.validUntil ?? null,
    // Where this resource can start from, for route lookup. Never guessed.
    originFacilityId: input.originFacilityId ?? null
  });
}

/** Normalises a mission requirement. No synthetic difficulty or priority value. */
export function canonicalRequirement(input) {
  if (!input?.id) throw Object.assign(new Error('planning_requirement_id_required'), {statusCode: 400});
  if (!input.capabilityNeeded) throw Object.assign(new Error('planning_requirement_capability_required'), {statusCode: 400});
  return Object.freeze({
    id: input.id,
    missionId: input.missionId ?? null,
    subjectId: input.subjectId ?? null,
    subjectName: input.subjectName ?? input.subjectId ?? null,
    serviceId: input.serviceId ?? null,
    capabilityNeeded: input.capabilityNeeded,
    destinationFacilityId: input.destinationFacilityId ?? null,
    destinationName: input.destinationName ?? null,
    earliestStart: input.earliestStart ?? null,
    requiredBy: input.requiredBy ?? null,
    durationMinutes: Number.isFinite(input.durationMinutes) ? input.durationMinutes : null,
    minimumCapacity: Number.isFinite(input.minimumCapacity) ? input.minimumCapacity : null,
    // Route ids this requirement may be served over, from retained routes only.
    routeIds: input.routeIds ?? [],
    dependsOnRequirementIds: input.dependsOnRequirementIds ?? [],
    mutuallyExclusiveWith: input.mutuallyExclusiveWith ?? [],
    active: input.active !== false
  });
}

export const canonicalResources = (rows) => (rows ?? []).map(canonicalResource);
export const canonicalRequirements = (rows) => (rows ?? []).map(canonicalRequirement);
