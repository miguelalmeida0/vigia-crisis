import {hash} from '../intelligence/world-knowledge.mjs';

// BOUNDED ADVISORY ASSIGNMENT OPTIONS.
//
// These are proposals. Nothing here dispatches, assigns, messages anyone, or
// records that a plan was approved. VIGIA states what the records allow; a
// commander decides.
//
// Generation is bounded by construction, not by cutting off a search: one
// baseline option, plus one deliberate alternative per contended resource, up to
// MAX_OPTIONS. When the bound bites, the result says so rather than presenting a
// truncated set as if it were complete.

export const MAX_OPTIONS = 6;

/**
 * Ordering factors, most important first. No weights, no composite score — the
 * first factor that differs decides, and becomes the explanation.
 */
export const OPTION_FACTORS = Object.freeze([
  {key: 'protectedViolations', direction: 'FEWER_FIRST',
    explain: (row) => (row.protectedViolations === 0 ? 'it preserves every protected commitment' : `it breaks ${row.protectedViolations} protected commitment(s)`)},
  {key: 'deadlinesMissed', direction: 'FEWER_FIRST',
    explain: (row) => (row.deadlinesMissed === 0 ? 'it meets every stated deadline' : `${row.deadlinesMissed} deadline(s) would be missed`)},
  {key: 'unsupportedCount', direction: 'FEWER_FIRST',
    explain: (row) => (row.unsupportedCount === 0 ? 'it leaves no active requirement unsupported' : `${row.unsupportedCount} active requirement(s) would be left unsupported`)},
  {key: 'unknownCount', direction: 'FEWER_FIRST',
    explain: (row) => (row.unknownCount === 0 ? 'every assignment rests on confirmed access' : `${row.unknownCount} assignment(s) rest on something that needs checking`)},
  {key: 'displacedCount', direction: 'FEWER_FIRST',
    explain: (row) => (row.displacedCount === 0 ? 'it moves no existing assignment' : `it moves ${row.displacedCount} existing assignment(s)`)},
  {key: 'totalTravelMinutes', direction: 'FEWER_FIRST',
    explain: (row) => (Number.isFinite(row.totalTravelMinutes) ? `total retained travel ${Math.round(row.totalTravelMinutes)} min` : 'travel time not established')},
  {key: 'id', direction: 'STABLE_ID', explain: () => null}
]);

const read = (factor, row) => {
  const value = row[factor.key];
  if (factor.direction === 'STABLE_ID') return String(value ?? '');
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
};

export function compareOptions(left, right) {
  for (const factor of OPTION_FACTORS) {
    const a = read(factor, left);
    const b = read(factor, right);
    if (a === b) continue;
    const order = a < b ? -1 : 1;
    const ahead = order < 0 ? left : right;
    const behind = order < 0 ? right : left;
    return {order, factor: factor.key, aheadBecause: factor.explain(ahead), behindBecause: factor.explain(behind)};
  }
  return {order: 0, factor: null, aheadBecause: null, behindBecause: null};
}

function summarise(assignments, requirements) {
  const assignedIds = new Set(assignments.map((row) => row.requirementId));
  const active = requirements.filter((row) => row.active);
  const unsupported = active.filter((row) => !assignedIds.has(row.id));
  return {
    protectedViolations: assignments.filter((row) => row.candidate.displacesProtected).length,
    deadlinesMissed: assignments.filter((row) => row.candidate.constraints
      .some((c) => c.kind === 'TRAVEL_TIME' && c.state === 'INFEASIBLE')).length,
    unsupportedCount: unsupported.length,
    unknownCount: assignments.filter((row) => row.candidate.state === 'UNKNOWN').length,
    displacedCount: assignments.reduce((total, row) => total + (row.candidate.displacesAssignments?.length ?? 0), 0),
    totalTravelMinutes: assignments.reduce((total, row) => total + (row.candidate.travelMinutes ?? 0), 0),
    unsupported
  };
}

