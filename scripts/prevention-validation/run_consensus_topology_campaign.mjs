#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  calibrateConsensusPromotionPolicy,
  evaluateFrozenConsensus
} from '../../packages/domain/src/validation/consensus-intervention-zone.mjs';
import { finalizeConsensusAssessments } from '../../packages/domain/src/validation/consensus-intervention-assessment.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const files = {
  source: path.join(root, 'data/validation/measurement-debt/prevention-machine-validation-v1.json'),
  policy: path.join(root, 'data/validation/prevention/consensus-promotion-policy-v1.json'),
  output: path.join(root, 'data/validation/prevention/consensus-topology-evaluation-v1.json')
};
const generatedAt = new Date().toISOString();
const sha = (value) => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const sourceBytes = await readFile(files.source);
const source = JSON.parse(sourceBytes);
if (source.schemaVersion !== 'vigia.prevention-machine-validation.v1') throw new Error('prevention_machine_validation_source_invalid');
await mkdir(path.dirname(files.output), { recursive: true });

// Deliberately project away the final repeat-scene cohort before calibration.
const developmentFindings = source.findings.map(({ repeatSceneVariants: _heldOut, ...finding }) => ({ ...finding, repeatSceneVariants: [] }));
const sourceChecksum=`sha256:${sha(sourceBytes)}`;
let policyArtifact=await reusableFrozenPolicy();
if(!policyArtifact){
  const calibratedPolicy = calibrateConsensusPromotionPolicy({ findings: developmentFindings, frozenAt: generatedAt, negativeControls: source.negativeControls });
  policyArtifact={...calibratedPolicy,sourceArtifact:relative(files.source),sourceArtifactEvidenceHash:source.evidenceHash,sourceArtifactChecksumSha256:sourceChecksum,freezeSequence:'POLICY_PERSISTED_BEFORE_REPEAT_SCENE_EVALUATION'};
  await writeFile(files.policy, `${JSON.stringify(policyArtifact, null, 2)}\n`);
}

