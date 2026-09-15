import {hash} from '../intelligence/world-knowledge.mjs';
import {resolveAccess} from './access-intelligence.mjs';
import {CONSTRAINT_KINDS, accessConstraint, availabilityConstraint, capabilityConstraint, capacityConstraint,
  commitmentConstraints, dependencyConstraint, facilityStatusConstraint, mutualExclusionConstraint,
  timeWindowConstraint, travelTimeConstraint} from './constraints.mjs';

// FEASIBILITY: one resource against one requirement, in three states.
//
// COMBINATION RULE, and why it is this way round:
//
//   any INFEASIBLE -> INFEASIBLE.  A retained record rules the pairing out, and
//                     no amount of unknown elsewhere rescues it. An engine
//                     without structural fire capability stays out whether or
//                     not we know where it is.
//   else any UNKNOWN -> UNKNOWN.   Nothing rules it out, but the records do not
//                     establish it either. This is the state VIGIA must be
//                     willing to sit in.
//   else -> FEASIBLE.
//
// UNKNOWN is never rounded to FEASIBLE (fake certainty) or to INFEASIBLE
// (discarding an option that may well work). Every candidate carries the full
// constraint set, so the reason is never reduced to one sentence by accident.

export const CANDIDATE_STATES = Object.freeze(['FEASIBLE', 'UNKNOWN', 'INFEASIBLE']);
const severity = (state) => ({INFEASIBLE: 0, UNKNOWN: 1, FEASIBLE: 2}[state]);
const kindOrder = (kind) => CONSTRAINT_KINDS.indexOf(kind);

/**
 * Evaluates every constraint for one pairing and combines them.
 * `context` supplies what the constraints read: retained routes, facility
 * status, and the scenario eliminations that a what-if may have introduced.
 */
export function evaluateCandidate(resource, requirement, context, precomputedAccess = null) {
  const {at} = context;
  // Access depends on the REQUIREMENT and the road picture, never on the
  // resource, so it is resolved once per requirement and reused across every
  // candidate. Resolving it per pairing recomputed the cut-set analysis tens of
  // thousands of times for no additional information.
  const access = precomputedAccess ?? requirementAccess(requirement, context);

  const constraints = [
    capabilityConstraint(resource, requirement, at),
    capacityConstraint(resource, requirement),
    availabilityConstraint(resource, requirement),
    ...commitmentConstraints(resource, requirement),
    facilityStatusConstraint(requirement, context.facilityStatus),
    accessConstraint(access, resource, requirement),
    travelTimeConstraint(access, resource, requirement, at),
    timeWindowConstraint(requirement),
    dependencyConstraint(requirement, context.satisfiedRequirementIds ?? new Set()),
    mutualExclusionConstraint(requirement, context.assignedRequirementIds ?? new Set())
  ].sort((left, right) => kindOrder(left.kind) - kindOrder(right.kind));

  const infeasible = constraints.filter((row) => row.state === 'INFEASIBLE');
  const unknown = constraints.filter((row) => row.state === 'UNKNOWN');
  const state = infeasible.length ? 'INFEASIBLE' : unknown.length ? 'UNKNOWN' : 'FEASIBLE';
  // The decisive constraint is the most fundamental blocker, not the first found.
  const decisive = infeasible[0] ?? unknown[0] ?? null;
  const travel = constraints.find((row) => row.kind === 'TRAVEL_TIME');
  const displacing = constraints.find((row) => row.kind === 'CURRENT_ASSIGNMENT')?.displaces ?? [];

  return Object.freeze({
    id: `candidate:${hash([resource.id, requirement.id])}`.slice(0, 40),
    resourceId: resource.id,
    resourceName: resource.name,
    requirementId: requirement.id,
    missionId: requirement.missionId,
    subjectName: requirement.subjectName,
    state,
    decisiveConstraint: decisive ? {kind: decisive.kind, state: decisive.state, reason: decisive.reason} : null,
    // Everything else that also matters, so "why" is never a single sentence
    // standing in for a fuller picture.
    alsoRelevant: constraints.filter((row) => row !== decisive && row.state !== 'FEASIBLE')
      .map((row) => ({kind: row.kind, state: row.state, reason: row.reason})),
    constraints,
    access,
    arrival: travel?.arrival ?? null,
    travelMinutes: travel?.minutes ?? null,
    displacesAssignments: displacing,
    displacesProtected: constraints.some((row) => row.kind === 'PROTECTED_COMMITMENT' && row.state === 'INFEASIBLE'),
    whatWouldNeedToChange: constraints.filter((row) => row.state !== 'FEASIBLE' && row.whatWouldNeedToChange)
      .map((row) => ({kind: row.kind, change: row.whatWouldNeedToChange})),
    needsChecking: unknown.map((row) => row.reason),
    provenance: {
      resourceIds: [resource.id],
      requirementIds: [requirement.id],
      missionIds: requirement.missionId ? [requirement.missionId] : [],
      routeIds: access.routeId ? [access.routeId] : [],
      roads: access.roads ?? [],
      facilityIds: requirement.destinationFacilityId ? [requirement.destinationFacilityId] : [],
      factsUsed: [...new Set(constraints.flatMap((row) => row.factsUsed ?? []))].sort()
    }
  });
}

