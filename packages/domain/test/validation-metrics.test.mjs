import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateValidationPolicy, validateFireCore } from '../src/validation-metrics.mjs';

test('validation metrics expose detection quality and event identity failure modes without inventing thresholds',()=>{
  const rows=[
    {truth:{fire:true,eventId:'A',hazard:true},prediction:{fireCandidate:true,eventId:'P1',hazardCandidate:true},firstPhysicalAt:'2026-08-09T12:00:00Z',firstReportAt:'2026-08-09T12:20:00Z'},
    {truth:{fire:true,eventId:'A',hazard:false},prediction:{fireCandidate:true,eventId:'P2',hazardCandidate:false}},
    {truth:{fire:false,eventId:null,hazard:true},prediction:{fireCandidate:true,eventId:'P3',hazardCandidate:false,abstained:true}}
  ];
  const metrics=validateFireCore(rows); assert.equal(metrics.physicalDetection.precision,0.6667); assert.equal(metrics.eventIdentity.fragmentedTruthEvents,1); assert.equal(metrics.abstention.count,1); assert.equal(metrics.leadTime.medianMinutes,20);
  const evaluated=evaluateValidationPolicy(metrics,{id:'pilot',rules:[{metric:'physicalDetection.recall',min:.9},{metric:'eventIdentity.falseMergeRate',max:.1}]}); assert.equal(evaluated.pass,true);
});
