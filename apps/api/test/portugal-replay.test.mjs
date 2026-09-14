import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runPortugalReplay } from '../../../scripts/lib/portugal-replay.mjs';

const fixture=JSON.parse(await readFile(new URL('./fixtures/replay/portugal-software-replay.json',import.meta.url),'utf8'));

test('Portugal replay preserves identity across a late physical observation and refuses validation claims',async()=>{
  const result=await runPortugalReplay(fixture);
  assert.equal(result.softwareReplay.passed,true);
  assert.equal(result.softwareReplay.lateArrivalCount,1);
  assert.equal(result.softwareReplay.eventCount,1);
  assert.equal(result.softwareReplay.persistedDerivedStates,1);
  assert.equal(result.softwareReplay.geometry.allRejectPerimeterAuthority,true);
  assert.equal(result.timeline[0].events[0].id,result.timeline.at(-1).events[0].id);
  assert.equal(result.timeline.at(-1).events[0].fusionState,'physical_evidence');
  assert.equal(result.timeline.at(-1).events[0].evidenceStrength,'two_dependency_groups');
  assert.equal(result.timeline.at(-1).events[0].independentFamilies,2);
  assert.equal(result.validation.state,'UNMEASURED');
  assert.equal(result.validation.metrics,null);
});

test('externally labelled classification requires attributable label authority',async()=>{
  const invalid=structuredClone(fixture);invalid.metadata.evidenceClass='externally_labelled';
  await assert.rejects(()=>runPortugalReplay(invalid),/external_label_authority_required/);
});
