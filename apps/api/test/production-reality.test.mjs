import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { loadConfig } from '../src/config/env.mjs';
import { EventObservationRepository } from '../src/modules/events/event-observation-repository.mjs';
import { OperatorStateRepository } from '../src/modules/interventions/operator-state-repository.mjs';
import { productionRealityGate } from '../../../scripts/production_reality_gate.mjs';

const at='2026-08-09T12:00:00Z',now=()=>new Date(at);
const observation={id:'physical:test',type:'thermal',at,receivedAt:at,coordinate:[-8.1,40.1],source:'TEST source',sourceFamily:'test',independenceGroup:'test',provenance:{synthetic:true,universe:'test'}};

test('production config rejects the legacy fixture universe switch',()=>{
  assert.throws(()=>loadConfig({VIGIA_FIXTURES:'1'}),(error)=>error?.name==='ProductionIntegrityViolation'&&error?.code==='production_integrity_violation');
  assert.throws(()=>loadConfig({VIGIA_UNIVERSE:'test'}),(error)=>error?.name==='ProductionIntegrityViolation');
  const config=loadConfig({VIGIA_UNIVERSE:'production'});assert.equal(config.universe,'production');assert.equal(config.firmsPollIntervalMs,300_000);assert.equal(config.databaseUrl,'');
  assert.equal(config.cdseReplayCollection,'sentinel-3-sl-2-frp-ntc');assert.equal(config.cdseReplaySearchStart,'2024-09-17T22:10:00Z');assert.equal(config.cdseReplaySearchEnd,'2024-09-17T23:00:00Z');assert.equal(config.cdseReplayMaxProducts,2);
  assert.equal(loadConfig({VIGIA_DATABASE_URL:'postgresql://local/vigia'}).databaseUrl,'postgresql://local/vigia');
  assert.equal(loadConfig({VIGIA_FIRMS_POLL_INTERVAL_MS:'1000'}).firmsPollIntervalMs,60_000);
  for(const [name,value] of [['VIGIA_HIGHRES_STAC_URL','http://127.0.0.1/stac'],['VIGIA_MTG_FRP_JSON_URL','https://provider.example:444/frp'],['VIGIA_SENTINEL3_FRP_JSON_URL','https://user:secret@provider.example/frp']])assert.throws(()=>loadConfig({[name]:value}),(error)=>error?.name==='ProductionIntegrityViolation'&&/provider_endpoint/.test(error.message));
  assert.throws(()=>loadConfig({VIGIA_RUNTIME_PROFILE:'remote_shadow',VIGIA_LOCAL_SECRETS_DISABLED:'1'}),(error)=>error?.name==='ProductionIntegrityViolation'&&/remote_shadow_release_identity_required/.test(error.message));
  const remote=loadConfig({VIGIA_RUNTIME_PROFILE:'remote_shadow',VIGIA_RELEASE_ID:'release-asserted',VIGIA_CODE_STATE_HASH:`sha256:${'c'.repeat(64)}`,VIGIA_OPERATIONAL_DATA_HASH:`sha256:${'a'.repeat(64)}`,VIGIA_APPROVED_RELEASE_STATEMENT_SHA256:`sha256:${'b'.repeat(64)}`,VIGIA_OPERATOR_PROXY_KEY:'k'.repeat(32),VIGIA_LOCAL_SECRETS_DISABLED:'1'});assert.equal(remote.releaseId,'release-asserted');assert.equal(remote.releaseIdAssertion,'release-asserted');
  const replay=loadConfig({VIGIA_SENTINEL3_REPLAY_START:'2024-09-18T00:00:00Z',VIGIA_SENTINEL3_REPLAY_END:'2024-09-18T01:00:00Z',VIGIA_SENTINEL3_REPLAY_MAX_PRODUCTS:'1'});assert.equal(replay.cdseReplaySearchStart,'2024-09-18T00:00:00Z');assert.equal(replay.cdseReplaySearchEnd,'2024-09-18T01:00:00Z');assert.equal(replay.cdseReplayMaxProducts,1);
});

test('private local secrets load without overriding explicit environment credentials',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'vigia-private-secrets-')),file=path.join(directory,'secrets.env');
  try{
    await writeFile(file,"NASA_FIRMS_MAP_KEY='private-firms'\nVIGIA_CDSE_USERNAME=private-user\nVIGIA_CDSE_PASSWORD=private-pass\nVIGIA_EARTHDATA_TOKEN=private-earthdata\nIGNORED_SECRET=never\n",{mode:0o600});
    const loaded=loadConfig({VIGIA_SECRETS_FILE:file,VIGIA_CDSE_USERNAME:'explicit-user'});
    assert.equal(loaded.firmsMapKey,'private-firms');assert.equal(loaded.cdseUsername,'explicit-user');assert.equal(loaded.cdsePassword,'private-pass');assert.equal(loaded.earthdataToken,'private-earthdata');
    assert.deepEqual(loaded.localSecretState,{state:'loaded_private_file',fields:['NASA_FIRMS_MAP_KEY','VIGIA_CDSE_PASSWORD','VIGIA_CDSE_USERNAME','VIGIA_EARTHDATA_TOKEN']});
    await chmod(file,0o644);const rejected=loadConfig({VIGIA_SECRETS_FILE:file});assert.equal(rejected.firmsMapKey,'');assert.equal(rejected.localSecretState.state,'rejected_insecure_permissions_or_owner');
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('production observation persistence fails closed on synthetic provenance',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'vigia-production-integrity-'));
  try{
    const production=new EventObservationRepository({filePath:path.join(directory,'production.json'),universe:'production'});
    await assert.rejects(()=>production.merge([observation],now()),(error)=>error?.name==='ProductionIntegrityViolation');
    assert.equal(production.productionIntegrityStatus().syntheticObservations,0);
    const replay=new EventObservationRepository({filePath:path.join(directory,'replay.json'),universe:'replay'});
    await assert.rejects(()=>replay.merge([observation],now()),(error)=>error?.name==='ProductionIntegrityViolation'&&error?.evidence?.universe==='replay');
    const testRepository=new EventObservationRepository({filePath:path.join(directory,'test.json'),universe:'test'});
    await testRepository.merge([observation],now());
    assert.equal(testRepository.productionIntegrityStatus().syntheticObservations,1);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('production state starts without demo identities or seeded operations',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'vigia-production-state-'));
  try{
    const repository=new OperatorStateRepository({filePath:path.join(directory,'state.json'),clock:now});await repository.initialize();
    const state=repository.snapshot();
    assert.deepEqual(state.actors,[]);assert.deepEqual(state.evidenceRequests,[]);assert.deepEqual(state.hazards,[]);assert.deepEqual(state.audit,[]);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('machine reality gate proves the production import and static-asset boundary',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'vigia-machine-reality-'));
  try{
    const result=await productionRealityGate({VIGIA_STATE_FILE:path.join(directory,'state.json')});
    assert.equal(result.pass,true);
    assert.equal(result.checks.find((item)=>item.id==='fixture_provider_imports').value,0);
    assert.equal(result.checks.find((item)=>item.id==='served_synthetic_assets').value,0);
  }finally{await rm(directory,{recursive:true,force:true});}
});
