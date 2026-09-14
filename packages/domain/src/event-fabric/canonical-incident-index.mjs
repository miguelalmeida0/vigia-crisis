import { createHash } from 'node:crypto';

export const CANONICAL_INCIDENT_INDEX_SCHEMA = 'vigia.canonical-incident-index.v1';
export const CANONICAL_INCIDENT_ID_PATTERN = /^PT-[A-Z0-9-]+$/;

const text = (value) => {
  const normalized = String(value ?? '').trim();
  return normalized || null;
};

const projectionMaterial = (projection = {}) => {
  const command = projection.command ? { ...projection.command } : null;
  if (command) delete command.projectionFingerprint;
  return {
    schema: projection.schema ?? null,
    generatedAt: projection.generatedAt ?? null,
    meta: projection.meta ?? null,
    clocks: projection.clocks ?? null,
    command,
    operatorEvents: Array.isArray(projection.operatorEvents) ? projection.operatorEvents : [],
  };
};

export function eventProjectionFingerprint(projection) {
  return `sha256:${createHash('sha256').update(JSON.stringify(projectionMaterial(projection))).digest('hex')}`;
}

export function bindEventProjection(projection) {
  const projectionFingerprint = eventProjectionFingerprint(projection);
  return {
    ...projection,
    projectionFingerprint,
    command: projection?.command ? { ...projection.command, projectionFingerprint } : projection?.command,
  };
}

export function buildCanonicalIncidentIndex(projection) {
  const bound = bindEventProjection(projection);
  const scope = text(bound.meta?.region);
  const sourceEvents = bound.operatorEvents ?? [];
  const incidents = sourceEvents.map((event) => ({
    id: text(event?.id),
    state: text(event?.physicalOperationalState ?? event?.evidenceState ?? event?.knowledgeState),
    scope,
  })).filter((incident) => CANONICAL_INCIDENT_ID_PATTERN.test(String(incident.id))).sort((left, right) => String(left.id).localeCompare(String(right.id)));
  return assertCanonicalIncidentIndex({
    schemaVersion: CANONICAL_INCIDENT_INDEX_SCHEMA,
    generatedAt: bound.generatedAt,
    projectionFingerprint: bound.projectionFingerprint,
    sourceEventCount: sourceEvents.length,
    excludedNonCanonicalEventCount: sourceEvents.length - incidents.length,
    incidentCount: incidents.length,
    incidents,
  });
}

export function assertCanonicalIncidentIndex(value) {
  if (!value || value.schemaVersion !== CANONICAL_INCIDENT_INDEX_SCHEMA) throw new Error('canonical_incident_index_schema_invalid');
  if (!Number.isFinite(Date.parse(value.generatedAt ?? ''))) throw new Error('canonical_incident_index_generated_at_invalid');
  if (!/^sha256:[a-f0-9]{64}$/.test(String(value.projectionFingerprint ?? ''))) throw new Error('canonical_incident_index_projection_fingerprint_invalid');
  if (!Number.isInteger(value.incidentCount) || value.incidentCount < 0 || !Array.isArray(value.incidents) || value.incidents.length !== value.incidentCount) throw new Error('canonical_incident_index_count_invalid');
  if (!Number.isInteger(value.sourceEventCount) || value.sourceEventCount < value.incidentCount || value.excludedNonCanonicalEventCount !== value.sourceEventCount - value.incidentCount) throw new Error('canonical_incident_index_source_count_invalid');
  const ids = value.incidents.map((incident) => String(incident?.id ?? ''));
  if (ids.some((id) => !CANONICAL_INCIDENT_ID_PATTERN.test(id))) throw new Error('canonical_incident_index_incident_id_invalid');
  if (new Set(ids).size !== ids.length) throw new Error('canonical_incident_index_incident_id_duplicate');
  if (ids.some((id, index) => index > 0 && ids[index - 1].localeCompare(id) >= 0)) throw new Error('canonical_incident_index_order_invalid');
  return value;
}

export function selectCanonicalFieldNetIncident(index, { priorIncidentId = null } = {}) {
  const validated = assertCanonicalIncidentIndex(index);
  const available = new Set(validated.incidents.map((incident) => incident.id));
  const retained = text(priorIncidentId);
  if (retained && available.has(retained)) return retained;
  return validated.incidents[0]?.id ?? null;
}
