import {hash} from './world-knowledge.mjs';
import {supportComparison} from './operational-support.mjs';

// VIGIA already records that the WORLD CHANGED. This records that VIGIA LEARNED.
//
// The two are different operational facts and must never be conflated:
//
//   WORLD_CHANGED   a road closed, a perimeter grew, a new thermal observation
//                   arrived. Reality moved.
//   VIGIA_LEARNED   a capability was verified, an activation was confirmed, an
//                   identity resolved, a source came back. Reality did not move;
//                   our knowledge of it did.
//
// A knowledge event never rewrites an older snapshot. The snapshot taken before
// VIGIA learned something stays exactly as it was captured, because that is what
// VIGIA actually knew at that time.

export const KNOWLEDGE_EVENT_KINDS = Object.freeze([
  'CAPABILITY_VERIFIED',
  'CAPABILITY_LOST_TO_STALENESS',
  'RECEPTION_ACTIVATION_CONFIRMED',
  'RECEPTION_ACTIVATION_LAPSED',
  'IDENTITY_RESOLVED',
  'CONTACT_PUBLISHED',
  'SOURCE_RECOVERED',
  'SOURCE_LOST',
  'REQUIREMENT_OPENED',
  'REQUIREMENT_RESOLVED',
  'REQUIREMENT_REOPENED',
  'REQUIREMENT_EXPIRED'
]);

const CLASSIFICATION = Object.freeze({origin: 'VIGIA_LEARNED', distinctFrom: 'WORLD_CHANGED'});

// A fact whose supporting provenance is no longer valid at the evaluation time is
// no longer known, exactly as the support engine treats it. Reading the raw field
// would report a capability VIGIA can no longer stand behind.
function effectiveFieldState(facility, field, at) {
  const declared = facility?.fields?.[field]?.state ?? null;
  if (declared !== 'RESOLVED') return declared;
  const rows = facility?.provenance?.[field] ?? [];
  if (!rows.length) return declared;
  const valid = rows.some((row) => (!row.retrievedAt || Date.parse(row.retrievedAt) <= Date.parse(at))
    && (!row.validFrom || Date.parse(row.validFrom) <= Date.parse(at))
    && (!row.validUntil || Date.parse(row.validUntil) > Date.parse(at)));
  return valid ? 'RESOLVED' : 'STALE';
}
const capabilityTrue = (facility, key) => facility?.capabilities?.[key] === true;

function knowledgeEvent({kind, at, subject, previous, current, consequence, evidence = []}) {
  return {
    schemaVersion: 'vigia.knowledge-event.v1',
    id: `knowledge:${hash([at, kind, subject.id, previous, current]).slice(0, 32)}`,
    kind,
    classification: CLASSIFICATION,
    at,
    subject,
    previous,
    current,
    consequence,
    evidence,
    truthBoundary: 'This records a change in what VIGIA knows, not a change in the world. Snapshots captured before this moment are never rewritten with it.'
  };
}

/**
 * Derives knowledge events between two retained situation snapshots.
 *
 * Only knowledge-state transitions produce events here. Route geometry changes,
 * new thermal observations, perimeter changes and weather are world changes and
 * are deliberately not returned by this function.
 */
