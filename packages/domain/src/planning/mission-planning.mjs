import {canonicalRequirements, canonicalResources} from './resource-model.mjs';
import {candidatesForRequirement} from './feasibility.mjs';
import {sharedAccessAcross} from './access-intelligence.mjs';
import {resourceContention, unsupportedRequirements} from './contention.mjs';
import {assignmentOptions} from './assignment-options.mjs';

// VIGIA XII — MISSION PLANNING. Public entry point.
//
//   canonical resources + requirements
//     -> candidate narrowing -> constraint evaluation -> feasible relation
//     -> contention -> bounded options -> transparent ordering -> explanation
//
// HUMAN AUTHORITY BOUNDARY, enforced by construction: nothing in this pipeline
// writes. It produces proposals. It does not dispatch a unit, change an
// assignment, message a responder, or record that anyone approved anything.
// `operationalWrites` is 0 and `advisory` is true on every result.

export * from './resource-model.mjs';
export * from './constraints.mjs';
export {evaluateCandidate, candidatesForRequirement, narrowCandidates, requirementAccess, NARROWING_CONSTRAINTS, CANDIDATE_STATES} from './feasibility.mjs';
export {resolveAccess, sharedAccessAcross, ACCESS_STATES} from './access-intelligence.mjs';
export {resourceContention, unsupportedRequirements} from './contention.mjs';
export {assignmentOptions, compareOptions, OPTION_FACTORS, MAX_OPTIONS} from './assignment-options.mjs';

export const ASSUMPTION_KINDS = Object.freeze([
  'RESOURCE_UNAVAILABLE', 'ROAD_UNAVAILABLE', 'FACILITY_UNAVAILABLE',
  'SOURCE_STALE', 'MISSION_ADDED', 'DEADLINE_CHANGED', 'CAPABILITY_UNAVAILABLE'
]);

const invalid = (text) => Object.assign(new Error(text), {statusCode: 400});

/**
 * Applies scenario assumptions to the INPUTS only. Records are filtered and
 * copied, never mutated: the live set the caller passed in is untouched, which
 * test J asserts by comparing the serialised input before and after.
 */
function applyAssumptions({resources, requirements, assumptions, facilityStatus}) {
  const eliminatedRoads = new Set();
  const eliminatedRouteIds = new Set();
  const staleRoads = new Set();
  let scopedResources = resources;
  let scopedRequirements = requirements;
  const scopedFacilityStatus = new Map(facilityStatus ?? []);

  for (const assumption of assumptions) {
    if (!ASSUMPTION_KINDS.includes(assumption?.kind)) throw invalid('planning_assumption_kind_unknown');
    if (!assumption.subjectId && assumption.kind !== 'MISSION_ADDED') throw invalid('planning_assumption_subject_required');
    if (assumption.kind === 'ROAD_UNAVAILABLE') eliminatedRoads.add(String(assumption.subjectId).toUpperCase());
    else if (assumption.kind === 'SOURCE_STALE') staleRoads.add(String(assumption.subjectId).toUpperCase());
    else if (assumption.kind === 'RESOURCE_UNAVAILABLE') scopedResources = scopedResources.filter((row) => row.id !== assumption.subjectId);
    else if (assumption.kind === 'CAPABILITY_UNAVAILABLE') {
      scopedResources = scopedResources.map((row) => (row.id === assumption.subjectId
        ? {...row, capabilities: {...row.capabilities, [assumption.capability]: false}} : row));
    } else if (assumption.kind === 'FACILITY_UNAVAILABLE') scopedFacilityStatus.set(assumption.subjectId, 'UNAVAILABLE');
    else if (assumption.kind === 'MISSION_ADDED' && assumption.requirement) scopedRequirements = [...scopedRequirements, assumption.requirement];
    else if (assumption.kind === 'DEADLINE_CHANGED') {
      scopedRequirements = scopedRequirements.map((row) => (row.id === assumption.subjectId ? {...row, requiredBy: assumption.requiredBy} : row));
    }
  }
  return {eliminatedRoads, eliminatedRouteIds, staleRoads, resources: scopedResources, requirements: scopedRequirements, facilityStatus: scopedFacilityStatus};
}

