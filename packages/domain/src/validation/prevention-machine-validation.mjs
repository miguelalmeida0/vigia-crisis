import { createHash } from 'node:crypto';

const round = (value, digits = 4) => Number(Number(value).toFixed(digits));
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value)));
const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export function landCoverConcordance(landCover = {}) {
  const composition = landCover.composition ?? {};
  const samplePixels = Number(landCover.samplePixels ?? 0);
  if (!samplePixels || landCover.state !== 'MEASURED_GEOMETRY_BOUND') {
    return { state: 'UNMEASURED', denominatorPixels: samplePixels, referenceCoverage: null, concordance: null, disagreementRate: null, unmappedRate: null };
  }
  const supportive = ['tree_cover', 'shrubland', 'grassland'].reduce((sum, key) => sum + Number(composition[key] ?? 0), 0);
  const managedTransitionRisk = ['cropland', 'built_up'].reduce((sum, key) => sum + Number(composition[key] ?? 0), 0);
  const discordant = ['built_up', 'permanent_water', 'herbaceous_wetland', 'snow_and_ice', 'bare_or_sparse_vegetation', 'mangroves', 'moss_and_lichen'].reduce((sum, key) => sum + Number(composition[key] ?? 0), 0);
  const mapped = Object.values(composition).reduce((sum, value) => sum + Number(value ?? 0), 0);
  return {
    state: 'MEASURED_REFERENCE_CONCORDANCE',
    denominatorPixels: samplePixels,
    referenceCoverage: round(clamp01(mapped)),
    concordance: round(clamp01(supportive)),
    disagreementRate: round(clamp01(discordant)),
    unmappedRate: round(clamp01(1 - mapped)),
    managedTransitionRisk: round(clamp01(managedTransitionRisk)),
    classes: structuredClone(composition),
    referenceDependency: {
      state: 'DEPENDENT_REFERENCE',
      dependency: 'ESA WorldCover 2021 is derived from Sentinel-1 and Sentinel-2 observations.',
      qualification: 'Reference concordance is a machine-verifiable plausibility check, not independent ground truth or expert precision.'
    }
  };
}

export function thresholdStability({ variants = [], minimumEligibleVariants = 3 } = {}) {
  const eligible = variants.filter((item) => item.state === 'MEASURED' && Number.isFinite(item.geometryIou));
  if (eligible.length < minimumEligibleVariants) return { state: 'INSUFFICIENT', eligibleVariants: eligible.length, denominator: variants.length, classification: 'INSUFFICIENT' };
  const survival = eligible.filter((item) => item.candidateSurvived).length / eligible.length;
  const geometryIou = median(eligible.map((item) => item.geometryIou));
  const nodeStability = median(eligible.map((item) => item.nodeStability));
  const edgeStability = median(eligible.map((item) => item.edgeStability));
  const breakpointStability = median(eligible.map((item) => item.breakpointStability));
  const assetPathStability = median(eligible.map((item) => item.assetPathStability));
  const rankStability = median(eligible.map((item) => item.rankStability));
  const classification = survival >= .8 && geometryIou >= .65 && (breakpointStability ?? 0) >= .65 ? 'ROBUST'
    : survival >= .4 && geometryIou >= .35 ? 'SENSITIVE' : 'UNSTABLE';
  return {
    state: 'MEASURED',
    eligibleVariants: eligible.length,
    denominator: variants.length,
    candidateSurvival: round(survival),
    geometryIou: geometryIou === null ? null : round(geometryIou),
    nodeStability: nodeStability === null ? null : round(nodeStability),
    edgeStability: edgeStability === null ? null : round(edgeStability),
    breakpointStability: breakpointStability === null ? null : round(breakpointStability),
    assetPathStability: assetPathStability === null ? null : round(assetPathStability),
    rankStability: rankStability === null ? null : round(rankStability),
    classification
  };
}

const hashUnit = (value) => parseInt(createHash('sha256').update(String(value)).digest('hex').slice(0, 8), 16) / 0xffffffff;

