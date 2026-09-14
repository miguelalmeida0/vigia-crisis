import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { CANONICAL_OPERATOR_CONSOLE, CANONICAL_OPERATOR_RUNTIME_FILES, LEGACY_NONCANONICAL_WEB, QUARANTINED_OPERATOR_PROTOTYPE, classifyDirtyTreePath, classifyReleasePath,operatorSourceHashFromEntries } from '../../../scripts/release/build_release_manifest.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const json=async file=>JSON.parse(await readFile(path.join(root,file),'utf8'));

test('release boundary names only the repository-owned operator console',async()=>{
  const rootPackage=await json('package.json'),prototypePackage=await json('apps/mission-dark/package.json'),apiServer=await readFile(path.join(root,'apps/api/src/server.mjs'),'utf8'),releaseBuilder=await readFile(path.join(root,'scripts/release/build_release_manifest.mjs'),'utf8'),operatorBuild=await readFile(path.join(root,'apps/operator-console/scripts/build.mjs'),'utf8');
  assert.equal(CANONICAL_OPERATOR_CONSOLE,'apps/operator-console');
  assert.deepEqual(CANONICAL_OPERATOR_RUNTIME_FILES,['packages/domain/src/operator-proxy/request-auth.mjs']);
  assert.equal(QUARANTINED_OPERATOR_PROTOTYPE,'apps/mission-dark');
  assert.equal(LEGACY_NONCANONICAL_WEB,'apps/web');
  for(const name of ['operator:start','operator:stop','operator:status','operator:verify:static']){
    assert.match(rootPackage.scripts[name],/operator-console|operator_console/);
    assert.doesNotMatch(rootPackage.scripts[name],/apps\/mission-dark/);
  }
  assert.equal(rootPackage.scripts['operator:certify'],undefined);
  assert.equal(rootPackage.scripts['operator:verify'],undefined);
  assert.match(rootPackage.scripts['release:local'],/trusted_operator_certification\.sh --local/);
  for(const name of ['dev','start','build','preview','test:visual','test:sites','verify'])assert.match(prototypePackage.scripts[name],/quarantined\.mjs/);
  assert.equal(classifyReleasePath('apps/mission-dark/src/App.tsx'),'QUARANTINED PROTOTYPE / NON-RELEASE');
  assert.equal(classifyReleasePath('apps/mission-dark/package.json'),'SOURCE — release code');
  assert.equal(classifyReleasePath('apps/mission-dark/scripts/quarantined.mjs'),'SOURCE — release code');
  assert.equal(classifyReleasePath('apps/operator-console/src/app.js'),'SOURCE — release code');
  assert.equal(classifyReleasePath('apps/web/src/v2/app.js'),'QUARANTINED LEGACY / NON-RELEASE');
  assert.doesNotMatch(apiServer,/serveStatic|apps\/web/);assert.doesNotMatch(releaseBuilder,/apps\/web\/data\/release-identity\.json/);
  assert.match(operatorBuild,/CANONICAL_OPERATOR_RUNTIME_FILES/);assert.match(operatorBuild,/CANONICAL_OPERATOR_RUNTIME_FILES\.map\(\(file\)=>path\.join\(projectRoot,file\)\)/);
  assert.equal(classifyDirtyTreePath('apps/operator-console/src/app.js'),'A. application source');
  assert.equal(classifyDirtyTreePath('apps/operator-console/tests/smoke.mjs'),'B. tests');
  assert.equal(classifyDirtyTreePath('scripts/check.mjs'),'C. configuration/build/release scripts');
  assert.equal(classifyDirtyTreePath('data/reference/example.json'),'D. governed/reference data');
  assert.equal(classifyDirtyTreePath('data/validation/release/current-release-manifest.json'),'E. generated validation evidence');
  assert.equal(classifyDirtyTreePath('.artifacts/final-under7-elimination/final-scorecard.json'),'E. generated validation evidence');
  assert.equal(classifyDirtyTreePath('VIGIA_FINAL_UNDER_7_ELIMINATION_AUDIT.md'),'E. generated validation evidence');
  assert.equal(classifyDirtyTreePath('.tmp/operator-console/server.log'),'F. temp/cache/runtime junk');
  assert.equal(classifyDirtyTreePath('apps/mission-dark/node_modules/vite/index.js'),'F. temp/cache/runtime junk');
});

test('canonical Operator source identity includes every separately copied runtime helper',()=>{
  const entries=[{path:'apps/operator-console/server.mjs',mode:'0644',sha256:'sha256:console'},{path:'packages/domain/src/operator-proxy/request-auth.mjs',mode:'0644',sha256:'sha256:signer'},{path:'packages/domain/src/unrelated.mjs',mode:'0644',sha256:'sha256:unrelated'}],approved=operatorSourceHashFromEntries(entries);
  assert.notEqual(operatorSourceHashFromEntries(entries.map((item)=>item.path===CANONICAL_OPERATOR_RUNTIME_FILES[0]?{...item,sha256:'sha256:substituted'}:item)),approved);
  assert.equal(operatorSourceHashFromEntries(entries.map((item)=>item.path==='packages/domain/src/unrelated.mjs'?{...item,sha256:'sha256:changed'}:item)),approved);
});

test('canonical console has no bundled operational fixtures',async()=>{
  const realDataContract=await readFile(path.join(root,'apps/operator-console/tests/realdata-contract.mjs'),'utf8');
  const app=await readFile(path.join(root,'apps/operator-console/src/app.js'),'utf8');
  assert.match(realDataContract,/zero bundled operational-image substitutes/i);
  assert.doesNotMatch(app,/goldenOverviewFixture|Serra da Estrela|fixture incident/i);
});
