import test from 'node:test';
import assert from 'node:assert/strict';
import { thermalDetectionErrors, thermalDetectionMetrics } from '../src/thermal-detection-benchmark.mjs';

test('detection metrics exclude cases without an observation opportunity',()=>{
  const base={evaluationEligibility:{eligible:true},sensorCoverage:{viirs:{observationCount:1}},timeToFirstPhysicalMinutes:4,observationToReportMinutes:10};
  const results=[{...base,caseId:'tp',referenceLabel:'FIRE_POSITIVE',predictedPositive:true,decision:'QUALIFY_FIRE_CANDIDATE'},{...base,caseId:'tn',referenceLabel:'NON_WILDFIRE_NEGATIVE',predictedPositive:false,decision:'SUPPRESS_PROVIDER_NON_WILDFIRE'},{...base,caseId:'fn',referenceLabel:'FIRE_POSITIVE',predictedPositive:false,decision:'ABSTAIN_LOW_SIGNAL'},{...base,caseId:'no-opportunity',referenceLabel:'FIRE_POSITIVE',predictedPositive:false,evaluationEligibility:{eligible:false},decision:'NO_OBSERVATION_OPPORTUNITY'}];
  const metrics=thermalDetectionMetrics(results);assert.equal(metrics.eligibleCases,3);assert.equal(metrics.truePositives,1);assert.equal(metrics.falseNegatives,1);assert.equal(metrics.trueNegatives,1);assert.equal(metrics.precision,1);assert.equal(metrics.recall,.5);assert.equal(metrics.specificity,1);assert.equal(metrics.falsePositiveRate,0);assert.equal(metrics.balancedAccuracy,.75);assert.equal(metrics.matthewsCorrelationCoefficient,.5);assert.equal(metrics.positiveCases,2);assert.equal(metrics.negativeCases,1);assert.deepEqual(thermalDetectionErrors(results).map((item)=>item.caseId),['fn']);
});

test('detection metrics expose weak negative discrimination despite positive-heavy precision',()=>{
  const eligible={evaluationEligibility:{eligible:true},areaTime:{areaKm2:100,durationDays:1}};
  const results=[...Array.from({length:121},(_,index)=>({...eligible,caseId:`tp-${index}`,referenceLabel:'FIRE_POSITIVE',predictedPositive:true,decision:'QUALIFY_FIRE_CANDIDATE'})),...Array.from({length:2},(_,index)=>({...eligible,caseId:`fn-${index}`,referenceLabel:'FIRE_POSITIVE',predictedPositive:false,decision:'ABSTAIN_LOW_SIGNAL'})),...Array.from({length:10},(_,index)=>({...eligible,caseId:`fp-${index}`,referenceLabel:'NON_WILDFIRE_NEGATIVE',predictedPositive:true,decision:'QUALIFY_FIRE_CANDIDATE'})),...Array.from({length:2},(_,index)=>({...eligible,caseId:`tn-${index}`,referenceLabel:'NON_WILDFIRE_NEGATIVE',predictedPositive:false,decision:'ABSTAIN_LOW_SIGNAL'}))];
  const metrics=thermalDetectionMetrics(results);
  assert.equal(metrics.precision,.9237);assert.equal(metrics.recall,.9837);assert.equal(metrics.specificity,.1667);assert.equal(metrics.falsePositiveRate,.8333);assert.equal(metrics.balancedAccuracy,.5752);assert.equal(metrics.matthewsCorrelationCoefficient,.2524);assert.equal(metrics.falsePositivesPerAreaTime,8.3333);assert.ok(metrics.confidenceIntervals.specificity.low<metrics.confidenceIntervals.specificity.high);
});
