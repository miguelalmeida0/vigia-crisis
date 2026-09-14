import test from 'node:test';
import assert from 'node:assert/strict';
import { computeFindingAttentionPriority } from '../src/prevention-priority.mjs';

test('finding attention priority is explicit, deterministic and never a probability', () => {
  const finding={affectedAreaHa:2.5,corridorLengthM:480,nearestStructureM:24,structuresWithinPolicyRadius:4,roadCrossings:null,criticalAssetProximityM:null,firstObservableInterval:{end:'2026-08-10T00:00:00Z'},sourceQuality:{validPixelFraction:.94,currentCloudCover:2,comparisonCloudCover:8}};
  const result=computeFindingAttentionPriority(finding,{now:new Date('2026-08-12T00:00:00Z')});
  assert.equal(result.scoreKind,'ATTENTION_PRIORITY_NOT_PROBABILITY');
  assert.ok(result.score>=0&&result.score<=100);
  assert.deepEqual(result.unmeasured,['roadCrossings','criticalAssetProximity']);
  assert.equal(result.measuredWeight,.82);
});

test('missing factors stay visible and are excluded from the weighted mean', () => {
  const result=computeFindingAttentionPriority({}, {now:new Date('2026-08-12T00:00:00Z')});
  assert.equal(result.score,0);
  assert.equal(result.measuredWeight,0);
  assert.equal(result.unmeasured.length,8);
});