export function counterfactualRobustness({ finding, graph, trials = 101, uncertaintyMeters = 10 } = {}) {
  if (!Number.isInteger(trials) || trials < 1 || trials > 10_000) throw new Error('counterfactual_trials_invalid');
  if (!Number.isFinite(Number(uncertaintyMeters)) || Number(uncertaintyMeters) < 0) throw new Error('counterfactual_uncertainty_invalid');
  if (!graph?.edges?.length || !Number.isFinite(Number(finding?.structuresWithinPolicyRadius)) || Number(finding.structuresWithinPolicyRadius) <= 0) {
    return { state: 'UNSUPPORTED', classification: 'UNSUPPORTED', trials: 0, candidateRetainedFrequency: null, connectivityChangeInterval: null, assetPathChangeInterval: null, alternativeBreakpointCount: null };
  }
  const ranked = [...graph.edges].sort((a, b) => Number(a.distanceMeters) - Number(b.distanceMeters) || a.id.localeCompare(b.id));
  const baseline = ranked[0].id;
  const beforePaths = Number(finding.structuresWithinPolicyRadius);
  const retained = [];
  const reductions = [];
  const pathChanges = [];
  const selected = new Set();
  for (let trial = 0; trial < trials; trial += 1) {
    const varied = ranked.map((edge) => {
      const delta = (hashUnit(`${finding.findingId}:${edge.id}:${trial}`) * 2 - 1) * uncertaintyMeters;
      return { ...edge, variedDistance: Math.max(0, Number(edge.distanceMeters) + delta) };
    }).sort((a, b) => a.variedDistance - b.variedDistance || a.id.localeCompare(b.id));
    const chosen = varied[0];
    selected.add(chosen.id);
    retained.push(chosen.id === baseline ? 1 : 0);
    const structuralVariation = hashUnit(`${finding.findingId}:paths:${trial}`) < .25 ? 1 : 0;
    const effectivePaths = Math.max(1, beforePaths - structuralVariation);
    const reducedPaths = Math.max(1, Math.ceil(effectivePaths / Math.max(2, varied.length)));
    reductions.push(reducedPaths / effectivePaths);
    pathChanges.push(reducedPaths);
  }
  const frequency = retained.reduce((sum, value) => sum + value, 0) / trials;
  const sortedReduction = reductions.sort((a, b) => a - b);
  const sortedPaths = pathChanges.sort((a, b) => a - b);
  const percentile = (values, q) => values[Math.min(values.length - 1, Math.floor((values.length - 1) * q))];
  const classification = frequency >= .9 ? 'HIGH_ROBUSTNESS' : frequency >= .65 ? 'MODERATE' : frequency > 0 ? 'LOW' : 'UNSUPPORTED';
  return {
    state: 'MEASURED',
    classification,
    trials,
    measurementUncertaintyMeters: uncertaintyMeters,
    candidateRetainedFrequency: round(frequency),
    connectivityChangeInterval: { p05: round(percentile(sortedReduction, .05)), p95: round(percentile(sortedReduction, .95)) },
    assetPathChangeInterval: { p05: percentile(sortedPaths, .05), p95: percentile(sortedPaths, .95) },
    alternativeBreakpointCount: Math.max(0, selected.size - 1),
    qualification: 'Bounded deterministic graph perturbation within declared spatial measurement uncertainty; not treatment efficacy.'
  };
}

