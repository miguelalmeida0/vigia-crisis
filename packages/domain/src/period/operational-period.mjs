// THE OPERATIONAL PERIOD.
//
// Every advisory schedule is scoped to a named, bounded period. VIGIA never
// plans against an open horizon: "the resource is free afterwards" is only
// meaningful relative to a stated end, and a plan that silently assumed infinite
// time would be answering a question nobody asked.
//
// This module holds the period universe and the canonical records XIII adds on
// top of VIGIA XII: multi-resource requirements, capacity dimensions, reserve
// policies, and mutual-aid resources.

export const MUTUAL_AID_STATES = Object.freeze(['REQUESTABLE', 'REQUESTED', 'CONFIRMED', 'EN_ROUTE', 'AVAILABLE', 'UNKNOWN']);

// Only these states put a mutual-aid resource into the usable pool. REQUESTABLE
// is a phone call nobody has made; REQUESTED is a phone call nobody has
// answered. Counting either as available is how a plan becomes fiction.
const USABLE_AID = Object.freeze(['CONFIRMED', 'EN_ROUTE', 'AVAILABLE']);

export const invalid = (text) => Object.assign(new Error(text), {statusCode: 400});
export const ms = (value) => (Number.isFinite(Date.parse(value)) ? Date.parse(value) : null);
export const iso = (value) => (Number.isFinite(value) ? new Date(value).toISOString() : null);
export const clockOf = (value) => (value ? String(value).slice(11, 16) : null);

/**
 * Availability of a resource that belongs to another organisation.
 * Returns the three-state answer, never a boolean.
 */
export function mutualAidAvailability(resource) {
  if (!resource?.mutualAid) return {state: 'OWN_RESOURCE', usable: true, reason: null};
  const aid = resource.mutualAid;
  if (!MUTUAL_AID_STATES.includes(aid.state)) return {state: 'UNKNOWN', usable: false, reason: 'The mutual-aid state is not recorded.'};
  if (USABLE_AID.includes(aid.state)) {
    return {state: aid.state, usable: true, reason: `${resource.name} is ${aid.state.toLowerCase().replace('_', ' ')} from ${aid.provider ?? 'a partner organisation'}.`};
  }
  return {
    state: aid.state,
    // Not usable, but NOT infeasible: confirming it would make it usable, so the
    // candidate must land on UNKNOWN rather than being ruled out.
    usable: false,
    reason: aid.state === 'REQUESTED'
      ? `${resource.name} has been requested from ${aid.provider ?? 'a partner organisation'} but is not confirmed, so it is not counted as available.`
      : `${resource.name} could be requested from ${aid.provider ?? 'a partner organisation'} but has not been, so it is not counted as available.`
  };
}

/**
 * A requirement that needs more than one resource. Modelled as explicit slots,
 * never as a single fabricated super-resource: two appliances are two units that
 * must each be found, and saying so is the whole point.
 */
export function canonicalRequirementGroup(input) {
  if (!input?.id) throw invalid('period_requirement_group_id_required');
  const slots = input.slots ?? [{capability: input.capabilityNeeded, quantity: input.quantity ?? 1}];
  if (!slots.length || slots.some((slot) => !slot.capability)) throw invalid('period_requirement_slot_capability_required');
  return Object.freeze({
    id: input.id,
    incidentId: input.incidentId ?? null,
    missionId: input.missionId ?? null,
    subjectId: input.subjectId ?? null,
    subjectName: input.subjectName ?? input.subjectId ?? null,
    destinationFacilityId: input.destinationFacilityId ?? null,
    destinationName: input.destinationName ?? null,
    earliestStart: input.earliestStart ?? null,
    requiredBy: input.requiredBy ?? null,
    // Unknown duration stays unknown, and propagates into an unknown release.
    durationMinutes: Number.isFinite(input.durationMinutes) ? input.durationMinutes : null,
    slots: slots.map((slot, index) => Object.freeze({
      slotId: `${input.id}:slot:${index}`,
      capability: slot.capability,
      quantity: Number.isFinite(slot.quantity) ? slot.quantity : 1,
      minimumCapacity: slot.minimumCapacity ?? null
    })),
    totalUnitsRequired: slots.reduce((total, slot) => total + (Number.isFinite(slot.quantity) ? slot.quantity : 1), 0),
    // Units that must be on scene together, within this many minutes of each other.
    coArrivalWithinMinutes: Number.isFinite(input.coArrivalWithinMinutes) ? input.coArrivalWithinMinutes : null,
    // Aggregate capacity across assigned units, by named dimension.
    aggregateCapacity: input.aggregateCapacity ?? null,
    routeIds: input.routeIds ?? [],
    // Coupled requirements: this cannot start until these are supported.
    requiresSupportedFirst: input.requiresSupportedFirst ?? [],
    mutuallyExclusiveWith: input.mutuallyExclusiveWith ?? [],
    hardDeadline: input.hardDeadline !== false,
    active: input.active !== false
  });
}

/**
 * A reserve policy. An optimiser that commits every unit is operationally
 * unusable, so keeping capability in hand is a first-class planning input rather
 * than something a human has to notice afterwards.
 */
export function canonicalReservePolicy(input) {
  if (!input?.id || !input.capability) throw invalid('period_reserve_policy_capability_required');
  return Object.freeze({
    id: input.id,
    capability: input.capability,
    zoneId: input.zoneId ?? null,
    zoneName: input.zoneName ?? input.zoneId ?? null,
    minimumAvailable: Number.isFinite(input.minimumAvailable) ? input.minimumAvailable : 1,
    from: input.from ?? null,
    until: input.until ?? null,
    // ADVISORY reports the breach and continues; BLOCKING makes a schedule that
    // breaches it globally infeasible. The policy says which; VIGIA does not choose.
    enforcement: input.enforcement === 'BLOCKING' ? 'BLOCKING' : 'ADVISORY'
  });
}

/** The bounded planning universe. Nothing is planned outside it. */
export function operationalPeriod(input) {
  if (!input?.id) throw invalid('period_id_required');
  const startsAt = input.startsAt ?? null;
  const endsAt = input.endsAt ?? null;
  if (!startsAt || !endsAt) throw invalid('period_bounds_required');
  if (ms(endsAt) <= ms(startsAt)) throw invalid('period_end_must_follow_start');
  return Object.freeze({
    periodId: input.id,
    startsAt,
    endsAt,
    incidents: input.incidents ?? [],
    requirementGroups: (input.requirementGroups ?? []).map(canonicalRequirementGroup),
    reservePolicies: (input.reservePolicies ?? []).map(canonicalReservePolicy),
    // Retained point-to-point transit times. Absent pairs stay absent: VIGIA
    // does not compute a route it has not retained.
    transitMinutes: input.transitMinutes instanceof Map ? input.transitMinutes : new Map(Object.entries(input.transitMinutes ?? {})),
    horizonBounded: true
  });
}

/** Retained transit between two places, or null when none is held. */
export const transitBetween = (period, fromId, toId) => {
  if (!fromId || !toId) return null;
  if (fromId === toId) return 0;
  const value = period.transitMinutes.get(`${fromId}->${toId}`) ?? period.transitMinutes.get(`${toId}->${fromId}`);
  return Number.isFinite(value) ? value : null;
};