export function knowledgeEvents(before, after) {
  if (!before || !after) return Object.freeze({state: 'HISTORY_UNAVAILABLE', events: []});
  if (Date.parse(after.knownAt) < Date.parse(before.knownAt)) throw Object.assign(new Error('knowledge_events_require_forward_time'), {statusCode: 400});
  const at = after.knownAt;
  const comparison = supportComparison(before, after);
  const changesFor = (facilityId) => (comparison.changes ?? []).filter((change) => [change.previous?.primary, change.current?.primary, change.previous?.secondary, change.current?.secondary].includes(facilityId));
  const rows = [];

  const beforeById = new Map((before.facilities ?? []).map((facility) => [facility.id, facility]));
  for (const facility of after.facilities ?? []) {
    const previous = beforeById.get(facility.id);
    if (!previous) continue;
    const subject = {id: facility.id, kind: 'FACILITY', name: facility.canonicalName ?? facility.id, canonicalType: facility.canonicalType};

    for (const [key, field, verified, lost] of [
      ['emergencyDepartment', 'capabilities.emergencyDepartment', 'CAPABILITY_VERIFIED', 'CAPABILITY_LOST_TO_STALENESS'],
      ['fireResponse', 'capabilities.fireResponse', 'CAPABILITY_VERIFIED', 'CAPABILITY_LOST_TO_STALENESS']
    ]) {
      const previousState = effectiveFieldState(previous, field, before.knownAt);
      const currentState = effectiveFieldState(facility, field, at);
      const was = previousState === 'RESOLVED' && capabilityTrue(previous, key);
      const is = currentState === 'RESOLVED' && capabilityTrue(facility, key);
      if (was === is) continue;
      const supportChanges = changesFor(facility.id);
      rows.push(knowledgeEvent({
        kind: is ? verified : lost,
        at,
        subject: {...subject, fact: field},
        previous: {state: previousState ?? 'NOT_RESOLVED', value: previous.capabilities?.[key] ?? null},
        current: {state: currentState ?? 'NOT_RESOLVED', value: facility.capabilities?.[key] ?? null},
        consequence: {
          supportChangeCount: supportChanges.length,
          affectedSubjectIds: [...new Set(supportChanges.map((change) => change.subjectId))],
          becamePrimaryFor: supportChanges.filter((change) => change.current?.primary === facility.id).map((change) => ({subjectId: change.subjectId, subjectName: change.subjectName, category: change.category})),
          stoppedBeingPrimaryFor: supportChanges.filter((change) => change.previous?.primary === facility.id && change.current?.primary !== facility.id).map((change) => ({subjectId: change.subjectId, subjectName: change.subjectName, category: change.category}))
        },
        evidence: Object.values(facility.provenance?.[field] ?? []).map((row) => ({factId: row.factId ?? null, provider: row.provider ?? null, retrievedAt: row.retrievedAt ?? null}))
      }));
    }

    const wasActive = effectiveFieldState(previous, 'activation.state', before.knownAt) === 'RESOLVED' && previous.activation?.state === 'ACTIVATED';
    const isActive = effectiveFieldState(facility, 'activation.state', at) === 'RESOLVED' && facility.activation?.state === 'ACTIVATED';
    if (wasActive !== isActive) {
      const supportChanges = changesFor(facility.id);
      rows.push(knowledgeEvent({
        kind: isActive ? 'RECEPTION_ACTIVATION_CONFIRMED' : 'RECEPTION_ACTIVATION_LAPSED',
        at,
        subject: {...subject, fact: 'activation.state'},
        previous: {state: previous.activation?.state ?? null},
        current: {state: facility.activation?.state ?? null},
        consequence: {supportChangeCount: supportChanges.length, affectedSubjectIds: [...new Set(supportChanges.map((change) => change.subjectId))], becamePrimaryFor: [], stoppedBeingPrimaryFor: []},
        evidence: Object.values(facility.provenance?.['activation.state'] ?? []).map((row) => ({factId: row.factId ?? null, provider: row.provider ?? null, retrievedAt: row.retrievedAt ?? null}))
      }));
    }

    if (previous.resolutionState && previous.resolutionState !== 'RESOLVED' && facility.resolutionState === 'RESOLVED') {
      rows.push(knowledgeEvent({kind: 'IDENTITY_RESOLVED', at, subject: {...subject, fact: 'canonicalIdentity'}, previous: {state: previous.resolutionState}, current: {state: 'RESOLVED'}, consequence: {supportChangeCount: changesFor(facility.id).length, affectedSubjectIds: [], becamePrimaryFor: [], stoppedBeingPrimaryFor: []}}));
    }

    if (!previous.contact?.phone && facility.contact?.phone) {
      rows.push(knowledgeEvent({kind: 'CONTACT_PUBLISHED', at, subject: {...subject, fact: 'contact.phone'}, previous: {state: 'NOT_RETAINED'}, current: {state: 'RETAINED'}, consequence: {supportChangeCount: 0, affectedSubjectIds: [], becamePrimaryFor: [], stoppedBeingPrimaryFor: []}}));
    }
  }

  const beforeSources = new Map((before.sources ?? []).map((source) => [source.id, source]));
  for (const source of after.sources ?? []) {
    const previous = beforeSources.get(source.id);
    if (!previous || previous.state === source.state) continue;
    const recovered = source.state === 'CURRENT' && previous.state !== 'CURRENT';
    const lost = previous.state === 'CURRENT' && source.state !== 'CURRENT';
    if (!recovered && !lost) continue;
    rows.push(knowledgeEvent({
      kind: recovered ? 'SOURCE_RECOVERED' : 'SOURCE_LOST',
      at,
      subject: {id: source.id, kind: 'SOURCE', name: source.name ?? source.provider ?? source.id, fact: 'source.currentRetrieval'},
      previous: {state: previous.state},
      current: {state: source.state},
      consequence: {supportChangeCount: 0, affectedSubjectIds: [], becamePrimaryFor: [], stoppedBeingPrimaryFor: []}
    }));
  }

  return Object.freeze({
    schemaVersion: 'vigia.knowledge-events.v1',
    state: 'AVAILABLE',
    from: before.id ?? null,
    to: after.id ?? null,
    fromTime: before.knownAt,
    toTime: after.knownAt,
    events: rows.sort((left, right) => left.id.localeCompare(right.id)),
    worldChangeCount: (comparison.changes ?? []).length,
    limitation: 'Knowledge events describe changes in VIGIA’s knowledge between two retained captures. World changes are reported separately and are not merged into these events.'
  });
}

