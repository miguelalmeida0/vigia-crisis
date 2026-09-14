import { EventEmitter } from 'node:events';
import test from 'node:test';
import assert from 'node:assert/strict';

import { guardPostgresClient,guardPostgresPool,postgresClientFailure,releasePostgresClient } from '../src/modules/storage/postgres-client-guard.mjs';
import { PostgresAlertStore } from '../src/modules/alerts/postgres-alert-store.mjs';

class FakeClient extends EventEmitter {
  constructor(){super();this.releasedWith=null;}
  async query(){return{rows:[],rowCount:0};}
  release(error){this.releasedWith=error??undefined;}
}

test('pool acquire installs one permanent checked-out client error listener',()=>{
  const pool=new EventEmitter(),client=new FakeClient(),observed=[];
  guardPostgresPool(pool,(error)=>observed.push(error));
  pool.emit('connect',client);pool.emit('acquire',client);
  assert.equal(client.listenerCount('error'),1);
  const fatal=Object.assign(new Error('terminating connection due to idle-in-transaction timeout'),{code:'25P03'});
  assert.doesNotThrow(()=>client.emit('error',fatal));
  assert.equal(observed.length,1);assert.equal(postgresClientFailure(client),fatal);
  releasePostgresClient(client);assert.equal(client.releasedWith,fatal);
});

test('transaction-level guard destroys a failed checked-out client without a pool event',()=>{
  const client=new FakeClient(),fatal=Object.assign(new Error('connection terminated unexpectedly'),{code:'ECONNRESET'});
  guardPostgresClient(client);client.emit('error',fatal);
  assert.equal(postgresClientFailure(client,new Error('later query failure')),fatal);
  releasePostgresClient(client);assert.equal(client.releasedWith,fatal);
});

test('checked-out 25P03 degrades operations instead of becoming an unhandled process error',()=>{
  const pool=new EventEmitter();pool.end=async()=>{};
  const store=new PostgresAlertStore({pool,clock:()=>new Date('2026-09-05T22:16:26.762Z')});store.ready=true;
  const client=new FakeClient();pool.emit('acquire',client);
  const fatal=Object.assign(new Error('terminating connection due to idle-in-transaction timeout'),{code:'25P03'});
  assert.doesNotThrow(()=>client.emit('error',fatal));
  assert.equal(store.status().state,'degraded');assert.equal(store.status().lastErrorCode,'25P03');
});
