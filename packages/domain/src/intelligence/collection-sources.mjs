// Source tasking answers "where should VIGIA look for this fact?" using only the
// sources that are already registered and approved. It never proposes an
// unregistered site, never crawls, and never reaches a paid service.
//
// When nothing registered can answer the requirement, the honest result is
// NO_REGISTERED_SOURCE. That is an operational finding in its own right: it
// tells the operator the gap cannot be closed automatically at all.

const PREDICATE_BY_CLASS = Object.freeze({
  FACILITY_CAPABILITY: ['capabilities.emergencyDepartment', 'capabilities.fireResponse'],
  FACILITY_IDENTITY: ['canonicalName', 'canonicalType', 'location.geometry'],
  PUBLIC_CONTACT: ['contact.phone', 'contact.email', 'contact.website'],
  RECEPTION_ACTIVATION: ['activation.state'],
  OFFICIAL_DESIGNATION: ['designation.kind', 'designation.authority']
});

// A deterministic adapter can turn this source's bytes into candidate facts
// without a model. Anything else needs a human review step, and says so.
const DETERMINISTIC_ADAPTERS = new Set([
  'MP_CONTACT_DIRECTORY', 'CIMAC_FIRE_CONTACT', 'ULSAC_EMERGENCY_SERVICE', 'EVORA_EMERGENCY_PLAN',
  'MUNICIPAL_CONTACT_ACCORDION', 'ULS_CONTACT_TABLE', 'ULSRL_CENTRE', 'ULSLO_PRIMARY_PDF',
  'FIRE_FEDERATION_DIRECTORY', 'BVLEIRIA_CONTACTS', 'EVORA_CIVIL_PROTECTION', 'COIMBRA_RECEPTION_HISTORY',
  'OSM_BASELINE', 'REVIEWED_STRUCTURED'
]);

const AUTHORITY_RANK = Object.freeze({OWNER: 1, GOVERNMENT: 2, MUNICIPAL: 3, OSM: 4, PLACE_PROVIDER: 5, REVERSE_GEOCODER: 6, GEOMETRY: 7});

const health = (source, at) => {
  const success = source.lastSuccessfulFetch ?? source.lastSuccessAt ?? source.lastFetch ?? null;
  const failed = ['SOURCE_UNAVAILABLE', 'unavailable', 'failed', 'degraded', 'offline'].includes(source.status ?? source.state);
  const expected = source.pollIntervalMs ?? source.expectedRefreshMs ?? null;
  const stale = success && expected && Date.parse(at) - Date.parse(success) > expected;
  return {
    state: failed ? (success ? 'LAST_KNOWN' : 'UNAVAILABLE') : stale ? 'STALE' : success ? 'CURRENT' : 'NEVER_RETRIEVED',
    lastSuccessfulRetrieval: success,
    expectedRefreshMs: expected ?? null,
    lastError: source.lastError ?? null
  };
};

function matchesSubject(source, requirement) {
  const subjectId = requirement.subject?.id;
  if (!subjectId) return false;
  if (Array.isArray(source.entityIds) && source.entityIds.includes(subjectId)) return true;
  // A source already cited in this facility's accepted provenance is, by
  // construction, a source that has answered a fact about this exact object.
  return Array.isArray(source.provenanceEntityIds) && source.provenanceEntityIds.includes(subjectId);
}

function coversPredicate(source, requirement) {
  const predicates = PREDICATE_BY_CLASS[requirement.requirementClass];
  if (!predicates) return false;
  if (!Array.isArray(source.predicates) || !source.predicates.length) return true;
  return source.predicates.some((predicate) => predicates.includes(predicate));
}

/**
 * Selects the approved registered sources that could answer one requirement.
 *
 * `sources` are already-registered source records. Road, physical-observation
 * and source-freshness requirements are deliberately out of scope here: they
 * belong to the acquisition and sensing lanes, and this module does not reach
 * into them.
 */
export function requirementSources(requirement, {sources = [], at = new Date().toISOString()} = {}) {
  if (!requirement?.id) throw Object.assign(new Error('requirement_required'), {statusCode: 400});

  if (['ROAD_INFORMATION', 'SOURCE_STALE', 'PHYSICAL_OBSERVATION_GAP'].includes(requirement.requirementClass)) {
    return Object.freeze({
      schemaVersion: 'vigia.requirement-source-tasking.v1',
      requirementId: requirement.id,
      state: 'OWNED_BY_ACQUISITION_LANE',
      sources: [],
      reason: 'This requirement is answered by the configured acquisition and sensing pipelines, not by a facility-directory source. It is surfaced here for prioritisation only.',
      manualReviewRequired: false
    });
  }

  const candidates = (sources ?? [])
    .filter((source) => source && source.url && source.watch !== false)
    .filter((source) => matchesSubject(source, requirement) && coversPredicate(source, requirement))
    .map((source) => {
      const state = health(source, at);
      const deterministic = DETERMINISTIC_ADAPTERS.has(String(source.adapter ?? ''));
      return {
        sourceId: source.id ?? source.url,
        provider: source.provider ?? null,
        url: source.url,
        authority: source.authority ?? null,
        authorityRank: AUTHORITY_RANK[source.authority] ?? 99,
        adapter: source.adapter ?? null,
        format: source.format ?? null,
        deterministicParserAvailable: deterministic,
        manualReviewRequired: !deterministic || source.operationalAdmission !== true,
        health: state,
        nextScheduledRetrieval: source.nextFetch ?? null,
        cost: 'FREE_APPROVED_PUBLIC_SOURCE'
      };
    })
    .sort((left, right) => left.authorityRank - right.authorityRank
      || Number(right.deterministicParserAvailable) - Number(left.deterministicParserAvailable)
      || String(left.sourceId).localeCompare(String(right.sourceId)));

  if (!candidates.length) {
    return Object.freeze({
      schemaVersion: 'vigia.requirement-source-tasking.v1',
      requirementId: requirement.id,
      state: 'NO_REGISTERED_SOURCE',
      sources: [],
      reason: 'No approved registered source is linked to this subject for this fact. Closing this requirement needs a new registered source or a human decision; VIGIA will not search for one.',
      manualReviewRequired: true
    });
  }

  return Object.freeze({
    schemaVersion: 'vigia.requirement-source-tasking.v1',
    requirementId: requirement.id,
    state: 'REGISTERED_SOURCE_AVAILABLE',
    sources: candidates.slice(0, 6),
    total: candidates.length,
    // A source that is registered but currently failing can still be the right
    // place to look; the operator is told, not silently given a healthy-looking list.
    healthySourceCount: candidates.filter((source) => source.health.state === 'CURRENT').length,
    manualReviewRequired: candidates.every((source) => source.manualReviewRequired),
    reason: 'Approved registered sources only. Retrieval remains subject to the existing robots, domain-allowlist and admission rules.',
    limitation: 'A registered source is where the answer could be published. It is not a guarantee that the fact is published, current, or applicable to this subject.'
  });
}

/** Convenience: source tasking for a whole requirement set, keyed by requirement id. */
export function requirementSourceIndex(requirementsResult, {sources = [], at = new Date().toISOString()} = {}) {
  const index = new Map();
  for (const requirement of requirementsResult?.requirements ?? []) index.set(requirement.id, requirementSources(requirement, {sources, at}));
  return index;
}
