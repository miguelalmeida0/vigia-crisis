import {CATEGORY_LABEL, CRITICAL_CATEGORIES, communitiesWithoutOption, communitiesWithSingleOption, finite, redundancyOf, relationshipsForFacility} from './knowledge-state.mjs';
import {requirement} from './requirement-record.mjs';

// Requirements about facilities: unverified capability, the critical category
// with no retained alternative and its unresolved candidates, unresolved
// identity, and missing published contact.

function capabilityRequirements(state) {
  const rows = [];
  const categoryOfType = {hospital: 'emergency_hospital', fire_station: 'fire_response'};
  const factOfType = {hospital: 'capabilities.emergencyDepartment', fire_station: 'capabilities.fireResponse'};
  for (const facility of state.facilities) {
    const category = categoryOfType[facility.canonicalType];
    if (!category) continue;
    const missingFact = factOfType[facility.canonicalType];
    const field = facility.fields?.[missingFact];
    if (field?.state === 'RESOLVED' && facility.capabilities?.[missingFact.split('.')[1]] === true) continue;
    const group = state.groups.find((item) => item.id === category);
    const knownState = field?.state === 'STALE' ? 'STALE' : field?.state === 'RESOLVED' ? 'RESOLVED_NEGATIVE' : 'NOT_RESOLVED';
    rows.push(requirement({
      state,
      requirementClass: 'FACILITY_CAPABILITY',
      subject: {id: facility.id, kind: 'FACILITY', name: facility.canonicalName ?? facility.id, canonicalType: facility.canonicalType, distanceKm: finite(facility.distanceKm)},
      missingFact,
      question: `Is ${missingFact === 'capabilities.emergencyDepartment' ? 'an emergency department' : 'fire-response capability'} verified for ${facility.canonicalName ?? facility.id}?`,
      currentKnownState: {
        state: knownState,
        value: facility.capabilities?.[missingFact.split('.')[1]] ?? null,
        reason: knownState === 'STALE' ? 'A previously accepted fact is no longer valid at this evaluation time.' : knownState === 'RESOLVED_NEGATIVE' ? 'An accepted fact states this capability is not present.' : 'No accepted authoritative fact has resolved this capability.',
        checkedAt: field?.checkedAt ?? null,
        retainedRouteExists: Boolean(routeIdForFacility(state, facility.id))
      },
      affected: {
        categories: [category],
        communityIds: communitiesWithSingleOption(state, category).map((community) => community.id).concat(communitiesWithoutOption(state, category).map((community) => community.id)),
        supportRelationshipIds: relationshipsForFacility(state, group?.primary?.facilityId).map((relationship) => relationship.id),
        facilityIds: [facility.id, group?.primary?.facilityId].filter(Boolean)
      },
      retainedAlternative: redundancyOf(group),
      notes: knownState === 'RESOLVED_NEGATIVE' ? ['An accepted negative fact is a resolved answer, not a missing one; it is retained here only because the qualified set has no alternative.'] : []
    }));
  }
  return rows;
}

// A critical support category with no retained alternative is itself an
// information requirement: the operator's question is not "which facility is
// primary?" but "which nearby mapped candidate could become a second option?".
// The candidates named here are facilities of the right type whose capability is
// unresolved; naming one is not a claim that it has the capability.
function categoryCapabilityRequirements(state) {
  const rows = [];
  const typeOfCategory = {emergency_hospital: 'hospital', fire_response: 'fire_station'};
  const factOfCategory = {emergency_hospital: 'capabilities.emergencyDepartment', fire_response: 'capabilities.fireResponse'};
  for (const category of CRITICAL_CATEGORIES) {
    const group = state.groups.find((item) => item.id === category);
    if (!group || (group.qualifiedCount ?? 0) > 1) continue;
    const qualifiedIds = new Set(group.qualifiedIds ?? []);
    const candidates = state.facilities
      .filter((facility) => facility.canonicalType === typeOfCategory[category] && !qualifiedIds.has(facility.id))
      .map((facility) => ({
        facilityId: facility.id,
        name: facility.canonicalName ?? facility.id,
        distanceKm: finite(facility.distanceKm),
        capabilityState: facility.fields?.[factOfCategory[category]]?.state ?? 'NOT_RESOLVED',
        retainedRouteExists: Boolean(routeIdForFacility(state, facility.id))
      }))
      .sort((left, right) => (left.distanceKm ?? Infinity) - (right.distanceKm ?? Infinity) || left.facilityId.localeCompare(right.facilityId));
    const primaryDistanceKm = finite(group.primary?.distanceKm);
    rows.push(requirement({
      state,
      requirementClass: 'FACILITY_CAPABILITY',
      subject: {id: category, kind: 'SUPPORT_CATEGORY', name: group.label},
      missingFact: factOfCategory[category],
      question: `Which nearby mapped ${category === 'emergency_hospital' ? 'hospitals have a verified emergency department' : 'fire stations have verified fire-response capability'}?`,
      currentKnownState: {
        state: group.qualifiedCount ? 'SINGLE_QUALIFIED_OPTION' : 'NO_QUALIFIED_OPTION',
        value: null,
        reason: group.qualifiedCount
          ? `One ${CATEGORY_LABEL[category]} facility is qualified in the retained set. No second qualified option is retained.`
          : `No ${CATEGORY_LABEL[category]} facility is qualified in the retained set.`,
        checkedAt: null,
        qualifiedFacilityCount: group.qualifiedCount ?? 0,
        primaryFacilityId: group.primary?.facilityId ?? null,
        primaryName: group.primary?.name ?? null,
        primaryDistanceKm,
        candidates: candidates.slice(0, 10),
        candidateState: state.facilities.length ? (candidates.length ? 'UNRESOLVED_CANDIDATES_RETAINED' : 'NO_UNRESOLVED_CANDIDATE_RETAINED') : 'CANDIDATE_SET_NOT_AVAILABLE_IN_THIS_PROJECTION'
      },
      affected: {
        categories: [category],
        communityIds: [...communitiesWithSingleOption(state, category), ...communitiesWithoutOption(state, category)].map((community) => community.id),
        supportRelationshipIds: relationshipsForFacility(state, group.primary?.facilityId).map((relationship) => relationship.id),
        facilityIds: [group.primary?.facilityId, ...candidates.map((candidate) => candidate.facilityId)].filter(Boolean)
      },
      retainedAlternative: redundancyOf(group)
    }));
  }
  return rows;
}

