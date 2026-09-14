import { createHash } from 'node:crypto';
import { preventionPointDistanceMeters } from './prevention-ensemble-member.mjs';
import { axisMembers,buildSpatialSupport,categoricalConsistency,cellsAsMultiPolygon,clamp,distribution,eligibleMember,ensembleSummary,finite,firstCoordinate,geometryCellKeys,jaccard,mean,median,memberCells,memberPositionDispersion,percentile,pointToCellsDistance,referenceSupport,relativeSpread,round,spatialFrame,supportForAxis,supportState } from './consensus-zone-helpers.mjs';
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function calibrateConsensusPromotionPolicy({ findings = [], frozenAt = new Date().toISOString(), negativeControls = {} } = {}) {
  const development = findings.map((finding) => developmentSummary(finding)).filter((item) => item.memberCount >= 3);
  if (!development.length) throw new Error('consensus_development_corpus_insufficient');
  const supportValues = development.map((item) => item.densestSupportFraction);
  const dispersionValues = development.map((item) => item.positionDispersionP90Meters);
  const connectivityValues = development.map((item) => item.connectivityRelativeSpread).filter(finite);
  const assetValues = development.map((item) => item.assetPathConsistency).filter(finite);
  const qualityValues = development.map((item) => item.validPixelFraction).filter(finite);
  const supportQ25 = percentile(supportValues, .25);
  const dispersionQ25 = percentile(dispersionValues, .25), dispersionQ75 = percentile(dispersionValues, .75);
  const connectivityQ25 = percentile(connectivityValues, .25), connectivityQ75 = percentile(connectivityValues, .75);
  const policyCore = {
    schemaVersion: 'vigia.consensus-promotion-policy.v1',
    frozenAt,
    calibrationSplit: 'DEVELOPMENT_REVIEW_PARAMETER_REALIZATIONS_ONLY',
    finalEvaluationSplit: 'UNTOUCHED_REPEAT_SCENE_REALIZATIONS',
    leakageGuard: 'No repeatSceneVariants or final stability outcome enters calibration.',
    developmentDenominatorFindings: development.length,
    developmentDenominatorMembers: development.reduce((sum, item) => sum + item.memberCount, 0),
    spatialMethod: {
      method: 'MEMBER_NORMALIZED_10M_GRID_SUPPORT',
      cellSizeMeters: 10,
      georegistrationUncertaintyMeters: 10,
      graphAlternativeToleranceMeters: 10,
      positionSupportRadiusMeters: 30,
      exactPointOutputPermitted: false
    },
    thresholds: {
      minimumSupportFraction: round(clamp(supportQ25, .5, .85), 2),
      maximumPositionUncertaintyMeters: round(clamp(dispersionQ75 + 1.5 * Math.max(0, dispersionQ75 - dispersionQ25), 20, 150), 1),
      maximumConnectivityRelativeSpread: round(clamp(connectivityQ75 + 1.5 * Math.max(0, connectivityQ75 - connectivityQ25), .05, .5), 2),
      minimumAssetPathConsistency: round(clamp(percentile(assetValues, .25), .5, 1), 2),
      minimumValidPixelFraction: round(clamp(percentile(qualityValues, .25), .6, .95), 2),
      minimumHeldoutSceneRetention: .5,
      minimumHeldoutZoneOverlap: .25,
      minimumDevelopmentMembers: 3,
      maximumFalseRobustZoneRate: .05
    },
    robustZoneGates: {
      authoritativeNegativeControlRateRequired: true,
      authoritativeNegativeControlRateAvailable: finite(negativeControls.falseCandidateRate),
      independentReferenceVariationRequired: true,
      fieldAuthorityRequiredForIntervention: true
    },
    calibrationStatistics: {
      densestSupportFraction: distribution(supportValues),
      positionDispersionP90Meters: distribution(dispersionValues),
      connectivityRelativeSpread: distribution(connectivityValues),
      assetPathConsistency: distribution(assetValues),
      validPixelFraction: distribution(qualityValues)
    },
    rationale: {
      support: 'Lower quartile of development-member spatial concentration, bounded to majority support.',
      position: 'Development upper Tukey fence, bounded below by two 10 m pixels and above by the declared 150 m asset policy radius.',
      connectivity: 'Development upper Tukey fence for relative ensemble spread; no held-out scene outcomes used.',
      assets: 'Development lower quartile of identical before/after asset-path outcomes.',
      quality: 'Development lower quartile, never below the detector 0.60 valid-pixel admission gate.',
      heldout: 'Preregistered majority retention and 0.25 median zone overlap; final repeat scenes remain untouched until after this policy is persisted.'
    }
  };
  return { ...policyCore, policyHash: `sha256:${hash(policyCore)}` };
}

