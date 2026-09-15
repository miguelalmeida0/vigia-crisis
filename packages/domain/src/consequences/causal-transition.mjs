import {hash} from '../intelligence/world-knowledge.mjs';
import {SERVICE_LABELS} from './canonical-inputs.mjs';

// TEMPORAL CAUSAL REASONING.
//
// Two projections of the same incident, and the question between them: what
// changed, and did this change that, or did they merely both happen?
//
// THE RULE THIS MODULE EXISTS TO ENFORCE: causality is asserted only where the
// derivation proves the dependency. Nothing in this file may conclude "because"
// from timestamp order. Two things changing in the same projection is a
// coincidence until the consequence engine's own provenance links them.

export const CAUSAL_RELATIONS = Object.freeze([
  // The consequence engine derived this dependency: the trigger reached this
  // route, and the mission engine independently linked that route to the mission.
  {key: 'CAUSED', connective: 'because', strength: 'DERIVED_DEPENDENCY'},
  // Changed in the same projection, with no derived dependency to the trigger.
  {key: 'FOLLOWED', connective: 'after', strength: 'SAME_PROJECTION_ONLY'},
  // Something related moved, but whether it is connected is not established.
  {key: 'MAY_REQUIRE_REVIEW', connective: 'alongside', strength: 'NOT_ESTABLISHED'}
]);

const CHAIN_STEPS = Object.freeze(['TRIGGER', 'ROAD_DEPENDENCY', 'ROUTE_AVAILABILITY', 'MISSION_STATE']);
const relationOf = (key) => CAUSAL_RELATIONS.find((row) => row.key === key) ?? CAUSAL_RELATIONS[2];
const byId = (rows) => new Map((rows ?? []).map((row) => [row.id, row]));
const consequenceSignature = (row) => hash([row.tier, row.state, row.remainingOptionCount,
  (row.serviceImpacts ?? []).map((service) => [service.serviceId, service.remainingOptionCount, service.tier])]);

/**
 * Whether the current projection PROVES that `trigger` changed `missionId`.
 *
 * Requires all three, and never looks at a clock:
 *   1. a consequence carrying that trigger names the mission in its provenance,
 *   2. the mission impact is primary-affected or was linked by the mission
 *      engine itself, and
 *   3. the mission's state actually differs between projections.
 */
function provenCause(consequence, missionId, changed) {
  if (!changed) return false;
  if (!consequence?.provenance?.missionIds?.includes(missionId)) return false;
  const impact = (consequence.serviceImpacts ?? [])
    .flatMap((service) => service.missionImpacts ?? [])
    .find((row) => row.missionId === missionId);
  return Boolean(impact && (impact.primaryAffected || impact.flaggedByMissionEngine));
}

function missionChain(consequence, impact, transition) {
  const road = consequence.roads?.[0]?.road ?? consequence.trigger?.locationName ?? 'the reported location';
  const service = (consequence.serviceImpacts ?? []).find((row) => (row.missionImpacts ?? []).some((m) => m.missionId === impact.missionId));
  const option = service?.remainingOption
    ? `another stored route remains (${Math.round(service.remainingOption.minutes)} min, condition unconfirmed)`
    : 'no other current route is stored';
  return [
    {step: 'TRIGGER', id: consequence.trigger?.reportId ?? consequence.trigger?.restrictionId ?? consequence.id,
      text: consequence.explanation?.whatChanged ?? 'A change was recorded.', relation: null},
    {step: 'ROAD_DEPENDENCY', id: road,
      text: `${road} carries the stored ${service?.serviceLabel ?? 'service'} route for ${service?.subjectName ?? 'this subject'}.`, relation: transition.relation},
    {step: 'ROUTE_AVAILABILITY', id: impact.currentRouteId,
      text: `The stored route was affected and ${option}.`, relation: transition.relation},
    {step: 'MISSION_STATE', id: impact.missionId,
      text: `${impact.subjectName} ${service?.serviceLabel ?? impact.service} moved ${transition.previousState} → ${transition.currentState}.`, relation: transition.relation}
  ];
}

/**
 * Compares two projections and returns one reproducible causal transition.
 *
 * A projection is `{at, incidentId, snapshotId, consequences, missions}` where
 * `consequences` is an operationalConsequences() result and `missions` are
 * evaluateMission() outputs.
 */