/** Knowledge events derived from requirement lifecycle transitions. */
export function requirementKnowledgeEvents(lifecycleResult) {
  return (lifecycleResult?.events ?? []).map((event) => knowledgeEvent({
    kind: event.kind,
    at: event.at,
    subject: {...event.subject, requirementId: event.requirementId, requirementClass: event.requirementClass},
    previous: event.previous ?? null,
    current: event.current ?? null,
    consequence: {
      supportChangeCount: 0,
      affectedSubjectIds: [],
      becamePrimaryFor: [],
      stoppedBeingPrimaryFor: [],
      requirementImpact: event.affected ?? null
    }
  }));
}

/**
 * "What did VIGIA learn, and what changed because it learned it?"
 *
 * Combines knowledge events from snapshot pairs with requirement lifecycle
 * events over a window, and separates gaps closed from gaps opened.
 */
export function knowledgeDelta({events = [], lifecycleEvents = [], from, to} = {}) {
  const all = [...events, ...lifecycleEvents];
  const learned = all.filter((event) => ['CAPABILITY_VERIFIED', 'RECEPTION_ACTIVATION_CONFIRMED', 'IDENTITY_RESOLVED', 'CONTACT_PUBLISHED', 'SOURCE_RECOVERED'].includes(event.kind));
  const lost = all.filter((event) => ['CAPABILITY_LOST_TO_STALENESS', 'RECEPTION_ACTIVATION_LAPSED', 'SOURCE_LOST'].includes(event.kind));
  const gapsClosed = all.filter((event) => event.kind === 'REQUIREMENT_RESOLVED');
  const gapsOpened = all.filter((event) => ['REQUIREMENT_OPENED', 'REQUIREMENT_REOPENED'].includes(event.kind));
  const bySupportImpact = [...learned].sort((left, right) => (right.consequence?.supportChangeCount ?? 0) - (left.consequence?.supportChangeCount ?? 0) || left.id.localeCompare(right.id));

  return Object.freeze({
    schemaVersion: 'vigia.knowledge-delta.v1',
    window: {from: from ?? null, to: to ?? null},
    learnedCount: learned.length,
    lostCount: lost.length,
    learned,
    lost,
    mostConsequentialNewFact: bySupportImpact[0]?.consequence?.supportChangeCount ? bySupportImpact[0] : null,
    gapsClosed,
    gapsClosedCount: gapsClosed.length,
    gapsOpened,
    gapsOpenedCount: gapsOpened.length,
    limitation: 'Counts changes in knowledge over the stated window only. A gap that opened because retained data became stale is reported as an opened gap, not as a change in the world.'
  });
}
