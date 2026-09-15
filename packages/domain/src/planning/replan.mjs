import {hash} from '../intelligence/world-knowledge.mjs';

// MINIMAL REPLAN AND PLAN DIFFERENCE.
//
// One engine going off the run should not invalidate the whole plan. An operator
// who is told "everything needs review" has been told nothing.
//
// The affected set is computed from the candidate relation the planner already
// built: a requirement is affected when the change touches a resource it was
// actually considering. Everything else is explicitly reported as untouched.
//
// Causality follows VIGIA XI's discipline: a plan change is attributed to a
// change in inputs only where the candidate relation proves the dependency.
// Nothing here reads a clock.

export const CHANGE_RELATIONS = Object.freeze([
  {key: 'CAUSED', connective: 'because', strength: 'DERIVED_DEPENDENCY'},
  {key: 'FOLLOWED', connective: 'after', strength: 'SAME_PLAN_ONLY'}
]);

const candidateRows = (plan) => Object.entries(plan?.candidates ?? {});

/**
 * The smallest part of the plan that needs reconsideration after a change.
 *
 * `change` is `{kind, subjectId}` — the same vocabulary as a planning
 * assumption, so "what if Engine 8 goes" and "Engine 8 has gone" are the same
 * question asked of the same machinery.
 */
export function minimalReplanSet(plan, change) {
  if (!change?.subjectId) throw Object.assign(new Error('replan_change_subject_required'), {statusCode: 400});
  const subject = change.subjectId;

  const directlyAffected = [];
  const untouched = [];
  for (const [requirementId, candidates] of candidateRows(plan)) {
    const considered = candidates.filter((row) => row.resourceId === subject
      || (row.provenance?.roads ?? []).includes(String(subject).toUpperCase())
      || (row.provenance?.routeIds ?? []).includes(subject));
    if (!considered.length) { untouched.push(requirementId); continue; }
    const wasUsable = considered.some((row) => ['FEASIBLE', 'UNKNOWN'].includes(row.state));
    directlyAffected.push({
      requirementId,
      subjectName: considered[0].subjectName ?? null,
      // A requirement that had ruled this resource out anyway is listed, but
      // marked: the change does not alter its options.
      materially: wasUsable,
      remainingUsable: candidates.filter((row) => row.resourceId !== subject && ['FEASIBLE', 'UNKNOWN'].includes(row.state))
        .map((row) => ({resourceId: row.resourceId, resourceName: row.resourceName, state: row.state}))
    });
  }

  const material = directlyAffected.filter((row) => row.materially);
  // Resources that were alternatives on an affected requirement now carry more
  // demand, so their other requirements may enter contention.
  const newlyContended = [...new Set(material.flatMap((row) => row.remainingUsable.map((item) => item.resourceId)))].sort();
  const losingAllOptions = material.filter((row) => !row.remainingUsable.length);

  return {
    schemaVersion: 'vigia.minimal-replan.v1',
    change: {...change},
    directlyAffectedRequirementIds: material.map((row) => row.requirementId).sort(),
    consideredButUnaffected: directlyAffected.filter((row) => !row.materially).map((row) => row.requirementId).sort(),
    requirementsLosingAllOptions: losingAllOptions.map((row) => ({requirementId: row.requirementId, subjectName: row.subjectName})),
    resourcesNewlyContended: newlyContended,
    // Stated positively, because "what does NOT need attention" is half the value.
    untouchedRequirementIds: untouched.sort(),
    text: material.length
      ? `Only the assignments depending on ${subject} need reconsideration: ${material.map((row) => row.subjectName ?? row.requirementId).join(', ')}.`
      : `No assignment in this plan depended on ${subject}. Nothing needs reconsideration.`,
    boundary: 'This names what to reconsider. It changes no assignment and proposes none.'
  };
}

const optionKey = (option) => (option?.assignments ?? []).map((row) => `${row.requirementId}=${row.resourceId}`).sort().join(',');

/**
 * Compares two advisory plans and attributes the difference.
 *
 * A difference is CAUSED by a change only when the candidate relation shows the
 * dependency: the resource, road or route named by the change was actually one
 * this requirement was considering in the previous plan. Otherwise the change is
 * reported as having happened alongside, not as the cause.
 */
