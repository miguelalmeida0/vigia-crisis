import {categoryLabel, criticalCategories} from './information-requirements.mjs';

// Orders information requirements by explicit operational factors and returns the
// factors themselves. There is deliberately no composite score: an operator can
// read exactly why one requirement outranks another, and two requirements that
// tie on every factor are ordered by identity so the result is stable.
//
// The comparator is lexicographic over the declared factor order below. Changing
// the order changes the doctrine, visibly, in one place.

export const TASKING_FACTORS = Object.freeze([
  {key: 'blocksCriticalQualifiedCategory', kind: 'BOOLEAN', label: 'Blocks a critical qualified category'},
  {key: 'noRetainedAlternative', kind: 'BOOLEAN', label: 'No retained alternative exists'},
  {key: 'affectedCommunityCount', kind: 'COUNT', label: 'Communities whose support depends on it'},
  {key: 'affectedSupportRelationshipCount', kind: 'COUNT', label: 'Retained support relationships that depend on it'},
  {key: 'sharedDependencyBreadth', kind: 'COUNT', label: 'Support categories sharing the dependency'},
  {key: 'sourceFreshnessUrgency', kind: 'ORDINAL', label: 'Source freshness urgency', order: ['NONE', 'PARTIAL', 'STALE', 'UNAVAILABLE']},
  {key: 'incidentProximityKm', kind: 'DISTANCE_ASCENDING', label: 'Proximity to the reported incident point'},
  {key: 'approvedSourceAvailable', kind: 'BOOLEAN', label: 'An approved registered source exists'}
]);

const URGENCY_ORDER = Object.freeze(['NONE', 'PARTIAL', 'STALE', 'UNAVAILABLE']);

function freshnessUrgency(requirement) {
  const state = requirement.sourceCoverage?.state ?? requirement.currentKnownState?.state ?? null;
  if (state === 'UNAVAILABLE' || state === 'NOT_CONNECTED') return 'UNAVAILABLE';
  if (state === 'STALE' || state === 'LAST_KNOWN') return 'STALE';
  if (state === 'PARTIAL' || state === 'PARTIAL_COVERAGE') return 'PARTIAL';
  return 'NONE';
}

function factorsFor(requirement, {sourceTasking = null} = {}) {
  const critical = criticalCategories();
  const blocksCritical = requirement.affected.categories.some((category) => critical.includes(category))
    && ['FACILITY_CAPABILITY', 'ROUTE_MISSING', 'FACILITY_IDENTITY'].includes(requirement.requirementClass);
  return {
    blocksCriticalQualifiedCategory: blocksCritical,
    noRetainedAlternative: requirement.retainedAlternative?.state === 'NO_RETAINED_ALTERNATIVE',
    affectedCommunityCount: requirement.affected.communityCount ?? 0,
    affectedSupportRelationshipCount: requirement.affected.supportRelationshipCount ?? 0,
    sharedDependencyBreadth: requirement.affected.categories.length,
    sourceFreshnessUrgency: freshnessUrgency(requirement),
    incidentProximityKm: Number.isFinite(requirement.subject?.distanceKm) ? requirement.subject.distanceKm : null,
    approvedSourceAvailable: sourceTasking ? sourceTasking.state === 'REGISTERED_SOURCE_AVAILABLE' : false
  };
}

function compareFactorValues(factor, left, right) {
  if (factor.kind === 'BOOLEAN') return Number(right === true) - Number(left === true);
  if (factor.kind === 'COUNT') return (right ?? 0) - (left ?? 0);
  if (factor.kind === 'ORDINAL') return URGENCY_ORDER.indexOf(right) - URGENCY_ORDER.indexOf(left);
  // Nearer to the incident comes first; an unknown distance never outranks a known one.
  const a = Number.isFinite(left) ? left : Infinity;
  const b = Number.isFinite(right) ? right : Infinity;
  return a - b;
}

// Deterministic prose, built from the factors that are actually present. No model.
function reasonsFor(requirement, factors) {
  const rows = [];
  if (factors.blocksCriticalQualifiedCategory) {
    const category = requirement.affected.categories.find((item) => criticalCategories().includes(item));
    rows.push(`Blocks the qualified ${categoryLabel(category)} set for this incident.`);
  }
  if (factors.noRetainedAlternative) rows.push('No retained alternative exists for the affected support category.');
  if (Number.isFinite(requirement.currentKnownState?.qualifiedFacilityCount) && requirement.currentKnownState.qualifiedFacilityCount === 1) rows.push('Exactly one qualified facility is retained.');
  if (factors.affectedCommunityCount) rows.push(`${factors.affectedCommunityCount} retained ${factors.affectedCommunityCount === 1 ? 'community depends' : 'communities depend'} on the affected support.`);
  if (factors.affectedSupportRelationshipCount) rows.push(`${factors.affectedSupportRelationshipCount} retained support ${factors.affectedSupportRelationshipCount === 1 ? 'relationship uses' : 'relationships use'} it.`);
  if (factors.sharedDependencyBreadth > 1) rows.push(`Shared across ${factors.sharedDependencyBreadth} support categories.`);
  if (factors.sourceFreshnessUrgency === 'UNAVAILABLE') rows.push('No connected source coverage applies.');
  if (factors.sourceFreshnessUrgency === 'STALE') rows.push('Retained source information is out of date.');
  if (factors.sourceFreshnessUrgency === 'PARTIAL') rows.push('Source coverage is partial; absence of a matched record is not confirmation.');
  if (Number.isFinite(factors.incidentProximityKm)) rows.push(`${factors.incidentProximityKm.toFixed(1)} km from the reported incident point.`);
  rows.push(sourceReason(requirement, factors));
  return rows;
}