export function buildConsensusInterventionZone({ finding, policy, evidenceAxis = 'PARAMETER' } = {}) {
  assertFrozenPolicy(policy);
  const members = axisMembers(finding, evidenceAxis).filter(eligibleMember);
  const referenceCoordinate = finding.coordinate ?? firstCoordinate(finding.parameterVariants?.[0]?.candidateGeometry);
  const spatial = buildSpatialSupport({ members, referenceCoordinate, policy });
  const counterfactual = buildConsensusCounterfactual(members);
  const dispersion = memberPositionDispersion(members);
  const connectivitySpread = relativeSpread(members.map((member) => member.intervention?.modeledConnectivityReduction));
  const assetConsistency = categoricalConsistency(members.map((member) => `${member.intervention?.assetConnectedPaths?.before}->${member.intervention?.assetConnectedPaths?.after}`));
  const quality = distribution(members.map((member) => member.sourceQuality?.validPixelFraction));
  const thresholds = policy.thresholds;
  const primary = spatial.components[0] ?? null;
  const supportFraction = primary?.memberSupportFraction ?? 0;
  let claimState = 'MIXED_ZONE';
  if (members.length < thresholds.minimumDevelopmentMembers || !primary) claimState = 'NO_DEFENSIBLE_ZONE';
  else if (supportFraction < thresholds.minimumSupportFraction || (dispersion.p90 ?? Infinity) > thresholds.maximumPositionUncertaintyMeters || (connectivitySpread ?? Infinity) > thresholds.maximumConnectivityRelativeSpread || (assetConsistency ?? 0) < thresholds.minimumAssetPathConsistency || (quality.median ?? 0) < thresholds.minimumValidPixelFraction) claimState = 'UNSTABLE_GEOMETRY';
  return {
    schema: 'vigia.consensus-intervention-zone.v1',
    finding_id: finding.findingId,
    evidence_axis: evidenceAxis,
    geometry: primary ? cellsAsMultiPolygon(primary.cells, spatial.frame) : null,
    support_fraction: round(supportFraction),
    position_uncertainty: { p50_meters: round(dispersion.p50, 1), p90_meters: round(dispersion.p90, 1), maximum_meters: round(dispersion.max, 1), declared_georegistration_meters: policy.spatialMethod.georegistrationUncertaintyMeters },
    median_connectivity_change: counterfactual.modeled_connectivity_change.median,
    connectivity_change_interval: counterfactual.modeled_connectivity_change.interval,
    asset_path_change_interval: counterfactual.asset_connected_path_change.interval,
    alternative_zone_count: Math.max(0, spatial.components.length - 1),
    scene_support: supportForAxis(finding, 'SCENE', primary, spatial.frame, policy),
    parameter_support: supportForAxis(finding, 'PARAMETER', primary, spatial.frame, policy),
    geometry_support: { state: primary ? 'MEASURED' : 'INSUFFICIENT', method: policy.spatialMethod.method, member_normalized: true, cell_size_meters: policy.spatialMethod.cellSizeMeters, georegistration_uncertainty_meters: policy.spatialMethod.georegistrationUncertaintyMeters },
    reference_support: referenceSupport(finding),
    quality: { state: quality.count ? 'MEASURED' : 'UNMEASURED', valid_pixel_fraction: quality },
    claim_state: claimState,
    graph_ensemble: ensembleSummary(members),
    counterfactual,
    exact_breakpoint_emitted: false,
    claim_boundary: 'Consensus spatial support and modeled connectivity only; not fire-risk reduction, treatment efficacy, or authorization.'
  };
}

