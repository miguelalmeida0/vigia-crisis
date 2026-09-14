import {DEPENDENT_OUTPUTS} from './knowledge-state.mjs';
import {requirementId} from './knowledge-state.mjs';

// The one constructor every requirement generator uses. It fixes the shape, the
// declared dependent outputs, the initial lifecycle and the truth boundary, so
// no generator can emit a requirement that asserts the fact it is missing.

function requirement({state, requirementClass, subject, missingFact, question, currentKnownState, affected, retainedAlternative, sourceCoverage = null, notes = []}) {
  const incidentId = state.incident.id;
  const communityIds = [...new Set(affected.communityIds ?? [])];
  return {
    schemaVersion: 'vigia.information-requirement.v1',
    id: requirementId(incidentId, requirementClass, subject.id, missingFact),
    requirementClass,
    incidentId,
    subject,
    missingFact,
    question,
    currentKnownState,
    affected: {
      categories: [...new Set(affected.categories ?? [])],
      supportRelationshipIds: [...new Set(affected.supportRelationshipIds ?? [])],
      supportRelationshipCount: new Set(affected.supportRelationshipIds ?? []).size,
      communityIds,
      communityCount: communityIds.length,
      facilityIds: [...new Set(affected.facilityIds ?? [])],
      roads: [...new Set(affected.roads ?? [])]
    },
    retainedAlternative,
    dependentOutputs: DEPENDENT_OUTPUTS[requirementClass] ?? [],
    sourceCoverage,
    notes,
    lifecycle: {state: 'OPEN', version: 1, openedAt: state.evaluatedAt, updatedAt: state.evaluatedAt, closedAt: null, reason: null},
    knownAt: state.knownAt,
    evaluatedAt: state.evaluatedAt,
    universe: state.universe,
    truthBoundary: 'An information requirement records that a fact is missing or stale in the retained set. It never asserts the fact, and an unresolved requirement is not evidence that the underlying condition is absent.'
  };
}

export {requirement};