function sourceReason(requirement, factors) {
  if (factors.approvedSourceAvailable) return 'An approved registered source is available to check.';
  if (['ROAD_INFORMATION', 'SOURCE_STALE', 'PHYSICAL_OBSERVATION_GAP'].includes(requirement.requirementClass)) return 'Answered by the configured acquisition pipeline rather than a facility-directory source.';
  return 'No approved registered source is currently linked to this subject.';
}

/**
 * Ranks requirements and explains the ranking. `sourcesByRequirementId` is the
 * source-tasking result keyed by requirement id; it is optional, and its absence
 * only means the approved-source factor is false, never that one exists.
 */
export function nextVerificationTasks(requirementsResult, {sourcesByRequirementId = new Map(), limit = 10} = {}) {
  const rows = (requirementsResult?.requirements ?? []).map((requirement) => {
    const sourceTasking = sourcesByRequirementId.get?.(requirement.id) ?? sourcesByRequirementId[requirement.id] ?? null;
    const factors = factorsFor(requirement, {sourceTasking});
    return {
      requirementId: requirement.id,
      requirementClass: requirement.requirementClass,
      subject: requirement.subject,
      question: requirement.question,
      currentKnownState: requirement.currentKnownState,
      factors,
      reasons: reasonsFor(requirement, factors),
      dependentOutputs: requirement.dependentOutputs,
      sourceTasking
    };
  });

  const ordered = [...rows].sort((left, right) => {
    for (const factor of TASKING_FACTORS) {
      const result = compareFactorValues(factor, left.factors[factor.key], right.factors[factor.key]);
      if (result !== 0) return result;
    }
    return left.requirementId.localeCompare(right.requirementId);
  }).map((row, index) => ({...row, rank: index + 1}));

  return Object.freeze({
    schemaVersion: 'vigia.collection-tasking.v1',
    incidentId: requirementsResult?.incidentId ?? null,
    knownAt: requirementsResult?.knownAt ?? null,
    evaluatedAt: requirementsResult?.evaluatedAt ?? null,
    orderingMethod: 'EXPLICIT_LEXICOGRAPHIC_FACTORS',
    factorOrder: TASKING_FACTORS.map((factor) => factor.key),
    factorDefinitions: TASKING_FACTORS,
    total: ordered.length,
    returned: Math.min(ordered.length, limit),
    tasks: ordered.slice(0, limit),
    limitation: 'Ordering compares the declared factors in the declared order. There is no weighted score, and the ordering is a collection priority, not an operational instruction.'
  });
}

/**
 * A deterministic causal explanation of one requirement, assembled only from
 * retained counts and states that are already on the requirement.
 */
export function explainRequirement(requirement, {sourceTasking = null} = {}) {
  if (!requirement?.id) throw Object.assign(new Error('requirement_required'), {statusCode: 400});
  const factors = factorsFor(requirement, {sourceTasking});
  const known = requirement.currentKnownState ?? {};
  const facts = [];
  if (Number.isFinite(requirement.subject?.distanceKm)) facts.push(`${requirement.subject.name} is ${requirement.subject.distanceKm.toFixed(1)} km from the reported incident point.`);
  if (known.state) facts.push(known.reason ?? `Current known state: ${known.state}.`);
  if (known.primaryName && Number.isFinite(known.primaryDistanceKm)) facts.push(`The current qualified option is ${known.primaryName} at ${known.primaryDistanceKm.toFixed(1)} km.`);
  if (Array.isArray(known.candidates) && known.candidates.length) {
    const nearest = known.candidates[0];
    facts.push(`The nearest unresolved candidate is ${nearest.name}${Number.isFinite(nearest.distanceKm) ? ` at ${nearest.distanceKm.toFixed(1)} km` : ''}${nearest.retainedRouteExists ? ' with a retained calculated route' : ' with no retained calculated route'}.`);
  }
  if (known.candidateState === 'CANDIDATE_SET_NOT_AVAILABLE_IN_THIS_PROJECTION') facts.push('Candidate facilities are not exposed by this projection, so no candidate is named here.');
  if (requirement.affected.communityCount) facts.push(`${requirement.affected.communityCount} retained ${requirement.affected.communityCount === 1 ? 'community has' : 'communities have'} their support affected by this unknown.`);
  if (requirement.affected.supportRelationshipCount) facts.push(`${requirement.affected.supportRelationshipCount} retained support ${requirement.affected.supportRelationshipCount === 1 ? 'relationship depends' : 'relationships depend'} on it.`);
  if (requirement.retainedAlternative?.state === 'NO_RETAINED_ALTERNATIVE') facts.push('No retained alternative would absorb the loss of the current option.');

  return Object.freeze({
    schemaVersion: 'vigia.requirement-explanation.v1',
    requirementId: requirement.id,
    question: requirement.question,
    facts,
    consequenceIfResolved: requirement.dependentOutputs.length
      ? `Resolving it would force recomputation of: ${requirement.dependentOutputs.map((output) => output.replaceAll('_', ' ').toLowerCase()).join(', ')}.`
      : 'No dependent VIGIA output is declared for this requirement class.',
    factors,
    sourceTasking,
    truthBoundary: 'Every statement above is a retained count or a retained state. None of them asserts the missing fact, and resolving the requirement may confirm, refute or leave it unresolved.'
  });
}
