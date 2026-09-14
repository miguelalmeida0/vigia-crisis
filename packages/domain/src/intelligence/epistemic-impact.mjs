import {hash} from './world-knowledge.mjs';
import {operationalSupport, supportComparison} from './operational-support.mjs';
import {rankFacilities} from './situation-model.mjs';
import {PREVIEW_KINDS, PREVIEW_LABEL, applyBranch, assertPreviewRequest, invalid} from './knowledge-branch.mjs';

// A knowledge-impact preview answers one question: if VIGIA resolved this
// unknown, what would change in what it can already calculate?
//
// It is NOT a scenario about the world. A scenario asks "what if this road
// closes". This asks "what if we learned this fact". The distinction matters:
// nothing here is an observation, a forecast, or a claim about reality, and the
// preview is never written back into operational truth.
//
// Every branch is computed on a deep copy. `operationalWrites` is asserted to be
// zero by the callers' tests, and the input snapshot is never mutated.

export {PREVIEW_LABEL, PREVIEW_KINDS};

function coverageClassification(support, category) {
  const bands = {emergency_hospital: [15, 30], fire_response: [10, 20], designated_reception: [15, 30]}[category];
  if (!bands) return [];
  return (support.communities ?? []).map((community) => {
    const group = (community.groups ?? []).find((item) => item.id === category);
    const minutes = group?.primary?.minutes ?? null;
    return {
      communityId: community.id,
      name: community.name,
      band: minutes === null ? 'no_route' : minutes <= bands[0] ? 'near' : minutes <= bands[1] ? 'middle' : 'long'
    };
  });
}

function rankingDelta(before, after) {
  const rows = [];
  for (const key of Object.keys(after.rankings ?? {})) {
    if (key === 'basis') continue;
    if (JSON.stringify(before.rankings?.[key]) === JSON.stringify(after.rankings?.[key])) continue;
    rows.push({ranking: key, previous: before.rankings?.[key] ?? null, preview: after.rankings?.[key] ?? null});
  }
  return rows;
}

/**
 * Computes the two knowledge branches for one bounded unknown and reports what
 * would differ between them. It never writes, and it never invents a route: a
 * facility that would become qualified but has no retained calculated route
 * still produces no support option, and the preview says so.
 */
