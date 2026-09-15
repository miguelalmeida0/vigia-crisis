import {canonicalResources} from '../planning/resource-model.mjs';
import {invalid, operationalPeriod} from './operational-period.mjs';
import {generateSchedules} from './schedule-generation.mjs';
import {futureCapacityGaps} from './reserve-and-gaps.mjs';

// VIGIA XIII — OPERATIONAL PERIOD PLANNING. Public entry point.
//
//   period universe -> bounded schedule generation -> global validation
//     -> reserve and future-gap analysis -> transparent ordering -> advisory
//
// VIGIA XII answered "is this pairing feasible now?". This answers "can the
// finite resource system sustain the plan across the period?" — a question that
// can come back NO while every individual answer was YES.
//
// Same hard boundary as XII: advisory, never dispatching. Nothing here writes.

export * from './operational-period.mjs';
export {assignmentWindow, sequentialTransition, WINDOW_STATES} from './assignment-window.mjs';
export {validateSchedule, PLAN_STATES, VIOLATION_KINDS} from './global-validation.mjs';
export {reserveFindings, futureCapacityGaps, busyIntervalsOf, blockingReserveFindings} from './reserve-and-gaps.mjs';
export {generateSchedules, compareSchedules, SCHEDULE_FACTORS, MAX_SCHEDULES} from './schedule-generation.mjs';
export {minimalScheduleRepair, delayCascade, CASCADE_RELATIONS} from './schedule-repair.mjs';

export const PERTURBATIONS = Object.freeze([
  'RESOURCE_UNAVAILABLE', 'ROAD_UNAVAILABLE', 'RESOURCE_DELAYED', 'FACILITY_UNAVAILABLE', 'MUTUAL_AID_NOT_CONFIRMED'
]);

/** Applies perturbations to the INPUT records only. Copies, never mutates. */
function perturb(resources, perturbations) {
  let scoped = resources;
  for (const row of perturbations) {
    if (!PERTURBATIONS.includes(row?.kind)) throw invalid('period_perturbation_kind_unknown');
    if (!row.subjectId) throw invalid('period_perturbation_subject_required');
    if (row.kind === 'RESOURCE_UNAVAILABLE') scoped = scoped.filter((resource) => resource.id !== row.subjectId);
    else if (row.kind === 'MUTUAL_AID_NOT_CONFIRMED') {
      scoped = scoped.map((resource) => (resource.id === row.subjectId && resource.mutualAid
        ? {...resource, mutualAid: {...resource.mutualAid, state: 'REQUESTED'}} : resource));
    } else if (row.kind === 'RESOURCE_DELAYED') {
      scoped = scoped.map((resource) => (resource.id === row.subjectId
        ? {...resource, availability: {...(resource.availability ?? {}),
          from: new Date(Date.parse(resource.availability?.from ?? new Date().toISOString()) + (row.delayMinutes ?? 0) * 60000).toISOString()}}
        : resource));
    }
  }
  return scoped;
}

/**
 * Produces advisory schedules for one named operational period.
 *
 * `perturbations` turns this into a robustness question instead: the answer is
 * labelled SCENARIO, and every input record is left exactly as the caller passed it.
 */
export function planOperationalPeriod({period: periodInput, resources = [], perturbations = [], capabilities = null, maxSchedules} = {}) {
  const startedAt = performance.now();
  const period = operationalPeriod(periodInput);
  const canonical = canonicalResources(resources).map((resource, index) => Object.freeze({
    ...resource,
    zoneId: resources[index].zoneId ?? null,
    mutualAid: resources[index].mutualAid ?? null,
    capacityByDimension: resources[index].capacityByDimension ?? null
  }));
  const scoped = perturb(canonical, perturbations);

  const {schedules, bounded, searchBoundary} = generateSchedules({resources: scoped, period, ...(maxSchedules ? {maxSchedules} : {})});
  const best = schedules[0] ?? null;
  const watched = capabilities ?? [...new Set(period.requirementGroups.flatMap((group) => group.slots.map((slot) => slot.capability)))];
  const gaps = best ? futureCapacityGaps({assignments: best.assignments, resources: scoped, period, capabilities: watched}) : {gaps: [], boundary: null};

  return {
    schemaVersion: 'vigia.operational-period-plan.v1',
    periodId: period.periodId,
    startsAt: period.startsAt,
    endsAt: period.endsAt,
    universe: perturbations.length ? 'SCENARIO' : 'OPERATIONAL',
    advisory: true,
    dispatched: false,
    operationalWrites: 0,
    origin: 'DETERMINISTIC_DERIVATION',
    modelUsed: false,
    perturbations: perturbations.map((row) => ({...row})),
    perturbationText: perturbations.length
      ? `Under this assumption: ${perturbations.map((row) => `${row.subjectId} ${({RESOURCE_UNAVAILABLE: 'is unavailable', RESOURCE_DELAYED: `is delayed ${row.delayMinutes ?? 0} min`, MUTUAL_AID_NOT_CONFIRMED: 'is not confirmed', ROAD_UNAVAILABLE: 'becomes unavailable', FACILITY_UNAVAILABLE: 'becomes unavailable'})[row.kind]}`).join('; ')}.`
      : null,
    schedules,
    bounded,
    searchBoundary,
    globalState: best?.globalState ?? 'UNKNOWN',
    futureCapacityGaps: gaps.gaps,
    gapBoundary: gaps.boundary,
    counts: {
      resources: scoped.length,
      requirementGroups: period.requirementGroups.length,
      unitsRequired: period.requirementGroups.reduce((total, group) => total + group.totalUnitsRequired, 0),
      incidents: new Set(period.requirementGroups.map((group) => group.incidentId).filter(Boolean)).size,
      schedules: schedules.length
    },
    generationMs: Number((performance.now() - startedAt).toFixed(3)),
    boundary: perturbations.length
      ? 'This is a scenario calculated from retained records under an explicit assumption. No operational record, assignment or history was changed.'
      : 'These are advisory schedules derived from retained records for a bounded period. VIGIA proposes; a commander decides. A calculated route is not confirmed safe passage, and a retained plan is not a prediction.'
  };
}
