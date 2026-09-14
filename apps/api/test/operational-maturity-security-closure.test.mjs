import assert from 'node:assert/strict';
import { mkdir,mkdtemp,rm,writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { PostgresReleaseDeploymentIdentityStore } from '../src/modules/release/postgres-release-deployment-identity.mjs';
import { LivePhysicalIntelligenceService } from '../src/modules/world/live-physical-intelligence-service.mjs';
import { publicDependencyProjection } from '../src/shared/public-dependency-projection.mjs';

const projectRoot=fileURLToPath(new URL('../../..',import.meta.url));

test('deployment identity is persisted and returned only when the exact row matches',async()=>{
  const expected={releaseId:'vigia-test-release',codeStateHash:`sha256:${'a'.repeat(64)}`,operationalDataHash:`sha256:${'b'.repeat(64)}`,releaseStatementHash:`sha256:${'c'.repeat(64)}`,migrationHead:'020'},calls=[],pool={on(){},async query(sql,params){calls.push({sql,params});return{rowCount:1,rows:[{release_id:params[0],code_state_hash:params[1],operational_data_hash:params[2],release_statement_hash:params[3],migration_head:params[4],recorded_at:params[5]}]};}},store=new PostgresReleaseDeploymentIdentityStore({pool,releaseIdentity:expected,clock:()=>new Date('2026-08-24T12:00:00.000Z')});
  const status=await store.initialize();assert.equal(status.state,'ready');assert.deepEqual(status,{state:'ready',...expected,recordedAt:'2026-08-24T12:00:00.000Z'});assert.match(calls[0].sql,/ON CONFLICT\(singleton\) DO UPDATE/);assert.deepEqual(calls[0].params,[expected.releaseId,expected.codeStateHash,expected.operationalDataHash,expected.releaseStatementHash,expected.migrationHead,'2026-08-24T12:00:00.000Z']);
});

test('deployment identity remains explicitly not configured without PostGIS instead of blocking the production shell',async()=>{
  const expected={releaseId:'vigia-test-release',codeStateHash:`sha256:${'a'.repeat(64)}`,operationalDataHash:`sha256:${'b'.repeat(64)}`,releaseStatementHash:`sha256:${'c'.repeat(64)}`,migrationHead:'020'},store=new PostgresReleaseDeploymentIdentityStore({releaseIdentity:expected});assert.deepEqual(await store.initialize(),{state:'not_configured',...expected,recordedAt:null});
});

test('public physical-sensing status exposes error presence and counts without raw diagnostics',async()=>{
  const parent=path.join(projectRoot,'.tmp','test');await mkdir(parent,{recursive:true});const directory=await mkdtemp(path.join(parent,'vigia-physical-public-')),filePath=path.join(directory,'state.json'),secret='provider token at /private/secret';
  try{await writeFile(filePath,JSON.stringify({startedAt:'2026-08-24T10:00:00.000Z',lastCycle:{state:'degraded',errors:[secret,'database credentials rejected']},sources:{viirs:{state:'failed',error:secret},sentinel3:{state:'failed',error:'private endpoint'}}}));const service=new LivePhysicalIntelligenceService({filePath,clock:()=>new Date('2026-08-24T12:00:00.000Z')});await service.initialize();const status=service.publicStatus(),encoded=JSON.stringify(status);assert.equal(status.lastCycle.errorCount,2);assert.equal(Object.hasOwn(status.lastCycle,'errors'),false);assert.equal(status.sources.viirs.errorPresent,true);assert.equal(Object.hasOwn(status.sources.viirs,'error'),false);assert.doesNotMatch(encoded,/provider token|private|credentials/);}finally{await rm(directory,{recursive:true,force:true});}
});

test('public world, exposure, and live projections replace nested dependency errors with presence flags',()=>{const secret='provider token at /private/runtime.sock',projected=publicDependencyProjection({sources:{firms:{state:'unavailable',error:secret}},exposure:{liveError:secret},thermal:{providers:[{lastError:secret}],error:null}}),encoded=JSON.stringify(projected);assert.equal(projected.sources.firms.errorPresent,true);assert.equal(projected.exposure.liveErrorPresent,true);assert.equal(projected.thermal.providers[0].lastErrorPresent,true);assert.equal(projected.thermal.errorPresent,false);assert.doesNotMatch(encoded,/provider token|private|runtime\.sock/);});