function buildOption(assignments, requirements, label, rationale) {
  const stats = summarise(assignments, requirements);
  return {
    id: `option:${hash(assignments.map((row) => `${row.requirementId}=${row.resourceId}`).sort())}`.slice(0, 40),
    label,
    rationale,
    advisory: true,
    assignments: assignments.map((row) => ({
      requirementId: row.requirementId,
      subjectName: row.candidate.subjectName,
      resourceId: row.resourceId,
      resourceName: row.candidate.resourceName,
      state: row.candidate.state,
      arrival: row.candidate.arrival,
      travelMinutes: row.candidate.travelMinutes,
      routeId: row.candidate.access?.routeId ?? null,
      displaces: row.candidate.displacesAssignments ?? [],
      // The constraints this assignment actually leans on.
      constraintsReliedUpon: row.candidate.constraints.filter((c) => c.state === 'FEASIBLE').map((c) => c.kind),
      needsChecking: row.candidate.needsChecking
    })).sort((left, right) => left.requirementId.localeCompare(right.requirementId)),
    requirementsSatisfied: assignments.filter((row) => row.candidate.state === 'FEASIBLE').map((row) => row.requirementId).sort(),
    requirementsUnconfirmed: assignments.filter((row) => row.candidate.state === 'UNKNOWN').map((row) => row.requirementId).sort(),
    requirementsUnsupported: stats.unsupported.map((row) => ({requirementId: row.id, subjectName: row.subjectName, capabilityNeeded: row.capabilityNeeded})),
    commitmentsDisplaced: assignments.flatMap((row) => (row.candidate.displacesAssignments ?? [])
      .map((commitment) => ({resourceId: row.resourceId, resourceName: row.candidate.resourceName, ...commitment}))),
    unknowns: [...new Set(assignments.flatMap((row) => row.candidate.needsChecking))],
    consequences: stats.unsupported.map((row) => `${row.subjectName} would have no assigned ${row.capabilityNeeded} resource.`),
    protectedViolations: stats.protectedViolations,
    deadlinesMissed: stats.deadlinesMissed,
    unsupportedCount: stats.unsupportedCount,
    unknownCount: stats.unknownCount,
    displacedCount: stats.displacedCount,
    totalTravelMinutes: stats.totalTravelMinutes,
    provenance: {
      resourceIds: [...new Set(assignments.map((row) => row.resourceId))].sort(),
      requirementIds: [...new Set(assignments.map((row) => row.requirementId))].sort(),
      routeIds: [...new Set(assignments.map((row) => row.candidate.access?.routeId).filter(Boolean))].sort(),
      missionIds: [...new Set(assignments.map((row) => row.candidate.missionId).filter(Boolean))].sort()
    }
  };
}

/** Best usable candidate for a requirement, excluding already-taken resources. */
const pick = (candidates, taken) => candidates.find((row) => ['FEASIBLE', 'UNKNOWN'].includes(row.state) && !taken.has(row.resourceId)) ?? null;

/**
 * Generates bounded advisory options. The baseline assigns each requirement its
 * best available candidate in a fixed order; each alternative deliberately gives
 * one contended resource to a different requirement, so the operator sees the
 * trade rather than only the engine's first pass.
 */
export function assignmentOptions(candidatesByRequirement, requirements, contention, {maxOptions = MAX_OPTIONS} = {}) {
  const ordered = [...requirements].filter((row) => row.active).sort((left, right) => left.id.localeCompare(right.id));

  const buildWith = (preferred) => {
    const taken = new Set();
    const assignments = [];
    // Forced preferences are placed first and reserve their resource, so a
    // deliberate alternative never double-books one unit onto two requirements.
    for (const requirement of ordered.filter((row) => preferred.has(row.id))) {
      const candidates = candidatesByRequirement.get(requirement.id) ?? [];
      const chosen = candidates.find((row) => row.resourceId === preferred.get(requirement.id)
        && ['FEASIBLE', 'UNKNOWN'].includes(row.state)) ?? null;
      if (!chosen) continue;
      taken.add(chosen.resourceId);
      assignments.push({requirementId: requirement.id, resourceId: chosen.resourceId, candidate: chosen});
    }
    for (const requirement of ordered.filter((row) => !preferred.has(row.id))) {
      const chosen = pick(candidatesByRequirement.get(requirement.id) ?? [], taken);
      if (!chosen) continue;
      taken.add(chosen.resourceId);
      assignments.push({requirementId: requirement.id, resourceId: chosen.resourceId, candidate: chosen});
    }
    return assignments;
  };

  const options = [buildOption(buildWith(new Map()), ordered, 'Baseline', 'Each requirement takes its best available candidate.')];

  for (const row of contention) {
    if (options.length >= maxOptions) break;
    for (const requirementId of row.competingRequirementIds.slice(1)) {
      if (options.length >= maxOptions) break;
      const preferred = new Map([[requirementId, row.resourceId]]);
      const option = buildOption(buildWith(preferred), ordered, `${row.resourceName} to ${requirementId}`,
        `${row.resourceName} is given to ${requirementId} instead, to show what that costs.`);
      if (options.some((existing) => existing.id === option.id)) continue;
      if (!option.assignments.length) continue;
      options.push(option);
    }
  }

  const sorted = [...options].sort((left, right) => compareOptions(left, right).order);
  const ranked = sorted.map((option, index) => {
    if (index === 0) return {...option, rank: 1, comparedWithAbove: null};
    const decision = compareOptions(sorted[index - 1], option);
    const equivalent = !decision.aheadBecause || !decision.behindBecause;
    return {...option, rank: index + 1, comparedWithAbove: {
      decidedBy: decision.factor,
      equivalent,
      text: equivalent
        ? `${sorted[index - 1].label} and ${option.label} are equivalent on every ordering factor; the order between them is stable but arbitrary.`
        : `${sorted[index - 1].label} is shown first because ${decision.aheadBecause}. ${option.label}: ${decision.behindBecause}.`
    }};
  });

  return {
    options: ranked,
    bounded: options.length >= maxOptions,
    boundary: options.length >= maxOptions
      ? `Option generation stopped at ${maxOptions}. These are advisory alternatives, not an exhaustive search of every possible allocation.`
      : 'Every distinct option this contention produces is listed.'
  };
}
