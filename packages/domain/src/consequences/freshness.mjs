// STALE TRUTH.
//
// A fact can stay stored long after it stops being able to support a decision.
// The dangerous failure is not forgetting it — it is continuing to rely on it.
//
// When road information expires, VIGIA must say neither "EM527 is blocked" nor
// "EM527 is open". It must say that the information supporting a conclusion has
// aged out, name the conclusion, and say whether anything else still supports it.

export const FRESHNESS_STATES = Object.freeze(['CURRENT', 'EXPIRED', 'VALIDITY_UNKNOWN']);

/**
 * Operational importance of a stale fact. Derived from concrete conditions, in
 * this order — never from a score. The first matching condition classifies it.
 */
export const STALENESS_CLASSES = Object.freeze([
  {key: 'CRITICAL_SOLE_SUPPORT', text: 'it is the only support for an active objective with no other stored option'},
  {key: 'ELEVATED_SHARED_DEPENDENCY', text: 'it supports a dependency shared by more than one service'},
  {key: 'ROUTINE_ALTERNATIVE_RETAINED', text: 'another stored option remains for the objectives that depend on it'},
  {key: 'BACKGROUND_NO_DEPENDENT_DECISION', text: 'no active objective or current conclusion depends on it'}
]);

const CLASS_INDEX = new Map(STALENESS_CLASSES.map((row, index) => [row.key, index]));
export const stalenessRank = (key) => (CLASS_INDEX.has(key) ? CLASS_INDEX.get(key) : STALENESS_CLASSES.length);
export const stalenessText = (key) => STALENESS_CLASSES.find((row) => row.key === key)?.text ?? 'its operational dependency is not established';

/** Human age, in the units an operator reads: "2h 18m", "45m", "3d 4h". */
export function describeAge(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const minutes = Math.floor(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${rest}m`;
  return `${rest}m`;
}

/**
 * Freshness of one canonical fact at a point in time.
 *
 * A fact with no stated validity is VALIDITY_UNKNOWN — never assumed current.
 * That is the difference between "we checked and it holds" and "nobody said".
 */
export function factFreshness(fact, at) {
  const now = Date.parse(at);
  const checkedAt = fact?.lastCheckedAt ?? fact?.observedAt ?? fact?.calculatedAt ?? null;
  const ageMs = Number.isFinite(Date.parse(checkedAt)) ? now - Date.parse(checkedAt) : null;
  const validUntil = fact?.validUntil ?? null;
  const state = !Number.isFinite(Date.parse(validUntil))
    ? 'VALIDITY_UNKNOWN'
    : Date.parse(validUntil) > now ? 'CURRENT' : 'EXPIRED';
  return {
    factId: fact?.factId ?? null,
    kind: fact?.kind ?? null,
    subjectId: fact?.subjectId ?? null,
    roadRef: fact?.roadRef ?? null,
    state,
    // Never "fresh until proven otherwise": an unstated validity stays unstated.
    usableAsSupport: state === 'CURRENT',
    lastCheckedAt: checkedAt,
    validUntil,
    ageMs,
    age: describeAge(ageMs)
  };
}

/**
 * The canonical facts that support one stored route. Derived from the records
 * the route already carries — the route calculation itself, and the road
 * information covering the roads it uses.
 */
export function routeSupportingFacts(routeRow, {sourceValidUntil = null, sourceLastCheckedAt = null, at}) {
  const route = routeRow?.route ?? {};
  const facts = [{
    factId: `route-calculation:${routeRow.routeId}`,
    kind: 'ROUTE_CALCULATION',
    subjectId: routeRow.routeId,
    roadRef: null,
    lastCheckedAt: route.calculatedAt ?? null,
    validUntil: route.validUntil ?? null
  }];
  for (const road of routeRow.roadKeys ?? []) {
    facts.push({
      factId: `road-information:${road}`,
      kind: 'ROAD_INFORMATION',
      subjectId: road,
      roadRef: road,
      lastCheckedAt: sourceLastCheckedAt,
      validUntil: sourceValidUntil
    });
  }
  return facts.map((fact) => factFreshness(fact, at));
}

/**
 * Classifies how much a stale fact matters, from the operational dependencies
 * that were passed in. `dependents` describes what actually relies on it:
 * `{activeMissionCount, missionsWithoutAlternative, serviceCount, routeIds}`.
 */
export function classifyStaleness(freshness, dependents) {
  const active = dependents?.activeMissionCount ?? 0;
  const withoutAlternative = dependents?.missionsWithoutAlternative ?? 0;
  const services = dependents?.serviceCount ?? 0;
  const key = withoutAlternative > 0 ? 'CRITICAL_SOLE_SUPPORT'
    : services > 1 ? 'ELEVATED_SHARED_DEPENDENCY'
      : active > 0 ? 'ROUTINE_ALTERNATIVE_RETAINED'
        : 'BACKGROUND_NO_DEPENDENT_DECISION';
  return {
    class: key,
    rank: stalenessRank(key),
    because: stalenessText(key),
    // Ordering inputs, all of them plain domain measurements.
    activeMissionCount: active,
    missionsWithoutAlternative: withoutAlternative,
    serviceCount: services,
    routeIds: [...(dependents?.routeIds ?? [])].sort(),
    ageMs: freshness?.ageMs ?? null
  };
}

/**
 * The operator sentence for a stale dependency. It names the age and the
 * consequence, and it refuses to state the road's condition in either direction.
 */
export function explainStaleness(freshness, classification, {subjectLabel, serviceLabel}) {
  const age = freshness?.age ? `last checked ${freshness.age} ago` : 'with no recorded check time';
  const head = classification.class === 'CRITICAL_SOLE_SUPPORT'
    ? `The only stored ${serviceLabel} route depends on road information ${age}.`
    : classification.class === 'ELEVATED_SHARED_DEPENDENCY'
      ? `Road information ${subjectLabel ? `for ${subjectLabel} ` : ''}${age} supports routes for more than one service.`
      : classification.class === 'ROUTINE_ALTERNATIVE_RETAINED'
        ? `Road information ${subjectLabel ? `for ${subjectLabel} ` : ''}${age} supports a ${serviceLabel} route. Another stored route remains.`
        : `Road information ${subjectLabel ? `for ${subjectLabel} ` : ''}${age}. No active objective depends on it.`;
  return {
    headline: classification.class === 'CRITICAL_SOLE_SUPPORT' ? 'NEEDS CHECKING' : null,
    text: head,
    action: subjectLabel ? `Confirm ${subjectLabel} before relying on this route.` : 'Confirm this road before relying on the route.',
    // Both directions are refused explicitly, so no surface can infer either.
    boundary: 'Expired road information does not mean the road is blocked, and it does not mean the road is open. It means the stored information can no longer support a conclusion.'
  };
}
