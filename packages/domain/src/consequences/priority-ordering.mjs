// Layer 5: PRIORITY ORDERING.
//
// There is no priority score. A number like 92 cannot be argued with, cannot be
// audited, and hides the one thing the operator actually needs: which fact put
// this above that.
//
// Ordering is lexicographic over named factors, compared in a fixed sequence.
// The first factor that differs decides the order AND becomes the explanation,
// so every ordering can answer "why is this first?" with the fact that did it.

/**
 * Operational tiers, most urgent first. A tier is assigned from what the mission
 * engine already concluded — never from a fresh severity judgement of our own.
 */
export const PRIORITY_TIERS = Object.freeze([
  {key: 'ACTIVE_MISSION_NO_REMAINING_OPTION', text: 'an active mission has no other current route stored'},
  {key: 'ACTIVE_MISSION_ALTERNATIVE_RETAINED', text: 'an active mission lost its current route but another stored route remains'},
  {key: 'SHARED_DEPENDENCY_ACROSS_SERVICES', text: 'one road carries routes for more than one service'},
  {key: 'MATERIAL_OBSERVATION_ON_WATCHED_ROUTE', text: 'a field observation touches a watched route'},
  {key: 'UNRESOLVED_OR_STALE_DEPENDENCY', text: 'a dependency is unconfirmed or its information is stale'}
]);

const TIER_INDEX = new Map(PRIORITY_TIERS.map((tier, index) => [tier.key, index]));
export const tierIndex = (key) => (TIER_INDEX.has(key) ? TIER_INDEX.get(key) : PRIORITY_TIERS.length);
export const tierText = (key) => PRIORITY_TIERS.find((tier) => tier.key === key)?.text ?? 'no operational tier established';

/**
 * The comparison sequence. Each entry reads one value from an impact and says
 * which direction is more urgent. Order of this array IS the priority policy.
 */
export const PRIORITY_FACTORS = Object.freeze([
  {key: 'tier', direction: 'LOWER_INDEX_FIRST', read: (row) => tierIndex(row.tier),
    explain: (row) => tierText(row.tier)},
  {key: 'remainingOptionCount', direction: 'FEWER_FIRST', read: (row) => (Number.isFinite(row.remainingOptionCount) ? row.remainingOptionCount : Number.MAX_SAFE_INTEGER),
    explain: (row) => (row.remainingOptionCount === 0 ? 'no other current route is stored' : `${row.remainingOptionCount} other stored route${row.remainingOptionCount === 1 ? '' : 's'} remain`)},
  {key: 'affectedServiceCount', direction: 'MORE_FIRST', read: (row) => row.affectedServiceCount ?? 0,
    explain: (row) => `${row.affectedServiceCount} service${row.affectedServiceCount === 1 ? '' : 's'} affected`},
  {key: 'affectedMissionCount', direction: 'MORE_FIRST', read: (row) => row.affectedMissionCount ?? 0,
    explain: (row) => `${row.affectedMissionCount} watched objective${row.affectedMissionCount === 1 ? '' : 's'} affected`},
  {key: 'observedAt', direction: 'NEWER_FIRST', read: (row) => (Number.isFinite(Date.parse(row.observedAt)) ? Date.parse(row.observedAt) : 0),
    explain: (row) => `observed ${row.observedAt}`},
  // Final factor, never explained to the operator: it exists only so that two
  // otherwise identical impacts always come back in the same order.
  {key: 'id', direction: 'STABLE_ID', read: (row) => String(row.id ?? ''), explain: () => null}
]);

function compareFactor(factor, left, right) {
  const a = factor.read(left);
  const b = factor.read(right);
  if (a === b) return 0;
  if (factor.direction === 'STABLE_ID') return a < b ? -1 : 1;
  if (factor.direction === 'LOWER_INDEX_FIRST' || factor.direction === 'FEWER_FIRST') return a < b ? -1 : 1;
  return a > b ? -1 : 1;
}

/**
 * Compares two impacts and reports the factor that decided it, so the caller can
 * explain the ordering rather than assert it.
 */
export function comparePriority(left, right) {
  for (const factor of PRIORITY_FACTORS) {
    const order = compareFactor(factor, left, right);
    if (order !== 0) {
      const ahead = order < 0 ? left : right;
      const behind = order < 0 ? right : left;
      return {order, factor: factor.key, ahead: ahead.id ?? null, behind: behind.id ?? null,
        aheadBecause: factor.explain(ahead), behindBecause: factor.explain(behind)};
    }
  }
  return {order: 0, factor: null, ahead: null, behind: null, aheadBecause: null, behindBecause: null};
}

/**
 * Orders impacts most urgent first and, for each one after the first, records
 * why it sits behind the one above it.
 */
export function orderOperationalPriorities(impacts) {
  const ordered = [...(impacts ?? [])].sort((left, right) => comparePriority(left, right).order);
  return ordered.map((impact, index) => {
    if (index === 0) return {...impact, rank: 1, precededBy: null, orderingReason: null, decidedBy: null};
    const decision = comparePriority(ordered[index - 1], impact);
    return {
      ...impact,
      rank: index + 1,
      precededBy: ordered[index - 1].id ?? null,
      decidedBy: decision.factor,
      // Reads as: "X is shown first because <a>. <this one> <b>."
      orderingReason: decision.aheadBecause && decision.behindBecause
        ? `${ordered[index - 1].label ?? 'The item above'} is shown first because ${decision.aheadBecause}. ${impact.label ?? 'This item'}: ${decision.behindBecause}.`
        : null
    };
  });
}
