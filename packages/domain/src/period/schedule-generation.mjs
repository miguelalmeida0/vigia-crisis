import {hash} from '../intelligence/world-knowledge.mjs';
import {capabilityState} from '../planning/resource-model.mjs';
import {ms, mutualAidAvailability, transitBetween} from './operational-period.mjs';
import {assignmentWindow} from './assignment-window.mjs';
import {validateSchedule} from './global-validation.mjs';
import {blockingReserveFindings, reserveFindings} from './reserve-and-gaps.mjs';

// BOUNDED SCHEDULE GENERATION.
//
// Not an optimiser. VIGIA builds a small number of deterministic candidate
// schedules and says exactly what each one costs, because searching an
// allocation space would produce a confident answer nobody can audit.
//
// PRUNING SAFETY, same rule as VIGIA XII narrowing: a unit is skipped for a slot
// only when a retained record definitely rules it out. Never on UNKNOWN, and
// never because another unit merely looks more attractive.

export const MAX_SCHEDULES = 5;

export const SCHEDULE_FACTORS = Object.freeze([
  {key: 'globalRank', direction: 'FEWER_FIRST',
    explain: (row) => ({0: 'the whole period holds together', 1: 'parts of the period are unresolved', 2: 'the period cannot hold together'}[row.globalRank])},
  {key: 'protectedViolations', direction: 'FEWER_FIRST',
    explain: (row) => (row.protectedViolations === 0 ? 'it preserves all protected commitments' : `it breaks ${row.protectedViolations} protected commitment(s)`)},
  {key: 'hardDeadlinesUnsupported', direction: 'FEWER_FIRST',
    explain: (row) => (row.hardDeadlinesUnsupported === 0 ? 'it leaves no hard deadline unsupported' : `${row.hardDeadlinesUnsupported} hard deadline(s) would be unsupported`)},
  {key: 'reserveBreaches', direction: 'FEWER_FIRST',
    explain: (row) => (row.reserveBreaches === 0 ? 'it maintains required reserve' : `it would consume reserve in ${row.reserveBreaches} case(s)`)},
  {key: 'unsupportedGroups', direction: 'FEWER_FIRST',
    explain: (row) => (row.unsupportedGroups === 0 ? 'every requirement is supported' : `${row.unsupportedGroups} requirement(s) would be unsupported`)},
  {key: 'unknownCount', direction: 'FEWER_FIRST',
    explain: (row) => (row.unknownCount === 0 ? 'nothing in it needs checking' : `${row.unknownCount} assignment(s) need checking`)},
  {key: 'totalTravelMinutes', direction: 'FEWER_FIRST',
    explain: (row) => `total retained travel ${Math.round(row.totalTravelMinutes)} min`},
  {key: 'id', direction: 'STABLE_ID', explain: () => null}
]);

const GLOBAL_RANK = Object.freeze({GLOBALLY_FEASIBLE: 0, UNKNOWN: 1, GLOBALLY_INFEASIBLE: 2});
const read = (factor, row) => (factor.direction === 'STABLE_ID' ? String(row[factor.key] ?? '') : (Number.isFinite(row[factor.key]) ? row[factor.key] : Number.MAX_SAFE_INTEGER));

export function compareSchedules(left, right) {
  for (const factor of SCHEDULE_FACTORS) {
    const a = read(factor, left);
    const b = read(factor, right);
    if (a === b) continue;
    const order = a < b ? -1 : 1;
    return {order, factor: factor.key,
      aheadBecause: factor.explain(order < 0 ? left : right),
      behindBecause: factor.explain(order < 0 ? right : left)};
  }
  return {order: 0, factor: null, aheadBecause: null, behindBecause: null};
}

/** Why a unit cannot take a slot, or null when nothing rules it out. */
function definitelyExcluded(resource, capability, at) {
  if (capabilityState(resource, capability, at).state === 'ABSENT') {
    return `Retained capabilities for ${resource.name} do not include ${capability}.`;
  }
  if (['OUT_OF_SERVICE', 'UNAVAILABLE'].includes(resource.status)) return `${resource.name} is recorded as ${String(resource.status).toLowerCase().replace('_', ' ')}.`;
  return null;
}