// Re-read the frozen policy from disk before the untouched scene realization is evaluated.
const frozenPolicy = JSON.parse(await readFile(files.policy, 'utf8'));
if (frozenPolicy.policyHash !== policyArtifact.policyHash) throw new Error('consensus_policy_freeze_integrity_failure');
const evaluationStartedAt = new Date().toISOString();
const frozenEvaluation = evaluateFrozenConsensus({ findings: source.findings, policy: frozenPolicy, negativeControls: source.negativeControls });
const assessments = finalizeConsensusAssessments({ findings: source.findings, policy: frozenPolicy, frozenEvaluation, negativeControls: source.negativeControls });
const claimStates = countBy(assessments, 'claim_state');
const legacyClaimStates = countBy(assessments, 'legacy_claim_state');
const failureTypes = countBy(assessments, 'failure_type');
const workflowDispositions = countNested(assessments, (assessment) => assessment.workflow?.disposition);
const consensusTopology = {
  findings: assessments.length,
  graphEnsembleMembers: assessments.reduce((sum, assessment) => sum + assessment.graph_ensemble.member_count, 0),
  graphRealizations: assessments.reduce((sum, assessment) => sum + assessment.graph_ensemble.graph_realizations, 0),
  exactBreakpointsEmitted: assessments.filter((assessment) => assessment.exact_breakpoint_emitted).length,
  uncertaintyAxes: {
    comparableSentinel2Scenes: 'FROZEN_HELDOUT_EVALUATED',
    boundedDetectorParameters: 'DEVELOPMENT_MEASURED',
    geometryGeoregistration: 'DECLARED_10M_GRID_BUFFER',
    assetBuffer: 'MEASURED_135M_150M_165M',
    graphConnectivity: 'EDGES_WITHIN_DECLARED_10M_MEASUREMENT_TOLERANCE',
    referenceVariation: 'UNMEASURED_NO_LEGITIMATE_INDEPENDENT_VARIANT'
  },
  claimStates,
  legacyClaimStates,
  workflowDispositions,
  interventionReviewCandidates: assessments.filter((assessment) => assessment.workflow.interventionReviewEligible).length,
  measurementRequired: assessments.filter((assessment) => assessment.workflow.disposition === 'MEASUREMENT_REQUIRED').length,
  failureTypes
};
const core = {
  schemaVersion: 'vigia.consensus-topology-evaluation.v2',
  generatedAt: new Date().toISOString(),
  evaluationStartedAt,
  releaseVerdict: 'PASS_TRUTHFULNESS_CORRECTION_MEASUREMENT_REQUIRED',
  criticalDelta: {
    before: { topology: 'ONE_SCENE_ONE_GRAPH_ONE_EXACT_BREAKPOINT', exactBreakpointPresentation: true, interventionReviewCandidates: source.findings.length, perFindingMeasurementPlans: 0, counterfactualMedianExactBreakpointRetention: source.aggregate?.counterfactual?.medianRetention ?? null, lowRobustnessFindings: source.aggregate?.counterfactual?.classifications?.LOW ?? null },
    after: { topology: 'DEFENSIBLE_ENSEMBLE_TO_SPATIAL_CONSENSUS_ASSESSMENT', exactBreakpointPresentation: false, interventionReviewCandidates: consensusTopology.interventionReviewCandidates, perFindingMeasurementPlans: assessments.filter((assessment) => assessment.measurement_plan).length, frozenBaselineSpatialRetention: frozenEvaluation.aggregate.baseline.spatial_retention, frozenConsensusSpatialRetention: frozenEvaluation.aggregate.consensus.spatial_retention, frozenSpatialRetentionDelta: frozenEvaluation.aggregate.spatial_retention_delta, materialStabilityImprovement: frozenEvaluation.aggregate.material_stability_improvement, claimStates, workflowDispositions }
  },
  promotionContract: frozenPolicy,
  consensusTopology,
  frozenEvaluation,
  assessments,
  zones: assessments,
  counterfactualDistributions: assessments.map((assessment) => ({ findingId: assessment.finding_id, claimState: assessment.claim_state, distribution: assessment.counterfactual })),
  historicalStructuralRelevance: source.retrospectiveStructuralRelevance,
  matchedTemporalControls: source.matchedTemporalControl,
  negativeControls: {
    ...source.negativeControls,
    falseRobustZoneRate: frozenEvaluation.aggregate.false_robust_zone_rate,
    falseRobustZoneRateState: frozenEvaluation.aggregate.false_robust_zone_rate_state,
    robustClaimQualification: 'ROBUST_INTERVENTION_ZONE is prohibited until authoritative spatial negatives and independent reference variation exist.'
  },
  exactPointSuppression: {
    state: assessments.every((assessment) => assessment.exact_breakpoint_emitted === false) ? 'ENFORCED' : 'FAILED',
    exactPointsEmitted: assessments.filter((assessment) => assessment.exact_breakpoint_emitted).length,
    qualification: 'Underlying graph-member lines remain provenance evidence. Non-promoted assessments expose measurement support only and no intervention geometry.'
  },
  provenance: {
    sourceArtifact: relative(files.source),
    sourceArtifactEvidenceHash: source.evidenceHash,
    sourceArtifactChecksumSha256: `sha256:${sha(sourceBytes)}`,
    frozenPolicy: relative(files.policy),
    frozenPolicyHash: frozenPolicy.policyHash,
    splitIntegrity: 'Development parameter realizations calibrated the policy; repeat-scene realizations were evaluated only after the policy was persisted.'
  },
  scientificClaimBoundary: 'Consensus topology is engineering measurement support. A MEASUREMENT_REQUIRED assessment is not an intervention candidate and does not establish fire-risk reduction, treatment efficacy, causal prevention, or field authorization.'
};
const artifact = { ...core, evidenceHash: `sha256:${sha(core)}` };
await writeFile(files.output, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({ output: relative(files.output), policy: relative(files.policy), verdict: artifact.releaseVerdict, policyHash: frozenPolicy.policyHash, evaluation: frozenEvaluation.aggregate, claimStates, workflowDispositions, failureTypes, evidenceHash: artifact.evidenceHash }, null, 2));

function relative(filePath) { return path.relative(root, filePath); }
function countBy(rows, key) { return Object.fromEntries([...new Set(rows.map((row) => row[key]))].filter(Boolean).sort().map((value) => [value, rows.filter((row) => row[key] === value).length])); }
function countNested(rows, getter) { const values=rows.map(getter); return Object.fromEntries([...new Set(values)].filter(Boolean).sort().map((value)=>[value,values.filter((item)=>item===value).length])); }
async function reusableFrozenPolicy(){try{const existing=JSON.parse(await readFile(files.policy,'utf8'));return existing.schemaVersion==='vigia.consensus-promotion-policy.v1'&&existing.sourceArtifactEvidenceHash===source.evidenceHash&&existing.sourceArtifactChecksumSha256===sourceChecksum&&existing.freezeSequence==='POLICY_PERSISTED_BEFORE_REPEAT_SCENE_EVALUATION'?existing:null;}catch{return null;}}
