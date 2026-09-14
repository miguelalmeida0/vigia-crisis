import {extractCanonicalInputs} from './canonical-inputs.mjs';
import {minimalCutSets, describeCutSets} from './dependency-sets.mjs';

// WHAT STILL WORKS?
//
// A bounded resilience query: given one or more assumptions, what support is
// retained, what is lost, and what simply becomes unknown?
//
// Strict isolation. This never writes, never touches mission history, and never
// produces an observation. The input records are read, never mutated — routes
// are filtered, not edited — and every result is labelled as an assumption.
//
// MULTI-HOP CLOSURE (bounded, not a graph engine). The engine traverses one
// fixed, declared sequence of relationship types and stops. There is no generic
// traversal, no cycle risk, and no unbounded fan-out.
export const ADMISSIBLE_HOPS = Object.freeze([
  'ROAD_TO_ROUTE',        // a road carries stored routes
  'ROUTE_TO_FACILITY',    // a route reaches one facility
  'FACILITY_TO_SERVICE',  // a facility serves one service for one subject
  'SERVICE_TO_MISSION',   // a watched objective protects that service
  'MISSION_TO_SUBJECT'    // the objective protects a community or the incident
]);
export const MAX_HOPS = ADMISSIBLE_HOPS.length;

export const ASSUMPTION_KINDS = Object.freeze(['ROAD_UNAVAILABLE', 'FACILITY_UNAVAILABLE', 'ROUTE_UNAVAILABLE', 'SOURCE_STALE']);

export const SUPPORT_STATES = Object.freeze(['SUPPORTED', 'DEGRADED', 'SUPPORT_UNCERTAIN', 'NO_RETAINED_OPTION', 'NO_ROUTE_STORED']);

const invalid = (text) => Object.assign(new Error(text), {statusCode: 400});

function assertAssumptions(assumptions) {
  if (!Array.isArray(assumptions) || !assumptions.length) throw invalid('resilience_assumption_required');
  for (const assumption of assumptions) {
    if (!ASSUMPTION_KINDS.includes(assumption?.kind)) throw invalid('resilience_assumption_kind_unknown');
    if (!assumption.subjectId) throw invalid('resilience_assumption_subject_required');
  }
}

/**
 * How one assumption bears on one stored route.
 *
 * ELIMINATED — the assumption removes this route.
 * UNCERTAIN  — the assumption removes the ability to say it is usable, without
 *              establishing that it is not. Stale information lands here, and
 *              collapsing it into ELIMINATED would invent a closure.
 */
function routeUnder(routeRow, assumptions) {
  let verdict = 'RETAINED';
  const reasons = [];
  for (const assumption of assumptions) {
    const road = String(assumption.subjectId).toUpperCase();
    const matchesRoad = (routeRow.roadKeys ?? []).includes(road);
    if (assumption.kind === 'ROAD_UNAVAILABLE' && matchesRoad) { verdict = 'ELIMINATED'; reasons.push(`uses ${road}`); }
    else if (assumption.kind === 'ROUTE_UNAVAILABLE' && assumption.subjectId === routeRow.routeId) { verdict = 'ELIMINATED'; reasons.push('this route is the assumption'); }
    else if (assumption.kind === 'FACILITY_UNAVAILABLE' && assumption.subjectId === routeRow.facilityId) { verdict = 'ELIMINATED'; reasons.push(`reaches ${routeRow.facilityName ?? routeRow.facilityId}`); }
    else if (assumption.kind === 'SOURCE_STALE' && matchesRoad && verdict !== 'ELIMINATED') { verdict = 'UNCERTAIN'; reasons.push(`its information for ${road} would need checking`); }
  }
  return {routeId: routeRow.routeId, facilityId: routeRow.facilityId, facilityName: routeRow.facilityName, minutes: routeRow.minutes, verdict, reasons};
}

function supportState({retained, uncertain, eliminated, stored}) {
  if (!stored) return 'NO_ROUTE_STORED';
  if (!retained && !uncertain) return 'NO_RETAINED_OPTION';
  if (!retained && uncertain) return 'SUPPORT_UNCERTAIN';
  if (eliminated || uncertain) return 'DEGRADED';
  return 'SUPPORTED';
}

