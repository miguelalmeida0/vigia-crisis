
// RESOURCE CONTENTION.
//
// One engine that could serve either of two communities is not two engines.
// This layer names the competition explicitly and refuses to resolve it: which
// community goes without is a command decision, not a derivation.
//
// VIGIA states the choice and its consequence. A human makes it.

const parse = (value) => (Number.isFinite(Date.parse(value)) ? Date.parse(value) : null);

// Bounded reporting: a resource wanted by many requirements is one fact, not
// thousands of pairs. Truncation is reported, never silent.
const MAX_REPORTED_PAIRS = 24;

/**
 * Requirements that compete for the same resource within overlapping windows.
 *
 * A pairing counts as competing when the resource could serve it — FEASIBLE, or
 * UNKNOWN. An unknown candidate is still competing demand: dropping it here
 * would hide a conflict that becomes real the moment the missing fact arrives.
 */
export function resourceContention(candidatesByRequirement, requirementsById) {
  const byResource = new Map();
  for (const [requirementId, candidates] of candidatesByRequirement) {
    for (const candidate of candidates) {
      if (!['FEASIBLE', 'UNKNOWN'].includes(candidate.state)) continue;
      if (!byResource.has(candidate.resourceId)) byResource.set(candidate.resourceId, []);
      byResource.get(candidate.resourceId).push({requirementId, candidate});
    }
  }

  const rows = [];
  for (const [resourceId, entries] of byResource) {
    if (entries.length < 2) continue;

    // Overlapping demand is found by sweeping sorted windows, not by comparing
    // every pair: a resource wanted by a hundred requirements produced ~5,000
    // comparisons per resource and dominated the whole plan. A sweep is
    // O(n log n) and answers the same question.
    const windowed = entries.map((entry) => {
      const requirement = requirementsById.get(entry.requirementId);
      return {entry, requirement, from: parse(requirement?.earliestStart), until: parse(requirement?.requiredBy)};
    });
    // A window that is not fully stated cannot establish competition either way.
    const unstated = windowed.filter((row) => row.from === null || row.until === null);
    const stated = windowed.filter((row) => row.from !== null && row.until !== null)
      .sort((left, right) => left.from - right.from || left.requirement.id.localeCompare(right.requirement.id));

    const clusters = [];
    for (const row of stated) {
      const current = clusters[clusters.length - 1];
      if (current && row.from < current.maxUntil) {
        current.rows.push(row);
        current.maxUntil = Math.max(current.maxUntil, row.until);
      } else clusters.push({rows: [row], maxUntil: row.until});
    }

    const competing = [];
    let truncated = false;
    for (const cluster of clusters) {
      if (cluster.rows.length < 2) continue;
      for (let i = 0; i < cluster.rows.length; i += 1) {
        for (let j = i + 1; j < cluster.rows.length; j += 1) {
          if (competing.length >= MAX_REPORTED_PAIRS) { truncated = true; break; }
          const left = cluster.rows[i].requirement;
          const right = cluster.rows[j].requirement;
          competing.push({requirementIds: [left.id, right.id].sort(), subjects: [left.subjectName, right.subjectName],
            windowsOverlap: true, established: true});
        }
        if (truncated) break;
      }
      if (truncated) break;
    }
    // Unstated windows are reported as unestablished competition, never dropped.
    for (const row of unstated.slice(0, 2)) {
      const other = stated[0]?.requirement ?? unstated.find((item) => item !== row)?.requirement;
      if (!other || other.id === row.requirement.id) continue;
      competing.push({requirementIds: [row.requirement.id, other.id].sort(),
        subjects: [row.requirement.subjectName, other.subjectName], windowsOverlap: null, established: false});
    }
    if (!competing.length) continue;

    const involved = [...new Set(competing.flatMap((row) => row.requirementIds))].sort();
    rows.push({
      resourceId,
      resourceName: entries[0].candidate.resourceName,
      competingRequirementIds: involved,
      pairs: competing.sort((left, right) => left.requirementIds.join().localeCompare(right.requirementIds.join())),
      pairsTruncated: truncated,
      alternativesByRequirement: Object.fromEntries(involved.map((requirementId) => {
        const others = (candidatesByRequirement.get(requirementId) ?? [])
          .filter((row) => row.resourceId !== resourceId && ['FEASIBLE', 'UNKNOWN'].includes(row.state));
        return [requirementId, others.map((row) => ({resourceId: row.resourceId, resourceName: row.resourceName, state: row.state, travelMinutes: row.travelMinutes}))];
      })),
      existingCommitments: entries[0].candidate.displacesAssignments ?? [],
      text: `${entries[0].candidate.resourceName} could support ${involved.slice(0, 4).map((id) => requirementsById.get(id)?.subjectName ?? id).join(' or ')}${involved.length > 4 ? ` and ${involved.length - 4} more` : ''}, but not all of them across overlapping windows.`,
      resolution: 'COMMANDER_DECISION_REQUIRED'
    });
  }

  return rows.sort((left, right) => right.competingRequirementIds.length - left.competingRequirementIds.length || left.resourceId.localeCompare(right.resourceId));
}

/** Requirements that no resource can currently support, and why. */
export function unsupportedRequirements(candidatesByRequirement, requirementsById) {
  const rows = [];
  for (const [requirementId, candidates] of candidatesByRequirement) {
    const requirement = requirementsById.get(requirementId);
    if (!requirement?.active) continue;
    const feasible = candidates.filter((row) => row.state === 'FEASIBLE');
    const unknown = candidates.filter((row) => row.state === 'UNKNOWN');
    if (feasible.length) continue;
    rows.push({
      requirementId,
      subjectName: requirement.subjectName,
      capabilityNeeded: requirement.capabilityNeeded,
      // No feasible option is a different statement from no option at all.
      state: unknown.length ? 'NO_CONFIRMED_OPTION' : 'NO_QUALIFIED_RESOURCE',
      unknownCandidateCount: unknown.length,
      text: unknown.length
        ? `No confirmed ${requirement.capabilityNeeded} resource for ${requirement.subjectName}. ${unknown.length} candidate${unknown.length === 1 ? '' : 's'} need${unknown.length === 1 ? 's' : ''} checking.`
        : `No retained resource qualifies for ${requirement.subjectName}'s ${requirement.capabilityNeeded} requirement.`,
      needsChecking: [...new Set(unknown.flatMap((row) => row.needsChecking))],
      ruledOut: candidates.filter((row) => row.state === 'INFEASIBLE')
        .map((row) => ({resourceName: row.resourceName, reason: row.decisiveConstraint?.reason ?? null}))
    });
  }
  return rows.sort((left, right) => left.requirementId.localeCompare(right.requirementId));
}
