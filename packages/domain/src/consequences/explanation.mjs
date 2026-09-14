import {tierText} from './priority-ordering.mjs';

// Layer 6: EXPLANATION.
//
// Every sentence here is generated from a canonical record. None is a template
// with an operational judgement baked into it, and none may say more than the
// record establishes.
//
// The wording rules that must not be relaxed:
//   a field report is reported, never published or confirmed by VIGIA;
//   "no other current route is stored" describes VIGIA's storage, not the world;
//   a calculated route is stored, never safe;
//   an unconfirmed alternative is never described as a working alternative.

const clock = (value) => (Number.isFinite(Date.parse(value)) ? new Date(value).toISOString().slice(11, 16) : null);
const minutes = (value) => (Number.isFinite(value) ? `${Math.round(value)} min` : null);
const list = (values) => (values.length <= 1 ? values.join('') : `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`);

/** What happened, in the authority the record actually carries. */
export function describeTrigger(consequence) {
  const road = consequence.roads[0]?.road ?? consequence.trigger.locationName ?? 'this location';
  const at = clock(consequence.observedAt);
  if (consequence.kind === 'OFFICIAL_RESTRICTION') {
    return `A published restriction ${consequence.establishesOfficialClosure ? 'closes' : 'restricts'} ${road}.`;
  }
  const what = {ROAD_BLOCKED: 'was blocked', ROAD_PARTIAL: 'was partially blocked', DAMAGE: 'was damaged', FACILITY_UNAVAILABLE: 'was unavailable'}[consequence.trigger.reportType] ?? 'was reported on';
  // "says" and not "is": the field report is the claim, not the conclusion.
  return `A field report says ${road} ${what}${at ? ` at ${at}` : ''}.`;
}

function serviceSentence(service) {
  const label = `${service.serviceLabel}`;
  if (service.remainingOption) {
    const time = minutes(service.remainingOption.minutes);
    return `${label.charAt(0).toUpperCase()}${label.slice(1)} still has another stored route${time ? `: ${time}` : ''}.`;
  }
  if (service.remainingOptionState === 'NO_WATCHED_OBJECTIVE_FOR_THIS_SERVICE') {
    return `No objective is being watched for ${label}, so no alternative has been established either way.`;
  }
  return `No other current ${label} route is stored.`;
}

/**
 * Builds the operator-facing explanation. `facts` carries the same statements in
 * a structured form so a surface can render them without re-parsing prose.
 */
export function explainOperationalConsequence(consequence) {
  const services = consequence.serviceImpacts;
  const first = services[0] ?? null;
  const affectedLabels = [...new Set(services.map((service) => service.serviceLabel))];
  const road = consequence.roads[0]?.road ?? consequence.trigger.locationName ?? 'this location';

  const whatChanged = describeTrigger(consequence);
  const whatElseIsAffected = affectedLabels.length > 1
    ? `The road is used by ${list(affectedLabels)} routes.`
    : services.length ? `The road is used by ${affectedLabels[0]} routes.` : null;

  const perService = services.map(serviceSentence);
  const withOption = services.filter((service) => service.remainingOption);
  const withoutOption = services.filter((service) => !service.remainingOption && service.remainingOptionState === 'NO_OTHER_CURRENT_ROUTE_STORED');

  const whatNeedsAttention = first ? `Look at ${first.serviceLabel} first.` : null;
  // Why this order — the ordering layer's own decision, quoted rather than
  // reinvented. With one service there is no comparison to explain.
  const whyFirst = services.length > 1 && services[1]?.orderingReason
    ? services[1].orderingReason
    : first ? `${first.label} is shown first because ${tierText(first.tier)}.` : null;

  const checks = [];
  if (consequence.kind === 'FIELD_REPORT' && consequence.trigger.verification === 'UNCONFIRMED') checks.push(`This report has not been confirmed by a second responder.`);
  if (consequence.trigger.verification === 'CONFLICTING_REPORTS') checks.push('Responders disagree about this location.');
  if (consequence.expired) checks.push('This observation is older than its check interval and needs a new check.');
  for (const service of services) if (service.remainingOption) checks.push(`Condition of the ${service.serviceLabel} alternative is not confirmed.`);
  for (const shared of consequence.sharedDependencies) checks.push(shared.text + (shared.qualifier ? ` ${shared.qualifier}` : ''));

  return {
    headline: first ? `${first.serviceLabel.toUpperCase()} ACCESS NEEDS ATTENTION` : `${road} NEEDS CHECKING`,
    summary: [whatChanged, whatElseIsAffected, ...perService, whatNeedsAttention].filter(Boolean).join(' '),
    whatChanged,
    whyItMatters: whyFirst,
    whatElseIsAffected,
    // Stated as retained options, never as safety.
    whatStillWorks: withOption.length
      ? withOption.map((service) => `${service.serviceLabel}: another stored route${minutes(service.remainingOption.minutes) ? ` of ${minutes(service.remainingOption.minutes)}` : ''}, condition unconfirmed.`)
      : [],
    // The directive leads. Which services have no option is already stated by
    // the per-service sentences above, so it is carried as data rather than
    // repeated as prose.
    whatNeedsAttention: whatNeedsAttention ? [whatNeedsAttention] : [],
    servicesNeedingAttention: withoutOption.map((service) => ({serviceId: service.serviceId, serviceLabel: service.serviceLabel, state: service.remainingOptionState})),
    whatNeedsChecking: [...new Set(checks)],
    facts: [
      {key: 'WHAT_CHANGED', text: whatChanged, from: consequence.kind === 'FIELD_REPORT' ? 'reportIds' : 'restrictionIds'},
      ...(whatElseIsAffected ? [{key: 'WHAT_ELSE_IS_AFFECTED', text: whatElseIsAffected, from: 'routeIds'}] : []),
      ...services.map((service, index) => ({key: 'SERVICE_OPTION', serviceId: service.serviceId, text: perService[index], from: 'missionIds'})),
      ...(whatNeedsAttention ? [{key: 'WHAT_NEEDS_ATTENTION', text: whatNeedsAttention, from: 'missionIds'}] : []),
      ...(whyFirst ? [{key: 'WHY_THIS_ORDER', text: whyFirst, from: 'ordering'}] : [])
    ],
    truthBoundary: consequence.kind === 'FIELD_REPORT'
      ? 'This is a field observation reported by a responder. It is not an official restriction, and VIGIA has not established that the road is closed. Stored routes are calculated, not confirmed safe.'
      : 'This is an official published restriction. Stored routes are calculated, not confirmed safe.'
  };
}