function buildSchedule({label, rationale, order, resources, period, reservedResourceIds = new Set()}) {
  const busyUntil = new Map();
  // A unit whose release is not established cannot be scheduled again in this
  // period. `busyUntil = null` would be read as "no constraint" by the nullish
  // fallback below and would silently free the unit from the period start.
  const blockedForReuse = new Set();
  const positionOf = new Map(resources.map((resource) => [resource.id, resource.originFacilityId ?? null]));
  const assignments = [];
  const notes = [];
  const unfilled = [];

  for (const group of order) {
    if (!group.active) continue;
    for (const slot of group.slots) {
      for (let unit = 0; unit < slot.quantity; unit += 1) {
        const used = new Set(assignments.filter((row) => row.groupId === group.id).map((row) => row.resourceId));
        const options = resources
          .filter((resource) => !used.has(resource.id) && !reservedResourceIds.has(resource.id) && !blockedForReuse.has(resource.id))
          .filter((resource) => {
            const excluded = definitelyExcluded(resource, slot.capability, period.startsAt);
            if (excluded) return false;
            // Provably safe prune: a unit not free until after the deadline
            // cannot arrive before it, because travel is never negative. This
            // skips a window build, never a candidate that could have qualified.
            const free = ms(busyUntil.get(resource.id) ?? resource.availability?.from ?? period.startsAt);
            const due = ms(group.requiredBy);
            if (free !== null && due !== null && free > due) return false;
            // Unconfirmed mutual aid is not usable, but it is not ruled out
            // either: it stays a candidate whose state is UNKNOWN downstream.
            return true;
          })
          .map((resource) => {
            const availableFrom = busyUntil.get(resource.id) ?? resource.availability?.from ?? period.startsAt;
            const travel = transitBetween(period, positionOf.get(resource.id), group.destinationFacilityId);
            const window = assignmentWindow({group, resourceId: resource.id, resourceName: resource.name,
              availableFrom, travelMinutes: travel, period});
            const aid = mutualAidAvailability(resource);
            // Capability uncertainty must reach the schedule. A unit with no
            // record of the capability may still be considered, but the
            // assignment it produces is UNKNOWN, never quietly confirmed.
            const capability = capabilityState(resource, slot.capability, period.startsAt);
            const settled = window.state === 'FEASIBLE' && aid.usable && capability.state === 'PRESENT';
            return {resource, window, aid, capability,
              rank: settled ? 0 : window.state === 'INFEASIBLE' ? 2 : 1};
          })
          .sort((left, right) => left.rank - right.rank
            || (ms(left.window.arrivalAt) ?? Infinity) - (ms(right.window.arrivalAt) ?? Infinity)
            || left.resource.id.localeCompare(right.resource.id));

        const chosen = options.find((row) => row.rank < 2) ?? null;
        if (!chosen) {
          // Record WHY nothing could be assigned. "0 of 1 units" is true but
          // useless; the nearest miss carries the arithmetic the operator needs.
          const nearest = options[0] ?? null;
          // Distinguish "nothing has this capability" from "everything that has
          // it is already committed to this same requirement".
          const exhausted = !nearest && used.size > 0;
          // A pool emptied by units whose release is not established is an
          // UNRESOLVED shortfall, not a proven one: with the missing duration
          // retained, the same unit might well cover it.
          const blocked = [...blockedForReuse];
          const dueToUnknown = !nearest && blocked.length > 0;
          const fallback = dueToUnknown
            ? `${blocked.length === 1 ? 'The one qualified unit' : 'Every qualified unit'} that could serve this has no established release time from an earlier assignment, so its availability here is not established.`
            : exhausted
              ? `No further retained unit with ${slot.capability} is available; the qualified unit${used.size === 1 ? '' : 's'} already assigned here ${used.size === 1 ? 'is' : 'are'} ${[...used].join(', ')}.`
              : `No retained unit has ${slot.capability}.`;
          unfilled.push({groupId: group.id, subjectName: group.subjectName, slotId: slot.slotId, capability: slot.capability,
            nearestResourceId: nearest?.resource.id ?? null, nearestResourceName: nearest?.resource.name ?? null,
            exhausted, dueToUnknown, reason: nearest ? nearest.window.reason : fallback});
          notes.push(nearest ? nearest.window.reason : fallback);
          continue;
        }
        assignments.push({groupId: group.id, subjectName: group.subjectName, incidentId: group.incidentId,
          slotId: slot.slotId, capability: slot.capability, resourceId: chosen.resource.id,
          resourceName: chosen.resource.name, window: chosen.window,
          capability: chosen.capability,
          mutualAid: chosen.aid.state === 'OWN_RESOURCE' ? null : chosen.aid});
        if (chosen.window.releaseEstablished) busyUntil.set(chosen.resource.id, chosen.window.releaseAt);
        else blockedForReuse.add(chosen.resource.id);
        positionOf.set(chosen.resource.id, group.destinationFacilityId ?? positionOf.get(chosen.resource.id));
      }
    }
  }

  const resourcesById = new Map(resources.map((resource) => [resource.id, resource]));
  const reserves = reserveFindings({assignments, resources, period});
  const validation = validateSchedule({assignments, period, resourcesById, reserveFindings: blockingReserveFindings(reserves), unfilledSlots: unfilled});
  const assignedGroups = new Set(assignments.map((row) => row.groupId));
  const unsupported = period.requirementGroups.filter((group) => group.active && !assignedGroups.has(group.id));

  return {
    id: `schedule:${hash(assignments.map((row) => `${row.slotId}=${row.resourceId}`).sort())}`.slice(0, 44),
    label, rationale, advisory: true,
    assignments: assignments.sort((left, right) => left.slotId.localeCompare(right.slotId)),
    globalState: validation.state,
    globalRank: GLOBAL_RANK[validation.state],
    violations: validation.violations,
    locallyFeasibleButGloballyNot: validation.locallyFeasibleButGloballyNot,
    reserveFindings: reserves,
    reserveBreaches: reserves.length,
    unsupportedGroups: unsupported.length,
    unsupported: unsupported.map((group) => ({groupId: group.id, subjectName: group.subjectName})),
    hardDeadlinesUnsupported: unsupported.filter((group) => group.hardDeadline).length
      + validation.violations.filter((row) => row.kind === 'DEADLINE_MISSED').length,
    protectedViolations: assignments.filter((row) => (row.window.displacesProtected ?? false)).length,
    unknownCount: assignments.filter((row) => row.window.state === 'UNKNOWN').length
      + assignments.filter((row) => row.mutualAid && !row.mutualAid.usable).length
      + assignments.filter((row) => row.capability?.state !== 'PRESENT').length,
    totalTravelMinutes: assignments.reduce((total, row) => total + (row.window.travelMinutes ?? 0), 0),
    notes,
    unfilledSlots: unfilled,
    provenance: {
      periodId: period.periodId,
      groupIds: [...assignedGroups].sort(),
      resourceIds: [...new Set(assignments.map((row) => row.resourceId))].sort(),
      incidentIds: [...new Set(assignments.map((row) => row.incidentId).filter(Boolean))].sort()
    }
  };
}

