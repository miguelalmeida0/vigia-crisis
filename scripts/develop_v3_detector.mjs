#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assessThermalCandidate,
  assessThermalCandidateV2Candidate,
  assessThermalCandidateV3Candidate,
  THERMAL_CANDIDATE_V3_CANDIDATE_THRESHOLD_VERSION,
  THERMAL_CANDIDATE_V3_CANDIDATE_VERSION
} from '../packages/domain/src/thermal-candidate-policy.mjs';
import { thermalTrend } from '../packages/domain/src/fire-event-tracker.mjs';
import { thermalDetectionMetrics } from '../packages/domain/src/thermal-detection-benchmark.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),directory=path.join(root,'data/validation/detection');
const corpusPath=path.join(directory,'portugal-2024-v3-area-time-corpus.json'),lockPath=path.join(directory,'portugal-2024-v3-policy-lock.json'),outputPath=path.join(directory,'portugal-2024-v3-development.json');
const sha=(value)=>createHash('sha256').update(String(value)).digest('hex');
function evaluate(window,assessor){
  const now=new Date(Date.parse(window.observations.at(-1)?.at??window.timeWindow.end)+300_000);
  const assessment=assessor({observations:window.observations,thermal:thermalTrend(window.observations,{now}),thermalMemory:window.detectorContext.thermalMemory},{now});
  return{...window,decision:assessment.decision,predictedPositive:Boolean(assessment.qualifiesAsFireCandidate),score:assessment.score,flags:assessment.flags,policyVersion:assessment.policyVersion,thresholdVersion:assessment.thresholdVersion};
}
const corpus=JSON.parse(await readFile(corpusPath,'utf8')),lock=JSON.parse(await readFile(lockPath,'utf8'));
if(lock.corpusDatasetHash!==corpus.datasetHash)throw new Error('v3_development_corpus_lock_mismatch');
if(lock.candidate.policyVersion!==THERMAL_CANDIDATE_V3_CANDIDATE_VERSION||lock.candidate.thresholdVersion!==THERMAL_CANDIDATE_V3_CANDIDATE_THRESHOLD_VERSION)throw new Error('v3_development_policy_lock_mismatch');
const splits={};
for(const split of ['DEVELOPMENT','VALIDATION']){
  const windows=corpus.windows.filter((item)=>item.evaluationSplit===split);
  splits[split]={v1:thermalDetectionMetrics(windows.map((item)=>evaluate(item,assessThermalCandidate))),v2:thermalDetectionMetrics(windows.map((item)=>evaluate(item,assessThermalCandidateV2Candidate))),v3:thermalDetectionMetrics(windows.map((item)=>evaluate(item,assessThermalCandidateV3Candidate)))};
}
const artifact={schema:'vigia.detector-v3-development.v1',generatedAt:new Date().toISOString(),corpusDatasetHash:corpus.datasetHash,policyVersion:THERMAL_CANDIDATE_V3_CANDIDATE_VERSION,thresholdVersion:THERMAL_CANDIDATE_V3_CANDIDATE_THRESHOLD_VERSION,confirmatoryOutcomeAccessed:false,trainingMethod:'No fitted probabilistic model. Fixed interpretable thresholds selected against development and checked on validation only.',thresholds:lock.candidate.thresholds,splits,goNoGoBeforeConfirmatory:{pass:splits.DEVELOPMENT.v3.specificity>=.75&&splits.DEVELOPMENT.v3.recall>=.95&&splits.VALIDATION.v3.specificity>=.75&&splits.VALIDATION.v3.recall>=.95,rule:'Development and validation specificity >= .75 with eligible-signal fire recall >= .95.'}};
artifact.evidenceHash=`sha256:${sha(JSON.stringify(artifact))}`;
await writeFile(outputPath,`${JSON.stringify(artifact)}\n`);
console.log(JSON.stringify({outputPath,evidenceHash:artifact.evidenceHash,goNoGoBeforeConfirmatory:artifact.goNoGoBeforeConfirmatory,development:{v2:splits.DEVELOPMENT.v2,v3:splits.DEVELOPMENT.v3},validation:{v2:splits.VALIDATION.v2,v3:splits.VALIDATION.v3}},null,2));