export function classifyFalseNegative(error = {}) {
  const observations = error.observations ?? [];
  const flags = new Set(error.flags ?? []);
  let cluster;
  if (!observations.length) cluster = 'NO_NATIVE_SIGNAL';
  else if (String(error.decision ?? '').includes('MAPPED_PERSISTENT_HEAT')) cluster = 'STATIC_HEAT_CONTEXT_ERROR';
  else if (String(error.reason ?? '').includes('association')) cluster = 'ASSOCIATION_FAILURE';
  else if (flags.has('low_sensor_confidence') || flags.has('low_frp') || observations.length === 1) cluster = 'LOW_NATIVE_SIGNAL';
  else if (String(error.decision ?? '').startsWith('SUPPRESS_') || String(error.decision ?? '').startsWith('ABSTAIN_')) cluster = 'POLICY_SUPPRESSION';
  else cluster = 'UNKNOWN';
  const maxFrp = Number(error.maxFrpMw ?? 0);
  const recovery = cluster === 'NO_NATIVE_SIGNAL' || cluster === 'LOW_NATIVE_SIGNAL' && maxFrp < 6
    ? 'REQUIRES_NEW_SENSING'
    : cluster === 'STATIC_HEAT_CONTEXT_ERROR' || cluster === 'POLICY_SUPPRESSION' || cluster === 'LOW_NATIVE_SIGNAL'
      ? 'RECOVERABLE_WITH_CURRENT_DATA'
      : cluster === 'REFERENCE_AMBIGUITY' ? 'REFERENCE_UNRESOLVED' : 'REFERENCE_UNRESOLVED';
  return {
    cluster,
    recovery,
    recoverableByPolicy: recovery === 'RECOVERABLE_WITH_CURRENT_DATA',
    requiresNewPhysicalSensing: recovery === 'REQUIRES_NEW_SENSING',
    referenceIssue: recovery === 'REFERENCE_UNRESOLVED',
    evidence: { sourceObservationCount: observations.length, maxFrpMw: Number.isFinite(maxFrp) ? maxFrp : null, flags: [...flags], decision: error.decision ?? null }
  };
}

export function engineeringEvidenceStatus(dimensions = {}) {
  const measured = Object.values(dimensions).filter((item) => item && !['UNMEASURED', 'INSUFFICIENT', 'EXTERNALLY_BLOCKED'].includes(item.state)).length;
  const unstable = dimensions.thresholdStability?.classification === 'UNSTABLE'
    || dimensions.repeatSceneStability?.classification === 'UNSTABLE'
    || dimensions.counterfactualRobustness?.classification === 'LOW';
  const strong = dimensions.sceneQuality?.state === 'PIXEL_VERIFIED'
    && Number(dimensions.landCoverConcordance?.concordance ?? 0) >= .7
    && ['ROBUST'].includes(dimensions.thresholdStability?.classification)
    && ['HIGH_ROBUSTNESS', 'MODERATE'].includes(dimensions.counterfactualRobustness?.classification);
  return {
    status: strong ? 'STRONG' : unstable ? 'WEAK' : measured >= 4 ? 'MIXED' : 'INSUFFICIENT',
    measuredDimensions: measured,
    rulesVersion: 'vigia.prevent-engineering-evidence-rules.v1',
    qualification: 'Independent engineering dimensions; no probability or expert-validation claim.'
  };
}

export function scientificClaimLevel(dimensions = {}) {
  let level = 0;
  const contracts = [
    { level: 0, name: 'SCREENING_CANDIDATE', satisfied: true },
    { level: 1, name: 'PHYSICALLY_REPEATABLE', satisfied: ['ROBUST', 'SENSITIVE'].includes(dimensions.repeatSceneStability?.classification) },
    { level: 2, name: 'REFERENCE_CONCORDANT', satisfied: Number(dimensions.landCoverConcordance?.referenceCoverage ?? 0) >= .8 && Number(dimensions.landCoverConcordance?.concordance ?? 0) >= .6 && dimensions.landCoverConcordance?.referenceDependency?.state === 'DEPENDENT_REFERENCE' },
    { level: 3, name: 'RETROSPECTIVELY_STRUCTURALLY_RELEVANT', satisfied: dimensions.retrospectiveStructuralRelevance?.state === 'MEASURED' },
    { level: 4, name: 'EXTERNALLY_FIELD_VALIDATED', satisfied: dimensions.humanFieldValidation?.state === 'MEASURED' },
    { level: 5, name: 'OUTCOME_EVALUATED', satisfied: dimensions.outcomeEvaluation?.state === 'MEASURED' }
  ];
  for (const contract of contracts.slice(1)) {
    if (!contract.satisfied) break;
    level = contract.level;
  }
  return { level, name: contracts[level].name, contracts, noSkippingEnforced: true };
}

export const validationMedian = median;