export function evaluateFrozenConsensus({ findings = [], policy, negativeControls = {} } = {}) {
  assertFrozenPolicy(policy);
  const rows = findings.map((finding) => evaluateFinding(finding, policy));
  const eligible = rows.filter((row) => row.state === 'MEASURED');
  const baselineRetention = mean(eligible.map((row) => row.baseline.spatial_retention));
  const consensusRetention = mean(eligible.map((row) => row.consensus.spatial_retention));
  const baselinePosition = median(eligible.map((row) => row.baseline.position_error_meters?.median));
  const consensusPosition = median(eligible.map((row) => row.consensus.position_error_meters?.median));
  const overlap = median(eligible.map((row) => row.consensus.zone_overlap));
  const abstentions = rows.reduce((sum, row) => sum + row.abstainedSceneMembers, 0), denominator = rows.reduce((sum, row) => sum + row.sceneMemberDenominator, 0);
  const falseRobustZoneRate = finite(negativeControls.falseCandidateRate) ? Number(negativeControls.falseCandidateRate) : null;
  const improvement = finite(baselineRetention) && finite(consensusRetention) ? consensusRetention - baselineRetention : null;
  const material = finite(improvement) && improvement >= .1 && finite(baselinePosition) && finite(consensusPosition) && consensusPosition < baselinePosition && (overlap ?? 0) >= policy.thresholds.minimumHeldoutZoneOverlap;
  const aggregate = {
    denominator_findings: findings.length,
    eligible_findings: eligible.length,
    baseline: { spatial_retention: round(baselineRetention), position_error_meters: { median: round(baselinePosition, 1) } },
    consensus: { spatial_retention: round(consensusRetention), zone_overlap: round(overlap), position_error_meters: { median: round(consensusPosition, 1) }, connectivity_change_stability: round(median(eligible.map((row) => row.consensus.connectivity_change_stability))), asset_path_stability: round(median(eligible.map((row) => row.consensus.asset_path_stability))), rank_stability: round(median(eligible.map((row) => row.consensus.rank_stability))) },
    spatial_retention_delta: round(improvement),
    false_robust_zone_rate: falseRobustZoneRate,
    false_robust_zone_rate_state: falseRobustZoneRate === null ? 'UNMEASURED_NO_AUTHORITATIVE_SPATIAL_NEGATIVES' : 'MEASURED',
    abstention_no_zone_rate: denominator ? round(abstentions / denominator) : null,
    material_stability_improvement: material,
    promotion_decision: material ? 'PROMOTE_CONSENSUS_FOR_MIXED_ZONE_REVIEW' : 'DO_NOT_PROMOTE_AS_ROBUST',
    robust_zone_promotion_allowed: material && falseRobustZoneRate !== null && falseRobustZoneRate <= policy.thresholds.maximumFalseRobustZoneRate && policy.robustZoneGates.independentReferenceVariationRequired === false
  };
  return { schemaVersion: 'vigia.frozen-consensus-evaluation.v1', policyHash: policy.policyHash, split: policy.finalEvaluationSplit, rows, aggregate };
}

export function finalizeConsensusClaims({ findings = [], policy, frozenEvaluation, negativeControls = {} } = {}) {
  const byFinding = new Map(frozenEvaluation.rows.map((row) => [row.findingId, row]));
  return findings.map((finding) => {
    const zone = buildConsensusInterventionZone({ finding, policy });
    const evaluation = byFinding.get(finding.findingId);
    const sceneRetention = evaluation?.consensus?.spatial_retention;
    if (zone.claim_state === 'MIXED_ZONE' && (!finite(sceneRetention) || sceneRetention < policy.thresholds.minimumHeldoutSceneRetention)) zone.claim_state = 'UNSTABLE_GEOMETRY';
    const robustGatesSatisfied = frozenEvaluation.aggregate.material_stability_improvement
      && finite(negativeControls.falseCandidateRate)
      && Number(negativeControls.falseCandidateRate) <= policy.thresholds.maximumFalseRobustZoneRate
      && zone.reference_support.variation_state === 'MEASURED_INDEPENDENT_VARIATION';
    if (zone.claim_state === 'MIXED_ZONE' && robustGatesSatisfied) zone.claim_state = 'ROBUST_ZONE';
    zone.scene_support = evaluation?.scene_support ?? zone.scene_support;
    zone.failure_type = classifyPreventionFailure({ finding, zone, evaluation, policy });
    return zone;
  });
}