export function planDifference({previous, current, change = null}) {
  const before = new Map(candidateRows(previous).map(([id, rows]) => [id, rows]));
  const after = new Map(candidateRows(current).map(([id, rows]) => [id, rows]));

  const usable = (rows) => new Set((rows ?? []).filter((row) => ['FEASIBLE', 'UNKNOWN'].includes(row.state)).map((row) => row.resourceId));
  const stateOf = (rows, resourceId) => (rows ?? []).find((row) => row.resourceId === resourceId)?.state ?? 'ABSENT';

  const candidateChanges = [];
  for (const [requirementId, currentRows] of after) {
    const previousRows = before.get(requirementId);
    if (!previousRows) continue;
    const resourceIds = [...new Set([...usable(previousRows), ...usable(currentRows)])].sort();
    for (const resourceId of resourceIds) {
      const was = stateOf(previousRows, resourceId);
      const now = stateOf(currentRows, resourceId);
      if (was === now) continue;
      const proven = Boolean(change?.subjectId) && (resourceId === change.subjectId
        || (currentRows.find((row) => row.resourceId === resourceId)?.provenance?.roads ?? []).includes(String(change.subjectId).toUpperCase()));
      const relation = proven ? 'CAUSED' : 'FOLLOWED';
      candidateChanges.push({
        requirementId, resourceId, previousState: was, currentState: now,
        relation, connective: CHANGE_RELATIONS.find((row) => row.key === relation).connective,
        // Preserves the XI knowledge-loss distinction inside planning.
        knowledgeLoss: was === 'FEASIBLE' && now === 'UNKNOWN'
          ? {previouslyFeasible: true, text: 'This assignment was previously feasible. Its current feasibility is unknown and needs checking.'}
          : null,
        reason: currentRows.find((row) => row.resourceId === resourceId)?.decisiveConstraint?.reason ?? null
      });
    }
  }

  const previousTop = previous?.options?.[0] ?? null;
  const currentTop = current?.options?.[0] ?? null;
  const planChanged = optionKey(previousTop) !== optionKey(currentTop);
  const caused = candidateChanges.filter((row) => row.relation === 'CAUSED');

  return {
    schemaVersion: 'vigia.plan-difference.v1',
    id: `plan-diff:${hash([previous?.evaluatedAt ?? null, current?.evaluatedAt ?? null, candidateChanges.map((row) => [row.requirementId, row.resourceId, row.currentState])])}`.slice(0, 44),
    previousAt: previous?.evaluatedAt ?? null,
    currentAt: current?.evaluatedAt ?? null,
    planChanged,
    previousTopOption: previousTop ? {label: previousTop.label, assignments: previousTop.assignments.map((row) => `${row.requirementId}=${row.resourceId}`)} : null,
    currentTopOption: currentTop ? {label: currentTop.label, assignments: currentTop.assignments.map((row) => `${row.requirementId}=${row.resourceId}`)} : null,
    candidateChanges: candidateChanges.sort((left, right) => left.requirementId.localeCompare(right.requirementId) || left.resourceId.localeCompare(right.resourceId)),
    knowledgeLosses: candidateChanges.filter((row) => row.knowledgeLoss),
    newlyUnsupported: (current?.unsupportedRequirements ?? [])
      .filter((row) => !(previous?.unsupportedRequirements ?? []).some((prior) => prior.requirementId === row.requirementId))
      .map((row) => ({requirementId: row.requirementId, subjectName: row.subjectName, state: row.state})),
    whyItChanged: caused.length && change
      ? [`The plan changed because ${change.subjectId} ${({RESOURCE_UNAVAILABLE: 'became unavailable', ROAD_UNAVAILABLE: 'became unavailable', SOURCE_STALE: 'information needs checking'})[change.kind] ?? 'changed'}.`]
      : [],
    unexplainedChanges: candidateChanges.filter((row) => row.relation === 'FOLLOWED')
      .map((row) => `${row.requirementId}/${row.resourceId} moved ${row.previousState} → ${row.currentState} after this plan. No derived dependency links it to the stated change.`),
    truthBoundary: 'A plan difference compares two advisory projections. A change is stated as a cause only where the candidate relation established the dependency.'
  };
}
