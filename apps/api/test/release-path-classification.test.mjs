import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyReleasePath } from '../../../scripts/release/build_release_manifest.mjs';

test('release hashing excludes local container runtime state',()=>{
  assert.equal(classifyReleasePath('.c/lima/default/diffdisk'),'RUNTIME CACHE');
  assert.equal(classifyReleasePath('.forge-colima/default/colima.yaml'),'RUNTIME CACHE');
  assert.equal(classifyReleasePath('.forge-colima/_lima/_networks/user-v2/leases.json'),'RUNTIME CACHE');
  assert.equal(classifyReleasePath('.forge-tmp/colima.yaml'),'RUNTIME CACHE');
});

test('release hashing still includes actual source and tests',()=>{
  assert.equal(classifyReleasePath('scripts/release/local_release.mjs'),'SOURCE — release code');
  assert.equal(classifyReleasePath('apps/api/test/release-listener-ownership.test.mjs'),'TEST');
  assert.equal(classifyReleasePath('.env.example'),'SOURCE — release code');
  assert.equal(classifyReleasePath('.env.local'),'SECRET / MUST NEVER COMMIT');
  assert.equal(classifyReleasePath('.artifacts/final-under7-elimination/certification.json'),'GOVERNED EVIDENCE');
  assert.equal(classifyReleasePath('VIGIA_FINAL_UNDER_7_ELIMINATION_AUDIT.md'),'GOVERNED EVIDENCE');
});
