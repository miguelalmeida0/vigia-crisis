import {reportMatches} from '../fieldnet/mission-command.mjs';
import {roadObservationApplies} from '../intelligence/road-observations.mjs';
import {namedRoadKeys, spatialCandidates, withinBoundingBox} from './canonical-inputs.mjs';

// Layer 2: OPERATIONAL RELATIONSHIPS.
//
// Connects a thing that happened to the things that depend on it:
//
//   trigger -> road -> routes -> services -> missions
//
// Every link records the evidence that established it. A link found because a
// report's coordinate lies on a route's retained line is a different and
// stronger fact than a link found because two records mention the same road
// name, and the two are never merged into one undifferentiated "affected".

export const ROUTE_LINK_BASES = Object.freeze(['GEOMETRY_PROXIMITY', 'FACILITY_MATCH', 'NAMED_ROAD']);
const BLOCKING_REPORT_TYPES = Object.freeze(['ROAD_BLOCKED', 'ROAD_PARTIAL', 'DAMAGE', 'FACILITY_UNAVAILABLE']);
const rank = (basis) => ROUTE_LINK_BASES.indexOf(basis);

/**
 * How, if at all, a field report reaches one route. Strongest basis wins.
 *
 * The bounding-box test is a prefilter, not a second opinion: it only skips the
 * geometric comparison for routes whose padded extent cannot contain a match, so
 * it changes cost and never changes the result. The facility and named-road
 * bases do not depend on geometry and are always evaluated.
 */
function reportRouteLink(report, row, reportRoads, geometricCandidate = true) {
  if (geometricCandidate && row.bbox && withinBoundingBox(report.coordinate, row.bbox) && reportMatches(report, row.route)) return 'GEOMETRY_PROXIMITY';
  if (report.facilityId && report.facilityId === row.facilityId) return 'FACILITY_MATCH';
  if (reportRoads.some((road) => row.roadKeys.includes(road))) return 'NAMED_ROAD';
  return null;
}

/**
 * Which roads this trigger implicates, and on what evidence.
 *
 * When the observation names a road AND that road appears on a route the
 * geometry independently placed the observation on, the two agree and the road
 * identity is CONFIRMED. When only the name is available the road is still
 * reported, as NAMED_ONLY — VIGIA does not silently upgrade a name to a fact.
 */
function implicatedRoads(namedKeys, links) {
  const geometryRoads = new Set(links.filter((link) => link.basis === 'GEOMETRY_PROXIMITY').flatMap((link) => link.row.roadKeys));
  const rows = new Map();
  for (const road of namedKeys) rows.set(road, {road, basis: geometryRoads.has(road) ? 'CONFIRMED' : 'NAMED_ONLY'});
  // Nothing named, or nothing that agrees: fall back to the roads the matched
  // routes actually carry, which the geometry does establish.
  if (![...rows.values()].some((row) => row.basis === 'CONFIRMED')) {
    for (const road of geometryRoads) if (!rows.has(road)) rows.set(road, {road, basis: 'GEOMETRY_DERIVED'});
  }
  return [...rows.values()].sort((left, right) => left.road.localeCompare(right.road));
}

function serviceView(links, inputs) {
  const byService = new Map();
  for (const link of links) {
    const key = link.row.serviceSubjectKey;
    if (!byService.has(key)) {
      byService.set(key, {
        serviceSubjectKey: key,
        serviceId: link.row.serviceId,
        serviceLabel: link.row.serviceLabel,
        subjectId: link.row.subjectId,
        subjectName: link.row.subjectName,
        affectedRoutes: [],
        storedRoutes: inputs.routesByServiceSubject.get(key) ?? [],
        missions: inputs.missionsByServiceSubject.get(key) ?? []
      });
    }
    byService.get(key).affectedRoutes.push(link);
  }
  return [...byService.values()].sort((left, right) => left.serviceSubjectKey.localeCompare(right.serviceSubjectKey));
}

/**
 * Builds one relationship record per trigger. Each pass over the route table is
 * linear, and the route table was indexed once by the canonical-inputs layer.
 */
export function buildOperationalRelationships(inputs) {
  const triggers = [];

  for (const report of inputs.reports) {
    if (Date.parse(report.observedAt) > Date.parse(inputs.at)) continue;
    const reportRoads = namedRoadKeys(report.locationName);
    const links = [];
    // Geometric candidates come from the spatial index; the non-geometric bases
    // still consider every route, because neither depends on where the report is.
    const geometric = new Set(spatialCandidates(report.coordinate, inputs.spatial) ?? inputs.routes);
    const seen = new Set();
    for (const row of inputs.routes) {
      const basis = reportRouteLink(report, row, reportRoads, geometric.has(row));
      if (basis && !seen.has(row.routeId)) { seen.add(row.routeId); links.push({row, routeId: row.routeId, basis}); }
    }
    if (!links.length) continue;
    links.sort((left, right) => rank(left.basis) - rank(right.basis) || left.routeId.localeCompare(right.routeId));
    triggers.push({
      triggerId: `report:${report.id}`,
      kind: 'FIELD_REPORT',
      // The truth boundary, carried as data rather than as wording.
      authority: 'FIELD_OBSERVATION',
      establishesOfficialClosure: false,
      reportId: report.id,
      reportType: report.type,
      reporterName: report.senderName ?? null,
      locationName: report.locationName ?? null,
      // Observation time and ingestion time stay separate, always.
      observedAt: report.observedAt,
      receivedAt: report.receivedAt ?? null,
      validUntil: report.validUntil ?? null,
      expired: Boolean(report.validUntil) && Date.parse(report.validUntil) <= Date.parse(inputs.at),
      blocking: BLOCKING_REPORT_TYPES.includes(report.type),
      confirmations: inputs.confirmationsByReport.get(report.id) ?? [],
      roads: implicatedRoads(reportRoads, links),
      routeLinks: links,
      services: serviceView(links, inputs)
    });
  }

  for (const restriction of inputs.restrictions ?? []) {
    if (!['CLOSED', 'RESTRICTED'].includes(restriction.state)) continue;
    const links = inputs.routes
      .filter((row) => row.bbox && roadObservationApplies(restriction, row.route))
      .map((row) => ({row, routeId: row.routeId, basis: 'GEOMETRY_PROXIMITY'}));
    if (!links.length) continue;
    links.sort((left, right) => left.routeId.localeCompare(right.routeId));
    triggers.push({
      triggerId: `restriction:${restriction.id}`,
      kind: 'OFFICIAL_RESTRICTION',
      authority: 'OFFICIAL_ADMITTED_RESTRICTION',
      establishesOfficialClosure: restriction.state === 'CLOSED',
      restrictionId: restriction.id,
      restrictionState: restriction.state,
      locationName: restriction.roadRef ?? null,
      observedAt: restriction.observedAt ?? null,
      receivedAt: restriction.ingestedAt ?? restriction.knownAt ?? null,
      validUntil: restriction.validUntil ?? inputs.sourceValidUntil ?? null,
      expired: false,
      blocking: true,
      confirmations: [],
      roads: restriction.roadRef ? [{road: restriction.roadRef, basis: 'CONFIRMED'}] : implicatedRoads([], links),
      routeLinks: links,
      services: serviceView(links, inputs)
    });
  }

  return {at: inputs.at, triggers: triggers.sort((left, right) => left.triggerId.localeCompare(right.triggerId))};
}
