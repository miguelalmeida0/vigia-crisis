import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { signFieldRequest } from '../../../packages/domain/src/fieldnet/request-auth.mjs';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const serverEntry = fileURLToPath(new URL('../src/server.mjs', import.meta.url));
const scratchRoot = path.join(root, '.tmp/test');

function request(port, authority) {
  return new Promise((resolve, reject) => {
    const call = http.get({ hostname: '127.0.0.1', port, path: '/api/fieldnet/release', headers: { host: authority } }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    call.once('error', reject);
  });
}

function signedRequest(port,authority,{method='GET',path:pathname,body=null,keyId='field-operator',key}){
  const encoded=body===null?'':JSON.stringify(body),headers={host:authority,...signFieldRequest({method,path:pathname,keyId,key,body})};if(body!==null){headers['content-type']='application/json';headers['content-length']=Buffer.byteLength(encoded);}
  return new Promise((resolve,reject)=>{const call=http.request({hostname:'127.0.0.1',port,path:pathname,method,headers},(response)=>{const chunks=[];response.on('data',(chunk)=>chunks.push(chunk));response.on('end',()=>resolve({status:response.statusCode,body:Buffer.concat(chunks).toString('utf8')}));});call.once('error',reject);call.end(encoded);});
}

function listening(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error('fieldnet_listener_timeout')), 10_000);
    const fail = (error) => { clearTimeout(timeout); reject(error); };
    child.once('error', fail);
    child.once('exit', (code) => fail(new Error(`fieldnet_exited_before_listen:${code}:${output}`)));
    child.stdout.on('data', (chunk) => {
      output += chunk;
      for (const line of output.split('\n')) {
        try {
          const event = JSON.parse(line);
          if (event.event === 'FIELDNET_LISTENING') { clearTimeout(timeout); resolve(event); return; }
        } catch {}
      }
    });
  });
}

test('remote-shadow health probe uses the same explicit FieldNet public authority', async () => {
  const compose = await readFile(path.join(root, 'infra/docker-compose.remote-shadow.yml'), 'utf8');
  assert.match(compose, /FIELDNET_PUBLIC_AUTHORITY:\s*"127\.0\.0\.1:\$\{VIGIA_FIELDNET_PORT:-4188\}"/);
  assert.match(compose, /require\('node:http'\)\.get\([^\n]+headers:\{host:process\.env\.FIELDNET_PUBLIC_AUTHORITY\}/);
  assert.doesNotMatch(compose, /fetch\('http:\/\/127\.0\.0\.1:4188\/api\/fieldnet\/release'/);
  const server = await readFile(serverEntry, 'utf8');
  assert.match(server, /expectedReleaseId:process\.env\.VIGIA_RELEASE_ID\?\?null/);
});

test('configured FieldNet public authority is accepted while any other Host remains rejected', async (t) => {
  await mkdir(scratchRoot, { recursive: true });
  const directory = await mkdtemp(path.join(scratchRoot, 'fieldnet-authority-'));
  const authority = 'fieldnet.operator.test';
  const controlKey='fieldnet-authority-control-key-32-bytes',incidentA='incident:authority-test',incidentB='incident:outside-scope';
  const child = spawn(process.execPath, [serverEntry], {
    cwd: root,
    env: {
      ...process.env,
      FIELDNET_ALLOW_SHARED_CONTROL_LISTENER: '1',
      FIELDNET_CONTROL_KEY: controlKey,
      FIELDNET_CONTROL_INCIDENT_SCOPES: incidentA,
      FIELDNET_DB_PATH: path.join(directory, 'fieldnet.sqlite'),
      FIELDNET_HOST: '127.0.0.1',
      FIELDNET_NODE_ID: 'field-node:authority-test',
      FIELDNET_PORT: '0',
      FIELDNET_PUBLIC_AUTHORITY: authority,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let childErrors='';child.stderr.on('data',(chunk)=>{childErrors+=chunk;});
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.once('exit', resolve));
    }
    await rm(directory, { recursive: true, force: true });
  });

  const ready = await listening(child);
  const accepted = await request(ready.port, authority);
  assert.equal(accepted.status, 200);
  assert.equal(JSON.parse(accepted.body).component, 'fieldnode');

  const rejected = await request(ready.port, `127.0.0.1:${ready.port}`);
  assert.equal(rejected.status, 421);
  assert.deepEqual(JSON.parse(rejected.body), { error: 'fieldnet_host_rejected' });

  const allowedRead=await signedRequest(ready.port,authority,{path:`/api/fieldnet/incidents/${encodeURIComponent(incidentA)}`,key:controlKey}).catch((error)=>{throw new Error(`allowed_read_failed:${error.message}:${childErrors}`);});
  assert.notEqual(allowedRead.status,403);
  const forbiddenRead=await signedRequest(ready.port,authority,{path:`/api/fieldnet/incidents/${encodeURIComponent(incidentB)}`,key:controlKey}).catch((error)=>{throw new Error(`forbidden_read_failed:${error.message}:${childErrors}`);});
  assert.equal(forbiddenRead.status,403);assert.equal(JSON.parse(forbiddenRead.body).error,'fieldnet_incident_scope_forbidden');
  const forbiddenWrite=await signedRequest(ready.port,authority,{method:'POST',path:'/api/fieldnet/annotations',body:{incidentId:incidentB,subjectId:incidentB,body:'must not be written'},key:controlKey}).catch((error)=>{throw new Error(`forbidden_write_failed:${error.message}:${childErrors}`);});
  assert.equal(forbiddenWrite.status,403);assert.equal(JSON.parse(forbiddenWrite.body).error,'fieldnet_incident_scope_forbidden');
});
