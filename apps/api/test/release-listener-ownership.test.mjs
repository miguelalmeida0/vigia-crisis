import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalListenerDecision,releaseControlSocketPath,releaseFieldNodeId,resolveReleasePorts } from '../../../scripts/release/listener_ownership.mjs';

const root='/workspace/vigia',manifest={releaseId:'release-current',codeStateHash:'sha256:current',contracts:{apiContractVersion:'v10',fieldNodeContractVersion:'field-v5'}};
const identity={releaseId:manifest.releaseId,codeStateHash:manifest.codeStateHash,contracts:manifest.contracts};
const central={port:4177,pids:[101],processes:[{pid:101,cwd:root}],identity};
const field={port:4188,pids:[102],processes:[{pid:102,cwd:root}],identity};

test('even matching listeners are restarted because public identity cannot prove launch provenance',()=>{
  assert.deepEqual(canonicalListenerDecision({root,manifest,central,field}),{action:'RESTART',reason:'listener_reuse_disabled_without_authenticated_launch_provenance'});
});

test('free canonical ports start a new release',()=>{
  assert.deepEqual(canonicalListenerDecision({root,manifest,central:{port:4177,pids:[],processes:[]},field:{port:4188,pids:[],processes:[]}}),{action:'START',reason:'ports_free'});
});

test('partial and identity-mismatched listener pairs are restarted rather than reused',()=>{
  assert.equal(canonicalListenerDecision({root,manifest,central,field:{port:4188,pids:[],processes:[]}}).action,'RESTART');
  const stale={...field,identity:{...identity,codeStateHash:'sha256:stale'}};
  const decision=canonicalListenerDecision({root,manifest,central,field:stale});
  assert.equal(decision.action,'RESTART');assert.deepEqual(decision.failures,['fieldNode:code_state_hash_mismatch']);
});

test('a foreign listener fails closed and is never replaced',()=>{
  const foreign={...central,processes:[{pid:101,cwd:'/other/project'}]};
  assert.throws(()=>canonicalListenerDecision({root,manifest,central:foreign,field}),/refusing_to_replace_non_project_process/);
});

test('ephemeral release FieldNodes cannot reuse a durable origin sequence namespace',()=>{
  const first=releaseFieldNodeId('release-current','run-1'),second=releaseFieldNodeId('release-current','run-2');
  assert.notEqual(first,second);assert.equal(first,'field-node:release:release-current:run-1');
  assert.throws(()=>releaseFieldNodeId('release-current',''),/identity_components_required/);
});

test('release endpoint overrides are explicit, bounded and collision-safe',()=>{
  assert.deepEqual(resolveReleasePorts({}),{central:4177,fieldNode:4188});
  assert.deepEqual(resolveReleasePorts({VIGIA_RELEASE_API_PORT:'4277',VIGIA_RELEASE_FIELD_PORT:'4288'}),{central:4277,fieldNode:4288});
  assert.throws(()=>resolveReleasePorts({VIGIA_RELEASE_API_PORT:'80'}),/invalid_release_port/);
  assert.throws(()=>resolveReleasePorts({VIGIA_RELEASE_API_PORT:'4277',VIGIA_RELEASE_FIELD_PORT:'4277'}),/release_ports_must_be_distinct/);
});

test('release control socket path stays within the macOS sockaddr_un budget',()=>{
  const socketPath=releaseControlSocketPath('/Users/malmeida/Documents/Development/vigia/.tmp/release','66964');
  assert.equal(Buffer.byteLength(socketPath)<=103,true);assert.match(socketPath,/\/fn-66964\.sock$/);
  assert.throws(()=>releaseControlSocketPath(`/tmp/${'x'.repeat(100)}`,'1'),/path_too_long/);
});
