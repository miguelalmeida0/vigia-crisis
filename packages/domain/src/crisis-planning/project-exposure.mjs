import { semanticHash } from '../intelligence/shared.mjs';
import {
  distanceKm, normalizedCoordinate, normalizedSource, optionalInstant,
  requiredPlanningIncidentId, stablePlanningId,
} from './contracts.mjs';
import { admissionState, finite, idOf, isFuture, rows, text, unique } from './projection-helpers.mjs';

const CONTEXT_KINDS = Object.freeze({
  communities: 'COMMUNITY',
  hospitals: 'HOSPITAL',
  substations: 'SUBSTATION',
  telecom: 'TELECOM',
  water: 'WATER',
  schools: 'SCHOOL',
  roads: 'ROAD',
  shelters: 'SHELTER',
  fireStations: 'FIRE_STATION',
  criticalInfrastructure: 'CRITICAL_INFRASTRUCTURE',
});

function exposureNode(record, kind, asOf) {
  const id = idOf(record);
  if (!id) return { excluded: true, reason: 'CONTEXT_NODE_ID_REQUIRED' };
  const source = normalizedSource(record);
  const coordinate = normalizedCoordinate(record);
  const updatedAt = optionalInstant(record.updatedAt ?? record.observedAt ?? record.checkedAt ?? record.retrievedAt
    ?? record.provenance?.retrievedAt ?? record.provenance?.observedAt
    ?? record.freshness?.retrievedAt ?? record.freshness?.observedAt);
  const freshness = record.freshness && typeof record.freshness === 'object'
    ? text(record.freshness.state ?? record.freshness.classification)
    : text(record.freshness);
  return {
    excluded: false,
    node: {
      nodeId: id,
      id,
      kind,
      type: kind,
      label: text(record.name ?? record.label) ?? id,
      coordinate,
      coordinates: coordinate,
      contextState: source.attributable ? 'GOVERNED_CONTEXT' : 'PROVENANCE_INCOMPLETE',
      operationalState: text(record.operationalState ?? record.state) ?? 'UNKNOWN',
      source,
      updatedAt,
      freshness: freshness ?? (updatedAt ? 'NOT_CLASSIFIED' : 'UNKNOWN'),
      asOf,
    },
  };
}

