import { immutable, isoTime, requiredText, uniqueSorted } from '../shared.mjs';

export const ONTOLOGY_KINDS = Object.freeze([
  'Incident', 'Claim', 'Observation', 'Evidence', 'Source', 'SourceFamily',
  'EvidenceLineage', 'EvidenceContract', 'EvidenceNeed', 'Contradiction',
  'Location', 'Asset', 'Organization', 'Action', 'PolicyReference', 'Outcome'
]);

export const SOURCE_FAMILY_CLASSES = Object.freeze([
  'REPORT', 'PHYSICAL', 'OFFICIAL', 'HUMAN', 'CONTEXT'
]);
export const SOURCE_KINDS = Object.freeze([
  'ENDPOINT', 'PUBLISHER', 'SENSOR', 'PRODUCT', 'FIELD_TEAM', 'OFFICIAL_SYSTEM', 'OTHER'
]);
export const OBSERVATION_STATES = Object.freeze([
  'OBSERVED_POSITIVE', 'OBSERVED_NEGATIVE', 'OBSERVED_UNDETERMINED', 'NOT_OBSERVED'
]);
export const OBSERVATION_OPPORTUNITY_STATES = Object.freeze(['VALID', 'INVALID', 'UNKNOWN']);
export const EVIDENCE_STANCES = Object.freeze(['SUPPORTING', 'CONTRADICTING', 'IRRELEVANT']);

function oneOf(value, values, code) {
  const normalized = String(value ?? '').toUpperCase();
  if (!values.includes(normalized)) throw new Error(code);
  return normalized;
}

export function createLocation(input = {}) {
  if (input.referenceId) return immutable({
    schemaVersion: 'vigia.location.v1', kind: 'GEOMETRY_REFERENCE',
    referenceId: requiredText(input.referenceId, 'location_reference_required'),
    geometry: null
  });
  const coordinate = input.coordinate ?? input.geometry?.coordinates;
  if (!Array.isArray(coordinate) || coordinate.length !== 2 || !coordinate.map(Number).every(Number.isFinite)) throw new Error('valid_point_location_required');
  const [longitude, latitude] = coordinate.map(Number);
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) throw new Error('valid_point_location_required');
  return immutable({ schemaVersion: 'vigia.location.v1', kind: 'GEOMETRY', geometry: { type: 'Point', coordinates: [longitude, latitude] }, referenceId: null });
}

export function createIncident(input = {}) {
  return immutable({
    schemaVersion: 'vigia.incident.v1', id: requiredText(input.id, 'incident_id_required'),
    incidentType: requiredText(input.incidentType, 'incident_type_required'),
    openedAt: isoTime(input.openedAt, 'incident_opened_at_required'),
    location: createLocation(input.location), claimIds: uniqueSorted(input.claimIds),
    status: String(input.status ?? 'OPEN').toUpperCase(), metadata: structuredClone(input.metadata ?? {})
  });
}

export function createClaim(input = {}) {
  const validFrom = isoTime(input.validTime?.from, 'claim_valid_from_required');
  const validTo = isoTime(input.validTime?.to ?? input.validTime?.from, 'claim_valid_to_required');
  if (Date.parse(validTo) < Date.parse(validFrom)) throw new Error('invalid_claim_time_window');
  return immutable({
    schemaVersion: 'vigia.claim.v1', id: requiredText(input.id, 'claim_id_required'),
    incidentId: requiredText(input.incidentId, 'claim_incident_id_required'),
    claimType: requiredText(input.claimType, 'claim_type_required'),
    proposition: requiredText(input.proposition, 'claim_proposition_required'),
    location: createLocation(input.location), validTime: { from: validFrom, to: validTo },
    contract: { id: requiredText(input.contract?.id, 'claim_contract_id_required'), version: requiredText(input.contract?.version, 'claim_contract_version_required') },
    metadata: structuredClone(input.metadata ?? {})
  });
}

export function createSourceFamily(input = {}) {
  return immutable({
    schemaVersion: 'vigia.source-family.v1', id: requiredText(input.id, 'source_family_id_required'),
    familyClass: oneOf(input.familyClass, SOURCE_FAMILY_CLASSES, 'invalid_source_family_class'),
    label: requiredText(input.label ?? input.id, 'source_family_label_required'),
    description: String(input.description ?? ''), metadata: structuredClone(input.metadata ?? {})
  });
}

export function createSource(input = {}) {
  return immutable({
    schemaVersion: 'vigia.source.v1', id: requiredText(input.id, 'source_id_required'),
    familyId: requiredText(input.familyId, 'source_family_required'),
    kind: oneOf(input.kind ?? 'OTHER', SOURCE_KINDS, 'invalid_source_kind'),
    label: requiredText(input.label ?? input.id, 'source_label_required'),
    upstreamSourceIds: uniqueSorted(input.upstreamSourceIds),
    status: String(input.status ?? 'ACTIVE').toUpperCase(), metadata: structuredClone(input.metadata ?? {})
  });
}

export function createObservation(input = {}) {
  return immutable({
    schemaVersion: 'vigia.observation.v1', id: requiredText(input.id, 'observation_id_required'),
    sourceId: requiredText(input.sourceId, 'observation_source_required'),
    observedAt: isoTime(input.observedAt, 'observation_time_required'),
    state: oneOf(input.state, OBSERVATION_STATES, 'invalid_observation_state'),
    location: createLocation(input.location),
    opportunity: { state: oneOf(input.opportunity?.state ?? 'UNKNOWN', OBSERVATION_OPPORTUNITY_STATES, 'invalid_observation_opportunity'), reason: String(input.opportunity?.reason ?? '') },
    upstreamMeasurementId: input.upstreamMeasurementId ? String(input.upstreamMeasurementId) : null,
    derivedFromObservationIds: uniqueSorted(input.derivedFromObservationIds),
    value: structuredClone(input.value ?? null), provenance: structuredClone(input.provenance ?? {})
  });
}

export function createEvidence(input = {}) {
  return immutable({
    schemaVersion: 'vigia.claim-evidence.v1', id: requiredText(input.id, 'evidence_id_required'),
    claimId: requiredText(input.claimId, 'evidence_claim_required'),
    observationId: requiredText(input.observationId, 'evidence_observation_required'),
    stance: oneOf(input.stance, EVIDENCE_STANCES, 'invalid_evidence_stance'),
    provenanceStrength: String(input.provenanceStrength ?? 'UNKNOWN').toUpperCase(),
    materiality: String(input.materiality ?? 'MATERIAL').toUpperCase(),
    contradictionStatus: String(input.contradictionStatus ?? 'UNRESOLVED').toUpperCase(),
    rationale: String(input.rationale ?? ''), provenance: structuredClone(input.provenance ?? {})
  });
}

export function createOperationalEntity(kind, input = {}) {
  if (!['Asset', 'Organization', 'Action', 'PolicyReference', 'Outcome'].includes(kind)) throw new Error('unsupported_operational_entity_kind');
  return immutable({ schemaVersion: `vigia.${kind.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).replace(/^-/, '')}.v1`, kind,
    id: requiredText(input.id, 'operational_entity_id_required'), incidentId: input.incidentId ? String(input.incidentId) : null,
    label: requiredText(input.label ?? input.id, 'operational_entity_label_required'), attributes: structuredClone(input.attributes ?? {}) });
}
