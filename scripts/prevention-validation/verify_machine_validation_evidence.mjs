import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifact = JSON.parse(await readFile(path.join(root, 'data/validation/measurement-debt/prevention-machine-validation-v1.json'), 'utf8'));
const handoff = JSON.parse(await readFile(path.join(root, 'data/validation/measurement-debt/measurement-debt-handoff.json'), 'utf8'));
const failures = [];
const check = (condition, code) => { if (!condition) failures.push(code); };
const sha = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const shaBytes = (value) => createHash('sha256').update(value).digest('hex');
const without = (value, key) => Object.fromEntries(Object.entries(value).filter(([entry]) => entry !== key));

check(artifact.schemaVersion === 'vigia.prevention-machine-validation.v1', 'artifact_schema_invalid');
check(handoff.schemaVersion === 'vigia.measurement-debt-handoff.v1', 'handoff_schema_invalid');
check(artifact.evidenceHash === `sha256:${sha(without(artifact, 'evidenceHash'))}`, 'artifact_hash_mismatch');
check(handoff.evidenceHash === `sha256:${sha(without(handoff, 'evidenceHash'))}`, 'handoff_hash_mismatch');
check(!handoff.artifactEvidenceHash || handoff.artifactEvidenceHash === artifact.evidenceHash, 'artifact_handoff_hash_mismatch');
for (const plan of artifact.measurementPlans ?? []) check(plan.planHash === `sha256:${sha(without(plan, 'planHash'))}`, `plan_hash_mismatch:${plan.id}`);
for (const campaign of artifact.campaigns ?? []) check(campaign.campaignHash === `sha256:${sha(without(campaign, 'campaignHash'))}`, `campaign_hash_mismatch:${campaign.id}`);

const denominator = artifact.findings?.length ?? 0;
check(denominator > 0, 'finding_denominator_empty');
check(artifact.aggregate?.denominatorFindings === denominator, 'finding_denominator_mismatch');
for (const metric of ['landCover', 'repeatScene', 'threshold', 'graph', 'breakpoint', 'counterfactual']) check(artifact.aggregate?.[metric]?.measured === denominator, `incomplete_machine_metric:${metric}`);
check(artifact.after.referenceConcordanceMeasured > artifact.before.referenceConcordanceMeasured, 'no_reference_delta');
check(artifact.after.repeatSceneStabilityMeasured > artifact.before.repeatSceneStabilityMeasured, 'no_repeat_scene_delta');
check(artifact.after.falseNegativeRecoveryClassified > artifact.before.falseNegativeRecoveryClassified, 'no_false_negative_delta');
check(artifact.humanFieldGate?.state === 'NOT_PERFORMED', 'human_field_claim_fabricated');
for (const field of ['expertPrecision', 'expertRecall', 'fieldValidation', 'outcomeEvaluation']) check(artifact.humanFieldGate?.[field] === null, `human_metric_must_be_null:${field}`);
check(artifact.negativeControls?.authoritativeNegativeLabels === 0, 'negative_label_contract_changed');
check(artifact.negativeControls?.falseCandidateRate === null && artifact.negativeControls?.specificity === null, 'unsupported_negative_metric_reported');
check(artifact.retrospectiveStructuralRelevance?.denominator === 0 && artifact.matchedTemporalControl?.denominator === 0, 'unsupported_retrospective_denominator');
check((artifact.referenceDatasets?.datasets ?? []).every((dataset) => dataset.provider && dataset.acquisitionMethod && dataset.acquisitionTime && Object.hasOwn(dataset, 'rawArtifactPath') && Object.hasOwn(dataset, 'rawChecksum') && dataset.licenseNotes && dataset.coverage && dataset.projection && dataset.transformation && dataset.spatialJoinRule && dataset.temporalJoinRule && Array.isArray(dataset.knownLimitations) && dataset.dependencyRelationship && dataset.referenceDependency && dataset.qualification), 'reference_registry_contract_incomplete');
check(artifact.referenceProductIntegrity?.state === 'PARTIALLY_MEASURED' && artifact.referenceProductIntegrity?.archivedFamilies === 3 && artifact.referenceProductIntegrity?.denominatorFamilies === 5, 'reference_product_integrity_debt_invalid');
for (const dataset of artifact.referenceDatasets?.datasets ?? []) {
  const artifactPaths = Array.isArray(dataset.rawArtifactPath) ? dataset.rawArtifactPath : dataset.rawArtifactPath ? [dataset.rawArtifactPath] : [];
  const checksums = Array.isArray(dataset.rawChecksum) ? dataset.rawChecksum : dataset.rawChecksum ? [dataset.rawChecksum] : [];
  check(artifactPaths.length === checksums.length, `reference_raw_binding_mismatch:${dataset.id}`);
  for (let index = 0; index < artifactPaths.length; index += 1) {
    const bytes = await readFile(path.join(root, artifactPaths[index])).catch(() => null);
    check(bytes !== null, `reference_raw_artifact_missing:${dataset.id}:${index}`);
    if (bytes) check(shaBytes(bytes) === String(checksums[index]).replace(/^sha256:/, ''), `reference_raw_checksum_mismatch:${dataset.id}:${index}`);
  }
}
for (const finding of artifact.findings ?? []) {
  check(finding.claimLevel?.noSkippingEnforced === true, `claim_skip_guard_missing:${finding.findingId}`);
  const contracts = finding.claimLevel?.contracts ?? [];
  const firstFailed = contracts.findIndex((contract) => !contract.satisfied);
  const maximum = firstFailed < 0 ? contracts.at(-1)?.level : contracts[Math.max(0, firstFailed - 1)]?.level;
  check(finding.claimLevel?.level === maximum, `claim_level_skip:${finding.findingId}`);
}
for (const item of artifact.evidenceDebt ?? []) {
  check(Boolean(item.measurement_method && item.closure_contract && item.owner_class), `debt_contract_incomplete:${item.id}`);
  if (['MEASURED', 'RESOLVED'].includes(item.current_state)) {
    check(item.resolution_evidence !== null, `debt_resolution_evidence_missing:${item.id}`);
    check(item.target_denominator === 0 || item.current_denominator >= item.target_denominator, `debt_target_not_reached:${item.id}`);
  }
}
check(artifact.falseNegativeProgram?.items?.length === artifact.falseNegativeProgram?.cases, 'false_negative_denominator_mismatch');
check(artifact.falseNegativeProgram?.v5Attempted === false && artifact.falseNegativeProgram?.v5Decision === 'NOT_ATTEMPTED', 'unsupported_v5_claim');

if (failures.length) {
  console.error(JSON.stringify({ status: 'FAIL', failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: 'PASS', artifact: path.relative(root, path.join(root, 'data/validation/measurement-debt/prevention-machine-validation-v1.json')), evidenceHash: artifact.evidenceHash, denominatorFindings: denominator, closedMachineDebt: artifact.evidenceDebt.filter((item) => item.current_state === 'MEASURED').length, openDebt: artifact.evidenceDebt.filter((item) => item.current_state !== 'MEASURED').length }, null, 2));
}
