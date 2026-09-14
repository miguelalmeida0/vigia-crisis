import assert from 'node:assert/strict';
import test from 'node:test';
import { assertReleaseIdentity,bindReleaseIdentity,releaseIdentityOf } from '../../../scripts/release/runtime_identity_binding.mjs';

const identity={releaseId:'release-a',codeStateHash:`sha256:${'a'.repeat(64)}`,operationalDataHash:`sha256:${'b'.repeat(64)}`,releaseStatementHash:`sha256:${'c'.repeat(64)}`};

test('certification output is bound to the complete four-field runtime identity',()=>{
  const artifact=bindReleaseIdentity({schemaVersion:'test',releaseId:'stale'},identity);
  assert.deepEqual(releaseIdentityOf(artifact),identity);
  assert.deepEqual(assertReleaseIdentity(artifact,identity),identity);
});

test('every identity field independently fails stale certification admission',()=>{
  for(const key of Object.keys(identity)){
    const stale={...identity,[key]:`${identity[key]}-stale`};
    assert.throws(()=>assertReleaseIdentity(stale,identity,'artifact'),new RegExp(`artifact_mismatch:${key}`));
  }
});

