import test from 'node:test';
import assert from 'node:assert/strict';

import { projectStrategicCrisisIntelligence } from '../src/crisis-autopilot/index.mjs';

const AS_OF = '2026-09-04T12:00:00.000Z';
const source = (name, reference) => ({ name, reference });

test('strategic crisis intelligence executes bounded P1 projections without mutating truth or authority', () => {
  const projection = projectStrategicCrisisIntelligence({
    asOf: AS_OF,
    incident: {
      id: 'incident:strategic-one',
      terrainClass: 'steep-valley',
      weatherRegime: 'dry-northerly',
      thermalPattern: 'clustered',
      communityLayout: 'linear-road',
      roadAccessClass: 'single-access',
      resourceConstraintClass: 'water-limited',
      decisionPattern: 'protect-access-first',
    },
    shadowStrategies: [{
      id: 'shadow:east-stage',
      label: 'Stage east in replay',
      universe: 'REPLAY',
      assumptions: ['Archived road state remains comparable.'],
      simulation: { source: source('VIGIA replay engine', 'replay:run:east-stage') },
      simulatedAt: '2026-09-04T11:45:00Z',
      simulatedOutcome: { state: 'SIMULATED', accessDelayMinutes: 8 },
    }],
    actualOutcome: { state: 'PARTIAL', observedAt: '2026-09-04T11:50:00.000Z', accessDelayMinutes: 12, source: source('Certified outcome ledger', 'outcome:actual') },
    historicalIncidents: [{
      id: 'incident:historical-one',
      name: 'Archived valley fire',
      recordState: 'HISTORICAL_CLOSED',
      source: source('National archive', 'archive:incident:one'),
      terrainClass: 'steep-valley',
      weatherRegime: 'dry-northerly',
      roadAccessClass: 'single-access',
      actions: [{ summary: 'Protected the only access corridor.' }],
      outcomes: [{ state: 'SUCCESS', summary: 'Access remained open.', observedAt: '2025-08-02T16:00:00Z', source: source('Certified outcome ledger', 'outcome:one') }],
      watchConditions: [{ condition: 'Watch bridge access.' }],
    }],
    nearMisses: [{
      id: 'near-miss:replay-one',
      universe: 'CERTIFIED_REPLAY',
      recordedAt: '2026-09-04T11:55:00Z',
      source: source('Exercise after-action record', 'exercise:aar:one'),
      whatAlmostHappened: 'The only access route nearly became blocked.',
      whatPreventedEscalation: 'An alternate staging point was retained.',
      uncertaintyThatMattered: 'Bridge passability was not current.',
      actionThatMattered: 'A field verification task was completed.',
    }],
    regionalRiskContext: {
      region: 'Governed exercise region',
      roads: { state: 'WEAK_ACCESS', value: { alternateRoutes: 0 }, source: source('OSM archived context', 'osm:roads:v1'), retrievedAt: '2026-09-04T10:00:00Z', validUntil: '2026-09-05T10:00:00Z' },
      waterPoints: { state: 'INSUFFICIENT_CONTEXT', value: { mappedPoints: 1 }, source: source('OSM archived context', 'osm:water:v1'), retrievedAt: '2026-09-04T10:00:00Z', validUntil: '2026-09-05T10:00:00Z' },
      sensorBlindSpots: { state: 'BLIND_SPOT_RECORDED', value: { sourceFamilies: ['THERMAL'] }, source: source('Coverage audit', 'coverage:audit:one'), observedAt: '2026-09-04T09:00:00Z', validUntil: '2026-09-05T09:00:00Z' },
    },
    policies: [{
      reference: 'sop:protection:1',
      originalText: 'A supervisor must approve a public protection message.',
      rules: [{ approvalGate: 'SUPERVISOR_APPROVAL', authorityConstraint: 'authorize:intervention', requiredEvidence: ['ADMITTED_SCENARIO'], escalation: 'INCIDENT_COMMAND', expiry: 'END_OF_OPERATIONAL_PERIOD', safeDefault: 'DO_NOT_SEND' }],
    }],
    terminologyMappings: [{
      agency: 'Partner agency',
      originalTerm: 'occurrence',
      canonicalTerm: 'INCIDENT',
      source: source('Partner data dictionary', 'partner:dictionary:v1'),
    }],
    publicReports: [{
      id: 'public-report:one',
      type: 'BLOCKED_ROAD',
      coordinate: [-8.1, 40.2],
      observedAt: '2026-09-04T11:58:00Z',
      source: source('Public mobile submission', 'submission:one'),
    }],
  });

  assert.equal(projection.crisisShadowMode.state, 'EXERCISE_OR_REPLAY_READY');
  assert.equal(projection.crisisShadowMode.strategies[0].causalClaim, false);
  assert.equal(projection.crisisShadowMode.strategies[0].productionTruthMutation, false);
  assert.equal(projection.crisisShadowMode.strategies[0].comparison.metrics[0].difference, -4);
  assert.deepEqual(projection.globalCrisisMemory.matches[0].whySimilar.map((item) => item.dimension), ['terrain', 'weather', 'road access']);
  assert.deepEqual(projection.globalCrisisMemory.matches[0].whatWorked, ['Access remained open.']);
  assert.equal(projection.globalCrisisMemory.matches[0].outcomeSummary.certifiedOutcomeCount, 1);
  assert.equal(projection.nearMissIntelligence.items[0].productionTruth, false);
  assert.equal(projection.preventionTwin.axes.find((axis) => axis.axis === 'roads').source.reference, 'osm:roads:v1');
  assert.ok(projection.resilienceCampaigns.recommendations.length >= 3);
  assert.ok(projection.resilienceCampaigns.recommendations.every((item) => item.humanReviewRequired && !item.authorityGranted && !item.executionClaimed));
  assert.equal(projection.policyToCode.drafts[0].reviewState, 'HUMAN_REVIEW_REQUIRED');
  assert.equal(projection.policyToCode.drafts[0].gates[0].state, 'DRAFT_INACTIVE');
  assert.equal(projection.interagencySemanticTranslator.mappings[0].originalTerm, 'occurrence');
  assert.equal(projection.interagencySemanticTranslator.mappings[0].canonicalTerm, 'INCIDENT');
  assert.equal(projection.publicSafetyMesh.observations[0].createsVerifiedIncident, false);
  assert.equal(projection.publicSafetyMesh.observations[0].grantsAuthority, false);
  assert.equal(projection.publicSafetyMesh.counts.autoVerified, 0);
  assert.match(projection.projectionHash, /^strategic-crisis-intelligence:sha256:/);
});

