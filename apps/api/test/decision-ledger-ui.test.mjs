import test from 'node:test';
import assert from 'node:assert/strict';
import { autonomousEvidenceClosure, coverageIntelligence, incidentDecisionLedger } from '../../web/src/v2/views/decision-ledger.js';

test('Incident Decision Ledger keeps physical, report, chronology and policy truth together',()=>{
  const event={id:'PT-LEDGER-1',label:'Two-family candidate',firstSeenAt:'2026-08-08T10:00:00Z',lastSeenAt:'2026-08-12T12:00:00Z',evidenceState:'satellite-only',observations:[{type:'thermal',at:'2026-08-09T10:00:00Z'}],leadTime:{firstThermalAt:'2026-08-08T10:00:00Z'},physicalState:{freshness:'delayed',lastAt:'2026-08-12T12:00:00Z'},reportState:{sourceActivity:'no_report'},physicalSourceProfile:{families:['viirs','sentinel3_slstr'],observationCount:19},candidateAssessment:{policyVersion:'thermal-policy-v4',decisionReason:'Two independent physical families retained.'},behaviorState:'unknown'};
  const html=incidentDecisionLedger({incidentOperations:null},event);
  assert.match(html,/INCIDENT DECISION LEDGER/);assert.match(html,/RETAIN AS HISTORICAL PHYSICAL CANDIDATE/);assert.match(html,/No public report/);
  assert.match(html,/VIIRS \+ Sentinel-3 \/ SLSTR/);assert.match(html,/thermal-policy-v4/);assert.match(html,/19 attributable observations/);assert.match(html,/8 Aug/);
});

test('Autonomous closure and coverage preserve unavailable as unavailable instead of zero',()=>{
  const event={id:'PT-LEDGER-2',actionNeed:{needsRouting:true},sensorCoverage:{viirs:{pointDetection:true},sentinel3:{pointDetection:true}},evidenceNeed:{state:'FIELD_CAPACITY_NOT_CONFIGURED',missingQuantity:'independent_confirmation'}};
  const state={operationsState:'unavailable',incidentOperationsError:'PostGIS unavailable',incidentOperations:null,bootstrap:{sources:{firms:{state:'current'},sentinel3Pixels:{state:'stale'}},operations:{systemActionability:{systemCompleted:4,evidenceProducing:2,unknownsClosed:0}}},live:{sources:{firms:{state:'current'},sentinel3Pixels:{state:'stale'}}}};
  const closure=autonomousEvidenceClosure(state,event),coverage=coverageIntelligence(state,event);
  assert.match(closure,/PERSISTENCE DEGRADED/);assert.match(closure,/FIELD CAPACITY NOT CONFIGURED/);assert.match(closure,/SYSTEM COMPLETED <b>4<\/b>/);
  assert.match(coverage,/VIIRS/);assert.match(coverage,/CURRENT/);assert.match(coverage,/SENTINEL-3 \/ SLSTR/);assert.match(coverage,/DELAYED/);
  assert.match(coverage,/NEXT GOVERNED WINDOW<\/span><strong>UNAVAILABLE/);assert.match(coverage,/MONITORED CONTEXT<\/span><strong>UNAVAILABLE/);assert.match(coverage,/No zero-asset claim inferred/);
});
