import {CATEGORY_LABEL, communitiesWithoutOption, finite, redundancyOf, relationshipsForFacility, relationshipsForRoad} from './knowledge-state.mjs';
import {requirement} from './requirement-record.mjs';

// Requirements about the context a facility sits in: a qualified set with no
// current calculated route, designated reception without confirmed activation,
// corridors outside the connected road-information coverage, and stale sources.

function routeRequirements(state) {
  const rows = [];
  for (const group of state.groups) {
    if (!['emergency_hospital', 'fire_response', 'designated_reception', 'civil_protection'].includes(group.id)) continue;
    if (!group.qualifiedCount || group.options?.length) continue;
    rows.push(requirement({
      state,
      requirementClass: 'ROUTE_MISSING',
      subject: {id: group.id, kind: 'SUPPORT_CATEGORY', name: group.label},
      missingFact: 'route.currentCalculatedEstimate',
      question: `Is a current calculated route retained for any of the ${group.qualifiedCount} qualified ${CATEGORY_LABEL[group.id] ?? group.id} options?`,
      currentKnownState: {
        state: 'NOT_RETAINED',
        value: null,
        reason: `${group.qualifiedCount} qualified ${CATEGORY_LABEL[group.id] ?? group.id} facilities are retained, but no calculated route to them is current at this evaluation time.`,
        checkedAt: null,
        qualifiedFacilityCount: group.qualifiedCount
      },
      affected: {
        categories: [group.id],
        communityIds: communitiesWithoutOption(state, group.id).map((community) => community.id),
        supportRelationshipIds: [],
        facilityIds: group.qualifiedIds ?? []
      },
      retainedAlternative: {state: 'NOT_APPLICABLE', count: 0}
    }));
  }
  return rows;
}

function receptionRequirements(state) {
  const designated = state.groups.find((group) => group.id === 'designated_reception');
  const active = state.groups.find((group) => group.id === 'active_reception');
  if (!designated?.qualifiedCount || active?.qualifiedCount) return [];
  const nearby = (state.communities ?? []).filter((community) => (community.nearbyDesignations ?? []).length && !(community.nearbyDesignations ?? []).some((item) => item.activationConfirmed));
  const candidate = designated.primary ?? null;
  return [requirement({
    state,
    requirementClass: 'RECEPTION_ACTIVATION',
    subject: candidate
      ? {id: candidate.facilityId, kind: 'FACILITY', name: candidate.name, canonicalType: 'reception', distanceKm: finite(candidate.distanceKm)}
      : {id: 'designated_reception', kind: 'SUPPORT_CATEGORY', name: designated.label},
    missingFact: 'activation.state',
    question: `Is reception activation confirmed for ${candidate ? candidate.name : 'any designated reception location'}?`,
    currentKnownState: {
      state: 'DESIGNATED_ACTIVATION_UNCONFIRMED',
      value: null,
      reason: 'Official designation is retained. Designation is not activation, and no current activation fact is retained.',
      checkedAt: null,
      designatedCount: designated.qualifiedCount
    },
    affected: {
      categories: ['designated_reception', 'active_reception'],
      communityIds: nearby.map((community) => community.id),
      supportRelationshipIds: candidate ? relationshipsForFacility(state, candidate.facilityId).map((relationship) => relationship.id) : [],
      facilityIds: designated.qualifiedIds ?? []
    },
    retainedAlternative: redundancyOf(designated)
  })];
}

