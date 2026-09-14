const array = (value) => (Array.isArray(value) ? value : []);
const object = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
export function compactLineCoordinates(value, limit = 32) {
  const coordinates = array(value);
  if (coordinates.length <= limit) return coordinates;
  const selected = [];
  for (let index = 0; index < limit; index += 1) {
    selected.push(coordinates[Math.round(index * (coordinates.length - 1) / (limit - 1))]);
  }
  return selected;
}
export function compactResponseGeoFeature(feature) {
  if (!feature || typeof feature !== 'object') return feature;
  const geometry = object(feature.geometry);
  if (geometry.type !== 'LineString') return feature;
  const originalCount = array(geometry.coordinates).length;
  const coordinates = compactLineCoordinates(geometry.coordinates);
  return {
    ...feature,
    geometry: { ...geometry, coordinates },
    properties: {
      ...object(feature.properties),
      wireGeometryOriginalCoordinateCount: originalCount,
      wireGeometryReturnedCoordinateCount: coordinates.length,
      wireGeometrySimplification: originalCount > coordinates.length ? 'DETERMINISTIC_VERTEX_SUBSET' : 'NONE',
    },
  };
}
function compactRoute(route) {
  if (!route || typeof route !== 'object') return route ?? null;
  const { geometry, coordinates, ...rest } = route;
  const originalCount = array(geometry?.coordinates ?? coordinates).length;
  return {
    ...rest,
    geometryState: route.geometryState ?? (originalCount ? 'AVAILABLE_IN_RESOURCE_COVERAGE_MAP' : null),
    wireGeometryReference: originalCount ? 'resourceCoverageMap.routeFeatures' : null,
    wireGeometryOriginalCoordinateCount: originalCount || null,
  };
}
export function compactResponseFacility(facility) {
  const source = object(facility), reachability = object(source.reachability), provenance = object(source.provenance);
  const { query, ...boundedProvenance } = provenance;
  return {
    id: source.id ?? null,
    kind: source.kind ?? null,
    name: source.name ?? null,
    address: source.address ?? null,
    addressPrecision: source.addressPrecision ?? null,
    locality: source.locality ?? null,
    municipality: source.municipality ?? null,
    district: source.district ?? null,
    contact: source.contact ?? null,
    canonicalId: source.canonicalId ?? null,
    canonicalType: source.canonicalType ?? null,
    canonicalRevision: source.canonicalRevision ?? null,
    canonicalIntelligence: source.canonicalIntelligence ?? null,
    presentation: source.presentation ?? null,
    distanceReference: source.distanceReference ?? 'REPORTED_INCIDENT_POINT',
    coordinate: source.coordinate ?? null,
    distanceKm: source.distanceKm ?? null,
    retrievalRank: source.retrievalRank ?? null,
    retrieval: source.retrieval ?? null,
    candidateCohort: source.candidateCohort ?? null,
    staticCapability: source.staticCapability ?? null,
    dynamicCapacity: source.dynamicCapacity ?? null,
    freshness: source.freshness ?? null,
    lastKnownOperationalStatus: source.lastKnownOperationalStatus ?? null,
    sourceObservedAt: source.sourceObservedAt ?? null,
    reachability: {
      state: reachability.state ?? null,
      method: reachability.method ?? null,
      routeDistanceKm: reachability.routeDistanceKm ?? null,
      travelTimeMinutes: reachability.travelTimeMinutes ?? null,
      currentRoute: compactRoute(reachability.currentRoute),
      alternativeRoute: compactRoute(reachability.alternativeRoute),
      alternativeRouteState: reachability.alternativeRouteState ?? null,
      roadClosureImpact: reachability.roadClosureImpact ?? null,
      terrainAccessConstraints: reachability.terrainAccessConstraints ?? null,
      source: reachability.source ?? null,
      checkedAt: reachability.checkedAt ?? null,
      confidence: reachability.confidence ?? null,
      reason: reachability.reason ?? null,
    },
    provenance: {
      ...boundedProvenance,
      queryWireState: query ? 'OMITTED_RETAINED_IN_GOVERNED_ARCHIVE' : 'NOT_RECORDED',
    },
  };
}
function compactCoverageSource(value) {
  const source = object(value), provider = object(source.source), { query, records, ...boundedProvider } = provider;
  return { ...source, source: { ...boundedProvider, recordInventory: { total: array(records).length },
    queryWireState: query ? 'OMITTED_RETAINED_IN_GOVERNED_ARCHIVE' : 'NOT_RECORDED' } };
}
function compactOptimizerCandidate(value) {
  const source = object(value);
  return Object.fromEntries([
    'facilityId', 'kind', 'routeState', 'routeCheckedAt', 'routeDistanceKm', 'straightLineDistanceKm',
    'travelTimeMinutes', 'capacityState', 'capacityKnown', 'capacityDecisionRelevant',
    'capacityObservedAt', 'availableQuantity', 'requiredQuantity', 'effectiveAvailableQuantity',
    'capabilityQualified', 'eligibleForDispatchRecommendation', 'commitmentAdjustmentState',
    'coveragePenalty', 'stagingSafety', 'exclusionReasons',
  ].map((key) => [key, source[key] ?? null]));
}
function compactOptimizerInputs(value) {
  const source = object(value), candidates = array(source.candidates), unknowns = array(source.unknowns);
  return { ...source, candidates: candidates.map(compactOptimizerCandidate),
    candidateInventory: { total: candidates.length, returned: candidates.length, truncated: false }, unknowns,
    unknownInventory: { total: unknowns.length, returned: unknowns.length, truncated: false } };
}
function compactCoverageCapability(value) { const source = object(value); return {
  state: source.state ?? null, facilityId: source.facilityId ?? null, facilityLabel: source.facilityLabel ?? null,
  travelTimeMinutes: source.travelTimeMinutes ?? null, routeDistanceKm: source.routeDistanceKm ?? null,
  capacityAvailability: source.capacityAvailability ?? null, committedCount: source.committedCount ?? null,
}; }
export const compactResponseCoverageFeature = (feature) => {
  const compact = compactResponseGeoFeature(feature), properties = object(compact?.properties);
  const capabilityByKind = Object.fromEntries(Object.entries(object(properties.capabilityByKind)).map(
    ([kind, value]) => [kind, compactCoverageCapability(value)],
  ));
  return { ...compact, properties: { ...properties, capabilityByKind,
    capabilityDetailReference: '/api/v10/operator/incidents/{incidentId}/response-capability' } };
};
export function compactResponseMapFeature(feature) {
  const compact = compactResponseGeoFeature(feature), properties = object(compact?.properties);
  if (properties.layer !== 'responseCoverageSurface') return compact;
  const { capabilityByKind, ...summary } = properties;
  return {
    ...compact,
    properties: { ...summary,
      capabilityDetailState: capabilityByKind ? 'OMITTED_FROM_MAP_LAYER' : 'NOT_RECORDED',
      capabilityDetailReference: '/api/v10/operator/incidents/{incidentId}/response-capability',
    },
  };
}

