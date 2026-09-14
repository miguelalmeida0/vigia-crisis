import {roadKey} from '../intelligence/road-observations.mjs';

// Layer 1 of the consequence pipeline: CANONICAL FACTS.
//
// Nothing is derived here and nothing is judged. This layer only flattens the
// records the product already persists — the mission catalog, watched missions,
// field reports, confirmations and admitted road restrictions — into indexes the
// later layers can traverse without re-scanning.
//
// The indexes are built in a single pass over each collection. Every later layer
// reads them by key, so relationship construction stays linear in the number of
// routes rather than quadratic in routes x reports.

export const SERVICE_LABELS = Object.freeze({emergency_hospital: 'healthcare', fire_response: 'fire response', designated_reception: 'reception'});

/** Road names carried on a route, as canonical keys. A route may list several. */
export function routeRoadKeys(route) {
  return [...new Set((route?.roads ?? [])
    .flatMap((value) => (typeof value === 'string' ? [value] : [value?.ref, value?.name]))
    .filter(Boolean)
    .flatMap((value) => String(value).split(';'))
    .map(roadKey)
    .filter(Boolean))];
}

/**
 * Reads the road a free-text observation names, when it names one at all.
 * Returns the canonical keys found in the text — never a guess. A location name
 * of "Bridge on the river road" yields nothing, and that absence is honest.
 */
export function namedRoadKeys(text) {
  const words = String(text ?? '').split(/[^A-Za-z0-9]+/).filter(Boolean);
  const keys = new Set();
  for (let index = 0; index < words.length; index += 1) {
    const single = words[index];
    // Road references are a letter prefix plus digits, either joined ("EM527")
    // or split by the tokenizer ("EM", "527").
    if (/^[A-Za-z]{1,3}\d{1,4}$/.test(single)) keys.add(roadKey(single));
    const next = words[index + 1];
    if (next && /^[A-Za-z]{1,3}$/.test(single) && /^\d{1,4}$/.test(next)) keys.add(roadKey(single + next));
  }
  return [...keys];
}

// The widest tolerance reportMatches() can apply is 100 m. A bounding box padded
// beyond that can be used to skip routes that cannot possibly match, without ever
// skipping one that could: the prefilter is conservative by construction.
const MATCH_TOLERANCE_M = 100;
const PAD_M = 150;

/** Padded bounding box of a LineString, or null when there is no geometry. */
export function routeBoundingBox(geometry) {
  const coordinates = geometry?.type === 'LineString' && Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
  if (!coordinates.length) return null;
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const [x, y] of coordinates) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  const padY = PAD_M / 110540;
  const padX = PAD_M / (111320 * Math.max(0.1, Math.cos(((minY + maxY) / 2) * Math.PI / 180)));
  return {minX: minX - padX, maxX: maxX + padX, minY: minY - padY, maxY: maxY + padY};
}

/**
 * Whether a point could be within matching tolerance of this route. A null box
 * (no retained geometry) returns false: absent geometry is never a match, and
 * the non-geometric link bases are evaluated separately.
 */
export function withinBoundingBox(point, box) {
  if (!box || !Array.isArray(point)) return false;
  return point[0] >= box.minX && point[0] <= box.maxX && point[1] >= box.minY && point[1] <= box.maxY;
}

export {MATCH_TOLERANCE_M};

/**
 * Flattens the mission catalog into one addressable route table and the indexes
 * the relationship layer needs. `catalog` is the existing missionCatalog()
 * output: subjects -> services -> routes.
 */
export function extractCanonicalInputs({catalog = [], missions = [], reports = [], confirmations = [], restrictions = [], sourceValidUntil = null, at}) {
  if (!at) throw Object.assign(new Error('consequence_evaluation_time_required'), {statusCode: 400});

  const routes = [];
  const routesByRoad = new Map();
  const routesByServiceSubject = new Map();

  for (const subject of catalog) {
    for (const service of subject.services ?? []) {
      const serviceSubjectKey = `${subject.id}::${service.id}`;
      for (const route of service.routes ?? []) {
        const roadKeys = routeRoadKeys(route);
        const bbox = routeBoundingBox(route.geometry);
        const row = {
          route,
          routeId: route.id,
          facilityId: route.facilityId ?? null,
          facilityName: route.name ?? null,
          subjectId: subject.id,
          subjectName: subject.name,
          serviceId: service.id,
          serviceLabel: SERVICE_LABELS[service.id] ?? service.label ?? service.id,
          serviceSubjectKey,
          roadKeys,
          bbox,
          minutes: Number.isFinite(route.minutes) ? route.minutes : null,
          qualified: route.qualified === true
        };
        routes.push(row);
        for (const key of roadKeys) {
          if (!routesByRoad.has(key)) routesByRoad.set(key, []);
          routesByRoad.get(key).push(row);
        }
        if (!routesByServiceSubject.has(serviceSubjectKey)) routesByServiceSubject.set(serviceSubjectKey, []);
        routesByServiceSubject.get(serviceSubjectKey).push(row);
      }
    }
  }

  const missionsByServiceSubject = new Map();
  for (const mission of missions) {
    const key = `${mission.subjectId}::${mission.service}`;
    if (!missionsByServiceSubject.has(key)) missionsByServiceSubject.set(key, []);
    missionsByServiceSubject.get(key).push(mission);
  }

  const confirmationsByReport = new Map();
  for (const confirmation of confirmations) {
    if (!confirmationsByReport.has(confirmation.reportId)) confirmationsByReport.set(confirmation.reportId, []);
    confirmationsByReport.get(confirmation.reportId).push(confirmation);
  }

  return {
    at,
    sourceValidUntil,
    routes,
    routesByRoad,
    routesByServiceSubject,
    missions,
    missionsByServiceSubject,
    reports,
    reportsById: new Map(reports.map((report) => [report.id, report])),
    confirmations,
    confirmationsByReport,
    restrictions
  };
}
