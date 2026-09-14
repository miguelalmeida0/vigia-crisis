#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
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
import { thermalDetectionErrors, thermalDetectionMetrics } from '../packages/domain/src/thermal-detection-benchmark.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),directory=path.join(root,'data/validation/detection');
const corpusPath=path.join(directory,'portugal-2024-v3-area-time-corpus.json'),lockPath=path.join(directory,'portugal-2024-v3-policy-lock.json'),developmentPath=path.join(directory,'portugal-2024-v3-development.json'),outputPath=path.join(directory,'portugal-2024-v3-confirmatory-benchmark.json');
const sha=(value)=>createHash('sha256').update(String(value)).digest('hex');
function evaluate(window,assessor){
  const now=new Date(Date.parse(window.observations.at(-1)?.at??window.timeWindow.end)+300_000);
  const assessment=assessor({observations:window.observations,thermal:thermalTrend(window.observations,{now}),thermalMemory:window.detectorContext.thermalMemory},{now});
  return{...window,source:'VIIRS',decision:assessment.decision??'NO_OBSERVATION',reason:assessment.conclusion??'No retained VIIRS signal.',predictedPositive:Boolean(assessment.qualifiesAsFireCandidate),score:assessment.score,flags:assessment.flags??[],policyVersion:assessment.policyVersion,thresholdVersion:assessment.thresholdVersion,maxFrpMw:assessment.maxFrpMw??null,durationHours:assessment.durationHours??null,sourceQuality:{observationCount:window.observations.length,temporalMemory:window.detectorContext.thermalMemory}};
}
const compact=(metrics)=>Object.fromEntries(['cases','positiveCases','negativeCases','truePositives','falsePositives','trueNegatives','falseNegatives','precision','recall','specificity','falsePositiveRate','f1','balancedAccuracy','matthewsCorrelationCoefficient','abstentions','abstentionRate','confidenceIntervals'].map((key)=>[key,metrics[key]]));
const corpus=JSON.parse(await readFile(corpusPath,'utf8')),lock=JSON.parse(await readFile(lockPath,'utf8')),development=JSON.parse(await readFile(developmentPath,'utf8'));
if(lock.corpusDatasetHash!==corpus.datasetHash||development.corpusDatasetHash!==corpus.datasetHash)throw new Error('v3_confirmatory_corpus_lock_mismatch');
if(development.confirmatoryOutcomeAccessed!==false||development.goNoGoBeforeConfirmatory?.pass!==true)throw new Error('v3_confirmatory_preopen_gate_not_satisfied');
if(lock.candidate.policyVersion!==THERMAL_CANDIDATE_V3_CANDIDATE_VERSION||lock.candidate.thresholdVersion!==THERMAL_CANDIDATE_V3_CANDIDATE_THRESHOLD_VERSION)throw new Error('v3_confirmatory_policy_lock_mismatch');
const cohort=corpus.windows.filter((item)=>item.evaluationSplit==='FROZEN_CONFIRMATORY'&&item.confirmatoryCohort===true);
const v1=cohort.map((item)=>evaluate(item,assessThermalCandidate)),v2=cohort.map((item)=>evaluate(item,assessThermalCandidateV2Candidate)),v3=cohort.map((item)=>evaluate(item,assessThermalCandidateV3Candidate));
const v1Metrics=thermalDetectionMetrics(v1),v2Metrics=thermalDetectionMetrics(v2),v3Metrics=thermalDetectionMetrics(v3),errors=thermalDetectionErrors(v3);
const promotionRule=lock.promotionRule,promotionPass=v3Metrics.specificity>=.75&&v3Metrics.falsePositiveRate<=.25&&v3Metrics.balancedAccuracy>=.8&&v3Metrics.matthewsCorrelationCoefficient>=.6&&v3Metrics.recall>=.95;
const taxonomy=(kind)=>Object.fromEntries([...new Set(errors.filter((item)=>item.failure===kind).map((item)=>item.failureClass))].sort().map((name)=>[name,errors.filter((item)=>item.failure===kind&&item.failureClass===name).length]));
const benchmark={schema:'vigia.detector-v3-frozen-confirmatory.v1',generatedAt:new Date().toISOString(),repositoryCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),corpusDatasetHash:corpus.datasetHash,developmentEvidenceHash:development.evidenceHash,policyLock:{...lock,confirmatoryOpenedAt:new Date().toISOString(),confirmatoryOutcomeInspectionState:'OPENED_ONCE_AFTER_SUBJECT_EXCLUSIVE_CORPUS_POLICY_AND_DEVELOPMENT_LOCK'},cohort:{selection:corpus.selectionPolicy.confirmatoryCohort,inventory:corpus.inventory.frozenBalancedCohort,negativeSubjectCount:new Set(cohort.filter((item)=>item.referenceLabel==='NON_WILDFIRE_NEGATIVE').map((item)=>item.splitAssignmentUnit)).size,subjectOverlapAcrossSplits:false},v1:compact(v1Metrics),v2:compact(v2Metrics),v3:{...compact(v3Metrics),policyVersion:THERMAL_CANDIDATE_V3_CANDIDATE_VERSION,thresholdVersion:THERMAL_CANDIDATE_V3_CANDIDATE_THRESHOLD_VERSION,promotionDecision:promotionPass?'PROMOTE_TO_LIVE_ENGINEERING_POLICY':'DO_NOT_PROMOTE',promotionRule},falsePositiveTaxonomy:taxonomy('FALSE_POSITIVE'),falseNegativeTaxonomy:taxonomy('FALSE_NEGATIVE'),errorExplorer:errors,limitations:corpus.limitations};
benchmark.evidenceHash=`sha256:${sha(JSON.stringify(benchmark))}`;
await writeFile(outputPath,`${JSON.stringify(benchmark)}\n`);
console.log(JSON.stringify({outputPath,evidenceHash:benchmark.evidenceHash,cohort:benchmark.cohort,v1:benchmark.v1,v2:benchmark.v2,v3:benchmark.v3,falsePositiveTaxonomy:benchmark.falsePositiveTaxonomy,falseNegativeTaxonomy:benchmark.falseNegativeTaxonomy},null,2));