// A retained route may exist for a facility that is not currently qualified; that
// is exactly what makes it a verifiable candidate rather than a dead end.
function routeIdForFacility(state, facilityId) {
  const option = routeForFacility(state, facilityId);
  if (option) return option.routeId;
  return (state.routes ?? []).find((route) => route.facilityId === facilityId)?.id ?? null;
}

function routeForFacility(state, facilityId) {
  return (state.groups ?? []).flatMap((group) => group.options ?? []).find((option) => option.facilityId === facilityId) ?? null;
}

function identityAndContactRequirements(state) {
  const rows = [];
  const qualifiedIds = new Set(state.groups.flatMap((group) => group.qualifiedIds ?? []));
  for (const facility of state.facilities) {
    if (!qualifiedIds.has(facility.id)) continue;
    if (!facility.contact?.phone) {
      rows.push(requirement({
        state,
        requirementClass: 'PUBLIC_CONTACT',
        subject: {id: facility.id, kind: 'FACILITY', name: facility.canonicalName ?? facility.id, canonicalType: facility.canonicalType, distanceKm: finite(facility.distanceKm)},
        missingFact: 'contact.phone',
        question: `Is a published public contact number retained for ${facility.canonicalName ?? facility.id}?`,
        currentKnownState: {state: 'NOT_RETAINED', value: null, reason: 'No accepted public contact fact is retained for this qualified facility.', checkedAt: null},
        affected: {categories: state.groups.filter((group) => (group.qualifiedIds ?? []).includes(facility.id)).map((group) => group.id), communityIds: [], supportRelationshipIds: relationshipsForFacility(state, facility.id).map((relationship) => relationship.id), facilityIds: [facility.id]},
        retainedAlternative: {state: 'NOT_APPLICABLE', count: 0}
      }));
    }
    if (facility.resolutionState && facility.resolutionState !== 'RESOLVED') {
      rows.push(requirement({
        state,
        requirementClass: 'FACILITY_IDENTITY',
        subject: {id: facility.id, kind: 'FACILITY', name: facility.canonicalName ?? facility.id, canonicalType: facility.canonicalType, distanceKm: finite(facility.distanceKm)},
        missingFact: 'canonicalIdentity',
        question: `Is the canonical identity of ${facility.canonicalName ?? facility.id} resolved?`,
        currentKnownState: {state: facility.resolutionState, value: null, reason: 'The canonical identity of this facility is not fully resolved, so its retained facts may belong to more than one real object.', checkedAt: null},
        affected: {categories: state.groups.filter((group) => (group.qualifiedIds ?? []).includes(facility.id)).map((group) => group.id), communityIds: [], supportRelationshipIds: relationshipsForFacility(state, facility.id).map((relationship) => relationship.id), facilityIds: [facility.id]},
        retainedAlternative: {state: 'NOT_APPLICABLE', count: 0}
      }));
    }
  }
  return rows;
}

export {capabilityRequirements, categoryCapabilityRequirements, identityAndContactRequirements, routeIdForFacility, routeForFacility};
