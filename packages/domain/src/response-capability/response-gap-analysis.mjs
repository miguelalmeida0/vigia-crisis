import { semanticHash } from '../intelligence/shared.mjs';
import { finiteCount } from './capacity-contract.mjs';
import {
  hasAvailableFireCapacity, hasAvailableHospitalCapacity, hasKnownFireCapacity,
  hasKnownHospitalCapacity, responseCapabilityQualified,
} from './facility-truth.mjs';

function responseGap(code, state, why, impact, action, requirementIds = []) {
  return { id: semanticHash('response-gap', { code, why }).slice(0, 45), code, state, why, impact, whatVigiaIsDoing: action, recommendedAction: action, nextAction: action, informationRequirementIds: requirementIds };
}

export function buildResponseGaps({ facilities, fireStations, hospitals, fireWithin30, relevantFire, relevantHospitals, requirements, decisionContext, roadContext }) {
  const requirementByFacility = new Map(requirements.map((requirement) => [requirement.subjectId, requirement]));
    const gaps = [];
    if (!fireStations.length) gaps.push(responseGap('FIRE_STATION_CONTEXT_UNAVAILABLE', 'UNKNOWN', 'No governed fire-station record is available in the covered source set.', 'Fire response travel time and capability cannot be assessed.', 'Acquire an attributable fire-response facility source.'));
    else if (!fireStations.some((item) => item.reachability?.state === 'ROUTED')) gaps.push(responseGap('FIRE_REACHABILITY_UNAVAILABLE', 'UNKNOWN', 'Road-network routing did not return a fire-station route.', 'Straight-line distance cannot establish arrival time.', 'Restore the governed road-routing source; do not dispatch from straight-line rank alone.'));
    else if (!fireWithin30.length) gaps.push(responseGap('NO_FIRE_RESPONSE_WITHIN_30_MIN', 'CONFIRMED_BY_ROUTING_CONTEXT', 'No governed fire-station candidate has a road-network route within 30 minutes.', 'The initial wildfire response planning threshold is not met.', 'Escalate mutual-aid and reinforcement planning; verify the nearest capacity beyond 30 minutes.'));
    if (decisionContext.fireCapacityRequired === true && fireWithin30.length && !fireWithin30.some((item) => hasKnownFireCapacity(item) && hasAvailableFireCapacity(item) && responseCapabilityQualified(item))) gaps.push(responseGap(
      'WILDFIRE_RESPONSE_CAPACITY_UNCONFIRMED', 'UNRESOLVED_CAPABILITY',
      fireWithin30.some(hasKnownFireCapacity)
        ? 'Current attributable reports do not confirm available wildfire-qualified crews or vehicles within 30 minutes.'
        : 'No fire station within 30 minutes has a current attributable report resolving available crews or vehicles.',
      'Incident Command cannot compare effective available wildfire response with current demand.',
      fireWithin30.some(hasKnownFireCapacity) ? 'Escalate reinforcement planning; do not treat confirmed zero availability as unknown.' : 'Execute the linked station-capacity collection plans before a dispatch recommendation.',
      fireWithin30.map((item) => requirementByFacility.get(item.id)?.id).filter(Boolean)
    ));
    const routedHospital = hospitals.find((item) => item.reachability?.state === 'ROUTED');
    if (!hospitals.length) gaps.push(responseGap('HOSPITAL_CONTEXT_UNAVAILABLE', 'UNKNOWN', 'No governed hospital record is available in the covered source set.', 'Medical receiving reachability cannot be assessed.', 'Acquire an attributable hospital facility source.'));
    else if (!routedHospital) gaps.push(responseGap('HOSPITAL_REACHABILITY_UNAVAILABLE', 'UNKNOWN', 'Road-network routing did not return a hospital route.', 'Straight-line distance cannot establish medical transport time.', 'Restore the governed road-routing source before selecting a receiving hospital.'));
    else if (routedHospital.reachability.travelTimeMinutes > 45) gaps.push(responseGap('HOSPITAL_BEYOND_45_MIN', 'CONFIRMED_BY_ROUTING_CONTEXT', `The nearest routed hospital candidate is ${routedHospital.reachability.travelTimeMinutes} minutes away.`, 'The current medical transport planning threshold is exceeded.', 'Escalate medical transport planning and verify alternative receiving capability.'));
    if (decisionContext.medicalCapacityRequired === true && relevantHospitals.length && !relevantHospitals.some((item) => hasKnownHospitalCapacity(item) && hasAvailableHospitalCapacity(item))) gaps.push(responseGap(
      'HOSPITAL_CAPACITY_UNCONFIRMED', 'UNRESOLVED_CAPABILITY',
      relevantHospitals.some(hasKnownHospitalCapacity)
        ? 'Current attributable reports do not confirm available receiving capacity at a reachable hospital.'
        : 'No reachable hospital has a current attributable report resolving receiving capacity.',
      'Medical routing cannot balance travel time with receiving capacity.',
      relevantHospitals.some(hasKnownHospitalCapacity) ? 'Escalate alternate receiving planning; do not treat confirmed zero availability as unknown.' : 'Execute the linked hospital-capacity collection plans before recommending a receiving facility.',
      relevantHospitals.map((item) => requirementByFacility.get(item.id)?.id).filter(Boolean)
    ));
    const communicationDegradation = relevantFire.filter((item) => ['DEGRADED', 'UNAVAILABLE'].includes(String(item.dynamicCapacity?.fields?.communicationsStatus ?? '').toUpperCase()));
    if (communicationDegradation.length) gaps.push(responseGap(
      'FIRE_COMMUNICATIONS_DEGRADED', 'ATTRIBUTABLE_REPORT',
      `${communicationDegradation.length} relevant fire-response facilit${communicationDegradation.length === 1 ? 'y reports' : 'ies report'} degraded or unavailable communications.`,
      'Dispatch coordination and status updates may not be reliable through the affected facilities.',
      'Confirm an alternate communications path before relying on affected resources.'
    ));
    const committedNearest = fireWithin30.filter((facility) => {
      const fields = facility.dynamicCapacity?.fields ?? {};
      return finiteCount(fields.crewsAssigned) !== null && Number(fields.crewsAssigned) > 0
        && [fields.crewsAvailable, fields.wildfireCrewsAvailable].map(finiteCount).filter((value) => value !== null).every((value) => value === 0);
    });
    if (committedNearest.length) gaps.push(responseGap(
      'NEAREST_FIRE_CAPACITY_COMMITTED', 'ATTRIBUTABLE_REPORT',
      `${committedNearest.length} routed fire-response facilit${committedNearest.length === 1 ? 'y has' : 'ies have'} reported assigned crews and no confirmed uncommitted crew capacity.`,
      'Mapped proximity overstates effective response capacity when the nearest crews are already committed.',
      'Review the next eligible routed station and execute unresolved capacity collection before assignment.',
      committedNearest.map((item) => requirementByFacility.get(item.id)?.id).filter(Boolean)
    ));
    const tankerKnownAvailable = fireWithin30.some((facility) => Number(facility.dynamicCapacity?.fields?.tankersAvailable) > 0);
    if (decisionContext.fireCapacityRequired === true && fireWithin30.length && !tankerKnownAvailable) gaps.push(responseGap(
      'WATER_TANKER_CAPACITY_UNCONFIRMED', 'UNRESOLVED_CAPABILITY',
      'No routed fire-response facility within 30 minutes has an attributable current report confirming tanker availability.',
      'Water-supply reinforcement cannot be compared with incident demand.',
      'Resolve the linked station-capacity requirements and review routed water-support facilities before committing a plan.',
      fireWithin30.map((item) => requirementByFacility.get(item.id)?.id).filter(Boolean)
    ));
    const routedWater = facilities.WATER_POINT.filter((item) => item.reachability?.state === 'ROUTED' && item.reachability.travelTimeMinutes <= 45);
    if (decisionContext.fireCapacityRequired === true && facilities.WATER_POINT.length && !routedWater.length) gaps.push(responseGap(
      'WATER_SUPPORT_REACHABILITY_UNAVAILABLE', 'ROUTING_THRESHOLD_NOT_MET',
      'No governed mapped water/refill point has a road-network route within 45 minutes.',
      'Tanker turnaround assumptions lack a reachable refill point in the current planning window.',
      'Identify an attributable closer water source or escalate water-logistics planning.'
    ));
    if (decisionContext.medicalCapacityRequired === true && routedHospital?.reachability?.alternativeRouteState !== 'AVAILABLE') gaps.push(responseGap(
      'HOSPITAL_ROUTE_REDUNDANCY_UNCONFIRMED', 'UNRESOLVED_ROUTE_REDUNDANCY',
      'The nearest routed hospital has no independently returned alternative route in the current routing result.',
      'A single route result cannot establish resilient medical access if the primary path degrades.',
      'Acquire a governed alternative route or field-confirmed access path before treating medical access as redundant.'
    ));
    const sharedChokepoints = (Array.isArray(roadContext?.chokepoints) ? roadContext.chokepoints : []).filter((item) => {
      const uses = Array.isArray(item?.uses) ? item.uses.map((value) => String(value).toUpperCase()) : [];
      return uses.some((value) => value.includes('EVAC')) && uses.some((value) => value.includes('RESPONDER') || value.includes('HOSPITAL') || value.includes('FIRE'));
    });
    if (sharedChokepoints.length) gaps.push(responseGap(
      'SHARED_EVACUATION_RESPONSE_CHOKEPOINT', 'GOVERNED_ROAD_CONTEXT',
      `${sharedChokepoints.length} governed chokepoint${sharedChokepoints.length === 1 ? '' : 's'} are shared by evacuation and responder-access paths.`,
      'Congestion or closure could simultaneously delay public egress and incoming response.',
      'Protect the named chokepoint, separate flows where authority permits, and maintain an alternative route.',
    ));
  return gaps;
}

