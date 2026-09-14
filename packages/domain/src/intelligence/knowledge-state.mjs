import {hash} from './world-knowledge.mjs';
import {operationalSupport} from './operational-support.mjs';

// VIGIA already reasons about the operational world. This module makes it reason
// about the value of what it does NOT know.
//
// An Information Requirement is a first-class operational object: a named missing
// or stale fact, the subject it belongs to, the support relationships and
// communities that currently depend on it, whether a retained alternative exists,
// which VIGIA outputs would change if it were resolved, and where the answer
// could legitimately come from.
//
// Three rules hold throughout:
//   * A requirement never asserts the missing fact. "Unverified" is not "absent",
//     and "no ingested restriction" is not "open".
//   * Every class is bounded. There are no free-form requirement kinds.
//   * Every number is a count of retained objects, never an opinion score.

export const REQUIREMENT_CLASSES = Object.freeze([
  'FACILITY_IDENTITY',
  'FACILITY_CAPABILITY',
  'PUBLIC_CONTACT',
  'ROAD_INFORMATION',
  'RECEPTION_ACTIVATION',
  'OFFICIAL_DESIGNATION',
  'ROUTE_MISSING',
  'SOURCE_STALE',
  'PHYSICAL_OBSERVATION_GAP'
]);

export const LIFECYCLE_STATES = Object.freeze(['OPEN', 'QUEUED', 'IN_PROGRESS', 'RESOLVED', 'BLOCKED', 'EXPIRED']);

// Which VIGIA outputs deterministically depend on each requirement class. This is
// a declared contract, not an inference: if the fact resolves, these are the
// outputs that must be recomputed.
const DEPENDENT_OUTPUTS = Object.freeze({
  FACILITY_CAPABILITY: ['QUALIFIED_NEAREST_RANKING', 'SUPPORT_ALTERNATIVES', 'COMMUNITY_SUPPORT', 'COVERAGE_CLASS', 'OPERATIONAL_SUPPORT_BRIEF', 'INTELLIGENCE_GAPS', 'ASK_ANSWERABILITY'],
  FACILITY_IDENTITY: ['QUALIFIED_NEAREST_RANKING', 'SUPPORT_ALTERNATIVES', 'OPERATIONAL_SUPPORT_BRIEF', 'ASK_ANSWERABILITY'],
  RECEPTION_ACTIVATION: ['RECEPTION_RESULT', 'COMMUNITY_SUPPORT', 'COVERAGE_CLASS', 'INTELLIGENCE_GAPS', 'ASK_ANSWERABILITY'],
  OFFICIAL_DESIGNATION: ['RECEPTION_RESULT', 'SUPPORT_ALTERNATIVES', 'INTELLIGENCE_GAPS'],
  ROAD_INFORMATION: ['SHARED_ROAD_DEPENDENCY', 'OPERATIONAL_SUPPORT_BRIEF', 'INTELLIGENCE_GAPS', 'ASK_ANSWERABILITY'],
  ROUTE_MISSING: ['QUALIFIED_NEAREST_RANKING', 'SUPPORT_ALTERNATIVES', 'COMMUNITY_SUPPORT', 'COVERAGE_CLASS', 'OPERATIONAL_SUPPORT_BRIEF'],
  PUBLIC_CONTACT: ['OPERATIONAL_SUPPORT_BRIEF', 'ASK_ANSWERABILITY'],
  SOURCE_STALE: ['INTELLIGENCE_GAPS', 'OPERATIONAL_SUPPORT_BRIEF', 'ASK_ANSWERABILITY'],
  PHYSICAL_OBSERVATION_GAP: ['INTELLIGENCE_GAPS', 'ASK_ANSWERABILITY']
});

const CRITICAL_CATEGORIES = Object.freeze(['emergency_hospital', 'fire_response']);
const CATEGORY_LABEL = Object.freeze({
  emergency_hospital: 'emergency healthcare',
  fire_response: 'fire response',
  civil_protection: 'civil protection',
  official_refuge: 'official refuge',
  designated_reception: 'reception',
  active_reception: 'reception activation'
});