test('sparse P1 inputs fail closed with explicit unlocks and never manufacture records', () => {
  const projection = projectStrategicCrisisIntelligence({ asOf: AS_OF, incident: { id: 'incident:sparse' } });

  assert.equal(projection.crisisShadowMode.state, 'NO_GOVERNED_INPUT');
  assert.ok(projection.crisisShadowMode.unlockCondition);
  assert.equal(projection.globalCrisisMemory.state, 'NO_GOVERNED_INPUT');
  assert.equal(projection.nearMissIntelligence.state, 'NO_RECORDS');
  assert.equal(projection.preventionTwin.state, 'NO_GOVERNED_INPUT');
  assert.equal(projection.resilienceCampaigns.recommendations.length, 0);
  assert.equal(projection.policyToCode.drafts.length, 0);
  assert.equal(projection.interagencySemanticTranslator.mappings.length, 0);
  assert.equal(projection.publicSafetyMesh.observations.length, 0);
});

test('incomplete near misses, invalid policy mappings, and public reports remain review or rejection states', () => {
  const projection = projectStrategicCrisisIntelligence({
    asOf: AS_OF,
    incident: { id: 'incident:invalid-inputs' },
    nearMisses: [{ id: 'near-miss:incomplete', whatAlmostHappened: 'A route nearly closed.' }],
    terminologyMappings: [{ originalTerm: 'activation', canonicalTerm: 'VERIFIED_CURRENT' }],
    policies: [{ reference: 'sop:empty', originalText: 'Unstructured text only.' }],
    publicReports: [{ id: 'public:bad', type: 'FIRE', coordinate: [999], observedAt: 'not-a-time' }],
  });

  assert.equal(projection.nearMissIntelligence.items[0].state, 'INCOMPLETE_RECORD');
  assert.equal(projection.interagencySemanticTranslator.mappings[0].state, 'REVIEW_REQUIRED');
  assert.equal(projection.policyToCode.state, 'NO_STRUCTURED_POLICY_INPUT');
  assert.equal(projection.publicSafetyMesh.observations[0].admissionState, 'REJECTED_INVALID_METADATA');
  assert.equal(projection.publicSafetyMesh.observations[0].createsVerifiedIncident, false);
});

