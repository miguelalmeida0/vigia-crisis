import {DEPENDENT_OUTPUTS, requirementId} from '../intelligence/knowledge-state.mjs';
import {classifyStaleness, stalenessRank} from './freshness.mjs';

// BRIDGE TO INTELLIGENCE VIII COLLECTION.
//
// The consequence engine knows which unknown is worth resolving. Intelligence
// VIII already knows how to task, source, track and close an information need.
// This module connects them and adds NO tasking machinery of its own.
//
// What it emits is a `vigia.information-requirement.v1` record — the exact shape
// Intelligence VIII's own generators produce — built with that subsystem's
// `requirementId()` and `DEPENDENT_OUTPUTS`. It is consumable directly by
// `nextVerificationTasks()`, `requirementSourceIndex()` and the lifecycle.
//
// Internally the vocabulary is Intelligence VIII's. Externally the operator
// reads "Needs checking" and "Confirm EM527" — never "information requirement",
// "epistemic impact" or "coverage classification".

/** Operator-facing wording for a verification need. No collection jargon. */
export function operatorWording(need) {
  return {
    label: 'Needs checking',
    latestInformation: need.currentKnownState.lastCheckedAt ?? null,
    action: need.subject.kind === 'ROAD' ? `Confirm ${need.subject.name}` : `Confirm ${need.subject.name}`,
    because: need.whyItMatters
  };
}

function requirementFor({incidentId, requirementClass, subject, missingFact, question, currentKnownState, affected, retainedAlternative, sourceCoverage, notes, at, knownAt, universe}) {
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
      communityIds: [...new Set(affected.communityIds ?? [])],
      communityCount: new Set(affected.communityIds ?? []).size,
      facilityIds: [...new Set(affected.facilityIds ?? [])],
      roads: [...new Set(affected.roads ?? [])]
    },
    retainedAlternative,
    dependentOutputs: DEPENDENT_OUTPUTS[requirementClass] ?? [],
    sourceCoverage,
    notes,
    lifecycle: {state: 'OPEN', version: 1, openedAt: at, updatedAt: at, closedAt: null, reason: null},
    knownAt,
    evaluatedAt: at,
    universe,
    truthBoundary: 'An information requirement records that a fact is missing or stale in the retained set. It never asserts the fact, and an unresolved requirement is not evidence that the underlying condition is absent.'
  };
}

/**
 * Turns a consequence's critical dependencies into Intelligence VIII
 * requirements. One requirement per (road, service) that a consequence shows an
 * operational decision currently rests on.
 *
 * `freshnessByRoad` maps a canonical road key to its factFreshness() result.
 */
export function verificationNeeds(consequence, {freshnessByRoad = new Map(), at, universe = 'OPERATIONAL'} = {}) {
  const needs = [];
  for (const service of consequence.serviceImpacts ?? []) {
    const active = (service.missionImpacts ?? []).filter((row) => row.lifecycle === 'ACTIVE');
    if (!active.length) continue;
    const withoutAlternative = active.filter((row) => row.remainingOptionCount === 0).length;

    for (const road of consequence.roads ?? []) {
      const freshness = freshnessByRoad.get?.(road.road) ?? null;
      const classification = classifyStaleness(freshness, {
        activeMissionCount: active.length,
        missionsWithoutAlternative: withoutAlternative,
        serviceCount: consequence.affectedServiceCount ?? 1,
        routeIds: service.affectedRoutes.map((row) => row.routeId)
      });
      // Only raise a need where an active objective actually rests on it.
      if (classification.class === 'BACKGROUND_NO_DEPENDENT_DECISION') continue;

      const need = requirementFor({
        incidentId: consequence.incidentId,
        // Existing Intelligence VIII class. No new class is introduced.
        requirementClass: 'ROAD_INFORMATION',
        subject: {kind: 'ROAD', id: road.road, name: road.road},
        missingFact: 'road.currentUsability',
        question: `Is ${road.road} usable now?`,
        currentKnownState: {
          state: freshness?.state === 'EXPIRED' ? 'STALE' : freshness?.state === 'VALIDITY_UNKNOWN' ? 'LAST_KNOWN' : 'PARTIAL',
          lastCheckedAt: freshness?.lastCheckedAt ?? consequence.observedAt ?? null,
          age: freshness?.age ?? null,
          // Neither direction is asserted. This is the §4 boundary, carried into tasking.
          note: 'Stored road information cannot currently support a conclusion in either direction.'
        },
        affected: {
          categories: [service.serviceId],
          facilityIds: service.affectedRoutes.map((row) => row.facilityId).filter(Boolean),
          communityIds: [service.subjectId],
          roads: [road.road]
        },
        retainedAlternative: withoutAlternative > 0
          ? {state: 'NO_RETAINED_ALTERNATIVE', text: 'No other current route is stored for this objective.'}
          : {state: 'RETAINED_ALTERNATIVE', routeId: service.remainingOption?.routeId ?? null, minutes: service.remainingOption?.minutes ?? null,
            text: 'Another stored route remains, condition unconfirmed.'},
        sourceCoverage: freshness ? {state: freshness.state === 'EXPIRED' ? 'STALE' : freshness.state === 'CURRENT' ? 'CURRENT' : 'LAST_KNOWN', validUntil: freshness.validUntil ?? null} : null,
        notes: [classification.because],
        at, knownAt: consequence.knownAt ?? at, universe
      });

      needs.push({
        ...need,
        // Consequence-side metadata, carried alongside the requirement so the
        // ordering rationale survives into collection without changing its shape.
        raisedBy: {consequenceId: consequence.id, serviceId: service.serviceId, subjectId: service.subjectId},
        stalenessClass: classification.class,
        stalenessRank: stalenessRank(classification.class),
        whyItMatters: withoutAlternative > 0
          ? `This is the only stored ${service.serviceLabel} route for ${service.subjectName}.`
          : `It carries a stored ${service.serviceLabel} route for ${service.subjectName}.`
      });
    }
  }

  // Deduplicate by requirement identity: the same road for the same incident is
  // one need, however many consequences surfaced it. Most critical first.
  const unique = new Map();
  for (const need of needs) {
    const existing = unique.get(need.id);
    if (!existing || need.stalenessRank < existing.stalenessRank) unique.set(need.id, need);
  }
  return [...unique.values()].sort((left, right) => left.stalenessRank - right.stalenessRank || left.id.localeCompare(right.id));
}

/**
 * Packs needs into the shape `nextVerificationTasks()` expects, so the existing
 * collection tasking runs over them unmodified.
 */
export function asRequirementsResult(needs, {incidentId, at}) {
  return {
    schemaVersion: 'vigia.information-requirements.v1',
    incidentId,
    evaluatedAt: at,
    origin: 'DERIVED_FROM_OPERATIONAL_CONSEQUENCE',
    total: needs.length,
    requirements: needs
  };
}