export function previewKnowledgeImpact(snapshot, request, {at = snapshot?.knownAt} = {}) {
  if (!snapshot?.incident?.id) throw invalid('situation_required');
  assertPreviewRequest(request);
  const inputFingerprint = hash(snapshot);
  const {branch, facility, category, road} = applyBranch(snapshot, request, at);
  branch.rankings = rankFacilities(branch.facilities, branch.routes ?? []);

  const unresolved = operationalSupport(snapshot, {at});
  const confirmed = operationalSupport(branch, {at});
  const comparison = supportComparison(snapshot, branch);

  const categories = category ? [category] : [...new Set((comparison.changes ?? []).map((change) => change.category))];
  const groupBefore = category ? unresolved.groups.find((group) => group.id === category) : null;
  const groupAfter = category ? confirmed.groups.find((group) => group.id === category) : null;

  const affectedCommunityIds = [...new Set((comparison.changes ?? []).map((change) => change.subjectId).filter((id) => id !== snapshot.incident.id))];
  const coverageBefore = category ? coverageClassification(unresolved, category) : [];
  const coverageAfter = category ? coverageClassification(confirmed, category) : [];
  const coverageChanges = coverageBefore
    .map((row, index) => ({...row, previewBand: coverageAfter[index]?.band ?? null}))
    .filter((row) => row.previewBand !== null && row.previewBand !== row.band);

  const wouldQualifyWithoutRoute = Boolean(
    facility && category && groupAfter
    && (groupAfter.qualifiedIds ?? []).includes(facility.id)
    && !(groupAfter.options ?? []).some((option) => option.facilityId === facility.id)
  );

  const result = {
    schemaVersion: 'vigia.knowledge-impact-preview.v1',
    label: PREVIEW_LABEL,
    universe: 'KNOWLEDGE_PREVIEW',
    observed: false,
    operationalWrites: 0,
    incidentId: snapshot.incident.id,
    snapshotId: snapshot.id ?? null,
    knownAt: snapshot.knownAt,
    evaluatedAt: at,
    assumption: {...structuredClone(request), subjectName: facility?.canonicalName ?? road ?? request.entityId},
    branches: {
      unresolved: {
        state: 'CURRENT_RETAINED_KNOWLEDGE',
        primary: groupBefore?.primary ? {facilityId: groupBefore.primary.facilityId, name: groupBefore.primary.name, minutes: groupBefore.primary.minutes} : null,
        qualifiedCount: groupBefore?.qualifiedCount ?? null,
        optionCount: groupBefore?.options?.length ?? null,
        redundancy: groupBefore?.redundancy ?? null
      },
      confirmed: {
        state: 'ASSUMED_RESOLVED_KNOWLEDGE',
        primary: groupAfter?.primary ? {facilityId: groupAfter.primary.facilityId, name: groupAfter.primary.name, minutes: groupAfter.primary.minutes} : null,
        qualifiedCount: groupAfter?.qualifiedCount ?? null,
        optionCount: groupAfter?.options?.length ?? null,
        redundancy: groupAfter?.redundancy ?? null
      }
    },
    changes: {
      categories,
      supportChanges: comparison.changes ?? [],
      supportChangeCount: (comparison.changes ?? []).length,
      affectedCommunityIds,
      affectedCommunityCount: affectedCommunityIds.length,
      coverageClassificationChanges: coverageChanges,
      coverageClassificationChangeCount: coverageChanges.length,
      rankingChanges: rankingDelta(snapshot, branch),
      primaryChanged: (groupBefore?.primary?.facilityId ?? null) !== (groupAfter?.primary?.facilityId ?? null)
    },
    resolvedNothing: (comparison.changes ?? []).length === 0 && !wouldQualifyWithoutRoute,
    blockedBy: wouldQualifyWithoutRoute
      ? {reason: 'NO_RETAINED_CALCULATED_ROUTE', text: 'Confirming this fact would qualify the facility, but no current calculated route to it is retained, so no support option would appear until one is calculated.'}
      : null,
    mapIntent: category
      ? {type: 'SHOW_COVERAGE', category, validated: true}
      : road
        ? {type: 'FOCUS_ROAD', road, validated: true}
        : null,
    truthBoundary: 'Both branches are calculated from retained data under an explicit assumption. Neither is an observation. No operational fact, snapshot, ranking or history is modified, and the assumption is discarded with this response.'
  };

  // The input must be byte-identical after the preview: a preview that mutated
  // the snapshot it previewed would have corrupted operational truth.
  if (hash(snapshot) !== inputFingerprint) throw new Error('knowledge_preview_mutated_input');
  return Object.freeze(result);
}

/**
 * Turns an information requirement into the bounded preview request it supports,
 * or explains why no preview is available for it.
 */
export function previewRequestForRequirement(requirement) {
  if (requirement?.requirementClass === 'FACILITY_CAPABILITY' && requirement.subject?.kind === 'FACILITY') {
    const capability = requirement.missingFact === 'capabilities.emergencyDepartment' ? 'emergencyDepartment' : 'fireResponse';
    return {kind: 'FACILITY_CAPABILITY_CONFIRMED', entityId: requirement.subject.id, capability};
  }
  if (requirement?.requirementClass === 'RECEPTION_ACTIVATION' && requirement.subject?.kind === 'FACILITY') {
    return {kind: 'RECEPTION_ACTIVATION_CONFIRMED', entityId: requirement.subject.id};
  }
  if (requirement?.requirementClass === 'FACILITY_IDENTITY' && requirement.subject?.kind === 'FACILITY') {
    return {kind: 'FACILITY_IDENTITY_RESOLVED', entityId: requirement.subject.id};
  }
  if (requirement?.requirementClass === 'ROAD_INFORMATION' && requirement.subject?.kind === 'ROAD') {
    return {kind: 'ROAD_INFORMATION_COVERED', entityId: requirement.subject.id};
  }
  return null;
}
