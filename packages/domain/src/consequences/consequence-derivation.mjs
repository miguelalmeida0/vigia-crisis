import {hash} from '../intelligence/world-knowledge.mjs';
import {verification} from '../fieldnet/mission-command.mjs';
import {describeSharedDependency, sharedRoadDependencies} from './shared-dependency.mjs';
import {orderOperationalPriorities} from './priority-ordering.mjs';

// Layers 3 and 4: CONSEQUENCE DERIVATION and MISSION IMPACT.
//
// One consequence is produced per trigger. It spans every service the trigger
// reaches, because the operational point of the EM527 case is precisely that one
// road is not one service's problem.
//
// Mission state is never recomputed here. It is read from what evaluateMission()
// already concluded. A second opinion on mission state would be a second mission
// scoring system, and two of those is one too many.

/** Stable identity for a consequence: same canonical facts, same id. */
const consequenceId = (trigger, incidentId) => `consequence:${hash([incidentId, trigger.triggerId, trigger.observedAt, trigger.roads.map((row) => row.road)])}`.slice(0, 48);

function missionImpact(mission, affectedRouteIds, trigger) {
  const primaryAffected = Boolean(mission.currentRouteId && affectedRouteIds.has(mission.currentRouteId));
  const flaggedByMissionEngine = (mission.relevantReports ?? []).some((report) => report.id === trigger.reportId);
  const fallback = mission.fallback ?? null;
  return {
    missionId: mission.id,
    objective: mission.objective,
    subjectName: mission.subjectName,
    service: mission.service,
    lifecycle: mission.lifecycle,
    // Read from the mission engine, not decided here.
    state: mission.state,
    reason: mission.reason,
    previousState: mission.previousState ?? null,
    changedAt: mission.stateChangedAt ?? null,
    primaryAffected,
    flaggedByMissionEngine,
    currentRouteId: mission.currentRouteId ?? null,
    currentMinutes: Number.isFinite(mission.currentRoute?.minutes) ? mission.currentRoute.minutes : null,
    // "No other current route is stored" is only ever said when the mission
    // engine's own usable-route rule returned nothing. It is an established
    // absence, not an unknown treated as a zero.
    remainingOptionCount: Number.isFinite(mission.alternativeCount) ? mission.alternativeCount : (fallback ? 1 : 0),
    remainingOption: fallback ? {routeId: fallback.id, facilityName: fallback.name, minutes: fallback.minutes} : null,
    remainingOptionState: fallback ? 'ANOTHER_STORED_ROUTE_RETAINED' : 'NO_OTHER_CURRENT_ROUTE_STORED',
    alternativeCondition: fallback ? 'Condition of the alternative is not confirmed.' : null
  };
}

function tierFor(missionImpacts, serviceCount, trigger) {
  const active = missionImpacts.filter((row) => row.lifecycle === 'ACTIVE');
  const lost = active.filter((row) => ['PROBLEM', 'UNKNOWN'].includes(row.state) && row.primaryAffected);
  if (lost.some((row) => row.remainingOptionCount === 0)) return 'ACTIVE_MISSION_NO_REMAINING_OPTION';
  if (lost.length) return 'ACTIVE_MISSION_ALTERNATIVE_RETAINED';
  if (serviceCount > 1) return 'SHARED_DEPENDENCY_ACROSS_SERVICES';
  if (active.some((row) => row.state === 'WATCH') || (trigger.blocking && active.length)) return 'MATERIAL_OBSERVATION_ON_WATCHED_ROUTE';
  return 'UNRESOLVED_OR_STALE_DEPENDENCY';
}

