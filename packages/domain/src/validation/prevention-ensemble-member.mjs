import { buildFuelConnectivityGraph, buildInterventionCandidate } from '../fuel-connectivity-graph.mjs';

const round = (value, digits = 4) => Number(Number(value).toFixed(digits));
const finitePoint = (value) => Array.isArray(value) && value.length === 2 && value.every((item) => Number.isFinite(Number(item)));

export function measurePreventionEnsembleMember({ finding, baseGraph, baseRank, result, groupSize, variantId, evidenceAxis, parameters = {}, scenePair = null } = {}) {
  if (!finding?.geometry || !baseGraph || !variantId || !['PARAMETER', 'SCENE'].includes(evidenceAxis)) throw new Error('prevention_ensemble_member_input_invalid');
  const identity = { id: variantId, evidenceAxis, parameters: structuredClone(parameters), scenePair: scenePair ? structuredClone(scenePair) : null };
  if (!result || result.ok === false || result.state !== 'screened') {
    return { ...identity, state: 'UNMEASURED', candidateSurvived: false, reason: result?.reason ?? result?.error ?? 'worker_unavailable' };
  }
  const validationComponents = (result.validationComponents ?? []).filter((candidate) => candidate.passesNewFuelGate && candidate.reachesBoundary);
  const candidates = validationComponents.length ? validationComponents : (result.findings ?? []);
  const matches = candidates
    .map((candidate, index) => ({ candidate, index, geometryIou: preventionGeometryIou(finding.geometry, candidate.geometry) }))
    .sort((a, b) => b.geometryIou - a.geometryIou || a.index - b.index);
  const match = matches[0];
  if (!match || match.geometryIou < .02) {
    return { ...identity, state: 'MEASURED', candidateSurvived: false, geometryIou: 0, nodeStability: 0, edgeStability: 0, breakpointStability: 0, breakpointDriftMeters: null, assetPathStability: 0, rankStability: 0, candidateCount: candidates.length, candidateGeometry: null, graph: null, intervention: null, sourceQuality: measuredSourceQuality(result) };
  }
  const alternateFinding = {
    ...finding,
    geometry: match.candidate.geometry,
    affectedAreaHa: Number(match.candidate.areaM2) / 10_000,
    corridorLengthM: match.candidate.corridorLengthM,
    sourceQuality: measuredSourceQuality(result)
  };
  const graph = buildFuelConnectivityGraph(alternateFinding);
  const intervention = buildInterventionCandidate(alternateFinding, graph);
  const baseIntervention = buildInterventionCandidate(finding, baseGraph);
  const nodeStability = countStability(baseGraph.nodes, graph.nodes);
  const edgeStability = countStability(baseGraph.edges, graph.edges);
  const baseBreakpoint = baseIntervention?.geometry?.coordinates?.[0];
  const alternateBreakpoint = intervention?.geometry?.coordinates?.[0];
  const breakpointDistance = finitePoint(baseBreakpoint) && finitePoint(alternateBreakpoint) ? preventionPointDistanceMeters(baseBreakpoint, alternateBreakpoint) : Infinity;
  const beforePaths = Number(finding.structuresWithinPolicyRadius ?? 0);
  const alternateRank = match.index + 1;
  return {
    ...identity,
    state: 'MEASURED',
    candidateSurvived: true,
    geometryIou: round(match.geometryIou),
    nodeStability: round(nodeStability),
    edgeStability: round(edgeStability),
    breakpointStability: Number.isFinite(breakpointDistance) ? round(Math.max(0, 1 - breakpointDistance / 150)) : 0,
    breakpointDriftMeters: Number.isFinite(breakpointDistance) ? round(breakpointDistance, 1) : null,
    assetPathStability: beforePaths ? 1 : 0,
    assetPathQualification: 'Persisted geometry-bound asset relationship held constant while physical component geometry is perturbed.',
    rankStability: round(groupSize <= 1 ? 1 : Math.max(0, 1 - Math.abs(baseRank - alternateRank) / (groupSize - 1))),
    candidateCount: candidates.length,
    matchedCandidateIndex: match.index,
    candidateGeometry: structuredClone(match.candidate.geometry),
    graph: {
      version: graph.version,
      nodes: structuredClone(graph.nodes),
      edges: structuredClone(graph.edges),
      assetRelation: structuredClone(graph.assetRelation),
      quality: structuredClone(graph.quality)
    },
    intervention: intervention ? {
      geometry: structuredClone(intervention.geometry),
      connectedFuelAreaHa: {
        before: intervention.connectivity.before.connectedFuelAreaHa,
        after: intervention.connectivity.after.connectedFuelAreaHa
      },
      assetConnectedPaths: {
        before: intervention.connectivity.before.assetConnectedPaths,
        after: intervention.connectivity.after.assetConnectedPaths
      },
      modeledConnectivityReduction: intervention.connectivity.modeledConnectivityReduction,
      reviewPriorityScore: intervention.reviewPriority.score,
      claimBoundary: intervention.claimBoundary
    } : null,
    sourceQuality: measuredSourceQuality(result)
  };
}

