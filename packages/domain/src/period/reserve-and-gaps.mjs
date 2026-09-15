import {clockOf, iso, ms, mutualAidAvailability} from './operational-period.mjs';
import {capabilityState} from '../planning/resource-model.mjs';

// RESERVE PROTECTION AND FUTURE CAPACITY GAPS.
//
// An optimiser that commits every available unit has produced a plan no
// commander can accept: the next call has nothing left to send. Reserve is
// therefore a planning input, not an afterthought a human has to notice.
//
// The gap analysis is schedule arithmetic, not prediction. It says "at 19:20
// nothing uncommitted with this capability remains in the retained plan" — which
// is a fact about the plan. It never claims an incident will occur.

const BOUNDARY = 'This describes the retained plan, not a forecast. It states when committed units leave no uncommitted capability, not that anything will happen then.';

/** Whether a unit counts toward available capability at a moment in time. */
function countsAsAvailable(resource, capability, at, busyIntervals) {
  if (capabilityState(resource, capability, at).state !== 'PRESENT') return false;
  const aid = mutualAidAvailability(resource);
  // Requested-but-unconfirmed aid is never counted as holding the line.
  if (!aid.usable) return false;
  const point = ms(at);
  return !(busyIntervals.get(resource.id) ?? []).some(([from, until]) => point >= from && point < until);
}

/** Intervals each unit is committed for, from the schedule and its prior commitments. */
export function busyIntervalsOf(assignments, resources) {
  const map = new Map();
  const add = (resourceId, from, until) => {
    if (from === null || until === null) return;
    if (!map.has(resourceId)) map.set(resourceId, []);
    map.get(resourceId).push([from, until]);
  };
  for (const row of assignments) add(row.resourceId, ms(row.window.departureAt), ms(row.window.releaseAt));
  for (const resource of resources) {
    for (const commitment of resource.existingAssignments ?? []) add(resource.id, ms(commitment.from), ms(commitment.until));
  }
  return map;
}

/** Distinct instants where availability can change — schedule edges only. */
function edges(assignments, resources, period) {
  const points = new Set([ms(period.startsAt)]);
  for (const row of assignments) {
    for (const value of [row.window.departureAt, row.window.releaseAt]) if (ms(value) !== null) points.add(ms(value));
  }
  for (const resource of resources) {
    for (const commitment of resource.existingAssignments ?? []) {
      for (const value of [commitment.from, commitment.until]) if (ms(value) !== null) points.add(ms(value));
    }
  }
  return [...points].filter((point) => point >= ms(period.startsAt) && point < ms(period.endsAt)).sort((left, right) => left - right);
}

/**
 * Reserve findings for a schedule. `enforcement` on the policy decides whether a
 * breach blocks the plan or is reported alongside it — VIGIA applies the policy
 * rather than deciding how much risk is acceptable.
 */
export function reserveFindings({assignments, resources, period}) {
  const busy = busyIntervalsOf(assignments, resources);
  const findings = [];
  for (const policy of period.reservePolicies) {
    const pool = resources.filter((resource) => !policy.zoneId || resource.zoneId === policy.zoneId);
    const windowStart = ms(policy.from) ?? ms(period.startsAt);
    const windowEnd = ms(policy.until) ?? ms(period.endsAt);
    let worst = null;
    for (const point of edges(assignments, resources, period)) {
      if (point < windowStart || point >= windowEnd) continue;
      const available = pool.filter((resource) => countsAsAvailable(resource, policy.capability, iso(point), busy));
      if (available.length >= policy.minimumAvailable) continue;
      if (worst === null || available.length < worst.available) worst = {point, available: available.length};
    }
    if (worst === null) continue;
    findings.push({
      kind: 'RESERVE',
      state: policy.enforcement === 'BLOCKING' ? 'INFEASIBLE' : 'ADVISORY_BREACH',
      policyId: policy.id,
      capability: policy.capability,
      zoneName: policy.zoneName,
      at: iso(worst.point),
      available: worst.available,
      required: policy.minimumAvailable,
      text: worst.available === 0
        ? `This plan would consume the last retained ${policy.capability.replace('_', ' ')} reserve for ${policy.zoneName ?? 'the covered area'} at ${clockOf(iso(worst.point))}.`
        : `At ${clockOf(iso(worst.point))} only ${worst.available} ${policy.capability.replace('_', ' ')} unit${worst.available === 1 ? '' : 's'} would remain uncommitted for ${policy.zoneName ?? 'the covered area'}; the policy requires ${policy.minimumAvailable}.`,
      enforcement: policy.enforcement
    });
  }
  return findings;
}

/** Only breaches the policy says should block become global infeasibility. */
export const blockingReserveFindings = (findings) => findings.filter((row) => row.state === 'INFEASIBLE');

/**
 * Intervals in which no uncommitted unit with a capability remains.
 *
 * Deterministic schedule arithmetic: it reports what the plan leaves, and says
 * explicitly that it is not predicting an event.
 */
export function futureCapacityGaps({assignments, resources, period, capabilities}) {
  const busy = busyIntervalsOf(assignments, resources);
  const points = [...edges(assignments, resources, period), ms(period.endsAt)];
  const gaps = [];

  for (const capability of capabilities) {
    const qualified = resources.filter((resource) => capabilityState(resource, capability, period.startsAt).state === 'PRESENT');
    if (!qualified.length) continue;
    let open = null;
    for (let index = 0; index < points.length - 1; index += 1) {
      const at = iso(points[index]);
      const available = qualified.filter((resource) => countsAsAvailable(resource, capability, at, busy));
      if (!available.length) {
        if (open === null) open = points[index];
        continue;
      }
      if (open !== null) { gaps.push({capability, from: iso(open), until: at}); open = null; }
    }
    if (open !== null) gaps.push({capability, from: iso(open), until: period.endsAt});
  }

  return {
    gaps: gaps.map((gap) => ({
      ...gap,
      text: `At ${clockOf(gap.from)} the retained plan has no uncommitted ${gap.capability.replace('_', ' ')} resource${gap.until ? `, until ${clockOf(gap.until)}` : ''}.`,
      consequence: `A new ${gap.capability.replace('_', ' ')} requirement between ${clockOf(gap.from)} and ${clockOf(gap.until)} would have no retained qualified resource.`
    })).sort((left, right) => left.capability.localeCompare(right.capability) || String(left.from).localeCompare(String(right.from))),
    boundary: BOUNDARY
  };
}