export function causalTransition({previous, current}) {
  if (!current?.at) throw Object.assign(new Error('causal_transition_current_projection_required'), {statusCode: 400});
  if (previous?.at && Date.parse(current.at) < Date.parse(previous.at)) {
    throw Object.assign(new Error('causal_transition_requires_forward_time'), {statusCode: 400});
  }

  const before = byId(previous?.consequences?.consequences);
  const after = byId(current?.consequences?.consequences);
  const previousMissions = new Map((previous?.missions ?? []).map((row) => [row.id, row]));

  const consequencesAdded = [...after.keys()].filter((id) => !before.has(id)).sort();
  const consequencesResolved = [...before.keys()].filter((id) => !after.has(id)).sort();
  const consequencesChanged = [...after.keys()].filter((id) => before.has(id)
    && consequenceSignature(before.get(id)) !== consequenceSignature(after.get(id))).sort();

  const missionTransitions = (current?.missions ?? []).map((mission) => {
    const prior = previousMissions.get(mission.id) ?? null;
    const previousState = prior?.state ?? 'NOT_PREVIOUSLY_PROJECTED';
    const changed = Boolean(prior) && prior.state !== mission.state;
    // Find the consequence that PROVES this change, if one does.
    const cause = [...after.values()].find((row) => provenCause(row, mission.id, changed)) ?? null;
    const relation = cause ? 'CAUSED' : changed ? 'FOLLOWED' : 'MAY_REQUIRE_REVIEW';
    const impact = cause
      ? (cause.serviceImpacts ?? []).flatMap((service) => service.missionImpacts ?? []).find((row) => row.missionId === mission.id)
      : null;
    const transition = {
      missionId: mission.id, objective: mission.objective, subjectName: mission.subjectName, service: mission.service,
      // Operator-facing label. The raw service id must never reach a sentence.
      serviceLabel: SERVICE_LABELS[mission.service] ?? mission.service,
      previousState, currentState: mission.state, changed,
      relation, connective: relationOf(relation).connective, evidenceStrength: relationOf(relation).strength,
      causedByConsequenceId: cause?.id ?? null,
      reason: mission.reason,
      factsUsed: cause ? cause.provenance : null
    };
    return {...transition, chain: cause && impact ? missionChain(cause, impact, transition) : []};
  }).filter((row) => row.changed || row.relation === 'CAUSED')
    .sort((left, right) => left.missionId.localeCompare(right.missionId));

  const changedRelationships = consequencesAdded.map((id) => {
    const row = after.get(id);
    return {consequenceId: id, roads: row.roads.map((road) => road.road),
      routeIds: row.provenance.routeIds, serviceIds: row.provenance.serviceIds, missionIds: row.provenance.missionIds};
  });

  const caused = missionTransitions.filter((row) => row.relation === 'CAUSED');
  return {
    schemaVersion: 'vigia.causal-transition.v1',
    transitionId: `transition:${hash([current.incidentId, previous?.at ?? null, current.at, consequencesAdded, consequencesResolved, missionTransitions.map((row) => [row.missionId, row.previousState, row.currentState])])}`.slice(0, 48),
    incidentId: current.incidentId,
    previousProjectionRef: previous ? {at: previous.at, snapshotId: previous.snapshotId ?? null} : null,
    currentProjectionRef: {at: current.at, snapshotId: current.snapshotId ?? null},
    observedAt: [...after.values()].map((row) => row.observedAt).filter(Boolean).sort()[0] ?? null,
    knownAt: current.at,
    generatedAt: current.at,
    consequencesAdded, consequencesResolved, consequencesChanged,
    changedRelationships,
    missionTransitions,
    whatChanged: consequencesAdded.map((id) => after.get(id).explanation?.whatChanged).filter(Boolean),
    // Only proven links are phrased as causes. Everything else says "after".
    whyItChanged: caused.map((row) => `${row.subjectName} ${row.serviceLabel} moved ${row.previousState} → ${row.currentState} ${row.connective} ${after.get(row.causedByConsequenceId)?.explanation?.whatChanged ?? 'a derived dependency changed.'}`),
    unexplainedChanges: missionTransitions.filter((row) => row.relation === 'FOLLOWED')
      .map((row) => `${row.subjectName} ${row.serviceLabel} moved ${row.previousState} → ${row.currentState} after this projection. No derived dependency links it to the reported change.`),
    factsUsed: [...new Set(caused.flatMap((row) => [...(row.factsUsed?.reportIds ?? []), ...(row.factsUsed?.restrictionIds ?? [])]))].sort(),
    truthBoundary: 'A transition compares two projections of retained records. A change is stated as a cause only where the derivation established the dependency; everything else is reported as having changed after, not because.'
  };
}
