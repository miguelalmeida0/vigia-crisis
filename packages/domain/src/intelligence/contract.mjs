import { createHash } from 'node:crypto';

export const ONTOLOGY_VERSION = 'vigia.crisis-ontology.v1';
export const INTELLIGENCE_SCHEMA_VERSION = 'vigia.incident-intelligence.v1';

export const ONTOLOGY_OBJECT_TYPES = Object.freeze([
  'INCIDENT','OBSERVATION','RAW_SOURCE_PRODUCT','SOURCE','SOURCE_FAMILY','SOURCE_OPPORTUNITY','REPORT',
  'EVIDENCE_ASSERTION','EVIDENCE_SUPPORT','EVIDENCE_CONTRADICTION','INCIDENT_ASSOCIATION','UNKNOWN',
  'EVIDENCE_NEED','EVIDENCE_REQUEST','DECISION_STATE','DECISION_DELTA','OPERATOR_DECISION',
  'SOURCE_PERFORMANCE_CONTEXT','HANDOFF_SNAPSHOT','TERRITORY','MONITORED_ASSET','FIELDNET_STATE','PREVENT_FINDING'
]);

export const ONTOLOGY_INTERFACES = Object.freeze([
  'VERSIONED','PROVENANCED','INCIDENT_SCOPED','TEMPORAL','FRESHNESS_AWARE','AUDITABLE','OPERATOR_ACTIONABLE','MEASUREMENT_BOUND'
]);

export const RELATIONSHIP_TYPES = Object.freeze([
  'OBSERVATION_SUPPORTS_INCIDENT','OBSERVATION_CONTRADICTS_ASSERTION','REPORT_DESCRIBES_INCIDENT',
  'OBSERVATION_PRODUCED_BY_SOURCE','SOURCE_BELONGS_TO_SOURCE_FAMILY','EVIDENCE_NEED_BLOCKS_DECISION_STATE',
  'EVIDENCE_REQUEST_ADDRESSES_NEED','OPPORTUNITY_MAY_SATISFY_NEED','OPERATOR_DECISION_BASED_ON_STATE_VERSION',
  'DELTA_TRANSITIONS_STATE','HANDOFF_SNAPSHOT_CAPTURES_STATE_VERSION','PREVENT_FINDING_REQUIRES_MEASUREMENT'
]);

export function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => [key, stableValue(value[key])]));
  return value;
}

export function hashValue(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex')}`;
}

export function ontologyRelationship(input = {}) {
  if (!RELATIONSHIP_TYPES.includes(input.relationshipType)) throw new Error('invalid_ontology_relationship_type');
  if (!input.subjectId || !input.objectId) throw new Error('ontology_relationship_endpoints_required');
  if (!input.ruleOrAuthority) throw new Error('ontology_relationship_authority_required');
  if (!input.inputVersionHash) throw new Error('ontology_relationship_input_version_required');
  if (!input.provenance || typeof input.provenance !== 'object') throw new Error('ontology_relationship_provenance_required');
  const createdAt = new Date(input.createdAt).toISOString();
  const effectiveAt = new Date(input.effectiveAt ?? input.createdAt).toISOString();
  return Object.freeze({
    schemaVersion: 'vigia.ontology-relationship.v1', ontologyVersion: ONTOLOGY_VERSION,
    relationshipType: input.relationshipType, subjectId: String(input.subjectId), objectId: String(input.objectId),
    ruleOrAuthority: String(input.ruleOrAuthority), createdAt, effectiveAt,
    inputVersionHash: String(input.inputVersionHash), provenance: stableValue(input.provenance), status: String(input.status ?? 'ACTIVE')
  });
}

export function intelligenceBindings({ incident, evidenceGraph, sourceState, ruleSetVersion, generatedAt }) {
  if (!incident?.id) throw new Error('intelligence_incident_required');
  const incidentVersion = hashValue({
    id: incident.id, firstSeenAt: incident.firstSeenAt, lastSeenAt: incident.lastSeenAt,
    physicalOperationalState: incident.physicalOperationalState, physicalState: incident.physicalState,
    reportState: incident.reportState, contradictions: incident.contradictions,
    evidenceContradictions: incident.evidenceContradictions, fireEvidenceContradictions: incident.fireEvidenceState?.contradictions,
    lifeSafetyRelevance: incident.lifeSafetyRelevance, priority: incident.priority,
    prospectiveDetectionTiming: incident.prospectiveDetectionTiming,
    association: incident.association, correctionVersion: incident.correctionVersion ?? null
  });
  return Object.freeze({
    ontologyVersion: ONTOLOGY_VERSION, ruleSetVersion,
    incidentVersion, evidenceGraphHash: hashValue(evidenceGraph), sourceStateVersion: hashValue(sourceState),
    generatedAt: new Date(generatedAt).toISOString()
  });
}