/**
 * Produces one advisory plan from canonical records.
 *
 * Pass `assumptions` to get a scenario instead: the answer is labelled
 * `universe: 'SCENARIO'` and every sentence is framed under the assumption.
 */
export function missionPlan({resources = [], requirements = [], routes = [], facilityStatus = null,
  sourceValidUntil = null, sourceLastCheckedAt = null, at, incidentId = null, assumptions = [], maxOptions} = {}) {
  if (!at) throw invalid('planning_evaluation_time_required');
  const startedAt = performance.now();

  const canonical = {resources: canonicalResources(resources), requirements: canonicalRequirements(requirements)};
  const scoped = applyAssumptions({...canonical, assumptions, facilityStatus});

  const context = {
    at, routes, sourceValidUntil, sourceLastCheckedAt,
    facilityStatus: scoped.facilityStatus,
    eliminatedRoads: scoped.eliminatedRoads,
    eliminatedRouteIds: scoped.eliminatedRouteIds,
    staleRoads: scoped.staleRoads,
    satisfiedRequirementIds: new Set(),
    assignedRequirementIds: new Set()
  };

  const requirementsById = new Map(scoped.requirements.map((row) => [row.id, row]));
  const candidatesByRequirement = new Map(scoped.requirements
    .map((requirement) => [requirement.id, candidatesForRequirement(scoped.resources, requirement, context)]));

  const contention = resourceContention(candidatesByRequirement, requirementsById);
  const unsupported = unsupportedRequirements(candidatesByRequirement, requirementsById);
  const {options, bounded, boundary} = assignmentOptions(candidatesByRequirement, scoped.requirements, contention, maxOptions ? {maxOptions} : {});

  const allCandidates = [...candidatesByRequirement.values()].flat();
  const sharedAccess = sharedAccessAcross(allCandidates.filter((row) => ['FEASIBLE', 'UNKNOWN'].includes(row.state)));

  return {
    schemaVersion: 'vigia.mission-plan.v1',
    incidentId,
    evaluatedAt: at,
    universe: assumptions.length ? 'SCENARIO' : 'OPERATIONAL',
    // Proposals only. Nothing was dispatched, assigned, or approved.
    advisory: true,
    dispatched: false,
    operationalWrites: 0,
    origin: 'DETERMINISTIC_DERIVATION',
    modelUsed: false,
    assumptions: assumptions.map((row) => ({...row})),
    assumptionText: assumptions.length
      ? `Under this assumption: ${assumptions.map((row) => `${row.subjectId ?? row.kind} ${({RESOURCE_UNAVAILABLE: 'is unavailable', ROAD_UNAVAILABLE: 'becomes unavailable', FACILITY_UNAVAILABLE: 'becomes unavailable', SOURCE_STALE: 'information needs checking', CAPABILITY_UNAVAILABLE: 'loses this capability', DEADLINE_CHANGED: 'has a changed deadline', MISSION_ADDED: 'is added'})[row.kind]}`).join('; ')}.`
      : null,
    candidates: Object.fromEntries([...candidatesByRequirement.entries()]),
    contention,
    unsupportedRequirements: unsupported,
    options,
    optionsBounded: bounded,
    optionBoundary: boundary,
    sharedAccess,
    counts: {
      resources: scoped.resources.length,
      requirements: scoped.requirements.length,
      candidates: allCandidates.length,
      feasible: allCandidates.filter((row) => row.state === 'FEASIBLE').length,
      unknown: allCandidates.filter((row) => row.state === 'UNKNOWN').length,
      infeasible: allCandidates.filter((row) => row.state === 'INFEASIBLE').length
    },
    generationMs: Number((performance.now() - startedAt).toFixed(3)),
    boundary: assumptions.length
      ? 'This is a scenario calculated from retained records under an explicit assumption. Nothing here was observed, no operational record was changed, and the assumption is discarded with this answer.'
      : 'These are advisory options derived from retained records. VIGIA proposes; a commander decides. A calculated route is not confirmed safe passage.'
  };
}
