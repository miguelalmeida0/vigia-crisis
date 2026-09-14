#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyFalseNegative } from '../../packages/domain/src/validation/prevention-machine-validation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const benchmarkPath = path.join(root, 'data/validation/detection/portugal-2023-v4-confirmatory-benchmark.json');
const outputPath = path.join(root, 'data/validation/detection/v4-false-negative-recovery-program-v1.json');
const bytes = await readFile(benchmarkPath);
const benchmark = JSON.parse(bytes);
const rows = (benchmark.errorExplorer ?? []).filter((row) => row.failure === 'FALSE_NEGATIVE').map((row) => ({ ...row, classification: classifyFalseNegative(row) }));
const recoverable = rows.filter((row) => row.classification.recovery === 'RECOVERABLE_WITH_CURRENT_DATA').map((row) => ({
  caseId: row.windowId,
  subject: row.subject,
  coordinate: row.coordinate,
  originalDecision: row.decision,
  rootCause: row.classification.cluster,
  observations: row.observations?.length ?? 0,
  maxFrpMw: row.maxFrpMw ?? null,
  policyHypothesis: row.classification.cluster === 'STATIC_HEAT_CONTEXT_ERROR'
    ? 'Require attributable temporal persistence before suppressing a physical observation solely for mapped heat context.'
    : 'Evaluate confidence-aware corroboration for high-FRP single observations without lowering the low-radiance gate.',
  status: row.classification.cluster === 'STATIC_HEAT_CONTEXT_ERROR' ? 'COHERENT_DEVELOPMENT_CLUSTER_NOT_CONFIRMATORY' : 'INSPECTED_NOT_COHERENT_FOR_CURRENT_DATA_POLICY',
  frozenOutcomeUsedForTuning: false
}));
const sensingLimited = rows.filter((row) => row.classification.recovery === 'REQUIRES_NEW_SENSING').map((row) => {
  const tags = new Set(row.tags ?? []), flags = new Set(row.flags ?? []), observations = row.observations?.length ?? 0;
  const categories = [
    { type: 'SMALL_SUBPIXEL', supported: tags.has('SMALL_LT_1_HA') || tags.has('SMALL_1_TO_10_HA'), evidence: [...tags].find((tag) => tag.startsWith('SMALL_')) ?? null },
    { type: 'TIMING_REVISIT', supported: observations <= 1, evidence: `${observations} qualifying native observation${observations === 1 ? '' : 's'}` },
    { type: 'CLOUD_OBSCURATION', supported: false, evidence: 'No case-level cloud/obscuration attribution exists in the frozen benchmark.' },
    { type: 'LOW_RADIANCE', supported: flags.has('low_frp') || Number(row.maxFrpMw ?? Infinity) < 6, evidence: `max FRP ${row.maxFrpMw ?? 'unknown'} MW` },
    { type: 'GEOMETRY_REFERENCE_UNCERTAINTY', supported: false, evidence: 'The official positive reference is attributable; no geometry error is evidenced for this miss.' }
  ];
  const sensingGapClasses = [
    (categories.find((item) => item.type === 'SMALL_SUBPIXEL')?.supported || categories.find((item) => item.type === 'LOW_RADIANCE')?.supported) ? 'SUBPIXEL_LOW_RADIANCE' : null,
    categories.find((item) => item.type === 'TIMING_REVISIT')?.supported ? 'TEMPORAL_REVISIT' : null,
    categories.find((item) => item.type === 'CLOUD_OBSCURATION')?.supported ? 'CLOUD_QUALITY' : null,
    null,
    categories.find((item) => item.type === 'GEOMETRY_REFERENCE_UNCERTAINTY')?.supported ? 'REFERENCE_UNCERTAINTY' : null
  ].filter(Boolean);
  return { caseId: row.windowId, subject: row.subject, coordinate: row.coordinate, sensingGapClasses, categories, strategy: ['Increase observation opportunity/revisit', 'Add independent physical sensing with a different failure mode', 'Do not lower V4 discrimination on this frozen cohort'] };
});
const sensingCategoryCounts = Object.fromEntries(['SMALL_SUBPIXEL', 'TIMING_REVISIT', 'CLOUD_OBSCURATION', 'LOW_RADIANCE', 'GEOMETRY_REFERENCE_UNCERTAINTY'].map((type) => [type, { supported: sensingLimited.filter((row) => row.categories.find((item) => item.type === type)?.supported).length, denominator: sensingLimited.length }]));
const canonicalSensingGapClasses = Object.fromEntries(['SUBPIXEL_LOW_RADIANCE','TEMPORAL_REVISIT','CLOUD_QUALITY','SOURCE_GEOMETRY','REFERENCE_UNCERTAINTY'].map((type) => [type, { supported: sensingLimited.filter((row) => row.sensingGapClasses.includes(type)).length, denominator: sensingLimited.length, cases: sensingLimited.filter((row) => row.sensingGapClasses.includes(type)).map((row) => row.caseId) }]));
const coherentStaticContext = recoverable.filter((row) => row.rootCause === 'STATIC_HEAT_CONTEXT_ERROR');
const rejectedLowSignal = recoverable.filter((row) => row.rootCause !== 'STATIC_HEAT_CONTEXT_ERROR');
const core = {
  schemaVersion: 'vigia.false-negative-recovery-program.v1',
  generatedAt: new Date().toISOString(),
  sourceBenchmark: path.relative(root, benchmarkPath),
  sourceBenchmarkChecksumSha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  frozenV4Performance: {
    precision: benchmark.v4?.precision ?? null,
    recall: benchmark.v4?.recall ?? null,
    specificity: benchmark.v4?.specificity ?? null,
    falsePositiveRate: benchmark.v4?.falsePositiveRate ?? null,
    mcc: benchmark.v4?.matthewsCorrelationCoefficient ?? null,
    balancedAccuracy: benchmark.v4?.balancedAccuracy ?? null
  },
  falseNegativeDenominator: rows.length,
  recoverableWithCurrentData: { denominator: recoverable.length, cases: recoverable },
  recoverableClusterEvaluation: {
    inspected: recoverable.length,
    coherentDevelopmentClusters: [{ cluster: 'STATIC_HEAT_CONTEXT_ERROR', cases: coherentStaticContext.length, caseIds: coherentStaticContext.map((row) => row.caseId), disposition: 'FREEZE_POLICY_CANDIDATE_AWAIT_FRESH_COHORT', qualification: 'The cluster is coherent enough to predeclare a candidate persistence rule, but the frozen outcomes cannot validate it.' }],
    rejectedCurrentDataHypotheses: [{ cluster: 'LOW_NATIVE_SIGNAL', cases: rejectedLowSignal.length, caseIds: rejectedLowSignal.map((row) => row.caseId), disposition: 'NO_CURRENT_DATA_POLICY_CHANGE', qualification: 'Single low-signal observations do not support a threshold or corroboration-policy change without a fresh negative denominator.' }],
    promotedToV5: 0
  },
  sensingLimited: { denominator: sensingLimited.length, sensingGapClasses: canonicalSensingGapClasses, legacyCategoryCounts: sensingCategoryCounts, categoryCounts: sensingCategoryCounts, cases: sensingLimited },
  v5: {
    attempted: false,
    decision: 'NOT_SCIENTIFICALLY_JUSTIFIED',
    reason: 'The seven mechanisms were discovered from the frozen 2023 V4 confirmatory outcomes. No fresh, untouched positive/negative confirmatory cohort exists for an honest V5 promotion test.',
    preservedVersion: benchmark.v4?.policyVersion ?? 'vigia-thermal-candidate-v4',
    prohibitedAction: 'Do not tune thresholds or suppression policy on the V4 confirmatory errors and report the same cohort as validation.',
    nextGate: 'Predeclare a development policy, acquire a new-year authoritative fire/non-fire cohort with observation-opportunity eligibility, then measure precision, recall, specificity, FPR, MCC and balanced accuracy.'
  },
  claimBoundary: 'Failure analysis identifies evidence needs; it does not prove that a software change would recover a fire without increasing false positives.'
};
const artifact = { ...core, evidenceHash: `sha256:${createHash('sha256').update(JSON.stringify(core)).digest('hex')}` };
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(root, outputPath), falseNegatives: rows.length, recoverable: recoverable.length, sensingLimited: sensingLimited.length, v5: artifact.v5.decision, evidenceHash: artifact.evidenceHash }, null, 2));
