import {explainComparison} from './priority-ordering.mjs';

// DECISION COMPRESSION.
//
// An operator should not have to read one report, one road, three routes, two
// facilities, two missions, a shared dependency and an alternative in order to
// learn that fire response goes first.
//
// This layer reduces a derived consequence set to one directive and the shortest
// honest reason for it. Every word is taken from the consequence objects — there
// is no summarisation model here and none is needed, because the engine already
// decided; this only says what it decided, briefly.

const minutes = (value) => (Number.isFinite(value) ? `${Math.round(value)}-minute` : null);

/** The one line an operator acts on, plus the reason it is that line. */
export function compressDecision(result, {limit = 2} = {}) {
  const consequences = result?.consequences ?? [];
  if (!consequences.length) {
    return {
      schemaVersion: 'vigia.decision-compression.v1',
      directive: null,
      state: 'NOTHING_DERIVED',
      text: 'No reported change currently affects a watched route.',
      because: [], provenance: null
    };
  }

  const top = consequences[0];
  const services = top.serviceImpacts ?? [];
  const first = services[0] ?? null;
  const rest = services.slice(1);

  const because = [];
  if (first) {
    because.push(first.remainingOptionCount === 0
      ? `${first.serviceLabel.charAt(0).toUpperCase()}${first.serviceLabel.slice(1)} loses its only retained route.`
      : `${first.serviceLabel.charAt(0).toUpperCase()}${first.serviceLabel.slice(1)} lost its current route.`);
  }
  for (const service of rest) {
    if (service.remainingOption) {
      const time = minutes(service.remainingOption.minutes);
      because.push(`${service.serviceLabel.charAt(0).toUpperCase()}${service.serviceLabel.slice(1)} retains ${time ? `a ${time} alternative` : 'another stored route'}.`);
    } else if (service.remainingOptionState === 'NO_OTHER_CURRENT_ROUTE_STORED') {
      because.push(`${service.serviceLabel.charAt(0).toUpperCase()}${service.serviceLabel.slice(1)} also has no other current route stored.`);
    }
  }

  return {
    schemaVersion: 'vigia.decision-compression.v1',
    directive: first ? `${first.serviceLabel.toUpperCase()} FIRST` : null,
    state: 'DERIVED',
    consequenceId: top.id,
    text: because.join(' '),
    because,
    // Everything above is reconstructable from these records.
    provenance: top.provenance,
    alsoDerived: consequences.slice(1, limit).map((row) => ({consequenceId: row.id, label: row.label, tier: row.tier}))
  };
}

/**
 * Why one consequence is shown above another, in full. Used for "why is this
 * first?" without re-deriving anything.
 */
export function compareConsequences(left, right) {
  const rationale = explainComparison(left, right);
  if (!rationale.decidedBy) return {text: 'These are equivalent on every ordering factor.', differences: []};
  const aheadLabel = left.id === rationale.ahead ? left.label : right.label;
  const behindLabel = left.id === rationale.ahead ? right.label : left.label;
  return {
    ahead: rationale.ahead,
    behind: rationale.behind,
    decidedBy: rationale.decidedBy,
    differences: rationale.differences,
    text: `${aheadLabel} is shown above ${behindLabel} because ${rationale.differences.map((row) => row.ahead).join(', and ')}. ${behindLabel}: ${rationale.differences.map((row) => row.behind).join(', ')}.`
  };
}