function compactFeatureCollection(collection, projector = compactResponseGeoFeature) {
  const source = object(collection), features = array(source.features);
  return {
    ...source,
    features: features.map(projector),
    wireInventory: { total: features.length, returned: features.length, truncated: false },
  };
}

function boundedFeatureCollection(collection, limit, projector = compactResponseGeoFeature) {
  const source = object(collection), features = array(source.features), bounded = features.slice(0, limit);
  return {
    ...source,
    features: bounded.map(projector),
    wireInventory: { total: features.length, returned: bounded.length, truncated: features.length > bounded.length },
  };
}

export function compactResponseCapabilityProjection(projection) {
  if (!projection || typeof projection !== 'object') return projection;
  const facilities = Object.fromEntries(Object.entries(object(projection.facilities)).map(
    ([kind, values]) => [kind, array(values).map(compactResponseFacility)],
  ));
  const coverage = object(projection.resourceCoverageMap);
  return {
    ...projection,
    facilities,
    sourceCoverage: Object.fromEntries(Object.entries(object(projection.sourceCoverage)).map(
      ([kind, value]) => [kind, compactCoverageSource(value)],
    )),
    optimizerInputs: compactOptimizerInputs(projection.optimizerInputs),
    resourceCoverageMap: {
      ...coverage,
      routeFeatures: compactFeatureCollection(coverage.routeFeatures),
      facilityFeatures: compactFeatureCollection(coverage.facilityFeatures),
      responseCoverageSurface: coverage.responseCoverageSurface ? {
        ...coverage.responseCoverageSurface,
        features: compactFeatureCollection(coverage.responseCoverageSurface.features, compactResponseCoverageFeature),
      } : coverage.responseCoverageSurface,
      wireProjection: {
        state: 'BOUNDED_OPERATOR_DTO',
        fullProjectionRetainedServerSide: true,
        routeGeometryPolicy: 'DETERMINISTIC_VERTEX_SUBSET_MAX_32',
        facilityQueryPolicy: 'OMITTED_WITH_ARCHIVE_PROVENANCE_RETAINED',
      },
    },
  };
}

export function compactResponseCapabilitySection(section) {
  if (!section || typeof section !== 'object' || !Object.hasOwn(section, 'value')) return section;
  const projection = compactResponseCapabilityProjection(section.value);
  if (!projection || typeof projection !== 'object') return { ...section, value: projection };
  const facilities = Object.fromEntries(Object.entries(object(projection.facilities)).map(
    ([kind, values]) => [kind, array(values).slice(0, 2)],
  ));
  const facilityInventory = Object.fromEntries(Object.entries(object(projection.facilities)).map(
    ([kind, values]) => [kind, {
      total: array(values).length,
      returned: array(facilities[kind]).length,
      truncated: array(values).length > array(facilities[kind]).length,
    }],
  ));
  const coverage = object(projection.resourceCoverageMap), surface = object(coverage.responseCoverageSurface);
  const surfaceFeatures = array(surface.features?.features);
  const coverageStateCounts = surfaceFeatures.reduce((counts, feature) => {
    const state = feature?.properties?.coverageState ?? 'UNKNOWN';
    counts[state] = (counts[state] ?? 0) + 1;
    return counts;
  }, {});
  return {
    ...section,
    value: {
      ...projection,
      facilities,
      facilityInventory,
      resourceCoverageMap: {
        ...coverage,
        routeFeatures: boundedFeatureCollection(coverage.routeFeatures, 12),
        facilityFeatures: boundedFeatureCollection(coverage.facilityFeatures, 16),
        responseCoverageSurface: surface ? { ...surface,
          coverageStateCounts,
          features: boundedFeatureCollection(surface.features, 8, compactResponseCoverageFeature),
        } : surface,
        wireProjection: { ...object(coverage.wireProjection),
          embeddedRoutePolicy: 'FIRST_12_WITH_EXACT_INVENTORY',
          embeddedFacilityPolicy: 'FIRST_16_WITH_EXACT_INVENTORY',
          embeddedSamplePolicy: 'FIRST_8_WITH_EXACT_STATE_COUNTS_AND_INVENTORY',
        },
      },
    },
  };
}
