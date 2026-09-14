import { createHash } from 'node:crypto';
import { finalizeConsensusClaims } from './consensus-intervention-zone.mjs';

const STATE = Object.freeze({
  ROBUST_ZONE: 'ROBUST_INTERVENTION_ZONE',
  MIXED_ZONE: 'MIXED_INTERVENTION_ZONE',
  UNSTABLE_GEOMETRY: 'UNSTABLE_INTERVENTION_GEOMETRY',
  NO_DEFENSIBLE_ZONE: 'NO_DEFENSIBLE_INTERVENTION_ZONE'
});
const hash = (value) => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

export function finalizeConsensusAssessments({ findings = [], policy, frozenEvaluation, negativeControls = {} } = {}) {
  const claims = finalizeConsensusClaims({ findings, policy, frozenEvaluation, negativeControls });
  const byFinding = new Map(findings.map((finding) => [String(finding.findingId), finding]));
  const byEvaluation = new Map((frozenEvaluation?.rows ?? []).map((row) => [String(row.findingId), row]));
  return claims.map((zone) => buildConsensusInterventionAssessment({
    finding: byFinding.get(String(zone.finding_id)),
    zone,
    evaluation: byEvaluation.get(String(zone.finding_id)),
    frozenEvaluation,
    policy
  }));
}

export function buildConsensusInterventionAssessment({ finding = {}, zone, evaluation, frozenEvaluation, policy } = {}) {
  if (!zone?.finding_id || !policy?.policyHash) throw new Error('consensus_assessment_inputs_required');
  const state = Number(zone.graph_ensemble?.member_count ?? 0) === 0 ? 'INSUFFICIENT_EVIDENCE' : STATE[zone.claim_state] ?? 'INSUFFICIENT_EVIDENCE';
  const promotion = frozenEvaluation?.aggregate ?? {};
  const interventionReviewEligible = (state === 'ROBUST_INTERVENTION_ZONE' && promotion.robust_zone_promotion_allowed === true)
    || (state === 'MIXED_INTERVENTION_ZONE' && promotion.promotion_decision === 'PROMOTE_CONSENSUS_FOR_MIXED_ZONE_REVIEW');
  const workflow = {
    disposition: interventionReviewEligible ? 'INTERVENTION_REVIEW_ELIGIBLE' : 'MEASUREMENT_REQUIRED',
    interventionReviewEligible,
    geometryRole: interventionReviewEligible ? 'INTERVENTION_REVIEW_SUPPORT' : 'MEASUREMENT_SUPPORT_ONLY',
    authorization: 'NEVER_AUTOMATIC'
  };
  const plan = interventionReviewEligible ? null : measurementPlan({ finding, zone, state, policy });
  const provenance = ensembleProvenance(finding, policy);
  const interventionGeometry = interventionReviewEligible ? zone.geometry : null;
  return {
    ...zone,
    schema: 'vigia.consensus-intervention-assessment.v1',
    state,
    legacy_claim_state: zone.claim_state,
    claim_state: state,
    workflow,
    geometry: interventionGeometry,
    intervention_geometry: interventionGeometry,
    measurement_support_geometry: zone.geometry,
    evidence_debt: plan?.evidenceDebt ?? null,
    measurement_plan: plan?.measurementPlan ?? null,
    claim_level: claimLevel({ finding, state, workflow, zone, evaluation }),
    ensemble_provenance: provenance,
    claim_boundary: 'Measurement support is not an intervention candidate. Only an explicitly review-eligible assessment may expose intervention geometry; no assessment authorizes field action.'
  };
}

function measurementPlan({ finding, zone, state, policy }) {
  const findingId = String(zone.finding_id), id = `prevent-consensus:${findingId}`;
  const prescription = prescriptionFor(zone.failure_type, state);
  const evidenceDebt = {
    schemaVersion: 'vigia.evidence-debt.v1',
    id: `debt:${id}`,
    findingId,
    question: 'Can intervention geometry be stabilized?',
    current_state: 'OPEN',
    system_resolvable: true,
    field_required: false,
    watch_state: prescription.watchState,
    blocking_state: state,
    measurement_plan_id: `plan:${id}`,
    closure_contract: 'Append only a new comparable observation acquired after this assessment, rerun the frozen ensemble and close only if the declared promotion gates pass.'
  };
  const measurementPlan = {
    schemaVersion: 'vigia.consensus-measurement-plan.v1',
    id: `plan:${id}`,
    findingId,
    question: evidenceDebt.question,
    state: 'ARMED',
    watch_state: prescription.watchState,
    provider: prescription.provider,
    next_measurement: prescription.nextMeasurement,
    required_evidence: prescription.requiredEvidence,
    frozen_policy_hash: policy.policyHash,
    rerun_contract: 'Use the frozen policy and a previously unseen comparable scene/reference opportunity; do not recalibrate on the new outcome.',
    append_contract: 'Append raw evidence, ensemble inputs, graph-version hashes, evaluation result and disposition transition; never overwrite the prior assessment.',
    version: 'vigia.consensus-measurement-plan.v1'
  };
  return { evidenceDebt, measurementPlan };
}