test('strategic projection requires an explicit as-of clock', () => {
  assert.throws(() => projectStrategicCrisisIntelligence({ incident: { id: 'incident:no-clock' } }), /as_of_required/);
});

test('strategic systems exclude future records and require attributable comparison and prevention validity', () => {
  const projection = projectStrategicCrisisIntelligence({
    asOf: AS_OF,
    incident: { id: 'incident:as-of', terrainClass: 'ridge' },
    shadowStrategies: [{ universe: 'REPLAY', assumptions: ['Future run.'], simulatedAt: '2026-09-04T12:30:00Z', simulation: { source: source('Replay', 'future:run') }, simulatedOutcome: { state: 'SIMULATED' } }],
    actualOutcome: { state: 'SUCCESS', observedAt: '2026-09-04T12:30:00Z', source: source('Outcome ledger', 'future:outcome') },
    historicalIncidents: [{ id: 'future-history', recordState: 'HISTORICAL_CLOSED', terrainClass: 'ridge', closedAt: '2026-09-04T12:30:00Z', source: source('Archive', 'future:history') }],
    nearMisses: [{ id: 'future-near-miss', recordedAt: '2026-09-04T12:30:00Z', source: source('AAR', 'future:near-miss'), whatAlmostHappened: 'Future', whatPreventedEscalation: 'Future', uncertaintyThatMattered: 'Future', actionThatMattered: 'Future' }],
    regionalRiskContext: { region: 'Region', roads: { state: 'WEAK_ACCESS', value: {}, source: source('Road archive', 'future:roads'), observedAt: '2026-09-04T12:30:00Z', validUntil: '2026-09-05T00:00:00Z' } },
    policies: [{ reference: 'future:policy', originalText: 'A supervisor must approve.', receivedAt: '2026-09-04T12:30:00Z' }],
    terminologyMappings: [{ originalTerm: 'occurrence', canonicalTerm: 'INCIDENT', source: source('Dictionary', 'future:mapping'), receivedAt: '2026-09-04T12:30:00Z' }],
    publicReports: [{ id: 'future:report', type: 'SMOKE', coordinate: [-8, 40], observedAt: '2026-09-04T12:30:00Z', source: source('Submission', 'future:report') }],
  });
  assert.equal(projection.crisisShadowMode.strategies?.length ?? 0, 0);
  assert.equal(projection.crisisShadowMode.counts.observedOutcomeAdmitted, 0);
  assert.equal(projection.globalCrisisMemory.matches?.length ?? 0, 0);
  assert.equal(projection.nearMissIntelligence.items.length, 0);
  assert.equal(projection.nearMissIntelligence.counts.excludedFuture, 1);
  assert.equal(projection.preventionTwin.axes.find((axis) => axis.axis === 'roads').state, 'FUTURE_INPUT_EXCLUDED');
  assert.equal(projection.resilienceCampaigns.recommendations.length, 0);
  assert.equal(projection.policyToCode.counts.excludedFuture, 1);
  assert.equal(projection.interagencySemanticTranslator.counts.excludedFuture, 1);
  assert.equal(projection.publicSafetyMesh.counts.excludedFuture, 1);
});