export function projectDynamicExposureGraph({ incident, contexts, responseCapability, asOf }) {
  const incidentId = requiredPlanningIncidentId(incident);
  const incidentCoordinate = normalizedCoordinate(incident);
  const incidentNode = {
    nodeId: incidentId,
    id: incidentId,
    kind: 'INCIDENT',
    type: 'INCIDENT',
    label: text(incident.label ?? incident.name) ?? incidentId,
    coordinate: incidentCoordinate,
    coordinates: incidentCoordinate,
    truthState: text(incident.truthState ?? incident.operationalTruth?.classification) ?? 'UNKNOWN',
    geometryState: admissionState(incident.observedGeometry ?? incident.geometry ?? {}) ? 'ADMITTED_OBSERVED_GEOMETRY' : 'NO_ADMITTED_PERIMETER',
    asOf,
  };
  const nodes = [incidentNode];
  const excludedNodes = [];
  for (const [field, kind] of Object.entries(CONTEXT_KINDS)) {
    for (const record of rows(contexts[field])) {
      const projected = exposureNode(record, kind, asOf);
      if (projected.excluded) excludedNodes.push({ kind, inputReference: idOf(record), reason: projected.reason });
      else nodes.push(projected.node);
    }
  }
  for (const [kind, facilities] of Object.entries(responseCapability?.facilities ?? {})) {
    if (!['HOSPITAL', 'FIRE_STATION', 'EMS_BASE', 'CIVIL_PROTECTION', 'POLICE', 'SHELTER', 'WATER_POINT', 'AIR_SUPPORT_BASE'].includes(kind)) continue;
    for (const record of rows(facilities)) {
      if (nodes.some((node) => node.nodeId === idOf(record))) continue;
      const projected = exposureNode(record, kind, asOf);
      if (projected.excluded) excludedNodes.push({ kind, inputReference: idOf(record), reason: projected.reason });
      else nodes.push(projected.node);
    }
  }
  const governedNodes = [...new Map(nodes.map((node) => [node.nodeId, node])).values()];
  const nodeById = new Map(governedNodes.map((node) => [node.nodeId, node]));
  const edges = [];
  const excludedEdges = [];
  for (const node of governedNodes.filter((node) => node.nodeId !== incidentId)) {
    const distance = distanceKm(incidentCoordinate, node.coordinate);
    if (distance === null || !node.source?.attributable || !node.updatedAt || isFuture(node.updatedAt, asOf)) {
      excludedEdges.push({
        from: incidentId,
        to: node.nodeId,
        reason: distance === null
          ? 'VALID_COORDINATES_REQUIRED'
          : !node.source?.attributable
            ? 'ATTRIBUTABLE_CONTEXT_PROVENANCE_REQUIRED'
            : !node.updatedAt
              ? 'CONTEXT_TIME_REQUIRED'
              : 'FUTURE_CONTEXT_TIME_REJECTED',
      });
      continue;
    }
    const core = {
      from: incidentId,
      to: node.nodeId,
      relation: 'POINT_PROXIMITY',
      distanceKm: distance,
      dependency: null,
      exposureBasis: 'INCIDENT_POINT_TO_CONTEXT_POINT',
      exposureState: 'PRELIMINARY_CONTEXT_ONLY',
      confidence: { state: 'GEOMETRIC_DISTANCE_ONLY', score: null },
      updatedAt: node.updatedAt,
      sourceReferences: unique([node.source.reference]),
      perimeterUsed: false,
    };
    edges.push({ edgeId: stablePlanningId('exposure-edge', core), ...core });
  }
  for (const explicit of rows(contexts.exposureEdges)) {
    const from = text(explicit.from ?? explicit.sourceNodeId);
    const to = text(explicit.to ?? explicit.targetNodeId);
    const source = normalizedSource(explicit);
    const updatedAt = optionalInstant(explicit.updatedAt ?? explicit.observedAt);
    const basis = text(explicit.exposureBasis ?? explicit.basis);
    if (!from || !to || !nodeById.has(from) || !nodeById.has(to) || !source.attributable || !updatedAt || !basis) {
      excludedEdges.push({ from, to, reason: 'EXPLICIT_EDGE_REQUIRES_KNOWN_NODES_BASIS_ATTRIBUTABLE_PROVENANCE_AND_TIME' });
      continue;
    }
    if (isFuture(updatedAt, asOf)) {
      excludedEdges.push({ from, to, reason: 'FUTURE_EXPLICIT_EDGE_TIME_REJECTED', updatedAt });
      continue;
    }
    const observed = explicit.observed === true && unique(explicit.evidenceReferences ?? [source.reference]).length > 0;
    const core = {
      from,
      to,
      relation: text(explicit.relation) ?? 'EXPOSURE_RELATION',
      distanceKm: finite(explicit.distanceKm),
      dependency: text(explicit.dependency),
      exposureBasis: basis,
      exposureState: observed ? 'OBSERVED_GOVERNED_RELATION' : 'GOVERNED_CONTEXT_RELATION',
      confidence: explicit.confidence ?? { state: 'NOT_SCORED', score: null },
      updatedAt,
      sourceReferences: unique(explicit.evidenceReferences ?? [source.reference]),
      perimeterUsed: explicit.perimeterUsed === true && admissionState(incident.observedGeometry ?? incident.geometry ?? {}),
    };
    edges.push({ edgeId: stablePlanningId('exposure-edge', core), ...core });
  }
  const core = {
    schemaVersion: 'vigia.dynamic-exposure-graph.v1',
    incidentId,
    generatedAt: asOf,
    state: edges.length ? 'AVAILABLE' : 'NO_GOVERNED_EDGES',
    basis: admissionState(incident.observedGeometry ?? incident.geometry ?? {}) ? 'EXPLICIT_GOVERNED_RELATIONS_AND_POINT_PROXIMITY' : 'POINT_PROXIMITY',
    nodes: governedNodes.sort((left, right) => left.kind.localeCompare(right.kind) || left.nodeId.localeCompare(right.nodeId)),
    edges: [...new Map(edges.map((edge) => [edge.edgeId, edge])).values()].sort((left, right) => left.edgeId.localeCompare(right.edgeId)),
    excludedNodes,
    excludedEdges,
    truthBoundary: 'Point-to-point proximity is preliminary context when an admitted perimeter or explicit governed exposure relation is unavailable. It is never presented as observed impact or perimeter intersection.',
  };
  return { ...core, projectionHash: semanticHash('dynamic-exposure-graph', core) };
}