/**
 * Bounded advisory schedules for one period, most acceptable first.
 * Alternatives are produced by deliberately withholding one contested unit, so
 * the operator sees the trade rather than only the engine's first pass.
 */
export function generateSchedules({resources, period, maxSchedules = MAX_SCHEDULES}) {
  const byDeadline = [...period.requirementGroups].sort((left, right) =>
    (ms(left.requiredBy) ?? Infinity) - (ms(right.requiredBy) ?? Infinity) || left.id.localeCompare(right.id));

  const schedules = [buildSchedule({label: 'Baseline', rationale: 'Requirements filled in deadline order from the earliest-arriving qualified unit.', order: byDeadline, resources, period})];

  const contested = [...new Set(schedules[0].assignments.map((row) => row.resourceId))];
  for (const resourceId of contested) {
    if (schedules.length >= maxSchedules) break;
    const name = schedules[0].assignments.find((row) => row.resourceId === resourceId)?.resourceName ?? resourceId;
    const candidate = buildSchedule({label: `Without ${name}`, rationale: `${name} is held back, to show what the rest of the period can still cover.`,
      order: byDeadline, resources, period, reservedResourceIds: new Set([resourceId])});
    if (schedules.some((row) => row.id === candidate.id) || !candidate.assignments.length) continue;
    schedules.push(candidate);
  }

  const sorted = [...schedules].sort((left, right) => compareSchedules(left, right).order);
  return {
    schedules: sorted.map((schedule, index) => {
      if (index === 0) return {...schedule, rank: 1, comparedWithAbove: null};
      const decision = compareSchedules(sorted[index - 1], schedule);
      const equivalent = !decision.aheadBecause || !decision.behindBecause;
      return {...schedule, rank: index + 1, comparedWithAbove: {decidedBy: decision.factor, equivalent,
        text: equivalent
          ? `${sorted[index - 1].label} and ${schedule.label} are equivalent on every ordering factor; the order between them is stable but arbitrary.`
          : `${sorted[index - 1].label} is shown before ${schedule.label} because ${decision.aheadBecause}. ${schedule.label}: ${decision.behindBecause}.`}};
    }),
    bounded: schedules.length >= maxSchedules,
    searchBoundary: `Schedule generation is bounded at ${maxSchedules} deterministic candidates: one baseline plus one per contested unit withheld. This is an advisory set, not a search of every possible allocation, and no candidate was discarded for looking less attractive.`
  };
}