export function classifyPreventionFailure({ finding, zone, evaluation, policy } = {}) {
  if ((zone.quality?.valid_pixel_fraction?.median ?? 0) < policy.thresholds.minimumValidPixelFraction) return 'INSUFFICIENT_QUALITY';
  if ((finding.dimensions?.landCoverConcordance?.concordance ?? 0) < .6 || Number(finding.dimensions?.landCoverConcordance?.managedTransitionRisk ?? 0) >= .1) return 'REFERENCE_SENSITIVE';
  if (finite(evaluation?.consensus?.spatial_retention) && evaluation.consensus.spatial_retention < policy.thresholds.minimumHeldoutSceneRetention) return 'SCENE_SENSITIVE';
  if ((zone.counterfactual?.modeled_connectivity_change?.relative_spread ?? Infinity) > policy.thresholds.maximumConnectivityRelativeSpread) return 'GRAPH_SENSITIVE';
  if ((zone.counterfactual?.asset_connected_path_change?.consistency ?? 0) < policy.thresholds.minimumAssetPathConsistency) return 'ASSET_CONTEXT_SENSITIVE';
  if (zone.claim_state === 'ROBUST_ZONE') return 'ROBUST_PHYSICAL_CHANGE / ROBUST_ZONE';
  return 'ROBUST_PHYSICAL_CHANGE / UNSTABLE_INTERVENTION';
}

