import assert from 'node:assert/strict';
import { mkdtemp,readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { retainPriorReleaseSnapshot } from '../../../scripts/release/build_release_manifest.mjs';

test('release manifest history retains the exact prior identity and refuses collisions',async()=>{
  const root=await mkdtemp(path.join(process.cwd(),'.tmp/release-history-test-')),releaseDirectory=path.join(root,'data/validation/release'),identity={releaseId:'vigia-intelligence-fabric-historytest',codeStateHash:`sha256:${'a'.repeat(64)}`,operationalDataHash:`sha256:${'b'.repeat(64)}`};
  const {mkdir}=await import('node:fs/promises');await mkdir(releaseDirectory,{recursive:true});
  const manifest={...identity,releaseStatementHash:`sha256:${'c'.repeat(64)}`},source={...identity,entries:[]},statement={...identity,entries:[]};
  await Promise.all([
    writeFile(path.join(releaseDirectory,'current-release-manifest.json'),`${JSON.stringify(manifest)}\n`),
    writeFile(path.join(releaseDirectory,'release-source-manifest.json'),`${JSON.stringify(source)}\n`),
    writeFile(path.join(releaseDirectory,'release-statement.json'),`${JSON.stringify(statement)}\n`)
  ]);
  const retained=await retainPriorReleaseSnapshot({repositoryRoot:root,releaseDirectory});
  assert.equal(retained.state,'RETAINED');
  const statementToken=manifest.releaseStatementHash.replace('sha256:',''),snapshot=JSON.parse(await readFile(path.join(releaseDirectory,'history',identity.releaseId,statementToken,'snapshot.json'),'utf8'));
  assert.deepEqual({releaseId:snapshot.releaseId,codeStateHash:snapshot.codeStateHash,operationalDataHash:snapshot.operationalDataHash,releaseStatementHash:snapshot.releaseStatementHash},manifest);
  assert.equal((await retainPriorReleaseSnapshot({repositoryRoot:root,releaseDirectory})).state,'ALREADY_RETAINED');
  await writeFile(path.join(releaseDirectory,'history',identity.releaseId,statementToken,'release-source-manifest.json'),'tampered\n');
  await assert.rejects(()=>retainPriorReleaseSnapshot({repositoryRoot:root,releaseDirectory}),/release_history_collision/);
});

test('release history paths are governed evidence and never code-state input',async()=>{
  const { classifyReleasePath }=await import('../../../scripts/release/build_release_manifest.mjs');
  assert.equal(classifyReleasePath('data/validation/release/history/vigia-x/statement-hash/release-source-manifest.json'),'GOVERNED EVIDENCE');
});