test('near-miss production learning requires a certified attributable action-to-outcome chain', () => {
  const base = {
    universe: 'LIVE_PRODUCTION', recordedAt: '2026-09-04T11:30:00Z', source: source('After-action repository', 'aar:live:one'),
    whatAlmostHappened: 'A community access route nearly became unavailable.', whatPreventedEscalation: 'The alternate route remained available.',
    uncertaintyThatMattered: 'Primary route status changed.', actionThatMattered: 'Field verification opened the alternate route.',
  };
  const projection = projectStrategicCrisisIntelligence({ asOf: AS_OF, incident: { id: 'incident:near-miss' }, nearMisses: [
    { id: 'narrative-only', ...base },
    { id: 'certified-chain', ...base, evidenceReferences: ['observation:road-blocked'], preventionEvidenceReferences: ['observation:alternate-open'], actionReceiptId: 'receipt:field-task', outcomeId: 'outcome:alternate-open', certificationState: 'CERTIFIED' },
  ] });
  const narrative = projection.nearMissIntelligence.items.find((item) => item.nearMissId === 'narrative-only');
  const certified = projection.nearMissIntelligence.items.find((item) => item.nearMissId === 'certified-chain');
  assert.equal(narrative.productionTruth, false);
  assert.equal(narrative.evidenceState, 'NARRATIVE_REVIEW_REQUIRED');
  assert.equal(certified.productionTruth, true);
  assert.equal(certified.evidenceState, 'ATTRIBUTABLE_ACTION_OUTCOME_CHAIN');
  assert.equal(projection.nearMissIntelligence.counts.certifiedProduction, 1);
});

test('policy extraction, terminology conflict review, and public-mesh duplicate screening are substantive but fail closed', () => {
  const projection = projectStrategicCrisisIntelligence({
    asOf: AS_OF, incident: { id: 'incident:screening' },
    policies: [{ reference: 'sop:raw:one', originalText: 'The duty supervisor must approve the warning. Do not send without authority.' }],
    terminologyMappings: [
      { id: 'term:explicit', agency: 'Agency A', originalTerm: 'occurrence', canonicalTerm: 'INCIDENT', source: source('Dictionary', 'dict:a') },
      { id: 'term:candidate', agency: 'Agency B', originalTerm: 'event', source: source('Dictionary', 'dict:b') },
      { id: 'term:conflict-a', agency: 'Agency C', originalTerm: 'activation', canonicalTerm: 'ASSIGNMENT', source: source('Dictionary', 'dict:c1') },
      { id: 'term:conflict-b', agency: 'Agency C', originalTerm: 'activation', canonicalTerm: 'PROTECTION_ACTION', source: source('Dictionary', 'dict:c2') },
    ],
    publicReports: [
      { id: 'public:a', type: 'SMOKE', coordinate: [-8, 40], observedAt: '2026-09-04T11:50:00Z', note: 'Smoke near ridge', source: source('Public submission', 'submission:a') },
      { id: 'public:b', type: 'SMOKE', coordinate: [-8.0005, 40.0005], observedAt: '2026-09-04T11:55:00Z', note: 'Smoke near ridge', source: source('Public submission', 'submission:b') },
      { id: 'public:bounds', type: 'SMOKE', coordinate: [181, 91], observedAt: '2026-09-04T11:55:00Z', source: source('Public submission', 'submission:c') },
    ],
  });
  assert.equal(projection.policyToCode.drafts[0].compilationMethod, 'DETERMINISTIC_CANDIDATE_EXTRACTION');
  assert.ok(projection.policyToCode.drafts[0].gates.some((gate) => gate.approvalGate?.includes('SUPERVISOR')));
  assert.equal(projection.policyToCode.drafts[0].gates.every((gate) => !gate.validation.executable && gate.state === 'DRAFT_INACTIVE'), true);
  assert.equal(projection.interagencySemanticTranslator.mappings.find((item) => item.mappingId === 'term:explicit').state, 'MAPPING_ADMITTED');
  assert.deepEqual(projection.interagencySemanticTranslator.mappings.find((item) => item.mappingId === 'term:candidate').candidateCanonicalTerms, ['INCIDENT', 'OBSERVATION']);
  assert.equal(projection.interagencySemanticTranslator.mappings.filter((item) => item.state === 'CONFLICT_REVIEW').length, 2);
  assert.equal(projection.publicSafetyMesh.observations.find((item) => item.reportId === 'public:b').admissionState, 'DUPLICATE_REVIEW');
  assert.equal(projection.publicSafetyMesh.observations.find((item) => item.reportId === 'public:bounds').admissionState, 'REJECTED_INVALID_METADATA');
  assert.equal(projection.publicSafetyMesh.observations.every((item) => !item.createsVerifiedIncident && !item.grantsAuthority), true);
});