export function preventionPointDistanceMeters(a, b) {
  if (!finitePoint(a) || !finitePoint(b)) return Infinity;
  const latitude = (Number(a[1]) + Number(b[1])) / 2 * Math.PI / 180;
  return Math.hypot((Number(a[0]) - Number(b[0])) * 111_320 * Math.cos(latitude), (Number(a[1]) - Number(b[1])) * 110_540);
}

export function preventionGeometryIou(a, b) {
  const bboxA = geometryBbox(a), bboxB = geometryBbox(b);
  if (!bboxA || !bboxB) return 0;
  const union = [Math.min(bboxA[0], bboxB[0]), Math.min(bboxA[1], bboxB[1]), Math.max(bboxA[2], bboxB[2]), Math.max(bboxA[3], bboxB[3])];
  let intersection = 0, occupied = 0;
  const size = 128;
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const point = [union[0] + (x + .5) / size * (union[2] - union[0]), union[1] + (y + .5) / size * (union[3] - union[1])];
    const insideA = geometryContains(a, point), insideB = geometryContains(b, point);
    if (insideA || insideB) occupied += 1;
    if (insideA && insideB) intersection += 1;
  }
  return occupied ? intersection / occupied : 0;
}

function measuredSourceQuality(result) {
  const validPixelFraction = Number(result?.validFraction ?? result?.screeningDiagnostics?.validPixelFraction);
  return {
    state: Number.isFinite(validPixelFraction) ? 'PIXEL_VERIFIED' : 'UNMEASURED',
    validPixelFraction: Number.isFinite(validPixelFraction) ? round(validPixelFraction) : null,
    qualification: 'Quality is measured for this exact ensemble realization.'
  };
}

function countStability(a = [], b = []) {
  return a.length || b.length ? Math.min(a.length, b.length) / Math.max(a.length, b.length) : 0;
}

function geometryBbox(geometry) {
  const points = [];
  visitCoordinates(geometry?.coordinates, points);
  if (!points.length) return null;
  return [Math.min(...points.map((point) => point[0])), Math.min(...points.map((point) => point[1])), Math.max(...points.map((point) => point[0])), Math.max(...points.map((point) => point[1]))];
}

function visitCoordinates(value, points) {
  if (Array.isArray(value) && value.length === 2 && value.every(Number.isFinite)) points.push(value);
  else if (Array.isArray(value)) for (const item of value) visitCoordinates(item, points);
}

function geometryContains(geometry, point) {
  const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polygons.some((polygon) => polygon.length && ringContains(polygon[0], point) && !polygon.slice(1).some((ring) => ringContains(ring, point)));
}

function ringContains(ring, [x, y]) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const xi = ring[index][0], yi = ring[index][1], xj = ring[previous][0], yj = ring[previous][1];
    if (((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / ((yj - yi) || Number.EPSILON) + xi) inside = !inside;
  }
  return inside;
}