function serviceImpact(service, trigger, serviceCount) {
  const affectedRouteIds = new Set(service.affectedRoutes.map((link) => link.routeId));
  const missionImpacts = service.missions.map((mission) => missionImpact(mission, affectedRouteIds, trigger));
  const redundancy = sharedRoadDependencies(service.storedRoutes);
  const worst = missionImpacts
    .filter((row) => row.lifecycle === 'ACTIVE')
    .sort((left, right) => left.remainingOptionCount - right.remainingOptionCount)[0] ?? null;
  return {
    id: `${trigger.triggerId}::${service.serviceSubjectKey}`,
    label: `${service.subjectName} ${service.serviceLabel}`,
    serviceId: service.serviceId,
    serviceLabel: service.serviceLabel,
    subjectId: service.subjectId,
    subjectName: service.subjectName,
    primaryAffected: missionImpacts.some((row) => row.primaryAffected),
    affectedRoutes: service.affectedRoutes.map((link) => ({routeId: link.routeId, facilityId: link.row.facilityId, facilityName: link.row.facilityName, minutes: link.row.minutes, basis: link.basis})),
    storedRouteCount: service.storedRoutes.length,
    // Carried up from the mission engine so the whole pipeline agrees on what
    // "another route remains" means.
    remainingOptionCount: worst ? worst.remainingOptionCount : null,
    remainingOption: worst?.remainingOption ?? null,
    remainingOptionState: worst?.remainingOptionState ?? 'NO_WATCHED_OBJECTIVE_FOR_THIS_SERVICE',
    redundancy,
    sharedDependency: describeSharedDependency(redundancy),
    missionImpacts,
    affectedMissionCount: missionImpacts.filter((row) => row.lifecycle === 'ACTIVE').length,
    affectedServiceCount: serviceCount,
    observedAt: trigger.observedAt,
    tier: tierFor(missionImpacts, serviceCount, trigger)
  };
}

function provenanceFor(trigger, services) {
  const collect = (read) => [...new Set(services.flatMap(read))].sort();
  return {
    reportIds: trigger.reportId ? [trigger.reportId] : [],
    restrictionIds: trigger.restrictionId ? [trigger.restrictionId] : [],
    confirmationIds: (trigger.confirmations ?? []).map((row) => row.id).sort(),
    missionIds: collect((service) => service.missionImpacts.map((row) => row.missionId)),
    routeIds: collect((service) => service.affectedRoutes.map((row) => row.routeId)),
    facilityIds: collect((service) => service.affectedRoutes.map((row) => row.facilityId).filter(Boolean)),
    roadRefs: trigger.roads.map((row) => row.road),
    serviceIds: collect((service) => [service.serviceId]),
    subjectIds: collect((service) => [service.subjectId])
  };
}

/**
 * Derives one consequence per trigger, with its services already ordered by the
 * same deterministic rules that order consequences against each other.
 */
export function deriveConsequences(relationships, {incidentId, snapshotId = null, generatedAt}) {
  return relationships.triggers.map((trigger) => {
    const serviceCount = trigger.services.length;
    const services = orderOperationalPriorities(trigger.services.map((service) => serviceImpact(service, trigger, serviceCount)));
    const worst = services[0] ?? null;
    return {
      schemaVersion: 'vigia.operational-consequence.v1',
      id: consequenceId(trigger, incidentId),
      incidentId,
      snapshotId,
      kind: trigger.kind,
      // Never "closed". A field report is an observation until an admitted
      // restriction says otherwise, and this field is what the wording is
      // generated from.
      authority: trigger.authority,
      establishesOfficialClosure: trigger.establishesOfficialClosure,
      state: trigger.expired ? 'NEEDS_RECHECK' : worst ? 'ACTIVE' : 'NO_OPERATIONAL_LINK',
      roads: trigger.roads,
      trigger: {
        triggerId: trigger.triggerId,
        reportId: trigger.reportId ?? null,
        restrictionId: trigger.restrictionId ?? null,
        reportType: trigger.reportType ?? null,
        reporterName: trigger.reporterName ?? null,
        locationName: trigger.locationName ?? null,
        verification: trigger.reportId ? verification({id: trigger.reportId, senderId: null}, trigger.confirmations).state : 'OFFICIAL_SOURCE'
      },
      observedAt: trigger.observedAt,
      receivedAt: trigger.receivedAt,
      knownAt: relationships.at,
      generatedAt,
      expired: trigger.expired,
      serviceImpacts: services,
      affectedServiceCount: serviceCount,
      affectedMissionCount: services.reduce((total, service) => total + service.affectedMissionCount, 0),
      sharedDependencies: services.flatMap((service) => (service.sharedDependency ? [{serviceId: service.serviceId, subjectId: service.subjectId, ...service.sharedDependency}] : [])),
      // Ordering keys, so a consequence can be ranked against other consequences
      // by exactly the same comparator that ranked its services.
      label: worst ? `${worst.subjectName} ${worst.serviceLabel}` : trigger.locationName ?? trigger.triggerId,
      tier: worst?.tier ?? 'UNRESOLVED_OR_STALE_DEPENDENCY',
      remainingOptionCount: worst?.remainingOptionCount ?? null,
      provenance: provenanceFor(trigger, services)
    };
  });
}
