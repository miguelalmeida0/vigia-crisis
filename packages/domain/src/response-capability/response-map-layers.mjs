import { immutable } from '../intelligence/shared.mjs';

export function responseCapabilityMapLayers(projection) {
  const coverage = projection?.resourceCoverageMap;
  const routeFeatures = coverage?.routeFeatures?.features;
  const facilityFeatures = coverage?.facilityFeatures?.features;
  const routeReady = coverage?.state === 'ROUTED_PATH_COVERAGE_AVAILABLE' && Array.isArray(routeFeatures) && routeFeatures.length > 0;
  const facilitiesReady = Array.isArray(facilityFeatures) && facilityFeatures.length > 0;
  const surface = coverage?.responseCoverageSurface;
  const surfaceFeatures = surface?.features?.features;
  const surfaceReady = surface?.state === 'ROAD_NETWORK_SAMPLE_SURFACE_AVAILABLE' && Array.isArray(surfaceFeatures) && surfaceFeatures.length > 0;
  return immutable({
    responseCoverageSurface: {
      state: surfaceReady ? 'READY' : 'UNAVAILABLE',
      authority: 'ROUTING_ESTIMATE_SAMPLED_SURFACE',
      value: surfaceReady ? surfaceFeatures : [],
      reason: surfaceReady ? null : surface?.reason ?? 'No governed road-network coverage sample surface is available.',
      inventory: { returned: surfaceReady ? surfaceFeatures.length : 0, total: surfaceReady ? surfaceFeatures.length : 0, truncated: false },
      truthBoundary: surface?.truthBoundary ?? 'No regional response-coverage claim is available.'
    },
    responseCoverageRoutes: {
      state: routeReady ? 'READY' : 'UNAVAILABLE',
      authority: 'ROUTING_ESTIMATE',
      value: routeReady ? routeFeatures : [],
      reason: routeReady ? null : coverage?.serviceArea?.reason ?? 'No governed routed road geometry is available.',
      inventory: { returned: routeReady ? routeFeatures.length : 0, total: routeReady ? routeFeatures.length : 0, truncated: false },
      truthBoundary: coverage?.truthBoundary ?? 'No road-route coverage claim is available.'
    },
    responseFacilities: {
      state: facilitiesReady ? 'READY' : 'UNAVAILABLE',
      authority: 'GOVERNED_STATIC_CONTEXT',
      value: facilitiesReady ? facilityFeatures : [],
      reason: facilitiesReady ? null : 'No governed response-facility coordinate is available.',
      inventory: { returned: facilitiesReady ? facilityFeatures.length : 0, total: facilitiesReady ? facilityFeatures.length : 0, truncated: false },
      truthBoundary: 'Facility points are mapped static context. They do not prove operational status, capacity, dispatch, or availability.'
    }
  });
}

