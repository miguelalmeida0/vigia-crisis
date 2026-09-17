import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { maintenanceOptions } from '../../scripts/release/quarantine-situation-jobs.mjs';
const env={VIGIA_DEMO_CONFIRM:'SYNTHETIC_DEMO_ONLY',VIGIA_DATABASE_URL:'postgresql://user:test@demo.example/vigia_demo'};
const args=['--expected-host=demo.example','--incident=PT-2026-5440CF7B01'];
test('maintenance defaults to metadata-only dry run scoped to explicit incidents',()=>{
  const result=maintenanceOptions(args,env); assert.equal(result.apply,false); assert.deepEqual(result.incidents,['PT-2026-5440CF7B01']);
});
test('maintenance refuses unconfirmed writes, wrong hosts, missing scopes and production markers',()=>{
  for(const parameters of [args.concat('--apply'),args.filter(a=>!a.startsWith('--incident=')),['--expected-host=wrong.example','--incident=x']]) assert.throws(()=>maintenanceOptions(parameters,env));
  assert.throws(()=>maintenanceOptions(args,{...env,VIGIA_DEMO_CONFIRM:''}));
  assert.throws(()=>maintenanceOptions(['--expected-host=vigia-live.example','--incident=x'],{...env,VIGIA_DATABASE_URL:'postgresql://user:test@vigia-live.example/db'}),/production_database_forbidden/);
});
test('maintenance apply requires both explicit flags',()=>{
  assert.equal(maintenanceOptions([...args,'--apply','--confirm=QUARANTINE_SYNTHETIC_JOBS'],env).apply,true);
});
test('container bootstrap refuses missing confirmation before running any database command',()=>{
  const result=spawnSync('bash',['infra/demo/local-postgis-start.sh'],{encoding:'utf8',cwd:new URL('../..',import.meta.url),env:{PATH:process.env.PATH}});
  assert.equal(result.status,64); assert.match(result.stderr,/confirmation/);
});
test('container bootstrap rejects external database credentials before initialization',()=>{
  const result=spawnSync('bash',['infra/demo/local-postgis-start.sh'],{encoding:'utf8',cwd:new URL('../..',import.meta.url),env:{PATH:process.env.PATH,VIGIA_DEMO_CONFIRM:'SYNTHETIC_DEMO_ONLY',VIGIA_DEMO_DATABASE_MODE:'ephemeral_local_postgis',VIGIA_DATABASE_URL:'postgresql://do-not-contact.invalid/db'}});
  assert.equal(result.status,64); assert.match(result.stderr,/Refusing external/);
});

import { demoPublicScheme } from '../demo/public-origin.mjs';
test('public origin remains HTTPS; HTTP requires explicit isolated loopback', () => {
 assert.equal(demoPublicScheme({VIGIA_OPERATOR_PUBLIC_AUTHORITY:'demo.onrender.com'}),'https');
 const local={VIGIA_OPERATOR_PUBLIC_SCHEME:'http',VIGIA_OPERATOR_PUBLIC_AUTHORITY:'127.0.0.1:10000',VIGIA_DEMO_CONFIRM:'SYNTHETIC_DEMO_ONLY',VIGIA_DEMO_DATABASE_MODE:'ephemeral_local_postgis'};
 assert.equal(demoPublicScheme(local),'http');
 for(const change of [{VIGIA_OPERATOR_PUBLIC_AUTHORITY:'demo.onrender.com'},{VIGIA_DEMO_CONFIRM:''},{VIGIA_DEMO_DATABASE_MODE:''},{VIGIA_OPERATOR_PUBLIC_AUTHORITY:'localhost.attacker.invalid'},{VIGIA_OPERATOR_PUBLIC_SCHEME:'ftp'}]) assert.throws(()=>demoPublicScheme({...local,...change}));
});

test('release blueprint is Docker-based, Neon-independent and manual-deploy only', () => {
  const blueprint=readFileSync(new URL('../../render.demo.yaml',import.meta.url),'utf8');
  assert.match(blueprint,/runtime:\s*docker/);
  assert.match(blueprint,/plan:\s*0\.5c-512mb/);
  assert.match(blueprint,/repo:\s*https:\/\/github\.com\/miguelalmeida0\/vigia-crisis\.git/);
  assert.match(blueprint,/branch:\s*fix\/vigia-release-readiness-2026-09-17/);
  assert.match(blueprint,/dockerfilePath:\s*\.\/infra\/Dockerfile\.demo/);
  assert.match(blueprint,/autoDeployTrigger:\s*off/);
  assert.match(blueprint,/VIGIA_DEMO_DATABASE_MODE[\s\S]*ephemeral_local_postgis/);
  assert.doesNotMatch(blueprint,/VIGIA_DATABASE_URL/);
  assert.doesNotMatch(blueprint,/vigia-crisis-os-claude/);
});
