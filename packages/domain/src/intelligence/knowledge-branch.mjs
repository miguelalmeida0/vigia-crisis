import {rankFacilities} from './situation-model.mjs';

// The knowledge branch: the bounded set of facts a preview is allowed to assume,
// and how each one is applied to a DEEP COPY of a retained snapshot.
//
// Nothing here writes. Every fact a branch introduces is marked previewOnly so it
// can never be mistaken for, or serialized as, an accepted operational fact.


export const PREVIEW_LABEL = 'KNOWLEDGE IMPACT PREVIEW — NOT OBSERVED REALITY';

export const PREVIEW_KINDS = Object.freeze([
  'FACILITY_CAPABILITY_CONFIRMED',
  'RECEPTION_ACTIVATION_CONFIRMED',
  'FACILITY_IDENTITY_RESOLVED',
  'ROAD_INFORMATION_COVERED'
]);

const CAPABILITY_FIELDS = Object.freeze({
  emergencyDepartment: {field: 'capabilities.emergencyDepartment', category: 'emergency_hospital', requiredType: 'hospital'},
  fireResponse: {field: 'capabilities.fireResponse', category: 'fire_response', requiredType: 'fire_station'}
});

const invalid = (message) => Object.assign(new Error(message), {statusCode: 400});

function assertPreviewRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw invalid('knowledge_preview_invalid');
  const allowed = ['kind', 'entityId', 'capability'];
  if (Object.keys(request).some((key) => !allowed.includes(key))) throw invalid('knowledge_preview_invalid');
  if (!PREVIEW_KINDS.includes(request.kind)) throw invalid('knowledge_preview_kind_unsupported');
  if (typeof request.entityId !== 'string' || !request.entityId || request.entityId.length > 180) throw invalid('knowledge_preview_entity_invalid');
  if (request.capability !== undefined && !Object.hasOwn(CAPABILITY_FIELDS, String(request.capability))) throw invalid('knowledge_preview_capability_unsupported');
  return request;
}

// Marks every fact introduced by a preview so it can never be mistaken for, or
// serialized as, an accepted operational fact.
function previewProvenance(at) {
  return Object.freeze({
    factId: null,
    provider: 'VIGIA_KNOWLEDGE_IMPACT_PREVIEW',
    authority: null,
    url: null,
    retrievedAt: at,
    validFrom: at,
    validUntil: null,
    previewOnly: true,
    limitation: 'Assumed for a knowledge-impact preview. This is not an accepted fact and is never persisted.'
  });
}

function applyBranch(snapshot, request, at) {
  const branch = structuredClone(snapshot);
  branch.universe = 'KNOWLEDGE_PREVIEW';
  branch.knowledgePreview = {label: PREVIEW_LABEL, assumption: structuredClone(request), basedOn: snapshot.id, appliedAt: at};
  const facility = branch.facilities.find((item) => item.id === request.entityId);

  if (request.kind === 'FACILITY_CAPABILITY_CONFIRMED') {
    const capability = String(request.capability ?? '');
    const definition = CAPABILITY_FIELDS[capability];
    if (!definition) throw invalid('knowledge_preview_capability_unsupported');
    if (!facility) throw invalid('knowledge_preview_facility_not_in_incident');
    if (facility.canonicalType !== definition.requiredType) throw invalid('knowledge_preview_capability_not_applicable');
    facility.fields = {...facility.fields, [definition.field]: {...facility.fields?.[definition.field], state: 'RESOLVED', previewOnly: true}};
    facility.capabilities = {...facility.capabilities, [capability]: true};
    facility.provenance = {...facility.provenance, [definition.field]: [previewProvenance(at)]};
    return {branch, facility, category: definition.category};
  }

  if (request.kind === 'RECEPTION_ACTIVATION_CONFIRMED') {
    if (!facility) throw invalid('knowledge_preview_facility_not_in_incident');
    if (!['temporary_reception_center', 'official_wildfire_refuge'].includes(facility.canonicalType)) throw invalid('knowledge_preview_activation_not_applicable');
    if (!facility.designation?.kind) throw invalid('knowledge_preview_activation_requires_designation');
    // Activation is time-bounded: a confirmed activation that has already lapsed
    // is not an activation, so the preview carries an explicit validity window.
    const validUntil = new Date(Date.parse(at) + 12 * 3600_000).toISOString();
    facility.fields = {...facility.fields, 'activation.state': {...facility.fields?.['activation.state'], state: 'RESOLVED', previewOnly: true}};
    facility.activation = {...facility.activation, state: 'ACTIVATED'};
    facility.provenance = {...facility.provenance, 'activation.state': [{...previewProvenance(at), validUntil}]};
    branch.facilities = branch.facilities.map((item) => item.id === facility.id ? {...facility, evaluatedAt: at} : item);
    return {branch, facility, category: 'active_reception'};
  }

  if (request.kind === 'FACILITY_IDENTITY_RESOLVED') {
    if (!facility) throw invalid('knowledge_preview_facility_not_in_incident');
    if (facility.resolutionState === 'RESOLVED') throw invalid('knowledge_preview_identity_already_resolved');
    facility.resolutionState = 'RESOLVED';
    facility.fields = {...facility.fields, canonicalType: {...facility.fields?.canonicalType, state: 'RESOLVED', previewOnly: true}};
    return {branch, facility, category: null};
  }

  // ROAD_INFORMATION_COVERED previews an information state, never a road state.
  // It asserts that the connected source would cover this road, not that the
  // road is open: the branch keeps every ingested restriction exactly as retained.
  const road = String(request.entityId).toUpperCase();
  const covered = new Set([...(branch.roadCoverage?.coveredRoads ?? []), road]);
  branch.roadCoverage = {...branch.roadCoverage, connected: true, coveredRoads: [...covered], checkedAt: at, validUntil: new Date(Date.parse(at) + 3600_000).toISOString(), state: 'PARTIAL', previewOnly: true};
  return {branch, facility: null, category: null, road};
}

export {CAPABILITY_FIELDS, invalid, assertPreviewRequest, previewProvenance, applyBranch};