export function buildConsensusCounterfactual(members = []) {
  const eligible = members.filter(eligibleMember);
  const beforeArea = eligible.map((member) => member.intervention.connectedFuelAreaHa.before);
  const afterArea = eligible.map((member) => member.intervention.connectedFuelAreaHa.after);
  const beforePaths = eligible.map((member) => member.intervention.assetConnectedPaths.before);
  const afterPaths = eligible.map((member) => member.intervention.assetConnectedPaths.after);
  const connectivity = eligible.map((member) => member.intervention.modeledConnectivityReduction);
  const pathChange = eligible.map((member) => Number(member.intervention.assetConnectedPaths.before) - Number(member.intervention.assetConnectedPaths.after));
  return {
    state: eligible.length ? 'MEASURED_ENSEMBLE' : 'INSUFFICIENT',
    member_count: eligible.length,
    connected_fuel_area_before_ha: distribution(beforeArea),
    connected_fuel_area_after_ha: distribution(afterArea),
    asset_connected_paths_before: distribution(beforePaths),
    asset_connected_paths_after: distribution(afterPaths),
    modeled_connectivity_change: { ...distribution(connectivity), relative_spread: round(relativeSpread(connectivity)), worst_defensible_case: round(Math.min(...connectivity)), best_defensible_case: round(Math.max(...connectivity)) },
    asset_connected_path_change: { ...distribution(pathChange), consistency: round(categoricalConsistency(eligible.map((member) => `${member.intervention.assetConnectedPaths.before}->${member.intervention.assetConnectedPaths.after}`))), worst_defensible_case: round(Math.min(...pathChange)), best_defensible_case: round(Math.max(...pathChange)) },
    qualification: 'Distribution across defensible development ensemble members. Connectivity quantities are not wildfire risk or treatment efficacy.'
  };
}
function evaluateFinding(finding, policy) {
  const developmentZone = buildConsensusInterventionZone({ finding, policy });
  const sceneMembers = axisMembers(finding, 'SCENE');
  const measuredScenes = sceneMembers.filter(eligibleMember), abstained = sceneMembers.length - measuredScenes.length;
  if (!measuredScenes.length || !developmentZone.geometry) return { findingId: finding.findingId, state: 'INSUFFICIENT', sceneMemberDenominator: sceneMembers.length, abstainedSceneMembers: abstained, baseline: {}, consensus: {}, scene_support: supportState(measuredScenes.length, sceneMembers.length, 0) };
  const baselineMember = axisMembers(finding, 'PARAMETER').find((member) => member.id === 'BASELINE' && eligibleMember(member)) ?? axisMembers(finding, 'PARAMETER').find(eligibleMember);
  const baselinePoint = baselineMember?.intervention?.geometry?.coordinates?.[0];
  const frame = spatialFrame(finding.coordinate ?? firstCoordinate(finding.parameterVariants?.[0]?.candidateGeometry), policy.spatialMethod.cellSizeMeters);
  const developmentCells = geometryCellKeys(developmentZone.geometry, frame);
  const baselineDistances = measuredScenes.map((member) => preventionPointDistanceMeters(baselinePoint, member.intervention.geometry.coordinates[0]));
  const retainedByZone = measuredScenes.map((member) => memberCells(member, frame, policy).some((key) => developmentCells.has(key)));
  const positionToZone = measuredScenes.map((member) => pointToCellsDistance(member.intervention.geometry.coordinates[0], developmentCells, frame));
  const heldoutSpatial = buildSpatialSupport({ members: measuredScenes, referenceCoordinate: finding.coordinate, policy });
  const heldoutCells = new Set(heldoutSpatial.components[0]?.cells ?? []);
  const connectivityMedian = developmentZone.counterfactual.modeled_connectivity_change.median;
  const connectivityStability = mean(measuredScenes.map((member) => 1 - Math.min(1, Math.abs(Number(member.intervention.modeledConnectivityReduction) - connectivityMedian) / Math.max(.0001, Math.abs(connectivityMedian)))));
  return {
    findingId: finding.findingId,
    state: 'MEASURED',
    sceneMemberDenominator: sceneMembers.length,
    abstainedSceneMembers: abstained,
    baseline: { spatial_retention: round(mean(baselineDistances.map((distance) => distance <= policy.spatialMethod.georegistrationUncertaintyMeters ? 1 : 0))), position_error_meters: distribution(baselineDistances) },
    consensus: { spatial_retention: round(mean(retainedByZone.map(Number))), zone_overlap: round(jaccard(developmentCells, heldoutCells)), position_error_meters: distribution(positionToZone), connectivity_change_stability: round(connectivityStability), asset_path_stability: round(median(measuredScenes.map((member) => member.assetPathStability))), rank_stability: round(median(measuredScenes.map((member) => member.rankStability))) },
    scene_support: supportState(measuredScenes.length, sceneMembers.length, retainedByZone.filter(Boolean).length)
  };
}
function developmentSummary(finding) {
  const members = axisMembers(finding, 'PARAMETER').filter(eligibleMember);
  const points = members.map((member) => member.intervention.geometry.coordinates[0]);
  const supportRadius = 30;
  const density = points.map((point) => points.filter((other) => preventionPointDistanceMeters(point, other) <= supportRadius).length / Math.max(1, points.length));
  const connectivity = members.map((member) => member.intervention.modeledConnectivityReduction);
  return { findingId: finding.findingId, memberCount: members.length, densestSupportFraction: Math.max(0, ...density), positionDispersionP90Meters: memberPositionDispersion(members).p90 ?? Infinity, connectivityRelativeSpread: relativeSpread(connectivity), assetPathConsistency: categoricalConsistency(members.map((member) => `${member.intervention.assetConnectedPaths.before}->${member.intervention.assetConnectedPaths.after}`)), validPixelFraction: median(members.map((member) => member.sourceQuality?.validPixelFraction)) };
}
function assertFrozenPolicy(policy) { if (!policy?.policyHash || !policy?.frozenAt || policy.calibrationSplit !== 'DEVELOPMENT_REVIEW_PARAMETER_REALIZATIONS_ONLY') throw new Error('frozen_consensus_policy_required'); }