const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const finite = (value) => Number.isFinite(value) ? value : null;
const requirementId = (incidentId, requirementClass, subjectId, missingFact) => `requirement:${hash([incidentId, requirementClass, subjectId, missingFact]).slice(0, 32)}`;

// --- Knowledge state -------------------------------------------------------
// One normalized input shape, built either from a live situation snapshot or
// from a retained Operational Picture capture. Requirement generation reads only
// this shape, so retained real captures and live snapshots take the same path.

export function knowledgeStateFromSituation(situation, {at = situation?.knownAt} = {}) {
  if (!situation?.incident?.id) throw new Error('situation_required');
  const support = operationalSupport(situation, {at});
  return Object.freeze({
    origin: 'SITUATION_SNAPSHOT',
    incident: situation.incident,
    snapshotId: situation.id ?? null,
    knownAt: situation.knownAt,
    evaluatedAt: at,
    universe: situation.universe ?? 'OPERATIONAL',
    groups: support.groups,
    communities: support.communities,
    corridors: support.corridors,
    relationships: support.relationships,
    facilities: situation.facilities ?? [],
    routes: situation.routes ?? [],
    sources: situation.sources ?? [],
    roadCoverage: situation.roadCoverage ?? null,
    thermal: situation.thermal ?? []
  });
}

export function knowledgeStateFromPicture(picture) {
  if (!picture?.incident?.id || !picture?.support) throw new Error('operational_picture_required');
  // A retained picture carries compacted support and community projections. It
  // has no facility provenance, so facility-level requirements that need
  // provenance are simply not generated from it rather than guessed at.
  return Object.freeze({
    origin: 'RETAINED_OPERATIONAL_PICTURE',
    incident: picture.incident,
    snapshotId: picture.snapshotId ?? null,
    knownAt: picture.knownAt,
    evaluatedAt: picture.evaluatedAt ?? picture.knownAt,
    universe: picture.universe ?? 'CURRENT_RETAINED',
    groups: picture.support.groups ?? [],
    communities: picture.communities ?? [],
    corridors: picture.support.corridors ?? [],
    relationships: (picture.support.corridors ?? []).flatMap((corridor) => corridor.relationships ?? []),
    facilities: [],
    routes: [],
    sources: [],
    roadCoverage: picture.support.corridors?.[0]?.roadInformation ?? null,
    thermal: []
  });
}

// --- Affected-object resolution -------------------------------------------

function communitiesUsingCategory(state, category) {
  return (state.communities ?? []).filter((community) => (community.groups ?? []).some((group) => group.id === category));
}

function communitiesWithSingleOption(state, category) {
  return (state.communities ?? []).filter((community) => {
    const group = (community.groups ?? []).find((item) => item.id === category);
    return group && group.options?.length === 1;
  });
}

function communitiesWithoutOption(state, category) {
  return (state.communities ?? []).filter((community) => {
    const group = (community.groups ?? []).find((item) => item.id === category);
    return group && !group.options?.length;
  });
}

function relationshipsForFacility(state, facilityId) {
  return (state.relationships ?? []).filter((relationship) => relationship.facilityId === facilityId);
}

function relationshipsForRoad(state, road) {
  return (state.relationships ?? []).filter((relationship) => relationship.to === road);
}

function redundancyOf(group) {
  if (!group) return {state: 'NOT_APPLICABLE', count: 0};
  const count = Math.max(0, (group.options?.length ?? 0) - 1);
  return {state: group.redundancy ?? (count === 0 ? 'NO_RETAINED_ALTERNATIVE' : count === 1 ? 'ONE_RETAINED_ALTERNATIVE' : 'MULTIPLE_RETAINED_ALTERNATIVES'), count};
}

export {CRITICAL_CATEGORIES, CATEGORY_LABEL, DEPENDENT_OUTPUTS, finite, requirementId, communitiesWithSingleOption, communitiesWithoutOption, communitiesUsingCategory, relationshipsForFacility, relationshipsForRoad, redundancyOf};
