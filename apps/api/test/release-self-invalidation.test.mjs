import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyDirtyTreePath,classifyReleasePath,releaseIdentityFromEntries,sameReleaseSource } from '../../../scripts/release/build_release_manifest.mjs';
import { sha256 } from '../../../scripts/release/release_statement.mjs';

const includedClassifications=new Set(['SOURCE — release code','TEST','DEPLOYMENT DATA']);
const record=(path,contents,mode='0644')=>({path,contents,mode});
const inventory=(records)=>records.map(item=>({path:item.path,mode:item.mode,sha256:sha256(item.contents),classification:classifyReleasePath(item.path)})).filter(item=>includedClassifications.has(item.classification)).sort((a,b)=>a.path.localeCompare(b.path));
const source=(records)=>{const entries=inventory(records),identity=releaseIdentityFromEntries(entries);return{...identity,entries};};
const baseRecords=Object.freeze([
  record('apps/api/src/server.mjs','export const runtime="v1";'),
  record('packages/domain/src/release-contract.mjs','export const contract="v1";'),
  record('scripts/release/local_release.mjs','export const launcher="v1";'),
  record('workers/geospatial/runtime.py','RUNTIME = "v1"'),
  record('infra/Dockerfile.api','FROM node:22'),
  record('data/reference/operational-proof/governed.json','{"terrain":"v1"}'),
  record('docs/handoffs/test-generated-report.md','release report v1'),
  record('.artifacts/operational-proof/certification.json','{"state":"PASS"}')
]);
const quartet=(releaseSource)=>({releaseId:releaseSource.releaseId,codeStateHash:releaseSource.codeStateHash,operationalDataHash:releaseSource.operationalDataHash,releaseStatementHash:sha256('stable-release-statement')});
const replace=(records,path,contents)=>records.map(item=>item.path===path?record(path,contents,item.mode):item);
const addGeneratedCertification=(records,suffix='v1')=>[
  ...records,
  record('docs/handoffs/generated-certification-report.md',`report ${suffix}`),
  record(`.artifacts/operational-proof/certification-${suffix}.json`,`{"run":"${suffix}"}`),
  record('data/validation/release/history/release/snapshot.json',`{"run":"${suffix}"}`),
  record('data/validation/release/operator-console-screenshots/command.png',`png-${suffix}`)
];

test('TEST A: modifying only a generated handoff report preserves code hash and release ID',()=>{
  const before=source(baseRecords),after=source(replace(baseRecords,'docs/handoffs/test-generated-report.md','release report v2'));
  assert.equal(classifyReleasePath('docs/handoffs/test-generated-report.md'),'GOVERNED EVIDENCE');
  assert.equal(classifyDirtyTreePath('docs/handoffs/test-generated-report.md'),'E. generated validation evidence');
  assert.equal(after.codeStateHash,before.codeStateHash);
  assert.equal(after.releaseId,before.releaseId);
  assert.deepEqual(after.entries,before.entries);
});

test('TEST B: modifying executable application source changes code hash and release ID',()=>{
  const before=source(baseRecords),after=source(replace(baseRecords,'apps/api/src/server.mjs','export const runtime="v2";'));
  assert.notEqual(after.codeStateHash,before.codeStateHash);
  assert.notEqual(after.releaseId,before.releaseId);
  assert.equal(after.operationalDataHash,before.operationalDataHash);
});

test('TEST C: generating operational-proof certification and its report preserves the exact reusable quartet',()=>{
  const frozen=source(baseRecords),after=source(addGeneratedCertification(baseRecords));
  assert.equal(sameReleaseSource(frozen,{...after,releaseId:frozen.releaseId}),true);
  assert.deepEqual(quartet(frozen),quartet({...after,releaseId:frozen.releaseId}));
});

test('TEST D: cold restart source checks reuse the exact certified quartet',()=>{
  const frozen=source(addGeneratedCertification(baseRecords)),firstColdStart=source(addGeneratedCertification(baseRecords)),secondColdStart=source(addGeneratedCertification(baseRecords));
  assert.equal(sameReleaseSource(frozen,firstColdStart),true);
  assert.equal(sameReleaseSource(frozen,secondColdStart),true);
  assert.deepEqual(quartet(firstColdStart),quartet(frozen));
  assert.deepEqual(quartet(secondColdStart),quartet(frozen));
});

test('TEST E: a second certification run without source changes reuses the exact quartet',()=>{
  const frozen=source(addGeneratedCertification(baseRecords,'v1')),secondRun=source(addGeneratedCertification(baseRecords,'v2'));
  assert.equal(sameReleaseSource(frozen,{...secondRun,releaseId:frozen.releaseId}),true);
  assert.deepEqual(quartet({...secondRun,releaseId:frozen.releaseId}),quartet(frozen));
});

test('TEST F: modifying a generated artifact leaves code and release identity unchanged',()=>{
  const before=source(baseRecords),after=source(replace(baseRecords,'.artifacts/operational-proof/certification.json','{"state":"BLOCKED_EXTERNAL"}'));
  assert.equal(after.codeStateHash,before.codeStateHash);
  assert.equal(after.operationalDataHash,before.operationalDataHash);
  assert.equal(after.releaseId,before.releaseId);
});

test('TEST G: modifying governed operational data changes operational-data hash and release identity',()=>{
  const before=source(baseRecords),after=source(replace(baseRecords,'data/reference/operational-proof/governed.json','{"terrain":"v2"}'));
  assert.equal(after.codeStateHash,before.codeStateHash);
  assert.notEqual(after.operationalDataHash,before.operationalDataHash);
  assert.notEqual(after.releaseId,before.releaseId);
});

test('adjacent generated evidence classes stay out of executable code identity',()=>{
  for(const path of ['.artifacts/final/certification.json','data/validation/release/history/release/snapshot.json','data/validation/release/operator-console-screenshots/command.png','docs/handoffs/generated-audit.md'])assert.equal(classifyReleasePath(path),'GOVERNED EVIDENCE');
  for(const path of ['apps/api/src/server.mjs','packages/domain/src/release-contract.mjs','scripts/release/local_release.mjs','workers/geospatial/runtime.py','infra/Dockerfile.api'])assert.equal(classifyReleasePath(path),'SOURCE — release code');
});
