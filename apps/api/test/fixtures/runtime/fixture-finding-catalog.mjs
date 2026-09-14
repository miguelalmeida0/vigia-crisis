const FINDINGS = Object.freeze({
  '1816': {
    id: 'finding:1816:vegetation', modelId: 'vegetation-continuity-v1', label: 'Possible continuous vegetation corridor',
    findingType: 'vegetation_continuity', imagePolygonPct: [[49,44],[66,43],[67,55],[50,56]],
    geometry: { type: 'Polygon', coordinates: [[[-8.095,40.754],[-8.067,40.754],[-8.067,40.767],[-8.095,40.767],[-8.095,40.754]]] }, confidence: .86
  },
  '1013': {
    id: 'finding:1013:accumulation', modelId: 'combustible-accumulation-v1', label: 'Possible large roadside combustible accumulation',
    findingType: 'combustible_accumulation', imagePolygonPct: [[48,45],[67,44],[68,56],[49,57]],
    geometry: { type: 'Polygon', coordinates: [[[-8.156,39.912],[-8.132,39.912],[-8.132,39.928],[-8.156,39.928],[-8.156,39.912]]] }, confidence: .78
  },
  '0508': {
    id: 'finding:0508:access', modelId: 'access-obstruction-v1', label: 'Possible emergency-access degradation',
    findingType: 'access_obstruction', imagePolygonPct: [[50,46],[67,45],[68,57],[51,58]],
    geometry: { type: 'LineString', coordinates: [[-7.935,39.742],[-7.902,39.762]] }, confidence: .74
  }
});

export function fixtureFindingFor(municipalityId, observedAt) {
  const finding = FINDINGS[String(municipalityId)];
  if (!finding) return [];
  return [{
    ...finding,
    observedAt,
    state: 'requires_review',
    fixtureDemo: true,
    qualityFlags: ['synthetic-location-specific-demo'],
    explanation: 'Demonstration model output bound to the location-specific fixture. It requires human acceptance and is never treated as a verified hazard.'
  }];
}
