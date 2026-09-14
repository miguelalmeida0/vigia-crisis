import { EventEmitter } from 'node:events';
import test from 'node:test';
import assert from 'node:assert/strict';

import { PostgresIntelligenceRepository } from '../src/modules/intelligence/postgres-intelligence-repository.mjs';
import {
  beginCapacityTransaction,
  capacityTransactionFailure,
  commitCapacityTransaction,
  releaseCapacityTransaction
} from '../src/modules/storage/postgres-capacity-counter.mjs';
import { isPostgresAvailabilityError } from '../src/modules/storage/dependency-error.mjs';

const readySchema={snapshot_table:'intelligence_snapshot',decision_table:'operator_intelligence_decision',capacity_table:'vigia_capacity_counter',generation_table:'vigia_intelligence_input_generation',mutation_table:'vigia_intelligence_input_mutation',sequence_ready:true,decision_generation_ready:true,mutation_owner_ready:true,mutation_expiry_ready:true};

class CheckedOutClient extends EventEmitter{
  constructor(){super();this.queries=[];this.releasedWith=null;}
  async query(sql){this.queries.push(sql);return{rows:[],rowCount:0};}
  release(error){this.releasedWith=error??undefined;}
}

test('capacity transactions retain a bounded idle timeout above request and statement limits',async()=>{
  const client=new CheckedOutClient();
  await beginCapacityTransaction(client);
  await commitCapacityTransaction(client);
  releaseCapacityTransaction(client);
  assert.deepEqual(client.queries,['BEGIN',"SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='8s'; SET LOCAL idle_in_transaction_session_timeout='30s'",'COMMIT']);
  assert.equal(client.releasedWith,undefined);
});

test('a checked-out 25P03 cannot be swallowed or returned to the pool',async()=>{
  const client=new CheckedOutClient(),fatal=Object.assign(new Error('terminating connection due to idle-in-transaction timeout'),{code:'25P03'});
  await beginCapacityTransaction(client);
  client.emit('error',fatal);
  await assert.rejects(()=>commitCapacityTransaction(client),(error)=>error===fatal);
  assert.equal(capacityTransactionFailure(client,new Error('later query failure')),fatal);
  assert.equal(isPostgresAvailabilityError(fatal),true);
  releaseCapacityTransaction(client);
  assert.equal(client.releasedWith,fatal);
  assert.deepEqual(client.queries.slice(-1),["SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='8s'; SET LOCAL idle_in_transaction_session_timeout='30s'"]);
});

test('a fatal transaction query rejection destroys the checked-out client even without an error event',async()=>{
  const client=new CheckedOutClient(),fatal=Object.assign(new Error('terminating connection due to idle-in-transaction timeout'),{code:'25P03'});
  await beginCapacityTransaction(client);
  assert.equal(capacityTransactionFailure(client,fatal),fatal);
  releaseCapacityTransaction(client);
  assert.equal(client.releasedWith,fatal);
});

test('intelligence transaction degradation preserves the fatal client cause and destroys that client',async()=>{
  const fatal=Object.assign(new Error('terminating connection due to idle-in-transaction timeout'),{code:'25P03'});
  class FatalDuringGenerationClient extends CheckedOutClient{
    async query(sql){
      this.queries.push(sql);
      if(sql.startsWith('SELECT generation,dirty,active_mutations')){
        queueMicrotask(()=>this.emit('error',fatal));
        return{rows:[{generation:7,dirty:false,active_mutations:0}],rowCount:1};
      }
      return{rows:[],rowCount:0};
    }
  }
  const client=new FatalDuringGenerationClient(),pool={on(){},connect:async()=>client,query:async(sql)=>{
    if(sql.includes('to_regclass'))return{rows:[readySchema],rowCount:1};
    throw new Error(`unexpected_direct_query:${sql}`);
  }},repository=new PostgresIntelligenceRepository({pool});
  await repository.initialize();
  await assert.rejects(()=>repository.inputGeneration('incident:1'),(error)=>error.code==='intelligence_postgis_unavailable'&&error.statusCode===503);
  assert.equal(repository.status().state,'degraded');
  assert.equal(repository.status().lastErrorCode,'25P03');
  assert.equal(client.releasedWith,fatal);
  assert.equal(client.queries.includes('COMMIT'),false);
});