function roadRequirements(state) {
  const rows = [];
  for (const corridor of (state.corridors ?? []).slice(0, 8)) {
    const information = corridor.roadInformation ?? routeRoadInformation(state, corridor.road) ?? state.roadCoverage ?? null;
    const informationState = information?.state ?? 'UNAVAILABLE';
    if (informationState === 'INGESTED_RESTRICTION' || informationState === 'NO_INGESTED_RESTRICTION') continue;
    const relationships = relationshipsForRoad(state, corridor.road);
    const relationshipRows = relationships.length ? relationships : (corridor.relationships ?? []);
    rows.push(requirement({
      state,
      requirementClass: 'ROAD_INFORMATION',
      subject: {id: corridor.road, kind: 'ROAD', name: corridor.road},
      missingFact: 'road.informationState',
      question: `What is the current published road-information state for ${corridor.road}?`,
      currentKnownState: {
        state: informationState,
        value: null,
        reason: informationState === 'PARTIAL_COVERAGE'
          ? 'The connected road source does not cover every road on these calculated routes. No matched restriction is not confirmation that the road is open.'
          : informationState === 'LAST_KNOWN'
            ? 'Road information is retained but out of date at this evaluation time.'
            : 'No connected road-information coverage applies to these calculated routes.',
        checkedAt: information?.checkedAt ?? null
      },
      affected: {
        categories: [...new Set(relationshipRows.map((relationship) => relationship.category).filter(Boolean))],
        communityIds: [...new Set(relationshipRows.map((relationship) => relationship.subjectId).filter((id) => id && id !== state.incident.id))],
        supportRelationshipIds: relationshipRows.map((relationship) => relationship.id).filter(Boolean),
        facilityIds: [...new Set(relationshipRows.map((relationship) => relationship.facilityId).filter(Boolean))],
        roads: [corridor.road]
      },
      retainedAlternative: {state: 'NOT_APPLICABLE', count: 0},
      sourceCoverage: information ? {state: informationState, checkedAt: information.checkedAt ?? null, limitation: information.limitation ?? null} : null
    }));
  }
  return rows;
}

// The authoritative information state for a corridor is the one the retained
// route evaluation produced for the routes that actually use it, not the raw
// coverage configuration. The most degraded state among them wins: partial
// coverage on any dependent route is partial coverage for the corridor.
const ROAD_STATE_SEVERITY = Object.freeze(['NO_INGESTED_RESTRICTION', 'PARTIAL_COVERAGE', 'LAST_KNOWN', 'NOT_CONNECTED', 'UNAVAILABLE', 'INGESTED_RESTRICTION']);
function routeRoadInformation(state, road) {
  const rows = (state.groups ?? [])
    .flatMap((group) => group.options ?? [])
    .filter((option) => (option.roads ?? []).includes(road) && option.roadInformation)
    .map((option) => option.roadInformation);
  if (!rows.length) return null;
  return rows.sort((left, right) => ROAD_STATE_SEVERITY.indexOf(right.state) - ROAD_STATE_SEVERITY.indexOf(left.state))[0];
}

function sourceRequirements(state) {
  return (state.sources ?? []).filter((source) => source.state && source.state !== 'CURRENT').map((source) => requirement({
    state,
    requirementClass: 'SOURCE_STALE',
    subject: {id: source.id, kind: 'SOURCE', name: source.name ?? source.provider ?? source.id},
    missingFact: 'source.currentRetrieval',
    question: `Has ${source.name ?? source.provider ?? source.id} been retrieved successfully within its expected refresh interval?`,
    currentKnownState: {
      state: source.state,
      value: null,
      reason: source.state === 'STALE' ? 'The last successful retrieval is older than this source’s expected refresh interval.' : source.state === 'LAST_KNOWN' ? 'The source is failing; only a previous successful retrieval is retained.' : 'No successful retrieval is retained for this source.',
      checkedAt: source.lastSuccessfulRefresh ?? null
    },
    affected: {categories: [], communityIds: [], supportRelationshipIds: [], facilityIds: []},
    retainedAlternative: {state: 'NOT_APPLICABLE', count: 0},
    sourceCoverage: {state: source.state, checkedAt: source.lastSuccessfulRefresh ?? null, expectedRefreshMs: source.expectedRefreshMs ?? null}
  }));
}


export {routeRequirements, receptionRequirements, roadRequirements, sourceRequirements};