// --- Bounded narrowing -----------------------------------------------------
//
// SAFETY RULE: narrowing may discard a pairing only when a cheap constraint
// already returns INFEASIBLE — the same answer full evaluation would give. It
// may NEVER discard on UNKNOWN, because an unknown pairing can still turn out
// feasible once the missing fact arrives, and silently dropping it would hide
// an option from the operator.
//
// That makes the prefilter provably safe rather than heuristically safe, and
// `discarded` records every drop with its reason so nothing vanishes quietly.

export const NARROWING_CONSTRAINTS = Object.freeze(['CAPABILITY', 'CAPACITY', 'AVAILABILITY']);

/** Resolves a requirement's access once. Identical for every candidate resource. */
export function requirementAccess(requirement, context) {
  return resolveAccess({requirement, routes: context.routes ?? [], at: context.at,
    sourceValidUntil: context.sourceValidUntil, sourceLastCheckedAt: context.sourceLastCheckedAt,
    eliminatedRoads: context.eliminatedRoads ?? new Set(),
    eliminatedRouteIds: context.eliminatedRouteIds ?? new Set(),
    staleRoads: context.staleRoads ?? new Set()});
}

export function narrowCandidates(resources, requirement, context) {
  const kept = [];
  const discarded = [];
  for (const resource of resources) {
    const cheap = [
      capabilityConstraint(resource, requirement, context.at),
      capacityConstraint(resource, requirement),
      availabilityConstraint(resource, requirement)
    ];
    const blocking = cheap.find((row) => row.state === 'INFEASIBLE');
    if (blocking) {
      discarded.push({resourceId: resource.id, resourceName: resource.name, kind: blocking.kind, reason: blocking.reason});
      continue;
    }
    kept.push(resource);
  }
  return {kept, discarded, rule: 'DISCARD_ONLY_ON_DEFINITE_INFEASIBILITY'};
}

/**
 * Every pairing for one requirement, narrowed then fully evaluated, ordered
 * feasible first. Discarded pairings are still reported as INFEASIBLE rows so
 * the operator can see what was considered and why it was ruled out.
 */
export function candidatesForRequirement(resources, requirement, context) {
  const {kept, discarded} = narrowCandidates(resources, requirement, context);
  const access = requirementAccess(requirement, context);
  const evaluated = kept.map((resource) => evaluateCandidate(resource, requirement, context, access));
  const ruledOut = discarded.map((row) => Object.freeze({
    id: `candidate:${hash([row.resourceId, requirement.id])}`.slice(0, 40),
    resourceId: row.resourceId, resourceName: row.resourceName, requirementId: requirement.id,
    state: 'INFEASIBLE', narrowedOut: true,
    decisiveConstraint: {kind: row.kind, state: 'INFEASIBLE', reason: row.reason},
    alsoRelevant: [], constraints: [], access: null, arrival: null, travelMinutes: null,
    displacesAssignments: [], displacesProtected: false, whatWouldNeedToChange: [], needsChecking: [],
    provenance: {resourceIds: [row.resourceId], requirementIds: [requirement.id], missionIds: [], routeIds: [], roads: [], facilityIds: [], factsUsed: []}
  }));

  return [...evaluated, ...ruledOut].sort((left, right) =>
    severity(right.state) - severity(left.state)
    || (left.travelMinutes ?? Infinity) - (right.travelMinutes ?? Infinity)
    || left.resourceId.localeCompare(right.resourceId));
}