/**
 * Answers "what still works?" under explicit assumptions.
 *
 * Mission STATE is deliberately not recomputed: that belongs to the mission
 * engine and depends on observed records, which a scenario has none of. What is
 * reported is the support available to each objective under the assumption.
 */
export function resilienceQuery({catalog = [], missions = [], assumptions, at, incidentId, sourceValidUntil = null}) {
  assertAssumptions(assumptions);
  const inputs = extractCanonicalInputs({catalog, missions, sourceValidUntil, at});

  const services = [...inputs.routesByServiceSubject.entries()].map(([key, storedRoutes]) => {
    const evaluated = storedRoutes.map((row) => routeUnder(row, assumptions));
    const retained = evaluated.filter((row) => row.verdict === 'RETAINED');
    const uncertain = evaluated.filter((row) => row.verdict === 'UNCERTAIN');
    const eliminated = evaluated.filter((row) => row.verdict === 'ELIMINATED');
    const remainingCuts = minimalCutSets(storedRoutes.filter((row) => retained.some((keep) => keep.routeId === row.routeId)));
    const sample = storedRoutes[0];
    const best = [...retained].sort((left, right) => (left.minutes ?? Infinity) - (right.minutes ?? Infinity))[0] ?? null;
    return {
      serviceSubjectKey: key,
      serviceId: sample.serviceId,
      serviceLabel: sample.serviceLabel,
      subjectId: sample.subjectId,
      subjectName: sample.subjectName,
      state: supportState({retained: retained.length, uncertain: uncertain.length, eliminated: eliminated.length, stored: storedRoutes.length}),
      storedRouteCount: storedRoutes.length,
      retainedOptions: retained,
      uncertainOptions: uncertain,
      lostOptions: eliminated,
      bestRetainedOption: best ? {routeId: best.routeId, facilityName: best.facilityName, minutes: best.minutes} : null,
      sharedDependenciesRemaining: describeCutSets(remainingCuts, {serviceLabel: sample.serviceLabel}),
      missions: (inputs.missionsByServiceSubject.get(key) ?? []).map((mission) => ({
        missionId: mission.id, objective: mission.objective, lifecycle: mission.lifecycle,
        // The mission's real state is carried through untouched, for reference.
        observedState: mission.state,
        currentRouteVerdict: evaluated.find((row) => row.routeId === mission.currentRouteId)?.verdict ?? 'NOT_IN_CATALOG',
        supportUnderAssumption: supportState({retained: retained.length, uncertain: uncertain.length, eliminated: eliminated.length, stored: storedRoutes.length})
      }))
    };
  }).sort((left, right) => left.serviceSubjectKey.localeCompare(right.serviceSubjectKey));

  const describe = (assumption) => `${assumption.subjectId} ${{ROAD_UNAVAILABLE: 'becomes unavailable', FACILITY_UNAVAILABLE: 'becomes unavailable', ROUTE_UNAVAILABLE: 'is not usable', SOURCE_STALE: 'information needs checking'}[assumption.kind]}`;

  return {
    schemaVersion: 'vigia.resilience-query.v1',
    universe: 'SCENARIO',
    observed: false,
    operationalWrites: 0,
    incidentId,
    evaluatedAt: at,
    assumptions: assumptions.map((assumption) => ({...assumption, text: describe(assumption)})),
    assumptionText: `Under this assumption: ${assumptions.map(describe).join('; ')}.`,
    hops: ADMISSIBLE_HOPS,
    services,
    summary: {
      supported: services.filter((row) => row.state === 'SUPPORTED').map((row) => row.serviceSubjectKey),
      degraded: services.filter((row) => row.state === 'DEGRADED').map((row) => row.serviceSubjectKey),
      uncertain: services.filter((row) => row.state === 'SUPPORT_UNCERTAIN').map((row) => row.serviceSubjectKey),
      withoutOption: services.filter((row) => row.state === 'NO_RETAINED_OPTION').map((row) => row.serviceSubjectKey)
    },
    boundary: 'This is a scenario calculated from retained records under an explicit assumption. Nothing here was observed, no operational record, mission or history was changed, and the assumption is discarded with this answer. A retained route is a stored calculation, not confirmed safe passage.'
  };
}