function prescriptionFor(failureType, state) {
  if (failureType === 'REFERENCE_SENSITIVE') return { watchState: 'ARMED_INDEPENDENT_REFERENCE', provider: 'INDEPENDENT_LAND_COVER_AUTHORITY', nextMeasurement: 'Acquire a legitimate independent reference observation over the same finding.', requiredEvidence: ['independent reference version and license', 'geometry-bound concordance result', 'reference disagreement attribution'] };
  if (failureType === 'INSUFFICIENT_QUALITY') return { watchState: 'ARMED_NEXT_QUALITY_CLEAR_SENTINEL2', provider: 'COPERNICUS_SENTINEL2', nextMeasurement: 'Acquire the next quality-clear comparable Sentinel-2 scene pair.', requiredEvidence: ['provider observation timestamps', 'pixel-validity mask', 'quality-admitted ensemble rerun'] };
  if (failureType === 'GRAPH_SENSITIVE' || failureType === 'ASSET_CONTEXT_SENSITIVE') return { watchState: 'ARMED_GRAPH_AND_ASSET_REFRESH', provider: 'VIGIA_GRAPH_ENSEMBLE', nextMeasurement: 'Rebuild graph and asset alternatives after the next source refresh.', requiredEvidence: ['input artifact hashes', 'member and graph version hashes', 'connectivity and asset-path stability distributions'] };
  if (state === 'NO_DEFENSIBLE_INTERVENTION_ZONE') return { watchState: 'ARMED_NEXT_COMPARABLE_SENTINEL2', provider: 'COPERNICUS_SENTINEL2', nextMeasurement: 'Acquire a new comparable scene and test whether a spatial support component emerges.', requiredEvidence: ['new provider-time scene pair', 'quality opportunity record', 'frozen-policy no-zone rerun'] };
  return { watchState: 'ARMED_NEXT_COMPARABLE_SENTINEL2', provider: 'COPERNICUS_SENTINEL2', nextMeasurement: 'Acquire the next comparable Sentinel-2 scene and rerun the frozen ensemble.', requiredEvidence: ['new provider observation timestamps', 'scene-independent ensemble members', 'held-out retention and zone-overlap result'] };
}

function claimLevel({ finding, state, workflow, zone, evaluation }) {
  if (Number.isInteger(finding.claimLevel?.level)) return { level: finding.claimLevel.level, label: finding.claimLevel.name, contracts: finding.claimLevel.contracts, noSkippingEnforced: finding.claimLevel.noSkippingEnforced, qualification: workflow.interventionReviewEligible ? 'Claim level and intervention review eligibility are independent gates; field authority remains required.' : 'Claim level does not make measurement support intervention-review eligible.' };
  if (state === 'ROBUST_INTERVENTION_ZONE' && workflow.interventionReviewEligible) return { level: 3, label: 'PROMOTION_ELIGIBLE_CONSENSUS', qualification: 'Still requires expert review and field authority.' };
  if (zone.reference_support?.state === 'MEASURED_REFERENCE_CONCORDANCE' && Number(zone.reference_support?.concordance) >= .6) return { level: 2, label: 'REFERENCE_CONCORDANT_PHYSICAL_EVIDENCE', qualification: 'Reference concordance does not stabilize intervention geometry.' };
  if (evaluation?.state === 'MEASURED' || zone.parameter_support?.state === 'MEASURED') return { level: 1, label: 'REPEATABLE_ENGINEERING_SIGNAL', qualification: 'Repeatability is measurement evidence only.' };
  return { level: 0, label: 'INSUFFICIENT_EVIDENCE', qualification: 'No intervention inference is supported.' };
}

function ensembleProvenance(finding, policy) {
  const members = [...(finding.parameterVariants ?? []), ...(finding.repeatSceneVariants ?? [])];
  return {
    member_ids: members.map((member) => member.id),
    graph_versions: [...new Set(members.map((member) => member.graph?.version).filter(Boolean))],
    graph_hashes: [...new Set(members.map((member) => member.graph ? hash(member.graph) : null).filter(Boolean))],
    input_versions: { detector: finding.detectorVersion ?? null, evaluation_split: finding.evaluationSplit ?? null, finding: finding.findingId ?? null, reference: finding.referenceProvenance?.version ?? finding.referenceProvenance?.source ?? null, policy: policy.policyHash },
    exact_breakpoint_coordinates_exposed: false
  };
}
