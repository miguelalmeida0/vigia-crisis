import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { VIGIA_RELEASE_CONTRACT,WEB_REQUIRED_CONTRACTS,releaseCompatibility } from '../../../packages/domain/src/release-contract.mjs';
import { migrationDefinitions } from '../src/modules/storage/postgres-migration-runner.mjs';

test('migration runner, schema contract and runtime compatibility share one authoritative release contract',async()=>{
  assert.equal(migrationDefinitions().at(-1).version,VIGIA_RELEASE_CONTRACT.migrationHead);
  assert.equal(VIGIA_RELEASE_CONTRACT.databaseSchemaVersion,`vigia-postgis-${VIGIA_RELEASE_CONTRACT.migrationHead}`);
  assert.equal(WEB_REQUIRED_CONTRACTS.databaseSchemaVersion,VIGIA_RELEASE_CONTRACT.databaseSchemaVersion);
  const identity={releaseId:'release:test',codeStateHash:'sha256:test',contracts:VIGIA_RELEASE_CONTRACT};
  assert.deepEqual(releaseCompatibility({web:identity,api:identity,fieldNode:identity}),{compatible:true,failures:[]});
  const migrationSource=await readFile(new URL('../src/modules/storage/postgres-migration-runner.mjs',import.meta.url),'utf8'),manifestSource=await readFile(new URL('../../../scripts/release/build_release_manifest.mjs',import.meta.url),'utf8'),browserSource=await readFile(new URL('../../web/src/v2/release-compatibility.js',import.meta.url),'utf8');
  assert.match(migrationSource,/VIGIA_RELEASE_CONTRACT\.migrationHead/);assert.match(manifestSource,/migrationDefinitions\(\)/);assert.doesNotMatch(browserSource,/vigia-postgis-\d{3}/);
});
